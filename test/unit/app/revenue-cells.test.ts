import { describe, expect, it } from "vitest";
import { otherCellsRejectedText, revenueTableErrorText, routeRejectedRevenueCells } from "@/app/(app)/projects/[id]/revenue-cells";

// 04-16(B3 · UI-SPEC rev 5 후속 결정 R2) — 04-28 거부 봉투의 칸 중 매출 줄 id 칸을 발행·입금 표의 줄·열 오류로 떼어 내고,
// 표별 합계 행 오른쪽 글자를 만든다.
const CAP = "금액이 상한을 넘습니다 · 2,147,483,647원 이하";
const ids = { issuedIds: ["i1"], paidIds: ["p1"] };

describe("routeRejectedRevenueCells", () => {
  it("매출 줄 id 칸은 그 표·그 줄의 열 오류로, 나머지는 rest로 간다", () => {
    const quoteCell = { rowId: "q7", field: "quantity", kind: "error" as const, reason: "0보다 큰 수를 적어 주세요" };
    const routed = routeRejectedRevenueCells(
      [
        { rowId: "i1", field: "amount", kind: "error" as const, reason: CAP },
        { rowId: "p1", field: "amount", kind: "error" as const, reason: CAP },
        quoteCell,
      ],
      ids,
    );
    expect(routed.issued).toEqual({ i1: { amount: CAP } });
    expect(routed.paid).toEqual({ p1: { amount: CAP } });
    expect(routed.rest).toEqual([quoteCell]);
  });

  it("매출 줄 id인데 표 밖 필드(fxRate)면 그 줄의 amount 칸에 붙는다", () => {
    const routed = routeRejectedRevenueCells([{ rowId: "i1", field: "fxRate", kind: "error" as const, reason: CAP }], ids);
    expect(routed.issued).toEqual({ i1: { amount: CAP } });
    expect(routed.rest).toEqual([]);
  });

  it("발행일·메모 필드는 같은 이름의 열로 간다", () => {
    const routed = routeRejectedRevenueCells(
      [
        { rowId: "p1", field: "entryDate", kind: "error" as const, reason: "날짜" },
        { rowId: "p1", field: "note", kind: "error" as const, reason: "메모" },
      ],
      ids,
    );
    expect(routed.paid).toEqual({ p1: { entryDate: "날짜", note: "메모" } });
  });

  it("빈 칸 목록이면 셋 다 비었다", () => {
    expect(routeRejectedRevenueCells([], ids)).toEqual({ issued: {}, paid: {}, rest: [] });
  });

  it("rowId 없이 rowIndex만 있는 칸(새 줄)은 rest로 간다", () => {
    const cell = { rowIndex: 0, field: "quantity", kind: "error" as const, reason: "x" };
    expect(routeRejectedRevenueCells([cell], ids).rest).toEqual([cell]);
  });
});

describe("revenueTableErrorText", () => {
  it.each([
    [0, null],
    [1, "오류 1칸 · 전부 거부"],
    [2, "오류 2칸 · 전부 거부"],
  ])("%i칸 → %s", (count, expected) => {
    expect(revenueTableErrorText(count)).toBe(expected);
  });
});

describe("otherCellsRejectedText", () => {
  it.each([
    [0, 0, null],
    [0, 1, "전부 거부 · 다른 칸 오류 1칸"],
    [0, 3, "전부 거부 · 다른 칸 오류 3칸"],
    [2, 3, null],
  ])("제 칸 %i · 다른 칸 %i → %s", (own, other, expected) => {
    expect(otherCellsRejectedText(own, other)).toBe(expected);
  });
});
