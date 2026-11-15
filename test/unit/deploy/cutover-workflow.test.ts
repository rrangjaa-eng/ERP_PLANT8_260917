import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// .github/workflows/cutover.yml — 08-04(D8-05) 전환 demo 삭제 워크플로.
// 텍스트 단언(YAML 파서 없이 — restore-rehearsal-workflow.test.ts와 같은 접근)에 더해,
// input-guard · run 단계의 `run: |` 본문을 꺼내 bash로 실제 실행한다(eng 검토 1회차 B8 · 2회차 로그 대기).
// run 본문은 임시 폴더의 가짜 gcloud · sleep 위에서 돈다 — 실제 GCP 호출은 없다.

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(resolve(ROOT, path), "utf8");

const workflow = read(".github/workflows/cutover.yml");
const account = read(".github/workflows/account.yml");
const deployYml = read(".github/workflows/deploy.yml");
const deploySh = read("scripts/deploy.sh");
const cutoverDoc = read("docs/CUTOVER.md");

// 들여쓰기 6칸 "- "로 시작하는 단계 블록들
function steps(text: string): string[] {
  const start = text.indexOf("\n    steps:");
  expect(start).toBeGreaterThan(-1);
  return text
    .slice(start)
    .split(/\n(?= {6}- )/)
    .slice(1);
}

function stepById(id: string): string {
  const found = steps(workflow).filter((step) => new RegExp(`^ {6}- id: ${id}$`, "m").test(step));
  expect(found.length, `id ${id} 단계가 하나여야 한다`).toBe(1);
  return found[0] ?? "";
}

function topLevelGroup(text: string): string | undefined {
  return /^concurrency:\n {2}group: (\S+)$/m.exec(text)?.[1];
}

// 단계의 `run: |` 블록을 들여쓰기만 걷어 bash 본문으로 꺼낸다.
function runBody(step: string): string {
  const lines = step.split("\n");
  const start = lines.findIndex((line) => /^ {8}run: \|$/.test(line));
  expect(start, "run: | 블록").toBeGreaterThan(-1);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") {
      body.push("");
      continue;
    }
    if (!line.startsWith("          ")) break;
    body.push(line.slice(10));
  }
  return `${body.join("\n")}\n`;
}

function bash(body: string, env: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", body], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// ── input-guard 실행 시험(B8) ──────────────────────────────────────────────

type GuardInput = { ref?: string; env: string; mode: string; confirm?: string; confirmProduction?: string };

function guard(input: GuardInput): number | null {
  return bash(runBody(stepById("input-guard")), {
    REF: input.ref ?? "refs/heads/main",
    INPUT_ENV: input.env,
    INPUT_MODE: input.mode,
    CONFIRM: input.confirm ?? "",
    CONFIRM_PRODUCTION: input.confirmProduction ?? "",
  }).status;
}

// ── run 단계 실행 시험(가짜 gcloud) ──────────────────────────────────────────

type Payload = Record<string, unknown>;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

// gcloud `--format='json(jsonPayload)'` 꼴: 최신 항목 먼저, 키 정렬, 2칸 들여쓰기 · ": " 구분.
function gcloudJson(newestFirst: Payload[]): string {
  if (newestFirst.length === 0) return "[]\n";
  return `${JSON.stringify(newestFirst.map((p) => ({ jsonPayload: sortKeys(p) })), null, 2)}\n`;
}

const MARKER = "2026-12-01T09:12:30+09:00";
const TOKEN = "12-0a1b2c3d";
const RUN_URL = "https://github.com/o/r/actions/runs/1";
const COUNTS = { projects: 5, quote_lines: 4, revenue_entries: 0 };

function lib(event: string, fields: Payload, severity = "INFO"): Payload {
  return { severity, message: event, event, ...fields };
}

const done = (objects: number): Payload =>
  lib("cutover.done", { env: "staging", mode: "apply", counts: COUNTS, counters: 3, total: 12, token: TOKEN, marker: MARKER, objects });
const pending = lib("cutover.objects.pending", { total: 2, keys: ["evidence/a.pdf", "evidence/b.pdf"] });
const objectsDone = (orphanKeys: string[]): Payload =>
  lib(
    "cutover.objects",
    { total: 2, deleted: 2 - orphanKeys.length, orphaned: orphanKeys.length, orphanKeys, stopped: null },
    orphanKeys.length > 0 ? "WARNING" : "INFO",
  );
const dryDone = lib("cutover.done", {
  env: "staging",
  mode: "dry-run",
  counts: COUNTS,
  counters: 3,
  total: 12,
  token: TOKEN,
  objects: 2,
  kept: { evidence_import_batches: 1, evidence_records: 5, leave_adjustments: 0 },
});
const dryAfter = lib("cutover.done", { env: "staging", mode: "dry-run", marker: MARKER, demoRemaining: 0 });
const refused = (reason: string, backup?: Payload): Payload =>
  lib("cutover.refused", { reason, ...(backup ? { backup } : {}) }, "WARNING");

type Scenario = {
  mode: "dry-run" | "apply";
  execStatus: number;
  early: Payload[];
  late?: Payload[];
  lateFrom?: number;
  textPayload?: string;
  // execute가 실행을 만들기 전에 실패(권한 · 인자 오류) — executions list가 직전 실행만 보인다
  noExecution?: boolean;
};

type RunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  summary: string;
  polls: number;
  calls: string;
};

