import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { recordAction } from "@/domain/action-log/record";
import { GateBlockedError } from "@/domain/rules/gate";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { hasEvidence } from "@/domain/evidence/has-evidence";
import { approvalGateDecision, evidenceGateDecision, pairGateDecision, resolveExpenseActionRow, type ExpenseActionBar } from "@/domain/payments/action-row";
import { formatKstTime } from "@/domain/holidays/business-day";
import { findExpenseApprovalInstance, lockExpenseForUpdate } from "@/repositories/expenses";
import { bumpExpenseVersion, findLivePayment } from "@/repositories/expense-payments";
import { upsertReview } from "@/repositories/expense-evidence-reviews";
import { withTransaction } from "@/lib/db-transaction";
import { UserFacingError } from "@/lib/actions/user-facing-error";

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

// ── 증빙 확인 ─────────────────────────────────────────────────────────
// DR-4 응답 모양 — 06-15 · 06-17(S1) · 06-20(S3) 제자리 확인이 응답 version으로 행을 바꾼다.
export type ConfirmEvidenceResult = { version: number; evidenceStatus: EvidenceStatus; actionRow: ExpenseActionBar };

export type ConfirmEvidenceInput = {
  expenseId: string;
  version: number;
  correctedAmountKrw?: number;
};

// 지급 권한(expenses.payments write)이 있어야 한다(D-601). 권한 · 사전 조회는 트랜잭션 전. 한 트랜잭션: 05 lockExpenseForUpdate →
// 문서 version 비교 → 결재 통과(같은 tx) → hasEvidence(…, tx) → 확인 기록 upsert → 문서 version + 1 → 행동 로그(같은 tx).
export async function confirmEvidence(viewer: Viewer, input: ConfirmEvidenceInput): Promise<ConfirmEvidenceResult> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("증빙 확인 권한 없음");
  if (!UUID_SHAPE.test(input.expenseId)) throw new EvidenceReviewNotFoundError();
  const payments = await import("@/domain/payments");
  const shared = await payments.loadPaymentShared(viewer);
  const amountVisible = await visible(viewer, "expense.amount");

  const committed = await withTransaction(async (tx) => {
    const locked = await lockExpenseForUpdate(viewer, input.expenseId, tx);
    if (!locked) throw new EvidenceReviewNotFoundError();
    const conflict = `다른 사람이 ${formatKstTime(locked.updatedAt)}에 바꿈 · 새로 고침`;
    if (locked.version !== input.version) throw new EvidenceReviewConflictError(conflict);
    const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: locked.id }, tx);
    const approval = approvalGateDecision({ approvalState: instance?.status ?? null, stepName: null });
    if (!approval.allowed) throw new GateBlockedError(approval.reason);
    if (!(await hasEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: locked.id }, tx))) throw new UserFacingError(NOTHING_TO_CONFIRM);

    const review = await upsertReview(
      viewer,
      { expenseId: locked.id, status: "confirmed", amountBeforeKrw: null, amountAfterKrw: null, waiveReason: null, reviewedBy: viewer.id },
      tx,
    );
    const version = await bumpExpenseVersion(viewer, { expenseId: locked.id, expectedVersion: locked.version, updatedBy: viewer.id }, tx);
    if (version === null) throw new EvidenceReviewConflictError(conflict);
    await recordAction(
      viewer,
      { actionType: "document_update", entity: "expense", entityId: locked.id, documentId: locked.id, detail: { field: "evidenceReview", status: "confirmed" } },
      { tx },
    );
    const paid = (await findLivePayment(viewer, locked.id, tx)) !== null;
    return { version, locked, approvalState: instance?.status ?? null, reviewedAt: review.reviewedAt, paid };
  });

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
