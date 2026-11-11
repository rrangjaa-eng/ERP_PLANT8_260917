import { describe, expect, it } from "vitest";
import { parseQuoteWorkbook, type QuoteImportResult } from "@/domain/quotes/import-xlsx";
import type { ReadBook } from "@/lib/xlsx-server";

// 07.2-14 Task 1 · 2 — 회사 양식 xlsx 순수 파서. 머리글 이름으로 열을 찾고(D-7246) 필수값이 있는 줄만 만든다(D-7239).

// 경계 규칙(eslint boundaries): 경로에 domain/이 든 시험은 test/support를 import할 수 없다 — 시트 재료는 여기 둔다(test/support/quote-xlsx.ts와 같은 모양).
type TestSheet = { name: string; rows: unknown[][] };

function bookOf(sheets: readonly TestSheet[]): ReadBook {
  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets: sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.map((row) => [...row]), fullRef: null, hitRowLimit: false })),
    date1904: false,
  };
}

const HEADER = ["ITEM", "QTY", "COST/UNIT", "NO. of\nDAY/SET", "AMOUNT", "REMARK"] as const;

function companySheet(name = "견적서"): TestSheet {
  return {
    name,
    rows: [
      ["LG CNS AX FAIR 2026 QUOTATION"],
      [],
      ["", "", ...HEADER],
      ["1. 부스 제작", null, null, null, null, null, null, null],
      [null, "무대", null, null, null, null, null, null],
      [null, null, "Main stage", 1, 1_000_000, 2, 2_000_000, "무대 본체"],
      [null, null, "Backwall", 2, 500_000, 1, 1_000_000, null],
      [null, null, "Sub total", null, null, null, 3_000_000, null],
      ["2. 운영", null, null, null, null, null, null, null],
      [null, null, "Staff", 4, 150_000, 3, 1_800_000, null],
      [null, null, "Gift", 1, "F.O.C", 1, 150_000, null],
      [null, null, "Agency Commission", null, null, null, 300_000, null],
      [null, null, "Grand Total", null, null, null, 5_100_000, null],
    ],
  };
}

function parse(rows: unknown[][], maxLines = 300, name = "견적서"): QuoteImportResult {
  return parseQuoteWorkbook(bookOf([{ name, rows }]), { maxLines });
}

function okOf(result: QuoteImportResult) {
  if (result.kind !== "ok") throw new Error(`ok 아님: ${JSON.stringify(result)}`);
  return result;
}

describe("머리글 이름으로 열 찾기 (D-7246)", () => {
  it("ITEM · QTY · COST/UNIT · NO. of DAY/SET · AMOUNT · REMARK(줄바꿈 섞임) → 줄 둘", () => {
    const result = okOf(parse([[...HEADER], ["Stage", 2, 100_000, 3, 600_000, "본체"], ["Truss", 1, 50_000, 1, 50_000, null]]));
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ itemName: "Stage", quantity: 2, unitPrice: 100_000, days: 3, clientRemark: "본체", lineKind: "quote" });
    expect(result.lines[1]).toMatchObject({ itemName: "Truss", quantity: 1, unitPrice: 50_000, days: 1, clientRemark: null });
    expect(result.skipped).toEqual([]);
    expect(result.mismatchedLines).toBe(0);
  });

  it("괄호 · 줄바꿈 · 한글 별칭을 걷고 포함 비교한다", () => {
    const result = okOf(parse([["항목명\n(ITEM)", "수량", "단가 (VAT 별도)", "일수", "금액", "비고"], ["현수막", 3, 10_000, 2, 60_000, "x"]]));
    expect(result.lines[0]).toMatchObject({ itemName: "현수막", quantity: 3, unitPrice: 10_000, days: 2, clientRemark: "x" });
  });

  it("머리 줄이 첫 줄이 아니어도 찾는다", () => {
    const result = okOf(parse([["QUOTATION"], [], [...HEADER], ["A", 1, 1000, 1, 1000, null]]));
    expect(result.lines).toHaveLength(1);
  });

  it("AMOUNT (VAT)가 AMOUNT 오른쪽에 있으면 왼쪽 첫 열이 금액", () => {
    const result = okOf(parse([["ITEM", "QTY", "UNIT PRICE", "AMOUNT", "AMOUNT (VAT)"], ["A", 2, 1000, 2000, 2200]]));
    expect(result.lines[0]).toMatchObject({ unitPrice: 1000, quantity: 2 });
    expect(result.mismatchedLines).toBe(0);
  });

  it("금액만 있으면 수량 1 · 일수 1 · 단가 = 금액", () => {
    const result = okOf(parse([["항목", "금액"], ["운송", 330_000]]));
    expect(result.lines[0]).toMatchObject({ itemName: "운송", quantity: 1, days: 1, unitPrice: 330_000 });
  });

  it("머리글을 못 찾으면 필요한 열 이름과 함께 거절", () => {
    const result = parse([["A", "B", "C"], [1, 2, 3]]);
    expect(result).toEqual({ kind: "rejected", message: "열 이름 없음 · 항목 · 수량 · 단가 또는 금액" });
  });
});