const FAKE_GCLOUD = `#!/usr/bin/env bash
set -u
D="$FAKE_DIR"
printf '%s\\n' "$*" >>"$D/calls"
case "$*" in
  "run jobs execute "*)
    if [ "$(cat "$D/exec-status")" = "0" ]; then
      echo "plant8-staging-cutover-x7k2p"
      exit 0
    fi
    echo "fake gcloud: execution failed" >&2
    exit 1
    ;;
  "run jobs executions list "*)
    # execute 전에는 직전 실행 이름 · 뒤에는 이번 실행 이름(no-exec면 실행이 생기지 않은 것)
    if grep -q '^run jobs execute ' "$D/calls" && [ ! -f "$D/no-exec" ]; then
      echo "plant8-staging-cutover-x7k2p"
    else
      echo "plant8-staging-cutover-old00"
    fi
    ;;
  "logging read "*'jsonPayload.event=~'*)
    n=$(( $(cat "$D/polls" 2>/dev/null || echo 0) + 1 ))
    echo "$n" >"$D/polls"
    if [ -f "$D/late" ] && [ "$n" -ge "$(cat "$D/late-from")" ]; then cat "$D/late"; else cat "$D/early"; fi
    ;;
  "logging read "*'value(textPayload)'*)
    cat "$D/text-payload" 2>/dev/null || true
    ;;
  "logging read "*)
    ;;
esac
exit 0
`;

function runStep(s: Scenario): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "cutover-wf-"));
  const bin = join(dir, "bin");
  spawnSync("mkdir", ["-p", bin]);
  writeFileSync(join(bin, "gcloud"), FAKE_GCLOUD);
  writeFileSync(join(bin, "sleep"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "gcloud"), 0o755);
  chmodSync(join(bin, "sleep"), 0o755);
  writeFileSync(join(dir, "exec-status"), String(s.execStatus));
  writeFileSync(join(dir, "early"), gcloudJson(s.early));
  if (s.late) {
    writeFileSync(join(dir, "late"), gcloudJson(s.late));
    writeFileSync(join(dir, "late-from"), String(s.lateFrom ?? 1));
  }
  if (s.textPayload !== undefined) writeFileSync(join(dir, "text-payload"), s.textPayload);
  if (s.noExecution) writeFileSync(join(dir, "no-exec"), "");
  const summaryPath = join(dir, "summary.md");
  writeFileSync(summaryPath, "");
  const r = bash(runBody(stepById("run")), {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    FAKE_DIR: dir,
    INPUT_ENV: "staging",
    INPUT_MODE: s.mode,
    CONFIRM: s.mode === "apply" ? TOKEN : "",
    PROJECT: "test-proj",
    REGION: "asia-northeast3",
    RUN_URL,
    GITHUB_STEP_SUMMARY: summaryPath,
  });
  const pollsPath = join(dir, "polls");
  return {
    ...r,
    summary: readFileSync(summaryPath, "utf8"),
    polls: existsSync(pollsPath) ? Number(readFileSync(pollsPath, "utf8").trim()) : 0,
    calls: readFileSync(join(dir, "calls"), "utf8"),
  };
}

