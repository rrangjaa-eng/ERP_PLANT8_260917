import { gate, type GateDecision } from "@/domain/rules/gate";
import type { QuoteCustomerApprovalCtx } from "@/domain/rules/register";
import { PAYEE_ACCOUNT_MISSING, type ExpensePayee } from "@/domain/expenses/payee";
import type { PairGateInput } from "@/domain/payments/action-row";

// 05-03(UI-SPEC S6): 지출결의 제출 판정 — 첫 이유 하나. 05-06이 ①~⑨ 전부를 순서 표 하나(`stepsOf`)로 모았다:
// 규칙 `expense.submit`(domain/rules/register.ts)은 이 표를 순서대로 보고 첫 막힘의 글자를, `nextActionTarget`은 같은 표에서
// 그 막힘의 대상을 돌려준다 — 순서가 두 곳에 적히지 않는다. ① · ⑤ 글자는 기존 규칙(quote.customer-approval ·
// quote.vendor-required)의 결과 그대로다.

export type ExpenseSubmitTarget =
  | "customerApproval"
  | "quoteLine"
  | "openLatest"
  | "vendor"
  | "teamExpenseKind"
  | "content"
  | "supplyAmount"
  | "evidenceType"
  | "paymentMethod"
  | "payeeAccount"
  | "prepaidReason"
  | "evidence";

type FieldTarget = Extract<ExpenseSubmitTarget, "teamExpenseKind" | "content" | "supplyAmount" | "evidenceType" | "paymentMethod">;

export type ExpenseRequiredField = { target: FieldTarget; label: string; next: string };

// ⑥ 빈 칸 묶음의 칸 순서 · 라벨 · 다음 한 수(적기/고르기). 팀 비용 문서는 `종류` · `내용`이 앞에 든다(05-07이 칸을 그린다).
const TEAM_COST_FIELDS: readonly ExpenseRequiredField[] = [
  { target: "teamExpenseKind", label: "종류", next: "고르기" },
  { target: "content", label: "내용", next: "적기" },
];

export const EXPENSE_REQUIRED_FIELDS: readonly ExpenseRequiredField[] = [
  { target: "supplyAmount", label: "공급가액", next: "적기" },
  { target: "evidenceType", label: "증빙 종류", next: "고르기" },
  { target: "paymentMethod", label: "지급 방식", next: "고르기" },
];

export const PROJECT_COMPLETED = "완료 프로젝트 · 새 지출결의 없음";
export const TAX_UNAVAILABLE = "세금 계산 불가 · 세율은 경영관리";
// 쓰지 않는(보관 · 비활성) 코드 — 저장 거부(A4)와 제출 막힘(C4)이 같은 글자다.
export const INACTIVE_EVIDENCE_TYPE = "쓰지 않는 증빙 종류 · 증빙 종류 고르기";
export const INACTIVE_PAYMENT_METHOD = "쓰지 않는 지급 방식 · 지급 방식 고르기";
// 06-10(A#19 · EXP-13): 선결제 표시 · 사유 빔 — 저장 거부와 제출 막힘이 같은 글자다.
export const PREPAID_REASON_REQUIRED = "선결제 사유 없음 · 사유 적기";
// 07-16(SC-02 · D-714 · AQ-10): 희망 지급일 · 희망 사유 칸 오류(domain/expenses/draft-fields.ts requestedPaymentErrors). 폼이 글자로 칸을 가른다(선결제 사유와 같은 꼴).
export const REQUESTED_REASON_REQUIRED = "희망 사유 · 입력";
export const REQUESTED_DATE_PAST = "오늘 이후 날짜 · 다시 선택";
export const REQUESTED_DATE_MISSING = "희망 지급일 없음 · 날짜 선택";

