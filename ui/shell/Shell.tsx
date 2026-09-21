import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { BottomTabs } from "./BottomTabs";
import type { AccountEntry, BottomTab, MenuLink } from "./role-menu";
import styles from "./Shell.module.css";

// SYSTEM.md §6-0 공통 셸. 서버 컴포넌트 — props로 받은 role-menu.ts 계산 결과만
// 렌더한다(역할 분기 없음, D-23). §10 랜드마크 넷 중 헤더·주 메뉴는 TopBar가,
// 폰 하단 탭은 BottomTabs가 이미 자신의 랜드마크를 그리므로 이 파일은 나머지
// 하나(본문)와 첫 포커스 요소인 스킵 링크만 만든다.
export type ShellProps = {
  topBarMenu: MenuLink[];
  adminMenu: MenuLink[];
  accountGroup: AccountEntry[];
  bottomTabs: BottomTab[];
  userName: string;
  children: ReactNode;
};

export function Shell({ topBarMenu, adminMenu, accountGroup, bottomTabs, userName, children }: ShellProps) {
  return (
    <div className={styles.shell}>
      {/* §10: 첫 포커스 요소, 포커스 시에만 보임, 1차 버튼 모양. */}
      <a href="#main-content" className={styles.skipLink}>
        본문으로 건너뛰기
      </a>
      <TopBar topBarMenu={topBarMenu} adminMenu={adminMenu} accountGroup={accountGroup} userName={userName} />
      <main id="main-content" tabIndex={-1} className={styles.main}>
        {children}
      </main>
      <BottomTabs
        topBarMenu={topBarMenu}
        bottomTabs={bottomTabs}
        accountGroup={accountGroup}
        adminMenu={adminMenu}
      />
    </div>
  );
}
