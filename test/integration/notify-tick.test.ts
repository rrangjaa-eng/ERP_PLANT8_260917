import { eq, sql } from "drizzle-orm";
import { Client, type PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { DbDeadlineError, withDeadlineTransaction } from "@/db/deadline-transaction";
import { NOTIFY_TICK_BATCH_MAX } from "@/domain/settings/keys";
import { setSettingValue } from "@/domain/settings/registry";
import { notificationLog, notifyTickRuns } from "@/db/schema";
import { log } from "@/lib/log";
import { createAccount } from "@/domain/auth/accounts";
import { runTick } from "@/domain/notify/tick";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { verifySchedulerToken } from "@/lib/oidc";
import { handleNotifyTick, type NotifyTickHandlerDeps } from "@/app/internal/notify-tick/handle";
import { createTestConditionKind, createTestSigner, testCandidate } from "@/test/support/notify-tick";
import type { NotificationCandidate } from "@/domain/notify/condition-kinds";

const AUDIENCE = "https://notify.test.invalid";
const SCHEDULER_SA = "scheduler@test.invalid";

async function createUser(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: prefix });
  return userId;
}

async function rowsFor(recipientId: string) {
  return db.select().from(notificationLog).where(eq(notificationLog.recipientId, recipientId));
}

function tickRequest(token: string | null): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://127.0.0.1:3000/internal/notify-tick", { method: "POST", headers });
}

// 트레이서: 스케줄러 호출 → OIDC 검증 → advisory lock tick → notification_log 행.
describe("notify-tick 트레이서", () => {
  it("검증된 호출 한 번이 A의 알림 한 건을 남기고, 재호출은 sent 0, 기대 이메일이 없으면 401", async () => {
    const userA = await createUser("notify-a");
    const userB = await createUser("notify-b");
    const signer = createTestSigner();
    const kind = createTestConditionKind([
      testCandidate({ recipientId: userA, entityId: "T-0001", referenceDate: "2026-10-07" }),
    ]);
    const deps: Partial<NotifyTickHandlerDeps> = {
      config: { audience: AUDIENCE, schedulerSa: SCHEDULER_SA, oidcDisabled: false },
      verify: (authorization, expected) =>
        verifySchedulerToken(authorization, expected, { getCerts: signer.getCerts }),
      // KST 수요일 09:00
      runTick: () => runTick({ conditionKinds: [kind], now: () => new Date("2026-10-07T00:00:00Z") }),
    };
    const token = signer.sign({ aud: AUDIENCE, email: SCHEDULER_SA });

    const first = await handleNotifyTick(tickRequest(token), deps);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ sent: 1, skipped: 0, remaining: 0 });

    const aRows = await rowsFor(userA);
    expect(aRows).toHaveLength(1);
    expect(aRows[0]?.message).toBe("테스트 알림 · T-0001");
    // 이메일 단계가 없는 이 시점의 값 — 04.2-10이 skipped_no_smtp로 바꾼다.
    expect(aRows[0]?.emailStatus).toBe("pending");
    expect(await rowsFor(userB)).toHaveLength(0);

    const second = await handleNotifyTick(tickRequest(token), deps);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ sent: 0, skipped: 1, remaining: 0 });
    expect(await rowsFor(userA)).toHaveLength(1);

    const closed = await handleNotifyTick(tickRequest(token), {
      ...deps,
      config: { audience: AUDIENCE, schedulerSa: null, oidcDisabled: false },
    });
    expect(closed.status).toBe(401);
    expect(await closed.json()).toEqual({ error: "unauthorized" });
    expect(await db.select().from(notificationLog)).toHaveLength(1);
  });
});

// KST 날짜 → 그날 09:00 KST의 Date(= 00:00Z).
function kst(date: string): () => Date {
  return () => new Date(`${date}T00:00:00Z`);
}

const WED = "2026-10-07";

function cap(n: number): () => Promise<number> {
  return () => Promise.resolve(n);
}

