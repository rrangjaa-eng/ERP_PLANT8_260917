import { describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { getSystemStatus } from "@/domain/system-status";
import {
  recordRestoreRehearsal,
  ValidationError,
  type RestoreRehearsalInput,
} from "@/domain/ops/restore-rehearsal";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { parseArgs, UsageError } from "@/scripts/restore-rehearsal-cli";

// 04.4-01(D8-08): 복원 리허설 결과는 Cloud Run Job 안의 CLI `record`만 쓰고,
// 관리자 시스템 상태 화면이 같은 DB에서 읽는다. CLI는 자식 프로세스로 돌려
// 실제 진입점(APP_ENV 판정 · 종료 코드 · 출력 줄)을 그대로 본다
// (test/integration/account-cli.test.ts 모양).
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://erp:erp@127.0.0.1:5432/erp_test";
const EXIT_TIMEOUT_MS = 30_000;
const IT_TIMEOUT_MS = 60_000;

function runCli(args: string[], appEnv = "staging"): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", ["--import", "tsx", "scripts/restore-rehearsal-cli.ts", ...args], {
    env: {
      ...process.env,
      DATABASE_URL,
      APP_ENV: appEnv,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
    },
    encoding: "utf8",
    timeout: EXIT_TIMEOUT_MS,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

const SUCCESS_ARGS = [
  "record",
  "--succeeded",
  "true",
  "--backup-id",
  "1758684000000",
  "--started-at",
  "2026-09-23T18:02:00Z",
  "--finished-at",
  "2026-09-23T18:14:00Z",
  "--run-url",
  "https://github.com/o/r/actions/runs/1",
  "--run-key",
  "1-1",
];

type Row = {
  source: string;
  succeeded: boolean;
  failed_stage: string | null;
  // drizzle의 raw 실행은 timestamptz를 문자열로 돌려준다.
  finished_at: string;
};

async function rows(): Promise<Row[]> {
  const result = await db.execute<Row>(
    sql`select source, succeeded, failed_stage, finished_at from restore_rehearsals order by seq`,
  );
  return result.rows;
}

// 직접 SQL 삽입(도메인을 건너뛴다) — DB 제약만으로 불변식이 지켜지는지 본다.
async function insertRaw(values: {
  source?: string;
  succeeded: boolean;
  failedStage: string | null;
  runUrl?: string | null;
  runKey: string;
}): Promise<void> {
  const runUrl = values.runUrl === undefined ? "https://github.com/o/r/actions/runs/9" : values.runUrl;
  await db.execute(sql`
    insert into restore_rehearsals (source, succeeded, failed_stage, backup_id, started_at, finished_at, run_url, run_key)
    values (${values.source ?? "staging"}, ${values.succeeded}, ${values.failedStage}, '1',
            '2026-09-23T18:02:00Z', '2026-09-23T18:14:00Z', ${runUrl}, ${values.runKey})
  `);
}

// drizzle가 pg 오류를 감싸 던지므로 cause까지 내려가 제약 이름을 꺼낸다.
async function violatedConstraint(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    let current: unknown = error;
    while (current && typeof current === "object") {
      const constraint = (current as { constraint?: unknown }).constraint;
      if (typeof constraint === "string") return constraint;
      current = (current as { cause?: unknown }).cause;
    }
    throw error;
  }
  return undefined;
}

