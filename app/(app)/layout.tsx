import type { ReactNode } from "react";
import { requireSession } from "@/lib/viewer";
import { roleMenu } from "@/ui/shell/role-menu";
import { Shell } from "@/ui/shell/Shell";

// 인증 화면 공통 셸 삽입 지점(D-23). 로그인 화면(app/(auth)/login)은 이 라우트
// 그룹 밖이라 셸에 감싸이지 않는다(§6-7 — 셸 없는 유일한 화면). 루트 레이아웃이
// 아니라 이 레이아웃에 셸을 넣는 이유가 그것이다.
//
// requireSession()을 여기서 부르는 이유: Shell의 userName·역할 매핑 계산에
// 세션이 반드시 필요하다 — 미인증이면 /login으로 보낸다(각 페이지의 자체 인증
// 검사는 그대로 둔다. 예: app/(app)/admin/system-status/page.tsx의 접근 제어
// 세 줄은 이 레이아웃과 무관하게 손대지 않는다).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { viewer, user } = await requireSession();
  const menu = roleMenu(viewer);

  return (
    <Shell
      topBarMenu={menu.topBarMenu}
      systemStatus={menu.systemStatus}
      accountGroup={menu.accountGroup}
      bottomTabs={menu.bottomTabs}
      userName={user.name}
    >
      {children}
    </Shell>
  );
}
