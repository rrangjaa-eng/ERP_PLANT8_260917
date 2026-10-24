import { describe, expect, it } from "vitest";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { buildExpenseSubmitContext, EXPENSE_REQUIRED_FIELDS, firstExpenseSubmitBlock, nextActionTarget, type ExpenseSubmitFacts } from "@/domain/expenses/gate";
import { expenseDraftFieldsSchema } from "@/domain/expenses/draft-fields";

// 07-28(J13 · N8): 지출결의 `상세`(DB 칸 note)는 제출 때 필수 — 서버 submitExpense와 화면 제출 막힘이 같은 firstExpenseSubmitBlock 한 길이다.
// 임시 저장은 비어도 된다(draftFieldsSchema에 필수를 걸지 않는다).

const PASSING: ExpenseSubmitFacts = {
  customerApproval: null,
  projectCompleted: false,
  line: null,
  payee: { kind: "vendor", id: "vendor-1" },
  payeeAccountMissing: false,
  teamCost: null,
  supplyAmountKrw: 1_000_000,
  evidenceType: "tax_invoice",
  paymentMethod: "bank_transfer",
  note: "행사 운영비",
  evidenceTypeInactive: false,
  paymentMethodInactive: false,
  prepaid: false,
  prepaidReason: null,
  evidenceCount: 1,
  taxUnavailable: false,
  methodEvidencePairs: [],
};

function facts(...overrides: Partial<ExpenseSubmitFacts>[]): ExpenseSubmitFacts {
  return Object.assign({}, PASSING, ...overrides) as ExpenseSubmitFacts;
}

async function blockOf(input: ExpenseSubmitFacts) {
  return firstExpenseSubmitBlock(null, buildExpenseSubmitContext(input));
}

describe("상세(note) — 제출 필수", () => {
  it("상세가 있으면 이 단계는 통과다", async () => {
    expect(await blockOf(PASSING)).toBeNull();
  });

  it("상세가 비면(null) 막힘 target note · `상세 비어 있음 · 상세 입력`", async () => {
    expect(await blockOf(facts({ note: null }))).toEqual({ reason: "상세 비어 있음 · 상세 입력", target: "note" });
  });

  it("공백만 적어도 비어 있음이다", async () => {
    expect(await blockOf(facts({ note: "   " }))).toEqual({ reason: "상세 비어 있음 · 상세 입력", target: "note" });
  });

  it("다른 빈 칸과 함께면 `{라벨들} N칸 비어 있음` 꼴에 상세가 든다", async () => {
    const block = await blockOf(facts({ note: null, evidenceType: null }));
    expect(block).toEqual({ reason: "증빙 종류, 상세 2칸 비어 있음 · 증빙 종류 고르기", target: "evidenceType" });
  });

  it("다음 한 수 대상도 note다", async () => {
    expect(await nextActionTarget(facts({ note: null }))).toBe("note");
  });

  it("규칙 expense.submit(서버가 부르는 길)도 같은 글자로 막는다", async () => {
    const decision = await gate(null, "expense.submit", buildExpenseSubmitContext(facts({ note: "" })));
    expect(decision).toEqual({ allowed: false, reason: "상세 비어 있음 · 상세 입력" });
  });

  it("팀 비용 문서도 폼이 상세 칸을 그리므로 요구한다(종류 · 내용 뒤)", async () => {
    const team = facts({ teamCost: { kind: "team_overhead", content: "회식" }, note: null });
    expect(await blockOf(team)).toEqual({ reason: "상세 비어 있음 · 상세 입력", target: "note" });
  });

  it("필수 칸 표에 상세 줄이 있다", () => {
    expect(EXPENSE_REQUIRED_FIELDS).toContainEqual({ target: "note", label: "상세", next: "입력" });
  });
});

describe("상세(note) — 임시 저장은 비어도 된다", () => {
  it("note null · 빈 문자열 모두 draftFieldsSchema 통과", () => {
    expect(expenseDraftFieldsSchema.safeParse({ note: null }).success).toBe(true);
    expect(expenseDraftFieldsSchema.safeParse({ note: "" }).success).toBe(true);
  });
});
