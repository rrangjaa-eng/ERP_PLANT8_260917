import { describe, expect, it } from "vitest";
import { LIST_PAGE_SIZE, QUOTE_TABLE_PAGE_SIZE, clampPage, pageCountFrom } from "@/lib/paging";

// 엔지 리뷰 C §1 P3 — 쪽 번호 보정 · 쪽 수 · 쪽 크기가 목록(04-17)·리저브
// (04-07)·견적 표(04-19)에서 세 번 따로 만들어질 뻔했다. 여기 한 모듈로.

describe("clampPage — 범위 밖 쪽 번호 보정", () => {
  it('clampPage("99", 3) → 3(마지막 쪽으로)', () => {
    expect(clampPage("99", 3)).toBe(3);
  });

  it('clampPage("abc", 3) → 1(숫자가 아니면 1쪽)', () => {
    expect(clampPage("abc", 3)).toBe(1);
  });

  it('clampPage("0", 3) → 1', () => {
    expect(clampPage("0", 3)).toBe(1);
  });

  it('clampPage("-1", 3) → 1', () => {
    expect(clampPage("-1", 3)).toBe(1);
  });

  it("clampPage(undefined, 0) → 1", () => {
    expect(clampPage(undefined, 0)).toBe(1);
  });

  it("clampPage(2, 1) → 1(행이 줄어 쪽이 사라짐)", () => {
    expect(clampPage(2, 1)).toBe(1);
  });

  it('clampPage("2.5", 3) → 1(정수가 아니면 1쪽)', () => {
    expect(clampPage("2.5", 3)).toBe(1);
  });
});

describe("pageCountFrom — 쪽 수", () => {
  it("pageCountFrom(125, 50) → 3", () => {
    expect(pageCountFrom(125, 50)).toBe(3);
  });

  it("pageCountFrom(0, 50) → 0", () => {
    expect(pageCountFrom(0, 50)).toBe(0);
  });

  it("pageCountFrom(50, 50) → 1", () => {
    expect(pageCountFrom(50, 50)).toBe(1);
  });

  it("pageCountFrom(51, 50) → 2", () => {
    expect(pageCountFrom(51, 50)).toBe(2);
  });

  it("pageCountFrom(31, 30) → 2", () => {
    expect(pageCountFrom(31, 30)).toBe(2);
  });
});

describe("쪽 크기 상수(D-91)", () => {
  it("LIST_PAGE_SIZE === 50", () => {
    expect(LIST_PAGE_SIZE).toBe(50);
  });

  it("QUOTE_TABLE_PAGE_SIZE === 30", () => {
    expect(QUOTE_TABLE_PAGE_SIZE).toBe(30);
  });
});
