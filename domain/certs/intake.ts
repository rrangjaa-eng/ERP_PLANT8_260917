import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { isCertFeatureEnabled } from "@/domain/certs/feature";
import { buildPublicRows, type PublicRosterEntry, type WinnerForDisplay } from "@/domain/certs/roster-display";
import { maskName, maskRrn, normalizeName, normalizePhone } from "@/domain/certs/format";
import { validateRrn } from "@/domain/certs/rrn";
import { inspectSignaturePng } from "@/domain/certs/signature-png";
import { CERT_CONSENT_VERSION } from "@/domain/certs/consent";
import { getSettingValue } from "@/domain/settings/registry";
import {
  ACTION_LOG_OPTIONAL_TYPES,
  CERT_RETENTION_YEARS,
  CERT_VERIFY_LOCK_MINUTES,
  CERT_VERIFY_MAX_ATTEMPTS,
} from "@/domain/settings/keys";
import {
  VERIFY_RATE_WINDOW_MINUTES,
  certIpHash,
  evaluateVerifyAttempt,
  eventBudgetExceeded,
  lockStatus,
  pruneIdemEntries,
  remainingSeconds,
  unlockAtDisplay,
  verifyBudgetScope,
} from "@/domain/certs/verify-lock";
import { recordAction, type RecordActionDeps } from "@/domain/action-log/record";
import {
  loadDocumentNumberFormat as defaultLoadDocumentNumberFormat,
  allocateDocumentNumber,
} from "@/domain/document-numbering";
import { withTimeoutConversion, withTransaction } from "@/lib/db-transaction";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { kstYear } from "@/lib/kst-date";
import { getSignatureStore, type SignatureStore } from "@/lib/storage/signature-store";
import { findUserById } from "@/repositories/users";
import {
  closeEventAllSubmitted,
  countOpenWinners,
  findEventByTokenHash,
  type CertEventRow,
} from "@/repositories/cert-events";
import {
  countRecentMisses,
  countRecentMissesUnlocked,
  findWinnerInEvent,
  listWinnersForIntake,
  lockEventRow,
  lockWinnerInEvent,
  markWinnerSubmitted,
  writeWinnerVerifyState,
  type CertWinnerRow,
  type VerifyIdemEntry,
} from "@/repositories/cert-winners";
import {
  deleteSignatureUploadIntent,
  findSubmissionBySignatureKey,
  findSubmissionForWinner,
  insertSignatureUploadIntent,
  insertSubmission,
  type CertSubmissionRow,
} from "@/repositories/cert-submissions";

// 04.3-02 Task 2 ⑩ — 공개 흐름의 유일한 domain 진입점. can·visible·scopeFor나
// 세션 뷰어 도우미를 import하지 않는다 — 범위는 토큰 해시·행사 id가 좁힌다
// (T-04.3-09). 리포지토리 호출의 viewer 인자는 전부 SYSTEM_VIEWER다.

// 증표 유효 기간(설계 /cso 검토 대상) — 확인 뒤 이 시간 안에만 제출할 수 있다.
export const VERIFY_PROOF_TTL_MINUTES = 30;

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

type ClosedResult = { kind: "closed"; reason: "expired" | "all_submitted" | "manual"; at: string };

export type SelectWinnerResult =
  | { kind: "notFound" }
  | ClosedResult
  | {
      kind: "ok";
      rowId: string;
      maskedName: string;
      // 짧은 잠김이면 잠김 블록, 누적 잠김이면 hardLocked만(숫자 없음). 제출
      // 여부는 싣지 않는다 — 제출한 자리와 안 한 자리의 응답 키 집합이 같다.
      locked?: { limit: number; unlockAtDisplay: string; remainingSeconds: number };
      hardLocked?: true;
    };

