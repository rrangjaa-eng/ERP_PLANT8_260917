import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { isCertFeatureEnabled } from "@/domain/certs/feature";
import { maskRrn, normalizeName, normalizePhone } from "@/domain/certs/format";
import { validateRrn } from "@/domain/certs/rrn";
import { inspectSignaturePng } from "@/domain/certs/signature-png";
import { CERT_CONSENT_VERSION } from "@/domain/certs/consent";
import { certPrizeListed } from "@/domain/certs/prize-value";
import {
  SUBMIT_RATE_WINDOW_MINUTES,
  certIpHash,
  submitBudgetScope,
  submitBudgets,
  type SubmitBudgets,
} from "@/domain/certs/submit-limit";
import { getSettingValue } from "@/domain/settings/registry";
import { ACTION_LOG_OPTIONAL_TYPES, CERT_RETENTION_YEARS } from "@/domain/settings/keys";
import { recordAction, type RecordActionDeps } from "@/domain/action-log/record";
import {
  loadDocumentNumberFormat as defaultLoadDocumentNumberFormat,
  allocateDocumentNumber,
} from "@/domain/document-numbering";
import { withTimeoutConversion, withTransaction } from "@/lib/db-transaction";
import type { DbOrTx } from "@/repositories/document-counters";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { kstDayStart, kstToday, kstYear } from "@/lib/kst-date";
import { getSignatureStore, type SignatureStore } from "@/lib/storage/signature-store";
import { findUserById } from "@/repositories/users";
import { findEventByTokenHash, lockEventRow, type CertEventRow } from "@/repositories/cert-events";
import { listPrizesForEvent, type CertPrizeRow } from "@/repositories/cert-prizes";
import { insertEventNotifications as defaultInsertEventNotifications } from "@/repositories/notifications";
import { listActiveUserIdsAllowed } from "@/repositories/permissions";
import {
  countActiveSubmissionsByEvent,
  countRecentSubmissionsByEvent,
  countRecentSubmissionsByIp,
  deleteSignatureUploadIntent,
  findSubmissionByIdempotency,
  findSubmissionBySignatureKey,
  insertSignatureUploadIntent,
  insertSubmission,
  type CertSubmissionRow,
} from "@/repositories/cert-submissions";

// 04.3-02 Task 2 ⑩ · 04.3-15 — 공개 흐름의 유일한 domain 진입점. can·visible·scopeFor나
// 세션 뷰어 도우미를 import하지 않는다 — 범위는 토큰 해시·행사 id가 좁힌다
// (T-04.3-09). 리포지토리 호출의 viewer 인자는 전부 SYSTEM_VIEWER다.
// 04.3-15(5909578685) — 명단이 없다. 수령자는 경품 목록(1개 가액 > 50,000만)에서 받은 경품을 고르고
// 경품 id로 제출한다. 가액 · 판정 · 제출 수는 결과에 옮기지 않는다(5905714131) — 가액 칸 이름은
// certPrizeListed( 호출 줄에만 나온다(test/unit/certs/public-route-boundary.test.ts).

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function managerNameFor(event: Pick<CertEventRow, "createdBy">): Promise<string> {
  if (!event.createdBy) return "";
  const user = await findUserById(SYSTEM_VIEWER, event.createdBy);
  return user?.name ?? "";
}

type ClosedReason = "expired" | "manual";

type EventState = { status: "open" } | { status: "notYetOpen" } | { status: "closed"; reason: ClosedReason; at: string };

// 닫힘이 먼저(담당자가 닫음 · 기한 — 마감이 없으면 기한으로 닫히지 않는다), 그다음 링크 열림 시작
// = 당첨일 00:00 KST(E8 b).
function resolveEventState(event: CertEventRow, now: Date): EventState {
  if (event.closedAt) return { status: "closed", reason: "manual", at: event.closedAt.toISOString() };
  if (event.expiresAt && now >= event.expiresAt) {
    return { status: "closed", reason: "expired", at: event.expiresAt.toISOString() };
  }
  if (now < kstDayStart(event.wonOn)) return { status: "notYetOpen" };
  return { status: "open" };
}

