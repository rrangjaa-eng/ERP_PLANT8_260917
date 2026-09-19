"use client";

import { useRef, useState } from "react";
import type { AccountEntry, BottomTab, MenuLink } from "./role-menu";
import { MoreSheet } from "./MoreSheet";
import styles from "./BottomTabs.module.css";

// SYSTEM.md §6-0 폰 하단 탭 + 「더보기」 시트 트리거. 표시 여부(폰만 보임)는
// BottomTabs.module.css의 미디어 쿼리가 결정한다 — 이 파일은 뷰포트 폭을 읽지
// 않는다(서버 렌더 결과가 뷰포트에 따라 달라지지 않는다). 「더보기」를 열고 닫는
// 상태만 클라이언트에 있어 이 컴포넌트는 client다.
//
// 역할 분기를 두지 않는다 — bottomTabs·topBarMenu·accountGroup·systemStatus 전부
// role-menu.ts의 계산 결과를 그대로 받는다(D-23).
export type BottomTabsProps = {
  /** 1차 메뉴 다섯 전부 — 하단 탭에 없는 항목을 「더보기」 시트가 계산해 보여 준다. */
  topBarMenu: MenuLink[];
  /** roleMenu(viewer).bottomTabs — 정확히 4개, 4번째는 항상 {kind:"more"}. */
  bottomTabs: BottomTab[];
  accountGroup: AccountEntry[];
  systemStatus: MenuLink | null;
  /** 「내 차례」 탭 라벨에 붙일 건수 — 데이터 출처가 없는 이 페이즈에서는 생략(undefined)한다. */
  nextTurnCount?: number;
};

export function BottomTabs({
  topBarMenu,
  bottomTabs,
  accountGroup,
  systemStatus,
  nextTurnCount,
}: BottomTabsProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);

  const tabHrefs = new Set(
    bottomTabs.filter((tab): tab is Extract<BottomTab, { kind: "link" }> => tab.kind === "link").map((tab) => tab.href),
  );
  // §7-8 「더보기」 시트 구성 — 하단 탭에 없는 1차 메뉴. 새 데이터 원천이 아니라
  // role-menu.ts가 이미 준 두 목록(topBarMenu·bottomTabs)의 차집합일 뿐이다.
  const moreMenu = topBarMenu.filter((item) => !tabHrefs.has(item.href));

  return (
    <>
      <nav aria-label="하단 탭" className={styles.tabs}>
        {bottomTabs.map((tab, index) => {
          if (tab.kind === "link") {
            const label = index === 0 && typeof nextTurnCount === "number" ? `${tab.label} ${nextTurnCount}` : tab.label;
            return (
              <a key={tab.href} href={tab.href} className={styles.tab}>
                {label}
              </a>
            );
          }
          return (
            <button
              key="more"
              type="button"
              ref={moreTriggerRef}
              className={styles.tab}
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen(true)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      <MoreSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        moreMenu={moreMenu}
        accountGroup={accountGroup}
        systemStatus={systemStatus}
        triggerRef={moreTriggerRef}
      />
    </>
  );
}
