import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { expenses, notificationLog, notificationRules, notifyTickRuns } from "@/db/schema";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { payWeekAlertKind } from "@/domain/notify/kinds/pay-week-alert";
import { runTick } from "@/domain/notify/tick";
import { loadPaySchedules } from "@/domain/payments/pay-schedule-load";
import { PAYMENT_WEEKDAY } from "@/domain/settings/keys";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { log } from "@/lib/log";
import { listPaymentTargetRows } from "@/repositories/payment-targets";
import { upsertSimpleValue } from "@/repositories/settings";
import { createFakeEmailSender } from "@/test/support/fake-email-sender";
import { createTestConditionKind } from "@/test/support/notify-tick";
import { setupExpenseProject, type ExpenseFixture } from "../fixtures/expenses";
import { approvedExpenseWithEvidence, makePaymentManager } from "../fixtures/payments";

// 07-10 C-P2-1 · K7 · R9: 지급 예정일 임박 알림 — alertDate ~ 마감 날 사이 처음 도는 tick에서 경영관리에게 지급일마다 한 건.

function at(date: string): () => Date {
  return () => new Date(`${date}T09:00:00+09:00`);
}

// 날짜의 요일 한 글자 — 구현과 따로 센 기대값(UTC 정오 Date).
function weekdayOf(date: string): string {
  return "일월화수목금토".charAt(new Date(`${date}T12:00:00Z`).getUTCDay());
}

let fx: ExpenseFixture;
let managers: Viewer[];
let payDate: string;
let alertDate: string;
let cutoffDate: string;

async function approveTwo(): Promise<string[]> {
  const first = await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
  const second = await approvedExpenseWithEvidence(fx, fx.lines.split);
  return [first.expenseId, second.expenseId];
}

async function scheduleOf(ids: string[]) {
  const rows = (await listPaymentTargetRows(SYSTEM_VIEWER, { documentKind: EXPENSE_DOCUMENT_KIND })).filter((row) => ids.includes(row.id));
  const schedules = await loadPaySchedules(SYSTEM_VIEWER, rows, { today: "2026-10-30", now: new Date("2026-10-30T00:00:00Z") });
  const schedule = schedules.get(ids[0] ?? "");
  if (!schedule) throw new Error("일정 없음");
  return schedule;
}

async function rowsOf(user: Viewer) {
  return db.select().from(notificationLog).where(eq(notificationLog.recipientId, user.id));
}

beforeEach(async () => {
  fx = await setupExpenseProject();
  managers = [await makePaymentManager("경영1"), await makePaymentManager("경영2")];
  const ids = await approveTwo();
  // 수동 지급일(금 2026-11-06) — 마감 = 앞 영업일(목 11-05), 임박 알림일 = 그 앞 영업일(수 11-04).
  await db.update(expenses).set({ scheduledPaymentDate: "2026-11-06" }).where(inArray(expenses.id, ids));
  const schedule = await scheduleOf(ids);
  payDate = schedule.payDate;
  alertDate = schedule.alertDate;
  cutoffDate = schedule.cutoffAt.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
});

