"use client";

import { useEffect, useRef } from "react";
import styles from "./RowSheet.module.css";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";

// SYSTEM.md §7-3 보강 (바) · §7-8 시트 골격 — 폰에서 줄을 탭하면 열리는
// **보기 전용** 시트(D-69). 본문은 그 행에서 접힌 P2·P3 값이라 시트를 열
// 때 새 요청이 나가지 않는다(props로 이미 다 받는다). **행동 줄을 두지
// 않는다** — 「지출결의 올리기」는 그 문서가 생기는 페이즈가 더한다.
//
// 포커스 트랩은 ui/shell/MoreSheet.tsx 선례대로 네이티브 <dialog>가
// 브라우저 차원에서 제공한다 — 새 런타임 의존성을 더하지 않는다(D-61).
export type RowSheetProps = {
  open: boolean;
  onClose: () => void;
  /** 항목명(--fs-lg). */
  title: string;
  /** {소분류} · {거래처}. */
  subtitle: string;
  /** 접힌 값 전부 — 수량·단가·견적가·차익·환율·비고·상태. */
  items: KvItem[];
};

export function RowSheet({ open, onClose, title, subtitle, items }: RowSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      closeButtonRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleDialogClose() {
    onClose();
    previouslyFocusedRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dialogRef.current?.close();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.sheet}
      aria-label={title}
      onKeyDown={handleKeyDown}
      onClose={handleDialogClose}
    >
      <div className={styles.hd}>
        <div className={styles.titleBlock}>
          <p className={styles.title}>{title}</p>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.close}
          aria-label="닫기"
          onClick={() => dialogRef.current?.close()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.closeIcon}>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>
        <KvList items={items} />
      </div>
    </dialog>
  );
}
