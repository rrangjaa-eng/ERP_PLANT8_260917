"use client";

import { useEffect, useRef } from "react";
import type { AccountEntry, MenuLink } from "./role-menu";
import styles from "./MoreSheet.module.css";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { useLogout } from "@/ui/logout/use-logout";

// SYSTEM.md §7-8 「더보기」 시트. 실물: docs/design/system/sheet-modal.html #sheet-more.
//
// 포커스 트랩에 새 런타임 의존성을 두지 않는다(02-RESEARCH.md Don't Hand-Roll) —
// 네이티브 <dialog>.showModal()이 포커스 트랩 · 가림막(::backdrop) · Esc-닫힘을
// 브라우저 차원에서 제공한다. 여기서는 (1) 열기 전 활성 요소를 저장했다가 닫을 때
// 되돌리는 것과 (2) 열릴 때 첫 행동 요소에 포커스하는 것만 맡는다. 명시적으로도
// Escape를 처리해 두어(멱등 — HTMLDialogElement.close()는 이미 닫힌 다이얼로그에
// 다시 호출해도 안전하다) 네이티브 동작에만 기대지 않는다.
//
// 계정 그룹 항목을 이 컴포넌트에 하드코딩하지 않는다 — role-menu.ts의 accountGroup을
// 그대로 받아 렌더만 한다(D-23). 항목 이름이 바뀌어도(예: 02-01 체크포인트 H가 나중에
// 바뀌어 「설정」이 빠지면) 이 파일은 고칠 필요가 없다.
export type MoreSheetProps = {
  open: boolean;
  onClose: () => void;
  /** 하단 탭에 없는 1차 메뉴 — BottomTabs.tsx가 계산해 넘긴다. */
  moreMenu: MenuLink[];
  accountGroup: AccountEntry[];
  /** roleMenu(viewer).adminMenu — 권한표에서 view 권한이 있는 admin.* 메뉴가
   * 하나라도 있으면 「관리」 한 줄, 없으면 빈 배열. 그룹 머리글 없이 목록 행
   * 하나로 렌더한다(SYSTEM.md §7-8, 「관리」 한 줄로 접기 2026-09-22). 개별
   * 관리자 화면 이름은 이 시트가 아니라 /admin 인덱스(§6-10)에서 고른다. */
  adminMenu: MenuLink[];
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

export function MoreSheet({ open, onClose, moreMenu, accountGroup, adminMenu, triggerRef }: MoreSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      // 첫 행동 요소(검색 다음의 첫 실제 링크)에 포커스 — <dialog>의 기본 포커스는
      // 다이얼로그 자체이거나 autofocus 속성이 붙은 요소다.
      firstItemRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleDialogClose() {
    onClose();
    const target = previouslyFocusedRef.current ?? triggerRef.current;
    target?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      // 네이티브 <dialog>도 Esc에서 스스로 닫히지만, 여기서도 명시적으로 닫아
      // 동작을 코드로 남긴다 — close()는 이미 닫힌 다이얼로그에도 안전하다.
      event.preventDefault();
      dialogRef.current?.close();
    }
  }

  // WR-06: 성공했을 때만 시트를 닫는다(TopBar와 같은 계약).
  const { logout, error: logoutError } = useLogout(() => dialogRef.current?.close());

  const firstRowHref = moreMenu[0]?.href ?? adminMenu[0]?.href;

  return (
    <dialog
      ref={dialogRef}
      className={styles.sheet}
      aria-label="더보기"
      onKeyDown={handleKeyDown}
      onClose={handleDialogClose}
    >
      <div className={styles.hd}>
        <h2 className={styles.title}>더보기</h2>
        <button
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
      {logoutError ? <FormAlert>{logoutError}</FormAlert> : null}
      <ul className={styles.list}>
        <li>
          <span className={styles.searchRow} aria-disabled="true">
            검색
            {/* §7-8: 「검색 행에는 대상 목록(프로젝트 · 지출결의 · 거래처)」.
                DECISIONS.md 결정표 — 「검색 대상 목록은 안내 문구가 아니라 범위
                표시」이고, 기각된 대안이 「라벨만」이었다. 검색 자체는 아직
                동작하지 않아 행이 aria-disabled지만, 범위 표시는 「검색이
                동작한다」는 약속이 아니라 닿을 대상을 적는 것이라 모순이 아니다.
                §8 규칙 5(안내 문구 없음)에 따라 설명문을 두지 않는다. */}
            <span className={styles.reason}>프로젝트 · 지출결의 · 거래처</span>
          </span>
        </li>
        {moreMenu.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className={styles.link}
              ref={item.href === firstRowHref ? firstItemRef : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
        {adminMenu.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className={styles.link}
              ref={item.href === firstRowHref ? firstItemRef : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
        <li className={styles.group} role="presentation">
          계정
        </li>
        {accountGroup.map((entry) =>
          entry.kind === "link" ? (
            <li key={entry.label}>
              <a href={entry.href} className={styles.link}>
                {entry.label}
              </a>
            </li>
          ) : (
            <li key={entry.label}>
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  void logout();
                }}
              >
                {entry.label}
              </button>
            </li>
          ),
        )}
      </ul>
    </dialog>
  );
}
