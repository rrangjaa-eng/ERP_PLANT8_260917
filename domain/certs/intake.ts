import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { isCertFeatureEnabled } from "@/domain/certs/feature";
import { buildPublicRows, type PublicRosterEntry, type WinnerForDisplay } from "@/domain/certs/roster-display";
import { maskName, maskRrn, normalizeName, normalizePhone } from "@/domain/certs/format";
import { validateRrn } from "@/domain/certs/rrn";
import { CERT_CONSENT_VERSION } from "@/domain/certs/consent";
import { getSettingValue } from "@/domain/settings/registry";
import { ACTION_LOG_OPTIONAL_TYPES, CERT_RETENTION_YEARS } from "@/domain/settings/keys";
import { recordAction, type RecordActionDeps } from "@/domain/action-log/record";
import {
  loadDocumentNumberFormat as defaultLoadDocumentNumberFormat,
  allocateDocumentNumber,
} from "@/domain/document-numbering";
import { withTransaction } from "@/lib/db-transaction";
import { encrypt } from "@/lib/crypto";
import { kstYear } from "@/lib/kst-date";
import { getSignatureStore, type SignatureStore } from "@/lib/storage/signature-store";
import { findUserById } from "@/repositories/users";
import { findEventByTokenHash, lockEventForUpdate, type CertEventRow } from "@/repositories/cert-events";
import {
  findWinnerInEvent,
  listWinnersForIntake,
  markWinnerSubmitted,
  markWinnerVerified,
  type CertWinnerRow,
} from "@/repositories/cert-winners";
import {
  deleteSignatureUploadIntent,
  findSubmissionByWinnerId,
  insertSignatureUploadIntent,
  insertSubmission,
} from "@/repositories/cert-submissions";

// 04.3-02 Task 2 ⑩ — 공개 흐름의 유일한 domain 진입점. can·visible·scopeFor나
// 세션 뷰어 도우미를 import하지 않는다 — 범위는 토큰 해시·행사 id가 좁힌다
// (T-04.3-09). 리포지토리 호출의 viewer 인자는 전부 SYSTEM_VIEWER다.

// 증표 유효 기간(설계 /cso 검토 대상) — 확인 뒤 이 시간 안에만 제출할 수 있다.
export const VERIFY_PROOF_TTL_MINUTES = 30;

// 04.3-06이 domain/certs/signature-png.ts의 inspectSignaturePng로 대체한다 —
// 트레이서는 시그니처·크기만 인라인으로 본다.
const SIGNATURE_MAX_PNG_BYTES = 184_320;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isValidSignaturePng(png: Buffer): boolean {
  return png.length > 0 && png.length <= SIGNATURE_MAX_PNG_BYTES && png.subarray(0, 8).equals(PNG_MAGIC);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function managerNameFor(event: Pick<CertEventRow, "createdBy">): Promise<string> {
  if (!event.createdBy) return "";
  const user = await findUserById(SYSTEM_VIEWER, event.createdBy);
  return user?.name ?? "";
}

type EventState =
  | { status: "open" }
  | { status: "closed"; reason: "expired" | "all_submitted" | "manual"; at: string };

function resolveEventState(event: CertEventRow, now: Date): EventState {
  if (event.closedAt) {
    const reason = event.closedReason === "all_submitted" ? "all_submitted" : "manual";
    return { status: "closed", reason, at: event.closedAt.toISOString() };
  }
  if (now >= event.expiresAt) {
    return { status: "closed", reason: "expired", at: event.expiresAt.toISOString() };
  }
  return { status: "open" };
}

function toWinnerForDisplay(row: CertWinnerRow): WinnerForDisplay {
  return {
    id: row.id,
    name: row.name,
    prizeName: row.prizeName,
    quantity: row.quantity,
    distinguishLabel: row.distinguishLabel,
    sortOrder: row.sortOrder,
  };
}

// ── loadIntake ──────────────────────────────────────────────────────────

export type LoadIntakeResult =
  | { kind: "notFound" }
  | { kind: "closed"; reason: "expired" | "all_submitted" | "manual"; at: string; managerName: string; contactPhone: string }
  | { kind: "open"; eventName: string; wonOn: string; rows: PublicRosterEntry[]; managerName: string; contactPhone: string };

export async function loadIntake(token: string, now: Date = new Date()): Promise<LoadIntakeResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };

  const tokenHash = sha256Hex(token);
  const event = await findEventByTokenHash(SYSTEM_VIEWER, tokenHash);
  if (!event) return { kind: "notFound" };

  const managerName = await managerNameFor(event);
  const state = resolveEventState(event, now);
  if (state.status === "closed") {
    return { kind: "closed", reason: state.reason, at: state.at, managerName, contactPhone: event.contactPhone };
  }

  const winners = await listWinnersForIntake(SYSTEM_VIEWER, event.id);
  const rows = buildPublicRows(winners.map(toWinnerForDisplay));
  return { kind: "open", eventName: event.name, wonOn: event.wonOn, rows, managerName, contactPhone: event.contactPhone };
}

