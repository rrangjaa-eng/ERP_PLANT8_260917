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
  return found.at(-1)?.slice(key.length + 1);
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
      expect(t[3]?.startsWith(`op-${ctx.temp}-`)).toBe(true);
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
  // 마감 불변식 — 모든 gcloud가 가짜 timeout 안에서 불렸고, timeout이 받은 초가 전부 양의 정수다.
  const raw = rawLog(ctx);
  expect(raw.filter((line) => line.startsWith("UNBOUNDED"))).toEqual([]);
  expect(raw.filter((line) => line.includes("TIMEOUT_NONPOSITIVE"))).toEqual([]);
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
    expect(tokens(lines[7] ?? "")).toContain(BACKUP_ID);
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

// ── Task 2: 실패 · 중단 · 알 수 없는 정리 · 작업 대기 · 한 번 기록 · 이미지 변경 · production 확인 ──

const NEW_IMAGE = `${REGION}-docker.pkg.dev/${PROJECT}/plant8/app:bbbb`;
const DEPLOY_OVERLAP = "배포가 겹쳐 실패로 남김 — 다시 돌리면 됩니다";
const CLOCK_START = 1_000_000;
const FINALIZE_BUDGET_SEC = 2280;
const CLEANUP_SHARE_SEC = 1200;
const SUMMARY_RESERVE_SEC = 60;

function recordCalls(ctx: Ctx): string[] {
  return calls(ctx).filter((line) => line.includes("--args=record"));
}

function withClock(): { file: string; read: () => number } {
  const dir = mkdtempSync(join(tmpdir(), "rehearsal-clock-"));
  const file = join(dir, "clock");
  writeFileSync(file, String(CLOCK_START));
  return { file, read: () => Number(readFileSync(file, "utf8").trim()) };
}

function writeState(ctx: Ctx, lines: string[]): void {
  writeFileSync(statePath(ctx), lines.length === 0 ? "" : `${lines.join("\n")}\n`);
}

function dropStateKeys(ctx: Ctx, keys: string[]): void {
  writeState(
    ctx,
    stateLines(ctx).filter((line) => !keys.some((key) => line.startsWith(`${key}=`))),
  );
}

function makeInstance(ctx: Ctx, name: string): void {
  writeFileSync(join(ctx.stateDir, "instances", name), REGION);
}

function prepareStateDirs(ctx: Ctx): void {
  spawnSync("mkdir", ["-p", join(ctx.stateDir, "instances"), join(ctx.stateDir, "ops")]);
}

interface ClockedLine {
  kind: "gcloud" | "timeout" | "sleep";
  at: number;
  sec?: number;
  text: string;
}

// 가짜 시계가 있을 때 로그 줄을 (종류, 시각, 제한 초, 본문)으로 읽는다.
function clockedLog(ctx: Ctx, from = 0): ClockedLine[] {
  return rawLog(ctx)
    .slice(from)
    .map((line): ClockedLine => {
      const timeout = /^timeout (\d+) @(\d+) (.*)$/.exec(line);
      if (timeout) {
        return { kind: "timeout", sec: Number(timeout[1]), at: Number(timeout[2]), text: timeout[3] ?? "" };
      }
      const sleep = /^sleep (\d+) @(\d+)$/.exec(line);
      if (sleep) {
        return { kind: "sleep", sec: Number(sleep[1]), at: Number(sleep[2]), text: line };
      }
      const gcloud = /^(?:UNBOUNDED )?@(\d+) (.*)$/.exec(line);
      if (!gcloud) throw new Error(`시각 없는 로그 줄: ${line}`);
      return { kind: "gcloud", at: Number(gcloud[1]), text: gcloud[2] ?? "" };
    });
}

