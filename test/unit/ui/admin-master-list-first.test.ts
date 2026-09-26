import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 2026-09-21 스테이징 QA: "한 화면에 왜 이렇게 값과 입력하는 페이지가 길어" —
// 거래처·코드표·사람·법인카드 관리 화면이 항상 열려 있는 등록 폼을 목록 위에
// 두어, 일반 모니터에서도 목록(원장, §6-1)이 첫 화면 아래로 밀렸다.
//
// SYSTEM.md §6-1은 "목록이 화면"이고 등록은 목록 머리글의 행동이라고 규정하고,
// §7-8은 "폼을 모달에 넣지 않는다 — 폼은 화면이다"라고 규정한다. D-39(원 계획
// 결정)도 "추가·수정은 별도 화면 또는 모달"이라고 이미 못 박아 두었다 —
// 이번 구현이 그 결정 자체를 어긴 것이다.
//
// 고른 해법: vendors 화면이 이미 쓰고 있던 `?editId=` 검색 파라미터 토글
// 방식을 그대로 확장해 `?new=1`로 등록 폼을 연다. 기본 진입(쿼리 없음)에는
// 폼이 렌더되지 않고, 목록 머리글의 「등록/추가」 행동 링크가 그 폼을 연다.
// 컴포넌트 렌더 없이 소스 단언으로 고정한다(system-md-compliance.test.ts와
// 같은 방식 — vitest unit은 node 환경이라 RTL이 없다).

function read(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), "utf8");
}

type Case = {
  name: string;
  pagePath: string[];
  actionLabel: string;
  formComponent: string;
};

const cases: Case[] = [
  { name: "거래처 (vendors)", pagePath: ["app", "(app)", "admin", "vendors", "page.tsx"], actionLabel: "거래처 등록", formComponent: "VendorForm" },
  { name: "코드표 (code-tables)", pagePath: ["app", "(app)", "admin", "code-tables", "page.tsx"], actionLabel: "코드 추가", formComponent: "CodeItemForm" },
  { name: "사람 (people)", pagePath: ["app", "(app)", "admin", "people", "page.tsx"], actionLabel: "사람 등록", formComponent: "PersonForm" },
  { name: "법인카드 (corp-cards)", pagePath: ["app", "(app)", "admin", "corp-cards", "page.tsx"], actionLabel: "법인카드 등록", formComponent: "CardForm" },
  { name: "공휴일 (holidays)", pagePath: ["app", "(app)", "admin", "holidays", "page.tsx"], actionLabel: "공휴일 추가", formComponent: "HolidayForm" },
];

describe.each(cases)("$name 관리 화면 — 목록이 첫 화면, 등록은 행동 (§6-1)", ({ pagePath, actionLabel, formComponent }) => {
  const source = read(...pagePath);

  it("검색 파라미터 `new`를 읽어 등록 모드를 판정한다(쿼리 없이는 기본 닫힘)", () => {
    // ?new=1일 때만 폼을 연다 — 기본 진입에는 폼이 없다.
    expect(source).toMatch(/new\?:\s*string/);
    expect(source).toMatch(/newParam === "1"/);
  });

  it(`${formComponent}가 무조건 렌더되지 않고 열림 상태(showForm 계열)로 감싸여 있다`, () => {
    // 예전 위반: `<Form .../>` 또는 `canWrite ? <Form .../> : null`처럼
    // 항상(또는 쓰기 권한만으로) 렌더됐다. 이제는 그 조건에 "열림" 판정이
    // 반드시 함께 있어야 한다.
    const componentRegex = new RegExp(`<${formComponent}\\b`);
    expect(source).toMatch(componentRegex);
    // showForm(또는 showCreateForm 등 "show"로 시작하는 지역 변수)이 이
    // 컴포넌트 태그보다 앞서 나오고, 그 사이에 다른 JSX 반환문이 끼어들지
    // 않는다 — 폼 태그 앞 200자 이내에 "show"로 시작하는 토큰이 있어야 한다.
    const idx = source.search(componentRegex);
    expect(idx).toBeGreaterThan(-1);
    const before = source.slice(Math.max(0, idx - 200), idx);
    expect(before).toMatch(/show[A-Za-z]*\s*(&&|\?)/);
  });

  it(`목록 머리글에 "${actionLabel}" 행동 링크가 있고 그 href가 등록 모드(new=1)를 연다`, () => {
    expect(source).toContain(actionLabel);
    expect(source).toMatch(/new=1|isNew:\s*true/);
  });
});

describe("vendors/page.tsx — 수정 모드(?editId=)는 회귀 없이 그대로다", () => {
  const source = read("app", "(app)", "admin", "vendors", "page.tsx");

  it("editId 처리가 남아 있다", () => {
    expect(source).toContain("editId");
    expect(source).toContain("editingVendor");
  });
});

describe("app/(app)/admin/vendors/vendor-form.tsx — 등록 모드에도 취소 동선이 있다", () => {
  const source = read("app", "(app)", "admin", "vendors", "vendor-form.tsx");

  it("isEditing 여부와 무관하게 취소 링크를 렌더한다(등록 모드에도 닫는 방법이 있어야 한다)", () => {
    // 예전 위반: `{isEditing ? (<Link ...>취소</Link>) : null}` — 등록 모드엔
    // 취소가 없었다. 이제는 무조건 렌더한다.
    expect(source).not.toMatch(/\{isEditing \? \(\s*<Link[^]*?취소[^]*?\)\s*:\s*null\}/);
    expect(source).toContain("취소");
  });
});