describe("건너뛴 줄 (부분 성공)", () => {
  it("항목 없음 · 단가 금액 없음 · 숫자 아님 · 수량", () => {
    const result = okOf(
      parse([
        [...HEADER],
        [null, 1, 1000, 1, 1000, null],
        ["항목만", 2, null, null, null, null],
        ["수량이상", "abc", 1000, 1, 1000, null],
        ["정상", 1, 1000, 1, 1000, null],
      ]),
    );
    expect(result.lines.map((line) => line.itemName)).toEqual(["정상"]);
    expect(result.skipped).toEqual([
      { row: 2, reason: "행 2 · 항목 없음" },
      { row: 3, reason: "행 3 · 단가·금액 없음" },
      { row: 4, reason: "행 4 · 숫자 아님 · 수량" },
    ]);
  });

  it("줄 수가 maxLines를 넘으면 거절", () => {
    const rows = [[...HEADER], ...Array.from({ length: 3 }, (_, i) => [`A${i}`, 1, 1000, 1, 1000, null])];
    expect(parse(rows, 2)).toEqual({ kind: "rejected", message: "2줄 초과 · 2줄까지" });
    expect(okOf(parse(rows, 3)).lines).toHaveLength(3);
  });
});

describe("숫자 칸은 raw double이다", () => {
  it("단가 1234.5000000001은 건너뜀 원 미만 금액 · 150000.0000000001은 150000", () => {
    const sub = okOf(parse([[...HEADER], ["원미만", 1, 1234.5000000001, 1, null, null]]));
    expect(sub.lines).toEqual([]);
    expect(sub.skipped[0]?.reason).toBe("행 2 · 원 미만 금액");
    const tail = okOf(parse([[...HEADER], ["꼬리", 1, 150000.0000000001, 1, null, null]]));
    expect(tail.lines[0]?.unitPrice).toBe(150000);
  });

  it("수량 1.255는 건너뜀 소수 2자리 초과 · 수량", () => {
    const result = okOf(parse([[...HEADER], ["수량", 1.255, 1000, 1, null, null]]));
    expect(result.skipped[0]?.reason).toBe("행 2 · 소수 2자리 초과 · 수량");
    const days = okOf(parse([[...HEADER], ["일수", 1, 1000, 2.001, null, null]]));
    expect(days.skipped[0]?.reason).toBe("행 2 · 소수 2자리 초과 · 일수");
  });

  it("수량 1.5 · 단가 33,333 · AMOUNT 49,999.5 → 줄 유지 · 견적가 정수 원 · 불일치 0", () => {
    const result = okOf(parse([[...HEADER], ["반올림", 1.5, 33_333, 1, 49_999.5, null]]));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ quantity: 1.5, unitPrice: 33_333 });
    expect(result.mismatchedLines).toBe(0);
  });

  it("금액만 있는 줄의 금액 1234.5000000001은 건너뜀 원 미만 금액", () => {
    const result = okOf(parse([["항목", "금액"], ["운송", 1234.5000000001]]));
    expect(result.skipped[0]?.reason).toBe("행 2 · 원 미만 금액");
  });

  it("문자열 숫자는 붙여넣기와 같은 규칙으로 읽는다(쉼표 · 원)", () => {
    const result = okOf(parse([[...HEADER], ["문자열", "2", "1,200원", "1", null, null]]));
    expect(result.lines[0]).toMatchObject({ quantity: 2, unitPrice: 1200 });
  });
});

