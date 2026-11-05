import { describe, expect, it } from "vitest";
import { withFundNotes } from "@/app/(app)/admin/permissions/fund-notes";
import { FUND_SCOPED_MENUS } from "@/domain/permissions/fund-scope";

// 07.3-04(D-7318): 권한표 열에 자금 본부 표지(groupNote)를 붙이는 화면 매핑 — 열 id 앞부분(메뉴 키)이 자금 메뉴인 열만.
const columns = [
  ...FUND_SCOPED_MENUS.flatMap((menu) => ["view", "write", "approve"].map((action) => ({ id: `${menu}::${action}`, label: action, group: menu }))),
  { id: "cards.proxy::write", label: "쓰기", group: "카드 대리 등록" },
  { id: "expenses::view", label: "보기", group: "지출결의" },
];

describe("withFundNotes (07.3-04)", () => {
  it("자금 메뉴 열에만 「<본부 이름>만」을 붙인다", () => {
    const result = withFundNotes(columns, { name: "경영관리본부" });
    const noted = result.filter((column) => column.groupNote !== undefined);
    expect(noted).toHaveLength(FUND_SCOPED_MENUS.length * 3);
    expect(new Set(noted.map((column) => column.groupNote))).toEqual(new Set(["경영관리본부만"]));
    expect(noted.map((column) => column.id.split("::")[0])).toEqual(expect.arrayContaining([...FUND_SCOPED_MENUS]));
  });

  it("자금 밖 열 · 카드 대리 등록 열에는 groupNote가 없다", () => {
    const result = withFundNotes(columns, { name: "경영관리본부" });
    for (const id of ["cards.proxy::write", "expenses::view"]) {
      const column = result.find((item) => item.id === id);
      expect(column).toBeDefined();
      expect("groupNote" in (column ?? {})).toBe(false);
    }
  });

  it("자금 본부가 없으면(null) 같은 자리가 「자금 본부 미지정」이다", () => {
    const result = withFundNotes(columns, null);
    const noted = result.filter((column) => column.groupNote !== undefined);
    expect(noted).toHaveLength(FUND_SCOPED_MENUS.length * 3);
    expect(new Set(noted.map((column) => column.groupNote))).toEqual(new Set(["자금 본부 미지정"]));
  });

  it("입력 배열 · 열 객체를 바꾸지 않고 새 배열을 돌려준다", () => {
    const before = JSON.stringify(columns);
    const result = withFundNotes(columns, { name: "경영관리본부" });
    expect(result).not.toBe(columns);
    expect(JSON.stringify(columns)).toBe(before);
  });
});