describe("복원 리허설 기록 → 시스템 상태 (04.4-01 트레이서)", () => {
  it("기록이 없으면 restoreRehearsal이 none이다", async () => {
    const status = await getSystemStatus(SYSTEM_VIEWER);
    expect(status.restoreRehearsal).toEqual({ kind: "none" });
  });

  it(
    "APP_ENV=staging CLI record 한 번이 한 줄이 되고 상태 합성에 recorded로 보인다",
    async () => {
      const { status, stdout, stderr } = runCli(SUCCESS_ARGS);
      expect(stderr).toBe("");
      expect(status).toBe(0);
      expect(stdout).toContain("stored_outcome=success run_key=1-1");

      const result = await getSystemStatus(SYSTEM_VIEWER);
      expect(result.restoreRehearsal).toEqual({
        kind: "recorded",
        record: {
          source: "staging",
          succeeded: true,
          failedStage: null,
          backupId: "1758684000000",
          startedAt: new Date("2026-09-23T18:02:00Z"),
          finishedAt: new Date("2026-09-23T18:14:00Z"),
          runUrl: "https://github.com/o/r/actions/runs/1",
        },
      });
    },
    IT_TIMEOUT_MS,
  );

  it("종료 시각이 늦은 기록, 같으면 나중에 넣은 기록(seq)이 선택된다", async () => {
    const base = {
      source: "staging" as const,
      succeeded: true,
      failedStage: null,
      backupId: "1",
      startedAt: new Date("2026-09-23T18:00:00Z"),
      runUrl: null,
    };
    await recordRestoreRehearsal(SYSTEM_VIEWER, { ...base, backupId: "2", finishedAt: new Date("2026-09-23T19:00:00Z"), runKey: "31-1" });
    await recordRestoreRehearsal(SYSTEM_VIEWER, { ...base, backupId: "1", finishedAt: new Date("2026-09-23T18:30:00Z"), runKey: "32-1" });
    let status = await getSystemStatus(SYSTEM_VIEWER);
    expect(status.restoreRehearsal.kind === "recorded" && status.restoreRehearsal.record.backupId).toBe("2");

    await recordRestoreRehearsal(SYSTEM_VIEWER, { ...base, backupId: "3", finishedAt: new Date("2026-09-23T19:00:00Z"), runKey: "33-1" });
    status = await getSystemStatus(SYSTEM_VIEWER);
    expect(status.restoreRehearsal.kind === "recorded" && status.restoreRehearsal.record.backupId).toBe("3");
  });

  describe("DB 불변식 행렬(직접 SQL)", () => {
    it("성공 + 단계 NULL은 허용된다", async () => {
      await insertRaw({ succeeded: true, failedStage: null, runKey: "41-1" });
      expect(await rows()).toHaveLength(1);
    });

    it("성공 + 단계는 stage check로 거부된다", async () => {
      expect(await violatedConstraint(insertRaw({ succeeded: true, failedStage: "verify", runKey: "42-1" }))).toBe(
        "restore_rehearsals_stage_check",
      );
    });

    it("실패 + 단계 NULL은 stage check로 거부된다", async () => {
      expect(await violatedConstraint(insertRaw({ succeeded: false, failedStage: null, runKey: "43-1" }))).toBe(
        "restore_rehearsals_stage_check",
      );
    });

    it("실패 + 단계는 허용된다", async () => {
      await insertRaw({ succeeded: false, failedStage: "verify", runKey: "44-1" });
      expect(await rows()).toHaveLength(1);
    });

    it("실패 + 모르는 단계는 stage check로 거부된다", async () => {
      expect(await violatedConstraint(insertRaw({ succeeded: false, failedStage: "bogus", runKey: "45-1" }))).toBe(
        "restore_rehearsals_stage_check",
      );
    });

    it("원본 local은 source check로 거부된다", async () => {
      expect(
        await violatedConstraint(insertRaw({ source: "local", succeeded: true, failedStage: null, runKey: "46-1" })),
      ).toBe("restore_rehearsals_source_check");
    });

    it("실패 + 실행 URL NULL은 failed_run_url check로 거부된다", async () => {
      expect(
        await violatedConstraint(insertRaw({ succeeded: false, failedStage: "verify", runUrl: null, runKey: "47-1" })),
      ).toBe("restore_rehearsals_failed_run_url_check");
    });

    it("성공 + 실행 URL NULL은 허용된다", async () => {
      await insertRaw({ succeeded: true, failedStage: null, runUrl: null, runKey: "48-1" });
      expect(await rows()).toHaveLength(1);
    });

    it("같은 run_key 두 번째 삽입은 run_key unique로 거부된다", async () => {
      await insertRaw({ succeeded: true, failedStage: null, runKey: "49-1" });
      expect(await violatedConstraint(insertRaw({ succeeded: true, failedStage: null, runKey: "49-1" }))).toBe(
        "restore_rehearsals_run_key_unique",
      );
    });
  });

  it(
    "APP_ENV=local이면 종료 코드 2이고 행이 생기지 않는다",
    async () => {
      const { status } = runCli(SUCCESS_ARGS, "local");
      expect(status).toBe(2);
      expect(await rows()).toHaveLength(0);
    },
    IT_TIMEOUT_MS,
  );

  describe("인자 규약(parseArgs, DB 없이)", () => {
    const withoutFlag = (flag: string) => {
      const index = SUCCESS_ARGS.indexOf(flag);
      return [...SUCCESS_ARGS.slice(0, index), ...SUCCESS_ARGS.slice(index + 2)];
    };

    it.each([
      ["모르는 플래그", [...SUCCESS_ARGS, "--source", "production"]],
      ["값 없는 플래그", [...SUCCESS_ARGS.slice(0, -1)]],
      ["--succeeded maybe", SUCCESS_ARGS.map((token) => (token === "true" ? "maybe" : token))],
      ["--succeeded 누락", withoutFlag("--succeeded")],
      ["--started-at 누락", withoutFlag("--started-at")],
      ["--finished-at 누락", withoutFlag("--finished-at")],
      ["--run-key 누락", withoutFlag("--run-key")],
      ["하위 명령 없음", []],
    ])("%s → UsageError", (_name, argv) => {
      expect(() => parseArgs(argv)).toThrow(UsageError);
    });
  });

  it(
    "같은 run_key로 두 번 기록해도 한 줄이고 첫 값이 남는다",
    async () => {
      const args = SUCCESS_ARGS.map((token) => (token === "1-1" ? "7-1" : token));
      const first = runCli(args);
      const second = runCli(args.map((token) => (token === "2026-09-23T18:14:00Z" ? "2026-09-23T18:15:00Z" : token)));

      expect(first.status).toBe(0);
      expect(second.status).toBe(0);
      expect(first.stdout).toContain("stored_outcome=success run_key=7-1");
      expect(second.stdout).toContain("stored_outcome=success run_key=7-1");
      expect(second.stdout).toContain("이미 기록된 실행입니다");

      const stored = await rows();
      expect(stored).toHaveLength(1);
      expect(new Date(stored[0]?.finished_at ?? "")).toEqual(new Date("2026-09-23T18:14:00Z"));
    },
    IT_TIMEOUT_MS,
  );

  it(
    "같은 run_key에 다른 결과를 요청하면 저장된 결과를 알리고 종료 코드 4다",
    async () => {
      const failed = runCli([
        "record",
        "--succeeded",
        "false",
        "--failed-stage",
        "cleanup",
        "--backup-id",
        "1758684000000",
        "--started-at",
        "2026-09-23T18:02:00Z",
        "--finished-at",
        "2026-09-23T18:14:00Z",
        "--run-url",
        "https://github.com/o/r/actions/runs/8",
        "--run-key",
        "8-1",
      ]);
      expect(failed.status).toBe(0);
      expect(failed.stdout).toContain("stored_outcome=cleanup run_key=8-1");

      const retried = runCli(SUCCESS_ARGS.map((token) => (token === "1-1" ? "8-1" : token)));
      expect(retried.status).toBe(4);
      expect(retried.stdout + retried.stderr).toContain("이미 다른 결과로 기록된 실행입니다");
      expect(retried.stdout).toContain("stored_outcome=cleanup run_key=8-1");

      const stored = await rows();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ succeeded: false, failed_stage: "cleanup" });

      const result = await recordRestoreRehearsal(SYSTEM_VIEWER, {
        source: "staging",
        succeeded: true,
        failedStage: null,
        backupId: "1758684000000",
        startedAt: new Date("2026-09-23T18:02:00Z"),
        finishedAt: new Date("2026-09-23T18:14:00Z"),
        runUrl: "https://github.com/o/r/actions/runs/8",
        runKey: "8-1",
      });
      expect(result).toEqual({ inserted: false, stored: { succeeded: false, failedStage: "cleanup" } });
    },
    IT_TIMEOUT_MS,
  );
});

