import { describe, expect, it } from "vitest";
import {
  otherCellsRejectedText,
  quoteTableRejectionText,
  revenueTableErrorText,
  routeRejectedRevenueCells,
} from "@/app/(app)/projects/[id]/revenue-cells";

// 04-16(B3 · UI-SPEC rev 5 후속 결정 R2) — 04-28 거부 봉투의 칸 중 매출 줄 id 칸을 발행·입금 표의 줄·열 오류로 떼어 내고,
// 표별 합계 행 오른쪽 글자를 만든다.
const CAP = "금액이 상한을 넘습니다 · 999,999,999,999원 이하";
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
    [0, { conflictRows: 0, errorCells: 0 }, null],
    [0, { conflictRows: 0, errorCells: 1 }, "전부 거부 · 다른 칸 오류 1칸"],
    [0, { conflictRows: 0, errorCells: 3 }, "전부 거부 · 다른 칸 오류 3칸"],
    [2, { conflictRows: 0, errorCells: 3 }, null],
    // VERDICT.md "/qa low" — 원인이 다른 표의 충돌일 때는 "오류"가 아니라 "충돌"로 알린다.
    [0, { conflictRows: 1, errorCells: 0 }, "전부 거부 · 다른 표 충돌 1줄"],
    [0, { conflictRows: 2, errorCells: 1 }, "전부 거부 · 다른 표 충돌 2줄 · 다른 칸 오류 1칸"],
  ])("제 칸 %i · 다른 원인 %o → %s", (own, other, expected) => {
    expect(otherCellsRejectedText(own, other)).toBe(expected);
  });
});

// 04-41(04-16 검토 S-4) — 매출 칸이 같은 봉투로 오면 봉투 요약(`summary`)은 봉투 전체 칸 수다. 견적 줄 표 합계 행은 그 표의
// 칸(견적 줄 칸)만 센다 — R2 「그 표의 칸 수」.
describe("quoteTableRejectionText", () => {
  const quoteError = { rowId: "q7", field: "quantity", kind: "error" as const, reason: "0보다 큰 수를 적어 주세요" };
  const revenueError = { rowId: "i1", field: "amount", kind: "error" as const, reason: CAP };

  it("봉투에 견적 줄 칸 1 · 매출 칸 2가 있으면 견적 표는 `오류 1칸 · 전부 거부`다(봉투 요약 `오류 3칸`을 쓰지 않는다)", () => {
    const envelope = {
      summary: "오류 3칸 · 전부 거부",
      cells: [quoteError, revenueError, { rowId: "p1", field: "amount", kind: "error" as const, reason: CAP }],
    };
    expect(quoteTableRejectionText(envelope, ids, 0)).toBe("오류 1칸 · 전부 거부");
  });

  it("견적 줄 충돌 칸은 줄 수로, 오류 칸은 칸 수로 센다 — 매출 칸은 빼고", () => {
    const envelope = {
      summary: "충돌 1줄 · 전부 거부 · 오류 2칸 · 전부 거부",
      cells: [
        { rowId: "q1", field: "itemName", kind: "conflict" as const, reason: "다른 사람이 먼저 바꿈" },
        { rowId: "q1", field: "quantity", kind: "conflict" as const, reason: "다른 사람이 먼저 바꿈" },
        quoteError,
        revenueError,
      ],
    };
    expect(quoteTableRejectionText(envelope, ids, 0)).toBe("충돌 1줄 · 전부 거부 · 오류 1칸 · 전부 거부");
  });

  it("견적 줄 칸이 없으면 매출 칸 + 표 밖 칸 수로 `전부 거부 · 다른 칸 오류 N칸`이다", () => {
    expect(quoteTableRejectionText({ summary: "오류 1칸 · 전부 거부", cells: [revenueError] }, ids, 2)).toBe(
      "전부 거부 · 다른 칸 오류 3칸",
    );
  });
});
