import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expenses } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { getExpense, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { payRuleLine, resolvePaySchedule } from "@/domain/payments/pay-schedule";
import { loadPayScheduleConfig } from "@/domain/payments/pay-schedule-load";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { setupExpenseProject, type ExpenseFixture } from "../fixtures/expenses";
import { createDraftExpenseFixture, createInReviewExpenseFixture, insertLinkFixture, insertRecordFixture } from "../fixtures/evidence";
import { makePaymentManager } from "../fixtures/payments";

// 07-06(D-715 · D-714 · D-740 · D-742): 지출결의 DTO의 지급 예정일 = 유효 예정일(수동 ?? 자동). 자동값은 어떤 저장으로도 칸에 굳지 않는다.
// 공휴일이 없는 주로 고정: 기준(증빙 작성일) 2026-06-08 + 60 = 2026-08-07(금) · 승인 2026-08-01 10:00 → 마감 2026-08-06(목) 14:00 안 → 밀림 없음.
const kst = (at: string) => new Date(`${at}:00+09:00`);

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager(`유효일-${randomUUID().slice(0, 6)}`);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function columnsOf(expenseId: string) {
  const [row] = await db
    .select({ date: expenses.scheduledPaymentDate, setBy: expenses.scheduledPaymentSetBy, setAt: expenses.scheduledPaymentSetAt, version: expenses.version })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

// 결재 통과 + 지금 차수 승인 단계 acted_at 고정. manual이면 저장 칸에 직접(D-740 — 기록 칸 없는 기존 값 = 수동 지정).
async function approved(payer: Viewer, input: { issuedOn: string; actedAt: Date; manual?: string; fx?: ExpenseFixture }): Promise<{ expenseId: string; fx: ExpenseFixture }> {
  const fx = input.fx ?? (await setupExpenseProject());
  const doc = await createInReviewExpenseFixture(fx, { linkRecordId: await insertRecordFixture(payer, { issuedOn: input.issuedOn }), linkedBy: payer.id });
  const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, doc.instanceId));
  let version = instance?.version ?? 0;
  for (const approver of [fx.lead, fx.ceo]) version = (await approveDocument(approver, { instanceId: doc.instanceId, expectedVersion: version })).version;
  const routes = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(and(eq(approvalRoutes.instanceId, doc.instanceId), eq(approvalRoutes.round, 1)));
  await db.update(approvalSteps).set({ actedAt: input.actedAt }).where(inArray(approvalSteps.routeId, routes.map((route) => route.id)));
  if (input.manual) await db.update(expenses).set({ scheduledPaymentDate: input.manual }).where(eq(expenses.id, doc.expenseId));
  return { expenseId: doc.expenseId, fx };
}

describe("07-06 Task 1 — 상세 DTO 유효 예정일 (D-715 · D-714)", () => {
  it("B-P1-1: 상세 DTO의 유효 예정일을 그대로 되돌려 보내는 임시 저장 · 제출 뒤에도 칸은 NULL이고 DTO는 여전히 자동값", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const expenseId = await createDraftExpenseFixture(fx);
    await insertLinkFixture({ recordId: await insertRecordFixture(payer, { issuedOn: "2026-10-12" }), ownerId: expenseId, attachedBy: fx.pm.id });

    const first = await getExpense(fx.pm, { expenseId });
    expect(first?.scheduledPaymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first?.scheduledPaymentManual).toBe(false);

    const { version } = await columnsOf(expenseId);
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields: { scheduledPaymentDate: first?.scheduledPaymentDate ?? null, note: "왕복" } });
    expect(await columnsOf(expenseId)).toMatchObject({ date: null, setBy: null, setAt: null });
    const again = await getExpense(fx.pm, { expenseId });
    expect(again).toMatchObject({ scheduledPaymentDate: first?.scheduledPaymentDate, scheduledPaymentManual: false, note: "왕복" });

    const submitted = await submitExpense(fx.pm, { expenseId, expectedVersion: (await columnsOf(expenseId)).version });
    expect(submitted.kind).toBe("submitted");
    expect(await columnsOf(expenseId)).toMatchObject({ date: null, setBy: null, setAt: null });
  }, 30_000);

  it("상세 DTO가 자동 예정일 · 밀림 사유 · 규칙 줄(07-01 payRuleLine 결과)을 싣는다", async () => {
    const payer = await makePayer();
    const { expenseId } = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00") });
    const cfg = await loadPayScheduleConfig();
    const lookup = await loadHolidayLookup([2026, 2027]);
    const expected = resolvePaySchedule({ baseDate: "2026-06-08", termDays: cfg.termDays, manualDate: null, approvedAt: kst("2026-08-01T10:00"), now: new Date(), lookup, cfg });
    expect(expected.payDate).toBe("2026-08-07");

    const doc = await getExpense(payer, { expenseId });
    expect(doc).toMatchObject({
      scheduledPaymentDate: "2026-08-07",
      scheduledPaymentManual: false,
      autoPaymentDate: "2026-08-07",
      paymentPushReason: null,
      paymentRuleLine: payRuleLine(expected, cfg.termDays, cfg),
      paymentOffWeekday: null,
    });
    expect(await columnsOf(expenseId)).toMatchObject({ date: null });
  }, 30_000);

  it("수동 지정 날짜의 요일이 설정 지급 요일과 다를 때만 `{요일}요일 아님`(C6 — 자동 · 지급 요일 수동은 null)", async () => {
    const payer = await makePayer();
    const cfg = await loadPayScheduleConfig();
    expect(cfg.payWeekday).toBe("fri");
    const thursday = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00"), manual: "2026-08-06" });
    const friday = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00"), manual: "2026-08-07" });

    expect(await getExpense(payer, { expenseId: thursday.expenseId })).toMatchObject({
      scheduledPaymentDate: "2026-08-06",
      scheduledPaymentManual: true,
      autoPaymentDate: "2026-08-07",
      paymentRuleLine: "결재 마감 면제",
      paymentOffWeekday: "금요일 아님",
    });
    expect(await getExpense(payer, { expenseId: friday.expenseId })).toMatchObject({ scheduledPaymentManual: true, paymentOffWeekday: null });
  }, 60_000);
});
