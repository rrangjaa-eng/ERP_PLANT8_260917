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
];

// 04.6-15 — 같은 불변식(<table> 바로 안 caption · 시각 숨김 · 화면 제목 포함)을 두 꼴로 잰다. 옛 raw `<table>` 꼴은 소스 안
// `<caption className="sr-only">`를, 서버 `StaticTable` 꼴(R1)은 호출부의 `caption` 값과 `StaticTable` 컴포넌트의 caption 렌더를 본다.
// 화면이 raw 꼴에서 StaticTable 꼴로 옮겨도(웨이브 ③ 거래처 · ④ 사람·계급·법인카드·코드표) 이 단언은 그대로 초록이어야 한다.
const STATIC_CALL = /<StaticTable[\s>]/;
// `caption="…"` · `caption={"…"}` · caption={`…${x}…`} — 호출부가 넘기는 값 한 덩어리.
const STATIC_CAPTION_VALUE = /<StaticTable[\s\S]*?caption=(\{`[^`]*`\}|"[^"]*"|\{[^}]*\})/;

function staticCaptionValue(source: string): string {
  return source.match(STATIC_CAPTION_VALUE)?.[1] ?? "";
}

describe.each(cases)("$name 화면 — 표에 시각적으로 숨긴 caption이 있다(A-M3 · raw 꼴 또는 StaticTable 꼴)", ({ path, caption }) => {
  const source = read(...path);
  const staticTable = read("ui", "table", "StaticTable.tsx");
  const isStatic = STATIC_CALL.test(source);

  it("raw 꼴은 <table> 바로 안에 <caption>이 있고, StaticTable 꼴은 호출에 caption 값이 있다", () => {
    if (isStatic) {
      expect(staticCaptionValue(source)).not.toBe("");
    } else {
      expect(source).toMatch(/<table[^>]*>\s*<caption/);
    }
  });

  it("caption 요소에 시각 숨김 클래스(전역 sr-only)가 붙어 있다(StaticTable 꼴은 컴포넌트의 caption 렌더)", () => {
    const match = (isStatic ? staticTable : source).match(/<caption[^>]*>/);
    expect(match?.[0] ?? "").toMatch(/\bsr-only\b/);
  });

  it(`caption 문자열 안에 화면 제목 "${caption}"이 있다`, () => {
    if (isStatic) {
      expect(staticCaptionValue(source)).toContain(caption);
    } else {
      const match = source.match(/<caption[^>]*>([^<]*)<\/caption>/);
      expect(match?.[1] ?? "").toContain(caption);
    }
  });
});

// `ui/table/StaticTable.tsx` — 위 StaticTable 꼴 화면이 기대는 컴포넌트 쪽 불변식(모든 StaticTable 화면에 한 번).
describe("ui/table/StaticTable.tsx — caption이 필수이고 열 머리글이 scope=\"col\"이다(A-M3 · 04.6-15)", () => {
  const source = read("ui", "table", "StaticTable.tsx");

  it("props 타입에 필수 caption: string 필드가 있다", () => {
    expect(source).toMatch(/caption:\s*string/);
  });

  it("<table> 바로 안에 {caption}을 렌더하는 시각 숨김 <caption>이 있다", () => {
    expect(source).toMatch(/<table[^>]*>\s*<caption className="sr-only">\{caption\}<\/caption>/);
  });

  it('열 머리글이 <th scope="col"로 그려진다', () => {
    expect(source).toMatch(/<th\s+key=\{column\.key\}\s+scope="col"/);
  });
});

// 거래처(04.6-11 · R1): 서버 페이지가 raw <table> 대신 `ui/table/StaticTable`을 부른다 — 같은 세 불변식(<table> 바로 안 caption ·
// 시각 숨김 · 제목 포함)을 호출부의 caption 값 + StaticTable의 caption 렌더로 잰다.
describe("거래처 (vendors) 화면 — StaticTable의 caption에 시각적으로 숨긴 caption이 있다(A-M3 · 04.6-11)", () => {
  const page = read("app", "(app)", "admin", "vendors", "page.tsx");
  const staticTable = read("ui", "table", "StaticTable.tsx");

  it("<table> 바로 안에 {caption}을 그리는 <caption>이 있다(StaticTable)", () => {
    expect(staticTable).toMatch(/<table[^>]*>\s*<caption[^>]*>\{caption\}<\/caption>/);
  });

  it("caption 요소에 시각 숨김 클래스(전역 sr-only)가 붙어 있다(StaticTable)", () => {
    const match = staticTable.match(/<caption[^>]*>\{caption\}/);
    expect(match?.[0] ?? "").toMatch(/\bsr-only\b/);
  });

  it('거래처 page.tsx가 <StaticTable 호출에 caption="거래처"를 넘긴다', () => {
    expect(page).toMatch(/<StaticTable[\s\S]*?caption="거래처"/);
  });
});

describe("코드표 화면 — caption이 tableKey에 따라 서로 다른 표를 구분한다(WR-06, 260922-i3k 리뷰)", () => {
  const source = read("app", "(app)", "admin", "code-tables", "page.tsx");

  it("caption이 currentLabel(고른 표 이름)을 참조한다 — 고정 문자열 「코드표」만이 아니다(raw · StaticTable 꼴 모두)", () => {
    const rawCaption = source.match(/<caption[^>]*>([\s\S]*?)<\/caption>/)?.[1];
    expect(rawCaption ?? staticCaptionValue(source)).toContain("currentLabel");
  });
});

describe("코드표 화면 — 머리글 <th> 전부에 scope=\"col\"이 있다(A-M3 · raw 꼴 또는 StaticTable 꼴)", () => {
  const source = read("app", "(app)", "admin", "code-tables", "page.tsx");

  it("페이지에 <th 가 있으면 전부 <th scope=\"col\"이고, 없으면 <StaticTable을 쓴다(머리글은 StaticTable이 맡는다)", () => {
    const thCount = (source.match(/<th[\s>]/g) ?? []).length;
    if (thCount === 0) {
      expect(source).toMatch(STATIC_CALL);
      return;
    }
    const scopedThCount = (source.match(/<th scope="col"/g) ?? []).length;
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
