import { recordAction, type RecordActionDeps } from "@/domain/action-log/record";
import { lockEvidenceOwnerForChange, readEvidenceOwner, type EvidenceOwnerPhase, type EvidenceOwnerView } from "@/domain/evidence";
import { getEvidenceRecord, INTAKE_FORBIDDEN } from "@/domain/evidence-records";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { diffKrw, MoneyInputError, normalizeMoneyInput } from "@/domain/money";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { formatKstTime } from "@/domain/holidays/business-day";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { findLivePayment } from "@/repositories/expense-payments";
import { findLiveLinkForRecordForUpdate, listLiveLinkOwnersByRecords, type LiveLinkOwner } from "@/repositories/evidence-record-links";
import { clearNeedsCheckIfVersionMatches, readRecordAmounts, updateAmountIfVersionMatches, type RecordAmounts } from "@/repositories/evidence-record-detail";
import { lockRecordsForUpdate } from "@/repositories/evidence-records";
import { lockPurchaseRequestForUpdate } from "@/repositories/purchase-requests";

// 06.1-07(S3 · EVID-12 · EVID-09 · D-6106 · D-6520 · RP-1 · RP-2 · RP-6): 증빙 기록 한 줄의 공급가 고침과 확인 필요 풀기.
// 합계(파일 값)는 고정, 세액 = 합계 − 공급가(domain/money — PA-AMT). 전 · 후는 끌 수 없는 evidence_record_amount_change(06 공급가액 고침
// evidence_amount_change와 다른 종류). 붙은 문서가 작성 중 · 결재 중 · 승인 · 지급 완료 · 종결이면 금액이 잠긴다(E7 — 완료 프로젝트만으로는 잠그지 않는다,
// 사용자 결정 2026-10-05). 기록 금액은 문서 공급가액 · 지급액 · version · 결재 · 확인 기록을 바꾸지 않는다(D-6520 · 05 X-1 — 문서 행은 잠그기만 한다).
// 06-03 tx 규약: 권한 · 범위 · 붙은 문서 사전 판독은 트랜잭션 전, 안은 tx 리포지토리 · 05 잠금(lockEvidenceOwnerForChange) · 순수 판정 · recordAction({ tx })뿐.
// 잠금 순서는 06.1-06과 같다(문서 행 → 증빙 행 — E-49). 안 붙은 갈래는 문서 행을 뒤늦게 잠그지 않고 증빙 행 잠금 뒤 붙임이 사전 판독과 다르면 낡음 거부(E26).

const RECORD_NOT_FOUND = "없는 증빙 · 새로 고침";
const PURCHASE_REQUEST_NOT_FOUND = "없는 구매 요청 · 새로 고침";
const PURCHASE_REQUEST_CANCELLED = "구매 요청 취소됨 · 새로 고침";
const NOT_NEEDS_CHECK = "확인 필요 아님 · 새로 고침";
const AMOUNT_HIDDEN = "증빙 금액 보기 권한 없음";
// C8 · E27 — 카드 사용에 붙은 기록의 금액 고침 갈래는 06.1-09가 연다. 그 전에는 카드 사용 붙임이 생기지 않는다(화면 문구 없음 — 서버 거부 글자만).
export const CARD_USAGE_AMOUNT_LOCKED = "카드 사용에 붙음 · 금액 잠김";

const AMOUNT_TOO_LARGE = "공급가가 합계보다 큼";
const AMOUNT_SIGN_MISMATCH = "공급가 부호 다름";
const AMOUNT_NOT_INTEGER = "숫자 형식 오류 · 12,400,000처럼";

/** version 충돌 · 사전 판독 뒤 붙임이 바뀜 — 글자 `다른 사람이 {HH:mm}에 바꿈 · 새로 고침`(06 EvidenceReviewConflictError 꼴, DA-23). */
export class EvidenceAmountConflictError extends UserFacingError {}

/** 붙은 문서가 잠겨 금액을 고칠 수 없다(E7 · DB-3) — 글자는 amountLockOf 그대로. */
export class EvidenceAmountLockedError extends UserFacingError {}

export type EditedAmounts = RecordAmounts;
export type AmountResolution = { ok: true; amounts: EditedAmounts } | { ok: false; reason: string };

