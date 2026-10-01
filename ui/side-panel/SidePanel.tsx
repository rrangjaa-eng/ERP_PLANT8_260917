"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject, type SyntheticEvent } from "react";
import styles from "./SidePanel.module.css";

// SYSTEM.md §7-8 개정 ⑰(04.3-10 · DECISIONS D-d) — 한 건 등록 폼의 옆 패널. 네이티브 <dialog> 하나로:
// PC(700 이상)는 show() — 오른쪽 고정 480, 목록 위에 겹쳐 서고 밀지 않으며 스크림 · 포커스 가두기가 없다(뒤를 막지
// 않는다). 폰(700 미만)은 showModal() — §7-8 시트 골격(::backdrop 스크림 · 브라우저 포커스 가두기). 열 때 첫 칸 포커스,
// Esc · × 는 onClose(닫기 요청 — 입력 버리기 확인은 호출부), 닫히면 여는 버튼으로 포커스(returnFocus가 거짓이면 호출부가
// 새 결과로 옮긴다). 여는 버튼이 화면 1차면 호출부가 열린 동안 그 1차를 렌더하지 않는다(DR-9).

const WIDE_QUERY = "(min-width: 700px)";
const FIRST_FIELD = "input:not([type=hidden]), select, textarea";

/** <dialog>에서 이 부품이 쓰는 부분 — 단위 테스트가 같은 모양의 가짜로 순서를 본다. */
export type PanelDialogLike = {
  open: boolean;
  show(): void;
  showModal(): void;
  close(): void;
  querySelector(selector: string): { focus(): void } | null;
};

export function openSidePanel(dialog: PanelDialogLike, wide: boolean): void {
  if (dialog.open) return;
  if (wide) dialog.show();
  else dialog.showModal();
  dialog.querySelector(FIRST_FIELD)?.focus();
}

export function closeSidePanel(dialog: PanelDialogLike, opener: { focus(): void } | null): void {
  if (dialog.open) dialog.close();
  opener?.focus();
}

/** 조합 중이거나 안쪽 컨트롤이 먼저 쓴 Esc는 패널을 닫지 않는다. */
export function isPanelCloseKey(event: { key: string; isComposing?: boolean; defaultPrevented?: boolean }): boolean {
  return event.key === "Escape" && !event.isComposing && !event.defaultPrevented;
}

export type SidePanelProps = {
  open: boolean;
  /** Esc · × — 닫기 요청. 실제로 닫는 것은 호출부가 open을 거짓으로 바꿀 때다. */
  onClose: () => void;
  /** = 실제 동작(--fs-lg). 패널의 접근 이름이다. */
  title: string;
  /** 닫히면 포커스가 돌아갈 여는 버튼. */
  opener: RefObject<HTMLElement | null>;
  /** 거짓이면 닫힐 때 여는 버튼으로 옮기지 않는다(성공 — 호출부가 새 행으로). 기본 참. */
  returnFocus?: boolean;
  children: ReactNode;
  /** 행동 줄 — 2차 왼쪽 · 1차 오른쪽 순서로 넘긴다(DOM · Tab 순서 = 시각 순서). */
  actions: ReactNode;
};

export function SidePanel({ open, onClose, title, opener, returnFocus = true, children, actions }: SidePanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) openSidePanel(dialog, window.matchMedia(WIDE_QUERY).matches);
    else if (dialog.open) closeSidePanel(dialog, returnFocus ? opener.current : null);
  }, [open, opener, returnFocus]);

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (!isPanelCloseKey({ key: event.key, isComposing: event.nativeEvent.isComposing, defaultPrevented: event.defaultPrevented })) return;
    event.preventDefault();
    onClose();
  }

  // 폰 시트(showModal)의 브라우저 Esc는 cancel로 온다 — 스스로 닫지 않고 호출부에 묻는다.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <dialog ref={dialogRef} className={styles.panel} aria-labelledby={titleId} onKeyDown={handleKeyDown} onCancel={handleCancel}>
      <div className={styles.hd}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.closeIcon}>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      <div className={styles.actions}>{actions}</div>
    </dialog>
  );
}
