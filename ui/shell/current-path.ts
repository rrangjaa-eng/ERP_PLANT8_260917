// WR-01(02-REVIEW.md) — pathname ↔ 메뉴 href 현재 여부 순수 함수. import 없음.
// 역할 데이터(role-menu.ts)와 섞지 않는다 — 그 파일은 D-23의 「역할 → 메뉴
// 매핑 한 곳」이고 이것은 경로 판정이다.
export function isCurrentPath(pathname: string | null, href: string): boolean {
  if (pathname === null) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
