import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/restore-rehearsal.sh — D8-08 복원 리허설(rehearse · finalize · guard).
// 모든 호출은 전용 가짜 gcloud(test/unit/deploy/restore-fakebin)로만 돈다 — 실제 GCP에
// 닿는 명령은 없다. 공유 fakebin/gcloud는 쓰지 않는다(기존 deploy·rollback 테스트 보호).

const REPO_ROOT = process.cwd();
const FAKEBIN = join(REPO_ROOT, "test/unit/deploy/restore-fakebin");
const SCRIPT = "scripts/restore-rehearsal.sh";
const PROJECT = "test-project";
const REGION = "asia-northeast3";
const DEFAULT_IMAGE = `${REGION}-docker.pkg.dev/${PROJECT}/plant8/app:aaaa`;
const BACKUP_ID = "1111";

function digestOf(ref: string): string {
  return `sha256:${createHash("sha256").update(ref).digest("hex")}`;
}

interface Ctx {
  stateDir: string;
  logPath: string;
  runnerTemp: string;
  inputEnv: string;
  envShort: string;
  runId: string;
  attempt: string;
  temp: string;
  source: string;
  job: string;
  runKey: string;
}

function makeCtx(opts: { inputEnv?: string; runId?: string; attempt?: string } = {}): Ctx {
  const inputEnv = opts.inputEnv ?? "staging";
  const envShort = inputEnv === "production" ? "prod" : inputEnv;
  const runId = opts.runId ?? "123";
  const attempt = opts.attempt ?? "1";
  const logDir = mkdtempSync(join(tmpdir(), "rehearsal-log-"));
  const logPath = join(logDir, "log");
  writeFileSync(logPath, "");
  return {
    stateDir: mkdtempSync(join(tmpdir(), "rehearsal-state-")),
    logPath,
    runnerTemp: mkdtempSync(join(tmpdir(), "rehearsal-runner-")),
    inputEnv,
    envShort,
    runId,
    attempt,
    temp: `plant8-${envShort}-rehearsal-${runId}-${attempt}`,
    source: `plant8-${envShort}-db`,
    job: `plant8-${envShort}-restore`,
    runKey: `${runId}-${attempt}`,
  };
}

interface RunResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  summary: string;
}