// 수령자에게 가는 경품 — 불투명 id · 경품명 · 전달 세 칸뿐이다.
export type PublicPrize = { id: string; name: string; delivery: "onsite" | "parcel" };
export type IntakeTerms = { consentVersion: string; retentionYears: number };

function deliveryOf(prize: Pick<CertPrizeRow, "delivery">): "onsite" | "parcel" {
  return prize.delivery === "parcel" ? "parcel" : "onsite";
}

function listedPrizes(prizes: CertPrizeRow[]): CertPrizeRow[] {
  return prizes.filter((prize) => certPrizeListed(prize.unitValueKrw));
}

function publicPrizes(prizes: CertPrizeRow[]): PublicPrize[] {
  return listedPrizes(prizes).map((prize) => ({ id: prize.id, name: prize.name, delivery: deliveryOf(prize) }));
}

// W = 목록 경품의 당첨 수 합(설계 /cso E10). 목록이 비면 null(한도는 W 없음 값).
function winnerTotal(prizes: CertPrizeRow[]): number | null {
  const listed = listedPrizes(prizes);
  return listed.length === 0 ? null : listed.reduce((sum, prize) => sum + prize.winnerCount, 0);
}

async function currentTerms(): Promise<IntakeTerms> {
  return { consentVersion: CERT_CONSENT_VERSION, retentionYears: await getSettingValue(CERT_RETENTION_YEARS) };
}

// ── loadIntake ──────────────────────────────────────────────────────────

type PublicEventHead = { eventName: string; wonOn: string; managerName: string; contactPhone: string };

export type LoadIntakeResult =
  | { kind: "notFound" }
  | { kind: "closed"; reason: ClosedReason; at: string; managerName: string; contactPhone: string }
  | ({ kind: "notYetOpen" } & PublicEventHead)
  | ({ kind: "open"; prizes: PublicPrize[]; terms: IntakeTerms } & PublicEventHead);

export async function loadIntake(token: string, now: Date = new Date()): Promise<LoadIntakeResult> {
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };

  // 신청됨(토큰 없음) 행사는 해시로 찾을 수 없어 저절로 notFound다.
  const event = await findEventByTokenHash(SYSTEM_VIEWER, sha256Hex(token));
  if (!event) return { kind: "notFound" };

  const managerName = await managerNameFor(event);
  const state = resolveEventState(event, now);
  if (state.status === "closed") {
    return { kind: "closed", reason: state.reason, at: state.at, managerName, contactPhone: event.contactPhone };
  }
  const head: PublicEventHead = { eventName: event.name, wonOn: event.wonOn, managerName, contactPhone: event.contactPhone };
  if (state.status === "notYetOpen") return { kind: "notYetOpen", ...head };

  const prizes = await listPrizesForEvent(SYSTEM_VIEWER, event.id);
  return { kind: "open", ...head, prizes: publicPrizes(prizes), terms: await currentTerms() };
}

// ── submitCertificate ───────────────────────────────────────────────────