describe("가드 · production 확인 — 첫 gcloud 전에 멈춘다", { timeout: 60_000 }, () => {
  it.each([
    "plant8-staging-db",
    "plant8-prod-db",
    "plant8-prod-rehearsal-1-1",
    "plant8-staging-rehearsal-x-1",
    "plant8-staging-rehearsal-1-1-extra",
  ])("guard %s → 거부, gcloud 0줄", (name) => {
    const ctx = makeCtx();
    const result = run(ctx, ["guard", name]);
    expect(result.status).not.toBe(0);
    expect(rawLog(ctx)).toEqual([]);
  });

  it("guard plant8-staging-rehearsal-1-1 → 통과(종료 코드 0), gcloud 0줄", () => {
    const ctx = makeCtx();
    expect(run(ctx, ["guard", "plant8-staging-rehearsal-1-1"]).status).toBe(0);
    expect(rawLog(ctx)).toEqual([]);
  });

  it.each([
    ["GITHUB_RUN_ID 빈 값", { GITHUB_RUN_ID: "" }],
    ["GITHUB_RUN_ATTEMPT 숫자 아님", { GITHUB_RUN_ATTEMPT: "1a" }],
    ["INPUT_ENV=prod-db", { INPUT_ENV: "prod-db" }],
  ])("%s → rehearse · finalize 둘 다 거부, gcloud 0줄", (_name, env) => {
    const ctx = makeCtx();
    expect(run(ctx, ["rehearse"], env).status).not.toBe(0);
    expect(run(ctx, ["finalize"], env).status).not.toBe(0);
    expect(rawLog(ctx)).toEqual([]);
  });

  it.each([
    ["없음", undefined],
    ["plant8-prod-DB", "plant8-prod-DB"],
  ])("production 확인 입력 %s → rehearse · finalize 둘 다 종료 코드 3, gcloud 0줄", (_name, confirm) => {
    const ctx = makeCtx({ inputEnv: "production" });
    expect(run(ctx, ["rehearse"], { CONFIRM_PRODUCTION: confirm }).status).toBe(3);
    expect(run(ctx, ["finalize"], { CONFIRM_PRODUCTION: confirm }).status).toBe(3);
    expect(rawLog(ctx)).toEqual([]);
  });

  it("production 확인 입력이 정확히 plant8-prod-db면 진행 — 원본 plant8-prod-db, 임시 plant8-prod-rehearsal-…", () => {
    const ctx = makeCtx({ inputEnv: "production" });
    const env = { CONFIRM_PRODUCTION: "plant8-prod-db" };
    expect(run(ctx, ["rehearse"], env).status).toBe(0);
    expect(run(ctx, ["finalize"], env).status).toBe(0);
    const lines = calls(ctx);
    expect(lines.some((line) => line.startsWith("sql backups list --instance=plant8-prod-db "))).toBe(true);
    expect(lines.some((line) => line.startsWith("sql instances create plant8-prod-rehearsal-123-1 "))).toBe(
      true,
    );
    expect(lines.some((line) => line.includes("run jobs execute plant8-prod-restore "))).toBe(true);
    assertInvariants(ctx);
  });
});

describe("고아 점검", { timeout: 60_000 }, () => {
  it("고아 1 — 남은 plant8-staging-rehearsal-99-1이 있으면 만들지 않고 실패, finalize는 지우지 않고 cleanup 기록", () => {
    const ctx = makeCtx();
    prepareStateDirs(ctx);
    makeInstance(ctx, "plant8-staging-rehearsal-99-1");
    const rehearse = run(ctx, ["rehearse"]);
    expect(rehearse.status).toBe(1);
    expect(labels(ctx)).not.toContain("create");
    expect(labels(ctx)).not.toContain("backups");
    expect(stateValue(ctx, "ORPHANS")).toBe("plant8-staging-rehearsal-99-1");
    expect(stateValue(ctx, "STAGE")).toBe("started");

    const finalize = run(ctx, ["finalize"]);
    expect(finalize.status).toBe(1);
    expect(recordCalls(ctx)[0]).toContain("--succeeded,false,--failed-stage,cleanup");
    expect(finalize.summary).toContain("plant8-staging-rehearsal-99-1");
    expect(finalize.summary).toContain("RESTORE.md");
    expect(existsSync(join(ctx.stateDir, "instances", "plant8-staging-rehearsal-99-1"))).toBe(true);
    assertInvariants(ctx);
  });

  it("고아 2 — 접두 목록 조회가 503으로 실패하면 만들지 않고 실패, 요약 「남은 임시 인스턴스 확인 불가」", () => {
    const ctx = makeCtx();
    const env = { FAKE_LIST_FAIL: "503" };
    const rehearse = run(ctx, ["rehearse"], env);
    expect(rehearse.status).toBe(1);
    expect(labels(ctx)).not.toContain("create");
    expect(stateValue(ctx, "ORPHANS")).toBe("unknown");
    expect(rehearse.summary).toContain("남은 임시 인스턴스 확인 불가");

    const finalize = run(ctx, ["finalize"], env);
    expect(finalize.status).toBe(1);
    expect(finalize.summary).toContain("남은 임시 인스턴스 확인 불가");
    expect(finalize.summary).not.toContain("남은 임시 인스턴스 0");
    expect(recordCalls(ctx)[0]).toContain("--failed-stage,cleanup");
    assertInvariants(ctx);
  });
});

