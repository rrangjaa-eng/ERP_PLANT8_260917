import * as XLSX from "xlsx";

// 07.2-14 — 회사 견적 양식 xlsx 시험 도구. 고객 견본은 저장소에 넣지 않으므로(T-07.2-14-04) 같은 모양을 기존 xlsx 의존성으로 만든다.
// 셀 종류를 값으로 정한다: 숫자는 숫자 셀(n), 글자는 문자열 셀(s) — 시트 읽기가 `raw: true`로 double을 그대로 받는 길을 시험한다.

export type TestSheet = { name: string; rows: unknown[][] };

export function buildQuoteXlsx(sheets: readonly TestSheet[]): Uint8Array {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(book, ws, sheet.name);
  }
  return new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
}

export const HEADER = ["ITEM", "QTY", "COST/UNIT", "NO. of\nDAY/SET", "AMOUNT", "REMARK"] as const;

// 회사 양식 한 장: 대분류(왼쪽 첫 열) · 중분류(둘째 열) 머리 행 + 줄 + 소계 + 수수료 + Grand Total.
export const COMPANY_HEADER = ["", "", ...HEADER] as const;

export function companySheet(name = "견적서"): TestSheet {
  return {
    name,
    rows: [
      ["LG CNS AX FAIR 2026 QUOTATION"],
      [],
      [...COMPANY_HEADER],
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

// Codex P1 시험 — 작은 시트에 먼 칸 하나를 더하고 선언 범위(!ref)를 그 칸까지 넓힌다. 열이 멀면 마지막 줄의 XFD 칸, 행이 멀면 A열 1048576행 칸
// (둘을 한 칸에 겹치면 쓰기 루프가 열 × 행 전체를 돈다).
export function buildQuoteXlsxWithFarCell(sheet: TestSheet, far: "column" | "row"): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  if (far === "column") {
    ws[XLSX.utils.encode_cell({ r: range.e.r, c: 16383 })] = { t: "s", v: "far" };
    range.e.c = 16383;
  } else {
    ws[XLSX.utils.encode_cell({ r: 1048575, c: 0 })] = { t: "s", v: "far" };
    range.e.r = 1048575;
  }
  ws["!ref"] = XLSX.utils.encode_range(range);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, sheet.name);
  return new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
}
