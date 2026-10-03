import { statusKind, type StatusKind, type StatusWord } from "./status-map";
import styles from "./StatusTag.module.css";

// SYSTEM.md §7-5 상태 태그. 색은 의미 토큰 하나 — 문장이 아니라 두~네 글자
// 명사(호출부 규약, 아래 참고).
export type StatusTagKind = StatusKind;

// §7-5: 테두리 태그는 「내 차례」와 화면 제목 옆에서만. 표 상태 열에서는 태그
// 대신 색 글자만(변형 "text") — 배경·테두리 없음.
export type StatusTagVariant = "tag" | "text";

type StatusTagBase = {
  /** 기본값 "tag"(테두리). 표 상태 열에서는 "text"(색 글자만)를 쓴다. */
  variant?: StatusTagVariant;
  className?: string;
};

export type StatusTagProps = StatusTagBase & {
  /**
   * 상태 낱말 — 글자이자 색의 열쇠다. 색은 `status-map.ts` 한 표가 정하고 표 밖 낱말은 타입 오류다(SC 9).
   * 두~네 글자 명사만 받는다: "막힘" "오늘" "결재" "대기" "승인" "반려" "편집 중".
   */
  status: StatusWord;
};

export function StatusTag({ status, variant = "tag", className }: StatusTagProps) {
  return (
    <span
      className={[styles.base, styles[statusKind(status)], variant === "text" ? styles.text : styles.tag, className]
        .filter(Boolean)
        .join(" ")}
    >
      {status}
    </span>
  );
}
