"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
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

// 웨이브 11 D3 — 폰 화면 아래에 고정된 행동 줄은 이 속성을 단다. 토스트는 그 줄 위에 뜬다(줄의 버튼을 가리지 않는다).
// 줄 높이는 막힘 줄 · 충돌 줄로 바뀌므로 실측한다. PC에서는 그 줄이 fixed가 아니라 올리지 않는다.
const FIXED_BAR_ATTR = "data-fixed-bar";

function fixedBarTop(): number | null {
  let top: number | null = null;
  for (const bar of document.querySelectorAll<HTMLElement>(`[${FIXED_BAR_ATTR}]`)) {
    if (getComputedStyle(bar).position !== "fixed") continue;
    const rect = bar.getBoundingClientRect();
    if (rect.height === 0) continue;
    top = top === null ? rect.top : Math.min(top, rect.top);
  }
  return top;
}

export function Toast({ message, tone = "default", actionLabel, onAction, onDismiss }: ToastProps) {
  // WR-05: onDismiss를 의존성에 두면 안 된다. 호출부는 거의 항상 인라인 클로저를
  // 넘기고(onDismiss={() => setToast(null)}) 그 정체성은 렌더마다 바뀐다 — 4초보다
  // 자주 리렌더되는 부모 아래에서 타이머가 계속 재시작돼 토스트가 영원히 남는다.
  // 최신 콜백은 ref로 읽고, 타이머는 tone에만 반응한다.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (tone === "error") return; // §7-6: 오류는 닫을 때까지 — 자동 소멸 없음
    const timer = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [tone]);

  // 고정 행동 줄 위로 — 처음 그리기 전에 한 번, 화면 내용 · 창 크기가 바뀌면 다시(값이 같으면 쓰지 않는다).
  const toastRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const toast = toastRef.current;
    if (!toast) return;
    const place = () => {
      const top = fixedBarTop();
      const lift = top === null ? "" : `${document.documentElement.clientHeight - top}px`;
      if (toast.style.getPropertyValue("--toast-lift") === lift) return;
      if (lift) toast.style.setProperty("--toast-lift", lift);
      else toast.style.removeProperty("--toast-lift");
    };
    place();
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);

  return (
    <div ref={toastRef} className={styles.toast} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
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
