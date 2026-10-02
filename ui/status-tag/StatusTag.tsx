import type { ReactNode } from "react";
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

export type StatusTagProps = StatusTagBase &
  (
    | {
        /**
         * 상태 낱말 — 글자이자 색의 열쇠다. 색은 `status-map.ts` 한 표가 정하고 표 밖 낱말은 타입 오류다(SC 9).
         * 두~네 글자 명사만 받는다: "막힘" "오늘" "결재" "대기" "승인" "반려" "편집 중".
         */
        status: StatusWord;
        kind?: never;
        children?: never;
      }
    | {
        /**
         * @deprecated 호출부가 색을 고르지 못하게 `status` 낱말로 옮긴다 — 화면 플랜이 호출부를 옮기는 동안만 남고 04.6-28이 지운다.
         */
        kind: StatusTagKind;
        status?: never;
        /** 두~네 글자 명사만 받는다. 문장을 넣지 않는다 — 이 컴포넌트는 값을 그대로 렌더만 하고 길이를 강제하지 않는다. */
        children: ReactNode;
      }
  );

export function StatusTag({ status, kind, variant = "tag", className, children }: StatusTagProps) {
  const color = status !== undefined ? statusKind(status) : kind;
  return (
    <span
      className={[styles.base, styles[color], variant === "text" ? styles.text : styles.tag, className]
        .filter(Boolean)
        .join(" ")}
    >
      {status ?? children}
    </span>
  );
}
