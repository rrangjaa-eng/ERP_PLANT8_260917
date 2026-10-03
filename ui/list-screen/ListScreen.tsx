import type { ReactNode } from "react";
import Link from "next/link";
import { LinkPending } from "@/ui/link-pending/LinkPending";
// Button.tsx는 클라이언트 모듈이라 서버 컴포넌트가 buttonLinkClassName을 부를 수 없다 — 같은 1차 클래스를 직접 쓴다(pnl 선례).
import buttonStyles from "@/ui/button/Button.module.css";
import styles from "./ListScreen.module.css";

// UI-SPEC 「화면 틀 계약」 ListScreen — 목록 화면 틀. 제목 크기·1차 버튼 모양·패널 자리는 틀이 정하고 화면 파일은 내용만 넣는다.
// 부제 prop은 없다(목록 부제 설명문 삭제). 패널을 여는 링크는 `scroll={false}`로 고정한다 — 목록 스크롤·배치 불변(SC 3).
export type ListScreenProps = {
  title: string;
  /** 필터 줄 오른쪽 끝의 1차 — 패널을 여는 링크(`?new=1`). 최대 하나. */
  primaryAction?: { label: string; href: string; /** 폰(<700)에서 숨김 — 폰은 읽기만인 화면(2026-10-03 사용자 결정). */ phoneHidden?: boolean };
  /** 필터 줄 왼쪽. */
  filters?: ReactNode;
  /** 필터 줄 아래 합계 면(`--surface-base` 1px 면). */
  summary?: ReactNode;
  /** 필터 줄(행동 줄)을 한 열 목록과 같은 720 기둥으로 — 조직(SYSTEM §3 단일 기둥). */
  singleColumn?: boolean;
  /**
   * DR5 A — 등록된 대상이 하나도 없을 때만 넘기는 빈 화면(`ListEmpty` + 등록 행동 하나). 받으면 표 자리에 이것만 그리고 `primaryAction`은 그리지 않는다.
   * 필터 결과 0건은 빈 목록이 아니다 — 그때는 `children`에 필터 빈 화면을 두고 머리 1차를 남긴다.
   */
  empty?: ReactNode;
  /** 표(`Table`)나 필터 빈 화면. */
  children: ReactNode;
  /** 표 아래 페이지 줄. */
  pagination?: ReactNode;
  /** `SidePanel` — 열린 동안에도 목록은 그대로 그려진다(뒤는 네이티브 모달이 막는다). */
  panel?: ReactNode;
};

export function ListScreen({ title, primaryAction, filters, summary, singleColumn, empty, children, pagination, panel }: ListScreenProps) {
  // DR5 A — 빈 목록이면 머리 1차는 빈 화면의 버튼 하나로 갈음한다(규칙을 틀 안에 두어 화면마다 조건을 다시 쓰지 않는다).
  const headAction = empty ? undefined : primaryAction;
  return (
    <div className={styles.screen}>
      {/* tabIndex -1 — 연 요소가 사라진 뒤 포커스를 받을 자리(패널 닫기 복귀). 탭 순서에는 넣지 않는다. */}
      <h1 data-ui="screen-title" tabIndex={-1} className={styles.title}>
        {title}
      </h1>
      {filters || headAction ? (
        <div className={singleColumn ? `${styles.bar} single-column` : styles.bar}>
          <div className={styles.filters}>{filters}</div>
          {headAction ? (
            <Link
              href={headAction.href}
              scroll={false}
              data-ui="primary-button"
              className={`${buttonStyles.btn} ${buttonStyles.primary}${headAction.phoneHidden ? ` ${styles.phoneHidden}` : ""}`}
            >
              {headAction.label}
              <LinkPending />
            </Link>
          ) : null}
        </div>
      ) : null}
      {summary ? <div className={styles.summary}>{summary}</div> : null}
      {empty ?? children}
      {pagination ? <div className={styles.pagination}>{pagination}</div> : null}
      {panel}
    </div>
  );
}
