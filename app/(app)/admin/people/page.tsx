import { notFound, redirect } from "next/navigation";
import { Fragment } from "react";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listPeople } from "@/domain/people";
import { listRoles } from "@/domain/permissions/roles";
import { listOrgUnits, listTeams } from "@/domain/org";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { StaticTable, type StaticTableColumn } from "@/ui/table/StaticTable";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { PersonForm, PersonDeleteButton } from "./person-form";
import { personLoginStatus } from "./person-status";
import styles from "./people.module.css";

const NEW_PERSON_HREF = "/admin/people?new=1";

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

  // §6-1: 목록이 화면이고 등록은 목록 머리글의 행동이다 — 기본 진입에는 폼이
  // 없다(D-39, DECISIONS.md 2026-09-21). 쓰기 권한이 없으면 제출이 거부될
  // 폼을 그리지 않는다(표시 조건 — 서버 판정은 createAccount가 따로 한다).
  const showForm = newParam === "1" && canWrite;

  const orgUnitNameById = new Map(orgUnits.map((org) => [org.id, org.name]));
  const teamOptions = teams.map((team) => ({
    id: team.id,
    name: team.name,
    orgUnitName: orgUnitNameById.get(team.orgUnitId) ?? "",
  }));

  // 보이는 열은 투영된 DTO의 키 유무로 정한다 — PERSON_DTO_SPEC이 가린 키는 결과에 없다(person-status.ts와 같은 관례).
  const has = (key: string) => people.some((person) => key in person);
  type Person = (typeof people)[number];
  const textColumns: { key: string; label: string; value: (person: Person) => string | null | undefined }[] = [];
  if (has("name")) textColumns.push({ key: "name", label: "이름", value: (person) => person.name });
  if (has("email")) textColumns.push({ key: "email", label: "이메일", value: (person) => person.email });
  // 계급 이름은 role.value 소관이다 — roleId(person.value)만 있으면 계급 목록도 가려져 이름을 얻을 수 없다.
  if (has("roleName")) {
    textColumns.push({
      key: "role",
      label: "계급",
      value: (person) => person.roleName ?? "—",
    });
  }
  if (has("currentTeamName")) {
    textColumns.push({ key: "team", label: "현재 소속", value: (person) => person.currentTeamName ?? "—" });
  }
  const showStatus = has("archivedAt") || has("firstLoginAt") || has("passwordIsTemporary");
  const showActions = has("id");

  const columns: StaticTableColumn[] = [
    // 이름이 가려진 계급은 첫 보이는 문자 칸이 행 머리글 — UI-SPEC 접근성 관계 ①의 이름 자리(§7-3 가려진 열은 그리지 않는다).
    ...textColumns.map((column, columnIndex) => ({
      key: column.key,
      header: column.label,
      priority: columnIndex === 0 ? ("p1" as const) : ("p2" as const),
      rowHeader: columnIndex === 0,
    })),
    ...(showStatus ? [{ key: "status", header: "상태", priority: "p1" as const }] : []),
    ...(showActions ? [{ key: "actions", header: "동작", priority: "p1" as const }] : []),
  ];

  // DR5 A — 빈 목록이면 머리 1차를 그리지 않고 빈 화면의 「사람 등록」 하나가 등록을 맡는다.
  const primaryAction = canWrite && people.length > 0 ? { label: "사람 등록", href: NEW_PERSON_HREF } : undefined;

  return (
    <ListScreen
      title="사람"
      primaryAction={primaryAction}
      panel={
        showForm ? (
          <SidePanel title="사람 등록" closeHref="/admin/people">
            <PersonForm roles={roles} teams={teamOptions} />
          </SidePanel>
        ) : null
      }
    >
      {people.length === 0 ? (
        <ListEmpty
          message="등록된 사람이 없습니다"
          action={canWrite ? { label: "사람 등록", href: NEW_PERSON_HREF } : undefined}
        />
      ) : textColumns.length === 0 ? (
        // 사람 · 계급 · 팀 정보가 모두 꺼진 계급(새 계급 기본값) — 보는 사람이 바꿀 수 없는 잠김이라 행동이 없다.
        // 사람이 없다는 말이 아니다(보는 사람 자신이 늘 1행 — SYSTEM.md §7-3 · §8-3, DECISIONS.md 2026-09-30).
        <ListEmpty message="정보 노출표 · 사람 정보 잠김" />
      ) : (
        <StaticTable
          caption="사람"
          columns={columns}
          rows={people.map((person, index) => {
            // 행 머리글 id는 순번으로 — person.value가 꺼진 계급의 DTO에는 id가 없다(UI-SPEC 접근성 관계 ①).
            const nameId = `people-row-${index}-name`;
            const loginStatus = personLoginStatus(person);
            return {
              key: person.id ?? nameId,
              headerId: nameId,
              cells: [
                ...textColumns.map((column) => column.value(person)),
                ...(showStatus
                  ? [
                      loginStatus.kind === "archived" ? (
                        <StatusTag key="status" status="보관됨" variant="text" />
                      ) : loginStatus.badges.length === 0 ? (
                        "—"
                      ) : (
                        // D8-07: PC는 · 로 한 줄, 폰은 구분자를 숨기고 세로로 쌓는다.
                        <span key="status" className={styles.badges}>
                          {loginStatus.badges.map((badge, badgeIndex) => (
                            <Fragment key={badge}>
                              {badgeIndex > 0 ? <span className={styles.badgeSep}> · </span> : null}
                              <StatusTag status={badge} variant="text" />
                            </Fragment>
                          ))}
                        </span>
                      ),
                    ]
                  : []),
                ...(showActions
                  ? [
                      // person.value가 꺼진 계급의 DTO에는 id가 없다 — 갈 상세·보관할 대상이 없어 「상세」·삭제를 그리지 않는다.
                      person.id ? (
                        <RowActions key="actions">
                          <RowAction href={`/admin/people/${person.id}`}>상세</RowAction>
                          {!person.archivedAt && canArchive ? <PersonDeleteButton userId={person.id} name={person.name} /> : null}
                        </RowActions>
                      ) : null,
                    ]
                  : []),
              ],
            };
          })}
        />
      )}
    </ListScreen>
  );
}