describe("실패 단계", { timeout: 60_000 }, () => {
  it("실패 1 — 성공한 자동 백업이 없으면 생성 없이 restore 기록, --backup-id 없음", () => {
    const ctx = makeCtx();
    const env = { FAKE_NO_BACKUP: "1" };
    expect(run(ctx, ["rehearse"], env).status).toBe(1);
    expect(labels(ctx)).not.toContain("create");
    const finalize = run(ctx, ["finalize"], env);
    expect(finalize.status).toBe(1);
    const record = recordCalls(ctx)[0];
    expect(record).toContain("--succeeded,false,--failed-stage,restore");
    expect(record).not.toContain("--backup-id");
    assertInvariants(ctx);
  });

  it.each(["create", "restore", "users"])(
    "실패 2 — FAKE_FAIL=%s → restore 기록, 임시를 그 이름으로 삭제",
    (knob) => {
      const ctx = makeCtx();
      const env = { FAKE_FAIL: knob };
      expect(run(ctx, ["rehearse"], env).status).toBe(1);
      expect(labels(ctx)).toContain("delete");
      const finalize = run(ctx, ["finalize"], env);
      expect(finalize.status).toBe(1);
      expect(recordCalls(ctx)[0]).toContain("--succeeded,false,--failed-stage,restore");
      expect(finalize.summary).toContain("기록된 결과: 실패 · 복원");
      assertInvariants(ctx);
    },
  );

  it("실패 3 — verify 실패는 verify 기록, 임시 삭제, 남은 임시 인스턴스 0, 상태 파일에 verified 없음", () => {
    const ctx = makeCtx();
    const env = { FAKE_FAIL: "verify" };
    expect(run(ctx, ["rehearse"], env).status).toBe(1);
    expect(labels(ctx)).toContain("delete");
    expect(stateValue(ctx, "STAGE")).toBe("verify");
    expect(stateLines(ctx)).not.toContain("STAGE=verified");
    const finalize = run(ctx, ["finalize"], env);
    expect(finalize.status).toBe(1);
    expect(recordCalls(ctx)[0]).toContain("--succeeded,false,--failed-stage,verify");
    expect(finalize.summary).toContain("남은 임시 인스턴스 0");
    assertInvariants(ctx);
  });
});

describe("정리 — 부재는 성공한 정확한 이름 목록으로만", { timeout: 60_000 }, () => {
  it.each([
    ["403", "PERMISSION_DENIED"],
    ["503", "UNAVAILABLE"],
    ["auth", "Reauthentication failed"],
  ])("정리 1~3(403 · 503 · Reauthentication 각각) — 생성 뒤 목록이 %s(%s)로 실패하면 cleanup 실패 · 「확인 불가」 · 「0」 없음(describe NOT_FOUND를 부재로 보지 않는다)", (code, phrase) => {
    const ctx = makeCtx();
    const env = { FAKE_LIST_FAIL: code, FAKE_LIST_FAIL_AFTER_CREATE: "1" };
    const rehearse = run(ctx, ["rehearse"], env);
    expect(rehearse.status).toBe(1);
    expect(rehearse.stderr).toContain(phrase);
    expect(stateValue(ctx, "CLEANUP")).toBe("unknown");
    const finalize = run(ctx, ["finalize"], env);
    expect(finalize.status).toBe(1);
    expect(recordCalls(ctx)[0]).toContain("--failed-stage,cleanup");
    expect(finalize.summary).toContain("확인 불가");
    expect(finalize.summary).not.toContain("남은 임시 인스턴스 0");
    assertInvariants(ctx);
  });

  it("정리 4 — 끝나지 않은 작업을 operations wait로 먼저 기다리고, 충돌한 삭제를 다시 시도해 부재 확인", () => {
    const ctx = makeCtx();
    const env = { FAKE_PENDING_OP: "1", FAKE_DELETE_CONFLICT: "1" };
    expect(run(ctx, ["rehearse"], env).status).toBe(0);
    const ls = labels(ctx);
    expect(ls.indexOf("ops-wait")).toBeGreaterThan(-1);
    expect(ls.indexOf("ops-wait")).toBeLessThan(ls.indexOf("delete"));
    expect(ls.filter((l) => l === "delete").length).toBe(2);
    expect(stateValue(ctx, "CLEANUP")).toBe("absent");
    expect(run(ctx, ["finalize"], env).status).toBe(0);
    assertInvariants(ctx);
  });

  it("정리 5 — 삭제가 늘 실패하면 3번 뒤 멈추고 cleanup이 앞선 성공을 덮는다, 요약에 남은 임시 이름", () => {
    const ctx = makeCtx();
    const env = { FAKE_DELETE_FAIL: "always" };
    expect(run(ctx, ["rehearse"], env).status).toBe(1);
    expect(labels(ctx).filter((l) => l === "delete").length).toBe(3);
    expect(stateValue(ctx, "STAGE")).toBe("verified");
    const before = calls(ctx).length;
    const finalize = run(ctx, ["finalize"], env);
    expect(finalize.status).toBe(1);
    expect(labels(ctx, calls(ctx).slice(before)).filter((l) => l === "delete").length).toBe(3);
    expect(recordCalls(ctx)[0]).toContain("--succeeded,false,--failed-stage,cleanup");
    expect(finalize.summary).toContain(ctx.temp);
    assertInvariants(ctx);
  });

  it("폴링 소진 — RUNNABLE이 끝내 안 되면 상태 조회 정확히 90번 뒤 restore 실패, 임시 삭제", () => {
    const ctx = makeCtx();
    const env = { FAKE_NEVER_RUNNABLE: "1" };
    const rehearse = run(ctx, ["rehearse"], env);
    expect(rehearse.status).toBe(1);
    expect(labels(ctx).filter((l) => l === "state").length).toBe(90);
    expect(labels(ctx)).not.toContain("restore");
    expect(labels(ctx)).toContain("delete");
    expect(stateValue(ctx, "STAGE")).toBe("restore");
    expect(run(ctx, ["finalize"], env).status).toBe(1);
    expect(recordCalls(ctx)[0]).toContain("--failed-stage,restore");
    assertInvariants(ctx);
  });
});

