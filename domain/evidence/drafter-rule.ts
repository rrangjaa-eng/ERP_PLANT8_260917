// 07.1-03 D-7101(E-P2-09) — 지출결의 기안자의 증빙 붙임 · 떼기 규칙 한 곳. OWNER_RULES.expense와 지급 게이트(단건 · 목록)가 같은 답을 읽는다.
// import 0인 잎 모듈 — evidence index는 expenses를, expenses는 evidence-reviews를 정적으로 부르므로 evidence-reviews가 index를 부르면 런타임 순환이다.

export type ExpenseDrafterRuleInput = { closed: boolean; number: string | null; status: string | null; projectCompleted: boolean };

const EXPENSE_RETURNED_STATUSES = new Set(["rejected", "withdrawn"]);
export const EXPENSE_IN_REVIEW_STATUSES = new Set(["submitted", "in_review"]);

export function expenseDrafterRemoves(owner: ExpenseDrafterRuleInput): boolean {
  return !owner.closed && ((owner.number === null && owner.status === null) || (owner.status !== null && EXPENSE_RETURNED_STATUSES.has(owner.status)));
}

export function expenseDrafterAddsEvidence(owner: ExpenseDrafterRuleInput): boolean {
  // 종결 문서는 증빙을 읽기만 한다(06-28) — 승인 · 미완료 갈래도 closed를 본다(#309 검토 P3).
  return expenseDrafterRemoves(owner) || (!owner.closed && owner.status === "approved" && !owner.projectCompleted);
}
