import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

// migrate-runner.ts는 실행 즉시 process.exit()를 호출하므로 직접 import하지
// 않고 자식 프로세스로 실행해 exit code와 stdout(JSON 로그)을 단언한다.
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://erp:erp@127.0.0.1:5432/erp_test";

function runMigrateRunner(env: Record<string, string | undefined>): { status: number | null; stdout: string } {
  const result = spawnSync("node", ["--import", "tsx", "scripts/migrate-runner.ts"], {
    env: {
      ...process.env,
      DATABASE_URL,
      APP_ENV: "local",
      ...env,
    },
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout };
}

function parseEvents(stdout: string): Array<Record<string, unknown>> {
  return stdout
    .split("\n")
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("scripts/migrate-runner 16A 커넥션 규칙 통합", () => {
  it("MAX_INSTANCES가 실제 max_connections를 넘으면 exit 3, deploy.pool_rule_violation을 남긴다", () => {
    const { status, stdout } = runMigrateRunner({ MAX_INSTANCES: "1000", DB_POOL_MAX: "5" });
    expect(status).toBe(3);
    const events = parseEvents(stdout);
    expect(events.some((e) => e.event === "deploy.pool_rule_violation")).toBe(true);
  });

  it("여유가 있으면 exit 0, db.max_connections에 정수 value를 남긴다", () => {
    const { status, stdout } = runMigrateRunner({ MAX_INSTANCES: "1", DB_POOL_MAX: "1" });
    expect(status).toBe(0);
    const events = parseEvents(stdout);
    const maxConnEvent = events.find((e) => e.event === "db.max_connections");
    expect(maxConnEvent).toBeDefined();
    expect(Number.isInteger(maxConnEvent?.value)).toBe(true);
  });

  it("MAX_INSTANCES 미설정이면 exit 0, db.pool_rule_skipped를 남긴다(로컬 개발 경로)", () => {
    const { status, stdout } = runMigrateRunner({ MAX_INSTANCES: undefined, DB_POOL_MAX: undefined });
    expect(status).toBe(0);
    const events = parseEvents(stdout);
    expect(events.some((e) => e.event === "db.pool_rule_skipped")).toBe(true);
  });
});