// ── Task 2: 쓰기·읽기 검증, 조회 시간 제한, 확인 불가 흡수 ────────────────────────

const VALID_INPUT: RestoreRehearsalInput = {
  source: "staging",
  succeeded: false,
  failedStage: "verify",
  backupId: "1758684000000",
  startedAt: new Date("2026-09-23T18:02:00Z"),
  finishedAt: new Date("2026-09-23T18:14:00Z"),
  runUrl: "https://github.com/o/r/actions/runs/1",
  runKey: "90-1",
};

// console.log를 조용히 한다 — status.restore_rehearsal_unavailable 경고가 테스트 출력을 덮지 않게.
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}

describe("복원 리허설 쓰기 거부(도메인, 04.4-01 Task 2)", () => {
  it.each<[string, Partial<RestoreRehearsalInput>]>([
    ["javascript: URL", { runUrl: "javascript:alert(1)" }],
    ["http URL", { runUrl: "http://github.com/o/r/actions/runs/1" }],
    ["호스트 위장 URL", { runUrl: "https://github.com.evil.example/o/r/actions/runs/1" }],
    ["숫자 아닌 run id", { runUrl: "https://github.com/o/r/actions/runs/abc" }],
    ["꼬리 경로", { runUrl: "https://github.com/o/r/actions/runs/1/x" }],
    ["유효하지 않은 시각", { startedAt: new Date("not-a-date") }],
    ["종료 < 시작", { finishedAt: new Date("2026-09-23T18:00:00Z") }],
    ["백업 id 12a", { backupId: "12a" }],
    ["백업 id 빈 문자열", { backupId: "" }],
    ["백업 id -1", { backupId: "-1" }],
    ["성공 + 단계", { succeeded: true, failedStage: "verify" }],
    ["실패 + 단계 없음", { failedStage: null }],
    ["모르는 단계", { failedStage: "bogus" as RestoreRehearsalInput["failedStage"] }],
    ["실패 + 실행 URL 없음", { runUrl: null }],
    ["실행 키 abc", { runKey: "abc" }],
    ["실행 키 1", { runKey: "1" }],
    ["실행 키 1-", { runKey: "1-" }],
    ["실행 키 1-1-1", { runKey: "1-1-1" }],
  ])("%s → ValidationError, 행 0개", async (_name, override) => {
    await expect(recordRestoreRehearsal(SYSTEM_VIEWER, { ...VALID_INPUT, ...override })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await rows()).toHaveLength(0);
  });
});

