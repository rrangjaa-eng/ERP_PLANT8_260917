import { describe, expect, it } from "vitest";
import { clampPage } from "@/lib/paging";
import { pageEntryFocus, pageOfRow, splitPages } from "@/ui/table/paging";

// 04-19(D-91 · SYSTEM.md §7-3 (자)) — 편집 표의 30줄 쪽 나눔은 화면 안 배열 자르기다. 표시 순서 id를 쪽 크기로
// 자르고(새 줄 고정 입력 포함), 줄 id로 쪽을 찾고, 쪽 전환 뒤 활성 셀을 정한다. 쪽 번호 보정은 lib/paging(04-29).
const ids = (count: number, prefix = "id") => Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);

describe("splitPages — 표시 순서 그대로 쪽 크기로 자른다", () => {
  it("45줄은 30 · 15 두 쪽이고 순서가 그대로다", () => {
    const pages = splitPages(ids(45), { pageSize: 30 });
    expect(pages.map((page) => page.length)).toEqual([30, 15]);
    expect(pages[0]?.[0]).toBe("id-1");
    expect(pages[0]?.[29]).toBe("id-30");
    expect(pages[1]?.[0]).toBe("id-31");
    expect(pages[1]?.[14]).toBe("id-45");
  });

  it("30줄은 한 쪽이다(쪽 줄이 없다)", () => {
    expect(splitPages(ids(30), { pageSize: 30 })).toEqual([ids(30)]);
  });

  it("0줄은 빈 쪽 하나다", () => {
    expect(splitPages([], { pageSize: 30 })).toEqual([[]]);
  });

  it("1쪽에 고정된 새 줄(표시 31번째)은 1쪽에 남아 1쪽 31줄 · 2쪽 14줄이고, 고정을 비우면 30 · 15로 다시 나뉜다", () => {
    const display = [...ids(30), "new-1", ...ids(14, "tail")];
    const pinned = splitPages(display, { pageSize: 30, pinned: { "new-1": 1 } });
    expect(pinned.map((page) => page.length)).toEqual([31, 14]);
    expect(pinned[0]?.[30]).toBe("new-1");
    expect(pinned[1]?.[0]).toBe("tail-1");

    const resplit = splitPages(display, { pageSize: 30 });
    expect(resplit.map((page) => page.length)).toEqual([30, 15]);
    expect(resplit[1]?.[0]).toBe("new-1");
  });
});

describe("pageOfRow — 줄 id의 쪽(1부터)", () => {
  const pages = splitPages(ids(45), { pageSize: 30 });

  it("id-31은 2쪽, id-30은 1쪽이다", () => {
    expect(pageOfRow(pages, "id-31")).toBe(2);
    expect(pageOfRow(pages, "id-30")).toBe(1);
  });

  it("없는 id는 null이다", () => {
    expect(pageOfRow(pages, "missing")).toBeNull();
  });
});

describe("쪽 보정 — 쪽이 사라지면 렌더마다 clampPage가 마지막 쪽으로(엔지 리뷰 C 공백 5)", () => {
  it("31줄 2쪽에서 31번째 줄을 지우면 쪽 수 1 → 요청 쪽 2가 1쪽으로 보정된다", () => {
    const before = splitPages(ids(31), { pageSize: 30 });
    expect(before).toHaveLength(2);
    const after = splitPages(ids(30), { pageSize: 30 });
    expect(after).toHaveLength(1);
    expect(clampPage(2, after.length)).toBe(1);
  });
});

describe("pageEntryFocus — 쪽 전환 뒤 활성 셀(DR-23)", () => {
  const editableColKeys = ["subcategory", "execution"];

  it("직전 활성 열이 편집 열이면 새 쪽 첫 줄의 그 열", () => {
    expect(pageEntryFocus({ pageRowIds: ["id-31", "id-32"], lastColKey: "execution", editableColKeys })).toEqual({
      rowId: "id-31",
      colKey: "execution",
    });
  });

  it("직전 활성 열이 없거나 편집 열이 아니면 첫 편집 열", () => {
    expect(pageEntryFocus({ pageRowIds: ["id-31"], lastColKey: undefined, editableColKeys })).toEqual({
      rowId: "id-31",
      colKey: "subcategory",
    });
    expect(pageEntryFocus({ pageRowIds: ["id-31"], lastColKey: "profit", editableColKeys })).toEqual({
      rowId: "id-31",
      colKey: "subcategory",
    });
  });

  it("편집 열이 없으면(읽기 표) null — 호출부가 제목으로 보낸다", () => {
    expect(pageEntryFocus({ pageRowIds: ["id-31"], lastColKey: "execution", editableColKeys: [] })).toBeNull();
  });
});
