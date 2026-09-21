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
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.people", "view"))) notFound();

  const { new: newParam } = await searchParams;
  // §6-1: 목록이 화면이고 추가는 목록 머리글의 행동이다 — 기본 진입에는 폼이
  // 없다(D-39, DECISIONS.md 2026-09-21). 이 화면은 그 재구성에서 빠져 있었다
  // (design-review A-H1).
  const showForm = newParam === "1";

  const [roles, canArchive] = await Promise.all([
    listRoles(session.viewer),
    can(session.viewer, "admin.archive", "write"),
  ]);

  return (
    <>
      <PageHeader title="계급" />
      <RolesClient roles={roles} canArchive={canArchive} showForm={showForm} />
    </>
  );
}
