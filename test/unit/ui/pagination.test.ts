import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pageRangeText, pageWindow } from "../../../ui/pagination/page-window";
import { Pagination, type PaginationProps } from "../../../ui/pagination/Pagination";
import styles from "../../../ui/pagination/Pagination.module.css";

// SYSTEM.md §7-16 페이지 줄 — 번호 창(C-27 포함) · 범위 문구 · 정적 렌더(유니언·
// aria-current·첫/끝·오류 수). react-dom/server의 renderToStaticMarkup으로
// jsdom 없이(environment: "node") 문자열 단언한다(button.test.ts 선례).

describe("pageWindow — 넓은 창(7쪽 이하 전부, 8쪽부터 첫·끝·현재 ±1)", () => {
  it.each([
    [1, 1, [1]],
    [2, 3, [1, 2, 3]],
    [1, 7, [1, 2, 3, 4, 5, 6, 7]],
    [5, 12, [1, "gap", 4, 5, 6, "gap", 12]],
    [1, 12, [1, 2, "gap", 12]],
    [3, 12, [1, 2, 3, 4, "gap", 12]],
    [12, 12, [1, "gap", 11, 12]],
  ] as const)("pageWindow(%i, %i)", (page, pageCount, expected) => {
    expect(pageWindow(page, pageCount)).toEqual(expected);
  });

  it("C-27: 건너뛸 쪽이 정확히 하나면 `…` 대신 그 번호를 보인다", () => {
    expect(pageWindow(4, 12)).toEqual([1, 2, 3, 4, 5, "gap", 12]);
    expect(pageWindow(9, 12)).toEqual([1, "gap", 8, 9, 10, 11, 12]);
  });
});

describe("pageRangeText — 범위 문구(천 단위 쉼표, en dash)", () => {
  it("51–100 / 125건", () => {
    expect(pageRangeText({ page: 2, pageSize: 50, total: 125, unit: "건" })).toBe("51–100 / 125건");
  });

  it("101–125 / 125건(마지막 쪽 — 끝 잘림)", () => {
    expect(pageRangeText({ page: 3, pageSize: 50, total: 125, unit: "건" })).toBe("101–125 / 125건");
  });

  it("31–60 / 142줄(문서 내용 표 단위)", () => {
    expect(pageRangeText({ page: 2, pageSize: 30, total: 142, unit: "줄" })).toBe("31–60 / 142줄");
  });

  it("총수가 1,000 이상이면 쉼표가 붙는다", () => {
    expect(pageRangeText({ page: 1, pageSize: 50, total: 1250, unit: "건" })).toBe("1–50 / 1,250건");
  });
});

describe("Pagination — 정적 렌더(§7-16 계약)", () => {
  function render(props: PaginationProps) {
    return renderToStaticMarkup(createElement(Pagination, props));
  }

  const baseHref: PaginationProps = {
    label: "목록",
    page: 2,
    pageCount: 3,
    rangeText: "51–100 / 125건",
    href: (p: number) => `/list?page=${p}`,
  };

  it("pageCount가 1이면 아무것도 렌더하지 않는다", () => {
    const html = render({ ...baseHref, page: 1, pageCount: 1 });
    expect(html).toBe("");
  });

  it("1쪽에는 「이전」이, 끝 쪽에는 「다음」이 렌더되지 않는다", () => {
    const first = render({ ...baseHref, page: 1 });
    expect(first).not.toContain("이전");
    expect(first).toContain("다음");

    const last = render({ ...baseHref, page: 3 });
    expect(last).toContain("이전");
    expect(last).not.toContain("다음");
  });

  it("현재 번호는 링크·버튼이 아니고 aria-current=\"page\"가 하나만 있다", () => {
    const html = render(baseHref);
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
    expect(html).not.toMatch(/<(?:a|button)[^>]*aria-current="page"/);
  });

  it("href 갈래는 next/link의 <a href>를 렌더한다", () => {
    const html = render(baseHref);
    expect(html).toContain('href="/list?page=1"');
    expect(html).not.toContain("<button");
  });

  it("onPageChange 갈래는 <button type=\"button\">을 렌더한다", () => {
    const html = render({
      label: "견적 표",
      page: 2,
      pageCount: 3,
      rangeText: "31–60 / 90줄",
      onPageChange: () => undefined,
    });
    expect(html).toContain('<button type="button"');
    expect(html).not.toContain("<a ");
  });

  it("errorCounts가 있으면 번호 옆 오류 N과 접근 이름 `N쪽, 오류 M칸`을 보인다", () => {
    const html = render({
      label: "리저브 대장",
      page: 1,
      pageCount: 3,
      rangeText: "1–30 / 90줄",
      onPageChange: () => undefined,
      errorCounts: { 2: 2 },
    });
    expect(html).toContain("오류 2");
    expect(html).toContain('aria-label="2쪽, 오류 2칸"');
  });

  it("`…`는 링크·버튼이 아니다", () => {
    const html = render({
      label: "견적 표",
      page: 5,
      pageCount: 12,
      rangeText: "121–150 / 350줄",
      onPageChange: () => undefined,
    });
    expect(html).toContain(styles.gap);
    const gapMatch = html.match(new RegExp(`<[^>]*class="${styles.gap}"[^>]*>([^<]*)<`));
    expect(gapMatch?.[1]).toBe("…");
  });
});
