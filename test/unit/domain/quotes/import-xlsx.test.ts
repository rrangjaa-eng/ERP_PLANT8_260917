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
  it("원 미만 단가는 건너뛰지 않고 반올림한다 — 1234.5000000001은 1235 · 150000.0000000001은 150000", () => {
    const sub = okOf(parse([[...HEADER], ["원미만", 1, 1234.5000000001, 1, null, null]]));
    expect(sub.skipped).toEqual([]);
    expect(sub.lines[0]?.unitPrice).toBe(1235);
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

  it("금액만 있는 줄의 금액 94363636.36은 반올림해 94363636", () => {
    const result = okOf(parse([["항목", "금액"], ["운송", 94_363_636.36]]));
    expect(result.skipped).toEqual([]);
    expect(result.lines[0]?.unitPrice).toBe(94_363_636);
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

// 실제 견적 양식의 모양(2026-11 견본 실측) — 지어낸 재료. ITEM 머리글이 B:D 병합이라 항목은 병합 오른쪽 끝 칸(D)에, 대분류는 B · 중분류는 C에 있다.
describe("병합 머리글 양식 (견본 실측)", () => {
  const MERGED_HEADER = [null, "ITEM", null, null, "QTY", "(WON/KRW)\nCOST/UNIT", "NO. of\nDAY/SET", "AMOUNT(KRW)", null, null, "REMARK"];
  const sheet = (): unknown[][] => [
    [null, "Quotation"],
    [null, "Total Amount (NET / VAT excluded) ", null, 9_999],
    [],
    MERGED_HEADER,
    [null, "Venue", "Hall A", "Setting Day", 1, 1_000_000.4, 1, 1_000_000.4, null, null, null],
    [null, null, null, "Event Day", 2, 500_000, 1, 1_000_000, null, null, "점심 포함"],
    [null, null, "sub", null, null, null, null, 2_000_000.4],
    [null, "Decoration", "Design", "Main EI", 1, 800_000, 1, 800_000],
    [null, null, null, "Banner", 3, 100_000, 1, 300_000],
    [null, null, "Product", "Board", 2, 50_000, 1, 100_000],
    [null, null, "sub", null, null, null, null, 1_200_000],
    [null, "Total", null, null, null, null, null, 3_200_000.4],
    [null, "PLAN & MANAGEMENT", null, null, null, null, null, 500_000, null, null, "기획"],
    [null, "Agency Commission(12%)", null, null, null, null, null, 384_000.05],
    [null, "Grand Total(KRW)", null, null, null, null, null, 4_084_000.45, null, null, "VAT excluded"],
  ];

  it("항목은 병합 오른쪽 끝 칸에서 읽고 B · C는 대 · 중분류로 읽는다", () => {
    const result = okOf(parse(sheet()));
    const quote = result.lines.filter((line) => line.lineKind === "quote");
    expect(quote.map((line) => [line.itemName, line.majorCategory, line.midCategory])).toEqual([
      ["Setting Day", "Venue", "Hall A"],
      ["Event Day", "Venue", "Hall A"],
      ["Main EI", "Decoration", "Design"],
      ["Banner", "Decoration", "Design"],
      ["Board", "Decoration", "Product"],
    ]);
    expect(quote[1]?.clientRemark).toBe("점심 포함");
  });

  it("sub · Total · Grand Total(KRW)는 줄도 분류도 아니고 비교 합계로만 쓴다", () => {
    const result = okOf(parse(sheet()));
    expect(result.skipped).toEqual([]);
    expect(result.lines.map((line) => line.itemName)).not.toContain("sub");
    expect(result.lines.map((line) => line.midCategory)).not.toContain("sub");
    expect(result.lines.map((line) => line.majorCategory)).not.toContain("Total");
  });

  it("라벨 칸에 이름이 있는 수수료 줄(PLAN & MANAGEMENT · Agency Commission(12%))은 수수료 줄 — 분류 없음 · 금액 반올림", () => {
    const result = okOf(parse(sheet()));
    const commission = result.lines.filter((line) => line.lineKind === "commission");
    expect(commission.map((line) => [line.itemName, line.unitPrice, line.majorCategory, line.midCategory, line.clientRemark])).toEqual([
      ["PLAN & MANAGEMENT", 500_000, null, null, "기획"],
      ["Agency Commission(12%)", 384_000, null, null, null],
    ]);
  });

  it("줄 합과 Grand Total의 차가 반올림 꼬리 안이면 checksumDiff null · 불일치 0", () => {
    const result = okOf(parse(sheet()));
    expect(result.lines).toHaveLength(7);
    expect(result.checksumDiff).toBeNull();
    expect(result.mismatchedLines).toBe(0);
  });

  it("amount 칸의 T.B.D · F.O.C는 단가를 비고에 남기고 0원 줄로 올린다", () => {
    const rows = [
      MERGED_HEADER,
      [null, "Staff", "Event", "Overtime", 14, 18_000, 1, "T.B.D", null, null, "1시간 기준"],
      [null, null, null, "Gift", 1, 100_000, 1, "F.O.C", null, null, null],
    ];
    const result = okOf(parse(rows));
    expect(result.skipped).toEqual([]);
    expect(result.lines.map((line) => [line.itemName, line.unitPrice, line.clientRemark])).toEqual([
      ["Overtime", 0, "T.B.D · 단가 18,000 · 1시간 기준"],
      ["Gift", 0, "F.O.C · 단가 100,000"],
    ]);
  });

  it("병합이 없는 머리글(ITEM 바로 옆이 QTY)은 그대로 — 항목은 ITEM 칸", () => {
    const result = okOf(parse([[...HEADER], ["Stage", 1, 1000, 1, 1000, null]]));
    expect(result.lines[0]?.itemName).toBe("Stage");
  });
});

// PR #375 /review 지적 1~5 — 생성 fixture.
describe("게이트 지적 반영 (/review)", () => {
  it("1. 음수 금액 줄은 `음수 금액`으로 건너뛰고 수수료 줄의 음수는 그대로 올린다", () => {
    const result = okOf(
      parse([
        [...HEADER],
        ["Discount", null, null, null, -100, null],
        ["Minus unit", 1, -100, 1, -100, null],
        ["Agency Commission", null, null, null, -300, null],
        ["Stage", 1, 1000, 1, 1000, null],
      ]),
    );
    expect(result.skipped.map((entry) => entry.reason)).toEqual(["행 2 · 음수 금액", "행 3 · 음수 금액"]);
    expect(result.lines.map((line) => [line.itemName, line.lineKind, line.unitPrice])).toEqual([
      ["Agency Commission", "commission", -300],
      ["Stage", "quote", 1000],
    ]);
  });

  it("2. 병합이 아닌 머리글의 번호 열(NO. · 번호)과 숫자뿐인 칸은 분류로 읽지 않는다", () => {
    const numbered = okOf(parse([["NO.", "ITEM", "QTY", "COST/UNIT", "DAY/SET", "AMOUNT", "REMARK"], [1, "Stage", 2, 100, 1, 200, null], [2, "Truss", 1, 50, 1, 50, null]]));
    expect(numbered.lines.map((line) => [line.itemName, line.majorCategory, line.midCategory])).toEqual([
      ["Stage", null, null],
      ["Truss", null, null],
    ]);
    const korean = okOf(parse([["번호", "분류", "ITEM", "QTY", "COST/UNIT", "AMOUNT"], ["1", "무대", "Stage", 2, 100, 200]]));
    expect(korean.lines[0]).toMatchObject({ majorCategory: "무대", midCategory: null });
    const numericOnly = okOf(parse([["", "ITEM", "QTY", "COST/UNIT", "AMOUNT"], [3, "Stage", 2, 100, 200], ["4.", "Truss", 1, 50, 50]]));
    expect(numericOnly.lines.map((line) => line.majorCategory)).toEqual([null, null]);
  });

  it("3. 짧은 별칭(SET · DAY · QTY)은 낱말 단위로만 — ASSET TAG는 일수 열이 아니다", () => {
    const asset = okOf(parse([["ITEM", "ASSET TAG", "QTY", "단가", "금액"], ["Laptop", "T-1", 2, 100, 200]]));
    expect(asset.lines).toHaveLength(1);
    expect(asset.skipped).toEqual([]);
    expect(asset.lines[0]).toMatchObject({ quantity: 2, days: 1, unitPrice: 100 });
    const set = okOf(parse([["ITEM", "QTY", "UNIT PRICE", "SET", "AMOUNT"], ["A", 2, 100, 3, 600]]));
    expect(set.lines[0]).toMatchObject({ quantity: 2, days: 3, unitPrice: 100 });
    const day = okOf(parse([["항목", "수량", "단가", "DAY", "금액"], ["A", 1, 100, 4, 400]]));
    expect(day.lines[0]).toMatchObject({ days: 4 });
  });

  it("4. 수량 · 일수가 열 상한(1e10) 이상이면 `상한 초과`로 건너뛴다 · 원래 단가 0인 F.O.C는 `단가 0`을 붙이지 않는다", () => {
    const result = okOf(
      parse([
        [...HEADER],
        ["Gift", 1e12, 1000, 1, null, null],
        ["Long", 1, 1000, 1e10, null, null],
        ["Free", 1, "F.O.C", 1, 0, "메모"],
        ["Free2", 1, 0, 1, "F.O.C", null],
      ]),
    );
    expect(result.skipped.map((entry) => entry.reason)).toEqual(["행 2 · 상한 초과 · 수량", "행 3 · 상한 초과 · 일수"]);
    expect(result.lines.map((line) => [line.itemName, line.unitPrice, line.clientRemark])).toEqual([
      ["Free", 0, "F.O.C · 메모"],
      ["Free2", 0, "F.O.C"],
    ]);
  });

  it("5. VAT · 부가세 줄은 줄로 올리지 않고 소계처럼 건너뛴다 — Grand Total이 VAT 포함이어도 검산 차가 난다", () => {
    for (const vatName of ["VAT (10%)", "V.A.T", "부가세", "부가가치세", "vat"]) {
      const result = okOf(
        parse([
          [...HEADER],
          ["Stage", 1, 1000, 1, 1000, null],
          ["Total", null, null, null, 1000, null],
          [vatName, null, null, null, 100, null],
          ["Grand Total", null, null, null, 1100, null],
        ]),
      );
      expect(result.lines.map((line) => line.itemName)).toEqual(["Stage"]);
      expect(result.skipped).toEqual([]);
      expect(result.checksumDiff).toBeNull();
    }
    // VAT 앞 Total이 없고 Grand Total(VAT 포함)만 있어도 같다.
    const noTotal = okOf(parse([[...HEADER], ["Stage", 1, 1000, 1, 1000, null], ["VAT", null, null, null, 100, null], ["Grand Total", null, null, null, 1100, null]]));
    expect(noTotal.lines).toHaveLength(1);
    expect(noTotal.checksumDiff).toBeNull();
    // 줄 합이 다르면 VAT를 뺀 기준으로 차이를 낸다.
    const off = okOf(parse([[...HEADER], ["Stage", 1, 900, 1, 900, null], ["VAT", null, null, null, 100, null], ["Grand Total", null, null, null, 1100, null]]));
    expect(off.checksumDiff).toBe(100);
  });

  it("F-3. 줄 상한 거절 글자는 설정 줄 상한(lineCap)으로 만든다", () => {
    const rows = [[...HEADER], ...Array.from({ length: 3 }, (_, i) => [`A${i}`, 1, 1000, 1, 1000, null])];
    expect(parseQuoteWorkbook(bookOf([{ name: "견적서", rows }]), { maxLines: 2, lineCap: 300 })).toEqual({ kind: "rejected", message: "300줄 초과 · 300줄까지" });
  });
});
