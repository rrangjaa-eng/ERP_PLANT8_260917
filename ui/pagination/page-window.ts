// SYSTEM.md §7-16 「생략」 규칙의 순수 계산 — 컴포넌트(Pagination.tsx)는 이
// 함수가 돌려준 창을 렌더만 한다(계산하지 않는다).
export type PageWindowItem = number | "gap";

const WIDE_THRESHOLD = 7;
const COMPACT_THRESHOLD = 5;

// PC: 7쪽 이하면 전부, 8쪽 이상이면 첫·끝·현재 ±1과 사이 "gap".
// 폰(compact): 5쪽 이하면 전부, 6쪽부터 첫·현재·끝과 사이 "gap"(엔지 리뷰 C P3).
// 두 모드 모두 건너뛸 쪽이 정확히 하나면 "gap" 대신 그 번호를 보인다(C-27).
export function pageWindow(
  page: number,
  pageCount: number,
  opts?: { compact?: boolean },
): PageWindowItem[] {
  const compact = opts?.compact ?? false;
  const threshold = compact ? COMPACT_THRESHOLD : WIDE_THRESHOLD;
  const near = compact ? 0 : 1;

  if (pageCount <= threshold) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const core = new Set<number>([1, pageCount, page]);
  for (let d = 1; d <= near; d++) {
    if (page - d >= 1) core.add(page - d);
    if (page + d <= pageCount) core.add(page + d);
  }
  const sorted = Array.from(core).sort((a, b) => a - b);

  const items: PageWindowItem[] = [];
  sorted.forEach((n, i) => {
    if (i > 0) {
      const prev = sorted[i - 1]!;
      const gapSize = n - prev - 1;
      if (gapSize === 1) {
        items.push(prev + 1);
      } else if (gapSize > 1) {
        items.push("gap");
      }
    }
    items.push(n);
  });
  return items;
}

const numberFormat = new Intl.NumberFormat("ko-KR");

export function pageRangeText({
  page,
  pageSize,
  total,
  unit,
}: {
  page: number;
  pageSize: number;
  total: number;
  unit: string;
}): string {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `${numberFormat.format(start)}–${numberFormat.format(end)} / ${numberFormat.format(total)}${unit}`;
}