function occ(recipientId: string, entityId: string, referenceDate: string, round?: number): NotificationCandidate {
  return testCandidate({ recipientId, entityId, referenceDate, round });
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function tickRuns() {
  return db.select().from(notifyTickRuns).orderBy(notifyTickRuns.id);
}

describe("tick 배치 규칙", () => {
  it("상한 3 · A 2건 + B 1건 → sent 3, remaining 0, 미완 받는 사람 없음", async () => {
    const a = await createUser("cap-a");
    const b = await createUser("cap-b");
    const kind = createTestConditionKind([occ(a, "T-1", "2026-10-01"), occ(a, "T-2", "2026-10-02"), occ(b, "T-3", "2026-10-03")]);
    const result = await runTick({ conditionKinds: [kind], now: kst(WED), batchMax: cap(3) });
    expect(result).toMatchObject({ status: "ok", sent: 3, skipped: 0, remaining: 0, incompleteRecipientIds: [] });
  });

  it("상한 3 · A 2건(이름) + B 2건 → remaining 1과 미완 [B], 다음 tick이 나머지를 끝낸다", async () => {
    const a = await createUser("cap-a");
    const b = await createUser("cap-b");
    const kind = createTestConditionKind([
      occ(a, "T-1", "2026-10-01"),
      occ(a, "T-2", "2026-10-02"),
      occ(b, "T-3", "2026-10-05"),
      occ(b, "T-4", "2026-10-06"),
    ]);
    const first = await runTick({ conditionKinds: [kind], now: kst(WED), batchMax: cap(3) });
    expect(first).toMatchObject({ status: "ok", sent: 3, remaining: 1, incompleteRecipientIds: [b] });
    const second = await runTick({ conditionKinds: [kind], now: kst(WED), batchMax: cap(3) });
    expect(second).toMatchObject({ status: "ok", sent: 1, skipped: 3, remaining: 0, incompleteRecipientIds: [] });
  });

  it("상한 1 · A 3건 → 삽입 정확히 1행, 미완 [A]가 같은 트랜잭션의 실행 기록에도 있다", async () => {
    const a = await createUser("cap-a");
    const kind = createTestConditionKind([occ(a, "T-1", "2026-10-01"), occ(a, "T-2", "2026-10-02"), occ(a, "T-3", "2026-10-03")]);
    const result = await runTick({ conditionKinds: [kind], now: kst(WED), batchMax: cap(1) });
    expect(result).toMatchObject({ status: "ok", sent: 1, remaining: 2, incompleteRecipientIds: [a] });
    expect(await rowsFor(a)).toHaveLength(1);
    const runs = await tickRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.incompleteRecipientIds).toEqual([a]);
  });

  it("오래된 건 우선 — B의 reference_date가 A보다 이르면 상한에서 B가 먼저 담긴다", async () => {
    const a = await createUser("old-a");
    const b = await createUser("old-b");
    const kind = createTestConditionKind([occ(a, "T-1", "2026-10-06"), occ(b, "T-2", "2026-10-02")]);
    const result = await runTick({ conditionKinds: [kind], now: kst(WED), batchMax: cap(1) });
    expect(result).toMatchObject({ status: "ok", sent: 1, remaining: 1, incompleteRecipientIds: [a] });
    expect(await rowsFor(b)).toHaveLength(1);
    expect(await rowsFor(a)).toHaveLength(0);
  });

  it("발생 계약 — 금요일 상한 초과분은 토·일에 평가 없이 넘어가 월요일 tick에서 나간다", async () => {
    const a = await createUser("fri-a");
    const kind = createTestConditionKind([
      occ(a, "T-1", "2026-10-16"),
      occ(a, "T-2", "2026-10-16"),
      occ(a, "T-3", "2026-10-16"),
    ]);
    const deps = { conditionKinds: [kind], batchMax: cap(2) };
    expect(await runTick({ ...deps, now: kst("2026-10-16") })).toMatchObject({ sent: 2, remaining: 1 });
    const evaluationsAfterFriday = kind.evaluations();
    expect(await runTick({ ...deps, now: kst("2026-10-17") })).toMatchObject({ sent: 0, skipped: 0, remaining: 0 });
    expect(await runTick({ ...deps, now: kst("2026-10-18") })).toMatchObject({ sent: 0, skipped: 0, remaining: 0 });
    expect(kind.evaluations()).toBe(evaluationsAfterFriday);
    expect(await runTick({ ...deps, now: kst("2026-10-19") })).toMatchObject({ sent: 1, remaining: 0 });
    expect(await rowsFor(a)).toHaveLength(3);
  });

  it("발생 계약 — 토요일에 기한이 된 발생은 월요일 tick이 넣는다", async () => {
    const a = await createUser("sat-a");
    const kind = createTestConditionKind([occ(a, "T-1", "2026-10-17")]);
    expect(await runTick({ conditionKinds: [kind], now: kst("2026-10-17") })).toMatchObject({ sent: 0 });
    expect(await runTick({ conditionKinds: [kind], now: kst("2026-10-19") })).toMatchObject({ sent: 1, remaining: 0 });
  });

  it("같은 키의 회차 2는 새 행, 같은 회차 재삽입은 skipped", async () => {
    const a = await createUser("round-a");
    const source: NotificationCandidate[] = [occ(a, "T-1", "2026-10-01", 1)];
    const kind = createTestConditionKind(() => source);
    expect(await runTick({ conditionKinds: [kind], now: kst(WED) })).toMatchObject({ sent: 1 });
    source.push(occ(a, "T-1", "2026-10-01", 2));
    expect(await runTick({ conditionKinds: [kind], now: kst(WED) })).toMatchObject({ sent: 1, skipped: 1 });
    expect(await runTick({ conditionKinds: [kind], now: kst(WED) })).toMatchObject({ sent: 0, skipped: 2 });
    expect(await rowsFor(a)).toHaveLength(2);
  });

  it("후보 0건 → 200 {0,0,0}과 영업일 실행 기록 1행", async () => {
    const signer = createTestSigner();
    const response = await handleNotifyTick(tickRequest(signer.sign({ aud: AUDIENCE, email: SCHEDULER_SA })), {
      config: { audience: AUDIENCE, schedulerSa: SCHEDULER_SA, oidcDisabled: false },
      verify: (authorization, expected) => verifySchedulerToken(authorization, expected, { getCerts: signer.getCerts }),
      runTick: () => runTick({ conditionKinds: [createTestConditionKind([])], now: kst(WED) }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 0, skipped: 0, remaining: 0 });
    const runs = await tickRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.businessDay).toBe(true);
  });

  it("KST 토요일 → sent 0, 평가 없음, 실행 기록 business_day 거짓, notify.tick ok 로그", async () => {
    const a = await createUser("weekend-a");
    const kind = createTestConditionKind([occ(a, "T-1", "2026-10-01")]);
    const info = vi.spyOn(log, "info");
    try {
      const result = await runTick({ conditionKinds: [kind], now: kst("2026-10-10") });
      expect(result).toMatchObject({ status: "ok", sent: 0, skipped: 0, remaining: 0, businessDay: false });
      expect(kind.evaluations()).toBe(0);
      const runs = await tickRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]?.businessDay).toBe(false);
      expect(info).toHaveBeenCalledWith("notify.tick", expect.objectContaining({ ok: true, sent: 0 }));
    } finally {
      info.mockRestore();
    }
  });

  it("잠금을 쥔 tick이 멈춘 사이 두 번째 호출은 기다리지 않고 409 locked, 실행 기록은 첫 tick 것 1행", async () => {
    const a = await createUser("lock-a");
    const signer = createTestSigner();
    const entered = deferred();
    const gate = deferred();
    let calls = 0;
    const kind = createTestConditionKind(async () => {
      calls += 1;
      if (calls === 1) {
        entered.resolve();
        await gate.promise;
      }
      return [occ(a, "T-1", "2026-10-01")];
    });
    const deps: Partial<NotifyTickHandlerDeps> = {
      config: { audience: AUDIENCE, schedulerSa: SCHEDULER_SA, oidcDisabled: false },
      verify: (authorization, expected) => verifySchedulerToken(authorization, expected, { getCerts: signer.getCerts }),
      runTick: () => runTick({ conditionKinds: [kind], now: kst(WED) }),
    };
    const token = signer.sign({ aud: AUDIENCE, email: SCHEDULER_SA });
    const warn = vi.spyOn(log, "warn");
    try {
      const firstCall = handleNotifyTick(tickRequest(token), deps);
      await entered.promise;
      const [second] = await Promise.all([
        handleNotifyTick(tickRequest(token), deps).finally(() => gate.resolve()),
        firstCall,
      ]);
      expect(second.status).toBe(409);
      expect(await second.json()).toEqual({ sent: 0, skipped: 0, remaining: 0, locked: true });
      const first = await firstCall;
      expect(first.status).toBe(200);
      expect(warn.mock.calls.filter(([event]) => event === "notify.tick_locked")).toHaveLength(1);
      expect(await tickRuns()).toHaveLength(1);
    } finally {
      warn.mockRestore();
      gate.resolve();
    }
  });

  it("종류 X가 던져도 종류 Y의 후보는 들어가고, 실패 로그 1회와 evaluation_failed 참이 남는다", async () => {
    const b = await createUser("iso-b");
    const x = createTestConditionKind(
      () => {
        throw new Error("x broke");
      },
      { kind: "X" },
    );
    const y = createTestConditionKind([occ(b, "T-1", "2026-10-01")], { kind: "Y" });
    const error = vi.spyOn(log, "error");
    try {
      const result = await runTick({ conditionKinds: [x, y], now: kst(WED) });
      expect(result).toMatchObject({ status: "ok", sent: 1 });
      expect(await rowsFor(b)).toHaveLength(1);
      const failures = error.mock.calls.filter(([event]) => event === "notify.condition_failed");
      expect(failures).toHaveLength(1);
      expect(failures[0]?.[1]).toMatchObject({ kind: "X" });
      expect((await tickRuns())[0]?.evaluationFailed).toBe(true);
      await runTick({ conditionKinds: [y], now: kst(WED) });
      expect((await tickRuns())[1]?.evaluationFailed).toBe(false);
    } finally {
      error.mockRestore();
    }
  });

  it("부분 삽입 → 평가 실패 → 복구: 실행 기록의 미완 목록과 evaluation_failed가 tick마다 바르게 남는다", async () => {
    const a = await createUser("partial-a");
    const b = await createUser("partial-b");
    let xBroken = false;
    const x = createTestConditionKind(
      () => {
        if (xBroken) throw new Error("x broke");
        return [occ(a, "T-1", "2026-10-01"), occ(a, "T-2", "2026-10-02"), occ(a, "T-3", "2026-10-03")];
      },
      { kind: "X" },
    );
    const y = createTestConditionKind([occ(b, "T-9", "2026-10-05")], { kind: "Y" });
    const error = vi.spyOn(log, "error");
    try {
      expect(await runTick({ conditionKinds: [x], now: kst(WED), batchMax: cap(1) })).toMatchObject({
        sent: 1,
        remaining: 2,
      });
      let runs = await tickRuns();
      expect(runs[0]?.incompleteRecipientIds).toEqual([a]);
      expect(runs[0]?.evaluationFailed).toBe(false);

      xBroken = true;
      expect(await runTick({ conditionKinds: [x, y], now: kst(WED), batchMax: cap(10) })).toMatchObject({ sent: 1 });
      runs = await tickRuns();
      expect(runs[1]?.evaluationFailed).toBe(true);
      expect(runs[1]?.incompleteRecipientIds).toEqual([]);

      xBroken = false;
      expect(await runTick({ conditionKinds: [x, y], now: kst(WED), batchMax: cap(10) })).toMatchObject({
        sent: 2,
        skipped: 2,
      });
      runs = await tickRuns();
      expect(runs[2]?.evaluationFailed).toBe(false);
      expect(await rowsFor(a)).toHaveLength(3);
    } finally {
      error.mockRestore();
    }
  });

  it(
    "바인드 인자 한도 — 상한 5,000 · 후보 13,200건 tick이 성공하고 정확히 5,000행을 넣는다",
    async () => {
      const a = await createUser("bulk-a");
      const TOTAL = 13_200;
      const source = Array.from({ length: TOTAL }, (_, i) =>
        occ(a, `T-${String(i + 1).padStart(5, "0")}`, "2026-10-01"),
      );
      const kind = createTestConditionKind(source);
      const result = await runTick({ conditionKinds: [kind], now: kst(WED), batchMax: cap(5000) });
      expect(result).toMatchObject({ status: "ok", sent: 5000, skipped: 0, remaining: 8200, incompleteRecipientIds: [a] });
      expect(await rowsFor(a)).toHaveLength(5000);
    },
    60_000,
  );
});

