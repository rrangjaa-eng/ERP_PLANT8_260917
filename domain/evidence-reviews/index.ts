import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { recordAction } from "@/domain/action-log/record";
import { GateBlockedError } from "@/domain/rules/gate";
import { canSeeExpense, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { hasEvidence } from "@/domain/evidence/has-evidence";
import {
  CANCEL_REASON_REQUIRED,
  EVIDENCE_AMOUNT_FRACTION,
  approvalGateDecision,
  evidenceGateDecision,
  pairGateDecision,
  resolveExpenseActionRow,
  type EvidenceGateInput,
  type ExpenseActionBar,
} from "@/domain/payments/action-row";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_PREPAID_DUE_DAYS } from "@/domain/settings/keys";
import { formatKstTime } from "@/domain/holidays/business-day";
import { findExpenseApprovalInstance, findExpenseById, lockExpenseForUpdate } from "@/repositories/expenses";
import { bumpExpenseVersion, findLivePayment } from "@/repositories/expense-payments";
import { findReviewByExpense, updateCorrectedSupply, upsertReview } from "@/repositories/expense-evidence-reviews";
import { lockProjectForWrite } from "@/repositories/projects";
import { findExpenseQuoteLineIds, lockQuoteLines } from "@/repositories/quote-line-links";
import { listAliveByOwners } from "@/repositories/files";
import { findUserNamesByIds } from "@/repositories/users";
import type { DbOrTx } from "@/repositories/document-counters";
import { withTransaction } from "@/lib/db-transaction";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { MoneyInputError, moneyFromRow, moneyToColumns, type Money } from "@/domain/money";

// 06-06(EVID-02 · EVID-03 · D-601 · D-602 · O-2) — 경영관리의 증빙 확인(S4). 확인 기록(06-27 expense_evidence_reviews)을 쓰고,
// 증빙 상태 다섯 값을 낸다. 증빙 유무는 06-03 hasEvidence 하나(C5 — 파일 수를 직접 세지 않는다).
//
// 06.5 D-6520(사용자 카드 10/13 23:44 KST): 증빙 확인의 금액은 공급가액 하나 — 같으면 그대로 확정, 영수증이 다르면 지급 전에만 남은 실행가 안에서
// 공급가액을 고친다(제출 상한과 같은 판정 · 문구). 지급 뒤 고침은 막는다(카드 ② · 10/7 I-2). 옛은 지급 뒤 증빙 금액 수정을 막고 잠금 해제로만
// 열었다(O: server/src/expenses.ts:5509-5513).
//
// 06-03 tx 규약: 권한 판정 · 사전 조회(설정 · 코드표 · 세율)는 트랜잭션 전, 트랜잭션 안은 tx 리포지토리 · DB 없는 함수 ·
// recordAction(…, { tx })뿐이다. domain/payments/index.ts가 이 파일을 값 import하므로(evidenceGateInputs) 이 파일은 지급 모듈의
// 사전 조회(loadPaymentShared)를 동적 import로 부른다 — 정적 상호 import는 런타임 순환이다(domain/action-log/record.ts 선례).

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class EvidenceReviewNotFoundError extends UserFacingError {
  constructor() {
    super("없는 지출결의 · 새로 고침");
  }
}

// 「거부 — 문서 화면 동시성」(UI-SPEC Copywriting).
export class EvidenceReviewConflictError extends UserFacingError {}

const NOTHING_TO_CONFIRM = "확인할 증빙 없음 · 새로 고침";

// 06.5 D-6520(UI-SPEC V8 개정 4판): 열어 둔 화면에서 고친 사이 지급이 완료되면 — 행동 줄 이유 자리 + 3차 `새로 고침`(충돌 갈래).
export const SUPPLY_CORRECTION_PAID_LOCKED = "지급 완료 문서 · 공급가액 못 바꿈 · 새로 고침";

