import Link from "next/link";
import type { VendorSide } from "@/domain/vendors/kind";
import styles from "./vendors.module.css";

// 07-20 V2 · SYSTEM §6-1 필터 줄: 검색 칸이 맨 앞(GET `?q=` · Enter 제출) — 숨김 · 갈래는 숨은 칸으로 지킨다.
// 필터 줄 칸이라 관리자 폼 ui/ 이관 계수(07-08 N10 · SC-15)에서 뺀다 — 지출결의 status-filter · 프로젝트 filter-bar와 같은 꼴.
export function VendorSearch({
  query,
  includeHidden,
  kind,
  clearHref,
}: {
  query: string;
  includeHidden: boolean;
  kind: VendorSide | null;
  clearHref: string;
}) {
  return (
    <form method="get" action="/admin/vendors" role="search" className={styles.searchForm}>
      {includeHidden ? <input type="hidden" name="includeHidden" value="1" /> : null}
      {kind ? <input type="hidden" name="kind" value={kind} /> : null}
      <label htmlFor="vendor-search" className={styles.searchLabel}>
        검색
      </label>
      <div className={styles.searchRow}>
        {/* 무엇으로 찾는지는 칸 안 글자 한 줄(SC-16 `거래처 이름·사업자 번호`) — 라벨은 지출결의 검색 칸과 같은 `검색`(패널 `이름` 칸과 라벨이 겹치지 않게). */}
        <input
          key={query}
          id="vendor-search"
          name="q"
          type="search"
          className={styles.searchInput}
          defaultValue={query}
          placeholder="거래처 이름·사업자 번호"
          autoComplete="off"
        />
        {query !== "" ? (
          <Link href={clearHref} scroll={false} className={styles.toggle}>
            지우기
          </Link>
        ) : null}
      </div>
    </form>
  );
}
