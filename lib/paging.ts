// 쪽 번호 보정 · 쪽 수 · 쪽 크기 — 목록(04-17) · 견적 표(04-19 ui/table) ·
// 리저브 대장(04-07, 그룹 B) 공용(엔지 리뷰 C §1 P3 — 세 번 따로 만들지 않는다).
export const LIST_PAGE_SIZE = 50;
export const QUOTE_TABLE_PAGE_SIZE = 30;

// 범위 밖·형식 오류 쪽 번호를 1쪽 또는 마지막 쪽으로 보정한다.
export function clampPage(raw: string | number | undefined, pageCount: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (raw === undefined || !Number.isInteger(n) || n < 1) return 1;
  const max = Math.max(pageCount, 1);
  return Math.min(n, max);
}

export function pageCountFrom(total: number, pageSize: number): number {
  if (total <= 0) return 0;
  return Math.ceil(total / pageSize);
}
