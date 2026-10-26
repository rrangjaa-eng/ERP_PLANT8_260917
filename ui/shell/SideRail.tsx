import type { MenuLink } from "./role-menu";
import styles from "./SideRail.module.css";

// SYSTEM.md §6-0 왼쪽 레일의 공통 조각. ≥1280 고정 레일(TopBar.tsx의 header 안)과 700–1279 가림 레일
// (RailSheet.tsx의 dialog)이 같은 조각을 그린다 — 항목은 role-menu.ts 결과만 받는다(D-23).
// tokens.css의 1280 경계와 같은 값이다.
export const RAIL_MEDIA = "(min-width: 1280px)";

export function RailSearchRow() {
  return (
    <span className={styles.searchRow} aria-disabled="true">
      검색
      <kbd className={styles.kbd}>Ctrl+K</kbd>
    </span>
  );
}

type RailNavProps = {
  items: MenuLink[];
  /** currentHref(pathname, items.map(href)) 결과 — 가장 긴 href 일치 하나. */
  current: string | null;
  onNavigate?: () => void;
  className?: string;
};

export function RailNav({ items, current, onNavigate, className }: RailNavProps) {
  return (
    <nav aria-label="주 메뉴" className={className}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={styles.link}
          aria-current={item.href === current ? "page" : undefined}
          onClick={onNavigate}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

type RailAdminLinkProps = { items: MenuLink[]; onNavigate?: () => void };

export function RailAdminLink({ items, onNavigate }: RailAdminLinkProps) {
  const item = items[0];
  if (!item) return null;
  return (
    <a href={item.href} className={styles.link} onClick={onNavigate}>
      {item.label}
    </a>
  );
}