export async function selectWinner(token: string, rowId: string, now: Date = new Date()): Promise<SelectWinnerResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };

  const event = await findEventByTokenHash(SYSTEM_VIEWER, sha256Hex(token));
  if (!event) return { kind: "notFound" };
  const state = resolveEventState(event, now);
  if (state.status === "closed") return { kind: "closed", reason: state.reason, at: state.at };

  const winner = await findWinnerInEvent(SYSTEM_VIEWER, event.id, rowId);
  if (!winner || winner.name === null) return { kind: "notFound" };

  const base = { kind: "ok" as const, rowId, maskedName: maskName(normalizeName(winner.name)) };
  const status = lockStatus({ lockedUntil: winner.lockedUntil, hardLockedAt: winner.hardLockedAt, now });
  if (status.kind === "hardLocked") return { ...base, hardLocked: true };
  if (status.kind === "shortLocked") {
    const limit = await getSettingValue(CERT_VERIFY_MAX_ATTEMPTS);
    return {
      ...base,
      locked: { limit, unlockAtDisplay: unlockAtDisplay(status.unlockAt), remainingSeconds: status.remainingSec },
    };
  }
  return base;
}

// ── recheckWinnerLock ───────────────────────────────────────────────────

// 04.3-03 Task 1 ⑤-b — E3 누적 잠김의 복구 길이 부르는 읽기 전용 판정.
// 답은 닫힘(링크 단위 — 어떤 잠김보다 앞선다) · 누적 잠김 · 짧은 잠김 ·
// 열림 넷뿐이다. 개인별 제출 여부 · 셈 · 이름을 싣지 않고 쓰지 않는다.
export type RecheckWinnerLockResult =
  | { kind: "notFound" }
  | ClosedResult
  | { kind: "hardLocked" }
  | { kind: "shortLocked"; unlockAt: string; unlockAtDisplay: string; remainingSec: number; limit: number }
  | { kind: "open" };

export async function recheckWinnerLock(
  token: string,
  winnerId: string,
  now: Date = new Date(),
): Promise<RecheckWinnerLockResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };

  const event = await findEventByTokenHash(SYSTEM_VIEWER, sha256Hex(token));
  if (!event) return { kind: "notFound" };
  const winner = await findWinnerInEvent(SYSTEM_VIEWER, event.id, winnerId);
  if (!winner || winner.name === null) return { kind: "notFound" };

  const state = resolveEventState(event, now);
  if (state.status === "closed") return { kind: "closed", reason: state.reason, at: state.at };

  const status = lockStatus({ lockedUntil: winner.lockedUntil, hardLockedAt: winner.hardLockedAt, now });
  if (status.kind === "shortLocked") {
    return {
      kind: "shortLocked",
      unlockAt: status.unlockAt.toISOString(),
      unlockAtDisplay: unlockAtDisplay(status.unlockAt),
      remainingSec: status.remainingSec,
      limit: await getSettingValue(CERT_VERIFY_MAX_ATTEMPTS),
    };
  }
  return status;
}

// ── verifyLast4 ─────────────────────────────────────────────────────────

type OkPayload = {
  kind: "ok";
  rowId: string;
  prizeLine: string;
  delivery: "onsite" | "parcel";
  consent: { version: string; retentionYears: number };
  // 증표를 발급한 순간 그 자리 행의 version — 04.3-06 제출이 비교한다(Codex #7).
  version: number;
};

export type VerifyLast4Result =
  | { kind: "notFound" }
  | ClosedResult
  | { kind: "throttled" }
  | { kind: "wrong"; remaining: number }
  | { kind: "locked"; limit: number; unlockAtDisplay: string; remainingSeconds: number }
  | { kind: "hardLocked" }
  | { kind: "expiredProof" }
  | { kind: "submitted"; maskedName: string; submittedAt: string }
  | (OkPayload & { proof: string; verifiedUntil: string });

const verifyInputSchema = z.object({
  last4: z.string().regex(/^\d{4}$/),
  idemKey: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
  ip: z.string().max(200).nullable(),
});

// 맵에 둔 응답(r)의 모양 — 개인정보 · 4자리 · 증표 평문 없음. 읽을 때 다시
// 검사해 모양이 어긋난 항목은 재생하지 않는다.
const storedWrongSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wrong"), remaining: z.number() }),
  z.object({ kind: z.literal("locked"), limit: z.number(), unlockAt: z.string() }),
  z.object({ kind: z.literal("hardLocked") }),
]);
type StoredWrong = z.infer<typeof storedWrongSchema>;

const storedOkSchema = z.object({
  kind: z.literal("ok"),
  rowId: z.string(),
  prizeLine: z.string(),
  delivery: z.enum(["onsite", "parcel"]),
  consent: z.object({ version: z.string(), retentionYears: z.number() }),
  version: z.number(),
});

