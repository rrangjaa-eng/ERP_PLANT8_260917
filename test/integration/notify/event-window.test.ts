import { eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { notificationLog, notificationRules, notifyTickRuns } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { toKstDate } from "@/domain/holidays/business-day";
import type { EvaluateContext, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { runTick } from "@/domain/notify/tick";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { log } from "@/lib/log";
import { NOTIFY_TICK_LOCK_KEY } from "@/repositories/notifications";
import { createTestConditionKind } from "@/test/support/notify-tick";

// 07-10 C-P1-1 · C-P2-13 · R8: 사건 창은 고정 되돌아보기(14일) + 하한 enabled_at, 종류 예산, 잠금 tx 전달.

async function createUser(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: prefix });
  return userId;
}

// KST 날짜 + 시각 → 그 순간의 Date.
function kstAt(date: string, time = "09:00"): Date {
  return new Date(`${date}T${time}:00+09:00`);
}

function at(date: string, time = "09:00"): () => Date {
  return () => kstAt(date, time);
}

type TestEvent = { id: string; createdAt: Date };

// 사건 종류 — ctx.since 뒤에 만들어진 사건을 사건 id 키로 모두 돌려준다.
function eventKind(recipientId: string, events: TestEvent[], opts?: { kind?: string }) {
  return createTestConditionKind(
    (ctx: EvaluateContext): NotificationCandidate[] =>
      events
        .filter((event) => ctx.since !== undefined && event.createdAt.getTime() >= ctx.since.getTime())
        .map((event) => ({
          entity: "test-event",
          entityId: event.id,
          recipientId,
          round: 1,
          referenceDate: toKstDate(event.createdAt),
          message: `사건 · ${event.id}`,
        })),
    opts,
  );
}

async function rowsOf(recipientId: string) {
  return db.select().from(notificationLog).where(eq(notificationLog.recipientId, recipientId)).orderBy(notificationLog.id);
}

// 2026-10-16 금 · 17 토 · 18 일 · 19 월 · 20 화.
describe("사건 창 — 고정 되돌아보기 (C-P1-1)", () => {
  it("토요일 사건은 토 · 일 tick(비영업일 실행 기록)을 지나 월요일 tick에 한 행", async () => {
    const user = await createUser("win-sat");
    const kind = eventKind(user, [{ id: "E-SAT", createdAt: kstAt("2026-10-17", "14:00") }]);
    await runTick({ conditionKinds: [kind], now: at("2026-10-17", "15:00") });
    await runTick({ conditionKinds: [kind], now: at("2026-10-18") });
    expect(await rowsOf(user)).toHaveLength(0);
    const runs = await db.select().from(notifyTickRuns).orderBy(notifyTickRuns.id);
    expect(runs.map((run) => run.businessDay)).toEqual([false, false]);
    await runTick({ conditionKinds: [kind], now: at("2026-10-19") });
    expect((await rowsOf(user)).map((row) => row.entityId)).toEqual(["E-SAT"]);
  });

  it("batchMax 1에 금요일 사건 둘 → 월 1행 · 화 1행(합 2, 중복 0)", async () => {
    const user = await createUser("win-cap");
    const kind = eventKind(user, [
      { id: "E-1", createdAt: kstAt("2026-10-16", "10:00") },
      { id: "E-2", createdAt: kstAt("2026-10-16", "11:00") },
    ]);
    await runTick({ conditionKinds: [kind], now: at("2026-10-19"), batchMax: () => Promise.resolve(1) });
    expect(await rowsOf(user)).toHaveLength(1);
    await runTick({ conditionKinds: [kind], now: at("2026-10-20"), batchMax: () => Promise.resolve(1) });
    const rows = await rowsOf(user);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.entityId)).size).toBe(2);
  });

  it("월요일 tick 시작 전에 만들어졌지만 그 tick 뒤에 보인 사건(커밋 경합)도 화요일 tick에 한 행", async () => {
    const user = await createUser("win-race");
    const events: TestEvent[] = [];
    const kind = eventKind(user, events);
    await runTick({ conditionKinds: [kind], now: at("2026-10-19") });
    events.push({ id: "E-LATE", createdAt: kstAt("2026-10-19", "08:59") });
    await runTick({ conditionKinds: [kind], now: at("2026-10-20") });
    expect((await rowsOf(user)).map((row) => row.entityId)).toEqual(["E-LATE"]);
  });

  it("규칙 enabled_at이 하한 — 월 08:00에 켠 규칙은 금요일 사건 0행 · 월 08:30 사건 1행", async () => {
    const user = await createUser("win-enabled");
    await db.insert(notificationRules).values({ kind: "test", enabledAt: kstAt("2026-10-19", "08:00") });
    const kind = eventKind(user, [
      { id: "E-OLD", createdAt: kstAt("2026-10-16", "10:00") },
      { id: "E-NEW", createdAt: kstAt("2026-10-19", "08:30") },
    ]);
    await runTick({ conditionKinds: [kind], now: at("2026-10-19") });
    expect((await rowsOf(user)).map((row) => row.entityId)).toEqual(["E-NEW"]);
  });

  it("받는 계급 · 이메일만 바꾼 규칙(updated_at만 이동)은 창 하한을 움직이지 않는다", async () => {
    const user = await createUser("win-rule-edit");
    await db.insert(notificationRules).values({ kind: "test", emailEnabled: true, extraRoleIds: [], updatedAt: kstAt("2026-10-19", "08:00") });
    const kind = eventKind(user, [{ id: "E-FRI", createdAt: kstAt("2026-10-16", "10:00") }]);
    await runTick({ conditionKinds: [kind], now: at("2026-10-19") });
    expect((await rowsOf(user)).map((row) => row.entityId)).toEqual(["E-FRI"]);
  });

  it("15일 전 사건은 창 밖이라 0행", async () => {
    const user = await createUser("win-old");
    const kind = eventKind(user, [{ id: "E-15", createdAt: kstAt("2026-10-05", "10:00") }]);
    await runTick({ conditionKinds: [kind], now: at("2026-10-20") });
    expect(await rowsOf(user)).toHaveLength(0);
  });

  it("끈 규칙은 evaluate를 부르지 않는다", async () => {
    const user = await createUser("win-off");
    await db.insert(notificationRules).values({ kind: "test", enabled: false });
    const kind = eventKind(user, [{ id: "E-1", createdAt: kstAt("2026-10-19", "08:30") }]);
    await runTick({ conditionKinds: [kind], now: at("2026-10-19") });
    expect(kind.evaluations()).toBe(0);
    expect(await rowsOf(user)).toHaveLength(0);
  });
});

