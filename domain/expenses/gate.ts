// 05-03(UI-SPEC S6): 지출결의 제출 판정 — 순수 함수, 첫 이유 하나. 이 플랜은 ③ ④ ⑥ ⑦을 이 순서로 판정하고
// 나머지(① 고객 승인 · ② 완료 프로젝트 · ⑤ 거래처 · ⑧ 증빙 · ⑨ 세금)는 05-04 · 05-06이 같은 함수에 끼운다.

export type ExpenseSubmitTarget = "quoteLine" | "openLatest" | "supplyAmount" | "evidenceType" | "paymentMethod";

export type ExpenseSubmitDecision = { allowed: true } | { allowed: false; reason: string; target: ExpenseSubmitTarget };

export type ExpenseRequiredField = { target: Extract<ExpenseSubmitTarget, "supplyAmount" | "evidenceType" | "paymentMethod">; label: string; next: string };

// ⑥ 빈 칸 묶음의 칸 순서 · 라벨 · 다음 한 수(적기/고르기).
export const EXPENSE_REQUIRED_FIELDS: readonly ExpenseRequiredField[] = [
  { target: "supplyAmount", label: "공급가액", next: "적기" },
  { target: "evidenceType", label: "증빙 종류", next: "고르기" },
  { target: "paymentMethod", label: "지급 방식", next: "고르기" },
];

export type ExpenseSubmitFacts = {
  // 견적 줄 문서일 때만 — 줄이 현재(최신) 차수에 살아 있는가(D-54).
  lineInCurrentRevision: boolean;
  // 작성 중에 그 줄의 문이 닫혔으면 가장 최근 문서.
  closedBy: { number: string } | null;
  supplyAmountKrw: number | null;
  evidenceType: string | null;
  paymentMethod: string | null;
};

export function evaluateExpenseSubmit(facts: ExpenseSubmitFacts): ExpenseSubmitDecision {
  if (!facts.lineInCurrentRevision) {
    return { allowed: false, reason: "견적 줄이 현재 차수에 없음 · 견적 줄 바꾸기", target: "quoteLine" };
  }
  if (facts.closedBy) {
    return { allowed: false, reason: `이 줄에 지출결의 ${facts.closedBy.number} 있음 · 지출결의 열기`, target: "openLatest" };
  }
  const values: Record<ExpenseRequiredField["target"], unknown> = {
    supplyAmount: facts.supplyAmountKrw,
    evidenceType: facts.evidenceType,
    paymentMethod: facts.paymentMethod,
  };
  const empty = EXPENSE_REQUIRED_FIELDS.filter((field) => values[field.target] === null || values[field.target] === "");
  const first = empty[0];
  if (first) {
    const names = empty.map((field) => field.label).join(", ");
    const count = empty.length > 1 ? ` ${empty.length}칸` : "";
    return { allowed: false, reason: `${names}${count} 비어 있음 · ${first.label} ${first.next}`, target: first.target };
  }
  if (facts.supplyAmountKrw === 0) {
    return { allowed: false, reason: "공급가액이 0 · 0보다 크게", target: "supplyAmount" };
  }
  return { allowed: true };
}
