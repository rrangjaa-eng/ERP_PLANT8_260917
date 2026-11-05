import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 07.4-01 /review: 페이지 본문 분기(계산 불가 · 정상 · 금액 못 봄)를 서버 컴포넌트째 렌더해 단언한다. 읽기 함수는 모두 가짜로 바꾸고,
// 페이지가 만드는 표 · 합계 행만 본다(DB 없음). 계산 불가 글자 자체는 expense-tax-rows 단위 시험이 따로 단언한다.
const state = vi.hoisted((): { expense: Record<string, unknown> } => ({ expense: {} }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/domain/approvals", () => ({ getApprovalView: () => Promise.resolve(null) }));
vi.mock("@/domain/approvals/route", () => ({ statusStepLabel: (label: string) => label }));
vi.mock("@/domain/evidence", () => ({ listEvidence: () => Promise.resolve([]) }));
vi.mock("@/domain/expenses", () => ({ EXPENSE_DOCUMENT_KIND: "expense" }));
vi.mock("@/domain/money", () => ({ formatRatePercent: (rate: number) => `${Math.round(rate * 100)}%` }));
vi.mock("@/domain/print/current-round", () => ({ currentApprovalRound: () => Promise.resolve(null) }));
vi.mock("@/domain/print/company", () => ({ loadPrintCompany: () => Promise.resolve({ name: "", address: "", businessNo: "", representative: "", phone: "" }) }));
vi.mock("@/lib/viewer", () => ({ getSessionId: () => Promise.resolve("session"), requireSession: () => Promise.resolve({ viewer: { id: "viewer", roleId: "role-pm" } }) }));
vi.mock("@/app/print/_frame/PrintBar", () => ({ PrintBar: () => null }));
vi.mock("@/app/print/expenses/[id]/load", () => ({ loadExpenseForPrint: () => Promise.resolve(state.expense) }));

const { default: ExpensePrintPage } = await import("../../../app/print/expenses/[id]/page");

const base = {
  number: "EXP-2026-0001",
  statusWord: "",
  usageDate: null,
  projectNumber: "26001",
  projectName: "프로젝트",
  lineNo: 1,
  itemName: "무대 제작",
  vendorName: "거래처",
  evidenceTypeName: "세금계산서",
  evidenceDate: "2026-09-05",
  paymentMethodName: "계좌이체",
  scheduledPaymentDate: "2026-09-19",
  note: "",
  drafterName: "기안자",
  submittedAt: new Date("2026-09-05T00:00:00Z"),
};
const supply = { currency: "KRW", amountKrw: 12_400_000, foreignAmount: null, fxRate: 1 };

async function render(expense: Record<string, unknown>): Promise<string> {
  state.expense = expense;
  const element = (await ExpensePrintPage({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) })) as ReactNode;
  return renderToStaticMarkup(createElement("div", null, element));
}

describe("지출결의서 인쇄 페이지 — 세금 · 합계 분기", () => {
  it("세율 설정이 없어 계산 불가면 세금 행 하나가 두 칸을 합치고 합계 행 · 한글 금액이 없다", async () => {
    const html = await render({ ...base, supply, taxResult: { unavailable: true } });
    expect(html).toContain("계산 불가 · 세율 없음");
    expect(html).toMatch(/<td[^>]*colSpan="2"[^>]*>(?:(?!<\/td>).)*계산 불가 · 세율 없음/);
    expect(html).not.toContain("<tfoot");
    expect(html).not.toContain("지급 총액");
    expect(html).not.toContain("실지급액");
    expect(html).not.toMatch(/금 .+ 원정/);
    expect(html.match(/계산 불가/g)).toHaveLength(1);
  });

  it("부가세 문서는 세금 행 · 합계 행(지급 총액) · 한글 금액이 있다", async () => {
    const html = await render({ ...base, supply, taxResult: { ruleKind: "vat_surcharge", rate: 0.1, vatKrw: 1_240_000, withholdingKrw: 0, companyBorneKrw: 0, payableKrw: 13_640_000 } });
    expect(html).toContain("<tfoot");
    expect(html).toContain("지급 총액");
    expect(html).toContain("금 일천삼백육십사만 원정");
    expect(html).not.toContain("계산 불가");
  });

  it("금액 키가 투영으로 빠진 문서는 금액 열 · 세금 · 합계가 없다", async () => {
    const html = await render({ ...base });
    expect(html).not.toContain("<tfoot");
    expect(html).not.toContain("지급 총액");
    expect(html).not.toContain("계산 불가");
    expect(html).not.toContain(">금액<");
    expect(html).toContain("공급가액");
  });
});
