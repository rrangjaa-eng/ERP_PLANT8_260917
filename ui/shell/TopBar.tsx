"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AccountEntry, MenuLink } from "./role-menu";
import { isCurrentPath } from "./current-path";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { useLogout } from "@/ui/logout/use-logout";
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
//
// WR-01(02-REVIEW.md, 02-04-SUMMARY.md L201-L212 후속): 02-04는 레이아웃이 현재
// pathname을 얻을 방법이 없어 배선을 미뤘다 — 이 파일이 이미 클라이언트 컴포넌트라
// usePathname()을 여기서 직접 읽으면 그 제약과 무관하게 배선할 수 있다(02-08 Task 3).
export type TopBarProps = {
  topBarMenu: MenuLink[];
  adminMenu: MenuLink[];
  accountGroup: AccountEntry[];
  userName: string;
};

// §6-0 (a): PC 사용자 메뉴는 「내 정보 · 로그아웃(권한표에서 view 권한이 있는
// 관리자 화면이 하나라도 있으면 그 위에 「관리」 한 줄)」다. 관리자 진입점은
// 「관리」 한 줄뿐이고, 개별 관리자 화면(시스템 상태 · 코드표 · 권한표 …)의
// 이름은 /admin 인덱스(§6-10)에서 고른다(「관리」 한 줄로 접기 2026-09-22,
// quick/260922-i3k). 「설정」은 §7-8 「더보기」 시트 전용 — role-menu.ts의
// accountGroup은 두 표면이 공유하는 정본이고, 어느 항목이 어느 표면에 보이는지는
// 각 표면 컴포넌트가 href로 가른다(라벨 문자열이 아니라 URL로 판별해 역할 분기와
// 무관하게 안정적이다).
function isSettingsEntry(entry: AccountEntry): boolean {
  return entry.kind === "link" && entry.href === "/settings";
}

export function TopBar({ topBarMenu, adminMenu, accountGroup, userName }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);

  const pcMenuItems: Array<{ key: string; entry: AccountEntry | MenuLink; kind: "link" | "action" }> = [
    ...adminMenu.map((entry) => ({ key: entry.href, entry, kind: "link" as const })),
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

  // WR-03: 바깥을 클릭하면 닫는다. setOpen(false)를 쓰고 close()를 쓰지 않는다 —
  // 사용자가 의도적으로 다른 곳으로 갔는데 포커스를 트리거로 뺏어오면 안 된다.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // WR-02: role="menu"로 노출하는 이상 WAI-ARIA menu 패턴의 키를 지켜야 한다 —
  // 스크린 리더가 "메뉴"라고 읽으면 사용자는 Tab이 아니라 화살표를 쓴다.
  // 끝에서 한 바퀴 도는 것도 그 패턴의 일부다.
  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!open) return;

    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);

    function moveTo(index: number) {
      event.preventDefault();
      items[((index % items.length) + items.length) % items.length]?.focus();
    }

    if (event.key === "ArrowDown") moveTo(current + 1);
    else if (event.key === "ArrowUp") moveTo(current - 1);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(items.length - 1);
  }

  // WR-03: Tab으로 메뉴 밖으로 나가면 닫는다. 나가지 않은 포커스 이동(항목 간)은
  // relatedTarget이 여전히 이 컨테이너 안이므로 걸리지 않는다.
  function handleBlur(event: React.FocusEvent) {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }

  // WR-06: 성공했을 때만 메뉴를 닫는다. 예전에는 호출 전에 close()를 불러서
  // 실패 시 아무 반응 없이 메뉴만 닫혔다 — 사용자는 로그아웃됐다고 믿는다.
  const { logout, error: logoutError } = useLogout(close);

  // 메뉴가 빠지면(정보 노출표로 인해) 남은 메뉴가 왼쪽으로 붙는다 — flex 목록이라
  // 별도 처리 없이 빈 자리가 생기지 않는다(D-22).
  return (
    <header className={styles.bar}>
      {/* §6-0 PC에 「내 차례」로 돌아갈 길이 없던 문제(/design-review FINDING-001).
          사용자 결정 2026-09-24: 워드마크 = 홈 링크(웹 관례). 키보드도 같은
          길이어야 한다(§11 「마우스 없이」) — tabIndex={-1} 우회 금지. 기존
          span(styles.mark · 안의 styles.leaf i)은 그대로 두고 감싸기만 한다 —
          flex 컨테이너로 바꾸면 PL·A·NT8이 익명 flex 항목으로 쪼개져 글자
          모양(커닝)이 바뀔 수 있어서다. 평범한 `<a>`는 계획 의도였으나
          `@next/next/no-html-link-for-pages` 린트가 내부 페이지로의 리터럴
          href="/"를 막아 next/link로 바꿨다(렌더 결과는 여전히 <a>). */}
      <Link href="/" className={styles.markLink} aria-label="PLANT8 내 차례">
        <span className={styles.mark}>
          PL<i className={styles.leaf}>A</i>NT8
        </span>
      </Link>
      <nav aria-label="주 메뉴" className={styles.nav}>
        {topBarMenu.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={styles.navLink}
            aria-current={isCurrentPath(pathname, item.href) ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className={styles.right}>
        <span className={styles.kbdWrap}>
          <kbd className={styles.kbd}>⌘K</kbd>
        </span>
        <div className={styles.userWrap} ref={wrapRef} onKeyDown={handleKeyDown} onBlur={handleBlur}>
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
                        void logout();
                      }}
                    >
                      {item.entry.label}
                    </button>
                  )}
                </li>
              ))}
              {logoutError ? (
                <li role="none" className={styles.userMenuAlert}>
                  <FormAlert>{logoutError}</FormAlert>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
    </header>
  );
}
