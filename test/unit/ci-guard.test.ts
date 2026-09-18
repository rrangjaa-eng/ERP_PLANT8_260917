import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 워크플로 전체(.github/workflows/*.yml)에 drizzle-kit push 하위 명령이 없음을 고정한다
// (Pitfall 4, Issue 4) — YAML 파서 의존성 없이 텍스트로만 검사한다.
const WORKFLOWS_DIR = resolve(process.cwd(), ".github/workflows");

function readWorkflow(filename: string): string {
  return readFileSync(resolve(WORKFLOWS_DIR, filename), "utf8");
}

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR).filter((name) => name.endsWith(".yml"));
}

function firstLine(content: string, needle: string): number {
  const index = content.indexOf(needle);
  if (index === -1) return -1;
  return content.slice(0, index).split("\n").length;
}

describe("ci-guard: .github/workflows 메타 검사", () => {
  it("어떤 워크플로에도 drizzle-kit push 하위 명령이 없다", () => {
    for (const file of workflowFiles()) {
      const content = readWorkflow(file);
      expect(content, `${file}에 drizzle-kit push가 있으면 안 된다`).not.toMatch(
        /drizzle-kit\s+push/,
      );
    }
  });

  it("ci.yml에 필수 단계가 전부 있다", () => {
    const ci = readWorkflow("ci.yml");
    const required = [
      "--frozen-lockfile",
      "pg_isready",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm lint:sql",
      "pnpm test:unit",
      "pnpm db:migrate",
      "pnpm test:integration",
      "playwright install",
      "pnpm test:e2e",
    ];
    for (const token of required) {
      expect(ci, `ci.yml에 "${token}"가 있어야 한다`).toContain(token);
    }
  });

  it("ci.yml은 workflow_call과 pull_request로만 트리거되고 push 키가 없다", () => {
    const ci = readWorkflow("ci.yml");
    expect(ci).toContain("workflow_call:");
    expect(ci).toContain("pull_request:");
    // 최상위 on: 블록에 push: 키가 없다 — 주석이 아닌 실제 YAML 키만 본다.
    const hasPushTrigger = ci
      .split("\n")
      .some((line) => /^\s*push:\s*$/.test(line) || /^\s*push:\s*\{/.test(line));
    expect(hasPushTrigger).toBe(false);
  });

  it("pull_request 트리거는 .planning/**와 docs/**만 바뀐 PR을 건너뛴다", () => {
    const ci = readWorkflow("ci.yml");
    expect(ci).toContain("paths-ignore");
    expect(ci).toContain(".planning/**");
    expect(ci).toContain("docs/**");
  });

  it("quality 잡 내부 순서: lint < typecheck < lint:sql < test:unit", () => {
    const ci = readWorkflow("ci.yml");
    const qualityStart = ci.indexOf("quality:");
    const integrationStart = ci.indexOf("integration-e2e:");
    expect(qualityStart).toBeGreaterThan(-1);
    expect(integrationStart).toBeGreaterThan(qualityStart);
    const qualityBlock = ci.slice(qualityStart, integrationStart);
    const order = ["pnpm lint", "pnpm typecheck", "pnpm lint:sql", "pnpm test:unit"].map(
      (token) => firstLine(qualityBlock, token),
    );
    for (const line of order) expect(line).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("integration-e2e 잡은 quality를 needs로 요구하고, Postgres 서비스 컨테이너를 쓴다", () => {
    const ci = readWorkflow("ci.yml");
    const integrationStart = ci.indexOf("integration-e2e:");
    const integrationBlock = ci.slice(integrationStart);
    expect(integrationBlock).toContain("needs: quality");
    expect(integrationBlock).toContain("services:");
    expect(integrationBlock).toContain("image: postgres:16");
    expect(integrationBlock).toContain("pg_isready");
  });

  it("integration-e2e 잡 내부 순서: db:migrate < test:integration < playwright install < test:e2e", () => {
    const ci = readWorkflow("ci.yml");
    const integrationStart = ci.indexOf("integration-e2e:");
    const integrationBlock = ci.slice(integrationStart);
    const order = [
      "pnpm db:migrate",
      "pnpm test:integration",
      "playwright install",
      "pnpm test:e2e",
    ].map((token) => firstLine(integrationBlock, token));
    for (const line of order) expect(line).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
