import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, expensePayments, expenses } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { getExpense } from "@/domain/expenses";
import { ForbiddenError } from "@/domain/permissions/can";
import { moveToThisWeek, revertScheduledPayDates, saveScheduledPayDate } from "@/domain/payments";
import { listPaymentTargets } from "@/domain/payments/targets";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { setupExpenseProject } from "../fixtures/expenses";
import { createInReviewExpenseFixture, insertRecordFixture } from "../fixtures/evidence";
import { makePaymentManager } from "../fixtures/payments";

// 07-06 Task 3(D-714 · D-742 · D-740 · J9 · K6 · B-P2-3): 수동 지정 규칙 · 기록 칸 · 「이번 주로」(부분 결과) · 되돌리기.
// 공휴일이 없는 주로 고정: 기준(증빙 작성일) 2026-06-08 + 60 = 2026-08-07(금) · 마감 2026-08-06(목) 14:00.
// 밀린 건 = 그 마감 뒤(08-06 14:30) 승인 → 2026-08-14(금, pushReason cutoff). 안 밀린 건 = 08-01 승인 → 08-07.
// 「오늘」은 마감이 지난 목요일 2026-08-06 15:00(이번 주 지급일 08-07 전) — 밀린 건이 생기는 현실 시점.
const kst = (at: string) => new Date(`${at}:00+09:00`);
const THURSDAY_AFTER_CUTOFF = kst("2026-08-06T15:00");
const PUSHED_AT = kst("2026-08-06T14:30");
const ON_TIME_AT = kst("2026-08-01T10:00");
const NOT_BUSINESS_DAY = "영업일만 선택 · 다시 선택";
const WEEK_PASSED = "이번 주 지급일 지남";

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager(`이번주-${randomUUID().slice(0, 6)}`);
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

async function approved(payer: Viewer, actedAt: Date, issuedOn = "2026-06-08"): Promise<{ expenseId: string; pm: Viewer }> {
  const fx = await setupExpenseProject();
  const doc = await createInReviewExpenseFixture(fx, { linkRecordId: await insertRecordFixture(payer, { issuedOn }), linkedBy: payer.id });
  const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, doc.instanceId));
  let version = instance?.version ?? 0;
  for (const approver of [fx.lead, fx.ceo]) version = (await approveDocument(approver, { instanceId: doc.instanceId, expectedVersion: version })).version;
  const routes = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(and(eq(approvalRoutes.instanceId, doc.instanceId), eq(approvalRoutes.round, 1)));
  await db.update(approvalSteps).set({ actedAt }).where(inArray(approvalSteps.routeId, routes.map((route) => route.id)));
  return { expenseId: doc.expenseId, pm: fx.pm };
}

async function scheduleLogs(expenseId: string) {
  return db
    .select({ actionType: actionLog.actionType, detail: actionLog.detail, actorId: actionLog.actorId })
    .from(actionLog)
    .where(and(eq(actionLog.documentId, expenseId), inArray(actionLog.actionType, ["payment_schedule_change", "document_update"])))
    .orderBy(asc(actionLog.seq));
}

async function item(expenseId: string) {
  return { expenseId, version: (await columnsOf(expenseId)).version };
}

