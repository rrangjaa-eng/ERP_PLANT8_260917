import Link from "next/link";
import { pageWindow } from "./page-window";
import styles from "./Pagination.module.css";

// SYSTEM.md §7-16 페이지 줄 — 목록·리저브·견적 표 공용. 훅 없는 표현
// 컴포넌트라 서버·클라이언트 어디서나 렌더된다.
export type PaginationErrorCounts = Record<number, number>;

// 이동이면 next/link의 Link(§10, 교차 그룹 계약 5 · DR-18), 화면 안 전환이면
// onPageChange(<button>, §10 「이동이면 <a>」의 반대편) — ListEmpty 유니언 선례.
type PaginationNavigation =
  | { href: (page: number) => string }
  | { onPageChange: (page: number) => void };

export type PaginationProps = PaginationNavigation & {
  /** 표 이름 — `<nav aria-label="{label} 페이지">`. */
  label: string;
  page: number;
  pageCount: number;
  /** `pageRangeText`가 만든 범위 문구 — 이 컴포넌트는 계산하지 않는다. */
  rangeText: string;
  /** 쪽 → 오류 칸 수(편집 표 전용). */
  errorCounts?: PaginationErrorCounts;
};

export function Pagination(props: PaginationProps) {
  const { label, page, pageCount, rangeText, errorCounts } = props;

  if (pageCount <= 1) return null;

  function renderNumber(n: number) {
    const errorCount = errorCounts?.[n];
    const accessibleName = errorCount ? `${n}쪽, 오류 ${errorCount}칸` : undefined;
    const content = (
      <>
        {n}
        {errorCount ? <span className={styles.errorCount}> 오류 {errorCount}</span> : null}
      </>
    );

    if (n === page) {
      return (
        <span key={n} aria-current="page" aria-label={accessibleName} className={styles.current}>
          {content}
        </span>
      );
    }

    if ("href" in props) {
      return (
        <Link key={n} href={props.href(n)} aria-label={accessibleName} className={styles.pageLink}>
          {content}
        </Link>
      );
    }
    return (
      <button
        key={n}
        type="button"
        aria-label={accessibleName}
        className={styles.pageLink}
        onClick={() => props.onPageChange(n)}
      >
        {content}
      </button>
    );
  }

  // 넓은 창(PC ≥700)과 폰 창(<700)을 한 <nav> 안에 둘 다 렌더한다 — Pagination.module.css가
  // 700 중단점에서 하나만 보이게 한다(display: none은 접근성 트리·탭 순서에서도 빠져
  // 보이는 목록 하나만 읽힌다, §7-16 DR-33). 범위 글자·이전·다음은 하나씩이라 이 목록
  // 밖에서 공유한다.
  function renderWindow(items: ReturnType<typeof pageWindow>, className: string | undefined) {
    return (
      <span className={className}>
        {items.map((item, i) =>
          item === "gap" ? (
            <span key={`gap-${i}`} className={styles.gap}>
              …
            </span>
          ) : (
            renderNumber(item)
          ),
        )}
      </span>
    );
  }

  function renderNav(direction: "prev" | "next") {
    const target = direction === "prev" ? page - 1 : page + 1;
    if (target < 1 || target > pageCount) return null;
    const text = direction === "prev" ? "이전" : "다음";

    if ("href" in props) {
      return (
        <Link key={direction} href={props.href(target)} className={styles.navLink}>
          {text}
        </Link>
      );
    }
    return (
      <button
        key={direction}
        type="button"
        className={styles.navLink}
        onClick={() => props.onPageChange(target)}
      >
        {text}
      </button>
    );
  }

  return (
    <nav aria-label={`${label} 페이지`} className={styles.pagination}>
      <span className={styles.range}>{rangeText}</span>
      <span className={styles.pages}>
        {renderNav("prev")}
        {renderWindow(pageWindow(page, pageCount), styles.wideWindow)}
        {renderWindow(pageWindow(page, pageCount, { compact: true }), styles.compactWindow)}
        {renderNav("next")}
      </span>
    </nav>
  );
}
