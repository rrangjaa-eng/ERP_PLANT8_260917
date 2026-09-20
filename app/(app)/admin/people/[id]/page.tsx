import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { getPerson } from "@/domain/people";
import { listRoles } from "@/domain/permissions/roles";
import { listOrgUnits, listTeams } from "@/domain/org";
import { KvList } from "@/ui/kv-list/KvList";
import { PageHeader } from "@/ui/page-header/PageHeader";
import type { HistoryEntry } from "@/ui/history-list/HistoryList";
import { PersonDetailClient } from "./person-detail-client";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// settings/page.tsx의 buildSections()와 같은 이유로 별도 함수로 뺀다 —
// 컴포넌트 본문 안에서 클로저 변수를 재할당하면 eslint-plugin-react-hooks의
// immutability 규칙이 발동한다(서버 컴포넌트라 실제로는 안전하지만 규칙이
// 구분하지 않는다).
function buildHistoryEntries(
  assignments: { effectiveFrom: string; teamName: string }[],
  today: string,
): HistoryEntry[] {
  let activeMarked = false;
  return assignments.map((assignment) => {
    if (assignment.effectiveFrom > today) {
      return { effectiveFrom: assignment.effectiveFrom, displayValue: assignment.teamName, status: "scheduled" };
    }
    if (!activeMarked) {
      activeMarked = true;
      return { effectiveFrom: assignment.effectiveFrom, displayValue: assignment.teamName, status: "active" };
    }
    return { effectiveFrom: assignment.effectiveFrom, displayValue: assignment.teamName, status: "past" };
  });
}

// §6-2 상세 화면 — 사람 상세는 이름·이메일·계급·현재 소속(KvList) + 계급
// 변경 + 발령 이력(§7-14 HistoryList, 03-04 산출 컴포넌트 재사용).
export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.people", "view"))) notFound();

  const { id } = await params;
  const [detail, roles, orgUnits, teams] = await Promise.all([
    getPerson(session.viewer, id),
    listRoles(session.viewer),
    listOrgUnits(session.viewer),
    listTeams(session.viewer),
  ]);
  if (!detail) notFound();

  const orgUnitNameById = new Map(orgUnits.map((org) => [org.id, org.name]));
  const teamOptions = teams.map((team) => ({
    value: team.id,
    label: `${orgUnitNameById.get(team.orgUnitId) ?? ""} · ${team.name}`,
  }));

  const entries = buildHistoryEntries(detail.assignments, todayIso());

  return (
    <>
      <PageHeader title={detail.person.name} subtitle={detail.person.email} />

      <KvList
        items={[
          { label: "이름", value: detail.person.name },
          { label: "이메일", value: detail.person.email },
          { label: "계급", value: detail.person.roleName ?? "—" },
          { label: "현재 소속", value: detail.person.currentTeamName ?? "미배정" },
        ]}
      />

      <PersonDetailClient
        userId={detail.person.id}
        roles={roles}
        currentRoleId={detail.person.roleId}
        teamOptions={teamOptions}
        entries={entries}
      />
    </>
  );
}
