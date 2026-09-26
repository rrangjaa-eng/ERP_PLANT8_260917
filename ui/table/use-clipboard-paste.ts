"use client";

import { useCallback } from "react";
import { parseTsv, normalizeNumericPaste } from "./parse-tsv";
import { MAX_DECIMALS, numberInputRejectionReason, type NumberInputKind } from "@/lib/format-number";
import type { TableColumn } from "./types";

// SYSTEM.md §7-3 보강 (다) — 붙여넣기 반영. `parseTsv`로 읽은 값을 활성
// 셀부터 오른쪽·아래로 채운다. 숫자 열은 정규화 실패 시, 목록(select) 열은
// 옵션 라벨 불일치 시, 읽기 전용·잠김 셀은 무조건 **오류 셀로 고정**한다
// — 조용히 버리지 않는다(§7-3 "이 표에서 가장 비싼 실패"). 아래로 넘치면
// 새 줄이 필요한 개수만, 오른쪽으로 넘치면 버린 칸 수만 센다(합계 행 경고).

export type PasteColumnKind = "text" | "number" | "select";

/** 04-47 — 앱 전용 클립보드 형식(04-19 격자 복사 · 04-24 이전 차수 복사가 싣는다). */
export const APP_CLIPBOARD_FORMAT = "application/x-plant8-quote-lines+json";

/** 붙여넣기 이벤트의 글자와 앱 전용 형식(없으면 null — 엑셀·다른 프로그램). */
export function readPasteClipboard(data: Pick<DataTransfer, "types" | "getData">): { text: string; appMeta: string | null } {
  const types = Array.from(data.types);
  return { text: data.getData("text/plain"), appMeta: types.includes(APP_CLIPBOARD_FORMAT) ? data.getData(APP_CLIPBOARD_FORMAT) : null };
}

// 앱 형식은 줄마다 `{ currency }`(04-24 quoteLineClipboardMeta)다. 읽지 못하거나 줄 수가 다르면 앱 형식 없음과 같다(T-04-172).
function readSourceCurrencies(appMeta: string | null | undefined, rowCount: number): string[] | null {
  if (!appMeta) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(appMeta);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== rowCount) return null;
  const currencies = parsed.map((entry: unknown) =>
    typeof entry === "object" && entry !== null && "currency" in entry && typeof entry.currency === "string" ? entry.currency : null,
  );
  return currencies.every((currency): currency is string => currency !== null) ? currencies : null;
}

// /qa ISSUE-003 (a) — 앱 형식 줄의 종류(`kind`, 04-47 quoteLineClipboardMeta). 줄마다 없으면 null.
function readSourceKinds(appMeta: string, rowCount: number): (string | null)[] {
  const parsed: unknown = JSON.parse(appMeta);
  const entries = Array.isArray(parsed) ? parsed : [];
  return Array.from({ length: rowCount }, (_, index) => {
    const entry: unknown = entries[index];
    return typeof entry === "object" && entry !== null && "kind" in entry && typeof entry.kind === "string" ? entry.kind : null;
  });
}

export type PasteColumn<Row> = {
  key: string;
  kind: PasteColumnKind;
  /** kind === "select"일 때만 — 옵션 라벨/값과 대조한다. */
  options?: { value: string; label: string }[];
  /** kind === "number"일 때 — 셀 편집기와 같은 소수 자리 상한을 붙여넣기에도 적용한다. */
  numberKind?: NumberInputKind;
  /** 기존 행, 그리고 newRow가 있으면 붙여넣기로 새로 생길 행(newRow)에 호출된다. */
  isEditable: (row: Row) => boolean;
  /** 04-47(ENG-D5) — 계산 열(`computed`)은 앱에서 복사한 붙여넣기일 때만 값을 넣지 않고 무시해 센다. 기본 `input`. */
  pasteRole?: TableColumn<Row>["pasteRole"];
};

export type PasteCellResult = { status: "ok"; value: string } | { status: "error"; reason: string };

export type PasteCell = { rowIndex: number; columnKey: string; result: PasteCellResult };

export type ApplyPasteResult = {
  /** rowIndex는 붙여넣기 시작 시점의 rows 배열 기준(새 행은 rows.length 이상). */
  cells: PasteCell[];
  /** 표 아래를 넘어 자동으로 만들어야 하는 새 줄 수. */
  newRowsNeeded: number;
  /** 표 오른쪽을 넘어 버린 칸 수(전체 붙여넣기 범위 기준, 열 수가 아니다). */
  droppedColumnCount: number;
  /** 04-47 — 붙여넣기 출처(앱 전용 형식이 실렸으면 app). */
  source: "app" | "external";
  /** 04-47 — 앱 출처에서 값을 넣지 않고 소비한 계산 열 칸 수. */
  ignoredComputedCells: number;
  /** 04-47 — 앱 형식의 줄별 통화(없으면 null). */
  sourceCurrencies: string[] | null;
  /** /qa ISSUE-003 — 앱 형식의 줄별 종류(앱 형식이 없으면 null, 줄에 종류가 없으면 그 칸 null). */
  sourceKinds: (string | null)[] | null;
  /** 04-47 — 붙여넣은 줄 수. */
  rowCount: number;
};

