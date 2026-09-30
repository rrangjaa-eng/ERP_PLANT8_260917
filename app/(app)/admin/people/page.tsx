import { notFound, redirect } from "next/navigation";
import { Fragment } from "react";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listPeople, type PersonDto } from "@/domain/people";
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
  const [people, roles, orgUnits, teams, canArchive, canWrite] = await Promise.all([
    listPeople(session.viewer),
    listRoles(session.viewer),
    listOrgUnits(session.viewer),
    listTeams(session.viewer),
    can(session.viewer, "admin.archive", "write"),
    can(session.viewer, "admin.people", "write"),
  ]);
  // §6-1: 목록이 화면이고 등록은 목록 머리글의 행동이다 — 기본 진입에는
  // 폼이 없다(D-39, DECISIONS.md 2026-09-21).
  // 쓰기 권한이 없으면 제출이 거부될 폼·링크를 보이지 않는다(§7 할 수 없는 선택지는 숨김). 거부 판정은 서버(createAccount).
  const showForm = newParam === "1" && canWrite;

  const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
  const orgUnitNameById = new Map(orgUnits.map((org) => [org.id, org.name]));
  const teamOptions = teams.map((team) => ({
    id: team.id,
    name: team.name,
    orgUnitName: orgUnitNameById.get(team.orgUnitId) ?? "",
  }));

  // 정보 노출표가 가린 필드는 투영된 DTO에 키가 없다(PERSON_DTO_SPEC · person-status.ts와 같은 키 부재 관례).
  // 가려진 정보의 열은 그리지 않는다(§7-3 칸 수 가변, DECISIONS.md 2026-09-30) — 계급마다 모든 행의 키 모양이 같다.
  const hasKey = (...keys: string[]) => people.some((person) => keys.some((key) => key in person));
  const textColumns = [
    { key: "name", label: "이름", visible: hasKey("name"), value: (person: PersonDto) => person.name },
    { key: "email", label: "이메일", visible: hasKey("email"), value: (person: PersonDto) => person.email },
    {
      key: "role",
      label: "계급",
      visible: hasKey("roleName", "roleId"),
      value: (person: PersonDto) => person.roleName ?? roleNameById.get(person.roleId ?? "") ?? "—",
    },
    { key: "team", label: "현재 소속", visible: hasKey("currentTeamName"), value: (person: PersonDto) => person.currentTeamName ?? "—" },
  ].filter((column) => column.visible);
  // 이름이 가려진 계급은 첫 보이는 문자 칸이 행 머리글이다(UI-SPEC 접근성 관계 ①의 이름 자리, §7-3 가려진 열은 그리지 않는다).
  const [rowHeaderColumn, ...foldedColumns] = textColumns;
  const showStatus = hasKey("archivedAt", "firstLoginAt", "passwordIsTemporary");
  const showActions = hasKey("id");
  const columnCount = textColumns.length + (showStatus ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <>
      <PageHeader title="사람" />

      {showForm ? (
        <PersonForm roles={roles} teams={teamOptions} cancelHref="/admin/people" />
      ) : canWrite && people.length > 0 ? (
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
      ) : !rowHeaderColumn ? (
        // 사람·계급·팀 정보가 모두 꺼진 계급(새 계급 기본값) — 보는 사람은 노출표를 바꿀 수 없어 다음 한 수 없이 사실만(§8-3).
        <ListEmpty message="정보 노출표 · 사람 정보 잠김" />
      ) : (
        <table className={`${styles.table} ${styles.peopleTable}`}>
          <caption className="sr-only">사람</caption>
          <thead>
            <tr>
              {textColumns.map((column) => (
                <th key={column.key} scope="col" className={column === rowHeaderColumn ? undefined : styles.prioP2}>
                  {column.label}
                </th>
              ))}
              {showStatus ? <th scope="col">상태</th> : null}
              {showActions ? <th scope="col">동작</th> : null}
            </tr>
          </thead>
          <tbody>
            {people.map((person, index) => {
              // 행 머리글 id는 순번으로 — person.value가 꺼진 계급의 DTO에는 id가 없다(UI-SPEC 접근성 관계 ①).
              const nameId = `people-row-${index}-name`;
              const loginStatus = personLoginStatus(person);
              return (
                <Fragment key={person.id ?? nameId}>
                  <tr>
                    <th scope="row" id={nameId}>
                      {rowHeaderColumn.value(person)}
                    </th>
                    {foldedColumns.map((column) => (
                      <td key={column.key} className={styles.prioP2}>
                        {column.value(person)}
                      </td>
                    ))}
                    {showStatus ? (
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
                    ) : null}
                    {showActions ? (
                      <td>
                        {/* person.value가 꺼진 계급의 DTO에는 id가 없다 — 갈 상세·보관할 대상이 없어 「상세」·삭제를 그리지 않는다. */}
                        {person.id ? (
                          <span className={styles.rowActions}>
                            <Link href={`/admin/people/${person.id}`} className={styles.detailLink}>
                              상세
                            </Link>
                            {!person.archivedAt && canArchive ? (
                              <PersonDeleteButton userId={person.id} name={person.name} />
                            ) : null}
                          </span>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                  {/* §7-3 폰 칸 접기: P2 값의 유일한 출처라 aria-hidden을 두지 않는다(UI-SPEC ④). 값이 없으면 줄이 없다(DR-5). */}
                  {foldedColumns.length > 0 ? (
                    <tr className={styles.collapsedRow}>
                      <td colSpan={columnCount} headers={nameId} className={styles.collapsedCell}>
                        {foldedColumns.map((column, foldedIndex) => (
                          <Fragment key={column.key}>
                            {foldedIndex > 0 ? " · " : null}
                            <span className="sr-only">{column.label} </span>
                            {column.value(person)}
                          </Fragment>
                        ))}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
