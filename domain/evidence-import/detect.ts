import { cellText } from "@/domain/evidence-import/cells";
import type { Container, DetectResult, FormatRule, Rows, SheetPreview } from "@/domain/evidence-import/types";

// 06.1-02: 시트 · 머리줄 찾기. 판별은 시트 이름과 앞 6줄만 본다(1차 읽기 `sheetRows: 6`).

export const DETECT_ROWS = 6;
// 카드 서식은 머리줄을 1~5줄에서 찾는다(롯데는 1줄이 병합 제목).
const CARD_HEADER_SCAN = 5;

export function columnIndex(header: readonly unknown[], name: string): number {
  return header.findIndex((cell) => cellText(cell) === name);
}

export function rowHasAll(row: readonly unknown[], names: readonly string[]): boolean {
  return names.every((name) => columnIndex(row, name) >= 0);
}

// 카드 서식: 첫 시트의 1~5줄에서 `isHeader`가 참인 줄. 카드 파일은 시트 하나라 첫 시트만 본다.
export function findCardHeader(sheets: readonly SheetPreview[], isHeader: (row: readonly unknown[]) => boolean): DetectResult {
  const rows: Rows = sheets[0]?.rows ?? [];
  const scan = Math.min(CARD_HEADER_SCAN, rows.length);
  for (let at = 0; at < scan; at++) {
    if (isHeader(rows[at] ?? [])) return { match: true, sheetIndex: 0, headerRow: at };
  }
  return { match: false };
}

export type Detection =
  | { kind: "format"; rule: FormatRule; sheetIndex: number; headerRow: number }
  | { kind: "sales-list" }
  | { kind: "unknown" };

// 등록 서식 중 이 컨테이너를 선언한 것만 판별에 넣는다. 첫 일치가 이긴다(판별 낱말이 서로 겹치지 않는다).
export function detectFormat(formats: readonly FormatRule[], sheets: readonly SheetPreview[], container: Container): Detection {
  let salesList = false;
  for (const rule of formats) {
    if (!rule.containers.includes(container)) continue;
    const found = rule.detect(sheets, container);
    if (found.match) return { kind: "format", rule, sheetIndex: found.sheetIndex, headerRow: found.headerRow };
    if (found.salesList) salesList = true;
  }
  return salesList ? { kind: "sales-list" } : { kind: "unknown" };
}
