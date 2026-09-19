"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import type { AccountEntry, MenuLink } from "./role-menu";
import styles from "./TopBar.module.css";

// SYSTEM.md §6-0 공통 셸 · PC 상단 바. 앱 유일의 딥그린 면 + 1차 메뉴 + 사용자 진입점.
//
// 체크포인트 항목 G① 확정(2026-09-19): 사용자 이름이 "열리는 메뉴" 형태다 — Tab만으로
// 도달해 열고, Esc로 닫히며, 닫히면 트리거로 포커스가 돌아온다. 이 상호작용 때문에
// 전체 컴포넌트가 클라이언트 컴포넌트다 — 02-04 files_modified가 별도 클라이언트
// 파일을 두지 않아 이 파일 하나가 감당한다(§6-0이 G① 대신 화면 링크 하나였다면
// 서버 컴포넌트로 남았을 것이다).
//
// 관리자 여부를 가르는 조건문을 두지 않는다 — 전부 role-menu.ts의 계산 결과로 받는다(D-23).
export type TopBarProps = {
  topBarMenu: MenuLink[];
  systemStatus: MenuLink | null;
  accountGroup: AccountEntry[];
  userName: string;
};

// §6-0 (a): PC 사용자 메뉴는 「내 정보 · 로그아웃(관리자는 그 위에 시스템 상태)」뿐이다.
// 「설정」은 §7-8 「더보기」 시트 전용 — role-menu.ts의 accountGroup은 두 표면이
// 공유하는 정본이고, 어느 항목이 어느 표면에 보이는지는 각 표면 컴포넌트가 href로
// 가른다(라벨 문자열이 아니라 URL로 판별해 역할 분기와 무관하게 안정적이다).
function isSettingsEntry(entry: AccountEntry): boolean {
  return entry.kind === "link" && entry.href === "/settings";
}

export function TopBar({ topBarMenu, systemStatus, accountGroup, userName }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);

  const pcMenuItems: Array<{ key: string; entry: AccountEntry | MenuLink; kind: "link" | "action" }> = [
    ...(systemStatus ? [{ key: systemStatus.href, entry: systemStatus, kind: "link" as const }] : []),
    ...accountGroup
      .filter((entry) => !isSettingsEntry(entry))
      .map((entry) => ({ key: entry.label, entry, kind: entry.kind })),
  ];

  useEffect(() => {
    if (open) {
      firstItemRef.current?.focus();
    }
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  async function handleLogout() {
    close();
    // D-10: 로그아웃은 현재 기기 세션만 끝낸다(app/(app)/account/logout-button.tsx와 동일 계약).
    await authClient.signOut();
    router.push("/login");
  }

  // 메뉴가 빠지면(정보 노출표로 인해) 남은 메뉴가 왼쪽으로 붙는다 — flex 목록이라
  // 별도 처리 없이 빈 자리가 생기지 않는다(D-22).
  return (
    <header className={styles.bar}>
      <span className={styles.mark}>
        PL<i className={styles.leaf}>A</i>NT8
      </span>
      <nav aria-label="주 메뉴" className={styles.nav}>
        {topBarMenu.map((item) => (
          <a key={item.href} href={item.href} className={styles.navLink}>
            {item.label}
          </a>
        ))}
      </nav>
      <div className={styles.right}>
        <span className={styles.kbdWrap}>
          <kbd className={styles.kbd}>⌘K</kbd>
        </span>
        <div className={styles.userWrap} onKeyDown={handleKeyDown}>
          <button
            type="button"
            ref={triggerRef}
            className={styles.userTrigger}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {userName}
          </button>
          {open ? (
            <ul role="menu" className={styles.userMenu}>
              {pcMenuItems.map((item, index) => (
                <li role="none" key={item.key}>
                  {"href" in item.entry ? (
                    <a
                      role="menuitem"
                      href={item.entry.href}
                      className={styles.userMenuItem}
                      ref={index === 0 ? (firstItemRef as React.RefObject<HTMLAnchorElement>) : undefined}
                      onClick={close}
                    >
                      {item.entry.label}
                    </a>
                  ) : (
                    <button
                      role="menuitem"
                      type="button"
                      className={styles.userMenuItem}
                      ref={index === 0 ? (firstItemRef as React.RefObject<HTMLButtonElement>) : undefined}
                      onClick={() => {
                        void handleLogout();
                      }}
                    >
                      {item.entry.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </header>
  );
}
