import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expenses } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND, submitExpense } from "@/domain/expenses";
import { listCurrentRoundApprovedAt } from "@/repositories/expenses";
import { attachEvidence, setupExpenseProject, type ExpenseFixture } from "../fixtures/expenses";
import { createInReviewExpenseFixture, createReturnedExpenseFixture } from "../fixtures/evidence";

// 07-01 Task 2(D-703 · P4 · T-07-01-01): 결재 마감 판정의 승인 시각 = 지금 차수 승인 단계 acted_at(서버 시각)의 최댓값. 인스턴스 updated_at
// (승인 뒤 증빙 변경으로 올라감)이나 앞 차수 단계 값을 따라가면 실패한다.

async function instanceVersion(instanceId: string): Promise<{ version: number; currentRound: number }> {
  const [row] = await db.select({ version: approvalInstances.version, currentRound: approvalInstances.currentRound }).from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function approveAll(fx: ExpenseFixture, instanceId: string): Promise<void> {
  let { version } = await instanceVersion(instanceId);
  for (const approver of [fx.lead, fx.ceo]) version = (await approveDocument(approver, { instanceId, expectedVersion: version })).version;
  const [status] = await db.select({ status: approvalInstances.status }).from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  if (status?.status !== "approved") throw new Error(`결재 통과 안 됨: ${status?.status}`);
}

// 그 차수의 처리한 단계 acted_at을 시험이 정한 시각으로 맞춘다.
async function setActedAt(instanceId: string, round: number, at: Date): Promise<void> {
  const routes = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(and(eq(approvalRoutes.instanceId, instanceId), eq(approvalRoutes.round, round)));
  await db
    .update(approvalSteps)
    .set({ actedAt: at })
    .where(inArray(approvalSteps.routeId, routes.map((route) => route.id)));
}

const kst = (at: string) => new Date(`${at}:00+09:00`);

describe("listCurrentRoundApprovedAt (P4)", () => {
  it("승인 뒤 증빙을 바꿔 인스턴스 updated_at이 올라도 승인 시각은 마지막 승인 단계 acted_at", async () => {
    const fx = await setupExpenseProject();
    const doc = await createInReviewExpenseFixture(fx);
    await approveAll(fx, doc.instanceId);
    await setActedAt(doc.instanceId, 1, kst("2026-08-06T14:00"));
    await attachEvidence(fx.pm, doc.expenseId);
    await db.update(approvalInstances).set({ updatedAt: kst("2026-08-07T09:00") }).where(eq(approvalInstances.id, doc.instanceId));

    const approvedAt = await listCurrentRoundApprovedAt(fx.pm, { documentKind: EXPENSE_DOCUMENT_KIND, expenseIds: [doc.expenseId] });
    expect(approvedAt.get(doc.expenseId)?.toISOString()).toBe(kst("2026-08-06T14:00").toISOString());
  });

  it("결재 중이면 null", async () => {
    const fx = await setupExpenseProject();
    const doc = await createInReviewExpenseFixture(fx);
    const approvedAt = await listCurrentRoundApprovedAt(fx.pm, { documentKind: EXPENSE_DOCUMENT_KIND, expenseIds: [doc.expenseId] });
    expect(approvedAt.has(doc.expenseId)).toBe(true);
    expect(approvedAt.get(doc.expenseId)).toBeNull();
  });

  it("반려 뒤 2차 승인이면 2차 차수 값(1차 단계가 더 늦은 시각이어도)", async () => {
    const fx = await setupExpenseProject();
    const returned = await createReturnedExpenseFixture(fx);
    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, returned.expenseId));
    if (!row) throw new Error("지출결의 없음");
    const resubmitted = await submitExpense(fx.pm, { expenseId: returned.expenseId, expectedVersion: row.version });
    if (resubmitted.kind !== "submitted") throw new Error("다시 제출 안 됨");
    expect((await instanceVersion(resubmitted.instanceId)).currentRound).toBe(2);
    await approveAll(fx, resubmitted.instanceId);
    await setActedAt(resubmitted.instanceId, 1, kst("2026-12-31T09:00"));
    await setActedAt(resubmitted.instanceId, 2, kst("2026-08-06T13:59"));

    const approvedAt = await listCurrentRoundApprovedAt(fx.pm, { documentKind: EXPENSE_DOCUMENT_KIND, expenseIds: [returned.expenseId] });
    expect(approvedAt.get(returned.expenseId)?.toISOString()).toBe(kst("2026-08-06T13:59").toISOString());
  });

  it("빈 id 묶음이면 질의 없이 빈 맵", async () => {
    const fx = await setupExpenseProject();
    expect((await listCurrentRoundApprovedAt(fx.pm, { documentKind: EXPENSE_DOCUMENT_KIND, expenseIds: [] })).size).toBe(0);
  });
});
