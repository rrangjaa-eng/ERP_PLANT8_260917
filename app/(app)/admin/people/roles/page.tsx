import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listRoles } from "@/domain/permissions/roles";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { RoleForm, RolesList } from "./roles-client";

export const dynamic = "force-dynamic";

const ROLES_HREF = "/admin/people/roles";
const NEW_ROLE_HREF = `${ROLES_HREF}?new=1`;

// ADMN-08: 계급 추가·이름 변경이 되는 데이터의 실제 화면. admin.people 메뉴
// 아래(사람·계급·조직이 같은 권한으로 관리되는 한 묶음 — people/page.tsx
// 머리 주석과 같은 판단).
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.people", "view"))) notFound();

  const { new: newParam } = await searchParams;

  const [roles, canArchive, canWrite] = await Promise.all([
    listRoles(session.viewer),
    can(session.viewer, "admin.archive", "write"),
    can(session.viewer, "admin.people", "write"),
  ]);

  // §6-1: 목록이 화면이고 추가는 목록 머리글의 행동이다 — 기본 진입에는 폼이
  // 없다(D-39, DECISIONS.md 2026-09-21). 이 화면은 그 재구성에서 빠져 있었다
  // (design-review A-H1). 쓰기 권한이 없으면 패널 자체를 그리지 않는다.
  const showForm = newParam === "1" && canWrite;

  return (
    <ListScreen
      title="계급"
      // DR5 A — 계급이 없으면 머리 1차 없이 빈 화면의 「계급 추가」 하나.
      primaryAction={canWrite && roles.length > 0 ? { label: "계급 추가", href: NEW_ROLE_HREF, phoneHidden: true } : undefined}
      panel={
        showForm ? (
          <SidePanel title="계급 추가" closeHref={ROLES_HREF}>
            <RoleForm />
          </SidePanel>
        ) : null
      }
    >
      {roles.length === 0 ? (
        <ListEmpty
          message="등록된 계급이 없습니다"
          action={canWrite ? { label: "계급 추가", href: NEW_ROLE_HREF, phoneHidden: true } : undefined}
        />
      ) : (
        <RolesList roles={roles} canArchive={canArchive} canWrite={canWrite} viewerRoleId={session.viewer.roleId} />
      )}
    </ListScreen>
  );
}
