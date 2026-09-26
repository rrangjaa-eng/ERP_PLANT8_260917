import { describe, expect, it } from "vitest";
import { APP_CLIPBOARD_FORMAT, applyPaste, readPasteClipboard, type PasteColumn } from "@/ui/table/use-clipboard-paste";
import { toTsv } from "@/ui/table/parse-tsv";

// 04-47(C-03 · 사용자 D15 · ENG-D5) — 붙여넣기 결정표. 계산 열(번호·견적가·차익·상태)은 앱에서 복사한 붙여넣기
// (클립보드에 application/x-plant8-quote-lines+json이 있을 때)에만 값을 넣지 않고 무시해 센다. 그 밖(엑셀)은 04-04처럼
// 오류 칸이다 — 엑셀 6열의 실행가가 견적가 자리에서 조용히 사라지지 않는다.

type Row = { locked?: boolean };

const SUBCATEGORIES = [{ value: "stage_construction", label: "무대·시공" }];
const VENDORS = [{ value: "vendor-1", label: "가나상사" }];

// 견적 줄 표와 같은 11열 순서.
const COLUMNS: PasteColumn<Row>[] = [
  { key: "sort", kind: "text", pasteRole: "computed", isEditable: () => false },
  { key: "subcategory", kind: "select", options: SUBCATEGORIES, isEditable: () => true },
  { key: "itemName", kind: "text", isEditable: () => true },
  { key: "vendor", kind: "select", options: VENDORS, isEditable: () => true },
  { key: "quantity", kind: "number", numberKind: "quantity", isEditable: () => true },
  { key: "unitPrice", kind: "number", isEditable: (row) => !row.locked },
  { key: "quoteAmount", kind: "text", pasteRole: "computed", isEditable: () => false },
  { key: "execution", kind: "number", isEditable: () => true },
  { key: "profit", kind: "text", pasteRole: "computed", isEditable: () => false },
  { key: "status", kind: "text", pasteRole: "computed", isEditable: () => false },
  { key: "note", kind: "text", isEditable: () => true },
];

const LOCKED = "읽기 전용·잠김 셀에 값 떨어짐";
const ELEVEN = "1\t무대·시공\t무대 설치\t가나상사\t2\t1,000,000\t₩2,000,000\t800,000\t₩1,200,000\t진행\t—";
const EXCEL_SIX = "무대·시공\t무대 설치\t가나상사\t2\t1000000\t800000";

function fakeClipboard(data: Record<string, string>) {
  return { types: Object.keys(data), getData: (format: string) => data[format] ?? "" };
}

describe("readPasteClipboard — 앱 형식 유무", () => {
  it(`${APP_CLIPBOARD_FORMAT}이 있으면 appMeta로 싣는다`, () => {
    expect(APP_CLIPBOARD_FORMAT).toBe("application/x-plant8-quote-lines+json");
    const read = readPasteClipboard(fakeClipboard({ "text/plain": ELEVEN, "application/x-plant8-quote-lines+json": '[{"currency":"KRW"}]' }));
    expect(read).toEqual({ text: ELEVEN, appMeta: '[{"currency":"KRW"}]' });
  });

  it("text/plain만 있으면(엑셀) appMeta가 null이다", () => {
    expect(readPasteClipboard(fakeClipboard({ "text/plain": EXCEL_SIX }))).toEqual({ text: EXCEL_SIX, appMeta: null });
  });
});