// ── selectWinner ────────────────────────────────────────────────────────

export type SelectWinnerResult = { kind: "notFound" } | { kind: "ok"; rowId: string; maskedName: string };

export async function selectWinner(token: string, rowId: string, now: Date = new Date()): Promise<SelectWinnerResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };

  const event = await findEventByTokenHash(SYSTEM_VIEWER, sha256Hex(token));
  if (!event) return { kind: "notFound" };
  if (resolveEventState(event, now).status === "closed") return { kind: "notFound" };

  const winner = await findWinnerInEvent(SYSTEM_VIEWER, event.id, rowId);
  if (!winner || winner.name === null) return { kind: "notFound" };

  return { kind: "ok", rowId, maskedName: maskName(normalizeName(winner.name)) };
}

// ── verifyLast4 ─────────────────────────────────────────────────────────

export type VerifyLast4Result =
  | { kind: "notFound" }
  | { kind: "submitted"; maskedName: string; submittedAt: string }
  | { kind: "wrong" }
  | {
      kind: "ok";
      rowId: string;
      proof: string;
      prizeLine: string;
      delivery: "onsite" | "parcel";
      consent: { version: string; retentionYears: number };
    };

export async function verifyLast4(
  token: string,
  rowId: string,
  last4: string,
  idemKey: string,
  now: Date = new Date(),
): Promise<VerifyLast4Result> {
  void idemKey; // 멱등 재생·잠금 카운트는 04.3-03이 이 서명에 더한다.
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };

  const event = await findEventByTokenHash(SYSTEM_VIEWER, sha256Hex(token));
  if (!event) return { kind: "notFound" };
  if (resolveEventState(event, now).status === "closed") return { kind: "notFound" };

  const winner = await findWinnerInEvent(SYSTEM_VIEWER, event.id, rowId);
  if (!winner || winner.name === null || winner.phone === null) return { kind: "notFound" };

  const matches = winner.phone.slice(-4) === last4;

  if (winner.submittedAt) {
    // E6-a — 행을 고르는 것만으로 제출 여부가 드러나지 않는다. 맞았을
    // 때만 「이미 제출하셨습니다」가 선다.
    if (!matches) return { kind: "wrong" };
    return { kind: "submitted", maskedName: maskName(normalizeName(winner.name)), submittedAt: winner.submittedAt.toISOString() };
  }

  if (!matches) return { kind: "wrong" };

  const proof = randomBytes(32).toString("base64url");
  const proofHash = sha256Hex(proof);
  const verifiedUntil = new Date(now.getTime() + VERIFY_PROOF_TTL_MINUTES * 60 * 1000);
  const consentVersion = CERT_CONSENT_VERSION;
  const retentionYears = await getSettingValue(CERT_RETENTION_YEARS);

  await markWinnerVerified(SYSTEM_VIEWER, winner.id, {
    verifyProofHash: proofHash,
    verifiedUntil,
    offeredConsentVersion: consentVersion,
    offeredRetentionYears: retentionYears,
  });

  return {
    kind: "ok",
    rowId,
    proof,
    prizeLine: `${winner.prizeName} ${winner.quantity}개`,
    delivery: winner.delivery as "onsite" | "parcel",
    consent: { version: consentVersion, retentionYears },
  };
}

// ── submitCertificate ───────────────────────────────────────────────────

const submitCertificateInputSchema = z.object({
  rowId: z.string().min(1),
  proof: z.string().min(1),
  name: z.string().min(1).max(40),
  rrnFront6: z.string().regex(/^\d{6}$/),
  rrnBack7: z.string().regex(/^\d{7}$/),
  phone: z.string().min(1),
  address: z.string().max(200).optional(),
  consent: z.literal(true),
  signaturePngBase64: z.string().min(1),
  idempotencyKey: z.string().min(1),
  consentVersion: z.string().min(1),
  retentionYears: z.coerce.number().int().min(1),
  rrnRecheckConfirmed: z.boolean().optional().default(false),
});