function lockedResponse(limit: number, until: Date, now: Date): VerifyLast4Result {
  return { kind: "locked", limit, unlockAtDisplay: unlockAtDisplay(until), remainingSeconds: remainingSeconds(until, now) };
}

function submittedResponse(winner: CertWinnerRow): VerifyLast4Result {
  return {
    kind: "submitted",
    maskedName: maskName(normalizeName(winner.name ?? "")),
    submittedAt: (winner.submittedAt ?? new Date()).toISOString(),
  };
}

// 같은 키의 재전송 — 쓰기 없이 그 항목으로 응답한다(셈 · 맵 · 증표 불변).
function replayEntry(entry: VerifyIdemEntry, winner: CertWinnerRow, maxAttempts: number, now: Date): VerifyLast4Result {
  if (entry.o === "wrong") {
    const parsed = storedWrongSchema.safeParse(entry.r);
    if (!parsed.success) return { kind: "expiredProof" };
    const r = parsed.data;
    if (r.kind === "wrong") return { kind: "wrong", remaining: r.remaining };
    // 해제 시각은 저장된 절대 시각, 남은 초만 지금 다시 계산한다.
    if (r.kind === "locked") return lockedResponse(r.limit, new Date(r.unlockAt), now);
    // 누적 잠김을 건 틀림 — 응답 순간 상태로 붙인다. 여기 왔으면 지금은
    // 누적 잠김이 아니다(담당자가 풀었다) → 지금 셈으로 만든 wrong.
    return { kind: "wrong", remaining: Math.max(0, maxAttempts - winner.failedAttempts) };
  }
  // 맞음 항목 — 그새 제출됐으면 E6-a(키 주인은 이미 맞힌 사람이다).
  if (winner.submittedAt) return submittedResponse(winner);
  const parsed = storedOkSchema.safeParse(entry.r);
  if (!parsed.success) return { kind: "expiredProof" };
  let proof: string;
  try {
    proof = decrypt(entry.p);
  } catch {
    // 재생 불가(키 회전 등, Codex B-5) — 새로 판정 · 발급하지 않는다.
    return { kind: "expiredProof" };
  }
  return { ...parsed.data, proof, verifiedUntil: entry.until };
}