// PA-AMT — 합계 고정 · 공급가는 합계와 부호가 같고 절댓값이 합계 이하(면세 = 공급가 합계 같음). 범위는 money 입력 규칙(1조 원 미만 — RP-13 · E13).
// 크기 · 부호는 비교만 하고 셈은 diffKrw 하나다(money 경계).
export function resolveEditedAmounts(input: { totalKrw: number; supplyKrw: number }): AmountResolution {
  const { totalKrw, supplyKrw } = input;
  if (!Number.isInteger(supplyKrw)) return { ok: false, reason: AMOUNT_NOT_INTEGER };
  try {
    normalizeMoneyInput({ currency: "KRW", amount: supplyKrw, fxRate: 1 });
  } catch (error) {
    if (error instanceof MoneyInputError) return { ok: false, reason: error.message };
    throw error;
  }
  const negative = totalKrw < 0;
  if ((negative && supplyKrw > 0) || (!negative && supplyKrw < 0)) return { ok: false, reason: AMOUNT_SIGN_MISMATCH };
  if (negative ? supplyKrw < totalKrw : supplyKrw > totalKrw) return { ok: false, reason: AMOUNT_TOO_LARGE };
  return { ok: true, amounts: { supplyKrw, vatKrw: diffKrw(totalKrw, supplyKrw), totalKrw } };
}

export type AmountLockInput = { pending: true } | { owner: Pick<EvidenceOwnerView, "phase" | "projectCompleted">; paid: boolean };

const LOCK_WORD: Partial<Record<EvidenceOwnerPhase, string>> = { in_review: "결재 중", closed: "종결", approved: "승인됨" };

// PA-LOCK — 작성 중(번호 없는 임시 문서) > 결재 중 > 지급 완료 > 종결 > 승인됨, 반려 · 회수는 null. 결재 중 · 승인 판정은 readEvidenceOwner가 05 규칙표
// (rule.inReview · rule.approved)로 붙여 준 phase를 쓴다 — 상태 이름 목록을 여기 다시 적지 않는다. projectCompleted는 읽지 않는다(사용자 결정 2026-10-05
// 「사후 처리 열기」). phase 「other」(번호는 있는데 05 표의 어느 단계도 아님)는 작성 중과 같이 잠근다 — 금액 경로라 모르는 상태를 열지 않는다.
export function amountLockOf(input: AmountLockInput): string | null {
  if ("pending" in input) return lockLine("작성 중");
  const { phase } = input.owner;
  if (phase === "returned") return null;
  if (phase === "in_review") return lockLine("결재 중");
  if (input.paid) return lockLine("지급 완료");
  const word = LOCK_WORD[phase];
  return lockLine(word ?? "작성 중");
}

function lockLine(word: string): string {
  return `${word} 문서에 붙음 · 금액 잠김`;
}

function conflictOf(updatedAt: Date): EvidenceAmountConflictError {
  return new EvidenceAmountConflictError(`다른 사람이 ${formatKstTime(updatedAt)}에 바꿈 · 새로 고침`);
}

/** 사전 판독한 붙임 — 트랜잭션 안 잠금 차례(문서 행 → 증빙 행)와 잠금 뒤 붙임 재확인(같은 붙임 행인가)의 기준. */
type AttachTarget =
  | { kind: "none" }
  | { kind: "expense"; linkId: string; before: EvidenceOwnerView }
  | { kind: "pending"; linkId: string }
  | { kind: "purchase_request"; linkId: string; ownerId: string }
  | { kind: "corp_card_usage"; linkId: string };

async function readAttachTarget(viewer: Viewer, link: LiveLinkOwner | undefined): Promise<AttachTarget> {
  if (!link) return { kind: "none" };
  if (link.ownerKind === "purchase_request") return { kind: "purchase_request", linkId: link.linkId, ownerId: link.ownerId };
  if (link.ownerKind === EXPENSE_DOCUMENT_KIND) {
    // 번호 없는 임시 지출결의(06.1-08 작성자 붙임) — 경영관리는 그 문서를 못 본다(canSeeExpense). owner 판독으로 가지 않고 이 갈래로 잠근다(Round 2 eng B-P2).
    if (link.ownerNumber === null) return { kind: "pending", linkId: link.linkId };
    return { kind: "expense", linkId: link.linkId, before: await readEvidenceOwner(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: link.ownerId }) };
  }
  return { kind: "corp_card_usage", linkId: link.linkId };
}

// 사전 판독의 금액 잠김(트랜잭션 전) — 지출결의는 05 판정 단계 + 지급 행(06.5 findLivePayment — 06 SUPPLY_CORRECTION_PAID_LOCKED와 같은 판독).
async function preReadLock(viewer: Viewer, target: AttachTarget): Promise<string | null> {
  if (target.kind === "pending") return amountLockOf({ pending: true });
  if (target.kind === "corp_card_usage") return CARD_USAGE_AMOUNT_LOCKED;
  if (target.kind !== "expense") return null;
  return amountLockOf({ owner: target.before, paid: (await findLivePayment(viewer, target.before.id)) !== null });
}