// 06.5 D-6520 — 고침 판정 한 곳. 고침 칸이 없거나 지금 공급가와 같은 값(문서 통화)이면 same(지급 유무와 무관하게 확정 — 지급액이 공급가에서
// 나왔다), 다른 값이면 지급 전 correct · 지급 뒤 locked(카드 ② 「지금처럼 막기」).
export function supplyCorrectionKind(input: { current: Money | null; corrected: number | undefined; paid: boolean }): "same" | "correct" | "locked" {
  if (input.corrected === undefined || input.corrected === input.current?.amount) return "same";
  return input.paid ? "locked" : "correct";
}

// 고친 공급가(문서 통화) → 공급가 네 칸. 환율 · 통화는 지금 값 그대로. 원화 소수(반올림 저장)와 원화 환산 0(06 CHECK 500)은 고침 칸 오류로 막는다 —
// 확인 · 미리보기가 같이 쓴다. domain/expenses는 이 파일을 정적으로 부르는 쪽이라 SUPPLY_ZERO는 동적 import.
export async function correctedSupplyColumns(current: Money, corrected: number): Promise<ReturnType<typeof moneyToColumns>> {
  if (current.currency === "KRW" && !Number.isInteger(corrected)) throw new MoneyInputError("precision", EVIDENCE_AMOUNT_FRACTION);
  const columns = moneyToColumns({ currency: current.currency, amount: corrected, fxRate: current.fxRate });
  if (columns.amountKrw <= 0) throw new MoneyInputError("range", (await import("@/domain/expenses")).SUPPLY_ZERO);
  return columns;
}

// 「Error — 공급가액 고침 칸」(V8 상한 오류) — 액션이 오류 종류로 가려 고침 칸 오류 자리에 세운다(문구 비교 없음).
// 문구는 확인 · 미리보기가 같은 한 곳 — 남은 실행가 글자는 호출자가 제출 문구 함수(remainingText)로 만든다.
export class SupplyCorrectionCapError extends UserFacingError {
  constructor(remainingLabel: string) {
    super(`남은 실행가 ${remainingLabel} 넘음 · 공급가액 고치기`);
  }
}

// ── 증빙 상태 다섯 값 ──────────────────────────────────────────────────
// 면제 기록 있음 → 면제(선결제를 이긴다) / 증빙 있음 · 확인 기록 없음 → 확인 전 / 증빙 있음 · confirmed → 확인됨 /
// 증빙 없음 · 선결제 → 선결제 / 증빙 없음 → 증빙 없음(증빙 필수 off면 화면 값 `—` — 낱말은 화면이 고른다).
// evidenceRecordCount는 6.1-12가 채우는 자리(K-3) — 06은 넘기지 않고 「등록이 곧 확인」(D-6117)을 짓지 않는다.
export type EvidenceStatus = "면제" | "확인 전" | "확인됨" | "선결제" | "증빙 없음";

export type EvidenceStatusInput = {
  hasEvidence: boolean;
  prepaid: boolean;
  review: { status: string } | null;
  evidenceRecordCount?: number;
};

export function resolveEvidenceStatus(input: EvidenceStatusInput): EvidenceStatus {
  if (input.review?.status === "waived") return "면제";
  if (input.hasEvidence) return input.review?.status === "confirmed" ? "확인됨" : "확인 전";
  if (input.prepaid) return "선결제";
  return "증빙 없음";
}

// ── 증빙 지문(재조정 — 06-17에서 옮김) ───────────────────────────────────
// 화면이 본 증빙(살아 있는 파일 · 증빙일)과 확인하는 순간의 증빙이 같은지 — 파일 id 정렬 + 날짜를 한 문자열로(해시 없음).
// 06.5 D-6520: 금액은 공급가 하나 — 공급가 고침은 version을 올리므로 지문에 넣지 않는다(06.5-07).
export function evidenceStampOf(input: { fileIds: readonly string[]; evidenceDate: string | null }): string {
  return [[...input.fileIds].sort().join(","), input.evidenceDate ?? ""].join("|");
}

