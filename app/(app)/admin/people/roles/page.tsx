import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listRoles } from "@/domain/permissions/roles";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { RolesClient } from "./roles-client";

export const dynamic = "force-dynamic";

// ADMN-08: 계급 추가·이름 변경이 되는 데이터의 실제 화면. admin.people 메뉴
// 아래(사람·계급·조직이 같은 권한으로 관리되는 한 묶음 — people/page.tsx
// 머리 주석과 같은 판단).
export default async function RolesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.people", "view"))) notFound();

  const roles = await listRoles(session.viewer);

  return (
    <>
      <PageHeader title="계급" />
      <RolesClient roles={roles} />
    </>
  );
}
