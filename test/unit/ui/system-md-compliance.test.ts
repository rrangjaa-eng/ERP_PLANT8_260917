import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 2026-09-20 staging QA에서 찾은 SYSTEM.md 위반 3건의 회귀 방지.
// 세 건 모두 "렌더되는 문구"가 명세와 어긋난 것이라, 컴포넌트 렌더 없이
// 소스 단언으로 고정한다(vitest unit은 node 환경이라 RTL이 없다 —
// design-system-docs.test.ts·workflows.test.ts와 같은 방식).

function read(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), "utf8");
}

const SYSTEM = read("docs", "design", "SYSTEM.md");
const DECISIONS = read("docs", "design", "DECISIONS.md");

// JSX 텍스트만 본다 — 주석은 계획 용어를 써도 된다(설명이니까).
// `//`로 시작하는 줄을 걷어내고 남은 것이 사용자에게 닿는 문자열이다.
function withoutComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
}

describe("ui/shell/MoreSheet.tsx — 「더보기」 시트 검색 행 (§7-8)", () => {
  const source = read("ui", "shell", "MoreSheet.tsx");
  const rendered = withoutComments(source);

  it("§8 규칙 5 — 렌더되는 문구에 안내문·계획 용어가 없다", () => {
    // 실측 결함: "연결할 대상 데이터 없음 — 이 페이즈는 자리만 둔다"가
    // 운영 화면에 노출됐다. 「페이즈」는 사용자가 모르는 GSD 계획 용어다.
    for (const jargon of ["이 페이즈", "자리만 둔다", "자리표시자", "TODO", "placeholder"]) {
      expect(rendered).not.toContain(jargon);
    }
  });

  it("검색 행에 SYSTEM.md가 명시한 대상 목록이 있다", () => {
    // 명세: 「검색 행에는 대상 목록(프로젝트 · 지출결의 · 거래처)」
    // DECISIONS.md: 「검색 대상 목록은 안내 문구가 아니라 범위 표시」
    expect(SYSTEM).toContain("검색 행에는 대상 목록");
    for (const scope of ["프로젝트", "지출결의", "거래처"]) {
      expect(rendered).toContain(scope);
    }
  });
});

describe("app/(app)/approvals/page.tsx — 결재함 EMPTY (§7-7)", () => {
  const source = read("app", "(app)", "approvals", "page.tsx");

  it("SYSTEM.md가 이 화면의 예시로 적어 둔 문구·이동 대상을 쓴다", () => {
    // §7-7 EMPTY 행의 예시가 이 화면을 직접 지목한다:
    //   `결재할 건이 없습니다 · 연차 목록 보기`
    // 04.1(오케스트레이터 결정 11 · DECISIONS.md 2026-09-26): 지출결의 목록은 Phase 5 화면이라
    // 이 페이즈의 결재 문서는 연차뿐이다 — 이동 대상은 연차 목록이다.
    expect(SYSTEM).toContain("결재할 건이 없습니다 · 연차 목록 보기");
    expect(source).toContain("결재할 건이 없습니다");
    expect(source).toContain('href: "/leave"');
    expect(source).not.toContain("/pnl");
  });
});

describe("app/(app)/page.tsx — 「내 차례」가 빈 홈 (§7-4)", () => {
  const source = read("app", "(app)", "page.tsx");

  it("NextTurn 블록 자체는 0건일 때 사라진다", () => {
    expect(source).toContain("view.visible");
  });

  it("§7-4 이탈이 DECISIONS.md에 해소 시점과 함께 기록돼 있다", () => {
    // §7-4: 「항목이 0이면 이 블록은 사라진다. 「할 일이 없습니다」를 쓰지 않는다.
    //        대신 목록 화면이 위로 올라온다」
    // Phase 2에서는 목록 화면이 전부 빈 자리표시자라 「위로 올라올」 목록이 없다.
    // 그래서 한 줄을 남기되, D-25 이탈과 같은 방식으로 기록한다 — 기록 없는
    // 위반과 기록된 이탈의 차이가 이 테스트의 요점이다.
    const entry = DECISIONS.slice(DECISIONS.indexOf("§7-4"));
    expect(DECISIONS).toContain("§7-4");
    expect(entry).toContain("해소 시점");
    expect(entry).toMatch(/Phase 4/);
  });
});