export type ExpenseSubmitFacts = {
  // ① 견적 줄 문서의 현재 차수 고객 승인 사실(팀 비용 null).
  customerApproval: QuoteCustomerApprovalCtx | null;
  // ② 프로젝트가 완료.
  projectCompleted: boolean;
  // ③ ④ 견적 줄 문서만 — 줄이 현재(최신) 차수에 살아 있는가(D-54) · 작성 중에 그 줄의 문이 닫혔으면 가장 최근 문서.
  line: { inCurrentRevision: boolean; closedBy: { id: string; number: string } | null } | null;
  // ⑤ 문서 지급처 — 결정 맥락 15. 견적 줄의 거래처가 아니다.
  payee: ExpensePayee;
  // 계좌이체인데 지급처에 쓸 수 있는 계좌가 없다(D-6507). 지급처가 없으면 거짓 — ⑤가 먼저 막는다.
  payeeAccountMissing: boolean;
  // ⑥ 팀 비용 문서의 칸(견적 줄 문서 null).
  teamCost: { kind: string | null; content: string | null } | null;
  supplyAmountKrw: number | null;
  evidenceType: string | null;
  paymentMethod: string | null;
  // ⑥ 뒤 — 저장된 값이 그 뒤 보관 · 비활성된 코드(폼에는 이름으로 보이므로 빈 칸이 아니다).
  evidenceTypeInactive: boolean;
  paymentMethodInactive: boolean;
  // 06.1-12(E06 · RP-12 · 카드 R4): 지급 방식 × 증빙 종류 짝 판정 입력 — 첫째는 문서 증빙 종류 칸, 그 뒤는 살아 있는 붙임 기록의 종류 중
  // 문서 칸과 다른 것(methodEvidencePairsOf). 판정 몸통 · 글은 지급 게이트와 같은 등록 규칙이다.
  methodEvidencePairs: PairGateInput[];
  // ⑧ 앞 — 선결제 표시와 사유(잠근 행의 칸). 선결제면 ⑧ 증빙 없음이 풀린다.
  prepaid: boolean;
  prepaidReason: string | null;
  // ⑧ 살아 있는 증빙 파일 수 — 제출 트랜잭션 안에서는 tx로 센 값(UI Assumptions #5).
  evidenceCount: number;
  // ⑨ 세율 설정이 그 기준일에 없다.
  taxUnavailable: boolean;
};

type Step = { target: ExpenseSubmitTarget | null } & ({ rule: string; ruleCtx: unknown } | { reason: string | null });

export type ExpenseSubmitContext = { steps: readonly Step[] };

function emptyFields(facts: ExpenseSubmitFacts): ExpenseRequiredField[] {
  const values: Record<FieldTarget, unknown> = {
    teamExpenseKind: facts.teamCost?.kind,
    content: facts.teamCost?.content,
    supplyAmount: facts.supplyAmountKrw,
    evidenceType: facts.evidenceType,
    paymentMethod: facts.paymentMethod,
  };
  const fields = facts.teamCost ? [...TEAM_COST_FIELDS, ...EXPENSE_REQUIRED_FIELDS] : EXPENSE_REQUIRED_FIELDS;
  return fields.filter((field) => values[field.target] === null || values[field.target] === "");
}

// 06.1-12(카드 R4): 짝 판정 입력 — 문서 증빙 종류 칸 하나 + 붙은 기록 종류 중 문서 칸과 다른 것(중복 없이 코드 순). 이름은 같은 코드표
// 이름(보관 · 비활성 포함 — 없으면 규칙이 코드 값을 쓴다). DB 없음 — 짝 설정 · 이름 표는 트랜잭션 전, 기록 종류는 잠근 뒤 tx로 읽어 넘긴다.
export function methodEvidencePairsOf(input: {
  pairs: PairGateInput["pairs"];
  paymentMethod: string | null;
  evidenceType: string | null;
  recordEvidenceTypes: readonly string[];
  paymentNames: ReadonlyMap<string, string>;
  evidenceNames: ReadonlyMap<string, string>;
}): PairGateInput[] {
  const recordTypes = [...new Set(input.recordEvidenceTypes)].filter((type) => type !== input.evidenceType).sort();
  const paymentMethodName = input.paymentMethod ? (input.paymentNames.get(input.paymentMethod) ?? null) : null;
  return [input.evidenceType, ...recordTypes].map((evidenceType) => ({
    pairs: input.pairs,
    paymentMethod: input.paymentMethod,
    evidenceType,
    paymentMethodName,
    evidenceTypeName: evidenceType ? (input.evidenceNames.get(evidenceType) ?? null) : null,
  }));
}