describe("수동 지정 규칙 · 기록 칸 (07-06 Task 3 · D-714 · D-742)", () => {
  it("지급 권한 없는 계정은 저장 못 함", async () => {
    const payer = await makePayer();
    const doc = await approved(payer, ON_TIME_AT);
    const { version } = await columnsOf(doc.expenseId);
    await expect(saveScheduledPayDate(doc.pm, { expenseId: doc.expenseId, scheduledPayDate: "2026-08-07", version })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await columnsOf(doc.expenseId)).toMatchObject({ date: null, setBy: null, setAt: null });
  }, 30_000);

  it("토요일 · 공휴일 거부, 지급 요일 아닌 영업일은 저장 + offWeekday, 기록 칸 = 누가 · 언제, 빈 값 = 자동 복귀(셋 다 NULL), 로그 payment_schedule_change", async () => {
    const payer = await makePayer();
    const doc = await approved(payer, ON_TIME_AT);
    const v0 = (await columnsOf(doc.expenseId)).version;

    await expect(saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: "2026-08-08", version: v0 })).rejects.toThrow(NOT_BUSINESS_DAY);
    // 2026-10-09(금) 한글날.
    await expect(saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: "2026-10-09", version: v0 })).rejects.toThrow(NOT_BUSINESS_DAY);
    expect(await columnsOf(doc.expenseId)).toMatchObject({ date: null, setBy: null, setAt: null, version: v0 });

    const before = Date.now();
    const thursday = await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: "2026-08-13", version: v0 });
    expect(thursday).toEqual({ version: v0 + 1, offWeekday: true });
    const saved = await columnsOf(doc.expenseId);
    expect(saved).toMatchObject({ date: "2026-08-13", setBy: payer.id, version: v0 + 1 });
    expect(saved.setAt?.getTime()).toBeGreaterThanOrEqual(before - 1_000);

    const friday = await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: "2026-08-14", version: thursday.version });
    expect(friday).toEqual({ version: v0 + 2, offWeekday: false });

    const auto = await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: null, version: friday.version });
    expect(auto).toEqual({ version: v0 + 3, offWeekday: false });
    expect(await columnsOf(doc.expenseId)).toMatchObject({ date: null, setBy: null, setAt: null });
    expect(await getExpense(payer, { expenseId: doc.expenseId })).toMatchObject({ scheduledPaymentDate: "2026-08-07", scheduledPaymentManual: false });

    expect(await scheduleLogs(doc.expenseId)).toEqual([
      { actionType: "payment_schedule_change", actorId: payer.id, detail: { changes: { scheduledPaymentDate: [null, "2026-08-13"] } } },
      { actionType: "payment_schedule_change", actorId: payer.id, detail: { changes: { scheduledPaymentDate: ["2026-08-13", "2026-08-14"] } } },
      { actionType: "payment_schedule_change", actorId: payer.id, detail: { changes: { scheduledPaymentDate: ["2026-08-14", null] } } },
    ]);
  }, 30_000);

  it("D-742: 마감 지나 밀린 건을 수동 지정하면 다음 읽기에서 밀림 없음 · 결재 마감 면제 · 지정한 날 묶음", async () => {
    const payer = await makePayer();
    const doc = await approved(payer, PUSHED_AT);
    expect(await getExpense(payer, { expenseId: doc.expenseId })).toMatchObject({ scheduledPaymentDate: "2026-08-14", paymentPushReason: "cutoff" });
    await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: "2026-08-07", version: (await columnsOf(doc.expenseId)).version });
    expect(await getExpense(payer, { expenseId: doc.expenseId })).toMatchObject({
      scheduledPaymentDate: "2026-08-07",
      scheduledPaymentManual: true,
      paymentPushReason: null,
      paymentRuleLine: "결재 마감 면제",
    });
    const targets = await listPaymentTargets(payer, {}, { pageSize: 10_000, today: "2026-08-06", now: THURSDAY_AFTER_CUTOFF });
    const group = targets.groups.find((candidate) => candidate.rows.some((row) => row.id === doc.expenseId));
    expect(group?.rows.find((row) => row.id === doc.expenseId)).toMatchObject({ scheduledPaymentDate: "2026-08-07" });
  }, 30_000);
});

