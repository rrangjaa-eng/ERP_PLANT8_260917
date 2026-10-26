// WR-01(02-REVIEW.md) — pathname ↔ 메뉴 href 현재 여부 순수 함수. import 없음.
// 역할 데이터(role-menu.ts)와 섞지 않는다 — 그 파일은 D-23의 「역할 → 메뉴
// 매핑 한 곳」이고 이것은 경로 판정이다.
export function isCurrentPath(pathname: string | null, href: string): boolean {
  if (pathname === null) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// 한 목록 안에서 pathname과 맞는 href 중 가장 긴 하나만 현재다 — 접두가 겹치는 메뉴
// (/expenses ⊂ /expenses/evidence)가 함께 켜지지 않게 한다. 맞는 것이 없으면 null.
export function currentHref(pathname: string | null, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (isCurrentPath(pathname, href) && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