// ①~⑨ 순서 표 — 이 함수 하나에만 순서가 있다. 선결제 사유 단계(06-10)는 공급가 0 단계 뒤, ⑧ 바로 앞이다.
// 짝 단계(06.1-12)는 지급 방식 비활성 바로 뒤 — 쓰지 않는 코드가 먼저 막고, 지급처 계좌 · ⑧보다 앞이다.
function stepsOf(facts: ExpenseSubmitFacts): Step[] {
  const empty = emptyFields(facts);
  const first = empty[0];
  const closedBy = facts.line?.closedBy;
  return [
    facts.customerApproval
      ? { target: "customerApproval", rule: "quote.customer-approval", ruleCtx: facts.customerApproval }
      : { target: "customerApproval", reason: null },
    { target: null, reason: facts.projectCompleted ? PROJECT_COMPLETED : null },
    { target: "quoteLine", reason: facts.line && !facts.line.inCurrentRevision ? "견적 줄이 현재 차수에 없음 · 견적 줄 바꾸기" : null },
    { target: "openLatest", reason: closedBy ? `이 줄에 지출결의 ${closedBy.number} 있음 · 지출결의 열기` : null },
    { target: "vendor", rule: "quote.vendor-required", ruleCtx: { vendorId: facts.payee?.id ?? null } },
    {
      target: first?.target ?? null,
      reason: first
        ? `${empty.map((field) => field.label).join(", ")}${empty.length > 1 ? ` ${empty.length}칸` : ""} 비어 있음 · ${first.label} ${first.next}`
        : null,
    },
    { target: "evidenceType", reason: facts.evidenceTypeInactive ? INACTIVE_EVIDENCE_TYPE : null },
    { target: "paymentMethod", reason: facts.paymentMethodInactive ? INACTIVE_PAYMENT_METHOD : null },
    ...facts.methodEvidencePairs.map((ruleCtx): Step => ({ target: "paymentMethod", rule: "payment.method-evidence-mismatch", ruleCtx })),
    { target: "payeeAccount", reason: facts.payeeAccountMissing ? PAYEE_ACCOUNT_MISSING : null },
    { target: "supplyAmount", reason: facts.supplyAmountKrw === 0 ? "공급가액이 0 · 0보다 크게" : null },
    { target: "prepaidReason", reason: facts.prepaid && !facts.prepaidReason?.trim() ? PREPAID_REASON_REQUIRED : null },
    { target: "evidence", reason: facts.evidenceCount === 0 && !facts.prepaid ? "증빙 없음 · 증빙 올리기 Ctrl+U" : null },
    { target: null, reason: facts.taxUnavailable ? TAX_UNAVAILABLE : null },
  ];
}

export function buildExpenseSubmitContext(facts: ExpenseSubmitFacts): ExpenseSubmitContext {
  return { steps: stepsOf(facts) };
}

// 표를 순서대로 보고 첫 막힘 하나(글자 · 대상). 규칙 단계는 등록된 규칙을 그대로 부른다.
export async function firstExpenseSubmitBlock(doc: unknown, ctx: ExpenseSubmitContext): Promise<{ reason: string; target: ExpenseSubmitTarget | null } | null> {
  for (const step of ctx.steps) {
    const decision: GateDecision =
      "rule" in step ? await gate(doc, step.rule, step.ruleCtx) : step.reason ? { allowed: false, reason: step.reason } : { allowed: true };
    if (!decision.allowed) return { reason: decision.reason, target: step.target };
  }
  return null;
}

export async function nextActionTarget(facts: ExpenseSubmitFacts): Promise<ExpenseSubmitTarget | null> {
  return (await firstExpenseSubmitBlock(null, buildExpenseSubmitContext(facts)))?.target ?? null;
}
