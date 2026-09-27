import type { ReactNode } from "react";
import { requireSession } from "@/lib/viewer";
import { roleMenu } from "@/ui/shell/role-menu";
import { Shell } from "@/ui/shell/Shell";
import { UnreadCountProvider } from "@/ui/shell/unread-count";
import { can } from "@/domain/permissions/can";
import { MENUS } from "@/domain/permissions/menus";
import { countMyUnread } from "@/domain/notify/inbox";
import { refreshUnreadCountAction } from "@/app/(app)/notifications/actions";
import { log } from "@/lib/log";

// 인증 화면 공통 셸 삽입 지점(D-23). 로그인 화면(app/(auth)/login)은 이 라우트
// 그룹 밖이라 셸에 감싸이지 않는다(§6-7 — 셸 없는 유일한 화면). 루트 레이아웃이
// 아니라 이 레이아웃에 셸을 넣는 이유가 그것이다.
//
// requireSession()을 여기서 부르는 이유: Shell의 userName·역할 매핑 계산에
// 세션이 반드시 필요하다 — 미인증이면 /login으로 보낸다(각 페이지의 자체 인증
// 검사는 그대로 둔다. 예: app/(app)/admin/system-status/page.tsx의 접근 제어
// 세 줄은 이 레이아웃과 무관하게 손대지 않는다).
//
// D-36(03-02): roleMenu는 domain을 import할 수 없으므로(ui 경계) 메뉴별 보기
// 판정을 여기서 미리 계산해 계산된 데이터(allowedMenus)로 넘긴다. MENUS 수만큼
// can() 호출이 생기지만 전부 같은 계급의 권한표 행을 읽는다 — 사용자 10~30명
// 사내 시스템이라 개별 호출을 최적화하지 않는다(03-02-PLAN.md ⑤).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { viewer, user } = await requireSession();

  const visibleMenus = await Promise.all(
    MENUS.map(async (menu) => ((await can(viewer, menu.key, "view")) ? menu.key : null)),
  );
  const allowedMenus = visibleMenus.filter((key): key is string => key !== null);

  const menu = roleMenu({ roleId: viewer.roleId ?? "", allowedMenus });

  // D-4219: 첫 값은 레이아웃의 서버 조회 하나뿐이다 — 실패해도 셸 자체는 정상
  // 렌더된다(S1-badge/error, 배지만 없다). 이후 경로 변경마다 다시 받는 일은
  // UnreadCountProvider(클라이언트 경계)가 한다.
  let initialUnreadCount: number | null = null;
  try {
    initialUnreadCount = await countMyUnread(viewer);
  } catch (error) {
    log.warn("notify.unread_count_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <UnreadCountProvider initial={initialUnreadCount} refresh={refreshUnreadCountAction}>
      <Shell
        topBarMenu={menu.topBarMenu}
        adminMenu={menu.adminMenu}
        accountGroup={menu.accountGroup}
        bottomTabs={menu.bottomTabs}
        userName={user.name}
      >
        {children}
      </Shell>
    </UnreadCountProvider>
  );
}
