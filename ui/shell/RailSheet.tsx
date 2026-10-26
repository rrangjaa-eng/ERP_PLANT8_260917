"use client";

import { useEffect, useRef, useState } from "react";
import type { MenuLink } from "./role-menu";
import { RAIL_MEDIA, RailAdminLink, RailNav, RailSearchRow } from "./SideRail";
import styles from "./RailSheet.module.css";

// SYSTEM.md §6-0 700–1279 가림 레일. 바 왼쪽 ≡가 여는 네이티브 <dialog>.showModal()(MoreSheet.tsx와 같은 패턴 —
// 포커스 트랩 · ::backdrop · Esc는 브라우저가 한다). 내용은 열 때만 마운트해 nav 「주 메뉴」가 한 벌만 남는다.
// 사용자 행은 없다(바 오른쪽 사용자 메뉴가 진입점). 1280 이상으로 넓어지면 고정 레일이 대신하므로 닫는다.
export type RailSheetProps = {
  topBarMenu: MenuLink[];
  adminMenu: MenuLink[];
  current: string | null;
};

export function RailSheet({ topBarMenu, adminMenu, current }: RailSheetProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia(RAIL_MEDIA);
    function onChange(event: MediaQueryListEvent) {
      if (!event.matches) return;
      dialogRef.current?.close();
      document.getElementById("main-content")?.focus();
    }
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  function handleClose() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">≡</span>
        <span className="sr-only">메뉴</span>
      </button>
      <dialog
        ref={dialogRef}
        className={styles.sheet}
        aria-label="메뉴"
        onClose={handleClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {open ? (
          <>
            <RailSearchRow />
            <RailNav items={topBarMenu} current={current} onNavigate={close} className={styles.nav} />
            <div className={styles.bottom}>
              <RailAdminLink items={adminMenu} onNavigate={close} />
            </div>
          </>
        ) : null}
      </dialog>
    </>
  );
}
