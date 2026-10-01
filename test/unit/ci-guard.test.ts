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

// 잡 블록은 "\n  <이름>:" 로 자른다 — "pnpm test:integration" 같은 스텝 문자열과 헷갈리지 않게.
function jobBlock(ci: string, name: string, nextName?: string): string {
  const start = ci.indexOf(`\n  ${name}:`);
  expect(start, `ci.yml에 ${name} 잡이 있어야 한다`).toBeGreaterThan(-1);
  const end = nextName ? ci.indexOf(`\n  ${nextName}:`) : ci.length;
  expect(end, `ci.yml에 ${nextName} 잡이 있어야 한다`).toBeGreaterThan(start);
  return ci.slice(start, end);
}

// draft PR은 quality만 돈다. integration·e2e는 ready(또는 workflow_call/push)에서만 — PR은 .claude/·CLAUDE.md 밖 변경(quality의 app 출력)이 있을 때만.
const FULL_RUN_IF = "github.event_name != 'pull_request' || (github.event.pull_request.draft == false && needs.quality.outputs.app == 'true')";

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
      ".claude/hooks/tests",
      "pnpm db:migrate",
      "pnpm test:integration",
      "playwright install",
      "pnpm test:e2e",
      "--shard=",
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

  it("pull_request types에 ready_for_review가 있다(draft → ready 전환이 전체 CI를 깨운다)", () => {
    const ci = readWorkflow("ci.yml");
    const typesLine = ci.split("\n").find((line) => /^\s*types:\s*\[/.test(line));
    expect(typesLine, "pull_request 아래 types: [...] 줄이 있어야 한다").toBeDefined();
    for (const t of ["opened", "synchronize", "reopened", "ready_for_review"]) {
      expect(typesLine).toContain(t);
    }
  });

  it("pull_request 트리거는 paths + ! 형태를 쓰고 paths-ignore는 없다(GitHub이 문서로 지원하는 형태만 사용)", () => {
    const ci = readWorkflow("ci.yml");
    expect(ci).not.toContain("paths-ignore");
    expect(ci).toContain("paths:");
    const patterns = ['- "**"', '- "!.planning/**"', '- "!docs/**"', '- "docs/design/tokens.css"'];
    const indexes = patterns.map((pattern) => ci.indexOf(pattern));
    for (const index of indexes) expect(index).toBeGreaterThan(-1);
    // 순서가 의미를 갖는다: 전체 포함 → .planning 부정 → docs 부정 → tokens.css 긍정.
    // tokens.css 줄이 docs/** 부정 줄보다 반드시 뒤여야 되살아난다.
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("quality 잡 내부 순서: lint < typecheck < lint:sql < test:unit < 훅 테스트", () => {
    const ci = readWorkflow("ci.yml");
    const qualityBlock = jobBlock(ci, "quality", "integration");
    const order = [
      "pnpm lint",
      "pnpm typecheck",
      "pnpm lint:sql",
      "pnpm test:unit",
      ".claude/hooks/tests",
    ].map((token) => firstLine(qualityBlock, token));
    for (const line of order) expect(line).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("quality 잡은 if 조건 없이 항상 돈다(draft PR의 빠른 경로)", () => {
    const ci = readWorkflow("ci.yml");
    const qualityBlock = jobBlock(ci, "quality", "integration");
    const hasIf = qualityBlock.split("\n").some((line) => /^\s{4}if:/.test(line));
    expect(hasIf).toBe(false);
  });

  it("integration·e2e 잡은 각각 quality를 needs로 요구하고 Postgres 서비스 컨테이너를 쓴다", () => {
    const ci = readWorkflow("ci.yml");
    for (const block of [jobBlock(ci, "integration", "e2e"), jobBlock(ci, "e2e")]) {
      expect(block).toContain("needs: quality");
      expect(block).toContain("services:");
      expect(block).toContain("image: postgres:16");
      expect(block).toContain("pg_isready");
    }
  });

  it("integration·e2e 잡은 draft PR에서 건너뛰고 ready·workflow_call에서만 돈다", () => {
    const ci = readWorkflow("ci.yml");
    for (const block of [jobBlock(ci, "integration", "e2e"), jobBlock(ci, "e2e")]) {
      expect(block).toContain(FULL_RUN_IF);
    }
  });

  it("integration·e2e 잡은 2샤드 matrix로 돌고 fail-fast를 끈다(한 샤드 실패가 다른 샤드 결과를 가리지 않게)", () => {
    const ci = readWorkflow("ci.yml");
    for (const block of [jobBlock(ci, "integration", "e2e"), jobBlock(ci, "e2e")]) {
      expect(block).toContain("shard: [1, 2]");
      expect(block).toContain("fail-fast: false");
      expect(block).toContain("--shard=${{ matrix.shard }}/2");
    }
  });

  it("integration 잡 내부 순서: db:migrate < test:integration, e2e는 없다", () => {
    const ci = readWorkflow("ci.yml");
    const block = jobBlock(ci, "integration", "e2e");
    const order = ["pnpm db:migrate", "pnpm test:integration"].map((token) =>
      firstLine(block, token),
    );
    for (const line of order) expect(line).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(block).not.toContain("pnpm test:e2e");
  });

  it("e2e 잡 내부 순서: playwright install < test:e2e, 통합 테스트는 없다", () => {
    const ci = readWorkflow("ci.yml");
    const block = jobBlock(ci, "e2e");
    const order = ["playwright install", "pnpm test:e2e"].map((token) => firstLine(block, token));
    for (const line of order) expect(line).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(block).not.toContain("pnpm test:integration");
  });

  it("e2e 실패 리포트 아티팩트 이름에 샤드 번호가 들어간다(두 샤드가 같은 이름으로 충돌하지 않게)", () => {
    const ci = readWorkflow("ci.yml");
    const block = jobBlock(ci, "e2e");
    expect(block).toContain("name: playwright-report-${{ matrix.shard }}");
  });

  // WR-09: !docs/**가 unit 테스트가 실제로 읽는 docs 파일까지 가려서, 그 파일만
  // 바뀐 PR은 CI가 아예 돌지 않는다. test/unit/design-system-docs.test.ts·
  // test/unit/ui/role-menu.test.ts·test/unit/docs-limits.test.ts가 읽는 6개
  // 파일이 모두 !docs/** 뒤에 재포함되어야 한다.
  it("pull_request paths가 unit 테스트가 읽는 6개 docs 파일을 모두 재포함한다(순서 포함)", () => {
    const ci = readWorkflow("ci.yml");
    const patterns = [
      '- "**"',
      '- "!.planning/**"',
      '- "!docs/**"',
      '- "docs/design/tokens.css"',
      '- "docs/design/SYSTEM.md"',
      '- "docs/design/DECISIONS.md"',
      '- "docs/ARCHITECTURE.md"',
      '- "docs/OPERATIONS.md"',
      '- "docs/RESTORE.md"',
    ];
    const indexes = patterns.map((pattern) => ci.indexOf(pattern));
    for (const [i, index] of indexes.entries()) {
      expect(index, `ci.yml에 "${patterns[i]}"가 있어야 한다`).toBeGreaterThan(-1);
    }
    // !docs/** 뒤에만 와야 되살아난다 — 순서 자체가 GitHub paths 의미론이다.
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it(".planning/**은 여전히 완전히 제외된다(재포함 목록에 없다)", () => {
    const ci = readWorkflow("ci.yml");
    expect(ci).toContain('- "!.planning/**"');
    expect(ci).not.toMatch(/-\s*"\.planning\//);
  });
});
