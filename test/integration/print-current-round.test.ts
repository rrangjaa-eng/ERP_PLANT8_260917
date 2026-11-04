import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, expenses } from "@/db/schema";
import { rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, getExpense, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { currentApprovalRound } from "@/domain/print/current-round";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 07.4-01 eng 재검토 R2 — 결재란 기안 칸 일시의 한 출처. 서류 행의 제출 시각은 다시 제출해도 첫 값이라 쓰지 않는다.

async function draftOf(fx: ExpenseFixture): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

async function routesOf(documentId: string) {
  return db
    .select({ round: approvalRoutes.round, submittedAt: approvalRoutes.submittedAt, drafterTeamId: approvalRoutes.drafterTeamId, drafterOrgUnitId: approvalRoutes.drafterOrgUnitId })
    .from(approvalRoutes)
    .innerJoin(approvalInstances, eq(approvalInstances.id, approvalRoutes.instanceId))
    .where(eq(approvalInstances.documentId, documentId))
    .orderBy(asc(approvalRoutes.round));
}

describe("currentApprovalRound", () => {
  it("제출한 지출결의는 1차 route의 상신 시각 · 기안자 팀 · 본부를 돌려준다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    await submitReadyDraft(fx.pm, expenseId);
    const [round1] = await routesOf(expenseId);
    const current = await currentApprovalRound(fx.pm, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    expect(current).toEqual({ submittedAt: round1?.submittedAt, drafterTeamId: round1?.drafterTeamId, drafterOrgUnitId: round1?.drafterOrgUnitId });
  });

  it("반려 뒤 다시 제출하면 2차 route의 시각이고 문서 행의 첫 제출 시각과 다르다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    const instanceId = submitted.kind === "submitted" ? submitted.instanceId : "";
    await rejectDocument(fx.lead, { instanceId, expectedVersion: 1, reason: "금액 확인" });
    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
    const saved = await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: row?.version ?? 0, fields: { note: "금액 고침" } });
    await submitExpense(fx.pm, { expenseId, expectedVersion: saved.version });

    const [round1, round2] = await routesOf(expenseId);
    expect(round2?.round).toBe(2);
    const current = await currentApprovalRound(fx.pm, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    expect(current?.submittedAt).toEqual(round2?.submittedAt);
    expect(current?.submittedAt.getTime()).toBeGreaterThan(round1?.submittedAt.getTime() ?? Infinity);
    const view = await getExpense(fx.pm, { expenseId });
    expect(view?.submittedAt?.getTime()).toBe(round1?.submittedAt.getTime());
    expect(view?.submittedAt?.getTime()).not.toBe(current?.submittedAt.getTime());
  });

  it("결재 인스턴스가 없는 작성 중 지출결의는 null이다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    expect(await currentApprovalRound(fx.pm, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId })).toBeNull();
  });

  it("반환 객체의 키는 정확히 세 칸이다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    await submitReadyDraft(fx.pm, expenseId);
    const current = await currentApprovalRound(fx.pm, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    expect(Object.keys(current ?? {}).sort()).toEqual(["drafterOrgUnitId", "drafterTeamId", "submittedAt"]);
  });
});
