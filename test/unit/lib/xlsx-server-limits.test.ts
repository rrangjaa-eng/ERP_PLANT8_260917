import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { quoteXlsxReadLimits } from "@/domain/evidence-import/limits";
import { readWorkbookRows } from "@/lib/xlsx-server";

// Codex 봇 지적 P1 — 작은 xlsx라도 먼 칸 하나(XFD1048576) · 큰 !ref가 선언 범위 전체를 펼치게 두지 않는다(행 sheetRows · 열 maxCols).

function bookBytes(cells: Record<string, string>, ref: string): Uint8Array {
  const sheet: XLSX.WorkSheet = { "!ref": ref };
  for (const [address, value] of Object.entries(cells)) sheet[address] = { t: "s", v: value };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "견적서");
  return new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
}

describe("먼 칸 하나 든 작은 xlsx", () => {
  it("열: A1:XFD3의 XFD3 한 칸 → maxCols 안에서만 읽는다(펼침 열 수 ≤ maxCols)", () => {
    const bytes = bookBytes({ A1: "ITEM", B1: "AMOUNT", XFD3: "far" }, "A1:XFD3");
    const book = readWorkbookRows(bytes, { sheetRows: 1300, maxCols: 100 });
    const rows = book.sheets[0]?.rows ?? [];
    expect(Math.max(...rows.map((row) => row.length))).toBeLessThanOrEqual(100);
    expect(rows[0]?.slice(0, 2)).toEqual(["ITEM", "AMOUNT"]);
  });

  it("행: A1:A1048576의 마지막 칸 한 개 → sheetRows 안에서만 읽는다(펼침 행 수 ≤ sheetRows)", () => {
    const bytes = bookBytes({ A1: "ITEM", A1048576: "far" }, "A1:A1048576");
    const book = readWorkbookRows(bytes, { sheetRows: 1300, maxCols: 100 });
    expect(book.sheets[0]?.rows.length).toBeLessThanOrEqual(1300);
  });

  it("maxCols를 안 주면 기존대로 선언 범위를 다 읽는다(증빙 가져오기 동작 불변)", () => {
    const bytes = bookBytes({ A1: "ITEM", XFD3: "far" }, "A1:XFD3");
    const rows = readWorkbookRows(bytes).sheets[0]?.rows ?? [];
    expect(rows[0]?.length).toBe(16384);
  });
});

describe("quoteXlsxReadLimits", () => {
  it("행 상한 = 줄 상한 × 4 + 머리줄 탐색 100 · 열 상한 100", () => {
    expect(quoteXlsxReadLimits(300)).toEqual({ sheetRows: 1300, maxCols: 100 });
    expect(quoteXlsxReadLimits(6)).toEqual({ sheetRows: 124, maxCols: 100 });
  });
});
