// 07.5-03(S4) — 견적 표 추가 칸 셀의 순수 함수(서버 모듈 import 없음). 줄 초안의 추가 칸 값은 편집 원문 글자이고(eng B-7 —
// 날짜 앞 10자 · 숫자 쉼표 없는 글자), 쉼표 · `(보관됨)`은 셀 표시에서만 붙는다. 문구는 서버 상수 그대로(UI-SPEC A18).
import { CUSTOM_DATE_INVALID_MESSAGE, isStrictIsoDate } from "@/domain/custom-fields/build-schema";
import type { QuoteLineFieldDefinitionDto } from "@/domain/quotes/lines";
import { formatQuantity } from "@/lib/format-number";
import { customFieldDefaultValue } from "@/ui/custom-field/CustomFieldInput";

export type QuoteLineCustomColumn = QuoteLineFieldDefinitionDto;

const COLUMN_PREFIX = "cf_";

/** 표 열 · 붙여넣기 열 · 거부 셀 · 미저장 보관이 같이 쓰는 열 키(서버 거부 셀 field와 같은 글자). */
export function customColumnKey(key: string): string {
  return `${COLUMN_PREFIX}${key}`;
}

export function customFieldKeyOf(columnKey: string): string | null {
  return columnKey.startsWith(COLUMN_PREFIX) ? columnKey.slice(COLUMN_PREFIX.length) : null;
}

/** DTO 값(칸별로 걸러진 저장값)을 열마다 편집 원문으로 — 값이 없으면 빈 글자. */
export function customFieldEditValues(columns: readonly QuoteLineCustomColumn[], values: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(columns.map((column) => [column.key, customFieldDefaultValue(column, values?.[column.key])]));
}

function archivedOption(column: QuoteLineCustomColumn, raw: string): boolean {
  return column.type === "select" && raw !== "" && !column.options.includes(raw);
}

/** 셀 · 행 시트 글자 — 숫자는 수량 꼴(D-7519), 보관 선택지는 `{값} (보관됨)`, 없음은 `—`. */
export function customFieldCellText(column: QuoteLineCustomColumn, raw: string): string {
  if (raw === "") return "—";
  if (column.type === "number") {
    const value = Number(raw);
    return Number.isFinite(value) ? formatQuantity(value) : raw;
  }
  return archivedOption(column, raw) ? `${raw} (보관됨)` : raw;
}

/** Ctrl+C TSV 글자 = 화면 글자. 보관 선택지는 값 글자만(붙여 넣으면 그 값으로 찾는다). */
export function customFieldCopyText(column: QuoteLineCustomColumn, raw: string): string {
  return archivedOption(column, raw) ? raw : customFieldCellText(column, raw);
}

/** 날짜 셀 입력 · 붙여넣기 판정(D-7521) — 앞뒤 공백 제거 뒤 빈 글자는 비움, 엄격 YYYY-MM-DD만 값. */
export function customFieldDateInput(raw: string): { value: string } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "" || isStrictIsoDate(trimmed)) return { value: trimmed };
  return { error: CUSTOM_DATE_INVALID_MESSAGE };
}

/** 복제 원문(D-7518 · eng B-12) — 새 줄은 등록 판정이라 보관 선택지 값은 뺀다. */
export function customFieldDuplicateValues(columns: readonly QuoteLineCustomColumn[], values: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(columns.map((column) => {
    const raw = values[column.key] ?? "";
    return [column.key, archivedOption(column, raw) ? "" : raw];
  }));
}

/** 폰 행 시트 항목 — 열 순서 그대로, 읽기 전용. */
export function customFieldSheetItems(columns: readonly QuoteLineCustomColumn[], values: Readonly<Record<string, string>>): { label: string; value: string }[] {
  return columns.map((column) => ({ label: column.label, value: customFieldCellText(column, values[column.key] ?? "") }));
}
