import type { ReactNode } from "react";
import styles from "./StatusTag.module.css";

// SYSTEM.md §7-5 상태 태그. 색은 의미 토큰 하나 — 문장이 아니라 두~네 글자
// 명사(호출부 규약, 아래 참고).
export type StatusTagKind = "danger" | "warning" | "accent" | "success" | "muted";

// §7-5: 테두리 태그는 「내 차례」와 화면 제목 옆에서만. 표 상태 열에서는 태그
// 대신 색 글자만(변형 "text") — 배경·테두리 없음.
export type StatusTagVariant = "tag" | "text";

export type StatusTagProps = {
  kind: StatusTagKind;
  /** 기본값 "tag"(테두리). 표 상태 열에서는 "text"(색 글자만)를 쓴다. */
  variant?: StatusTagVariant;
  className?: string;
  /**
   * 두~네 글자 명사만 받는다: "막힘" "오늘" "결재" "대기" "승인" "반려" "편집 중".
   * 문장을 넣지 않는다 — 이 컴포넌트는 값을 그대로 렌더만 하고 길이를 강제하지
   * 않으므로 호출부가 이 규약을 지킨다.
   */
  children: ReactNode;
};

export function StatusTag({ kind, variant = "tag", className, children }: StatusTagProps) {
  return (
    <span
      className={[styles.base, styles[kind], variant === "text" ? styles.text : styles.tag, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