describe("pay-week-alert (C-P2-1)", () => {
  it("일정이 의도대로 잡혔다(수동 금요일)", () => {
    expect(payDate).toBe("2026-11-06");
    expect(alertDate).toBe("2026-11-04");
    expect(cutoffDate).toBe("2026-11-05");
  });

  it("alertDate 날 tick → 경영관리 각자에게 한 행, 지급 권한 없는 사람은 0행, 같은 날 두 번째 tick은 그대로", async () => {
    await runTick({ conditionKinds: [payWeekAlertKind], now: at(alertDate), emailSender: null });
    for (const manager of managers) {
      const rows = await rowsOf(manager);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.message).toBe("지급 예정 · 11-06 금 · 2건");
      expect(rows[0]?.entity).toBe("pay-week");
      expect(rows[0]?.entityId).toBe("2026-11-06");
    }
    expect(await rowsOf(fx.pm)).toHaveLength(0);
    expect(await rowsOf(fx.lead)).toHaveLength(0);
    await runTick({ conditionKinds: [payWeekAlertKind], now: at(alertDate), emailSender: null });
    expect(await rowsOf(managers[0] as Viewer)).toHaveLength(1);
  });

  it("alertDate 날 tick이 없었어도 마감 날 tick이 한 행을 보낸다", async () => {
    await runTick({ conditionKinds: [payWeekAlertKind], now: at(cutoffDate), emailSender: null });
    expect(await rowsOf(managers[0] as Viewer)).toHaveLength(1);
  });

  it("alertDate와 마감 날 둘 다 돌면 합 한 행", async () => {
    await runTick({ conditionKinds: [payWeekAlertKind], now: at(alertDate), emailSender: null });
    await runTick({ conditionKinds: [payWeekAlertKind], now: at(cutoffDate), emailSender: null });
    expect(await rowsOf(managers[0] as Viewer)).toHaveLength(1);
  });

  it("alertDate 전 · 지급일 당일(마감 지남)은 0행", async () => {
    await runTick({ conditionKinds: [payWeekAlertKind], now: at("2026-11-03"), emailSender: null });
    await runTick({ conditionKinds: [payWeekAlertKind], now: at(payDate), emailSender: null });
    expect(await rowsOf(managers[0] as Viewer)).toHaveLength(0);
  });

  it("규칙 행 enabled=false면 0행", async () => {
    await db.insert(notificationRules).values({ kind: "pay-week-alert", enabled: false });
    await runTick({ conditionKinds: [payWeekAlertKind], now: at(alertDate), emailSender: null });
    expect(await rowsOf(managers[0] as Viewer)).toHaveLength(0);
  });
});

describe("pay-week-alert 요일 (K7)", () => {
  it("공휴일 앞당김으로 목요일 지급 → 목", async () => {
    // 2026-10-09 금은 한글날 — 수동 지급일을 목 10-08로 두고 같은 요일 표를 쓴다.
    const rows = await db.select({ id: expenses.id }).from(expenses);
    await db.update(expenses).set({ scheduledPaymentDate: "2026-11-05" }).where(inArray(expenses.id, rows.map((row) => row.id)));
    const schedule = await scheduleOf(rows.map((row) => row.id));
    await runTick({ conditionKinds: [payWeekAlertKind], now: at(schedule.alertDate), emailSender: null });
    expect((await rowsOf(managers[0] as Viewer))[0]?.message).toBe("지급 예정 · 11-05 목 · 2건");
  });

  it("설정 payment.weekday = wed → 자동 일정의 실제 지급일 요일(수)", async () => {
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_WEEKDAY.key, "wed", null);
    const rows = await db.select({ id: expenses.id }).from(expenses);
    await db.update(expenses).set({ scheduledPaymentDate: null }).where(inArray(expenses.id, rows.map((row) => row.id)));
    const schedule = await scheduleOf(rows.map((row) => row.id));
    await runTick({ conditionKinds: [payWeekAlertKind], now: at(schedule.alertDate), emailSender: null });
    const message = (await rowsOf(managers[0] as Viewer))[0]?.message;
    expect(message).toBe(`지급 예정 · ${schedule.payDate.slice(5)} ${weekdayOf(schedule.payDate)} · 2건`);
  });
});

describe("평가 실패일 메일 보류 → 같은 날 재실행으로 풀림 (R9)", () => {
  it("던지는 종류가 같이 있던 날은 메일이 보류되고, 빼고 다시 돌리면 임박 알림 메일이 선점된다", async () => {
    const thrower = createTestConditionKind(
      () => {
        throw new Error("종류 고장");
      },
      { kind: "thrower" },
    );
    const fake = createFakeEmailSender();
    const error = vi.spyOn(log, "error");
    try {
      await runTick({ conditionKinds: [payWeekAlertKind, thrower], now: at(alertDate), emailSender: fake.sender });
      expect(error.mock.calls.filter(([event]) => event === "notify.condition_failed")).toHaveLength(1);
    } finally {
      error.mockRestore();
    }
    expect((await db.select().from(notifyTickRuns).orderBy(notifyTickRuns.id))[0]?.evaluationFailed).toBe(true);
    expect(await rowsOf(managers[0] as Viewer)).toHaveLength(1);
    expect(fake.sent).toHaveLength(0);

    await runTick({ conditionKinds: [payWeekAlertKind], now: at(alertDate), emailSender: fake.sender });
    const runs = await db.select().from(notifyTickRuns).orderBy(notifyTickRuns.id);
    expect(runs[1]?.evaluationFailed).toBe(false);
    expect(fake.sent).toHaveLength(managers.length);
    expect(await rowsOf(managers[0] as Viewer)).toHaveLength(1);
  });
});