export type SubmitCertificateInput = z.input<typeof submitCertificateInputSchema>;

export type SubmitCertificateResult =
  | { kind: "notFound" }
  | { kind: "expiredProof" }
  | { kind: "invalid"; fields: string[] }
  | { kind: "rrnRecheck" }
  | {
      kind: "submitted";
      name: string;
      submittedAt: string;
      prizeLine: string;
      delivery: "onsite" | "parcel";
      managerName: string;
      contactPhone: string;
    };

export type SubmitCertificateDeps = {
  loadDocumentNumberFormat: typeof defaultLoadDocumentNumberFormat;
  signatureStore: SignatureStore;
  appendActionLog?: RecordActionDeps["appendActionLog"];
};

// 트랜잭션 안에서만 쓰는 내부 신호 — 다른 요청이 이미 같은 자리를 제출로
// 확정했을 때(0행) 커밋할 것이 없으므로 롤백해 밖에서 기존 제출을 읽는다.
class AlreadySubmittedSignal extends Error {}

export async function submitCertificate(
  token: string,
  input: SubmitCertificateInput,
  deps?: Partial<SubmitCertificateDeps>,
  now: Date = new Date(),
): Promise<SubmitCertificateResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };

  const event = await findEventByTokenHash(SYSTEM_VIEWER, sha256Hex(token));
  if (!event) return { kind: "notFound" };
  if (resolveEventState(event, now).status === "closed") return { kind: "notFound" };

  const parsed = submitCertificateInputSchema.parse(input);

  const winner = await findWinnerInEvent(SYSTEM_VIEWER, event.id, parsed.rowId);
  if (!winner || winner.name === null) return { kind: "notFound" };

  // 1. 증표 확인 — 없음·불일치·시간 지남은 모두 같은 판정이다(공격자가
  // "틀린 증표"와 "지난 증표"를 구별하지 못하게 한다).
  const proofHash = sha256Hex(parsed.proof);
  const proofValid =
    winner.verifyProofHash !== null &&
    winner.verifyProofHash === proofHash &&
    winner.verifiedUntil !== null &&
    winner.verifiedUntil > now;
  if (!proofValid) return { kind: "expiredProof" };

  // 2. 동의 묶음 검사(#15) — 확인 때 그 자리에 묶인 값과 같을 때만 저장한다.
  if (
    parsed.consentVersion !== winner.offeredConsentVersion ||
    parsed.retentionYears !== winner.offeredRetentionYears
  ) {
    return { kind: "expiredProof" };
  }

  // 3. 주민등록번호 규칙.
  const rrnResult = validateRrn(parsed.rrnFront6, parsed.rrnBack7, now);
  if (!rrnResult.ok) return { kind: "invalid", fields: ["rrn"] };
  if (rrnResult.checkDigit === "mismatch" && !parsed.rrnRecheckConfirmed) {
    return { kind: "rrnRecheck" };
  }

  // 3-b. 연락처 — 정규화에 실패하면 빈 문자열로 저장하지 않고 되돌린다(S8).
  const normalizedPhone = normalizePhone(parsed.phone);
  if (normalizedPhone === null) return { kind: "invalid", fields: ["phone"] };

  // 4. 서명 PNG.
  const signaturePng = Buffer.from(parsed.signaturePngBase64, "base64");
  if (!isValidSignaturePng(signaturePng)) return { kind: "invalid", fields: ["signature"] };
  const objectKey = `signatures/${event.id}/${winner.id}-${randomUUID()}.png`;

  // 4-b. 업로드 전에 읽기(E3-27) — 서식·로그 스위치는 의도 행·put보다
  // 먼저 읽는다. 여기서 실패하면 의도 행도 put도 없어 고아가 없다.
  const loadDocumentNumberFormat = deps?.loadDocumentNumberFormat ?? defaultLoadDocumentNumberFormat;
  const format = await loadDocumentNumberFormat("cert");
  let submitLogEnabled = true;
  try {
    const optionalTypes = await getSettingValue(ACTION_LOG_OPTIONAL_TYPES);
    submitLogEnabled = optionalTypes.includes("document_submit");
  } catch {
    submitLogEnabled = true; // fail-open — record.ts의 defaultIsActionTypeEnabled와 같은 규칙
  }

  // 5. 규약 C3 — 저장소를 먼저 확정한다(non-local 환경에서 드라이버가 없으면
  // 여기서 fail-closed로 던져 의도 행이 커밋되기 전에 끝난다, S3) → 의도
  // 행을 먼저(자기 문장으로) 커밋 → put. put 자체가 실패하면(객체가 없다)
  // 의도 행을 바로 지운다 — 24시간 파기를 기다릴 고아가 아니다.
  const signatureStore = deps?.signatureStore ?? getSignatureStore();
  await insertSignatureUploadIntent(SYSTEM_VIEWER, objectKey);
  try {
    await signatureStore.put(objectKey, signaturePng);
  } catch (putError) {
    // put 자체가 거부·타임아웃 등으로 실패해도 객체가 실제로 없다고
    // 단정할 수 없다(예: 응답만 못 받은 경우) — tx 실패 갈래와 같은 규칙:
    // 지우기가 성공했을 때만 의도 행도 지운다. 지우기가 실패하면 의도
    // 행을 남겨 04.3-12 파기(24시간 뒤)가 치우게 한다.
    try {
      await signatureStore.delete(objectKey);
      await deleteSignatureUploadIntent(SYSTEM_VIEWER, objectKey);
    } catch {
      // 지우기 실패 — 의도 행을 남긴다.
    }
    throw putError;
  }

  const submittedAt = now;

  try {
    await withTransaction(async (tx) => {
      await lockEventForUpdate(SYSTEM_VIEWER, event.id, tx);

      const updatedRows = await markWinnerSubmitted(SYSTEM_VIEWER, winner.id, submittedAt, tx);
      if (updatedRows === 0) throw new AlreadySubmittedSignal();

      const { number: certNo } = await allocateDocumentNumber(
        SYSTEM_VIEWER,
        { counterKey: "cert", year: kstYear(submittedAt), format },
        tx,
      );

      await insertSubmission(
        SYSTEM_VIEWER,
        {
          winnerId: winner.id,
          eventId: event.id,
          certNo,
          name: normalizeName(parsed.name),
          rrnEncrypted: encrypt(`${parsed.rrnFront6}${parsed.rrnBack7}`),
          rrnMasked: maskRrn(`${parsed.rrnFront6}${parsed.rrnBack7}`),
          phone: normalizedPhone,
          address: winner.delivery === "parcel" ? (parsed.address ?? null) : null,
          consentAt: submittedAt,
          consentVersion: parsed.consentVersion,
          retentionYears: parsed.retentionYears,
          signatureKey: objectKey,
          submittedAt,
        },
        tx,
      );

      await deleteSignatureUploadIntent(SYSTEM_VIEWER, objectKey, tx);

      await recordAction(SYSTEM_VIEWER, {
        actionType: "document_submit",
        entity: "cert_submission",
        entityId: winner.id,
        detail: { eventId: event.id },
      }, {
        tx,
        isActionTypeEnabled: () => Promise.resolve(submitLogEnabled),
        ...(deps?.appendActionLog ? { appendActionLog: deps.appendActionLog } : {}),
      });

    });

    const managerName = await managerNameFor(event);
    return {
      kind: "submitted",
      name: normalizeName(parsed.name),
      submittedAt: submittedAt.toISOString(),
      prizeLine: `${winner.prizeName} ${winner.quantity}개`,
      delivery: winner.delivery as "onsite" | "parcel",
      managerName,
      contactPhone: event.contactPhone,
    };
  } catch (error) {
    // 7. 트랜잭션 실패 — 방금 올린 객체를 지우고, 지우기가 성공했을 때만
    // 의도 행을 지운다(실패하면 04.3-12 파기가 24시간 뒤 치운다).
    try {
      await signatureStore.delete(objectKey);
      await deleteSignatureUploadIntent(SYSTEM_VIEWER, objectKey);
    } catch {
      // 지우기 실패 — 의도 행을 남긴다.
    }

    if (error instanceof AlreadySubmittedSignal) {
      const existing = await findSubmissionByWinnerId(SYSTEM_VIEWER, winner.id);
      const managerName = await managerNameFor(event);
      return {
        kind: "submitted",
        name: existing?.name ?? normalizeName(parsed.name),
        submittedAt: (existing?.submittedAt ?? submittedAt).toISOString(),
        prizeLine: `${winner.prizeName} ${winner.quantity}개`,
        delivery: winner.delivery as "onsite" | "parcel",
        managerName,
        contactPhone: event.contactPhone,
      };
    }
    throw error;
  }
}
