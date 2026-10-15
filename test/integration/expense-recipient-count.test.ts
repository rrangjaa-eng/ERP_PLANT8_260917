import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { listMyInbox } from "@/domain/approvals";
import { createExpenseFromLines, createTeamExpenseDraft, getExpense, listExpenseFormOptions, previewExpense, saveExpenseDraft } from "@/domain/expenses";
import { TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 06.5 카드 ① · V15: 회사 대납(기타소득) 면제는 받는 사람 한 명당 기준 — 기안자가 적은 받는 인원이 미리보기 · 제출 스냅숏 계산에 실린다.
// 받는 인원은 금액 정보 항목(expense.amount)이라 금액을 못 보는 계급에는 문서 DTO · 결재 상세 행에서 빠진다.

async function expenseRow(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function otherIncomeDraft(fx: ExpenseFixture, recipientCount: number): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  await saveExpenseDraft(fx.pm, {
    expenseId,
    expectedVersion: 1,
    fields: { evidenceType: "other_income", supply: { currency: "KRW", amount: 150_000, fxRate: 1 }, recipientCount },
  });
  return expenseId;
}

describe("받는 인원 · 사람별 면제(06.5 카드 ① · V15)", () => {
  it("공급가 150,000 · 받는 인원 5 → 미리보기 면제 줄, 1 → 회사 대납 세금 42,300(150,000 ÷ 0.78 − 150,000의 10원 절사)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await otherIncomeDraft(fx, 5);
    expect((await expenseRow(expenseId)).recipientCount).toBe(5);

    const exempt = await previewExpense(fx.pm, { expenseId, fields: {} });
    expect(exempt.taxLine?.text).toBe("회사 대납 세금 0 · 면제 기준 이하 · 지급 총액 150,000 · 기타소득 규칙");
    const single = await previewExpense(fx.pm, { expenseId, fields: { recipientCount: 1 } });
    expect(single.taxLine?.text).toBe("회사 대납 세금 22% 42,300 · 지급 총액 150,000 · 기타소득 규칙");
  });

  it("받는 인원 1로 저장 · 제출 → 스냅숏 세금이 미리보기와 같다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await otherIncomeDraft(fx, 1);
    const preview = await previewExpense(fx.pm, { expenseId, fields: {} });
    await submitReadyDraft(fx.pm, expenseId);
    expect(await expenseRow(expenseId)).toMatchObject({ taxRuleKind: "company_borne", companyBorneKrw: 42_300, recipientCount: 1 });
    expect((await getExpense(fx.pm, { expenseId }))?.taxLine?.text).toBe(preview.taxLine?.text);
  });

  it("받는 인원 5로 제출 → 스냅숏 회사 대납 세금 0", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await otherIncomeDraft(fx, 5);
    await submitReadyDraft(fx.pm, expenseId);
    expect(await expenseRow(expenseId)).toMatchObject({ taxRuleKind: "company_borne", companyBorneKrw: 0, recipientCount: 5 });
  });

  it("새 팀 비용 첫 저장 칸 recipientCount 3 → 행에 3", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await createTeamExpenseDraft(fx.lead, {
      idempotencyKey: randomUUID(),
      fields: { teamExpenseKind: "team_overhead", content: "팀 회식", recipientCount: 3 },
    });
    expect((await expenseRow(expenseId)).recipientCount).toBe(3);
  });

  it("폼 선택지 companyBorne — 세금 규칙이 회사 대납인 증빙 코드만", async () => {
    const fx = await setupExpenseProject();
    const options = await listExpenseFormOptions(fx.pm);
    expect(options.companyBorne).toContain("other_income");
    expect(options.companyBorne).not.toContain("tax_invoice");
    expect(options.companyBorne.every((value) => options.evidence.some((option) => option.value === value))).toBe(true);
  });
});

describe("받는 인원 투영(06.5 V15)", () => {
  it("문서 DTO · 결재 상세 행 `받는 인원 {N}명` — 회사 대납 문서에만, 금액 숨김 계급에는 없다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await otherIncomeDraft(fx, 5);
    await submitReadyDraft(fx.pm, expenseId);

    expect((await getExpense(fx.pm, { expenseId }))?.recipientCount).toBe(5);
    const shown = (await listMyInbox(fx.lead, { withDetails: true })).mine[0]?.detail;
    expect(shown?.rows.filter((row) => row.label === "받는 인원").map((row) => row.value)).toEqual(["5명"]);

    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "expense.amount", visible: false });
    const hiddenDoc = await getExpense(fx.lead, { expenseId });
    expect(hiddenDoc).toBeTruthy();
    expect(hiddenDoc && "recipientCount" in hiddenDoc).toBe(false);
    const hidden = (await listMyInbox(fx.lead, { withDetails: true })).mine[0]?.detail;
    expect(hidden).toBeTruthy();
    expect(hidden?.rows.some((row) => row.label === "받는 인원")).toBe(false);
  });

  it("회사 대납이 아닌 문서는 결재 상세에 받는 인원 행이 없다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    await submitReadyDraft(fx.pm, expenseId);
    const detail = (await listMyInbox(fx.lead, { withDetails: true })).mine[0]?.detail;
    expect(detail).toBeTruthy();
    expect(detail?.rows.some((row) => row.label === "받는 인원")).toBe(false);
  });
});