// ─────────────────────────────────────────────────────────────────────────

describe("cutover.yml — 입력 · 권한 · 그룹(D8-05)", () => {
  it("트리거는 workflow_dispatch 하나, 입력은 env · mode · confirm · confirm_production 넷뿐(기본 staging · dry-run · 빈 값)", () => {
    const on = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\npermissions:"));
    expect(on.split("\n").filter((line) => /^ {2}\S/.test(line))).toEqual(["  workflow_dispatch:"]);
    expect(workflow).not.toMatch(/^\s+(schedule|push|pull_request):/m);
    const inputNames = on.split("\n").filter((line) => /^ {6}\S/.test(line)).map((line) => line.trim());
    expect(inputNames).toEqual(["env:", "mode:", "confirm:", "confirm_production:"]);
    expect(on).toMatch(/ {6}env:\n {8}type: choice[\s\S]*?options:\n {10}- staging\n {10}- production\n {8}default: staging\n/);
    expect(on).toMatch(/ {6}mode:\n {8}type: choice[\s\S]*?options:\n {10}- dry-run\n {10}- apply\n {8}default: dry-run\n/);
    expect(on).toMatch(/ {6}confirm:\n {8}type: string[\s\S]*?default: ""\n/);
    expect(on).toMatch(/ {6}confirm_production:\n {8}type: string[\s\S]*?default: ""\n/);
  });

  it("permissions 두 줄 · 최상위 concurrency는 deploy.yml과 같은 그룹 deploy · cancel-in-progress false · environment 없음", () => {
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\n {2}id-token: write\n/);
    expect(topLevelGroup(workflow)).toBe("deploy");
    expect(topLevelGroup(workflow)).toBe(topLevelGroup(deployYml));
    expect(workflow).toMatch(/^concurrency:\n {2}group: deploy\n {2}cancel-in-progress: false$/m);
    const hasEnvironmentKey = workflow
      .split("\n")
      .some((line) => /^\s*environment:/.test(line) && !line.trim().startsWith("#"));
    expect(hasEnvironmentKey).toBe(false);
  });

  it("식별자(12자리 숫자 · 서비스 계정 이메일 리터럴 · 버킷 이름)가 없다", () => {
    expect(workflow).not.toMatch(/[0-9]{12}/);
    expect(workflow).not.toMatch(/@[a-z0-9-]+\.iam\.gserviceaccount\.com/);
    expect(workflow).not.toMatch(/-plant8-(staging|prod)-(evidence|cert-signatures)/);
    expect(workflow).not.toMatch(/@[a-z0-9-]+\.(com|net|org|io)\b/i);
  });

  it("job timeout-minutes가 deploy.sh --task-timeout보다 크다", () => {
    const jobMin = Number(/\n {4}timeout-minutes: (\d+)\n/.exec(workflow)?.[1]);
    const taskMin = Number(/--task-timeout=(\d+)m/.exec(deploySh)?.[1]);
    expect(taskMin).toBeGreaterThan(0);
    expect(jobMin).toBeGreaterThan(taskMin);
  });

  it("docs/CUTOVER.md가 같은 이름을 쓴다(cutover.yml · confirm_production · plant8-prod-db · dry-run · apply)", () => {
    for (const name of ["cutover.yml", "confirm_production", "plant8-prod-db", "dry-run", "apply"]) {
      expect(cutoverDoc).toContain(name);
    }
    for (const name of ["confirm_production", "plant8-prod-db", "dry-run", "apply"]) {
      expect(workflow).toContain(name);
    }
  });
});