describe("applyPaste — 계산 열(ENG-D5 결정표)", () => {
  it("앱 형식이 실린 번호 열 시작 11열 두 줄 → 계산 열 넷의 칸은 값도 오류도 없고 무시 8칸", () => {
    const result = applyPaste({
      clipboardText: `${ELEVEN}\n${ELEVEN}`,
      appMeta: '[{"currency":"KRW"},{"currency":"KRW"}]',
      columns: COLUMNS,
      rows: [{}, {}],
      activeRowIndex: 0,
      activeColIndex: 0,
    });
    expect(result.source).toBe("app");
    expect(result.ignoredComputedCells).toBe(8);
    expect(result.cells.filter((cell) => cell.result.status === "error")).toEqual([]);
    expect(result.cells.map((cell) => cell.columnKey).filter((key) => ["sort", "quoteAmount", "profit", "status"].includes(key))).toEqual([]);
    expect(result.cells.find((cell) => cell.columnKey === "execution")?.result).toEqual({ status: "ok", value: "800000" });
  });

  it("앱 형식이 없는 6열 엑셀을 소분류 칸에 → 실행가 값이 떨어진 견적가 자리가 오류 칸 · 무시 0", () => {
    const result = applyPaste({ clipboardText: EXCEL_SIX, columns: COLUMNS, rows: [{}], activeRowIndex: 0, activeColIndex: 1 });
    expect(result.source).toBe("external");
    expect(result.ignoredComputedCells).toBe(0);
    expect(result.cells.find((cell) => cell.columnKey === "quoteAmount")?.result).toEqual({ status: "error", reason: LOCKED });
    expect(result.cells.filter((cell) => cell.result.status === "error")).toHaveLength(1);
  });

  it("같은 6열에 앱 형식이 실리면 견적가 자리는 무시 1칸 · 오류 0", () => {
    const result = applyPaste({
      clipboardText: EXCEL_SIX,
      appMeta: '[{"currency":"KRW"}]',
      columns: COLUMNS,
      rows: [{}],
      activeRowIndex: 0,
      activeColIndex: 1,
    });
    expect(result.ignoredComputedCells).toBe(1);
    expect(result.cells.filter((cell) => cell.result.status === "error")).toEqual([]);
    expect(result.cells.find((cell) => cell.columnKey === "quoteAmount")).toBeUndefined();
  });

  it("잠긴 입력 칸은 앱 형식이 있어도 04-04 규칙대로 오류다", () => {
    const result = applyPaste({
      clipboardText: "5000",
      appMeta: '[{"currency":"KRW"}]',
      columns: COLUMNS,
      rows: [{ locked: true }],
      activeRowIndex: 0,
      activeColIndex: 5,
    });
    expect(result.cells).toEqual([{ rowIndex: 0, columnKey: "unitPrice", result: { status: "error", reason: LOCKED } }]);
  });

  it("앱 형식 JSON을 읽지 못하면 앱 형식 없음과 같다 — 계산 열은 오류 · 원본 통화 없음", () => {
    const result = applyPaste({ clipboardText: EXCEL_SIX, appMeta: "{깨짐", columns: COLUMNS, rows: [{}], activeRowIndex: 0, activeColIndex: 1 });
    expect(result.source).toBe("external");
    expect(result.sourceCurrencies).toBeNull();
    expect(result.cells.find((cell) => cell.columnKey === "quoteAmount")?.result.status).toBe("error");
  });

  it("앱 형식 줄 수가 붙여넣은 줄 수와 다르면 앱 형식 없음과 같다", () => {
    const result = applyPaste({ clipboardText: `${EXCEL_SIX}\n${EXCEL_SIX}`, appMeta: '[{"currency":"USD"}]', columns: COLUMNS, rows: [{}, {}], activeRowIndex: 0, activeColIndex: 1 });
    expect(result.source).toBe("external");
    expect(result.sourceCurrencies).toBeNull();
  });
});

describe("applyPaste — 원본 통화 · 줄 수 · 끝 줄바꿈", () => {
  it("앱 형식의 줄별 { currency }를 sourceCurrencies로 싣는다(04-24 quoteLineClipboardMeta 모양)", () => {
    const result = applyPaste({
      clipboardText: `${ELEVEN}\n${ELEVEN}`,
      appMeta: '[{"currency":"USD"},{"currency":"KRW"}]',
      columns: COLUMNS,
      rows: [{}, {}],
      activeRowIndex: 0,
      activeColIndex: 0,
    });
    expect(result.sourceCurrencies).toEqual(["USD", "KRW"]);
  });

  it("엑셀처럼 앱 형식이 없으면 원본 통화가 없다", () => {
    const result = applyPaste({ clipboardText: EXCEL_SIX, columns: COLUMNS, rows: [{}], activeRowIndex: 0, activeColIndex: 1 });
    expect(result.sourceCurrencies).toBeNull();
  });

  it("붙여넣은 줄 수를 센다 — 끝 CRLF 하나는 줄이 아니고, 상한까지 남은 수와 같은 줄 수면 새 줄 수도 그만큼이다", () => {
    const text = Array.from({ length: 45 }, (_, index) => `항목${index + 1}`).join("\r\n") + "\r\n";
    const result = applyPaste({ clipboardText: text, columns: COLUMNS, rows: [{}], activeRowIndex: 0, activeColIndex: 2 });
    expect(result.rowCount).toBe(45);
    expect(result.newRowsNeeded).toBe(44);
  });

  it("앱에서 복사한 한 열 두 줄의 마지막 칸이 비었으면(toTsv → `x\\n`) 두 줄이 앱 형식으로 들어가 둘째 칸을 비운다", () => {
    const text = toTsv([["x"], [""]]);
    expect(text).toBe("x\n");
    const result = applyPaste({
      clipboardText: text,
      appMeta: '[{"currency":"USD"},{"currency":"KRW"}]',
      columns: COLUMNS,
      rows: [{}, {}],
      activeRowIndex: 0,
      activeColIndex: 10,
    });
    expect(result.rowCount).toBe(2);
    expect(result.source).toBe("app");
    expect(result.sourceCurrencies).toEqual(["USD", "KRW"]);
    expect(result.cells).toEqual([
      { rowIndex: 0, columnKey: "note", result: { status: "ok", value: "x" } },
      { rowIndex: 1, columnKey: "note", result: { status: "ok", value: "" } },
    ]);
  });
});
