import { z } from "zod";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction, type RecordActionDeps } from "@/domain/action-log/record";
import { isCertFeatureEnabled } from "@/domain/certs/feature";
import { formatPhone, formatSubmittedAtKst, maskRrn, normalizeName, normalizePhone } from "@/domain/certs/format";
import { validateRrn } from "@/domain/certs/rrn";
import { certRrnPurgeTarget } from "@/domain/certs/prize-value";
import { withTransaction } from "@/lib/db-transaction";
import { decrypt as defaultDecrypt, encrypt } from "@/lib/crypto";
import { getSignatureStore, type SignatureStore } from "@/lib/storage/signature-store";
import {
  findLastCorrection,
  findSubmissionForReview,
  lockSubmissionForUpdate,
  lockSubmissionRrnForShare,
  updateSubmissionIfVersion,
  type CorrectSubmissionPatch,
} from "@/repositories/cert-review";
import { lockEventRow } from "@/repositories/cert-events";
import { markSubmissionExcluded } from "@/repositories/cert-submissions";
import { clearSubmissionPersonalFields } from "@/repositories/cert-purge";

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
  // 04.3-17 — 주민번호만 비운 제출(⑥-b) · 대조 제외된 제출은 null.
  rrnMasked: string | null;
  // 04.3-17 — 대조 제외된 제출은 null(E1 b).
  phone: string | null;
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

// 정정 · 「대조 제외」의 한 판정(대표 계급 아님 · certs.submissions 쓰기 · 보기 · cert_submission.value) — 되돌릴 수 없는 「대조 제외」도
// 보기가 아니라 이 쓰기 판정이다(새 흐름 설계 /cso NF-2). 볼 수 없는 확인증은 어느 칸도 고칠 수 없다(검토 R-L4).
async function canWriteSubmissions(viewer: Viewer): Promise<boolean> {
  if (isCertPrivacyBarredRole(viewer)) return false;
  if (!(await can(viewer, MENU, "write"))) return false;
  if (!(await canViewSubmissions(viewer))) return false;
  return visible(viewer, VALUE_ITEM);
}

// 결정 ⑧ — 메뉴 보기와 정보 항목을 함께 본다(둘은 서로 독립, D-35).
async function canRevealRrn(viewer: Viewer): Promise<boolean> {
  return (await canViewSubmissions(viewer)) && (await visible(viewer, UNMASKED_ITEM));
}

function isUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}

export type GetSubmissionForReviewDeps = {
  signatureStore: SignatureStore;
  appendActionLog: RecordActionDeps["appendActionLog"];
};

// 04.3-14 사용자 결정 ⑤ — 접속기록의 「어디서」. 페이지 · 액션이 요청 헤더에서 lib/client-ip.ts clientIp로 읽어 넘긴다.
export type CertAccess = { ip: string | null };