function run(
  ctx: Ctx,
  args: string[],
  extraEnv: Record<string, string | undefined> = {},
): RunResult {
  const summaryDir = mkdtempSync(join(tmpdir(), "rehearsal-summary-"));
  const summaryPath = join(summaryDir, "summary.md");
  writeFileSync(summaryPath, "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${FAKEBIN}:${process.env.PATH ?? ""}`,
    DEPLOY_FAKE_LOG: ctx.logPath,
    DEPLOY_FAKE_STATE: ctx.stateDir,
    RUNNER_TEMP: ctx.runnerTemp,
    INPUT_ENV: ctx.inputEnv,
    PROJECT,
    REGION,
    GITHUB_RUN_ID: ctx.runId,
    GITHUB_RUN_ATTEMPT: ctx.attempt,
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_REPOSITORY: "o/r",
    GITHUB_STEP_SUMMARY: summaryPath,
  };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  const result = spawnSync("bash", [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    summary: readFileSync(summaryPath, "utf8"),
  };
}

function rawLog(ctx: Ctx): string[] {
  return readFileSync(ctx.logPath, "utf8")
    .split("\n")
    .filter((line) => line !== "");
}

// 가짜 gcloud 줄만(가짜 timeout·sleep 줄 제외), 머리표(UNBOUNDED · @가짜 시각)를 떼고.
function calls(ctx: Ctx): string[] {
  return rawLog(ctx)
    .filter((line) => !line.startsWith("timeout ") && !line.startsWith("sleep "))
    .map((line) => line.replace(/^(UNBOUNDED )?(@\d+ )?/, ""));
}

function statePath(ctx: Ctx): string {
  return join(ctx.runnerTemp, `restore-rehearsal-${ctx.runKey}.state`);
}

function stateLines(ctx: Ctx): string[] {
  return readFileSync(statePath(ctx), "utf8")
    .split("\n")
    .filter((line) => line !== "");
}

function stateValue(ctx: Ctx, key: string): string | undefined {
  const found = stateLines(ctx).filter((line) => line.startsWith(`${key}=`));
  return found.length === 0 ? undefined : found[found.length - 1].slice(key.length + 1);
}

function label(ctx: Ctx, line: string): string {
  if (line.startsWith(`run jobs describe ${ctx.job} `)) return "job-image";
  if (line.startsWith("artifacts docker images describe ")) return "digest";
  if (line.startsWith("sql instances list ")) {
    if (line.includes("--filter=name~^")) return "list-prefix";
    if (line.split(" ").includes(`--filter=name=${ctx.temp}`)) return "list-exact";
  }
  if (line.startsWith(`sql backups list --instance=${ctx.source} `)) return "backups";
  if (line.startsWith(`sql instances describe ${ctx.source} `)) return "source-disk";
  if (line.startsWith(`sql instances create ${ctx.temp} `)) return "create";
  if (line.startsWith(`sql instances describe ${ctx.temp} `)) {
    if (line.includes("--format=value(state)")) return "state";
    if (line.includes("--format=value(connectionName)")) return "conn";
  }
  if (line.startsWith("sql backups restore ")) return "restore";
  if (line.startsWith(`sql users list --instance=${ctx.temp} `)) return "users-list";
  if (line.startsWith("sql users create ")) return "users-create";
  if (line.startsWith(`run jobs execute ${ctx.job} `)) {
    if (line.includes("--args=verify,")) return "verify";
    if (line.includes("--args=record,")) return "record";
  }
  if (line.startsWith("logging read ")) return "logs";
  if (line.startsWith("run jobs executions describe ")) return "exec-image";
  if (line.startsWith("run jobs executions list ")) return "exec-list";
  if (line.startsWith(`sql operations list --instance=${ctx.temp} `)) return "ops-list";
  if (line.startsWith("sql operations wait ")) return "ops-wait";
  if (line.startsWith(`sql instances delete ${ctx.temp} `)) return "delete";
  return `other:${line}`;
}

function labels(ctx: Ctx, lines: string[] = calls(ctx)): string[] {
  return lines.map((line) => label(ctx, line));
}

function tokens(line: string): string[] {
  return line.split(" ");
}

// 전 시나리오 공통 불변식 — 변경 명령의 대상은 임시 이름뿐, 삭제는 전부 --async,
// 생성은 사설 IP만, record는 모두 같은 실행 키이고(기록 실패를 흉내 내지 않았으면) 많아야 한 번.
function assertInvariants(ctx: Ctx, opts: { allowRecordRetry?: boolean } = {}): void {
  const lines = calls(ctx);
  for (const line of lines) {
    const t = tokens(line);
    if (line.startsWith("sql instances create ")) {
      expect(t[3]).toBe(ctx.temp);
      expect(t).toContain("--no-assign-ip");
      expect(t).toContain("--network=projects/test-project/global/networks/default");
      expect(
        t.some((x) => x.startsWith("--assign-ip") || x.startsWith("--authorized-networks")),
      ).toBe(false);
    }
    if (line.startsWith("sql instances delete ")) {
      expect(t[3]).toBe(ctx.temp);
      expect(t).toContain("--async");
    }
    if (line.includes("--restore-instance=")) {
      expect(t).toContain(`--restore-instance=${ctx.temp}`);
    }
    if (line.startsWith("sql users create ")) {
      expect(t).toContain(`--instance=${ctx.temp}`);
    }
    if (line.startsWith("sql operations wait ")) {
      expect(t[3].startsWith(`op-${ctx.temp}-`)).toBe(true);
    }
    expect(line).not.toMatch(/^sql instances (patch|restart|clone|promote-replica) /);
  }
  const records = lines.filter((line) => line.includes("--args=record"));
  for (const line of records) {
    expect(line).toContain(`,--run-key,${ctx.runKey}`);
  }
  if (!opts.allowRecordRetry) {
    expect(records.length).toBeLessThanOrEqual(1);
  }
}

describe("restore-rehearsal.sh 행복 경로(트레이서)", { timeout: 60_000 }, () => {
  it("rehearse — 기준선 이미지 → 고아 점검 → 백업 → 생성 → 복원 → verify → EXIT 정리(async 삭제 · operations wait) 순서, record 없음", () => {
    const ctx = makeCtx();
    const result = run(ctx, ["rehearse"]);
    expect(result.status, result.stderr).toBe(0);

    const lines = calls(ctx);
    expect(labels(ctx, lines)).toEqual([
      "job-image",
      "digest",
      "list-prefix",
      "backups",
      "source-disk",
      "create",
      "state",
      "restore",
      "state",
      "users-list",
      "users-create",
      "conn",
      "verify",
      "logs",
      "exec-image",
      "digest",
      "list-exact",
      "ops-list",
      "delete",
      "ops-list",
      "ops-wait",
      "list-exact",
    ]);
    expect(lines.join("\n")).not.toContain("--args=record");

    expect(lines[2]).toContain("--filter=name~^plant8-staging-rehearsal-");
    expect(lines[3]).toContain("--filter=type=AUTOMATED AND status=SUCCESSFUL");
    expect(lines[3]).toContain("--sort-by=~startTime");
    expect(lines[3]).toContain("--limit=1");
    expect(tokens(lines[7])).toContain(BACKUP_ID);
    expect(lines[7]).toContain(`--restore-instance=${ctx.temp}`);
    expect(lines[7]).toContain(`--backup-instance=${ctx.source}`);
    expect(lines[10]).toContain(`plant8-staging-runtime@${PROJECT}.iam`);
    expect(lines[10]).toContain("--type=cloud_iam_service_account");
    const conn = `${PROJECT}:${REGION}:${ctx.temp}`;
    expect(lines[12]).toContain(`--args=verify,--target,${conn}`);
    expect(lines[12]).toContain(`--update-env-vars=CLOUD_SQL_CONNECTION_NAME=${conn}`);

    expect(stateValue(ctx, "STAGE")).toBe("verified");
    expect(stateValue(ctx, "IMAGE")).toBe(DEFAULT_IMAGE);
    expect(stateValue(ctx, "DIGEST")).toBe(digestOf(DEFAULT_IMAGE));
    expect(stateValue(ctx, "VERIFY_DIGEST")).toBe(stateValue(ctx, "DIGEST"));
    expect(stateValue(ctx, "BACKUP_ID")).toBe(BACKUP_ID);
    assertInvariants(ctx);
  });

  it("finalize — 마지막 정리 → 기록 직전 이미지 → record 한 번(env 덮어쓰기 없음, run-key) → record 실행 이미지 → 접두 목록", () => {
    const ctx = makeCtx();
    expect(run(ctx, ["rehearse"]).status).toBe(0);
    const before = calls(ctx).length;
    const result = run(ctx, ["finalize"]);
    expect(result.status, result.stderr).toBe(0);

    const lines = calls(ctx).slice(before);
    expect(labels(ctx, lines)).toEqual([
      "list-exact",
      "job-image",
      "digest",
      "record",
      "exec-image",
      "digest",
      "list-prefix",
    ]);
    expect(lines[3]).toContain("--args=record,--succeeded,true,");
    expect(lines[3]).toContain(`,--backup-id,${BACKUP_ID},`);
    expect(lines[3]).toContain(`,--run-key,${ctx.runKey}`);
    expect(lines[3]).not.toContain("--update-env-vars");
    expect(lines[3]).not.toContain("--failed-stage");

    expect(stateValue(ctx, "RECORDED")).toBe("1");
    expect(stateValue(ctx, "STORED_OUTCOME")).toBe("success");
    expect(stateValue(ctx, "RECORD_EXEC")).toMatch(/^plant8-staging-restore-exec-\d+$/);
    expect(lines[4]).toContain(stateValue(ctx, "RECORD_EXEC"));
    expect(stateValue(ctx, "POST_RECORD")).toBe("ok");
    assertInvariants(ctx);
  });

  it("요약 — 기록된 결과 · 백업 id · 임시 이름 · 남은 임시 인스턴스 0 · 이미지 참조@digest · 기록했습니다", () => {
    const ctx = makeCtx();
    run(ctx, ["rehearse"]);
    const result = run(ctx, ["finalize"]);
    expect(result.summary).toContain("기록된 결과: 성공");
    expect(result.summary).toContain(BACKUP_ID);
    expect(result.summary).toContain(ctx.temp);
    expect(result.summary).toContain("남은 임시 인스턴스 0");
    expect(result.summary).toContain(`이미지 ${DEFAULT_IMAGE}@${digestOf(DEFAULT_IMAGE)}`);
    expect(result.summary).toContain("기록했습니다");
  });

  it("record 인자 — run URL과 시각 모양, started-at은 rehearse가 적은 시각", () => {
    const ctx = makeCtx();
    run(ctx, ["rehearse"]);
    const startedAt = stateValue(ctx, "STARTED_AT");
    expect(startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    run(ctx, ["finalize"]);
    const record = calls(ctx).find((line) => line.includes("--args=record"));
    expect(record).toBeDefined();
    expect(record).toContain(",--run-url,https://github.com/o/r/actions/runs/123,");
    expect(record).toContain(`,--started-at,${startedAt},`);
    expect(record).toMatch(/,--finished-at,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z,/);
  });

  it("공통 불변식 — 변경 명령 대상 = 임시 이름, 원본은 조회·--backup-instance로만", () => {
    const ctx = makeCtx();
    run(ctx, ["rehearse"]);
    run(ctx, ["finalize"]);
    assertInvariants(ctx);
    const mutating = calls(ctx).filter((line) =>
      /^sql (instances (create|delete)|backups restore|users create)/.test(line),
    );
    expect(mutating.length).toBeGreaterThan(0);
    for (const line of mutating) {
      expect(line).toContain(ctx.temp);
      expect(line.replace(`--backup-instance=${ctx.source}`, "")).not.toContain(ctx.source);
    }
    expect(existsSync(join(ctx.stateDir, "instances", ctx.temp))).toBe(false);
  });
});
