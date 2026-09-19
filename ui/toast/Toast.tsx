"use client";

import { useEffect } from "react";
import styles from "./Toast.module.css";

// SYSTEM.md §7-6 토스트. 화면 이동이 따르는 행동의 결과에만 쓴다(표 저장 결과는
// 토스트를 띄우지 않는다 — 합계 행에 이미 있다). 최대 1개는 호출부 책임(이
// 컴포넌트는 렌더된 인스턴스 하나의 지속·닫힘만 담당한다). §7-11 D⑤가 배너와의
// 경계를 정한다: 토스트 = 1회성 행동 결과(최대 4초), 배너 = 화면에 걸린 조건
// (지속적).
export type ToastTone = "default" | "error";

export type ToastProps = {
  /** 버튼과 같은 단어 + 결과. 예: "일괄 저장 · 6줄 저장됨" */
  message: string;
  /** 기본 4초 뒤 자동 소멸. "error"는 닫을 때까지 유지된다(§7-6). */
  tone?: ToastTone;
  /** 실행 취소 등 3차 행동 — 둘 다 있어야 렌더된다. */
  actionLabel?: string;
  onAction?: () => void;
  /** 자동 소멸(기본) 또는 닫기 버튼(오류) 시 호출된다 — 호출부가 인스턴스를 치운다. */
  onDismiss: () => void;
};

const AUTO_DISMISS_MS = 4000;

export function Toast({ message, tone = "default", actionLabel, onAction, onDismiss }: ToastProps) {
  useEffect(() => {
    if (tone === "error") return; // §7-6: 오류는 닫을 때까지 — 자동 소멸 없음
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [tone, onDismiss]);

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span>{message}</span>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className={styles.action}>
          {actionLabel}
        </button>
      ) : null}
      {tone === "error" ? (
        <button type="button" onClick={onDismiss} className={styles.action}>
          닫기
        </button>
      ) : null}
    </div>
  );
}
