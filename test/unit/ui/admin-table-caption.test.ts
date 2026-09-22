import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A-M3(.planning/phases/03-permissions-settings-masters/03-OPEN-ITEMS.md,
// .planning/phases/04-project-quote-ledger/04-OPEN-ITEMS.md) — 관리자 읽기용
// 표 6종에 시각적으로 숨긴 <caption>이 있어야 한다(SYSTEM.md §10 접근성 계약:
// 표는 caption으로 구조상 이름이 붙는다, 시각 디자인엔 없지만 스크린 리더에는
// 남는다). 행동 로그(app/(app)/admin/action-log/page.tsx)·보관함·권한 그리드는
// 이미 caption이 있어 이 파일의 대상이 아니다.
//
// 컴포넌트 렌더 없이 소스 문자열 단언으로 고정한다(test/unit/ui/
// admin-master-list-first.test.ts와 같은 방식 — vitest unit은 node 환경이라
// RTL이 없다).

function read(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), "utf8");
}

type Case = { name: string; path: string[]; caption: string };

const cases: Case[] = [
  { name: "코드표 (code-tables)", path: ["app", "(app)", "admin", "code-tables", "page.tsx"], caption: "코드표" },
  { name: "법인카드 (corp-cards)", path: ["app", "(app)", "admin", "corp-cards", "page.tsx"], caption: "법인카드" },
  { name: "사람 (people)", path: ["app", "(app)", "admin", "people", "page.tsx"], caption: "사람" },
  {
    name: "계급 (people/roles)",
    path: ["app", "(app)", "admin", "people", "roles", "roles-client.tsx"],
    caption: "계급",
  },
  { name: "거래처 (vendors)", path: ["app", "(app)", "admin", "vendors", "page.tsx"], caption: "거래처" },
];

describe.each(cases)("$name 화면 — <table>에 시각적으로 숨긴 caption이 있다(A-M3)", ({ path, caption }) => {
  const source = read(...path);

  it("<table> 바로 안에 <caption>이 있다", () => {
    expect(source).toMatch(/<table[^>]*>\s*<caption/);
  });

  it("caption 요소에 시각 숨김 클래스(전역 sr-only)가 붙어 있다", () => {
    const match = source.match(/<caption[^>]*>/);
    expect(match?.[0] ?? "").toMatch(/\bsr-only\b/);
  });

  it(`caption 문자열 안에 화면 제목 "${caption}"이 있다`, () => {
    const match = source.match(/<caption[^>]*>([^<]*)<\/caption>/);
    expect(match?.[1] ?? "").toContain(caption);
  });
});

describe("코드표 화면 — caption이 tableKey에 따라 서로 다른 표를 구분한다(WR-06, 260922-i3k 리뷰)", () => {
  const source = read("app", "(app)", "admin", "code-tables", "page.tsx");

  it("caption이 currentLabel(화면 부제)을 참조한다 — 고정 문자열 「코드표」만이 아니다", () => {
    const match = source.match(/<caption[^>]*>([\s\S]*?)<\/caption>/);
    expect(match?.[1] ?? "").toContain("currentLabel");
  });
});

describe("코드표 화면 — 머리글 <th> 전부에 scope=\"col\"이 있다(A-M3)", () => {
  const source = read("app", "(app)", "admin", "code-tables", "page.tsx");

  it("<th 로 시작하는 태그 수와 <th scope=\"col\" 태그 수가 같다(조건부 「동작」 칸 포함)", () => {
    const thCount = (source.match(/<th[\s>]/g) ?? []).length;
    const scopedThCount = (source.match(/<th scope="col"/g) ?? []).length;
    expect(thCount).toBeGreaterThan(0);
    expect(scopedThCount).toBe(thCount);
  });
});

describe("ui/history-list/HistoryList.tsx — caption prop이 필수다(호출부마다 다른 표라 컴포넌트가 이름을 지어낼 수 없다, A-M3)", () => {
  const source = read("ui", "history-list", "HistoryList.tsx");

  it("HistoryListProps에 필수 caption: string 필드가 있다", () => {
    expect(source).toMatch(/caption:\s*string/);
  });

  it("<table> 바로 안에 {caption}을 렌더하는 <caption>이 있다", () => {
    expect(source).toMatch(/<table[^>]*>\s*<caption[^>]*>\{caption\}<\/caption>/);
  });

  it("caption 요소에 시각 숨김 클래스(전역 sr-only)가 붙어 있다", () => {
    const match = source.match(/<caption[^>]*>\{caption\}/);
    expect(match?.[0] ?? "").toMatch(/\bsr-only\b/);
  });
});

describe("HistoryList 호출부 — caption prop을 넘긴다(A-M3)", () => {
  it("settings-form-client.tsx의 HistoryList 호출이 caption prop을 넘긴다", () => {
    const source = read("app", "(app)", "admin", "settings", "settings-form-client.tsx");
    expect(source).toMatch(/<HistoryList[\s\S]*?caption=/);
  });

  it('person-detail-client.tsx의 HistoryList 호출이 caption="소속 발령 이력"을 넘긴다', () => {
    const source = read("app", "(app)", "admin", "people", "[id]", "person-detail-client.tsx");
    expect(source).toContain('caption="소속 발령 이력"');
  });
});