describe("finalize — 중단(kill) · 판정 표", { timeout: 60_000 }, () => {
  it.each(["started", "create", "restore"])(
    "finalize 1(started · create · restore) — rehearse가 %s에서 kill되면(EXIT trap 없음) finalize가 임시를 지우고 restore 기록",
    (point) => {
      const ctx = makeCtx();
      const rehearse = run(ctx, ["rehearse"], { FAKE_KILL_AFTER: point });
      expect(rehearse.signal).toBe("SIGKILL");
      const leftover = existsSync(join(ctx.stateDir, "instances", ctx.temp));
      expect(leftover).toBe(point !== "started");
      const before = calls(ctx).length;
      const finalize = run(ctx, ["finalize"]);
      expect(finalize.status).toBe(1);
      const after = labels(ctx, calls(ctx).slice(before));
      if (leftover) {
        expect(after).toContain("delete");
      }
      expect(existsSync(join(ctx.stateDir, "instances", ctx.temp))).toBe(false);
      expect(recordCalls(ctx)[0]).toContain("--succeeded,false,--failed-stage,restore");
      assertInvariants(ctx);
    },
  );

  const baseline = [`IMAGE=${DEFAULT_IMAGE}`, `DIGEST=${digestOf(DEFAULT_IMAGE)}`];
  it.each([
    ["ⓐ STAGE=started → restore", ["STAGE=started"], "restore"],
    ["ⓑ STAGE=restore + BACKUP_ID → restore", ["STAGE=restore", `BACKUP_ID=${BACKUP_ID}`], "restore"],
    ["ⓒ STAGE=verify + 기준선 → verify", ["STAGE=verify", ...baseline], "verify"],
    ["ⓓ STAGE=verify + 옛 VERIFY_OK=1 → verify", ["STAGE=verify", "VERIFY_OK=1", ...baseline], "verify"],
    [
      "ⓔ STAGE=verified + 같은 digest → 성공(유일)",
      ["STAGE=verified", ...baseline, `VERIFY_DIGEST=${digestOf(DEFAULT_IMAGE)}`],
      "success",
    ],
    ["ⓔ′ STAGE=verified, VERIFY_DIGEST 없음 → verify(이미지 확인 불가)", ["STAGE=verified", ...baseline], "verify"],
    [
      "ⓕ STAGE=verified + ORPHANS=unknown → cleanup",
      ["STAGE=verified", ...baseline, `VERIFY_DIGEST=${digestOf(DEFAULT_IMAGE)}`, "ORPHANS=unknown"],
      "cleanup",
    ],
    ["ⓖ STAGE=bogus → restore", ["STAGE=bogus"], "restore"],
    ["ⓗ STAGE 줄 없음 → restore", [`BACKUP_ID=${BACKUP_ID}`], "restore"],
  ])("판정 표 %s", (_name, lines, expected) => {
    const ctx = makeCtx();
    writeState(ctx, lines);
    const finalize = run(ctx, ["finalize"]);
    const record = recordCalls(ctx)[0];
    if (expected === "success") {
      expect(finalize.status, finalize.stderr).toBe(0);
      expect(record).toContain("--succeeded,true,");
      expect(record).not.toContain("--failed-stage");
    } else {
      expect(finalize.status).toBe(1);
      expect(record).toContain(`--succeeded,false,--failed-stage,${expected},`);
    }
    if (_name.startsWith("ⓔ′")) {
      expect(finalize.summary).toContain("이미지 확인 불가");
    }
    expect(record).toMatch(/,--started-at,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z,/);
    assertInvariants(ctx);
  });
});