describe("tick 상한 설정 키", () => {
  it("notify.tick.batch_max 스키마는 5,000까지 받고 5,001을 거부한다", () => {
    expect(NOTIFY_TICK_BATCH_MAX.schema.safeParse(5000).success).toBe(true);
    expect(NOTIFY_TICK_BATCH_MAX.schema.safeParse(5001).success).toBe(false);
  });

  it("설정 값을 2로 바꾸면 기본 deps의 tick이 2로 자른다", async () => {
    const a = await createUser("setting-a");
    await setSettingValue(SYSTEM_VIEWER, NOTIFY_TICK_BATCH_MAX, 2);
    const kind = createTestConditionKind([occ(a, "T-1", "2026-10-01"), occ(a, "T-2", "2026-10-02"), occ(a, "T-3", "2026-10-03")]);
    expect(await runTick({ conditionKinds: [kind], now: kst(WED) })).toMatchObject({ sent: 2, remaining: 1 });
  });
});

type FakeQuery = { text: string } | string;

// query·release만 가진 가짜 연결 — respond가 undefined를 돌려주면 그 쿼리는 영영 답하지 않는다.
function fakeClient(respond: (text: string) => boolean): { client: PoolClient; release: ReturnType<typeof vi.fn> } {
  const release = vi.fn();
  const client = {
    query: (query: FakeQuery) => {
      const text = typeof query === "string" ? query : query.text;
      return respond(text.trim().toLowerCase())
        ? Promise.resolve({ rows: [], rowCount: 0, fields: [], command: "" })
        : new Promise(() => {});
    },
    release,
  };
  return { client: client as unknown as PoolClient, release };
}