// ── 증빙 게이트 입력(O-2 · CROSS R-3) ─────────────────────────────────────
// 지급 완료 · 화면 1차가 같은 한 함수로 증빙 게이트 ctx를 짓는다. 증빙 유무는 hasEvidence, 면제 · 확인은 확인 기록의 status,
// prepaid는 잠근 행 값. tx는 선택 — 지급 완료(잠금 뒤)는 반드시 넘기고, 트랜잭션 없는 읽기는 생략해 리포지토리 기본값을 쓴다.
export async function evidenceGateInputs(
  viewer: Viewer,
  lockedDoc: { id: string; prepaid: boolean },
  pre: { evidenceRequired: boolean; drafterName: string },
  tx?: DbOrTx,
): Promise<EvidenceGateInput> {
  const live = await hasEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: lockedDoc.id }, tx);
  const review = await findReviewByExpense(viewer, lockedDoc.id, tx);
  return {
    evidenceRequired: pre.evidenceRequired,
    hasEvidence: live,
    prepaid: lockedDoc.prepaid,
    waived: review?.status === "waived",
    confirmation: review?.status === "confirmed" ? { reviewedAt: review.reviewedAt } : null,
    drafterName: pre.drafterName,
  };
}

// 선결제 증빙 기한 날수(evidence.prepaid_due_days) — 트랜잭션 밖 사전 조회 전용.
export function loadPrepaidDueDays(): Promise<number> {
  return getSettingValue(EVIDENCE_PREPAID_DUE_DAYS);
}

// ── 증빙 확인 ─────────────────────────────────────────────────────────
// DR-4 응답 모양 — 06-15 · 06-17(S1) · 06-20(S3) 제자리 확인이 응답 version으로 행을 바꾼다.
export type ConfirmEvidenceResult = { version: number; evidenceStatus: EvidenceStatus; actionRow: ExpenseActionBar };

export type ConfirmEvidenceInput = {
  expenseId: string;
  version: number;
  // 06.5 D-6520 — 고친 공급가액(문서 통화). 없으면 공급가액 그대로 확정.
  correctedSupplyAmount?: number;
  // 화면이 본 증빙 지문(getPaymentView evidenceStamp) — 있으면 잠금 뒤 같은 tx로 다시 만들어 비교한다. 없으면 version 비교만.
  evidenceStamp?: string;
};

// 잠금 뒤 지문이 달라짐 — 사람 이름은 풀을 읽어야 하므로 트랜잭션을 되돌린 뒤 밖에서 「거부 — 문서 화면 동시성」으로 바꾼다.
class EvidenceStampChangedSignal extends Error {
  constructor(
    readonly uploadedBy: string | null,
    readonly at: Date,
  ) {
    super("증빙 지문 다름");
  }
}