describe("이번 주로 · 되돌리기 (07-06 Task 3 · J9 · K6 · B-P2-3)", () => {
  it("섞인 건 → 밀린 둘만 이번 주 지급일로 옮기고, 안 밀린 · 지급된 · version 충돌 건은 그 건만 거부(부분 결과) · 되돌리기는 이전 값(자동)으로", async () => {
    const payer = await makePayer();
    const pushedA = await approved(payer, PUSHED_AT);
    const pushedB = await approved(payer, PUSHED_AT);
    const onTime = await approved(payer, ON_TIME_AT);
    const paid = await approved(payer, PUSHED_AT);
    const stale = await approved(payer, PUSHED_AT);
    await db.insert(expensePayments).values({
      expenseId: paid.expenseId,
      payDate: "2026-08-05",
      transferKrw: 1_000,
      payableKrw: 1_000,
      diffKrw: 0,
      paymentMethod: "bank_transfer",
      processedBy: payer.id,
      source: "test",
    });
    const staleItem = { expenseId: stale.expenseId, version: (await columnsOf(stale.expenseId)).version - 1 };

    const items = [await item(pushedA.expenseId), await item(onTime.expenseId), await item(paid.expenseId), staleItem, await item(pushedB.expenseId)];
    const result = await moveToThisWeek(payer, { items }, { now: THURSDAY_AFTER_CUTOFF });

    expect(result.moved.map((moved) => moved.expenseId).sort()).toEqual([pushedA.expenseId, pushedB.expenseId].sort());
    for (const moved of result.moved) {
      expect(moved.before).toBeNull();
      expect(moved.version).toBe((await columnsOf(moved.expenseId)).version);
      expect(await columnsOf(moved.expenseId)).toMatchObject({ date: "2026-08-07", setBy: payer.id });
      expect(await scheduleLogs(moved.expenseId)).toEqual([
        { actionType: "payment_schedule_change", actorId: payer.id, detail: { changes: { scheduledPaymentDate: [null, "2026-08-07"] } } },
      ]);
    }
    const rejected = new Map(result.rejected.map((entry) => [entry.expenseId, entry.reason]));
    expect([...rejected.keys()].sort()).toEqual([onTime.expenseId, paid.expenseId, stale.expenseId].sort());
    expect(rejected.get(paid.expenseId)).toBe("이미 지급 완료 · 새로 고침");
    expect(rejected.get(stale.expenseId)).toMatch(/^다른 사람이 .+에 바꿈 · 새로 고침$/);
    expect(rejected.get(onTime.expenseId)).toBeTruthy();
    for (const id of [onTime.expenseId, paid.expenseId, stale.expenseId]) expect(await columnsOf(id)).toMatchObject({ date: null, setBy: null, setAt: null });

    // 되돌리기: 이번 주로 반환을 그대로 — 옮긴 건은 자동(셋 다 NULL)으로, 그 사이 version이 바뀐 건은 충돌로 거부.
    const changedB = await saveScheduledPayDate(payer, { expenseId: pushedB.expenseId, scheduledPayDate: "2026-08-13", version: (await columnsOf(pushedB.expenseId)).version });
    const reverted = await revertScheduledPayDates(payer, { items: result.moved.map((moved) => ({ expenseId: moved.expenseId, date: moved.before, version: moved.version })) });
    expect(reverted.reverted.map((entry) => entry.expenseId)).toEqual([pushedA.expenseId]);
    expect(reverted.rejected.map((entry) => entry.expenseId)).toEqual([pushedB.expenseId]);
    expect(await columnsOf(pushedA.expenseId)).toMatchObject({ date: null, setBy: null, setAt: null });
    expect(await columnsOf(pushedB.expenseId)).toMatchObject({ date: "2026-08-13", setBy: payer.id, version: changedB.version });
    expect((await scheduleLogs(pushedA.expenseId)).at(-1)).toEqual({
      actionType: "payment_schedule_change",
      actorId: payer.id,
      detail: { changes: { scheduledPaymentDate: ["2026-08-07", null] } },
    });
    expect(await getExpense(payer, { expenseId: pushedA.expenseId })).toMatchObject({ scheduledPaymentDate: "2026-08-14", paymentPushReason: "cutoff" });
  }, 60_000);

  it("되돌리기로 날짜를 넣으면 기록 칸은 되돌린 사람 · 그때", async () => {
    const payer = await makePayer();
    const other = await makePayer();
    const doc = await approved(payer, ON_TIME_AT);
    const first = await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: "2026-08-14", version: (await columnsOf(doc.expenseId)).version });
    const second = await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: "2026-08-21", version: first.version });
    const reverted = await revertScheduledPayDates(other, { items: [{ expenseId: doc.expenseId, date: "2026-08-14", version: second.version }] });
    expect(reverted).toEqual({ reverted: [{ expenseId: doc.expenseId, version: second.version + 1 }], rejected: [] });
    expect(await columnsOf(doc.expenseId)).toMatchObject({ date: "2026-08-14", setBy: other.id });
  }, 30_000);

  it("K6: 오늘이 토요일(그 주 금요일 지남)이면 전부 `이번 주 지급일 지남`, 금요일 공휴일 주의 금요일(지급일 = 목요일)도 같음, 지급일 당일은 처리", async () => {
    const payer = await makePayer();
    const pushed = await approved(payer, PUSHED_AT);
    const items = [await item(pushed.expenseId)];

    expect(await moveToThisWeek(payer, { items }, { now: kst("2026-08-08T10:00") })).toEqual({ moved: [], rejected: [{ expenseId: pushed.expenseId, reason: WEEK_PASSED }] });
    // 2026-10-09(금) 한글날 → 그 주 지급일 10-08(목).
    expect(await moveToThisWeek(payer, { items }, { now: kst("2026-10-09T10:00") })).toEqual({ moved: [], rejected: [{ expenseId: pushed.expenseId, reason: WEEK_PASSED }] });
    expect(await columnsOf(pushed.expenseId)).toMatchObject({ date: null, version: items[0]?.version });

    const sameDay = await moveToThisWeek(payer, { items }, { now: kst("2026-08-07T10:00") });
    expect(sameDay.rejected).toEqual([]);
    expect(sameDay.moved).toEqual([{ expenseId: pushed.expenseId, before: null, version: (items[0]?.version ?? 0) + 1 }]);
    expect(await columnsOf(pushed.expenseId)).toMatchObject({ date: "2026-08-07", setBy: payer.id });
  }, 30_000);

  it("권한 없는 계정의 이번 주로 · 되돌리기는 Forbidden", async () => {
    const payer = await makePayer();
    const doc = await approved(payer, PUSHED_AT);
    const items = [await item(doc.expenseId)];
    await expect(moveToThisWeek(doc.pm, { items }, { now: THURSDAY_AFTER_CUTOFF })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(revertScheduledPayDates(doc.pm, { items: items.map((entry) => ({ ...entry, date: null })) })).rejects.toBeInstanceOf(ForbiddenError);
  }, 30_000);

  it("지급 대상 목록 thisWeekMove: 수요일 → 그 주 금요일, 토요일 · 금요일 공휴일 주의 금요일 → null", async () => {
    const payer = await makePayer();
    expect((await listPaymentTargets(payer, {}, { today: "2026-08-05", now: kst("2026-08-05T10:00") })).thisWeekMove).toEqual({ payDate: "2026-08-07" });
    expect((await listPaymentTargets(payer, {}, { today: "2026-08-08", now: kst("2026-08-08T10:00") })).thisWeekMove).toBeNull();
    expect((await listPaymentTargets(payer, {}, { today: "2026-10-09", now: kst("2026-10-09T10:00") })).thisWeekMove).toBeNull();
    expect((await listPaymentTargets(payer, {}, { today: "2026-10-08", now: kst("2026-10-08T10:00") })).thisWeekMove).toEqual({ payDate: "2026-10-08" });
  }, 30_000);
});