export async function verifyLast4(
  token: string,
  rowId: string,
  last4: string,
  idemKey: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<VerifyLast4Result> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  const input = verifyInputSchema.parse({ last4, idemKey, ip });

  const event = await findEventByTokenHash(SYSTEM_VIEWER, sha256Hex(token));
  if (!event) return { kind: "notFound" };

  // (a0) 설정은 행사 행을 잠그기 전에 값으로 읽는다(E3-09) — 잠근 콜백 안의
  // DB 호출은 전부 tx다.
  const maxAttempts = await getSettingValue(CERT_VERIFY_MAX_ATTEMPTS);
  const lockMinutes = await getSettingValue(CERT_VERIFY_LOCK_MINUTES);
  const retentionYears = await getSettingValue(CERT_RETENTION_YEARS);
  const ipHash = certIpHash(env.BETTER_AUTH_SECRET, event.id, input.ip);
  const since = new Date(now.getTime() - VERIFY_RATE_WINDOW_MINUTES * 60 * 1000);
  const keyHash = sha256Hex(input.idemKey);

  // (b0) 잠금 전 빠른 판정(M2) — 셈을 올리지 않는 요청(닫힌 행사 · 누적 잠긴 자리
  // · 짧은 잠김 자리)도 행사 행 대기열에 서지 않는다. 순서는 잠근 뒤와 같다:
  // 닫힘 → 누적 잠김 → (같은 키 재생이 있으면 잠근 뒤로) → 짧은 잠김. 정본은 잠근 뒤 (c)~(e)다.
  const quickState = resolveEventState(event, now);
  if (quickState.status === "closed") return { kind: "closed", reason: quickState.reason, at: quickState.at };
  const quickWinner = await findWinnerInEvent(SYSTEM_VIEWER, event.id, rowId);
  if (quickWinner && quickWinner.name !== null) {
    if (quickWinner.hardLockedAt) return { kind: "hardLocked" };
    const hasReplay = Boolean(pruneIdemEntries(quickWinner.verifyIdemOutcome ?? {}, now)[keyHash]);
    if (!hasReplay && quickWinner.lockedUntil && now < quickWinner.lockedUntil) {
      return lockedResponse(maxAttempts, quickWinner.lockedUntil, now);
    }
  }

  // (b1) 잠금 전 빠른 판정(AX-P2 · T-04.3-113) — 이미 한도를 넘은 요청은 행사
  // 행 FOR UPDATE 대기열에 서지 않고(풀 연결을 붙들지 않는다) 곧바로
  // throttled다. 잠금 없는 짧은 읽기 한 번이고, 한도의 정본은 잠근 뒤 (f)다.
  const quickCounts = await withTimeoutConversion(() =>
    countRecentMissesUnlocked(SYSTEM_VIEWER, { eventId: event.id, ipHash, since }),
  );
  const quickScope = verifyBudgetScope(quickCounts);
  if (quickScope) {
    log.warn("cert.verify_throttled", { scope: quickScope, eventId: event.id });
    return { kind: "throttled" };
  }

  return withTransaction(async (tx): Promise<VerifyLast4Result> => {
    // (c) 행사 행 → 자리 행. 열림 판정은 잠근 뒤 읽은 값으로 한다.
    const lockedEvent = await lockEventRow(SYSTEM_VIEWER, event.id, tx);
    if (!lockedEvent) return { kind: "notFound" };
    const state = resolveEventState(lockedEvent, now);
    if (state.status === "closed") return { kind: "closed", reason: state.reason, at: state.at };

    const winner = await lockWinnerInEvent(SYSTEM_VIEWER, event.id, rowId, tx);
    if (!winner || winner.name === null || winner.phone === null) return { kind: "notFound" };

    // (d0) 지금의 누적 잠김이 어떤 재생보다 앞선다 — 판정 · 셈 · 쓰기 없음.
    if (winner.hardLockedAt) return { kind: "hardLocked" };

    // (d) 재생 — 60분 지난 항목은 읽을 때도 없는 것으로 본다.
    const entries = pruneIdemEntries(winner.verifyIdemOutcome ?? {}, now);
    const replay = entries[keyHash];
    if (replay) return replayEntry(replay, winner, maxAttempts, now);

    // (e) 짧은 잠김 중 — 세지 않고 맵에 넣지 않는다(제출 판정보다 먼저).
    if (winner.lockedUntil && now < winner.lockedUntil) return lockedResponse(maxAttempts, winner.lockedUntil, now);

    // (f) 속도 제한 — 잠근 뒤 다시 센 값이 정본이다(동시 요청이 넘지 못한다).
    const counts = await countRecentMisses(SYSTEM_VIEWER, { eventId: event.id, ipHash, since }, tx);
    if (eventBudgetExceeded(counts)) log.warn("cert.verify_event_budget_exceeded", { eventId: event.id });
    const scope = verifyBudgetScope(counts);
    if (scope) {
      log.warn("cert.verify_throttled", { scope, eventId: event.id });
      return { kind: "throttled" };
    }

    // (g) 그 한 사람과만 대조한다.
    const matched = winner.phone.slice(-4) === input.last4;
    if (matched && winner.submittedAt) return submittedResponse(winner);

    const decision = evaluateVerifyAttempt({
      failedAttempts: winner.failedAttempts,
      lockedUntil: winner.lockedUntil,
      cumulativeFailed: winner.cumulativeFailedAttempts,
      hardLockedAt: winner.hardLockedAt,
      now,
      maxAttempts,
      lockMinutes,
      matched,
    });
    const at = now.toISOString();

    if (decision.outcome === "ok") {
      const proof = randomBytes(32).toString("base64url");
      const verifiedUntil = new Date(now.getTime() + VERIFY_PROOF_TTL_MINUTES * 60 * 1000);
      const payload: OkPayload = {
        kind: "ok",
        rowId,
        prizeLine: `${winner.prizeName} ${winner.quantity}개`,
        delivery: winner.delivery as "onsite" | "parcel",
        consent: { version: CERT_CONSENT_VERSION, retentionYears },
        version: winner.version,
      };
      const entry: VerifyIdemEntry = { o: "ok", r: payload, p: encrypt(proof), until: verifiedUntil.toISOString(), ip: ipHash, at };
      await writeWinnerVerifyState(
        SYSTEM_VIEWER,
        winner.id,
        {
          failedAttempts: 0,
          lockedUntil: null,
          cumulativeFailedAttempts: decision.cumulativeFailed,
          hardLockedAt: null,
          verifyIdemOutcome: pruneIdemEntries({ ...entries, [keyHash]: entry }, now),
          verifyProofHash: sha256Hex(proof),
          verifiedUntil,
          offeredConsentVersion: CERT_CONSENT_VERSION,
          offeredRetentionYears: retentionYears,
        },
        tx,
      );
      return { ...payload, proof, verifiedUntil: verifiedUntil.toISOString() };
    }

    // 여기서부터는 상태를 바꾼 틀림(짧은 잠김 중 · 누적 잠김 중은 위에서 걸렀다).
    if (!("failedAttempts" in decision)) return { kind: "hardLocked" };
    let stored: StoredWrong;
    let response: VerifyLast4Result;
    let lockedUntil: Date | null = null;
    let hardLockedAt: Date | null = null;
    if (decision.outcome === "hardLocked") {
      stored = { kind: "hardLocked" };
      response = { kind: "hardLocked" };
      lockedUntil = winner.lockedUntil; // 누적 잠김은 짧은 잠김 시각을 쓰지 않는다.
      hardLockedAt = decision.hardLockedAt;
    } else if (decision.outcome === "locked") {
      stored = { kind: "locked", limit: maxAttempts, unlockAt: decision.lockedUntil.toISOString() };
      response = lockedResponse(maxAttempts, decision.lockedUntil, now);
      lockedUntil = decision.lockedUntil;
    } else {
      stored = { kind: "wrong", remaining: decision.remaining };
      response = { kind: "wrong", remaining: decision.remaining };
    }
    const entry: VerifyIdemEntry = { o: "wrong", r: stored, ip: ipHash, at };
    await writeWinnerVerifyState(
      SYSTEM_VIEWER,
      winner.id,
      {
        failedAttempts: decision.failedAttempts,
        lockedUntil,
        cumulativeFailedAttempts: decision.cumulativeFailed,
        hardLockedAt,
        verifyIdemOutcome: pruneIdemEntries({ ...entries, [keyHash]: entry }, now),
      },
      tx,
    );
    return response;
  });
}

