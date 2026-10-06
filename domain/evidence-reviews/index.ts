import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { recordAction } from "@/domain/action-log/record";
import { GateBlockedError } from "@/domain/rules/gate";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { hasEvidence } from "@/domain/evidence/has-evidence";
import {
  EVIDENCE_AMOUNT_REQUIRED,
  approvalGateDecision,
  evidenceGateDecision,
  pairGateDecision,
  resolveExpenseActionRow,
  type EvidenceGateInput,
  type ExpenseActionBar,
} from "@/domain/payments/action-row";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_AMOUNT_TAX_INCLUSIVE, isTaxInclusiveEvidenceAmount } from "@/domain/evidence-reviews/tax-inclusive";
import { EVIDENCE_PREPAID_DUE_DAYS } from "@/domain/settings/keys";
import { formatKstTime } from "@/domain/holidays/business-day";
import { findExpenseApprovalInstance, lockExpenseForUpdate } from "@/repositories/expenses";
import { bumpExpenseVersion, findLivePayment } from "@/repositories/expense-payments";
import { findReviewByExpense, updateEvidenceAmount, upsertReview } from "@/repositories/expense-evidence-reviews";
import { listAliveByOwners } from "@/repositories/files";
import { findUserNamesByIds } from "@/repositories/users";
import type { DbOrTx } from "@/repositories/document-counters";
import { withTransaction } from "@/lib/db-transaction";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { formatKrw } from "@/lib/format-number";
import { diffKrw } from "@/domain/money";

// 06-06(EVID-02 · EVID-03 · D-601 · D-602 · O-2) — 경영관리의 증빙 확인(S4). 확인 기록(06-27 expense_evidence_reviews)을 쓰고,
// 증빙 상태 다섯 값을 낸다. 증빙 유무는 06-03 hasEvidence 하나(C5 — 파일 수를 직접 세지 않는다).
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
// 화면이 본 증빙(살아 있는 파일 · 증빙 금액 · 증빙일)과 확인하는 순간의 증빙이 같은지 — 파일 id 정렬 + 금액 + 날짜를 한 문자열로(해시 없음).
export function evidenceStampOf(input: { fileIds: readonly string[]; evidenceAmountKrw: number | null; evidenceDate: string | null }): string {
  return [[...input.fileIds].sort().join(","), input.evidenceAmountKrw ?? "", input.evidenceDate ?? ""].join("|");
}

// ── 증빙 금액 초과 한 줄(Q-F — 사용자 결정 2026-10-05 UC-4 「표시만」) ──────────────
// 막지 않는다 — 확인 · 지급 게이트 · 규칙은 이 값을 읽지 않는다. 살아 있는 파일이 없거나 증빙 금액이 없으면 null(R-4 — pickPaymentAmount와 같은 조건).
// 남은 실행가 null = 팀 비용 · 사슬이 최신 차수에 닿지 않음(실행가 조각 없음).
export function evidenceOverrunLine(input: {
  hasLiveEvidence: boolean;
  evidenceAmountKrw: number | null;
  approvedSupplyKrw: number;
  lineRemainingKrw: number | null;
}): string | null {
  const amount = input.evidenceAmountKrw;
  if (!input.hasLiveEvidence || amount === null) return null;
  const parts: string[] = [];
  if (amount > input.approvedSupplyKrw) parts.push(`승인액보다 +${formatKrw(diffKrw(amount, input.approvedSupplyKrw))}`);
  if (input.lineRemainingKrw !== null && amount > input.lineRemainingKrw) parts.push(`실행가 초과 ${formatKrw(diffKrw(amount, input.lineRemainingKrw))}`);
  return parts.length > 0 ? parts.join(" · ") : null;
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
  correctedAmountKrw?: number;
  // 화면이 본 증빙 지문(getPaymentView evidenceStamp) — 있으면 잠금 뒤 같은 tx로 다시 만들어 비교한다. 없으면 version 비교만.
  evidenceStamp?: string;
};

// 「Error — 증빙 금액 칸」(S4) — F2 빈 금액 · EA-1 부가세 포함 금액. 화면은 이 거부를 금액 칸 오류 자리에 세운다.
export class EvidenceAmountError extends UserFacingError {}

// 잠금 뒤 지문이 달라짐 — 사람 이름은 풀을 읽어야 하므로 트랜잭션을 되돌린 뒤 밖에서 「거부 — 문서 화면 동시성」으로 바꾼다.
class EvidenceStampChangedSignal extends Error {
  constructor(
    readonly uploadedBy: string | null,
    readonly at: Date,
  ) {
    super("증빙 지문 다름");
  }
}