describe("cutover.yml — 입력 검사는 인증보다 먼저, 입력은 env로만", () => {
  it("첫 단계 id input-guard가 checkout · auth보다 앞이고 env로 다섯 값을 받는다", () => {
    const all = steps(workflow);
    const first = all[0] ?? "";
    expect(first).toMatch(/^ {6}- id: input-guard$/m);
    expect(workflow.indexOf(first)).toBeLessThan(workflow.indexOf("actions/checkout"));
    expect(workflow.indexOf(first)).toBeLessThan(workflow.indexOf("- id: auth"));
    for (const line of [
      "REF: ${{ github.ref }}",
      "INPUT_ENV: ${{ inputs.env }}",
      "INPUT_MODE: ${{ inputs.mode }}",
      "CONFIRM: ${{ inputs.confirm }}",
      "CONFIRM_PRODUCTION: ${{ inputs.confirm_production }}",
    ]) {
      expect(first).toContain(line);
    }
    expect(first).toContain("refs/heads/main");
    expect(first).toContain("plant8-prod-db");
    expect(first).toContain("^[0-9]+-[0-9a-f]{8}$");
  });

  it("WIF provider 줄은 account.yml과 같다", () => {
    const provider = (text: string): string[] =>
      text.split("\n").filter((line) => line.includes("workload_identity_provider"));
    expect(provider(workflow)).toEqual(provider(account));
    expect(provider(workflow).length).toBe(1);
  });

  it("어떤 run: 본문에도 ${{ 가 없다(모든 식은 env 블록에만)", () => {
    const runBodies = steps(workflow)
      .filter((step) => step.includes("run:"))
      .map((step) => step.slice(step.indexOf("run:")));
    expect(runBodies.length).toBeGreaterThanOrEqual(2);
    for (const body of runBodies) {
      expect(body).not.toContain("${{");
    }
  });

  it.each<[string, GuardInput]>([
    ["main · staging · dry-run · confirm 빈 값", { env: "staging", mode: "dry-run" }],
    ["main · production · dry-run · plant8-prod-db", { env: "production", mode: "dry-run", confirmProduction: "plant8-prod-db" }],
    ["main · staging · apply · 12-0a1b2c3d", { env: "staging", mode: "apply", confirm: "12-0a1b2c3d" }],
    [
      "main · production · apply · 12-0a1b2c3d · plant8-prod-db",
      { env: "production", mode: "apply", confirm: "12-0a1b2c3d", confirmProduction: "plant8-prod-db" },
    ],
  ])("input-guard 통과(종료 0): %s", (_name, input) => {
    expect(guard(input)).toBe(0);
  });

  it.each<[string, GuardInput]>([
    ["refs/heads/feature · staging · dry-run", { ref: "refs/heads/feature", env: "staging", mode: "dry-run" }],
    ["main · production · dry-run · confirm_production 빈 값", { env: "production", mode: "dry-run" }],
    ["main · production · dry-run · plant8-staging-db", { env: "production", mode: "dry-run", confirmProduction: "plant8-staging-db" }],
    ["main · staging · apply · confirm 빈 값", { env: "staging", mode: "apply" }],
    ["main · staging · apply · 대문자 12-0A1B2C3D", { env: "staging", mode: "apply", confirm: "12-0A1B2C3D" }],
    ["main · staging · apply · 12-0a1b2c3d; true", { env: "staging", mode: "apply", confirm: "12-0a1b2c3d; true" }],
    ["main · staging · apply · 줄바꿈 뒤 덧붙임", { env: "staging", mode: "apply", confirm: "12-0a1b2c3d\n--apply" }],
    ["main · staging · dry-run · confirm 있음", { env: "staging", mode: "dry-run", confirm: "12-0a1b2c3d" }],
    ["모르는 env", { env: "prod", mode: "dry-run" }],
    ["모르는 mode", { env: "staging", mode: "Apply", confirm: "12-0a1b2c3d" }],
  ])("input-guard 멈춤(종료 0 아님): %s", (_name, input) => {
    const status = guard(input);
    expect(status).not.toBeNull();
    expect(status).not.toBe(0);
  });
});