export type SubmissionForReviewResult =
  | {
      kind: "ok";
      submission: Partial<CertSubmissionReviewDto>;
      canReveal: boolean;
      canCorrect: boolean;
      // 04.3-17 — 주민등록번호 줄 ` · 파기 대상` 표시(N10 a — 표시만). 가액 숫자는 싣지 않고 판정 결과만.
      purgeTarget: boolean;
      // 04.3-17 ⑥-b — 주민등록번호 암호문이 비었다(rrn_encrypted IS NULL — 제외 여부와 무관한 키 하나).
      rrnCleared: boolean;
      // 04.3-17 — I4 머리 2차 「대조 제외」(UD-2 a) — 정정과 같은 쓰기 판정 ∧ 제외되지 않은 제출(NF-2).
      canExclude: boolean;
      // 04.3-17 — 대조 제외된 제출이면 제외 시각 · 제외한 사람(DR-1 제외된 I4 부제).
      excluded: { at: string; byName: string | null } | null;
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

// 04.3-14 — 판정을 모두 지나 투영이 비지 않았을 때만 끌 수 없는 cert_view를 남기고 그다음에 돌려준다(revealRrn의 「권한 →
// 기록 → 복호화」와 같은 순서). 기록이 던지면 그대로 던진다 — 데이터가 돌아가지 않는다(fail-closed).
export async function getSubmissionForReview(
  viewer: Viewer,
  id: string,
  access: CertAccess,
  deps?: Partial<GetSubmissionForReviewDeps>,
): Promise<SubmissionForReviewResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (isCertPrivacyBarredRole(viewer)) return { kind: "notFound" };
  if (!(await canViewSubmissions(viewer))) return { kind: "notFound" };
  if (!isUuid(id)) return { kind: "notFound" };

  const row = await findSubmissionForReview(viewer, id);
  if (!row || row.purgedAt || row.name === null) return { kind: "notFound" };
  // 가린 주민번호가 비었으면 「주민번호만 비운」 줄(rrnCleared)일 때만 연다 · 연락처가 비었으면 대조 제외된 줄일 때만 연다(DR-1).
  const excluded = row.excludedAt !== null;
  if (row.rrnMasked === null && !row.rrnCleared) return { kind: "notFound" };
  if (row.phone === null && !excluded) return { kind: "notFound" };

  const name = row.name;
  const source: CertSubmissionReviewRow = {
    id: row.id,
    certNo: row.certNo,
    eventName: row.eventName,
    submittedAt: row.submittedAt.toISOString(),
    name,
    rrnMasked: row.rrnCleared ? null : row.rrnMasked,
    phone: row.phone === null ? null : formatPhone(row.phone),
    address: row.delivery === "parcel" && !excluded ? row.address : null,
    delivery: row.delivery === "parcel" ? "parcel" : "onsite",
    prizeName: row.prizeName,
    quantity: row.quantity,
    consentAt: row.consentAt.toISOString(),
    // 대조 제외된 줄의 서명 객체는 삭제 대기다 — 읽지 않는다.
    signatureDataUrl: excluded ? null : await readSignatureDataUrl(deps?.signatureStore ?? getSignatureStore(), row.signatureKey),
    version: row.version,
  };

  const submission = await project(viewer, source, CERT_SUBMISSION_REVIEW_DTO_SPEC);
  if (Object.keys(submission).length === 0) return { kind: "notFound" };

  await recordAction(
    viewer,
    { actionType: "cert_view", entity: ENTITY, entityId: id, detail: { ip: access.ip, submissionId: id } },
    { appendActionLog: deps?.appendActionLog },
  );

  return {
    kind: "ok",
    submission,
    canReveal: !row.rrnCleared && !excluded && (await visible(viewer, UNMASKED_ITEM)),
    canCorrect: !excluded && (await can(viewer, MENU, "write")),
    purgeTarget: !row.rrnCleared && !excluded && certRrnPurgeTarget(row.unitValueKrw, row.quantity),
    rrnCleared: row.rrnCleared,
    canExclude: !excluded && (await canWriteSubmissions(viewer)),
    excluded: row.excludedAt ? { at: row.excludedAt.toISOString(), byName: row.excludedByName } : null,
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

export type GetCertificatePrintDeps = {
  signatureStore: SignatureStore;
  now: () => Date;
  appendActionLog: RecordActionDeps["appendActionLog"];
};

export type CertificatePrintResult =
  | { kind: "ok"; print: Partial<CertificatePrintDto>; printedAt: string }
  | { kind: "notFound" };

// 04.3-14 사용자 결정 U3 a — 인쇄를 열 때도 I4와 같은 cert_view(detail의 via는 print). 기록이 던지면 인쇄도 열리지 않는다.
export async function getCertificatePrint(
  viewer: Viewer,
  id: string,
  access: CertAccess,
  deps?: Partial<GetCertificatePrintDeps>,
): Promise<CertificatePrintResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (isCertPrivacyBarredRole(viewer)) return { kind: "notFound" };
  if (!(await canViewSubmissions(viewer))) return { kind: "notFound" };
  if (!isUuid(id)) return { kind: "notFound" };

  const row = await findSubmissionForReview(viewer, id);
  // 대조 제외 · 주민번호만 비운 제출(rrnCleared — 제외 여부와 무관한 키)은 인쇄하지 않는다(라우트 404 — DR-1 · ⑥-b).
  if (!row || row.purgedAt || row.excludedAt || row.rrnCleared || row.name === null || row.rrnMasked === null || row.phone === null) {
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

  await recordAction(
    viewer,
    { actionType: "cert_view", entity: ENTITY, entityId: id, detail: { ip: access.ip, submissionId: id, via: "print" } },
    { appendActionLog: deps?.appendActionLog },
  );

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
// 04.3-14 사용자 결정 ⑤ — mask_reveal detail에 접속지 · 확인증 id(번호 · 이름 · 전화 값은 싣지 않는다).
export async function revealRrn(
  viewer: Viewer,
  id: string,
  access: CertAccess,
  deps?: Partial<RevealRrnDeps>,
): Promise<RevealRrnResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (isCertPrivacyBarredRole(viewer)) return { kind: "denied" };
  if (!(await canRevealRrn(viewer))) return { kind: "denied" };
  if (!isUuid(id)) return { kind: "denied" };

  const decrypt = deps?.decrypt ?? defaultDecrypt;
  return withTransaction(async (tx): Promise<RevealRrnResult> => {
    const row = await lockSubmissionRrnForShare(viewer, id, tx);
    if (!row || row.purgedAt || row.excludedAt || !row.rrnEncrypted) return { kind: "denied" };

    await recordAction(
      viewer,
      { actionType: "mask_reveal", entity: ENTITY, entityId: id, detail: { ip: access.ip, submissionId: id } },
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
  access: CertAccess,
  deps?: Partial<RecordRrnReopenDeps>,
): Promise<RecordRrnReopenResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (isCertPrivacyBarredRole(viewer)) return { kind: "denied" };
  if (!(await canRevealRrn(viewer))) return { kind: "denied" };
  if (!isUuid(id)) return { kind: "denied" };

  const row = await findSubmissionForReview(viewer, id);
  if (!row || row.purgedAt || row.excludedAt || row.rrnCleared) return { kind: "denied" };

  await recordAction(
    viewer,
    { actionType: "mask_reveal", entity: ENTITY, entityId: id, detail: { ip: access.ip, submissionId: id } },
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
  // 04.3-17(N3 a · E30) — 정수 1~99.
  quantity?: number | string;
};

export type CorrectionField = "name" | "rrn" | "phone" | "address" | "quantity";
export type CorrectionFieldError = "empty" | "tooLong" | "format" | "invalid" | "notAllowed";

// 칸 이름(로그 detail · 성공 문장) — 폼 순서.
export const CORRECTION_FIELD_LABELS: Record<CorrectionField, string> = {
  name: "이름",
  rrn: "주민등록번호",
  phone: "연락처",
  address: "주소",
  quantity: "수량",
};

export type CorrectSubmissionResult =
  | { kind: "saved"; fields: string[]; at: string; version: number; rrnMasked: string; purgeTarget: boolean }
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
  quantity: z.union([z.number(), z.string().max(10)]).optional(),
});

const NAME_MAX = 40;
const QUANTITY_PATTERN = /^[1-9][0-9]?$/;
const ADDRESS_MAX = 200;

export async function correctSubmission(
  viewer: Viewer,
  id: string,
  input: CorrectSubmissionInput,
  access: CertAccess,
  deps?: Partial<CorrectSubmissionDeps>,
): Promise<CorrectSubmissionResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (!(await canWriteSubmissions(viewer))) return { kind: "denied" };
  if (!isUuid(id)) return { kind: "denied" };

  const parsed = correctInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "denied" };
  const data = parsed.data;

  const row = await findSubmissionForReview(viewer, id);
  // 대조 제외된 제출은 고치지 않는다(DR-1). 주민번호만 비운 줄(⑥-b)은 주민등록번호를 정정으로 다시 받지 않는다 — 전체 보기가
  // 없는 줄은 주민등록번호 정정도 없다(D-1106).
  if (!row || row.purgedAt || row.excludedAt) return { kind: "denied" };
  if (row.rrnCleared && data.rrn !== undefined) return { kind: "denied" };
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

  let quantity: number | null = null;
  if (data.quantity !== undefined) {
    const text = String(data.quantity).trim();
    if (QUANTITY_PATTERN.test(text)) quantity = Number(text);
    else errors.quantity = "format";
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
  if (quantity !== null && quantity !== row.quantity) {
    patch.quantity = quantity;
    changed.push("quantity");
  }
  if (changed.length === 0) return { kind: "unchanged" };

  const fields = changed.map((field) => CORRECTION_FIELD_LABELS[field]);
  const at = (deps?.now ?? (() => new Date()))();

  // C6 — 정정 UPDATE와 cert_correct 로그를 한 트랜잭션에. 로그가 실패하면 정정도 되돌아간다. 제출을 바꾸는 쓰기라 행사 행
  // 잠금을 먼저 잡는다(04.3-15 규약 · 04.3-17 「대조 제외」 · 「링크 닫기」와 직렬화).
  const updated = await withTransaction(async (tx) => {
    if (!(await lockEventRow(viewer, row.eventId, tx))) return false;
    const count = await updateSubmissionIfVersion(viewer, id, data.version, patch, at, tx);
    if (count === 0) return false;
    await recordAction(
      viewer,
      // 04.3-14 사용자 결정 ⑤ — 칸 이름에 접속지 · 확인증 id를 더한다(값은 싣지 않는다).
      { actionType: "cert_correct", entity: ENTITY, entityId: id, detail: { fields, ip: access.ip, submissionId: id } },
      { tx, appendActionLog: deps?.appendActionLog },
    );
    return true;
  });

  if (!updated) {
    const last = await findLastCorrection(viewer, id);
    if (!last || last.purgedAt || last.excludedAt) return { kind: "denied" };
    return { kind: "conflict", byName: last.byName ?? "", at: last.at.toISOString() };
  }

  return {
    kind: "saved",
    fields,
    at: at.toISOString(),
    version: data.version + 1,
    rrnMasked: patch.rrnMasked ?? row.rrnMasked ?? "",
    // 04.3-17 — 수량을 고치면 파기 대상 판정이 새 값으로 바뀐다(화면이 다시 읽지 않고 따라간다).
    purgeTarget: !row.rrnCleared && certRrnPurgeTarget(row.unitValueKrw, patch.quantity ?? row.quantity),
  };
}

// ── 「대조 제외」(I4 머리 2차 — 04.3-17 E1 b · UD-2 a) ──────────────────────────────────────────

export type ExcludeSubmissionResult =
  | { kind: "excluded"; eventId: string; name: string }
  | { kind: "alreadyExcluded" }
  | { kind: "conflict"; byName: string; at: string }
  | { kind: "denied" }
  | { kind: "notFound" };

export type ExcludeSubmissionDeps = {
  appendActionLog: RecordActionDeps["appendActionLog"];
  now: () => Date;
};

const excludeInputSchema = z.object({ version: z.number().int().min(1) });

// 게이트(notFound) → 정정과 같은 쓰기 판정(대표 아님 · certs.submissions 쓰기 · 보기 · cert_submission.value — 보기 판정이 아니다,
// /cso NF-2) — 권한 읽기는 트랜잭션 전(W1) → 트랜잭션: 그 제출의 행사 행 잠금 먼저(null이면 notFound — E13) → 제출 행 FOR UPDATE
// (파기면 notFound · 이미 제외면 alreadyExcluded · 버전이 다르면 충돌) → 제외 칸 채움 → 04.3-12 clearSubmissionPersonalFields
// exclude 모드(주민등록번호 · 주소 · 연락처 · IP 가명 비움 · 서명 객체 삭제 대기) → 같은 tx로 끌 수 없는 cert_purge(개인정보 없음).
// 되돌리는 함수는 두지 않는다. 지급명세서(Phase 11)는 excluded_at IS NULL인 제출만 쓴다.
export async function excludeSubmission(
  viewer: Viewer,
  id: string,
  input: { version: number },
  deps?: Partial<ExcludeSubmissionDeps>,
): Promise<ExcludeSubmissionResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  if (!(await canWriteSubmissions(viewer))) return { kind: "denied" };
  if (!isUuid(id)) return { kind: "denied" };
  const parsed = excludeInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "denied" };

  const row = await findSubmissionForReview(viewer, id);
  if (!row || row.purgedAt) return { kind: "notFound" };
  const at = (deps?.now ?? (() => new Date()))();

  type InTx = ExcludeSubmissionResult | { kind: "stale" };
  const result = await withTransaction(async (tx): Promise<InTx> => {
    if (!(await lockEventRow(viewer, row.eventId, tx))) return { kind: "notFound" };
    const current = await lockSubmissionForUpdate(viewer, id, tx);
    if (!current || current.purgedAt) return { kind: "notFound" };
    if (current.excludedAt) return { kind: "alreadyExcluded" };
    if (current.version !== parsed.data.version) return { kind: "stale" };

    await markSubmissionExcluded(viewer, id, { at, by: viewer.id }, tx);
    await clearSubmissionPersonalFields(SYSTEM_VIEWER, [id], { mode: "exclude", at }, tx);
    await recordAction(
      viewer,
      { actionType: "cert_purge", entity: ENTITY, entityId: id, detail: { submissions: 1, reason: "excluded" } },
      { tx, appendActionLog: deps?.appendActionLog },
    );
    return { kind: "excluded", eventId: row.eventId, name: current.name ?? "" };
  });

  if (result.kind !== "stale") return result;
  const last = await findLastCorrection(viewer, id);
  if (!last || last.purgedAt) return { kind: "notFound" };
  return { kind: "conflict", byName: last.byName ?? "", at: last.at.toISOString() };
}