/** S3 패널이 그리는 잠김 줄(getEvidenceDetail) — 서버 거부와 같은 사전 판독이다. 붙은 지출결의를 못 보면(범위 밖) 잠김 줄 없이 둔다 — 저장은 서버가 거부한다. */
export async function readAmountLock(viewer: Viewer, link: LiveLinkOwner | undefined): Promise<string | null> {
  try {
    return await preReadLock(viewer, await readAttachTarget(viewer, link));
  } catch (error) {
    if (error instanceof UserFacingError) return null;
    throw error;
  }
}

export type EvidenceAmountDeps = {
  /** 문서 · 증빙 행을 잠그고 재확인을 지난 뒤 · 쓰기 전(경합 시험 자리 — 06.1-06 EvidenceAttachDeps 꼴). */
  afterLock?: () => Promise<void>;
  isActionTypeEnabled?: RecordActionDeps["isActionTypeEnabled"];
};

export type EvidenceRecordChangeResult = { id: string; version: number };

type ChangeInput = { id: string; version: number; supplyKrw: number | null; clearNeedsCheck: boolean };

// 금액 고침 · 확인 필요 풀기 한 길(DA-13 — 같은 1차 한 번이 둘을 한 트랜잭션에서). 공급가가 지금 값과 같으면 금액은 바꾸지 않는다(잠긴 문서여도 풀기만은 된다 —
// 금액이 아니다). 붙은 갈래는 문서 행 잠금 → 잠금 뒤 잠김 재판정 → 증빙 행 잠금 → 붙임 재확인 → version 비교 → 갱신 → 기록 차례다.
async function changeRecord(viewer: Viewer, input: ChangeInput, deps?: EvidenceAmountDeps): Promise<EvidenceRecordChangeResult> {
  if (!(await can(viewer, "evidence.intake", "write"))) throw new ForbiddenError(INTAKE_FORBIDDEN);
  const record = await getEvidenceRecord(viewer, input.id);
  if (!record || record.id === undefined) throw new UserFacingError(RECORD_NOT_FOUND);
  if (input.clearNeedsCheck && record.statusWord !== "확인 필요") throw new UserFacingError(NOT_NEEDS_CHECK);
  const current = await readRecordAmounts(viewer, input.id);
  if (!current) throw new UserFacingError(RECORD_NOT_FOUND);
  const amountChange = input.supplyKrw !== null && input.supplyKrw !== current.supplyKrw;
  if (amountChange && input.supplyKrw !== null) {
    const resolved = resolveEditedAmounts({ totalKrw: current.totalKrw, supplyKrw: input.supplyKrw });
    if (!resolved.ok) throw new UserFacingError(resolved.reason);
  }
  const [link] = await listLiveLinkOwnersByRecords(viewer, [input.id]);
  const target = await readAttachTarget(viewer, link);
  if (amountChange) {
    const lock = await preReadLock(viewer, target);
    if (lock !== null) throw new EvidenceAmountLockedError(lock);
  }

  return withTransaction(async (tx) => {
    // 문서 행 잠금 — 지출결의는 05 잠금 순서(lockEvidenceOwnerForChange — 사전 판독이 승인이면 프로젝트 → 문서 행) 뒤 같은 tx로 다시 읽은 단계 · 지급 행으로
    // 잠김을 다시 판정한다(제출 · 승인 · 지급 경합 — T-061-72). 구매 요청은 그 행 잠금 → 취소 아님. 문서 행은 잠그기만 하고 쓰지 않는다(D-6520).
    if (target.kind === "expense") {
      const owner = await lockEvidenceOwnerForChange(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: target.before.id, before: target.before }, tx);
      const lock = amountLockOf({ owner, paid: (await findLivePayment(viewer, owner.id, tx)) !== null });
      if (amountChange && lock !== null) throw new EvidenceAmountLockedError(lock);
    } else if (target.kind === "purchase_request") {
      const request = await lockPurchaseRequestForUpdate(viewer, target.ownerId, tx);
      if (!request) throw new UserFacingError(PURCHASE_REQUEST_NOT_FOUND);
      if (request.status === "cancelled") throw new UserFacingError(PURCHASE_REQUEST_CANCELLED);
    }
    const [row] = await lockRecordsForUpdate(viewer, [input.id], tx);
    if (!row) throw new UserFacingError(RECORD_NOT_FOUND);
    // E26 · C-F5 · T-061-703 — 사전 판독 뒤 누가 붙이거나 뗐으면(붙임 행이 다르면) 낡음. 문서 행을 뒤늦게 잠그지 않는다(전역 순서 문서 → 증빙).
    const live = await findLiveLinkForRecordForUpdate(viewer, input.id, tx);
    const expectedLinkId = target.kind === "none" ? null : target.linkId;
    if ((live?.id ?? null) !== expectedLinkId || row.version !== input.version) throw conflictOf(row.updatedAt);
    if (input.clearNeedsCheck && row.needsCheck === null) throw conflictOf(row.updatedAt);
    await deps?.afterLock?.();
    const before = await readRecordAmounts(viewer, input.id, tx);
    if (!before) throw new UserFacingError(RECORD_NOT_FOUND);
    if (amountChange && input.supplyKrw !== null) {
      const resolved = resolveEditedAmounts({ totalKrw: before.totalKrw, supplyKrw: input.supplyKrw });
      if (!resolved.ok) throw new UserFacingError(resolved.reason);
      const after = resolved.amounts;
      const updated = await updateAmountIfVersionMatches(
        viewer,
        { id: input.id, version: input.version, supplyKrw: after.supplyKrw, vatKrw: after.vatKrw, clearNeedsCheck: input.clearNeedsCheck },
        tx,
      );
      if (!updated) throw conflictOf(row.updatedAt);
      // RP-2 · PA-HISTORY — 끌 수 없는 종류 · documentId = 기록 id(action_log_document_idx로 이력이 읽는다).
      await recordAction(
        viewer,
        { actionType: "evidence_record_amount_change", entity: "evidence_record", entityId: input.id, documentId: input.id, detail: { before, after } },
        { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
      );
    } else if (input.clearNeedsCheck) {
      if (!(await clearNeedsCheckIfVersionMatches(viewer, { id: input.id, version: input.version }, tx))) throw conflictOf(row.updatedAt);
    }
    if (input.clearNeedsCheck) {
      // PA-CONFIRM — 풀기 기록은 금액 변경이 아니다(document_update). 무엇을 풀었는지(사유 글자)를 남긴다.
      await recordAction(
        viewer,
        { actionType: "document_update", entity: "evidence_record", entityId: input.id, documentId: input.id, detail: { change: "evidence_record_needs_check_clear", needsCheck: row.needsCheck } },
        { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
      );
    }
    return { id: input.id, version: input.version + 1 };
  });
}

/** 공급가 고침(EVID-12) — 입력은 id · version · 공급가뿐(세액 · 합계는 서버가 셈한다, T-061-71). */
export async function updateEvidenceAmount(viewer: Viewer, input: { id: string; version: number; supplyKrw: number }, deps?: EvidenceAmountDeps): Promise<EvidenceRecordChangeResult> {
  return changeRecord(viewer, { id: input.id, version: input.version, supplyKrw: input.supplyKrw, clearNeedsCheck: false }, deps);
}

/** 확인 필요 풀기(RP-6 · DA-13) — 06 confirmEvidence(문서 단위 확인)와 다른 함수. 공급가가 함께 오면 같은 트랜잭션에서 금액도 고친다. */
export async function clearRecordNeedsCheck(
  viewer: Viewer,
  input: { id: string; version: number; supplyKrw?: number | null },
  deps?: EvidenceAmountDeps,
): Promise<EvidenceRecordChangeResult> {
  return changeRecord(viewer, { id: input.id, version: input.version, supplyKrw: input.supplyKrw ?? null, clearNeedsCheck: true }, deps);
}

export type EvidenceAmountPreview = { ok: true; vatKrw: number; totalKrw: number } | { ok: false; reason: string };

// 입력 아래 한 줄 `세액 {n} · 합계 {n}` — 쓰기 없음. 같은 사전 판정(권한 · 범위)에 금액 보기 항목(evidence.amount)을 더한다(세액 · 합계를 돌려주므로).
export async function previewEvidenceAmount(viewer: Viewer, input: { id: string; supplyKrw: number }): Promise<EvidenceAmountPreview> {
  if (!(await can(viewer, "evidence.intake", "write"))) throw new ForbiddenError(INTAKE_FORBIDDEN);
  if (!(await visible(viewer, "evidence.amount"))) throw new ForbiddenError(AMOUNT_HIDDEN);
  const record = await getEvidenceRecord(viewer, input.id);
  if (!record || record.id === undefined) throw new UserFacingError(RECORD_NOT_FOUND);
  const current = await readRecordAmounts(viewer, input.id);
  if (!current) throw new UserFacingError(RECORD_NOT_FOUND);
  const resolved = resolveEditedAmounts({ totalKrw: current.totalKrw, supplyKrw: input.supplyKrw });
  return resolved.ok ? { ok: true, vatKrw: resolved.amounts.vatKrw, totalKrw: resolved.amounts.totalKrw } : { ok: false, reason: resolved.reason };
}
