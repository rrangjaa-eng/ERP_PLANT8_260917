import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// .github/workflows/restore-rehearsal.yml — D8-08 복원 리허설 워크플로 텍스트 단언(YAML 파서 없이,
// workflows.test.ts와 같은 접근). 스크립트 상수·deploy.sh의 Job 시간 제한과 합이 맞는지도 본다.

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(resolve(ROOT, path), "utf8");

const workflow = read(".github/workflows/restore-rehearsal.yml");
const account = read(".github/workflows/account.yml");
const deploy = read(".github/workflows/deploy.yml");
const script = read("scripts/restore-rehearsal.sh");
const deploySh = read("scripts/deploy.sh");

// 들여쓰기 6칸 "- "로 시작하는 단계 블록들
function steps(text: string): string[] {
  const start = text.indexOf("\n    steps:");
  expect(start).toBeGreaterThan(-1);
  return text
    .slice(start)
    .split(/\n(?= {6}- )/)
    .slice(1);
}

function stepWith(needle: string): string {
  const found = steps(workflow).filter((step) => step.includes(needle));
  expect(found.length, `"${needle}"를 담은 단계가 하나여야 한다`).toBe(1);
  return found[0] ?? "";
}

function topLevelGroup(text: string): string | undefined {
  return /^concurrency:\n {2}group: (\S+)$/m.exec(text)?.[1];
}

function constant(name: string): number {
  const match = new RegExp(`^${name}=(\\d+)`, "m").exec(script);
  expect(match, `${name} 상수`).not.toBeNull();
  return Number(match?.[1]);
}

function minutes(block: string): number {
  const match = /timeout-minutes: (\d+)/.exec(block);
  expect(match).not.toBeNull();
  return Number(match?.[1]);
}

describe("restore-rehearsal.yml", () => {
  it("워크플로 1 — 트리거는 workflow_dispatch 하나(schedule·push·pull_request·environment 없음), 입력 env·confirm_production, permissions 두 줄", () => {
    const on = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\npermissions:"));
    expect(on).toContain("  workflow_dispatch:");
    expect(on.split("\n").filter((line) => /^ {2}\S/.test(line))).toEqual(["  workflow_dispatch:"]);
    expect(workflow).not.toMatch(/^\s+(schedule|push|pull_request):/m);
    expect(workflow).not.toContain("environment:");
    expect(on).toMatch(/ {6}env:\n {8}type: choice[\s\S]*?- staging\n {10}- production\n {8}default: staging/);
    expect(on).toMatch(/ {6}confirm_production:\n {8}type: string/);
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\n {2}id-token: write\n/);
  });

  it("워크플로 2 — 첫 단계가 체크아웃·인증 전에 main과 plant8-prod-db 확인을 하고, WIF provider 줄은 account.yml과 같다", () => {
    const first = steps(workflow)[0] ?? "";
    expect(first).toContain("refs/heads/main");
    expect(first).toContain("plant8-prod-db");
    expect(first).toContain("REF: ${{ github.ref }}");
    expect(first).toContain("exit 1");
    expect(workflow.indexOf(first)).toBeLessThan(workflow.indexOf("actions/checkout"));
    expect(workflow.indexOf(first)).toBeLessThan(workflow.indexOf("google-github-actions/auth"));
    const provider = (text: string): string[] =>
      text.split("\n").filter((line) => line.includes("workload_identity_provider"));
    expect(provider(workflow)).toEqual(provider(account));
    expect(provider(workflow).length).toBe(1);
  });

  it("워크플로 3 — rehearse 단계 60분 · always() finalize 40분 · 잡 105분, 자기 동시성 그룹이 deploy.yml과 다르다", () => {
    const rehearse = stepWith("restore-rehearsal.sh rehearse");
    expect(rehearse).toContain("id: rehearse");
    expect(minutes(rehearse)).toBe(60);
    const finalize = stepWith("restore-rehearsal.sh finalize");
    expect(finalize).toContain("always()");
    expect(finalize).toContain("steps.rehearse.outcome != 'skipped'");
    expect(minutes(finalize)).toBe(40);
    expect(workflow).toMatch(/\n {4}timeout-minutes: 105\n/);

    expect(topLevelGroup(workflow)).toBe("restore-rehearsal");
    expect(topLevelGroup(deploy)).toBeDefined();
    expect(topLevelGroup(workflow)).not.toBe(topLevelGroup(deploy));
    expect(workflow).toMatch(/^concurrency:\n {2}group: restore-rehearsal\n {2}cancel-in-progress: false$/m);
  });

  it("워크플로 4 — run: 본문에 ${{ 식이 없고(입력은 env로), 12자리 숫자·실제 이메일이 없다", () => {
    const runBodies = steps(workflow)
      .filter((step) => step.includes("run:"))
      .map((step) => step.slice(step.indexOf("run:")));
    expect(runBodies.length).toBeGreaterThanOrEqual(3);
    for (const body of runBodies) {
      expect(body).not.toContain("${{");
    }
    expect(workflow).toContain("INPUT_ENV: ${{ inputs.env }}");
    expect(workflow).toContain("CONFIRM_PRODUCTION: ${{ inputs.confirm_production }}");
    expect(workflow).not.toMatch(/[0-9]{12}/);
    expect(workflow).not.toMatch(/@[a-z0-9-]+\.(com|net|org|io)\b/i);
  });

  it("워크플로 5 — 스크립트 마감 상수와 단계·잡 시간 제한, record Job task-timeout의 합이 맞다", () => {
    const rehearseMin = minutes(stepWith("restore-rehearsal.sh rehearse"));
    const finalizeMin = minutes(stepWith("restore-rehearsal.sh finalize"));
    const jobMin = Number(/\n {4}timeout-minutes: (\d+)\n/.exec(workflow)?.[1]);
    const taskTimeoutMin = Number(/--task-timeout=(\d+)m/.exec(deploySh)?.[1]);
    expect(taskTimeoutMin).toBeGreaterThan(0);

    expect(constant("REHEARSE_BUDGET_SEC")).toBeLessThan(rehearseMin * 60);
    expect(constant("FINALIZE_BUDGET_SEC")).toBeLessThan(finalizeMin * 60);
    expect(rehearseMin + finalizeMin + 5).toBeLessThanOrEqual(jobMin);
    expect(constant("RECORD_RESERVE_SEC")).toBeGreaterThanOrEqual(taskTimeoutMin * 60 + 60);
    expect(
      constant("FINALIZE_BUDGET_SEC") - constant("RECORD_RESERVE_SEC") - constant("SUMMARY_RESERVE_SEC"),
    ).toBeGreaterThanOrEqual(630);
  });
});
