import { describe, expect, it, vi } from "vitest";
// 표 모듈이 서버 액션을 거쳐 server-only를 import한다 — 순수 함수만 보므로 그 표식은 비운다.
vi.mock("server-only", () => ({}));

import {
  customFieldCellInput,
  customFieldPasteColumn,
  customFieldPasteInput,
  resolvedConflictLine,
} from "@/app/(app)/projects/[id]/quote-table";
import { customFieldCopyText, type QuoteLineCustomColumn } from "@/app/(app)/projects/[id]/custom-field-cells";
import { CUSTOM_DATE_INVALID_MESSAGE } from "@/domain/custom-fields/build-schema";
import { applyPaste } from "@/ui/table/use-clipboard-paste";

// 07.5-03 독립 검토 SF-1 · SF-2 — 추가 칸 붙여넣기 판정과 충돌 「그 값으로」.
const text: QuoteLineCustomColumn = { key: "cf_text0001", label: "장비 규격", type: "text", options: [], required: false };
const num: QuoteLineCustomColumn = { key: "cf_num00001", label: "설치 높이", type: "number", options: [], required: false };
const date: QuoteLineCustomColumn = { key: "cf_date0001", label: "반입일", type: "date", options: [], required: false };

describe("SF-1 추가 칸 붙여넣기 — 빈 칸 · 「—」는 비움, 나머지는 셀 편집과 같은 판정", () => {
  it("숫자 · 날짜 · 텍스트 칸의 빈 글자와 「—」(빈 칸 복사 글자)는 비움", () => {
    for (const column of [num, date, text]) {
      expect(customFieldPasteInput(column, "")).toEqual({ value: "" });
      expect(customFieldPasteInput(column, "—")).toEqual({ value: "" });
      expect(customFieldPasteInput(column, customFieldCopyText(column, ""))).toEqual({ value: "" });
    }
  });

  it("값이 있으면 셀 편집 판정 그대로(숫자 쉼표 · 소수 자리 · 숫자 아님 · 날짜 형식)", () => {
    for (const [column, raw] of [
      [num, "1,234.5"],
      [num, "1.234"],
      [num, "높음"],
      [date, "2026-11-04"],
      [date, "11/04"],
      [text, "LED 3m"],
    ] as const) {
      expect(customFieldPasteInput(column, raw)).toEqual(customFieldCellInput(column, raw));
    }
    expect(customFieldCellInput(num, "1,234.5")).toEqual({ value: "1234.5" });
    expect(customFieldCellInput(num, "높음")).toEqual({ error: "숫자 아님 · 1.5처럼" });
    expect(customFieldCellInput(date, "11/04")).toEqual({ error: CUSTOM_DATE_INVALID_MESSAGE });
  });

  it("엑셀 블록의 빈 숫자 열 · 앱에서 복사한 빈 숫자 · 날짜 칸을 붙여도 오류 셀이 생기지 않는다", () => {
    const columns = [num, date, text];
    const pasteColumns = columns.map((column) => customFieldPasteColumn<object>(column, () => true));
    for (const clipboardText of ["\t2026-11-04\tLED", "—\t—\t—"]) {
      const { cells } = applyPaste({ clipboardText, columns: pasteColumns, rows: [{}], activeRowIndex: 0, activeColIndex: 0 });
      const judged = cells.map((cell) => {
        const column = columns.find((candidate) => pasteColumns[columns.indexOf(candidate)]!.key === cell.columnKey)!;
        return cell.result.status === "ok" ? customFieldPasteInput(column, cell.result.value) : { error: cell.result.reason };
      });
      expect(judged.every((result) => "value" in result)).toBe(true);
    }
  });
});

type Line = Parameters<typeof resolvedConflictLine>[0];

function conflictedLine(): Line {
  const baseline = {
    subcategory: "print",
    itemName: "배너",
    vendorId: null,
    quantity: 1,
    unitPriceAmountKrw: 1000,
    executionAmountKrw: 0,
    lineStatus: "not_started",
    note: null,
  };
  return {
    clientKey: "line-1",
    id: "line-1",
    lineKind: "quote",
    version: 1,
    subcategory: "print",
    itemName: "배너",
    vendorId: null,
    quantity: 1,
    days: 1,
    unitPriceAmount: 1000,
    unitPriceCurrency: "KRW",
    unitPriceFxRate: 1,
    unitPriceFxRateTouched: false,
    unitPriceAmountKrw: 1000,
    executionAmount: 0,
    quoteAmountKrw: 1000,
    profitKrw: 1000,
    lineStatus: "not_started",
    note: null,
    clientRemark: null,
    midCategory: null,
    majorCategory: null,
    dirty: true,
    baseline,
    cellErrors: {},
    cellConflicts: {
      itemName: { field: "itemName", reason: "다른 사람이 이 줄을 바꿈 · 덮어쓰기 / 그 값으로", theirRaw: "배너", theirVersion: 2 },
    },
    cells: {} as Line["cells"],
    hasLinkedDocuments: false,
    readonlyReason: null,
    linkedStatus: null,
    prepaidOverdueDays: null,
    hasCardSideLinks: false,
    executionOverKrw: null,
    // 내가 추가 칸 X만 고쳤다(동료도 X를 고쳐 먼저 저장 → 폴백 「항목」 충돌).
    customFields: { cf_text0001: "내 값" },
    customFieldsBase: { cf_text0001: "처음 값" },
  };
}

describe("SF-2 추가 칸만의 경합 — 폴백 「항목」 충돌 해소", () => {
  it("「그 값으로」는 내 추가 칸 편집을 기준값으로 되돌려 다음 저장이 상대 값을 덮지 않는다", () => {
    const resolved = resolvedConflictLine(conflictedLine(), "itemName", "theirs");
    expect(resolved.customFields).toEqual({ cf_text0001: "처음 값" });
    expect(resolved.version).toBe(2);
    expect(resolved.dirty).toBe(false);
    expect(resolved.cellConflicts).toEqual({});
  });

  it("진짜 항목 충돌(상대가 항목을 바꿈)의 「그 값으로」는 항목만 받고 내 추가 칸 편집은 남긴다", () => {
    const line = conflictedLine();
    const real: Line = {
      ...line,
      itemName: "내 배너",
      cellConflicts: { itemName: { field: "itemName", reason: "다른 사람이 14:01에 현수막으로 바꿈 · 덮어쓰기 / 그 값으로", theirRaw: "현수막", theirVersion: 2 } },
    };
    const resolved = resolvedConflictLine(real, "itemName", "theirs");
    expect(resolved.itemName).toBe("현수막");
    expect(resolved.customFields).toEqual({ cf_text0001: "내 값" });
    expect(resolved.dirty).toBe(true);
  });

  it("「덮어쓰기」는 내 추가 칸 편집을 남긴다", () => {
    const resolved = resolvedConflictLine(conflictedLine(), "itemName", "mine");
    expect(resolved.customFields).toEqual({ cf_text0001: "내 값" });
    expect(resolved.version).toBe(2);
    expect(resolved.dirty).toBe(true);
  });
});
