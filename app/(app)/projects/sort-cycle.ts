// 머리글 정렬 3클릭 — 정렬 없음(기본) → 오름차순 → 내림차순 → 초기화(sort·dir를 URL에서 뺀다).
// current는 실제로 쓰는 정렬이라 기본 정렬 열(기간)은 주소에 정렬이 없어도 오름차순이다: 첫 클릭이 내림차순, 두 번째가 초기화.
export function sortHeaderHref(
  filterQuery: string,
  key: string,
  current: { key: string; direction: "asc" | "desc" },
): string {
  const next = new URLSearchParams(filterQuery);
  next.delete("sort");
  next.delete("dir");
  next.delete("page");
  if (current.key !== key) next.set("sort", key);
  else if (current.direction === "asc") {
    next.set("sort", key);
    next.set("dir", "desc");
  }
  const query = next.toString();
  return query ? `/projects?${query}` : "/projects";
}
