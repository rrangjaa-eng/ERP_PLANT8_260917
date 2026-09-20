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
    //   `결재할 건이 없습니다 · 지출결의 목록 보기`
    // 결재는 지출결의에서 올라오므로 이동 대상이 의미를 갖는다.
    expect(SYSTEM).toContain("결재할 건이 없습니다");
    expect(source).toContain("결재할 건이 없습니다");
    expect(source).toContain("/expenses");
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
