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
  primaryAction?: { label: string; href: string };
  /** 필터 줄 왼쪽. */
  filters?: ReactNode;
  /** 표(`Table`)나 필터 빈 화면. */
  children: ReactNode;
  /** `SidePanel` — 열린 동안에도 목록은 그대로 그려진다(뒤는 네이티브 모달이 막는다). */
  panel?: ReactNode;
};

export function ListScreen({ title, primaryAction, filters, children, panel }: ListScreenProps) {
  return (
    <div className={styles.screen}>
      {/* tabIndex -1 — 연 요소가 사라진 뒤 포커스를 받을 자리(패널 닫기 복귀). 탭 순서에는 넣지 않는다. */}
      <h1 data-ui="screen-title" tabIndex={-1} className={styles.title}>
        {title}
      </h1>
      {filters || primaryAction ? (
        <div className={styles.bar}>
          <div className={styles.filters}>{filters}</div>
          {primaryAction ? (
            <Link
              href={primaryAction.href}
              scroll={false}
              data-ui="primary-button"
              className={`${buttonStyles.btn} ${buttonStyles.primary}`}
            >
              {primaryAction.label}
              <LinkPending />
            </Link>
          ) : null}
        </div>
      ) : null}
      {children}
      {panel}
    </div>
  );
}