describe("복원 리허설 CLI 거부(04.4-01 Task 2)", () => {
  const withFlag = (flag: string, value: string) => {
    const index = SUCCESS_ARGS.indexOf(flag);
    return SUCCESS_ARGS.map((token, i) => (i === index + 1 ? value : token));
  };

  it(
    "javascript: 실행 URL → 종료 코드 ≠ 0, 행 0개",
    async () => {
      expect(runCli(withFlag("--run-url", "javascript:alert(1)")).status).not.toBe(0);
      expect(await rows()).toHaveLength(0);
    },
    IT_TIMEOUT_MS,
  );

  it(
    "종료 < 시작 → 종료 코드 ≠ 0, 행 0개",
    async () => {
      expect(runCli(withFlag("--finished-at", "2026-09-23T18:00:00Z")).status).not.toBe(0);
      expect(await rows()).toHaveLength(0);
    },
    IT_TIMEOUT_MS,
  );

  it(
    "실패(검증)인데 실행 URL 없음 → 종료 코드 ≠ 0, 행 0개",
    async () => {
      const index = SUCCESS_ARGS.indexOf("--run-url");
      const args = [...SUCCESS_ARGS.slice(0, index), ...SUCCESS_ARGS.slice(index + 2)].map((token) =>
        token === "true" ? "false" : token,
      );
      expect(runCli([...args, "--failed-stage", "verify"]).status).not.toBe(0);
      expect(await rows()).toHaveLength(0);
    },
    IT_TIMEOUT_MS,
  );
});