describe("finalize — 한 번 기록 · run-key · 저장된 결과", { timeout: 60_000 }, () => {
  it("finalize 2 — 성공 뒤 finalize를 두 번 돌려도 record는 한 번, 두 번째도 종료 코드 0", () => {
    const ctx = makeCtx();
    run(ctx, ["rehearse"]);
    expect(run(ctx, ["finalize"]).status).toBe(0);
    expect(run(ctx, ["finalize"]).status).toBe(0);
    expect(recordCalls(ctx).length).toBe(1);
    assertInvariants(ctx);
  });

  it("finalize 3 — 상태 파일이 없으면 정확한 이름 정리만 하고 record 없음, 「기록하지 않았습니다」", () => {
    const ctx = makeCtx();
    prepareStateDirs(ctx);
    makeInstance(ctx, ctx.temp);
    const finalize = run(ctx, ["finalize"]);
    expect(finalize.status).toBe(1);
    expect(labels(ctx)).toContain("delete");
    expect(existsSync(join(ctx.stateDir, "instances", ctx.temp))).toBe(false);
    expect(recordCalls(ctx)).toEqual([]);
    expect(finalize.summary).toContain("기록하지 않았습니다");
    assertInvariants(ctx);
  });

  it("finalize 4 — record 실행이 실패하면 종료 코드 1, 「기록 실패」, RECORDED 없음", () => {
    const ctx = makeCtx();
    run(ctx, ["rehearse"]);
    const finalize = run(ctx, ["finalize"], { FAKE_FAIL: "record" });
    expect(finalize.status).toBe(1);
    expect(finalize.summary).toContain("기록 실패");
    expect(stateValue(ctx, "RECORDED")).toBeUndefined();
    assertInvariants(ctx);
  });

  it("finalize 5ⓐ — 응답을 잃고 로그도 없으면 「기록 실패(저장된 결과 확인 불가)」, 다시 돌린 finalize가 같은 run-key로 성공", () => {
    const ctx = makeCtx();
    run(ctx, ["rehearse"]);
    const first = run(ctx, ["finalize"], { FAKE_RECORD_ACK_LOST: "1", FAKE_RECORD_LOGS: "none" });
    expect(first.status).toBe(1);
    expect(first.summary).toContain("기록 실패(저장된 결과 확인 불가)");
    expect(stateValue(ctx, "RECORDED")).toBeUndefined();
    const second = run(ctx, ["finalize"]);
    expect(second.status, second.stderr).toBe(0);
    expect(second.summary).toContain("기록된 결과: 성공");
    const records = recordCalls(ctx);
    expect(records.length).toBe(2);
    expect(records[1]).toContain(`,--run-key,${ctx.runKey}`);
    assertInvariants(ctx, { allowRecordRetry: true });
  });

  it("finalize 5ⓑ — 응답을 잃었지만 로그에 자기 키의 stored_outcome=success가 있으면 저장된 결과로 삼는다(다른 키 줄 무시)", () => {
    const ctx = makeCtx();
    run(ctx, ["rehearse"]);
    const finalize = run(ctx, ["finalize"], { FAKE_RECORD_ACK_LOST: "1" });
    expect(finalize.status, finalize.stderr).toBe(0);
    expect(labels(ctx)).toContain("exec-list");
    expect(stateValue(ctx, "RECORDED")).toBe("1");
    expect(stateValue(ctx, "STORED_OUTCOME")).toBe("success");
    expect(finalize.summary).toContain("기록된 결과: 성공");
    expect(recordCalls(ctx).length).toBe(1);
    assertInvariants(ctx);
  });

  it("finalize 6 — 저장된 결과가 권위: 첫 기록이 cleanup이면 다시 돌린 finalize의 정리가 성공해도 「기록된 결과: 실패 · 정리」", () => {
    const ctx = makeCtx();
    expect(run(ctx, ["rehearse"], { FAKE_DELETE_FAIL: "always" }).status).toBe(1);
    const first = run(ctx, ["finalize"], {
      FAKE_DELETE_FAIL: "always",
      FAKE_RECORD_ACK_LOST: "1",
      FAKE_RECORD_LOGS: "none",
    });
    expect(first.status).toBe(1);
    expect(first.summary).toContain("기록 실패(저장된 결과 확인 불가)");

    const second = run(ctx, ["finalize"]);
    expect(second.status).toBe(1);
    expect(recordCalls(ctx)[1]).toContain("--succeeded,true,");
    expect(second.summary).toContain("기록된 결과: 실패 · 정리");
    expect(second.summary).toContain("이미 기록된 실행입니다");
    expect(second.summary).toContain("이번 정리: 남은 임시 인스턴스 0");
    expect(second.summary).not.toContain("기록된 결과: 성공");
    expect(stateValue(ctx, "RECORDED")).toBe("1");
    expect(stateValue(ctx, "STORED_OUTCOME")).toBe("cleanup");

    const third = run(ctx, ["finalize"]);
    expect(third.status).toBe(1);
    expect(recordCalls(ctx).length).toBe(2);
    expect(third.summary).toContain("기록된 결과: 실패 · 정리");
    assertInvariants(ctx, { allowRecordRetry: true });
  });
});