// 봉투(페이지가 준 값 · 클라이언트가 만든 값)는 모양이 틀리면 던진다(액션 스키마가 먼저 거른다).
// 사람이 적은 칸은 (g)에서 칸 오류로 판정한다.
const submitEnvelopeSchema = z.object({
  prizeId: z.uuid(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
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

type ClosedResult = { kind: "closed"; reason: ClosedReason; at: string };

export type SubmitCertificateResult =
  | { kind: "notFound" }
  | ClosedResult
  | ({ kind: "notYetOpen" } & PublicEventHead)
  | { kind: "prizeGone"; prizes: PublicPrize[] }
  | { kind: "termsChanged"; terms: IntakeTerms }
  | { kind: "throttled" }
  | { kind: "invalid"; fields: string[] }
  | { kind: "rrnRecheck" }
  | SavedResult;

export type SubmitCertificateDeps = {
  loadDocumentNumberFormat: typeof defaultLoadDocumentNumberFormat;
  signatureStore: SignatureStore;
  appendActionLog: RecordActionDeps["appendActionLog"];
  // 요청 도착 시각 — (a)에서 한 번만 부른다(열림 · 기한 판정 · 속도 제한 창).
  now: () => Date;
  // 테스트가 커밋 전 · 뒤 예외를 끼운다(커밋 결과 불명 갈래).
  withTransaction: typeof withTransaction;
  findSubmissionBySignatureKey: typeof findSubmissionBySignatureKey;
  // 테스트가 제출 한도 알림 INSERT 실패를 끼운다(같은 트랜잭션 — 제출도 되돌려진다).
  insertEventNotifications: typeof defaultInsertEventNotifications;
};

// 저장 트랜잭션의 판정 — stored만 이 요청이 쓴 것이다.
type LockedDecision =
  | { kind: "stored"; row: CertSubmissionRow; prize: CertPrizeRow }
  | { kind: "replay"; row: CertSubmissionRow }
  | ClosedResult
  | { kind: "notYetOpen" }
  | { kind: "prizeGone"; prizes: PublicPrize[] }
  | { kind: "throttled" }
  | { kind: "notFound" };

// 사람이 적은 칸 — E′4 시각 순서로 모은다(name · rrn · address · phone · consent · signature). 주소는
// 고른 경품이 택배일 때만 받는다 — 현장이면 보낸 값을 버린다(설계 /cso H-1 — 최소 수집).
function checkFields(
  input: SubmitCertificateInput,
  delivery: "onsite" | "parcel",
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
  row: Pick<CertSubmissionRow, "name" | "submittedAt" | "quantity">,
  prize: Pick<CertPrizeRow, "name" | "delivery">,
  event: CertEventRow,
): Promise<SavedResult> {
  return {
    kind: "saved",
    name: row.name ?? "",
    submittedAt: row.submittedAt.toISOString(),
    prizeLine: `${prize.name} ${row.quantity}개`,
    delivery: deliveryOf(prize),
    managerName: await managerNameFor(event),
    contactPhone: event.contactPhone,
  };
}

// 저장된 제출 행(같은 키 재전송)의 saved — 경품명 · 전달은 지금 경품 줄에서 읽는다(외래 키라 늘 있다).
async function savedFromRow(row: CertSubmissionRow, event: CertEventRow, tx?: DbOrTx): Promise<SavedResult> {
  const prizes = await listPrizesForEvent(SYSTEM_VIEWER, event.id, tx);
  const prize = prizes.find((p) => p.id === row.prizeId) ?? { name: "", delivery: "onsite" };
  return savedResult(row, prize, event);
}

// 창 안 IP · 행사 셈을 한도와 비교한다. 막히면 로그 한 줄(IP 가명 없음)과 throttled. 행사 창 셈 · 한도는 잠근 뒤
// 제출 한도 알림(04.3-10)이 다시 쓴다.
async function throttleScope(
  input: { eventId: string; ipHash: string; since: Date; prizes: CertPrizeRow[] },
  tx?: DbOrTx,
): Promise<{ scope: "event" | "ip" | null; eventCount: number; budgets: SubmitBudgets }> {
  const [ip, event] = await Promise.all([
    countRecentSubmissionsByIp(SYSTEM_VIEWER, { eventId: input.eventId, ipHash: input.ipHash, since: input.since }, tx),
    countRecentSubmissionsByEvent(SYSTEM_VIEWER, { eventId: input.eventId, since: input.since }, tx),
  ]);
  const budgets = submitBudgets(winnerTotal(input.prizes));
  const scope = submitBudgetScope({ ip, event }, budgets);
  if (scope) log.warn("cert.submit_throttled", { scope, eventId: input.eventId });
  return { scope, eventCount: event, budgets };
}

// 04.3-10(새 흐름 설계 /cso E10 · T-04.3-428) — 이번 저장으로 행사 15분 창 셈이 행사 한도와 같아졌거나 누적(대조 제외 뺀)
// 제출이 알림 임계에 처음 닿았으면, 받는 사람(certs.qr 쓰기 ∧ certs.events 보기 · 보관 안 됨)마다 알림 한 행을 같은 tx에.
// 중복 키(cert_submit_limit · cert_event · 행사 id · 받는 사람 · 회차 1)라 행사당 한 번. 받는 사람은 그때만 같은 tx로
// 읽는다(E27). 권한 판정이 아니라 받는 사람 조회다. 문장에 가액 · 수령자가 없다. 누적은 알림만 — 제출을 막지 않는다.
async function alertSubmitLimit(
  input: { event: CertEventRow; windowCount: number; budgets: SubmitBudgets; now: Date },
  tx: DbOrTx,
  insert: typeof defaultInsertEventNotifications,
): Promise<void> {
  const reached =
    input.windowCount === input.budgets.event ||
    (await countActiveSubmissionsByEvent(SYSTEM_VIEWER, input.event.id, tx)) === input.budgets.alertTotal;
  if (!reached) return;
  const recipients = await listActiveUserIdsAllowed(
    SYSTEM_VIEWER,
    [
      { menu: "certs.qr", action: "write" },
      { menu: "certs.events", action: "view" },
    ],
    tx,
    // 행동할 수 있는 사람만 — 링크를 닫는 경품 화면은 cert_prize.value가 보이는 사람의 것이다(W5 a · 5928674957).
    ["cert_prize.value"],
  );
  await insert(
    SYSTEM_VIEWER,
    recipients.map((recipientId) => ({
      conditionKind: "cert_submit_limit",
      entity: "cert_event",
      entityId: input.event.id,
      recipientId,
      round: 1,
      referenceDate: kstToday(input.now),
      message: `제출 한도 도달 · ${input.event.name}`,
    })),
    tx,
  );
}

export async function submitCertificate(
  token: string,
  input: SubmitCertificateInput,
  ip: string | null,
  deps: Partial<SubmitCertificateDeps> = {},
): Promise<SubmitCertificateResult> {
  // (a) 게이트 · 요청 도착 시각 한 번 → 토큰 해시로 행사. 잠금을 기다린 시간만큼 판정이 바뀌지 않는다.
  if (!(await isCertFeatureEnabled())) return { kind: "notFound" };
  const now = deps.now?.() ?? new Date();

  const event = await findEventByTokenHash(SYSTEM_VIEWER, sha256Hex(token));
  if (!event) return { kind: "notFound" };
  const envelope = submitEnvelopeSchema.parse(input);
  const keyHash = sha256Hex(envelope.idempotencyKey);

  // (b) 같은 키 재전송이면 저장된 행 그대로 — 닫힘 · 목록 변경 · 속도 제한보다 먼저.
  const existing = await findSubmissionByIdempotency(SYSTEM_VIEWER, event.id, keyHash);
  if (existing) return savedFromRow(existing, event);

  // (c) 닫힘 → (c′) 당첨일 00:00 KST 전(업로드 전 — 서명 객체를 만들지 않는다).
  const state = resolveEventState(event, now);
  if (state.status === "closed") return { kind: "closed", reason: state.reason, at: state.at };
  if (state.status === "notYetOpen") {
    return {
      kind: "notYetOpen",
      eventName: event.name,
      wonOn: event.wonOn,
      managerName: await managerNameFor(event),
      contactPhone: event.contactPhone,
    };
  }

  // (d) 고른 경품이 이 행사에 없거나 목록에서 빠졌으면 prizeGone(지금 목록).
  const prizes = await listPrizesForEvent(SYSTEM_VIEWER, event.id);
  const chosen = prizes.find((prize) => prize.id === envelope.prizeId);
  if (!chosen || !certPrizeListed(chosen.unitValueKrw)) return { kind: "prizeGone", prizes: publicPrizes(prizes) };

  // (e) 페이지가 준 안내 판이 지금 판과 다르면 termsChanged(지금 판).
  const terms = await currentTerms();
  if (envelope.consentVersion !== terms.consentVersion || envelope.retentionYears !== terms.retentionYears) {
    return { kind: "termsChanged", terms };
  }

  // (f) 잠금 전 셈(설계 /cso E10) — 한도를 넘은 요청은 업로드 · 잠금 대기 없이 거절한다.
  const ipHash = certIpHash(env.BETTER_AUTH_SECRET, event.id, ip);
  const since = new Date(now.getTime() - SUBMIT_RATE_WINDOW_MINUTES * 60 * 1000);
  if ((await withTimeoutConversion(() => throttleScope({ eventId: event.id, ipHash, since, prizes }))).scope) {
    return { kind: "throttled" };
  }

  // (g) 칸 검사 → 주민등록번호 되묻기(한 번). 상태를 바꾸지 않은 판정은 키에 묶지 않는다.
  const checkedDelivery = deliveryOf(chosen);
  // 낡은 목록 — 현장일 때 열었다가 택배로 바뀐 경품은 주소 칸이 없어 빈 주소로 온다. invalid(address)는 막다른 길이라
  // 지금 목록을 돌려준다(사용자 결정 2026-10-01 · PR #88 5931337199). 클라이언트가 막는 값이라 여기엔 낡은 목록만 닿는다.
  if (checkedDelivery === "parcel" && (typeof input.address !== "string" || input.address.trim().length === 0)) {
    return { kind: "prizeGone", prizes: publicPrizes(prizes) };
  }
  const checked = checkFields(input, checkedDelivery, now);
  if (checked.fields.length > 0) return { kind: "invalid", fields: checked.fields };
  if (checked.rrnMismatch && !envelope.rrnRecheckConfirmed) return { kind: "rrnRecheck" };
  const rrnPlain = `${input.rrnFront6}${input.rrnBack7}`;
  const objectKey = `signatures/${event.id}/${chosen.id}-${randomUUID()}.png`;

  // (h) 업로드 전에 읽기(E3-27) — 서식 · 로그 스위치는 의도 행 · put보다 먼저. 설정은 트랜잭션을 열기 전에
  // 읽는다(잠금을 쥔 채 풀의 두 번째 연결을 잡지 않는다).
  const loadDocumentNumberFormat = deps.loadDocumentNumberFormat ?? defaultLoadDocumentNumberFormat;
  const format = await loadDocumentNumberFormat("cert");
  let submitLogEnabled = true;
  try {
    const optionalTypes = await getSettingValue(ACTION_LOG_OPTIONAL_TYPES);
    submitLogEnabled = optionalTypes.includes("document_submit");
  } catch {
    submitLogEnabled = true; // fail-open — record.ts의 defaultIsActionTypeEnabled와 같은 규칙
  }

  // 규약 C3 — 저장소를 먼저 확정(드라이버 없음은 여기서 던진다) → 의도 행을 자기 문장으로 커밋 → put.
  // put이 실패하면 지우기가 성공했을 때만 의도 행을 지운다.
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

  // (i) 저장 트랜잭션 — 행사 행을 잠근 뒤 잠긴 값으로 다시 판정한다. 순서가 계약이다:
  // 행사 행(null이면 notFound — E13 규약) → 같은 키 → 닫힘 · 열림 → 경품 · 전달 방식(잠근 뒤 읽은 경품 행이 정본 —
  // 경품 쓰기도 같은 잠금을 먼저 잡는다) → 속도 제한 재셈(동시 제출이 한도를 넘지 못한다) → 번호 → 저장.
  let decision: LockedDecision;
  try {
    decision = await (deps.withTransaction ?? withTransaction)(async (tx): Promise<LockedDecision> => {
      const lockedEvent = await lockEventRow(SYSTEM_VIEWER, event.id, tx);
      if (!lockedEvent) return { kind: "notFound" };

      const replay = await findSubmissionByIdempotency(SYSTEM_VIEWER, event.id, keyHash, tx);
      if (replay) return { kind: "replay", row: replay };

      const lockedState = resolveEventState(lockedEvent, now);
      if (lockedState.status === "closed") return { kind: "closed", reason: lockedState.reason, at: lockedState.at };
      if (lockedState.status === "notYetOpen") return { kind: "notYetOpen" };

      const lockedPrizes = await listPrizesForEvent(SYSTEM_VIEWER, event.id, tx);
      const lockedPrize = lockedPrizes.find((prize) => prize.id === envelope.prizeId);
      if (!lockedPrize || !certPrizeListed(lockedPrize.unitValueKrw)) {
        return { kind: "prizeGone", prizes: publicPrizes(lockedPrizes) };
      }
      if (deliveryOf(lockedPrize) !== checkedDelivery) return { kind: "prizeGone", prizes: publicPrizes(lockedPrizes) };

      const limit = await throttleScope({ eventId: event.id, ipHash, since, prizes: lockedPrizes }, tx);
      if (limit.scope) return { kind: "throttled" };

      const { number: certNo } = await allocateDocumentNumber(
        SYSTEM_VIEWER,
        { counterKey: "cert", year: kstYear(now), format },
        tx,
      );
      const row = await insertSubmission(
        SYSTEM_VIEWER,
        {
          eventId: event.id,
          prizeId: lockedPrize.id,
          quantity: 1,
          submitIpHash: ipHash,
          certNo,
          name: checked.name,
          rrnEncrypted: encrypt(rrnPlain),
          rrnMasked: maskRrn(rrnPlain),
          phone: checked.phone,
          address: lockedPrize.delivery === "parcel" ? checked.address : null,
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
      await alertSubmitLimit(
        { event: lockedEvent, windowCount: limit.eventCount + 1, budgets: limit.budgets, now },
        tx,
        deps.insertEventNotifications ?? defaultInsertEventNotifications,
      );

      // 제출 로그도 같은 트랜잭션 — 실패하면 제출 전체가 롤백된다(최종 리뷰 B5).
      await recordAction(
        SYSTEM_VIEWER,
        { actionType: "document_submit", entity: "cert_submission", entityId: row.id, detail: { eventId: event.id } },
        {
          tx,
          isActionTypeEnabled: () => Promise.resolve(submitLogEnabled),
          ...(deps.appendActionLog ? { appendActionLog: deps.appendActionLog } : {}),
        },
      );
      return { kind: "stored", row, prize: lockedPrize };
    });
  } catch (error) {
    // (j) 예외 갈래 — 커밋 결과 불명. commit 응답만 잃었을 수 있으므로 같은 잠금으로 확정된 상태를 읽어
    // 이 객체를 가리키는 제출 줄이 있으면 saved를 돌려준다.
    let committed: CertSubmissionRow | null;
    try {
      committed = await (deps.withTransaction ?? withTransaction)(async (tx) => {
        await lockEventRow(SYSTEM_VIEWER, event.id, tx);
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
    if (committed) return savedFromRow(committed, event);
    // 롤백됐다 — 객체만 지운다. 의도 행은 저장 트랜잭션 안에서만 지워지므로 남은
    // 행이 「커밋되지 않음」의 기록이다(04.3-12가 24시간 뒤 치운다).
    try {
      await signatureStore.delete(objectKey);
    } catch {
      // 지우기 실패 — 의도 행이 남아 있다.
    }
    throw error;
  }

  if (decision.kind === "stored") return savedResult(decision.row, decision.prize, event);

  // 판정 갈래 — 트랜잭션은 확정적으로 끝났고 이 객체는 어느 제출 줄도 가리키지 않는다. 지우기가
  // 성공(404 포함)했을 때만 의도 행을 지운다.
  try {
    await signatureStore.delete(objectKey);
    await deleteSignatureUploadIntent(SYSTEM_VIEWER, objectKey);
  } catch {
    // 지우기 실패 — 의도 행을 남긴다.
  }
  if (decision.kind === "replay") return savedFromRow(decision.row, event);
  if (decision.kind === "notYetOpen") {
    return {
      kind: "notYetOpen",
      eventName: event.name,
      wonOn: event.wonOn,
      managerName: await managerNameFor(event),
      contactPhone: event.contactPhone,
    };
  }
  return decision;
}
