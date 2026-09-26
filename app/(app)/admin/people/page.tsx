import { notFound, redirect } from "next/navigation";
import { Fragment } from "react";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listPeople } from "@/domain/people";
import { listRoles } from "@/domain/permissions/roles";
import { listOrgUnits, listTeams } from "@/domain/org";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { PersonForm, PersonDeleteButton } from "./person-form";
import { personLoginStatus } from "./person-status";
import styles from "./people.module.css";

// 사람·계급·조직 세 화면은 같은 권한(admin.people)으로 관리되는 한 묶음이라
// 별도 메뉴로 쪼개지 않는다 — 03-01이 등록한 메뉴 배열을 이 플랜이 늘리지
// 않는다(head 주석 판단, SUMMARY 참고). D-18과 같은 결: 캐시 없음.
export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.people", "view"))) notFound();

  const { new: newParam } = await searchParams;
  // §6-1: 목록이 화면이고 등록은 목록 머리글의 행동이다 — 기본 진입에는
  // 폼이 없다(D-39, DECISIONS.md 2026-09-21).
  const showForm = newParam === "1";

  const [people, roles, orgUnits, teams, canArchive] = await Promise.all([
    listPeople(session.viewer),
    listRoles(session.viewer),
    listOrgUnits(session.viewer),
    listTeams(session.viewer),
    can(session.viewer, "admin.archive", "write"),
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

      {showForm ? (
        <PersonForm roles={roles} teams={teamOptions} cancelHref="/admin/people" />
      ) : people.length > 0 ? (
        // §6-1 「새 지출결의」와 같은 자리 — 목록 머리글의 등록 행동. 폼이
        // 열려 있으면 그 폼의 「취소」가 같은 역할을 하므로 이 줄 자체가 없다.
        // 목록이 비면 §7-7 EMPTY가 같은 이름·같은 곳의 「다음 한 수」를 이미
        // 보이므로 이 줄도 없다 — 같은 링크를 두 번 그리지 않는다.
        <div className={styles.filterRow}>
          <Link href="/admin/people?new=1#person-form" className={styles.toggle}>
            사람 등록
          </Link>
        </div>
      ) : null}

      {people.length === 0 ? (
        <ListEmpty message="등록된 사람이 없습니다" action={{ label: "사람 등록", href: "/admin/people?new=1#person-form" }} />
      ) : (
        <table className={`${styles.table} ${styles.peopleTable}`}>
          <caption className="sr-only">사람</caption>
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col" className={styles.prioP2}>
                이메일
              </th>
              <th scope="col" className={styles.prioP2}>
                계급
              </th>
              <th scope="col" className={styles.prioP2}>
                현재 소속
              </th>
              <th scope="col">상태</th>
              <th scope="col">동작</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person, index) => {
              // 행 머리글 id는 순번으로 — person.value가 꺼진 계급의 DTO에는 id가 없다(UI-SPEC 접근성 관계 ①).
              const nameId = `people-row-${index}-name`;
              const roleName = person.roleName ?? roleNameById.get(person.roleId ?? "") ?? "—";
              const teamName = person.currentTeamName ?? "—";
              const loginStatus = personLoginStatus(person);
              return (
                <Fragment key={person.id}>
                  <tr>
                    <th scope="row" id={nameId}>
                      {person.name}
                    </th>
                    <td className={styles.prioP2}>{person.email}</td>
                    <td className={styles.prioP2}>{roleName}</td>
                    <td className={styles.prioP2}>{teamName}</td>
                    <td>
                      {loginStatus.kind === "archived" ? (
                        <StatusTag kind="muted" variant="text">
                          보관됨
                        </StatusTag>
                      ) : loginStatus.badges.length === 0 ? (
                        "—"
                      ) : (
                        // D8-07: PC는 · 로 한 줄, 폰은 구분자를 숨기고 세로로 쌓는다.
                        <span className={styles.badges}>
                          {loginStatus.badges.map((badge, badgeIndex) => (
                            <Fragment key={badge}>
                              {badgeIndex > 0 ? <span className={styles.badgeSep}> · </span> : null}
                              <StatusTag kind="muted" variant="text">
                                {badge}
                              </StatusTag>
                            </Fragment>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      <Link href={`/admin/people/${person.id}`} className={styles.detailLink}>
                        상세
                      </Link>
                      {!person.archivedAt && canArchive ? (
                        <PersonDeleteButton userId={person.id} name={person.name} />
                      ) : null}
                    </td>
                  </tr>
                  {/* §7-3 폰 칸 접기: P2 값의 유일한 출처라 aria-hidden을 두지 않는다(UI-SPEC ④). */}
                  <tr className={styles.collapsedRow}>
                    <td colSpan={6} headers={nameId} className={styles.collapsedCell}>
                      <span className="sr-only">이메일 </span>
                      {person.email} · <span className="sr-only">계급 </span>
                      {roleName} · <span className="sr-only">현재 소속 </span>
                      {teamName}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