describe("마감 — 하나의 마감으로 모든 gcloud와 대기를 자른다", { timeout: 60_000 }, () => {
  function assertCleanupShare(ctx: Ctx, from: number, start: number): void {
    const log = clockedLog(ctx, from);
    const cleanupEnd = start + CLEANUP_SHARE_SEC;
    for (const line of log) {
      if (line.kind === "gcloud" && line.text.startsWith("sql operations wait ")) {
        const n = Number(/--timeout=(\d+)/.exec(line.text)?.[1]);
        expect(n).toBeLessThanOrEqual(600);
        expect(n).toBeLessThanOrEqual(CLEANUP_SHARE_SEC - (line.at - start));
      }
      // 정리 몫이 떨어진 뒤에는 정리용 sql 호출(정확한 이름 목록 · 작업 · 삭제)과 30초 쉼이 없다.
      // 요약의 접두 목록(예비 0)은 정리가 아니다.
      if (line.at >= cleanupEnd) {
        if (line.kind === "gcloud" && line.text.startsWith("sql ")) {
          expect(line.text).toContain("--filter=name~^");
        }
        expect(line.kind === "sleep" && line.sec === 30).toBe(false);
      }
    }
    const record = log.find((line) => line.kind === "timeout" && line.text.includes("--args=record"));
    expect(record).toBeDefined();
    if (record) {
      expect(record.sec).toBeLessThanOrEqual(
        FINALIZE_BUDGET_SEC - (record.at - start) - SUMMARY_RESERVE_SEC,
      );
      expect(record.text).toContain("--failed-stage,cleanup");
    }
  }

  it("마감 1 — 끝나지 않는 작업(operations wait 소진)에도 정리 몫 1200초 안에서 멈추고 record는 불린다", () => {
    const ctx = makeCtx();
    const clock = withClock();
    const env = { FAKE_CLOCK_FILE: clock.file, FAKE_KILL_AFTER: "create", FAKE_PENDING_OP: "forever" };
    expect(run(ctx, ["rehearse"], env).signal).toBe("SIGKILL");
    const start = clock.read();
    const from = rawLog(ctx).length;
    const finalize = run(ctx, ["finalize"], { FAKE_CLOCK_FILE: clock.file, FAKE_PENDING_OP: "forever" });
    expect(finalize.status).toBe(1);
    assertCleanupShare(ctx, from, start);
    expect(clock.read() - start).toBeLessThanOrEqual(FINALIZE_BUDGET_SEC);
    expect(finalize.summary).toContain(ctx.temp);
    assertInvariants(ctx);
  });

  it("마감 2 — record가 시간 안에 안 끝나면(timeout 124) 「기록 실패」, RECORDED 없음, record 제한 ≤ 2220초", () => {
    const ctx = makeCtx();
    run(ctx, ["rehearse"]);
    const from = rawLog(ctx).length;
    const finalize = run(ctx, ["finalize"], { FAKE_TIMEOUT_EXPIRE: "record" });
    expect(finalize.status).toBe(1);
    expect(finalize.summary).toContain("기록 실패");
    expect(stateValue(ctx, "RECORDED")).toBeUndefined();
    const record = rawLog(ctx)
      .slice(from)
      .find((line) => line.startsWith("timeout ") && line.includes("--args=record"));
    expect(record).toBeDefined();
    expect(Number(record?.split(" ")[1])).toBeLessThanOrEqual(FINALIZE_BUDGET_SEC - SUMMARY_RESERVE_SEC);
    assertInvariants(ctx);
  });

  it("마감 3 — 남은 시간이 0이면 gcloud를 부르지 않는다(생성 뒤 rehearse의 gcloud 0줄), finalize가 async 삭제 뒤 restore 기록", () => {
    const ctx = makeCtx();
    const clock = withClock();
    const rehearse = run(ctx, ["rehearse"], { FAKE_CLOCK_FILE: clock.file, FAKE_ADVANCE: "create:3420" });
    expect(rehearse.status).not.toBe(0);
    expect(rehearse.stderr).toContain("마감을 넘겨 부르지 않았습니다");
    const ls = labels(ctx);
    expect(ls[ls.length - 1]).toBe("create");
    const before = calls(ctx).length;
    const finalize = run(ctx, ["finalize"], { FAKE_CLOCK_FILE: clock.file });
    expect(finalize.status).toBe(1);
    const after = labels(ctx, calls(ctx).slice(before));
    expect(after).toContain("delete");
    expect(existsSync(join(ctx.stateDir, "instances", ctx.temp))).toBe(false);
    expect(recordCalls(ctx)[0]).toContain("--succeeded,false,--failed-stage,restore");
    assertInvariants(ctx);
  });

  it("마감 4 — 느린 async 삭제(작업이 안 끝남)도 정리 몫 안에서 멈추고 record 예비를 먹지 않는다", () => {
    const ctx = makeCtx();
    const clock = withClock();
    expect(
      run(ctx, ["rehearse"], { FAKE_CLOCK_FILE: clock.file, FAKE_KILL_AFTER: "create" }).signal,
    ).toBe("SIGKILL");
    const start = clock.read();
    const from = rawLog(ctx).length;
    const finalize = run(ctx, ["finalize"], { FAKE_CLOCK_FILE: clock.file, FAKE_DELETE_SLOW: "1" });
    expect(finalize.status).toBe(1);
    assertCleanupShare(ctx, from, start);
    expect(clock.read() - start).toBeLessThanOrEqual(FINALIZE_BUDGET_SEC);
    expect(finalize.summary).toContain(ctx.temp);
    assertInvariants(ctx);
  });
});