describe("종류 예산 (C-P2-13)", () => {
  it("누적 평가 시간이 txDeadlineMs의 절반을 넘으면 남은 종류를 건너뛰고 evaluation_failed, 다음 영업일에 받는다", async () => {
    const user = await createUser("budget");
    const slow = createTestConditionKind(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
        return [];
      },
      { kind: "slow" },
    );
    const second = createTestConditionKind(
      [{ entity: "test", entityId: "B-1", recipientId: user, round: 1, referenceDate: "2026-10-19", message: "둘째 종류" }],
      { kind: "second" },
    );
    const info = vi.spyOn(log, "info");
    const warn = vi.spyOn(log, "warn");
    try {
      const result = await runTick({ conditionKinds: [slow, second], now: at("2026-10-19"), txDeadlineMs: 2000 });
      expect(result).toMatchObject({ status: "ok", sent: 0 });
      expect(second.evaluations()).toBe(0);
      const timings = info.mock.calls.filter(([event]) => event === "notify.condition_ms");
      expect(timings).toHaveLength(1);
      expect(timings[0]?.[1]).toMatchObject({ kind: "slow", count: 0 });
      expect(warn.mock.calls.filter(([event]) => event === "notify.condition_budget")).toHaveLength(1);
      expect((await db.select().from(notifyTickRuns))[0]?.evaluationFailed).toBe(true);
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
    await runTick({ conditionKinds: [second], now: at("2026-10-20") });
    expect(await rowsOf(user)).toHaveLength(1);
  });
});

describe("잠금 tx 전달 (R8)", () => {
  it("종류가 받은 ctx.tx는 tick 잠금을 쥔 연결 위에 있다", async () => {
    let seen: { txPid: number; lockPid: number } | null = null;
    const kind = createTestConditionKind(async (ctx) => {
      if (!ctx.tx) throw new Error("ctx.tx 없음");
      const own = await ctx.tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      const lock = await db.execute<{ pid: number }>(
        sql`select pid from pg_locks where locktype = 'advisory' and objid = ${NOTIFY_TICK_LOCK_KEY} and granted`,
      );
      seen = { txPid: Number(own.rows[0]?.pid), lockPid: Number(lock.rows[0]?.pid) };
      return [];
    });
    await runTick({ conditionKinds: [kind], now: at("2026-10-19") });
    expect(seen).not.toBeNull();
    const pids = seen as unknown as { txPid: number; lockPid: number };
    expect(Number.isInteger(pids.txPid)).toBe(true);
    expect(pids.txPid).toBe(pids.lockPid);
  });
});