describe("양식 규칙 (Task 2)", () => {
  it("시트가 둘이면 미지정 → needsSheet(시트마다 줄 수 · Grand Total) · 지정 → ok · 하나면 바로 ok", () => {
    const book = bookOf([companySheet("견적서"), { name: "견적서2", rows: [[...HEADER], ["A", 1, 1000, 1, 1000, null], ["Grand Total", null, null, null, 1000, null]] }]);
    const picked = parseQuoteWorkbook(book, { maxLines: 300 });
    expect(picked).toEqual({
      kind: "needsSheet",
      sheets: [
        { name: "견적서", lines: 5, grandTotal: 5_100_000 },
        { name: "견적서2", lines: 1, grandTotal: 1000 },
      ],
    });
    const ok = okOf(parseQuoteWorkbook(book, { maxLines: 300, sheet: "견적서2" }));
    expect(ok.sheet).toBe("견적서2");
    expect(ok.lines).toHaveLength(1);
    expect(okOf(parseQuoteWorkbook(bookOf([companySheet()]), { maxLines: 300 })).sheet).toBe("견적서");
  });

  it("회사 양식 한 장: 소계 · Grand Total 줄은 줄이 아니고 건너뜀도 아니며 검산 합이 맞으면 checksumDiff null", () => {
    const result = okOf(parseQuoteWorkbook(bookOf([companySheet()]), { maxLines: 300 }));
    expect(result.lines.map((line) => line.itemName)).toEqual(["Main stage", "Backwall", "Staff", "Gift", "Agency Commission"]);
    expect(result.skipped).toEqual([]);
    expect(result.checksumDiff).toBeNull();
  });

  it("검산 합이 1,200 다르면 checksumDiff 1200", () => {
    const sheet = companySheet();
    sheet.rows = sheet.rows.map((row) => (row[2] === "Grand Total" ? [null, null, "Grand Total", null, null, null, 5_101_200, null] : row));
    expect(okOf(parseQuoteWorkbook(bookOf([sheet]), { maxLines: 300 })).checksumDiff).toBe(1200);
  });

  it("Subway signage · Total design fee 는 일반 줄로 남는다", () => {
    const result = okOf(parse([[...HEADER], ["Subway signage", 1, 1000, 1, 1000, null], ["Total design fee", 2, 500, 1, 1000, null]]));
    expect(result.lines.map((line) => line.itemName)).toEqual(["Subway signage", "Total design fee"]);
  });

  it("엑셀 AMOUNT ≠ 수량×단가×일수 → 곱으로 저장 · mismatchedLines 1 · 줄은 유지", () => {
    const result = okOf(parse([[...HEADER], ["불일치", 2, 20_000, 1, 50_000, null]]));
    expect(result.lines[0]).toMatchObject({ quantity: 2, unitPrice: 20_000, days: 1 });
    expect(result.mismatchedLines).toBe(1);
  });

  it("수수료 줄: 완전 일치 목록 · commission으로 끝나는 항목 → commission 줄 · Commission fee table 은 일반 줄", () => {
    const result = okOf(
      parse([
        [...HEADER],
        ["PLAN & MANAGEMENT", null, null, null, 100_000, null],
        ["Venue Commission", null, null, null, 200_000, null],
        ["Agency Commission", null, null, null, 300_000, null],
        ["Media Agency commission", null, null, null, 400_000, null],
        ["Commission fee table", 1, 5000, 1, 5000, null],
      ]),
    );
    expect(result.lines.map((line) => [line.lineKind, line.unitPrice])).toEqual([
      ["commission", 100_000],
      ["commission", 200_000],
      ["commission", 300_000],
      ["commission", 400_000],
      ["quote", 5000],
    ]);
    expect(result.lines[0]).toMatchObject({ quantity: 1, days: 1 });
  });

  it("F.O.C · TBD 는 단가 0 + 고객 비고에 원문과 원래 단가", () => {
    const result = okOf(
      parse([
        [...HEADER],
        ["Gift", 1, "F.O.C", 1, 150_000, null],
        ["Option", 1, 70_000, 1, "TBD", null],
        ["Free", 1, "F.O.C", 1, null, null],
      ]),
    );
    expect(result.lines[0]).toMatchObject({ unitPrice: 0, clientRemark: "F.O.C · 단가 150,000" });
    expect(result.lines[1]).toMatchObject({ unitPrice: 0, clientRemark: "TBD · 단가 70,000" });
    expect(result.lines[2]).toMatchObject({ unitPrice: 0, clientRemark: "F.O.C" });
    expect(result.mismatchedLines).toBe(0);
  });

  it("대 · 중분류: 머리 행이 아래 줄에 붙고 병합으로 빈 칸은 위 값을 이어받는다", () => {
    const result = okOf(parseQuoteWorkbook(bookOf([companySheet()]), { maxLines: 300 }));
    expect(result.lines.map((line) => [line.itemName, line.majorCategory, line.midCategory])).toEqual([
      ["Main stage", "1. 부스 제작", "무대"],
      ["Backwall", "1. 부스 제작", "무대"],
      ["Staff", "2. 운영", null],
      ["Gift", "2. 운영", null],
      ["Agency Commission", "2. 운영", null],
    ]);
  });

  it("항목 칸만 있는 머리 행은 대분류 · 들여쓴 머리 행은 중분류", () => {
    const result = okOf(parse([[...HEADER], ["스테이지"], ["  메인"], ["A", 1, 1000, 1, 1000, null]]));
    expect(result.lines[0]).toMatchObject({ majorCategory: "스테이지", midCategory: "메인" });
  });

  it("설명용 둘째 줄(항목만 있고 금액 빔)은 위 줄의 수량 · 단가 · 일수 · 금액을 이어받지 않는다", () => {
    const result = okOf(parse([[...HEADER], ["Stage", 2, 1000, 3, 6000, null], ["(조명 포함)", null, null, null, null, null]]));
    expect(result.lines).toHaveLength(1);
    expect(result.skipped).toEqual([{ row: 3, reason: "행 3 · 단가·금액 없음" }]);
  });

  it("긴 글자는 잘라 담는다(고객 비고 500자 · 분류 100자)", () => {
    const result = okOf(parse([[...HEADER], ["가".repeat(150)], ["A", 1, 1000, 1, 1000, "나".repeat(600)]]));
    expect(result.lines[0]?.clientRemark).toHaveLength(500);
    expect(result.lines[0]?.majorCategory).toHaveLength(100);
  });
});
