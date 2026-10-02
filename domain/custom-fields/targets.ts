// 04.5-08: 화면 항목(커스텀 칸)의 대상 등록부 · 노출표 항목 키 규약 · 길이·개수 상한 · 정렬 기본값.
// 다른 모듈을 import하지 않는 순수 모듈 — 클라이언트 폼도 이 파일을 import한다.
export const FIELD_DEFINITION_TARGETS = ["vendor"] as const;
export type FieldDefinitionTarget = (typeof FIELD_DEFINITION_TARGETS)[number];

export const FIELD_NAME_MAX = 20;
export const OPTION_MAX_LENGTH = 40;
export const ACTIVE_OPTIONS_MAX = 30;
export const SORT_ORDER_MAX = 999;

const INFO_ITEM_PREFIX = "cf";

// 정보 노출표 항목 키 `cf.<entity>.<key>` — INFO_ITEMS의 키는 `cf.`로 시작하지 않는다(키 공간 분리).
export function customFieldInfoItem(entity: string, key: string): string {
  return `${INFO_ITEM_PREFIX}.${entity}.${key}`;
}

export function parseCustomFieldInfoItem(item: string): { entity: string; key: string } | null {
  const parts = item.split(".");
  const [prefix, entity, key] = parts;
  if (parts.length !== 3 || prefix !== INFO_ITEM_PREFIX || !entity || !key) return null;
  return { entity, key };
}

// 등록 폼의 정렬 순서 기본값 = min(활성 최대값 + 1, 999), 활성 정의가 없으면 1.
export function nextSortOrder(activeSortOrders: readonly number[]): number {
  if (activeSortOrders.length === 0) return 1;
  return Math.min(Math.max(...activeSortOrders) + 1, SORT_ORDER_MAX);
}
