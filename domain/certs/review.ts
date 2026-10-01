import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction, type RecordActionDeps } from "@/domain/action-log/record";
import { isCertFeatureEnabled } from "@/domain/certs/feature";
import { formatPhone, formatSubmittedAtKst, maskRrn, normalizeName, normalizePhone } from "@/domain/certs/format";
import { validateRrn } from "@/domain/certs/rrn";
import { certRrnPurgeTarget } from "@/domain/certs/prize-value";
import { getSettingValue } from "@/domain/settings/registry";
import { CERT_PRIVACY_IDLE_MINUTES } from "@/domain/settings/keys";
import { withTransaction } from "@/lib/db-transaction";
import { decrypt as defaultDecrypt, encrypt } from "@/lib/crypto";
import { getSignatureStore, type SignatureStore } from "@/lib/storage/signature-store";
import {
  findLastCorrection,
  findSubmissionForReview,
  lockSubmissionRrnForShare,
  updateSubmissionIfVersion,
  type CorrectSubmissionPatch,
} from "@/repositories/cert-review";

// 04.3-07 — I4 확인·정정(경영관리). 네 함수 모두 맨 앞에서 기능 게이트(C1)를 보고
// 꺼져 있으면 notFound, 다음으로 대표 계급을 거른다(권한표가 켜도 — CONTEXT 「전체
// 보기는 경영관리만(대표도 불가)」).

const MENU = "certs.submissions";
const VALUE_ITEM = "cert_submission.value";
const UNMASKED_ITEM = "cert.rrn_unmasked";
const ENTITY = "cert_submission";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 결정 ④ — role-ceo는 domain/permissions/roles.ts의 영구 식별자다. 04.3-10 · 11도 import한다.
export function isCertPrivacyBarredRole(viewer: Viewer): boolean {
  return viewer.roleId === "role-ceo";
}

export type CertSubmissionReviewDelivery = "onsite" | "parcel";

export type CertSubmissionReviewRow = {
  id: string;
  certNo: string;
  eventName: string;
  submittedAt: string;
  name: string;
  rrnMasked: string;
  phone: string;
  address: string | null;
  delivery: CertSubmissionReviewDelivery;
  prizeName: string;
  quantity: number;
  consentAt: string;
  signatureDataUrl: string | null;
  version: number;
};

export type CertSubmissionReviewDto = CertSubmissionReviewRow;

// 값 칸 전부가 정보 항목 cert_submission.value 하나에 걸린다 — 그 항목이 꺼지면 투영이 빈다(codex r2 C3).
export const CERT_SUBMISSION_REVIEW_DTO_SPEC: DtoSpec<CertSubmissionReviewRow, CertSubmissionReviewDto> = {
  fields: [
    { key: "id", from: "id", infoItem: VALUE_ITEM },
    { key: "certNo", from: "certNo", infoItem: VALUE_ITEM },
    { key: "eventName", from: "eventName", infoItem: VALUE_ITEM },
    { key: "submittedAt", from: "submittedAt", infoItem: VALUE_ITEM },
    { key: "name", from: "name", infoItem: VALUE_ITEM },
    { key: "rrnMasked", from: "rrnMasked", infoItem: VALUE_ITEM },
    { key: "phone", from: "phone", infoItem: VALUE_ITEM },
    { key: "address", from: "address", infoItem: VALUE_ITEM },
    { key: "delivery", from: "delivery", infoItem: VALUE_ITEM },
    { key: "prizeName", from: "prizeName", infoItem: VALUE_ITEM },
    { key: "quantity", from: "quantity", infoItem: VALUE_ITEM },
    { key: "consentAt", from: "consentAt", infoItem: VALUE_ITEM },
    { key: "signatureDataUrl", from: "signatureDataUrl", infoItem: VALUE_ITEM },
    { key: "version", from: "version", infoItem: VALUE_ITEM },
  ],
};

registerDto({
  name: "CertSubmissionReviewDto",
  fields: CERT_SUBMISSION_REVIEW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

async function canViewSubmissions(viewer: Viewer): Promise<boolean> {
  return can(viewer, MENU, "view");
}

// 결정 ⑧ — 메뉴 보기와 정보 항목을 함께 본다(둘은 서로 독립, D-35).
async function canRevealRrn(viewer: Viewer): Promise<boolean> {
  return (await canViewSubmissions(viewer)) && (await visible(viewer, UNMASKED_ITEM));
}

function isUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}

export type GetSubmissionForReviewDeps = { signatureStore: SignatureStore };

export type SubmissionForReviewResult =
  | {
      kind: "ok";
      submission: Partial<CertSubmissionReviewDto>;
      canReveal: boolean;
      canCorrect: boolean;
      idleMinutes: number;
      // 04.3-17 — 주민등록번호 줄 ` · 파기 대상` 표시(N10 a — 표시만). 가액 숫자는 싣지 않고 판정 결과만.
      purgeTarget: boolean;
    }
  | { kind: "notFound" };

async function readSignatureDataUrl(store: SignatureStore, key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    const png = await store.get(key);
    return png ? `data:image/png;base64,${png.toString("base64")}` : null;
  } catch {
    return null; // 화면이 이미지 자리에 실패 줄을 보인다
  }
}