describe("cutover.yml — run 단계 정적 계약", () => {
  const run = (): string => stepById("run");

  it("run 단계가 env로 INPUT_ENV · INPUT_MODE · CONFIRM · PROJECT · REGION · RUN_URL을 받고 job_name으로 Job을 고른다", () => {
    const step = run();
    for (const line of [
      "INPUT_ENV: ${{ inputs.env }}",
      "INPUT_MODE: ${{ inputs.mode }}",
      "CONFIRM: ${{ inputs.confirm }}",
      "PROJECT: ${{ vars.GCP_PROJECT_ID }}",
      "REGION: ${{ vars.GCP_REGION }}",
      "RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}",
    ]) {
      expect(step).toContain(line);
    }
    expect(step).toContain('job_name "$ENV_SHORT" cutover');
    expect(step).toContain("source infra/names.sh");
    expect(step).toContain('--args="$ARGS"');
    expect(step).toContain("ARGS=\"--apply,--confirm,$CONFIRM,--run-url,$RUN_URL\"");
    expect(step).toContain("--wait");
    expect(step).toContain("run jobs executions list");
    expect(step).toContain("jsonPayload.event=~");
    expect(step).toContain("json(jsonPayload)");
    expect(step).toContain('labels.\\"run.googleapis.com/execution_name\\"');
    for (const event of ["cutover.done", "cutover.refused", "cutover.objects", "cutover.objects.pending"]) {
      expect(step).toContain(event);
    }
  });

  it("실패 · 거부 갈래가 textPayload와 status.backup_unavailable을 읽고, refused의 backup 칸(kind)을 싣는다(B3)", () => {
    const step = run();
    expect(step).toContain("value(textPayload)");
    expect(step).toContain('jsonPayload.event=\\"status.backup_unavailable\\"');
    expect(step).toMatch(/backup_not_fresh/);
    expect(step).toContain("백업 조회 불가");
  });

  it("거부 사유마다 원인 · 다음 행동 · 전환됨 갈래 · Asia/Seoul · ::warning::이 있다(F10 · F12 · D3)", () => {
    const step = run();
    expect(step).toContain("다시 돌리지 않음");
    expect(step).toContain("dry-run부터 다시");
    expect(step).toContain("수동 백업부터 다시");
    expect(step).toContain("전환됨");
    expect(step).toContain("Asia/Seoul");
    expect(step).toContain("::warning::");
    expect(step).toContain("정리 결과 로그 늦음");
  });

  it("요약 쓰기는 tee -a 뿐 · 직접 덧쓰기 없음(B7)", () => {
    const code = workflow
      .split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n");
    expect(code).not.toMatch(/>> ?"\$GITHUB_STEP_SUMMARY"/);
    expect((workflow.match(/tee -a "\$GITHUB_STEP_SUMMARY"/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

describe("cutover.yml — run 본문 실행(가짜 gcloud · eng 검토 2회차 로그 대기)", () => {
  it("(a) apply 성공 · 3회째에 cutover.objects → 종료 0 · 전환 표시 · 서울 분 단위 · 끊김 없음 · 조회 3회", () => {
    const r = runStep({
      mode: "apply",
      execStatus: 0,
      early: [pending, done(2)],
      late: [objectsDone([]), pending, done(2)],
      lateFrom: 3,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.polls).toBe(3);
    expect(r.summary).toContain("전환 표시");
    expect(r.summary).toContain(MARKER);
    expect(r.summary).toContain("2026-12-01 09:12");
    expect(r.summary).not.toContain("정리 중 끊김");
    expect(r.summary).not.toContain("정리 결과 로그 늦음");
    expect(r.summary).toContain("staging");
    const execute = r.calls.split("\n").find((l) => l.startsWith("run jobs execute ")) ?? "";
    expect(execute).toContain("plant8-staging-cutover");
    expect(execute).toContain(`--args=--apply,--confirm,${TOKEN},--run-url,${RUN_URL}`);
    expect(execute).toContain("--wait");
    // 로그 조회는 이 실행 이름으로 좁힌다
    const poll = r.calls.split("\n").find((l) => l.includes("jsonPayload.event=~")) ?? "";
    expect(poll).toContain("plant8-staging-cutover-x7k2p");
    expect(poll).toContain('resource.labels.job_name="plant8-staging-cutover"');
    // 같은 요약 줄이 실행 로그(표준 출력)에도 있다
    expect(r.stdout).toContain("2026-12-01 09:12");
  });

  it("(a′) apply 성공 · 고아 키가 있으면 요약에 그 목록이 남는다", () => {
    const r = runStep({ mode: "apply", execStatus: 0, early: [objectsDone(["evidence/b.pdf"]), pending, done(2)] });
    expect(r.status, r.stderr).toBe(0);
    expect(r.polls).toBe(1);
    expect(r.summary).toContain("evidence/b.pdf");
    expect(r.summary).toContain("고아");
  });

  it("(a″) apply 성공 · objects 0인 cutover.done이면 그것이 끝 기록(조회 1회)", () => {
    const r = runStep({ mode: "apply", execStatus: 0, early: [done(0)] });
    expect(r.status, r.stderr).toBe(0);
    expect(r.polls).toBe(1);
    expect(r.summary).toContain("전환 표시");
  });

  it("(b) apply 성공 · cutover.objects가 끝내 없음 → 정리 결과 로그 늦음 경고 · 종료 0 · 끊김 아님", () => {
    const r = runStep({ mode: "apply", execStatus: 0, early: [pending, done(2)] });
    expect(r.status, r.stderr).toBe(0);
    expect(r.polls).toBe(12);
    expect(r.stdout.split("\n").filter((l) => l.startsWith("::warning::"))).toHaveLength(1);
    expect(r.summary).toContain("정리 결과 로그 늦음");
    expect(r.summary).not.toContain("정리 중 끊김");
  });

  it("(c) apply 실행 실패 · cutover.done + pending만 → 정리 중 끊김 + pending 키 · 종료 1", () => {
    const r = runStep({ mode: "apply", execStatus: 1, early: [pending, done(2)] });
    expect(r.status).toBe(1);
    expect(r.polls).toBe(12);
    expect(r.summary).toContain("정리 중 끊김");
    expect(r.summary).toContain("evidence/a.pdf");
    expect(r.summary).toContain("evidence/b.pdf");
    expect(r.summary).not.toContain("정리 결과 로그 늦음");
    expect(r.calls).toContain("run jobs executions list");
  });

  it("(d) dry-run 성공 · 1회째 cutover.done → 종료 0 · 조회 1회 · 확인 문자열 · JSON 블록 그대로 · --args 없음", () => {
    const r = runStep({ mode: "dry-run", execStatus: 0, early: [dryDone] });
    expect(r.status, r.stderr).toBe(0);
    expect(r.polls).toBe(1);
    expect(r.summary).toContain(`다음 apply의 confirm: ${TOKEN}`);
    expect(r.summary).toContain("총건수 12");
    expect(r.summary).toContain("evidence_records 5");
    expect(r.summary).toContain('"token": "12-0a1b2c3d"');
    expect(r.summary).toContain('"projects": 5');
    expect(r.stdout).toContain('"token": "12-0a1b2c3d"');
    const execute = r.calls.split("\n").find((l) => l.startsWith("run jobs execute ")) ?? "";
    expect(execute).not.toContain("--args");
    expect(execute).toContain("--wait");
  });

  it("(e) 전환 뒤 dry-run → 「전환됨 <시각> (서울 …) · demo 남은 행 N」 · marker · demoRemaining 그대로(D3 · B7)", () => {
    const r = runStep({ mode: "dry-run", execStatus: 0, early: [dryAfter] });
    expect(r.status, r.stderr).toBe(0);
    expect(r.summary).toContain(`전환됨 ${MARKER} (서울 2026-12-01 09:12) · demo 남은 행 0`);
    expect(r.summary).not.toContain("다음 apply의 confirm");
    expect(r.stdout).toContain(`"marker": "${MARKER}"`);
    expect(r.stdout).toMatch(/"demoRemaining": ?0/);
  });
});

describe("cutover.yml — 실패 경로 세 갈래는 요약 한 줄 + 종료 1(Task 2)", () => {
  it("거부 · confirm_mismatch → 사유 코드 + 원인 · 다음 행동 · 종료 1 · 사유 읽기 시도", () => {
    const r = runStep({ mode: "apply", execStatus: 1, early: [refused("confirm_mismatch")] });
    expect(r.status).toBe(1);
    expect(r.polls).toBe(1);
    expect(r.summary).toContain("거부 · confirm_mismatch");
    expect(r.summary).toContain("dry-run 뒤 입력이 생김 · CUTOVER §3 5번 dry-run부터 다시");
    expect(r.calls).toContain("value(textPayload)");
    expect(r.calls).toContain('jsonPayload.event="status.backup_unavailable"');
  });

  it("거부 · already_cut_over → 「이미 전환됨 · 다시 돌리지 않음」", () => {
    const r = runStep({ mode: "apply", execStatus: 1, early: [refused("already_cut_over")] });
    expect(r.status).toBe(1);
    expect(r.summary).toContain("거부 · already_cut_over");
    expect(r.summary).toContain("이미 전환됨 · 다시 돌리지 않음");
  });

  it("거부 · backup_not_fresh(낡음) → 수동 백업부터 다시 + backup kind", () => {
    const r = runStep({
      mode: "apply",
      execStatus: 1,
      early: [refused("backup_not_fresh", { kind: "ok", status: "SUCCESSFUL", endTime: "2026-12-01T00:00:00Z" })],
    });
    expect(r.status).toBe(1);
    expect(r.summary).toContain("거부 · backup_not_fresh");
    expect(r.summary).toContain("백업이 3시간 넘음 · §3 4번 수동 백업부터 다시");
    expect(r.summary).toContain("kind ok");
  });

  it("거부 · backup_not_fresh(조회 불가) → 백업 조회 불가 · Job 환경 · 권한 확인 + 사유", () => {
    const r = runStep({
      mode: "apply",
      execStatus: 1,
      early: [refused("backup_not_fresh", { kind: "unavailable", reason: "not-configured" })],
    });
    expect(r.status).toBe(1);
    expect(r.summary).toContain("백업 조회 불가 · 백업을 다시 뜨지 말고 Job 환경 · 권한 확인");
    expect(r.summary).toContain("not-configured");
  });

  it("실행 실패 · cutover 로그 없음 → 「실행 실패」 + textPayload 사유 한 줄 · 종료 1", () => {
    const r = runStep({ mode: "apply", execStatus: 1, early: [], textPayload: "DATABASE_URL 연결 실패\n" });
    expect(r.status).toBe(1);
    expect(r.summary).toContain("실행 실패");
    expect(r.summary).toContain("사유: DATABASE_URL 연결 실패");
  });

  it("execute가 새 실행을 만들지 못하고 실패 → 직전 실행의 로그를 읽지 않고 「실행 실패」 · 종료 1", () => {
    const r = runStep({ mode: "apply", execStatus: 1, early: [dryDone], noExecution: true });
    expect(r.status).toBe(1);
    expect(r.polls).toBe(0);
    expect(r.summary).toContain("실행 실패");
    expect(r.summary).not.toContain("다음 apply의 confirm");
    expect(r.calls).not.toContain("plant8-staging-cutover-old00\"");
  });

  it("실행 성공 · 로그 못 찾음 → 「요약 없음 — apply를 다시 돌리지 말고 …」 · 종료 1", () => {
    const r = runStep({ mode: "dry-run", execStatus: 0, early: [] });
    expect(r.status).toBe(1);
    expect(r.polls).toBe(12);
    expect(r.summary).toContain("요약 없음 — apply를 다시 돌리지 말고 같은 워크플로 dry-run으로 전환 여부부터 볼 것");
  });
});