// ── submitCertificate ───────────────────────────────────────────────────

// 04.3-06 — 봉투(클라이언트가 만든 값 · 확인 응답에서 받은 값)는 모양이 틀리면
// 던진다(액션 스키마가 먼저 거른다). 사람이 적은 칸은 (d)에서 칸 오류로 판정한다.
const submitEnvelopeSchema = z.object({
  rowId: z.string().min(1),
  proof: z.string().min(1),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
  winnerVersion: z.number().int().min(1),
  consentVersion: z.string().min(1),
  retentionYears: z.number().int().min(1),
  rrnRecheckConfirmed: z.boolean().optional().default(false),
});

export type SubmitCertificateInput = z.input<typeof submitEnvelopeSchema> & {
  name: string;
  rrnFront6: string;
  rrnBack7: string;
  phone: string;
  address?: string;
  consent: boolean;
  signaturePngBase64: string;
};

type SavedResult = {
  kind: "saved";
  name: string;
  submittedAt: string;
  prizeLine: string;
  delivery: "onsite" | "parcel";
  managerName: string;
  contactPhone: string;
};

export type SubmitCertificateResult =
  | { kind: "notFound" }
  | ClosedResult
  | { kind: "expiredProof" }
  | { kind: "invalid"; fields: string[] }
  | { kind: "rrnRecheck" }
  | { kind: "alreadySubmitted"; maskedName: string; submittedAt: string }
  | SavedResult;

export type SubmitCertificateDeps = {
  loadDocumentNumberFormat: typeof defaultLoadDocumentNumberFormat;
  signatureStore: SignatureStore;
  appendActionLog: RecordActionDeps["appendActionLog"];
  // 요청 도착 시각 — (a)에서 한 번만 부른다(증표 만료 · 행사 기한 판정).
  now: () => Date;
  // 테스트가 커밋 전 · 뒤 예외를 끼운다(커밋 결과 불명 갈래).
  withTransaction: typeof withTransaction;
  findSubmissionBySignatureKey: typeof findSubmissionBySignatureKey;
};