export async function getSubmissionForReview(
  viewer: Viewer,
  id: string,
  deps?: Partial<GetSubmissionForReviewDeps>,
): Promise<SubmissionForReviewResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (isCertPrivacyBarredRole(viewer)) return { kind: "notFound" };
  if (!(await canViewSubmissions(viewer))) return { kind: "notFound" };
  if (!isUuid(id)) return { kind: "notFound" };

  const row = await findSubmissionForReview(viewer, id);
  if (!row || row.purgedAt || row.name === null || row.rrnMasked === null || row.phone === null) {
    return { kind: "notFound" };
  }

  const name = row.name;
  const source: CertSubmissionReviewRow = {
    id: row.id,
    certNo: row.certNo,
    eventName: row.eventName,
    submittedAt: row.submittedAt.toISOString(),
    name,
    rrnMasked: row.rrnMasked,
    phone: formatPhone(row.phone),
    address: row.delivery === "parcel" ? row.address : null,
    delivery: row.delivery === "parcel" ? "parcel" : "onsite",
    prizeName: row.prizeName,
    quantity: row.quantity,
    consentAt: row.consentAt.toISOString(),
    signatureDataUrl: await readSignatureDataUrl(deps?.signatureStore ?? getSignatureStore(), row.signatureKey),
    version: row.version,
  };

  const submission = await project(viewer, source, CERT_SUBMISSION_REVIEW_DTO_SPEC);
  if (Object.keys(submission).length === 0) return { kind: "notFound" };

  return {
    kind: "ok",
    submission,
    canReveal: await visible(viewer, UNMASKED_ITEM),
    canCorrect: await can(viewer, MENU, "write"),
    idleMinutes: await getSettingValue(CERT_PRIVACY_IDLE_MINUTES),
    purgeTarget: certRrnPurgeTarget(row.unitValueKrw, row.quantity),
  };
}

// 04.3-11 — 인쇄 DTO(D-1108). 저장된 가린 번호만 싣고 복호화하지 않는다(이 경로에 lib/crypto 없음 ·
// mask_reveal 없음). 값 칸 전부가 cert_submission.value 하나에 걸려 항목이 꺼지면 투영이 빈다(codex r2 C3).
export type CertificatePrintRow = {
  certNo: string;
  eventName: string;
  wonOn: string;
  prizeName: string;
  quantity: number;
  name: string;
  rrnMasked: string;
  phone: string;
  address: string | null;
  submittedAt: string;
  signatureDataUrl: string | null;
};

export type CertificatePrintDto = CertificatePrintRow;

export const CERTIFICATE_PRINT_DTO_SPEC: DtoSpec<CertificatePrintRow, CertificatePrintDto> = {
  fields: [
    { key: "certNo", from: "certNo", infoItem: VALUE_ITEM },
    { key: "eventName", from: "eventName", infoItem: VALUE_ITEM },
    { key: "wonOn", from: "wonOn", infoItem: VALUE_ITEM },
    { key: "prizeName", from: "prizeName", infoItem: VALUE_ITEM },
    { key: "quantity", from: "quantity", infoItem: VALUE_ITEM },
    { key: "name", from: "name", infoItem: VALUE_ITEM },
    { key: "rrnMasked", from: "rrnMasked", infoItem: VALUE_ITEM },
    { key: "phone", from: "phone", infoItem: VALUE_ITEM },
    { key: "address", from: "address", infoItem: VALUE_ITEM },
    { key: "submittedAt", from: "submittedAt", infoItem: VALUE_ITEM },
    { key: "signatureDataUrl", from: "signatureDataUrl", infoItem: VALUE_ITEM },
  ],
};

