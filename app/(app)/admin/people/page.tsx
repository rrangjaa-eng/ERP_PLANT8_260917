import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listPeople } from "@/domain/people";
import { listRoles } from "@/domain/permissions/roles";
import { listOrgUnits, listTeams } from "@/domain/org";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { PersonForm } from "./person-form";
import styles from "./people.module.css";

// 사람·계급·조직 세 화면은 같은 권한(admin.people)으로 관리되는 한 묶음이라
// 별도 메뉴로 쪼개지 않는다 — 03-01이 등록한 메뉴 배열을 이 플랜이 늘리지
// 않는다(head 주석 판단, SUMMARY 참고). D-18과 같은 결: 캐시 없음.
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.people", "view"))) notFound();

  const [people, roles, orgUnits, teams] = await Promise.all([
    listPeople(session.viewer),
    listRoles(session.viewer),
    listOrgUnits(session.viewer),
    listTeams(session.viewer),
  ]);

  const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
  const orgUnitNameById = new Map(orgUnits.map((org) => [org.id, org.name]));
  const teamOptions = teams.map((team) => ({
    id: team.id,
    name: team.name,
    orgUnitName: orgUnitNameById.get(team.orgUnitId) ?? "",
  }));

  return (
    <>
      <PageHeader title="사람" />

      <PersonForm roles={roles} teams={teamOptions} />

      {people.length === 0 ? (
        <ListEmpty message="등록된 사람이 없습니다" action={{ label: "사람 등록", href: "#person-form" }} />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">이메일</th>
              <th scope="col">계급</th>
              <th scope="col">현재 소속</th>
              <th scope="col">상태</th>
              <th scope="col">동작</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td>{person.name}</td>
                <td>{person.email}</td>
                <td>{person.roleName ?? roleNameById.get(person.roleId ?? "") ?? "—"}</td>
                <td>{person.currentTeamName ?? "—"}</td>
                <td>
                  {person.archivedAt ? (
                    <StatusTag kind="muted" variant="text">
                      보관됨
                    </StatusTag>
                  ) : null}
                </td>
                <td>
                  <Link href={`/admin/people/${person.id}`} className={styles.detailLink}>
                    상세
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