describe("복원 리허설 읽기 — 확인 불가 흡수(04.4-01 Task 2)", () => {
  async function insertTimes(startedAt: string, finishedAt: string): Promise<void> {
    await db.execute(sql`
      insert into restore_rehearsals (source, succeeded, failed_stage, backup_id, started_at, finished_at, run_url, run_key)
      values ('staging', true, null, '1', ${startedAt}, ${finishedAt}, null, '91-1')
    `);
  }

  it("종료 < 시작인 행은 그 행만 unavailable이고 db는 정상이다", async () => {
    await insertTimes("2026-09-23T18:14:00Z", "2026-09-23T18:02:00Z");
    const status = await quietly(() => getSystemStatus(SYSTEM_VIEWER));
    expect(status.restoreRehearsal).toEqual({ kind: "unavailable" });
    expect("unavailable" in status.db).toBe(false);
  });

  it("started_at = infinity인 행은 그 행만 unavailable이고 db는 정상이다", async () => {
    await insertTimes("infinity", "2026-09-23T18:14:00Z");
    const status = await quietly(() => getSystemStatus(SYSTEM_VIEWER));
    expect(status.restoreRehearsal).toEqual({ kind: "unavailable" });
    expect("unavailable" in status.db).toBe(false);
  });

  it(
    "표가 잠겨 있어도 5초 안에 끝나고 그 행만 unavailable, 잠금이 풀리면 none이다",
    async () => {
      const lockPool = new Pool({ connectionString: DATABASE_URL });
      const lockClient = await lockPool.connect();
      try {
        await lockClient.query("begin");
        await lockClient.query("lock table restore_rehearsals in access exclusive mode");

        const startedAt = Date.now();
        const status = await quietly(() => getSystemStatus(SYSTEM_VIEWER));
        expect(Date.now() - startedAt).toBeLessThan(5000);
        expect(status.restoreRehearsal).toEqual({ kind: "unavailable" });
        expect("unavailable" in status.db).toBe(false);
      } finally {
        await lockClient.query("rollback");
        lockClient.release();
        await lockPool.end();
      }

      const after = await getSystemStatus(SYSTEM_VIEWER);
      expect(after.restoreRehearsal).toEqual({ kind: "none" });
    },
    IT_TIMEOUT_MS,
  );

  it(
    "기존 확인이 끝난 뒤 풀이 고갈돼도 5초 안에 끝나고, 늦게 얻은 연결은 새지 않는다",
    async () => {
      const held: PoolClient[] = [];
      try {
        const startedAt = Date.now();
        const status = await quietly(() =>
          getSystemStatus(SYSTEM_VIEWER, {
            // db 항목 조회가 이미 끝난 뒤 불린다 — 여기서 앱 풀을 전부 쥔다.
            getLastBackup: async () => {
              const max = pool.options.max ?? 10;
              for (let i = 0; i < max; i++) held.push(await pool.connect());
              return { kind: "none" as const };
            },
          }),
        );
        expect(Date.now() - startedAt).toBeLessThan(5000);
        expect(status.restoreRehearsal).toEqual({ kind: "unavailable" });
        expect(status.db).toMatchObject({ connections: expect.any(Number) as number });
      } finally {
        for (const client of held) client.release();
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(pool.waitingCount).toBe(0);
      expect(pool.idleCount).toBe(pool.totalCount);

      const next = await getSystemStatus(SYSTEM_VIEWER);
      expect(next.restoreRehearsal).toEqual({ kind: "none" });
    },
    IT_TIMEOUT_MS,
  );
});
