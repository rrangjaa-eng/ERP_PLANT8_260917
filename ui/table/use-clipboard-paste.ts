"use client";

import { useCallback } from "react";
import { parseTsv, normalizeNumericPaste } from "./parse-tsv";
import { MAX_DECIMALS, numberInputRejectionReason, type NumberInputKind } from "@/lib/format-number";

// SYSTEM.md §7-3 보강 (다) — 붙여넣기 반영. `parseTsv`로 읽은 값을 활성
// 셀부터 오른쪽·아래로 채운다. 숫자 열은 정규화 실패 시, 목록(select) 열은
// 옵션 라벨 불일치 시, 읽기 전용·잠김 셀은 무조건 **오류 셀로 고정**한다
// — 조용히 버리지 않는다(§7-3 "이 표에서 가장 비싼 실패"). 아래로 넘치면
// 새 줄이 필요한 개수만, 오른쪽으로 넘치면 버린 칸 수만 센다(합계 행 경고).

export type PasteColumnKind = "text" | "number" | "select";

export type PasteColumn<Row> = {
  key: string;
  kind: PasteColumnKind;
  /** kind === "select"일 때만 — 옵션 라벨/값과 대조한다. */
  options?: { value: string; label: string }[];
  /** kind === "number"일 때 — 셀 편집기와 같은 소수 자리 상한을 붙여넣기에도 적용한다. */
  numberKind?: NumberInputKind;
  /** 기존 행, 그리고 newRow가 있으면 붙여넣기로 새로 생길 행(newRow)에 호출된다. */
  isEditable: (row: Row) => boolean;
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
};

export function applyPaste<Row>(params: {
  clipboardText: string;
  columns: PasteColumn<Row>[];
  rows: Row[];
  activeRowIndex: number;
  activeColIndex: number;
  /** 붙여넣기로 새로 생길 줄의 모양 — 없으면 새 줄은 모든 칸이 편집 가능하다. */
  newRow?: Row;
}): ApplyPasteResult {
  const { clipboardText, columns, rows, activeRowIndex, activeColIndex, newRow } = params;
  const parsed = parseTsv(clipboardText);
  const cells: PasteCell[] = [];
  let droppedColumnCount = 0;

  const lastRowIndex = activeRowIndex + parsed.length - 1;
  const newRowsNeeded = Math.max(0, lastRowIndex - (rows.length - 1));

  parsed.forEach((pastedRow, rOffset) => {
    const rowIndex = activeRowIndex + rOffset;
    // 붙여넣기로 새로 생기는 줄은 newRow로 묻는다 — newRow가 없으면 undefined(항상 편집 가능).
    const row: Row | undefined = rowIndex < rows.length ? rows[rowIndex] : newRow;

    pastedRow.forEach((rawValue, cOffset) => {
      const colIndex = activeColIndex + cOffset;
      if (colIndex >= columns.length) {
        droppedColumnCount++;
        return;
      }
      const column = columns[colIndex]!;
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
              ? { rowIndex, columnKey: column.key, result: { status: "error", reason: numberInputRejectionReason(column.numberKind, "precision") } }
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

  return { cells, newRowsNeeded, droppedColumnCount };
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