describe("배포 겹침 — 시작 기준선 digest와 비교(사용자 결정 2026-09-24 따로 두고 감지)", { timeout: 60_000 }, () => {
  it.each([
    ["ⓐ before-verify", "rehearse"],
    ["ⓑ verify", "rehearse"],
    ["ⓒ cleanup", "finalize"],
    ["ⓔ create", "rehearse"],
    ["ⓕ restore", "rehearse"],
  ])("배포 겹침 %s → verify 실패 기록, 요약에 두 digest와 겹침 문구", (name, when) => {
    const point = name.split(" ")[1];
    const ctx = makeCtx();
    const env = { FAKE_DEPLOY_AT: point };
    expect(run(ctx, ["rehearse"], when === "rehearse" ? env : {}).status).toBe(0);
    expect(stateValue(ctx, "STAGE")).toBe("verified");
    expect(stateValue(ctx, "DIGEST")).toBe(digestOf(DEFAULT_IMAGE));
    if (point === "before-verify" || point === "create" || point === "restore") {
      expect(stateValue(ctx, "VERIFY_DIGEST")).toBe(digestOf(NEW_IMAGE));
    }
    const finalize = run(ctx, ["finalize"], when === "finalize" ? env : {});
    expect(finalize.status).toBe(1);
    expect(recordCalls(ctx)[0]).toContain("--succeeded,false,--failed-stage,verify,");
    expect(finalize.summary).toContain(DEPLOY_OVERLAP);
    expect(finalize.summary).toContain(digestOf(DEFAULT_IMAGE));
    expect(finalize.summary).toContain(digestOf(NEW_IMAGE));
    assertInvariants(ctx);
  });

  it("배포 겹침 ⓓ record — 행은 성공 그대로, 기록 뒤 확인이 mismatch로 종료 코드 1 · ⓓ′ 재시도도 0이 아니다", () => {
    const ctx = makeCtx();
    run(ctx, ["rehearse"]);
    const first = run(ctx, ["finalize"], { FAKE_DEPLOY_AT: "record" });
    expect(first.status).toBe(1);
    expect(recordCalls(ctx).length).toBe(1);
    expect(recordCalls(ctx)[0]).toContain("--succeeded,true,");
    expect(first.summary).toContain("기록된 결과: 성공");
    expect(first.summary).toContain(`기록 뒤 확인: ${DEPLOY_OVERLAP}`);
    expect(stateValue(ctx, "RECORD_EXEC")).toBeDefined();
    expect(stateValue(ctx, "POST_RECORD")).toBe("mismatch");

    const again = run(ctx, ["finalize"]);
    expect(again.status).toBe(1);
    expect(again.summary).toContain(`기록 뒤 확인: ${DEPLOY_OVERLAP}`);
    expect(recordCalls(ctx).length).toBe(1);

    dropStateKeys(ctx, ["POST_RECORD"]);
    const recomputed = run(ctx, ["finalize"]);
    expect(recomputed.status).toBe(1);
    expect(stateValue(ctx, "POST_RECORD")).toBe("mismatch");
    expect(recomputed.summary).toContain(`기록 뒤 확인: ${DEPLOY_OVERLAP}`);

    dropStateKeys(ctx, ["POST_RECORD", "RECORD_EXEC"]);
    const unknown = run(ctx, ["finalize"]);
    expect(unknown.status).toBe(1);
    expect(stateValue(ctx, "POST_RECORD")).toBe("unknown");
    expect(unknown.summary).toContain(`기록 뒤 확인: ${DEPLOY_OVERLAP}`);
    expect(recordCalls(ctx).length).toBe(1);
    assertInvariants(ctx);
  });

  it("이미지 확인 불가 — 기준선 digest 조회 실패면 아무것도 만들지 않고 멈추고 restore 기록", () => {
    const ctx = makeCtx();
    const env = { FAKE_IMAGE_FAIL: "1" };
    expect(run(ctx, ["rehearse"], env).status).toBe(1);
    expect(labels(ctx)).not.toContain("backups");
    expect(labels(ctx)).not.toContain("create");
    expect(stateValue(ctx, "STAGE")).toBe("started");
    expect(stateValue(ctx, "DIGEST")).toBeUndefined();
    expect(run(ctx, ["finalize"], env).status).toBe(1);
    expect(recordCalls(ctx)[0]).toContain("--succeeded,false,--failed-stage,restore");
    assertInvariants(ctx);
  });

  it.each(["2", "3"])(
    "이미지 확인 불가 — %s번째 digest 조회(verify 실행 · 기록 직전) 실패면 verified여도 verify 기록",
    (n) => {
      const ctx = makeCtx();
      const env = { FAKE_IMAGE_FAIL: n };
      expect(run(ctx, ["rehearse"], env).status).toBe(0);
      expect(stateValue(ctx, "STAGE")).toBe("verified");
      const finalize = run(ctx, ["finalize"], env);
      expect(finalize.status).toBe(1);
      expect(recordCalls(ctx)[0]).toContain("--succeeded,false,--failed-stage,verify");
      expect(finalize.summary).toContain("이미지 확인 불가");
      assertInvariants(ctx);
    },
  );
});