// 저장 트랜잭션의 판정 — stored만 이 요청이 쓴 것이다.
type LockedDecision =
  | { kind: "stored"; row: CertSubmissionRow }
  | { kind: "replay"; row: CertSubmissionRow }
  | ClosedResult
  | { kind: "alreadySubmitted"; maskedName: string; submittedAt: string }
  | { kind: "expiredProof" }
  | { kind: "notFound" };

function proofStillValid(
  row: CertWinnerRow,
  envelope: z.infer<typeof submitEnvelopeSchema>,
  proofHash: string,
  now: Date,
): boolean {
  return (
    row.verifyProofHash !== null &&
    row.verifyProofHash === proofHash &&
    row.verifiedUntil !== null &&
    now < row.verifiedUntil &&
    envelope.winnerVersion === row.version &&
    envelope.consentVersion === row.offeredConsentVersion &&
    envelope.retentionYears === row.offeredRetentionYears
  );
}

// 사람이 적은 칸 — E4 시각 순서로 모은다(name · rrn · address · phone · consent · signature).
function checkFields(
  input: SubmitCertificateInput,
  delivery: string,
  now: Date,
): { fields: string[]; name: string; phone: string; address: string | null; png: Buffer; rrnMismatch: boolean } {
  const fields: string[] = [];
  const name = typeof input.name === "string" ? normalizeName(input.name) : "";
  if (name.length === 0 || name.length > 40) fields.push("name");
  const rrn = validateRrn(String(input.rrnFront6 ?? ""), String(input.rrnBack7 ?? ""), now);
  if (!rrn.ok) fields.push("rrn");
  const address = typeof input.address === "string" ? input.address.trim() : "";
  if (delivery === "parcel" && (address.length === 0 || address.length > 200)) fields.push("address");
  const phone = typeof input.phone === "string" ? normalizePhone(input.phone) : null;
  if (phone === null) fields.push("phone");
  if (input.consent !== true) fields.push("consent");
  const png = Buffer.from(typeof input.signaturePngBase64 === "string" ? input.signaturePngBase64 : "", "base64");
  if (!inspectSignaturePng(png).ok) fields.push("signature");
  return {
    fields,
    name,
    phone: phone ?? "",
    address: delivery === "parcel" ? address : null,
    png,
    rrnMismatch: rrn.ok && rrn.checkDigit === "mismatch",
  };
}

async function savedResult(
  row: Pick<CertSubmissionRow, "name" | "submittedAt">,
  winner: CertWinnerRow,
  event: CertEventRow,
): Promise<SavedResult> {
  return {
    kind: "saved",
    name: row.name ?? "",
    submittedAt: row.submittedAt.toISOString(),
    prizeLine: `${winner.prizeName} ${winner.quantity}개`,
    delivery: winner.delivery as "onsite" | "parcel",
    managerName: await managerNameFor(event),
    contactPhone: event.contactPhone,
  };
}

