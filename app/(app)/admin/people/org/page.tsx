import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listOrgUnits, listTeams } from "@/domain/org";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { OrgList, OrgUnitForm, TeamForm } from "./org-client";

export const dynamic = "force-dynamic";

const ORG_HREF = "/admin/people/org";
const NEW_ORG_HREF = `${ORG_HREF}?new=org`;

// MAST-02: 조직 관리 화면 — 본부 목록과 그 아래 팀 목록(본부별 그룹). 팀
// 추가 폼은 본부 선택을 필수로 요구한다(본부 없는 팀을 만들 수 없다).
export default async function OrgPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; orgUnitId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.people", "view"))) notFound();

  // §6-1: 목록이 화면이고 추가는 목록 머리글의 행동이다 — 기본 진입에는 폼이
  // 없다(D-39, DECISIONS.md 2026-09-21). 폼이 둘이므로 토글 값도 둘이고, 한 번에 하나만 연다.
  const { new: newParam, orgUnitId: orgUnitIdParam } = await searchParams;
  const newForm = newParam === "org" || newParam === "team" ? newParam : null;

  const [orgUnits, teams, canArchive, canWrite] = await Promise.all([
    listOrgUnits(session.viewer),
    listTeams(session.viewer),
    can(session.viewer, "admin.archive", "write"),
    can(session.viewer, "admin.people", "write"),
  ]);

  // DR3 B — 「팀 추가」 행동 링크의 `orgUnitId`는 보관되지 않은 본부와 같을 때만 팀 폼 본부 칸 기본값이다. 모르는 값 ·
  // 보관된 본부는 빈 기본값이다(서버 액션의 본부 검증은 그대로).
  const defaultOrgUnitId = orgUnits.find((org) => org.id === orgUnitIdParam && org.archivedAt === null)?.id ?? "";

  return (
    <ListScreen
      title="조직"
      singleColumn
      // DR5 A — 본부가 없으면 머리 1차 없이 빈 화면의 「본부 추가」 하나. 「팀 추가」는 본부 행마다 있다(DR3 B).
      primaryAction={canWrite && orgUnits.length > 0 ? { label: "본부 추가", href: NEW_ORG_HREF } : undefined}
      panel={
        canWrite && newForm === "org" ? (
          <SidePanel key="org" title="본부 추가" closeHref={ORG_HREF}>
            <OrgUnitForm />
          </SidePanel>
        ) : canWrite && newForm === "team" ? (
          <SidePanel key={`team-${defaultOrgUnitId}`} title="팀 추가" closeHref={ORG_HREF}>
            <TeamForm orgUnits={orgUnits} defaultOrgUnitId={defaultOrgUnitId} />
          </SidePanel>
        ) : null
      }
    >
      {orgUnits.length === 0 ? (
        <ListEmpty
          message="등록된 본부가 없습니다"
          action={canWrite ? { label: "본부 추가", href: NEW_ORG_HREF } : undefined}
        />
      ) : (
        <OrgList orgUnits={orgUnits} teams={teams} canArchive={canArchive} canWrite={canWrite} />
      )}
    </ListScreen>
  );
}