// 지급 권한(expenses.payments write)이 있어야 한다(D-601). 권한 · 사전 조회는 트랜잭션 전. 한 트랜잭션:
// (고침 칸이 오면 프로젝트 행 → 견적 줄 잠금 — 제출과 같은 N-3 순서) 05 lockExpenseForUpdate → 문서 version 비교 → (지문이 오면) 증빙 지문 비교 →
// 결재 통과(같은 tx) → hasEvidence(…, tx) → 고침 판정(지급 뒤 LOCKED · 남은 실행가 상한) → (고쳤으면) 공급가 칸 갱신 → 확인 기록 upsert(원화 공급가
// 전 · 후) → 문서 version + 1 → 행동 로그(같은 tx — 고쳤으면 끌 수 없는 evidence_amount_change). 05 기안자 저장 · 증빙 올리기 · 증빙 무효 경로를
// 부르지 않는다(B-3).
export async function confirmEvidence(
  viewer: Viewer,
  input: ConfirmEvidenceInput,
  deps?: { afterLock?: () => Promise<void> },
): Promise<ConfirmEvidenceResult> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("증빙 확인 권한 없음");
  if (!UUID_SHAPE.test(input.expenseId)) throw new EvidenceReviewNotFoundError();
  // 문서 보임(행 범위, CSO-1) — 트랜잭션 전. 안 보이면 문서 화면과 같은 「없는 지출결의」.
  const row = await findExpenseById(viewer, input.expenseId);
  if (!row || !(await canSeeExpense(viewer, row))) throw new EvidenceReviewNotFoundError();
  const payments = await import("@/domain/payments");
  const shared = await payments.loadPaymentShared(viewer);
  const amountVisible = await visible(viewer, "expense.amount");
  const corrected = input.correctedSupplyAmount;
  // 화면은 금액을 못 보는 권한자에게 고침 칸을 그리지 않는다 — 서버도 고친 금액을 받지 않는다(고침 없는 확인은 된다 · 상한 문구가 금액을 알려 주지 않게 먼저).
  if (corrected !== undefined && !amountVisible) throw new ForbiddenError("증빙 금액 볼 권한 없음");

  let committed;
  try {
    committed = await withTransaction(async (tx) => {
      // P2-C2 — 공급가를 바꿀 수 있는 요청만 제출과 같은 잠금 순서(프로젝트 행 → 견적 줄 → 문서 행)로 잠근 뒤 같은 tx에서 상한을 판정한다.
      const lineIds = corrected !== undefined ? await findExpenseQuoteLineIds(viewer, row.id, tx) : [];
      if (corrected !== undefined) {
        if (row.projectId && !(await lockProjectForWrite(viewer, row.projectId, tx))) throw new EvidenceReviewNotFoundError();
        await lockQuoteLines(viewer, lineIds, tx);
      }
      const locked = await lockExpenseForUpdate(viewer, input.expenseId, tx);
      await deps?.afterLock?.();
      if (!locked) throw new EvidenceReviewNotFoundError();
      const conflict = `다른 사람이 ${formatKstTime(locked.updatedAt)}에 바꿈 · 새로 고침`;
      if (locked.version !== input.version) throw new EvidenceReviewConflictError(conflict);
      // 잠근 문서의 프로젝트 · 줄이 사전 조회와 다르면 잠그지 않은 줄로 판정하지 않고 충돌로 막는다(제출과 같은 꼴).
      if (corrected !== undefined && (locked.projectId !== row.projectId || locked.quoteLineId !== row.quoteLineId || (lineIds[0] ?? null) !== row.quoteLineId)) {
        throw new EvidenceReviewConflictError(conflict);
      }
      if (input.evidenceStamp !== undefined) {
        const alive = await listAliveByOwners(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: [locked.id] }, tx);
        const stamp = evidenceStampOf({ fileIds: alive.map((file) => file.id), evidenceDate: locked.evidenceDate });
        const latest = alive.at(-1);
        if (stamp !== input.evidenceStamp) throw new EvidenceStampChangedSignal(latest?.uploadedBy ?? null, latest?.createdAt ?? locked.updatedAt);
      }
      const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: locked.id }, tx);
      const approval = approvalGateDecision({ approvalState: instance?.status ?? null, stepName: null });
      if (!approval.allowed) throw new GateBlockedError(approval.reason);
      if (!(await hasEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: locked.id }, tx))) throw new UserFacingError(NOTHING_TO_CONFIRM);

      const current =
        locked.supplyAmountKrw === null
          ? null
          : moneyFromRow({ currency: locked.supplyCurrency, foreignAmount: locked.supplyForeignAmount, fxRate: locked.supplyFxRate, amountKrw: locked.supplyAmountKrw });
      const kind = supplyCorrectionKind({ current, corrected, paid: corrected !== undefined && (await findLivePayment(viewer, locked.id, tx)) !== null });
      if (kind === "locked") throw new EvidenceReviewConflictError(SUPPLY_CORRECTION_PAID_LOCKED);
      const before = locked.supplyAmountKrw;
      let after = before;
      if (kind === "correct" && corrected !== undefined) {
        // 상한 문구는 제출과 같은 함수 — domain/expenses는 이 파일을 정적으로 부르는 쪽이라 동적 import(위 지급 모듈과 같은 까닭 · DB 없음).
        const { remainingText } = await import("@/domain/expenses");
        const columns = current
          ? await correctedSupplyColumns(current, corrected)
          : moneyToColumns({ currency: "KRW", amount: corrected, fxRate: 1 });
        const cap = await payments.supplyCorrectionCap(viewer, locked, moneyFromRow(columns), tx);
        if (cap?.exceeds) throw new SupplyCorrectionCapError(remainingText(cap.remaining, cap.basis));
        if (!(await updateCorrectedSupply(viewer, { expenseId: locked.id, columns }, tx))) throw new EvidenceReviewNotFoundError();
        after = columns.amountKrw;
      }
      const review = await upsertReview(viewer, { expenseId: locked.id, status: "confirmed", amountBeforeKrw: before, amountAfterKrw: after, waiveReason: null, reviewedBy: viewer.id }, tx);
      const version = await bumpExpenseVersion(viewer, { expenseId: locked.id, expectedVersion: locked.version, updatedBy: viewer.id }, tx);
      if (version === null) throw new EvidenceReviewConflictError(conflict);
      await recordAction(
        viewer,
        { actionType: "document_update", entity: "expense", entityId: locked.id, documentId: locked.id, detail: { field: "evidenceReview", status: "confirmed" } },
        { tx },
      );
      if (kind === "correct") {
        await recordAction(
          viewer,
          { actionType: "evidence_amount_change", entity: "expense", entityId: locked.id, documentId: locked.id, detail: { before, after } },
          { tx },
        );
      }
      const paid = (await findLivePayment(viewer, locked.id, tx)) !== null;
      return { version, locked, approvalState: instance?.status ?? null, reviewedAt: review.reviewedAt, paid };
    });
  } catch (error) {
    if (!(error instanceof EvidenceStampChangedSignal)) throw error;
    const name = error.uploadedBy ? (await findUserNamesByIds(viewer, [error.uploadedBy])).get(error.uploadedBy) : undefined;
    throw new EvidenceReviewConflictError(`${name ? `${name}이` : "다른 사람이"} ${formatKstTime(error.at)}에 증빙을 바꿈 · 새로 고침`);
  }

  const { locked } = committed;
  const confirmation = { reviewedAt: committed.reviewedAt };
  const evidence = evidenceGateDecision({
    evidenceRequired: shared.evidenceRequired,
    hasEvidence: true,
    prepaid: locked.prepaid,
    waived: false,
    confirmation,
    drafterName: "",
  });
  const actionRow = resolveExpenseActionRow(
    { approvalState: committed.approvalState, paid: committed.paid, hasEvidence: true, waived: false, confirmation, evidence, pair: pairGateDecision(payments.pairGateCtx(locked, shared)) },
    { canPay: true, amountVisible },
  );
  return { version: committed.version, evidenceStatus: resolveEvidenceStatus({ hasEvidence: true, prepaid: locked.prepaid, review: { status: "confirmed" } }), actionRow };
}