export async function submitCertificate(
  token: string,
  input: SubmitCertificateInput,
  deps: Partial<SubmitCertificateDeps> = {},
): Promise<SubmitCertificateResult> {
  // (a) 플래그 · 토큰 → 행사 → 자리. 요청 도착 시각은 여기서 한 번만 잡는다 —
  // 잠금을 기다린 시간만큼 증표 수명이 늘거나 기한 판정이 바뀌지 않는다(X-10 M-2).
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  const now = deps.now?.() ?? new Date();

  const event = await findEventByTokenHash(SYSTEM_VIEWER, sha256Hex(token));
  if (!event) return { kind: "notFound" };
  const envelope = submitEnvelopeSchema.parse(input);
  const winner = await findWinnerInEvent(SYSTEM_VIEWER, event.id, envelope.rowId);
  if (!winner || winner.name === null) return { kind: "notFound" };
  const keyHash = sha256Hex(envelope.idempotencyKey);

  // (b) 같은 키 재생 — 증표 전에 허용되는 유일한 판정이다(닫힘보다 먼저: 마지막
  // 자리 재전송이 E6-b로 빠지지 않는다). 키가 다르면 제출 여부를 말하지 않는다.
  const existing = await findSubmissionForWinner(SYSTEM_VIEWER, event.id, winner.id);
  if (existing && existing.idempotencyKeyHash === keyHash) return savedResult(existing, winner, event);

  // (c) 닫힘(공개 상태) → 증표 · version · 동의 묶음. 제출된 자리는 증표 해시가
  // 비워져 있어 다른 키의 요청은 미제출 자리의 틀린 증표와 같은 expiredProof다.
  const state = resolveEventState(event, now);
  if (state.status === "closed") return { kind: "closed", reason: state.reason, at: state.at };
  const proofHash = sha256Hex(envelope.proof);
  if (!proofStillValid(winner, envelope, proofHash, now)) return { kind: "expiredProof" };

  // (d) 칸 검사 → 주민등록번호 되묻기(한 번). 상태를 바꾸지 않은 판정은 키에 묶지 않는다.
  const checked = checkFields(input, winner.delivery, now);
  if (checked.fields.length > 0) return { kind: "invalid", fields: checked.fields };
  if (checked.rrnMismatch && !envelope.rrnRecheckConfirmed) return { kind: "rrnRecheck" };
  const rrnPlain = `${input.rrnFront6}${input.rrnBack7}`;
  const objectKey = `signatures/${event.id}/${winner.id}-${randomUUID()}.png`;

  // 업로드 전에 읽기(E3-27) — 서식 · 로그 스위치는 의도 행 · put보다 먼저. 설정은
  // 트랜잭션을 열기 전에 읽는다(잠금을 쥔 채 풀의 두 번째 연결을 잡지 않는다).
  const loadDocumentNumberFormat = deps.loadDocumentNumberFormat ?? defaultLoadDocumentNumberFormat;
  const format = await loadDocumentNumberFormat("cert");
  let submitLogEnabled = true;
  try {
    const optionalTypes = await getSettingValue(ACTION_LOG_OPTIONAL_TYPES);
    submitLogEnabled = optionalTypes.includes("document_submit");
  } catch {
    submitLogEnabled = true; // fail-open — record.ts의 defaultIsActionTypeEnabled와 같은 규칙
  }

  // (e) 규약 C3 — 저장소를 먼저 확정(드라이버 없음은 여기서 던진다) → 의도 행을
  // 자기 문장으로 커밋 → put. put이 실패하면 지우기가 성공했을 때만 의도 행을 지운다.
  const signatureStore = deps.signatureStore ?? getSignatureStore();
  await insertSignatureUploadIntent(SYSTEM_VIEWER, objectKey);
  try {
    await signatureStore.put(objectKey, checked.png);
  } catch (putError) {
    try {
      await signatureStore.delete(objectKey);
      await deleteSignatureUploadIntent(SYSTEM_VIEWER, objectKey);
    } catch {
      // 지우기 실패 — 의도 행을 남긴다(04.3-12가 24시간 뒤 치운다).
    }
    throw putError;
  }

  // (f) 저장 트랜잭션 — 행사 행 → 자리 행 순서로 잠근 뒤 잠긴 값으로 다시 판정한다.
  // 순서가 계약이다: 같은 키 재생 → 닫힘 → 다른 키 제출 → 증표 · version · 동의.
  let decision: LockedDecision;
  try {
    decision = await (deps.withTransaction ?? withTransaction)(async (tx): Promise<LockedDecision> => {
      const lockedEvent = await lockEventRow(SYSTEM_VIEWER, event.id, tx);
      if (!lockedEvent) return { kind: "notFound" };
      const locked = await lockWinnerInEvent(SYSTEM_VIEWER, event.id, winner.id, tx);
      if (!locked || locked.name === null) return { kind: "notFound" };

      if (locked.submittedAt) {
        const stored = await findSubmissionForWinner(SYSTEM_VIEWER, event.id, winner.id, tx);
        if (stored && stored.idempotencyKeyHash === keyHash) return { kind: "replay", row: stored };
      }
      const lockedState = resolveEventState(lockedEvent, now);
      if (lockedState.status === "closed") return { kind: "closed", reason: lockedState.reason, at: lockedState.at };
      if (locked.submittedAt) {
        return {
          kind: "alreadySubmitted",
          maskedName: maskName(normalizeName(locked.name)),
          submittedAt: locked.submittedAt.toISOString(),
        };
      }
      if (!proofStillValid(locked, envelope, proofHash, now)) return { kind: "expiredProof" };

      const updatedRows = await markWinnerSubmitted(SYSTEM_VIEWER, winner.id, now, tx);
      if (updatedRows === 0) return { kind: "expiredProof" };
      const { number: certNo } = await allocateDocumentNumber(
        SYSTEM_VIEWER,
        { counterKey: "cert", year: kstYear(now), format },
        tx,
      );
      const row = await insertSubmission(
        SYSTEM_VIEWER,
        {
          winnerId: winner.id,
          eventId: event.id,
          certNo,
          name: checked.name,
          rrnEncrypted: encrypt(rrnPlain),
          rrnMasked: maskRrn(rrnPlain),
          phone: checked.phone,
          address: checked.address,
          consentAt: now,
          consentVersion: envelope.consentVersion,
          retentionYears: envelope.retentionYears,
          signatureKey: objectKey,
          idempotencyKeyHash: keyHash,
          submittedAt: now,
        },
        tx,
      );
      await deleteSignatureUploadIntent(SYSTEM_VIEWER, objectKey, tx);

      // D-1102 — 마지막 미제출 자리면 같은 트랜잭션에서 링크를 닫는다. 행사 행을
      // 잠갔으므로 마지막 두 자리가 동시에 와도 닫힘은 한 번이다.
      if ((await countOpenWinners(SYSTEM_VIEWER, event.id, tx)) === 0) {
        await closeEventAllSubmitted(SYSTEM_VIEWER, event.id, now, tx);
      }

      // (h) 제출 로그도 같은 트랜잭션 — 실패하면 제출 전체가 롤백된다(최종 리뷰 B5).
      await recordAction(
        SYSTEM_VIEWER,
        { actionType: "document_submit", entity: "cert_submission", entityId: row.id, detail: { eventId: event.id } },
        {
          tx,
          isActionTypeEnabled: () => Promise.resolve(submitLogEnabled),
          ...(deps.appendActionLog ? { appendActionLog: deps.appendActionLog } : {}),
        },
      );
      return { kind: "stored", row };
    });
  } catch (error) {
    // (g) 예외 갈래 — 커밋 결과 불명. commit 응답만 잃었을 수 있으므로 같은 잠금
    // 순서로 확정된 상태를 읽어 이 객체를 가리키는 제출 줄이 있으면 saved를 돌려준다.
    let committed: CertSubmissionRow | null;
    try {
      committed = await (deps.withTransaction ?? withTransaction)(async (tx) => {
        await lockEventRow(SYSTEM_VIEWER, event.id, tx);
        await lockWinnerInEvent(SYSTEM_VIEWER, event.id, winner.id, tx);
        return (deps.findSubmissionBySignatureKey ?? findSubmissionBySignatureKey)(
          SYSTEM_VIEWER,
          event.id,
          objectKey,
          tx,
        );
      });
    } catch {
      // 조회마저 실패 — 아무것도 지우지 않는다(커밋됐으면 줄이 객체를 가리키고,
      // 롤백됐으면 의도 행이 남아 04.3-12가 치운다).
      throw error;
    }
    if (committed) return savedResult(committed, winner, event);
    // 롤백됐다 — 객체만 지운다. 의도 행은 저장 트랜잭션 안에서만 지워지므로 남은
    // 행이 「커밋되지 않음」의 기록이다(04.3-12가 24시간 뒤 치운다).
    try {
      await signatureStore.delete(objectKey);
    } catch {
      // 지우기 실패 — 의도 행이 남아 있다.
    }
    throw error;
  }

  if (decision.kind === "stored") return savedResult(decision.row, winner, event);

  // (g) 판정 갈래 — 트랜잭션은 확정적으로 끝났고 이 객체는 어느 제출 줄도 가리키지
  // 않는다. 지우기가 성공(404 포함)했을 때만 의도 행을 지운다.
  try {
    await signatureStore.delete(objectKey);
    await deleteSignatureUploadIntent(SYSTEM_VIEWER, objectKey);
  } catch {
    // 지우기 실패 — 의도 행을 남긴다.
  }
  if (decision.kind === "replay") return savedResult(decision.row, winner, event);
  return decision;
}