// F-07(260922-o2b) — SYSTEM.md §2-4 「모든 숫자 칸은 우측 정렬, tabular-nums,
// nowrap」. 정렬 칸(코드표·계급)과 숫자형 이력 값 칸에 styles.num을 건다.
describe("관리자 표 — 숫자 칸 정렬 (F-07)", () => {
  it("code-tables/page.tsx의 「정렬」 th·sortOrder td가 styles.num을 쓴다", () => {
    const source = read("app", "(app)", "admin", "code-tables", "page.tsx");
    expect(source).toMatch(/th\s+scope="col"\s+className=\{styles\.num\}>\s*정렬/);
    expect(source).toMatch(/<td\s+className=\{styles\.num\}>\{item\.sortOrder\}<\/td>/);
  });

  it("roles-client.tsx의 「정렬」 th·sortOrder td가 styles.num을 쓴다", () => {
    const source = read("app", "(app)", "admin", "people", "roles", "roles-client.tsx");
    expect(source).toMatch(/th\s+scope="col"\s+className=\{styles\.num\}>\s*정렬/);
    expect(source).toMatch(/<td\s+className=\{styles\.num\}>\{role\.sortOrder\}<\/td>/);
  });

  it("HistoryList.tsx가 숫자형 값에만 styles.num을 건다", () => {
    const source = read("ui", "history-list", "HistoryList.tsx");
    expect(source).toContain('valueKind.kind === "number"');
    expect(source).toMatch(/th\s+scope="col"\s+className=\{valueKind\.kind === "number" \? styles\.num : undefined\}>\s*값/);
    expect(source).toMatch(
      /<td className=\{valueKind\.kind === "number" \? styles\.num : undefined\}>\{entry\.displayValue\}<\/td>/,
    );
  });

  it.each([
    ["code-tables.module.css", ["app", "(app)", "admin", "code-tables", "code-tables.module.css"]],
    ["people.module.css", ["app", "(app)", "admin", "people", "people.module.css"]],
    ["HistoryList.module.css", ["ui", "history-list", "HistoryList.module.css"]],
  ])("%s의 .table .num이 우측 정렬·tabular-nums·nowrap이다", (_name, parts) => {
    const css = read(...parts);
    const match = css.match(/\.table \.num\s*\{[^}]*\}/);
    expect(match).not.toBeNull();
    expect(match?.[0]).toContain("text-align: right");
    expect(match?.[0]).toContain("tabular-nums");
    expect(match?.[0]).toContain("white-space: nowrap");
    expect(match?.[0]).toContain("var(--ls-num)");
  });
});

// F-08(260922-o2b) — SYSTEM.md §2-4 「값이 없으면 — 하나. 빈칸을 두지 않는다」.
// 정상 상태 칸(태그 없음)과 계급의 비시드 칸이 빈칸 대신 —를 보인다.
describe("관리자 표 — 빈 상태 칸 em dash (F-08)", () => {
  it.each([
    ["vendors/page.tsx", ["app", "(app)", "admin", "vendors", "page.tsx"]],
    ["corp-cards/page.tsx", ["app", "(app)", "admin", "corp-cards", "page.tsx"]],
    ["code-tables/page.tsx", ["app", "(app)", "admin", "code-tables", "page.tsx"]],
    ["people/page.tsx", ["app", "(app)", "admin", "people", "page.tsx"]],
  ])("%s의 정상 상태 칸이 —를 렌더한다", (_name, parts) => {
    const source = read(...parts);
    expect(source).toMatch(/<\/StatusTag>\s*\)\s*:\s*"—"\s*\}/);
  });

  it("roles-client.tsx의 「시드 여부」 칸이 비시드일 때 —를 렌더한다", () => {
    const source = read("app", "(app)", "admin", "people", "roles", "roles-client.tsx");
    expect(source).toContain('role.isSeed ? "시드" : "—"');
  });
});