registerDto({
  name: "CertificatePrintDto",
  fields: CERTIFICATE_PRINT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type GetCertificatePrintDeps = { signatureStore: SignatureStore; now: () => Date };

export type CertificatePrintResult =
  | { kind: "ok"; print: Partial<CertificatePrintDto>; printedAt: string }
  | { kind: "notFound" };

export async function getCertificatePrint(
  viewer: Viewer,
  id: string,
  deps?: Partial<GetCertificatePrintDeps>,
): Promise<CertificatePrintResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (isCertPrivacyBarredRole(viewer)) return { kind: "notFound" };
  if (!(await canViewSubmissions(viewer))) return { kind: "notFound" };
  if (!isUuid(id)) return { kind: "notFound" };

  const row = await findSubmissionForReview(viewer, id);
  if (!row || row.purgedAt || row.name === null || row.rrnMasked === null || row.phone === null) {
    return { kind: "notFound" };
  }

  const source: CertificatePrintRow = {
    certNo: row.certNo,
    eventName: row.eventName,
    wonOn: row.wonOn,
    prizeName: row.prizeName,
    quantity: row.quantity,
    name: row.name,
    rrnMasked: row.rrnMasked,
    phone: formatPhone(row.phone),
    address: row.delivery === "parcel" ? row.address : null,
    submittedAt: row.submittedAt.toISOString(),
    signatureDataUrl: await readSignatureDataUrl(deps?.signatureStore ?? getSignatureStore(), row.signatureKey),
  };

  const print = await project(viewer, source, CERTIFICATE_PRINT_DTO_SPEC);
  if (Object.keys(print).length === 0) return { kind: "notFound" };

  return { kind: "ok", print, printedAt: formatSubmittedAtKst((deps?.now ?? (() => new Date()))().toISOString()) };
}

export type RevealRrnDeps = {
  appendActionLog: RecordActionDeps["appendActionLog"];
  decrypt: (value: string) => string;
};

export type RevealRrnResult = { kind: "revealed"; rrn: string } | { kind: "denied" } | { kind: "notFound" };

// 전체 보기 — vendors revealAccountNumber와 같은 순서(권한 → 기록 → 복호화)를 한 트랜잭션에서.
// 행은 FOR SHARE로 잠가 읽고, mask_reveal은 잠금을 쥔 같은 tx 연결로 쓴다(결정 ⑨ — 전역 풀의
// 두 번째 연결을 잡지 않는다). 기록이 실패하면 그대로 던진다(롤백 · 복호화 없음).
export async function revealRrn(viewer: Viewer, id: string, deps?: Partial<RevealRrnDeps>): Promise<RevealRrnResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (isCertPrivacyBarredRole(viewer)) return { kind: "denied" };
  if (!(await canRevealRrn(viewer))) return { kind: "denied" };
  if (!isUuid(id)) return { kind: "denied" };

  const decrypt = deps?.decrypt ?? defaultDecrypt;
  return withTransaction(async (tx): Promise<RevealRrnResult> => {
    const row = await lockSubmissionRrnForShare(viewer, id, tx);
    if (!row || row.purgedAt || !row.rrnEncrypted) return { kind: "denied" };

    await recordAction(
      viewer,
      { actionType: "mask_reveal", entity: ENTITY, entityId: id },
      { tx, appendActionLog: deps?.appendActionLog },
    );
    const plain = decrypt(row.rrnEncrypted);
    return { kind: "revealed", rrn: `${plain.slice(0, 6)}-${plain.slice(6)}` };
  });
}

export type RecordRrnReopenDeps = { appendActionLog: RecordActionDeps["appendActionLog"] };
export type RecordRrnReopenResult = { kind: "recorded" } | { kind: "denied" } | { kind: "notFound" };

// 고친 값을 다시 여는 「전체 보기」 — 복호화 없이 mask_reveal만 기록한다(UI-SPEC I4).
export async function recordRrnReopen(
  viewer: Viewer,
  id: string,
  deps?: Partial<RecordRrnReopenDeps>,
): Promise<RecordRrnReopenResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (isCertPrivacyBarredRole(viewer)) return { kind: "denied" };
  if (!(await canRevealRrn(viewer))) return { kind: "denied" };
  if (!isUuid(id)) return { kind: "denied" };

  const row = await findSubmissionForReview(viewer, id);
  if (!row || row.purgedAt) return { kind: "denied" };

  await recordAction(
    viewer,
    { actionType: "mask_reveal", entity: ENTITY, entityId: id },
    { appendActionLog: deps?.appendActionLog },
  );
  return { kind: "recorded" };
}

export type CorrectSubmissionInput = {
  version: number;
  name: string;
  phone: string;
  address?: string | null;
  rrn?: string;
};

export type CorrectionField = "name" | "rrn" | "phone" | "address";
export type CorrectionFieldError = "empty" | "tooLong" | "format" | "invalid" | "notAllowed";

// 칸 이름(로그 detail · 성공 문장) — 폼 순서.
export const CORRECTION_FIELD_LABELS: Record<CorrectionField, string> = {
  name: "이름",
  rrn: "주민등록번호",
  phone: "연락처",
  address: "주소",
};

export type CorrectSubmissionResult =
  | { kind: "saved"; fields: string[]; at: string; version: number; rrnMasked: string }
  | { kind: "conflict"; byName: string; at: string }
  | { kind: "invalid"; fields: Partial<Record<CorrectionField, CorrectionFieldError>> }
  | { kind: "unchanged" }
  | { kind: "denied" }
  | { kind: "notFound" };