export function applyPaste<Row>(params: {
  clipboardText: string;
  columns: PasteColumn<Row>[];
  rows: Row[];
  activeRowIndex: number;
  activeColIndex: number;
  /** 붙여넣기로 새로 생길 줄의 모양 — 없으면 새 줄은 모든 칸이 편집 가능하다. 함수면 원본 줄 종류(sourceKinds)로 묻는다. */
  newRow?: Row | ((sourceKind: string | null) => Row);
  /** 04-47 — 앱 전용 형식 원문(`readPasteClipboard`, 없으면 null). */
  appMeta?: string | null;
}): ApplyPasteResult {
  const { clipboardText, columns, rows, activeRowIndex, activeColIndex, newRow } = params;
  // 04-47 — 앱 형식 줄 수가 끝 줄바꿈을 떼기 전 줄 수와 같으면 떼지 않는다(마지막 줄이 빈 칸인 앱 복사 `x\n`).
  const whole = parseTsv(clipboardText, { keepTrailingNewline: true });
  const wholeCurrencies = readSourceCurrencies(params.appMeta, whole.length);
  const parsed = wholeCurrencies ? whole : parseTsv(clipboardText);
  const cells: PasteCell[] = [];
  let droppedColumnCount = 0;
  let ignoredComputedCells = 0;
  const sourceCurrencies = wholeCurrencies ?? readSourceCurrencies(params.appMeta, parsed.length);
  const source = sourceCurrencies ? "app" : "external";
  const sourceKinds = sourceCurrencies && params.appMeta ? readSourceKinds(params.appMeta, parsed.length) : null;

  const lastRowIndex = activeRowIndex + parsed.length - 1;
  const newRowsNeeded = Math.max(0, lastRowIndex - (rows.length - 1));

  parsed.forEach((pastedRow, rOffset) => {
    const rowIndex = activeRowIndex + rOffset;
    // 붙여넣기로 새로 생기는 줄은 newRow로 묻는다 — newRow가 없으면 undefined(항상 편집 가능).
    const row: Row | undefined =
      rowIndex < rows.length ? rows[rowIndex] : typeof newRow === "function" ? (newRow as (sourceKind: string | null) => Row)(sourceKinds?.[rOffset] ?? null) : newRow;

    pastedRow.forEach((rawValue, cOffset) => {
      const colIndex = activeColIndex + cOffset;
      if (colIndex >= columns.length) {
        droppedColumnCount++;
        return;
      }
      const column = columns[colIndex]!;
      if (source === "app" && column.pasteRole === "computed") {
        ignoredComputedCells++;
        return;
      }
      const editable = row ? column.isEditable(row) : true;
      const trimmed = rawValue.trim();

      if (!editable) {
        cells.push({
          rowIndex,
          columnKey: column.key,
          result: { status: "error", reason: "읽기 전용·잠김 셀에 값 떨어짐" },
        });
        return;
      }

      if (column.kind === "number") {
        const num = normalizeNumericPaste(rawValue);
        const tooPrecise = num !== null && column.numberKind !== undefined && Number(num.toFixed(MAX_DECIMALS[column.numberKind])) !== num;
        cells.push(
          num === null
            ? { rowIndex, columnKey: column.key, result: { status: "error", reason: "숫자 형식 오류 · 12,400,000처럼" } }
            : tooPrecise && column.numberKind
              ? { rowIndex, columnKey: column.key, result: { status: "error", reason: numberInputRejectionReason(column.numberKind, column.numberKind === "krw" ? "krw-fraction" : "precision") } }
              : { rowIndex, columnKey: column.key, result: { status: "ok", value: String(num) } },
        );
        return;
      }

      if (column.kind === "select") {
        const match = column.options?.find((option) => option.label === trimmed || option.value === trimmed);
        cells.push(
          match
            ? { rowIndex, columnKey: column.key, result: { status: "ok", value: match.value } }
            : {
                rowIndex,
                columnKey: column.key,
                result: { status: "error", reason: `목록에 없는 값 · ${trimmed || "(빈 값)"}` },
              },
        );
        return;
      }

      cells.push({ rowIndex, columnKey: column.key, result: { status: "ok", value: trimmed } });
    });
  });

  return { cells, newRowsNeeded, droppedColumnCount, source, ignoredComputedCells, sourceCurrencies, sourceKinds, rowCount: parsed.length };
}

export type UseClipboardPasteParams<Row> = {
  columns: PasteColumn<Row>[];
  rows: Row[];
  onResult: (result: ApplyPasteResult) => void;
};

/**
 * 표 요소에 붙이는 네이티브 paste 이벤트 핸들러. 활성 셀 좌표는 호출부가
 * (roving tabindex의 focus 좌표를) 넘긴다 — 이 훅은 클립보드 텍스트를
 * 읽고 applyPaste로 위임할 뿐 좌표 상태를 직접 갖지 않는다.
 */
export function useClipboardPaste<Row>({ columns, rows, onResult }: UseClipboardPasteParams<Row>) {
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLElement>, activeRowIndex: number, activeColIndex: number) => {
      const text = event.clipboardData?.getData("text/plain");
      if (text === undefined || text === "") return;
      event.preventDefault();
      const result = applyPaste({ clipboardText: text, columns, rows, activeRowIndex, activeColIndex });
      onResult(result);
    },
    [columns, rows, onResult],
  );

  return { handlePaste };
}