// 지급 권한(expenses.payments write)이 있어야 한다(D-601). 권한 · 사전 조회(EA-1 승인 공급가의 부가세 포함)는 트랜잭션 전. 한 트랜잭션:
// 05 lockExpenseForUpdate → 문서 version 비교 → (지문이 오면) 증빙 지문 비교 → 결재 통과(같은 tx) → hasEvidence(…, tx) → 금액 검사(F2) →
// (고친 금액이면) 증빙 금액 칸 갱신 → 확인 기록 upsert → 문서 version + 1 → 행동 로그(같은 tx — 고친 금액은 끌 수 없는 evidence_amount_change).
// 05 기안자 저장 · 증빙 올리기 · 증빙 무효 경로를 부르지 않는다(B-3).
export async function confirmEvidence(viewer: Viewer, input: ConfirmEvidenceInput): Promise<ConfirmEvidenceResult> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("증빙 확인 권한 없음");
  if (!UUID_SHAPE.test(input.expenseId)) throw new EvidenceReviewNotFoundError();
  const payments = await import("@/domain/payments");
  const shared = await payments.loadPaymentShared(viewer);
  const amountVisible = await visible(viewer, "expense.amount");
  const corrected = input.correctedAmountKrw;
  if (corrected !== undefined) {
    // EA-1 — 고친 금액만 판정한다(기안자 값은 06-10 저장 때 같은 함수가 막았다). 승인 공급가는 결재 통과 뒤 바뀌지 않아 사전 조회로 충분하다.
    const supplyTax = await payments.approvedSupplyTax(viewer, input.expenseId, shared);
    if (supplyTax && isTaxInclusiveEvidenceAmount({ evidenceAmountKrw: corrected, ...supplyTax })) throw new EvidenceAmountError(EVIDENCE_AMOUNT_TAX_INCLUSIVE);
  }

  let committed;
  try {
    committed = await withTransaction(async (tx) => {
      const locked = await lockExpenseForUpdate(viewer, input.expenseId, tx);
      if (!locked) throw new EvidenceReviewNotFoundError();
      const conflict = `다른 사람이 ${formatKstTime(locked.updatedAt)}에 바꿈 · 새로 고침`;
      if (locked.version !== input.version) throw new EvidenceReviewConflictError(conflict);
      if (input.evidenceStamp !== undefined) {
        const alive = await listAliveByOwners(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: [locked.id] }, tx);
        const stamp = evidenceStampOf({ fileIds: alive.map((file) => file.id), evidenceAmountKrw: locked.evidenceAmount, evidenceDate: locked.evidenceDate });
        const latest = alive.at(-1);
        if (stamp !== input.evidenceStamp) throw new EvidenceStampChangedSignal(latest?.uploadedBy ?? null, latest?.createdAt ?? locked.updatedAt);
      }
      const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: locked.id }, tx);
      const approval = approvalGateDecision({ approvalState: instance?.status ?? null, stepName: null });
      if (!approval.allowed) throw new GateBlockedError(approval.reason);
      if (!(await hasEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: locked.id }, tx))) throw new UserFacingError(NOTHING_TO_CONFIRM);

      const before = locked.evidenceAmount;
      // F2 — 빈 증빙 금액을 공급가액으로 채우지 않는다.
      if (corrected === undefined && before === null) throw new EvidenceAmountError(EVIDENCE_AMOUNT_REQUIRED);
      const changed = corrected !== undefined && corrected !== before;
      if (changed && !(await updateEvidenceAmount(viewer, { expenseId: locked.id, amountKrw: corrected }, tx))) throw new EvidenceReviewNotFoundError();
      // 06-27 CHECK — 전 · 후는 둘 다 값이거나 둘 다 null. 이전 값이 비었으면 기록에는 남기지 않고 로그(전 null · 후 값)에만 남긴다.
      const amounts = changed && before !== null ? { amountBeforeKrw: before, amountAfterKrw: corrected } : { amountBeforeKrw: null, amountAfterKrw: null };
      const review = await upsertReview(viewer, { expenseId: locked.id, status: "confirmed", ...amounts, waiveReason: null, reviewedBy: viewer.id }, tx);
      const version = await bumpExpenseVersion(viewer, { expenseId: locked.id, expectedVersion: locked.version, updatedBy: viewer.id }, tx);
      if (version === null) throw new EvidenceReviewConflictError(conflict);
      await recordAction(
        viewer,
        { actionType: "document_update", entity: "expense", entityId: locked.id, documentId: locked.id, detail: { field: "evidenceReview", status: "confirmed" } },
        { tx },
      );
      if (changed) {
        await recordAction(
          viewer,
          { actionType: "evidence_amount_change", entity: "expense", entityId: locked.id, documentId: locked.id, detail: { before, after: corrected } },
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