async function within<T>(ms: number, promise: Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await promise;
  } finally {
    expect(Date.now() - started).toBeLessThan(ms);
  }
}

describe("클라이언트 마감 트랜잭션", () => {
  it("BEGIN이 답하지 않으면 마감에 DbDeadlineError, 연결은 오류 인자로 한 번 놓인다", async () => {
    const { client, release } = fakeClient(() => false);
    await expect(
      within(1000, withDeadlineTransaction(100, () => Promise.resolve(1), { connect: () => Promise.resolve(client) })),
    ).rejects.toBeInstanceOf(DbDeadlineError);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("fn이 던진 뒤 ROLLBACK이 답하지 않아도 마감에 DbDeadlineError, 연결은 오류 인자로 한 번 놓인다", async () => {
    const { client, release } = fakeClient((text) => !text.startsWith("rollback"));
    await expect(
      within(
        1000,
        withDeadlineTransaction(100, () => Promise.reject(new Error("fn failed")), {
          connect: () => Promise.resolve(client),
        }),
      ),
    ).rejects.toBeInstanceOf(DbDeadlineError);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("모든 쿼리에 답하는 연결은 값을 돌려주고 인자 없이 한 번 놓인다", async () => {
    const { client, release } = fakeClient(() => true);
    expect(await withDeadlineTransaction(1000, () => Promise.resolve(42), { connect: () => Promise.resolve(client) })).toBe(42);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]).toEqual([]);
  });

  it("COMMIT 응답이 멈추면(지연 제약 트리거) 마감에 DbDeadlineError, 풀은 다음 트랜잭션을 돌린다", async () => {
    await expect(
      within(
        1000,
        withDeadlineTransaction(300, async (tx) => {
          await tx.execute(sql`create temp table commit_hang (id int)`);
          await tx.execute(
            sql.raw(
              "create function pg_temp.sleep_on_commit() returns trigger language plpgsql as $$ begin perform pg_sleep(2); return null; end $$",
            ),
          );
          await tx.execute(
            sql.raw(
              "create constraint trigger commit_hang_trg after insert on commit_hang deferrable initially deferred for each row execute function pg_temp.sleep_on_commit()",
            ),
          );
          await tx.execute(sql`insert into commit_hang values (1)`);
        }),
      ),
    ).rejects.toBeInstanceOf(DbDeadlineError);
    const result = await withDeadlineTransaction(1000, (tx) => tx.execute<{ one: number }>(sql`select 1 as one`));
    expect(result.rows[0]?.one).toBe(1);
  });

  it(
    "잠긴 notification_log 앞에서 멈춘 tick은 서버 lock_timeout보다 먼저 DbDeadlineError로 끝나고 아무것도 남기지 않는다",
    async () => {
      const a = await createUser("deadline-a");
      const kind = createTestConditionKind([occ(a, "T-1", "2026-10-01")]);
      const blocker = new Client({ connectionString: process.env.DATABASE_URL });
      await blocker.connect();
      try {
        await blocker.query("begin");
        await blocker.query("lock table notification_log in access exclusive mode");
        await expect(
          within(1500, runTick({ conditionKinds: [kind], txDeadlineMs: 300, now: kst(WED) })),
        ).rejects.toBeInstanceOf(DbDeadlineError);
      } finally {
        await blocker.query("rollback");
        await blocker.end();
      }

      // 파기한 연결의 서버 백엔드가 끝나 advisory 잠금이 풀릴 때까지(6초 한도) 기다린다.
      const deadline = Date.now() + 6000;
      for (;;) {
        const locks = await db.execute<{ count: number }>(
          sql`select count(*)::int as count from pg_locks where locktype = 'advisory'`,
        );
        if (locks.rows[0]?.count === 0) break;
        if (Date.now() > deadline) throw new Error("advisory 잠금이 6초 안에 풀리지 않았다");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect(await tickRuns()).toHaveLength(0);
      expect(await db.select().from(notificationLog)).toHaveLength(0);
      expect(await runTick({ conditionKinds: [kind], now: kst(WED) })).toMatchObject({ status: "ok", sent: 1 });
    },
    15_000,
  );
});
