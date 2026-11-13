// domain/custom-fields/access-rules.ts — 07.5-01: 추가 칸 목록 규칙(순수 — import는 타입만, 서버 · 클라이언트 어디서나 import).
// 칸 집합(보이는 활성 칸)은 access.ts의 readCustomFieldInputs가 만들고, 이 파일은 그 집합에서 열 · 검색 키 · 거르개를 고른다.
// 입력 배열은 정렬 순서(sortOrder, key) 그대로 온다 — 열 · 거르개 · 검색 키 순서가 매번 같다.
import type { InputFieldDef } from "@/domain/custom-fields/preserve";

/** 목록 열 상한(UI-SPEC A8) — 4번째 칸부터는 열이 아니고 검색(텍스트) · CSV에만 든다. */
export const CUSTOM_FIELD_COLUMN_LIMIT = 3;
/** 필터 줄 거르개 상한(UI-SPEC A8). */
export const CUSTOM_FIELD_FILTER_LIMIT = 2;

type ListedDef = Pick<InputFieldDef, "key" | "type">;
type FilterDef = ListedDef & Pick<InputFieldDef, "options">;

export function customFieldListColumns<T extends ListedDef>(defs: readonly T[]): T[] {
  return defs.slice(0, CUSTOM_FIELD_COLUMN_LIMIT);
}

export function customTextSearchKeys(defs: readonly ListedDef[]): string[] {
  return defs.filter((def) => def.type === "text").map((def) => def.key);
}

export function customFieldFilterDefs<T extends ListedDef>(defs: readonly T[]): T[] {
  return defs.filter((def) => def.type === "select").slice(0, CUSTOM_FIELD_FILTER_LIMIT);
}

// 입출력 키는 정의 키 그대로(`cf_` 접두는 URL · 폼 이름에서만 — page가 벗긴다). 모르는 키 · 활성 선택지 밖 값 · 빈 값은 버린다.
export function parseCustomFieldFilters(raw: Readonly<Record<string, string>>, filterDefs: readonly FilterDef[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const def of filterDefs) {
    const value = raw[def.key];
    if (value !== undefined && value !== "" && (def.options ?? []).includes(value)) parsed[def.key] = value;
  }
  return parsed;
}