describe("겹친 실패 — 우선순위 정리 > 복원 > 검증, --failed-stage는 한 번", { timeout: 60_000 }, () => {
  it.each([
    ["ⓐ verify + 삭제 늘 실패 → cleanup", { FAKE_FAIL: "verify", FAKE_DELETE_FAIL: "always" }, {}, "cleanup"],
    [
      "ⓑ restore + 생성 뒤 목록 503 → cleanup",
      { FAKE_FAIL: "restore", FAKE_LIST_FAIL: "503", FAKE_LIST_FAIL_AFTER_CREATE: "1" },
      {},
      "cleanup",
    ],
    ["ⓒ restore + 배포 겹침(cleanup) → restore", { FAKE_FAIL: "restore" }, { FAKE_DEPLOY_AT: "cleanup" }, "restore"],
    ["ⓓ verify + 배포 겹침(cleanup) → verify", { FAKE_FAIL: "verify" }, { FAKE_DEPLOY_AT: "cleanup" }, "verify"],
  ])("겹친 실패 %s", (_name, rehearseEnv, finalizeEnv, expected) => {
    const ctx = makeCtx();
    run(ctx, ["rehearse"], rehearseEnv);
    const finalize = run(ctx, ["finalize"], { ...rehearseEnv, ...finalizeEnv });
    expect(finalize.status).toBe(1);
    const records = recordCalls(ctx);
    expect(records.length).toBe(1);
    expect(records[0]).toContain(`--failed-stage,${expected},`);
    expect((records[0] ?? "").split("--failed-stage").length - 1).toBe(1);
    assertInvariants(ctx);
  });
});