// ── 증빙 면제(06-10 · D-603 · D-611 · UI-SPEC S4 「증빙 면제의 자리」) ─────────────────────────────────
const WAIVE_HAS_EVIDENCE = "증빙 있음 · 증빙 확인";
const WAIVE_ALREADY = "이미 면제 · 새로 고침";

// 지급 권한(expenses.payments write — D-601)과 사유(trim, 필수)는 트랜잭션 전. 사유는 확인 기록 waive_reason과 끌 수 없는 행동 로그 evidence_waive(detail.reason)에 같은 원문으로 남는다 —
// 확인 기록 줄은 06-11 훅이 승인 뒤 기안자 추가 때 지울 수 있어 면제 흔적은 로그가 지킨다. 한 트랜잭션: 05 lockExpenseForUpdate → (테스트 장벽 deps.afterLock — E-26, 05 submitExpense 선례) →
// 문서 version 비교 → 결재 통과(같은 tx) → hasEvidence(…, tx) 거짓 → 이미 면제 아님 → upsertReview(waived) → bumpExpenseVersion → recordAction(…, { tx }).
// 지급 기록 · 선결제 표시 · 선결제 사유는 쓰지 않는다 — 면제는 증빙 값만 바꾼다(면제가 선결제를 이긴다: resolveEvidenceStatus · prepaidDueInfo가 면제 기록을 먼저 본다).
// 지급 전 · 지급 뒤(P6) · 선결제(P4) · 증빙 필수 off(P4) 어느 갈래에서도 선다. 응답은 confirmEvidence와 같은 { version, evidenceStatus, actionRow }.
export async function waiveEvidence(
  viewer: Viewer,
  input: { expenseId: string; version: number; reason: string },
  deps?: { afterLock?: () => Promise<void> },
): Promise<ConfirmEvidenceResult> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("증빙 면제 권한 없음");
  const reason = input.reason.trim();
  if (reason === "") throw new UserFacingError(CANCEL_REASON_REQUIRED);
  if (!UUID_SHAPE.test(input.expenseId)) throw new EvidenceReviewNotFoundError();
  const row = await findExpenseById(viewer, input.expenseId);
  if (!row || !(await canSeeExpense(viewer, row))) throw new EvidenceReviewNotFoundError();
  const payments = await import("@/domain/payments");
  const shared = await payments.loadPaymentShared(viewer);
  const amountVisible = await visible(viewer, "expense.amount");

  const committed = await withTransaction(async (tx) => {
    const locked = await lockExpenseForUpdate(viewer, input.expenseId, tx);
    if (!locked) throw new EvidenceReviewNotFoundError();
    await deps?.afterLock?.();
    const conflict = `다른 사람이 ${formatKstTime(locked.updatedAt)}에 바꿈 · 새로 고침`;
    if (locked.version !== input.version) throw new EvidenceReviewConflictError(conflict);
    const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: locked.id }, tx);
    const approval = approvalGateDecision({ approvalState: instance?.status ?? null, stepName: null });
    if (!approval.allowed) throw new GateBlockedError(approval.reason);
    if (await hasEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: locked.id }, tx)) throw new UserFacingError(WAIVE_HAS_EVIDENCE);
    if ((await findReviewByExpense(viewer, locked.id, tx))?.status === "waived") throw new EvidenceReviewConflictError(WAIVE_ALREADY);

    const review = await upsertReview(viewer, { expenseId: locked.id, status: "waived", amountBeforeKrw: null, amountAfterKrw: null, waiveReason: reason, reviewedBy: viewer.id }, tx);
    const version = await bumpExpenseVersion(viewer, { expenseId: locked.id, expectedVersion: locked.version, updatedBy: viewer.id }, tx);
    if (version === null) throw new EvidenceReviewConflictError(conflict);
    await recordAction(viewer, { actionType: "evidence_waive", entity: "expense", entityId: locked.id, documentId: locked.id, detail: { reason } }, { tx });
    const paid = (await findLivePayment(viewer, locked.id, tx)) !== null;
    return { version, locked, approvalState: instance?.status ?? null, reviewedAt: review.reviewedAt, paid };
  });

  const { locked } = committed;
  const evidence = evidenceGateDecision({ evidenceRequired: shared.evidenceRequired, hasEvidence: false, prepaid: locked.prepaid, waived: true, confirmation: null, drafterName: "" });
  const actionRow = resolveExpenseActionRow(
    { approvalState: committed.approvalState, paid: committed.paid, hasEvidence: false, waived: true, confirmation: null, evidence, pair: pairGateDecision(payments.pairGateCtx(locked, shared)) },
    { canPay: true, amountVisible },
  );
  return { version: committed.version, evidenceStatus: resolveEvidenceStatus({ hasEvidence: false, prepaid: locked.prepaid, review: { status: "waived" } }), actionRow };
}