export type CorrectSubmissionDeps = {
  appendActionLog: RecordActionDeps["appendActionLog"];
  now: () => Date;
};

// 서명 칸은 스키마에 없다(D-1106) — 실어 보내도 버린다.
const correctInputSchema = z.object({
  version: z.number().int().min(1),
  name: z.string().max(200),
  phone: z.string().max(40),
  address: z.string().max(1000).nullish(),
  rrn: z.string().max(20).optional(),
});

const NAME_MAX = 40;
const ADDRESS_MAX = 200;

export async function correctSubmission(
  viewer: Viewer,
  id: string,
  input: CorrectSubmissionInput,
  deps?: Partial<CorrectSubmissionDeps>,
): Promise<CorrectSubmissionResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (isCertPrivacyBarredRole(viewer)) return { kind: "denied" };
  if (!(await can(viewer, MENU, "write"))) return { kind: "denied" };
  // 볼 수 없는 확인증은 어느 칸도 고칠 수 없다(검토 R-L4 — 주민등록번호만이 아니다).
  if (!(await canViewSubmissions(viewer))) return { kind: "denied" };
  if (!(await visible(viewer, VALUE_ITEM))) return { kind: "denied" };
  if (!isUuid(id)) return { kind: "denied" };

  const parsed = correctInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "denied" };
  const data = parsed.data;

  const row = await findSubmissionForReview(viewer, id);
  if (!row || row.purgedAt) return { kind: "denied" };
  const isParcel = row.delivery === "parcel";

  const errors: Partial<Record<CorrectionField, CorrectionFieldError>> = {};
  const name = normalizeName(data.name);
  if (name === "") errors.name = "empty";
  else if (Array.from(name).length > NAME_MAX) errors.name = "tooLong";

  let rrn13: string | null = null;
  if (data.rrn !== undefined) {
    const digits = data.rrn.replace(/-/g, "");
    const checked = /^\d{13}$/.test(digits) ? validateRrn(digits.slice(0, 6), digits.slice(6)) : { ok: false };
    if (checked.ok) rrn13 = digits;
    else errors.rrn = "invalid";
  }

  const phone = normalizePhone(data.phone);
  if (phone === null) errors.phone = "format";

  let address: string | null = null;
  if (!isParcel) {
    if (data.address !== undefined && data.address !== null) errors.address = "notAllowed";
  } else {
    address = (data.address ?? "").trim();
    if (address === "") errors.address = "empty";
    else if (Array.from(address).length > ADDRESS_MAX) errors.address = "tooLong";
  }

  if (Object.keys(errors).length > 0) return { kind: "invalid", fields: errors };

  // 주민등록번호를 바꾸는 정정은 전체 보기와 같은 두 판정을 더 본다(codex final C1).
  if (rrn13 !== null && !(await canRevealRrn(viewer))) return { kind: "denied" };

  const patch: CorrectSubmissionPatch = {};
  const changed: CorrectionField[] = [];
  if (name !== row.name) {
    patch.name = name;
    changed.push("name");
  }
  if (rrn13 !== null) {
    // 비교를 위해 복호화하지 않는다 — 보냈으면 바뀐 칸이다.
    patch.rrnEncrypted = encrypt(rrn13);
    patch.rrnMasked = maskRrn(rrn13);
    changed.push("rrn");
  }
  if (phone !== null && phone !== row.phone) {
    patch.phone = phone;
    changed.push("phone");
  }
  if (isParcel && address !== null && address !== row.address) {
    patch.address = address;
    changed.push("address");
  }
  if (changed.length === 0) return { kind: "unchanged" };

  const fields = changed.map((field) => CORRECTION_FIELD_LABELS[field]);
  const at = (deps?.now ?? (() => new Date()))();

  // C6 — 정정 UPDATE와 cert_correct 로그를 한 트랜잭션에. 로그가 실패하면 정정도 되돌아간다.
  const updated = await withTransaction(async (tx) => {
    const count = await updateSubmissionIfVersion(viewer, id, data.version, patch, at, tx);
    if (count === 0) return false;
    await recordAction(
      viewer,
      { actionType: "cert_correct", entity: ENTITY, entityId: id, detail: { fields } },
      { tx, appendActionLog: deps?.appendActionLog },
    );
    return true;
  });

  if (!updated) {
    const last = await findLastCorrection(viewer, id);
    if (!last || last.purgedAt) return { kind: "denied" };
    return { kind: "conflict", byName: last.byName ?? "", at: last.at.toISOString() };
  }

  return {
    kind: "saved",
    fields,
    at: at.toISOString(),
    version: data.version + 1,
    rrnMasked: patch.rrnMasked ?? row.rrnMasked ?? "",
  };
}
