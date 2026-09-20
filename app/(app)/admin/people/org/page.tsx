import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listOrgUnits, listTeams } from "@/domain/org";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { OrgClient } from "./org-client";

export const dynamic = "force-dynamic";

// MAST-02: 조직 관리 화면 — 본부 목록과 그 아래 팀 목록(본부별 그룹). 팀
// 추가 폼은 본부 선택을 필수로 요구한다(본부 없는 팀을 만들 수 없다).
export default async function OrgPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.people", "view"))) notFound();

  const [orgUnits, teams] = await Promise.all([listOrgUnits(session.viewer), listTeams(session.viewer)]);

  return (
    <>
      <PageHeader title="조직" />
      <OrgClient orgUnits={orgUnits} teams={teams} />
    </>
  );
}
