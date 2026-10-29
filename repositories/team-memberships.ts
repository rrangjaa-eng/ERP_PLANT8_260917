import { and, eq, gt, gte, inArray, isNull, lte, desc } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { orgUnits, permissionMatrix, roles, teamMemberships, teams, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { activeUserCondition } from "@/repositories/users";

export type TeamMembershipRow = InferSelectModel<typeof teamMemberships>;

// MAST-02: 발령일이 조회 날짜 이하인 행 중 가장 늦은 한 행(경계 포함) —
// domain/org/index.ts의 teamAtDate가 그대로 쓰는 시점 소속 조회.
// 07.1-14(E-P2-42): 사람 본부 저장이 사람 잠금 뒤 같은 tx로 다시 읽도록 tx를 받는다(기본은 풀).
export async function findMembershipAtDate(
  viewer: Viewer,
  userId: string,
  date: string,
  tx: DbOrTx = db,
): Promise<TeamMembershipRow | null> {
  const [row] = await tx
    .select()
    .from(teamMemberships)
    .where(and(eq(teamMemberships.userId, userId), lte(teamMemberships.effectiveFrom, date)))
    .orderBy(desc(teamMemberships.effectiveFrom))
    .limit(1);
  return row ?? null;
}

// 07.1-14(N-P2-B): 날짜 뒤에 시작하는 발령(예정 발령)이 하나라도 있나 — 예정 발령이 있는 동안 사람 본부를 다시 넣지 못하게 한다.
export async function hasMembershipAfterDate(viewer: Viewer, userId: string, date: string, tx: DbOrTx = db): Promise<boolean> {
  const [row] = await tx
    .select({ id: teamMemberships.id })
    .from(teamMemberships)
    .where(and(eq(teamMemberships.userId, userId), gt(teamMemberships.effectiveFrom, date)))
    .limit(1);
  return row !== undefined;
}

// 사람별로 발령일 ≤ date 중 가장 늦은 한 행을 한 번에 가져온다(목록 N+1
// 제거, 이슈 #56). unique(userId, effectiveFrom)이라 결정적이다.
export async function findMembershipsAtDate(
  viewer: Viewer,
  userIds: string[],
  date: string,
): Promise<TeamMembershipRow[]> {
  if (userIds.length === 0) return [];
  return db
    .selectDistinctOn([teamMemberships.userId])
    .from(teamMemberships)
    .where(and(inArray(teamMemberships.userId, userIds), lte(teamMemberships.effectiveFrom, date)))
    .orderBy(teamMemberships.userId, desc(teamMemberships.effectiveFrom));
}

// 발령일 내림차순 — 두 번 조회에서 순서가 같다(정렬 키가 결정적).
export async function listMemberships(viewer: Viewer, userId: string): Promise<TeamMembershipRow[]> {
  return db
    .select()
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, userId))
    .orderBy(desc(teamMemberships.effectiveFrom));
}

// 같은 (userId, effectiveFrom) 중복은 복합 UNIQUE가 거부한다(도메인은 사전
// 검증 뒤 이 함수를 부르므로 정상 경로에서 이 제약에 걸릴 일이 없다 —
// 사람 등록의 보상 조치가 다루는 것은 이 제약이 아니라 인프라 오류다).
export async function insertMembership(
  viewer: Viewer,
  input: { userId: string; teamId: string; effectiveFrom: string; createdBy?: string | null },
  tx: DbOrTx = db,
): Promise<TeamMembershipRow> {
  const [row] = await tx
    .insert(teamMemberships)
    .values({
      userId: input.userId,
      teamId: input.teamId,
      effectiveFrom: input.effectiveFrom,
      createdBy: input.createdBy ?? viewer.id,
    })
    .returning();
  if (!row) throw new Error("team_memberships insert가 행을 반환하지 않았습니다.");
  return row;
}

// 미래로 예정된 발령만 삭제한다 — "미래"의 판정은 domain(cancelFutureAssignment)이
// 하고, 이 함수는 (userId, effectiveFrom) 좌표의 행을 지우기만 한다(append-only
// 원칙: 과거·오늘 발령을 지우는 경로는 domain에 없다). 지운 행 id(복합 UNIQUE라 많아야 한 행), 없으면 null.
export async function deleteMembership(
  viewer: Viewer,
  userId: string,
  effectiveFrom: string,
  tx?: DbOrTx,
): Promise<string | null> {
  const [deleted] = await (tx ?? db)
    .delete(teamMemberships)
    .where(and(eq(teamMemberships.userId, userId), eq(teamMemberships.effectiveFrom, effectiveFrom)))
    .returning({ id: teamMemberships.id });
  return deleted?.id ?? null;
}

export type TeamMemberRow = { userId: string; teamId: string; orgUnitId: string };

// 07-21(R10 · AQ-28): 팀 · 본부 「소속」 한 술어 — 사람마다 발령일 ≤ today 중 가장 늦은 행의 팀(findMembershipsAtDate와 같은
// 꼴)이거나 발령일 > today인 행의 팀, 그리고 그날 활성 사람(activeUserCondition — 퇴직 · 보관 제외). 보관 팀도 센다.
// 화면 숫자 · 사람 목록 필터 · 팀/본부 보관 거부가 이 함수 하나를 부른다. 필터가 없으면 전부.
export async function activeTeamMembers(
  viewer: Viewer,
  input: { today: string; teamIds?: readonly string[]; orgUnitIds?: readonly string[] },
  tx: DbOrTx = db,
): Promise<TeamMemberRow[]> {
  if (input.teamIds?.length === 0 || input.orgUnitIds?.length === 0) return [];
  const orgUnitFilter = input.orgUnitIds ? [inArray(teams.orgUnitId, [...input.orgUnitIds])] : [];
  // 하위 질의는 글자만 만든다 — 실행은 아래 tx 질의 안에서(teamLeadCandidatesAtDate와 같은 꼴).
  const latest = db
    .selectDistinctOn([teamMemberships.userId], { userId: teamMemberships.userId, teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(lte(teamMemberships.effectiveFrom, input.today))
    .orderBy(teamMemberships.userId, desc(teamMemberships.effectiveFrom))
    .as("latest_memberships");
  const current = await tx
    .select({ userId: latest.userId, teamId: latest.teamId, orgUnitId: teams.orgUnitId })
    .from(latest)
    .innerJoin(users, eq(users.id, latest.userId))
    .innerJoin(teams, eq(teams.id, latest.teamId))
    .where(
      and(
        activeUserCondition(viewer, input.today),
        ...(input.teamIds ? [inArray(latest.teamId, [...input.teamIds])] : []),
        ...orgUnitFilter,
      ),
    );
  const future = await tx
    .select({ userId: teamMemberships.userId, teamId: teamMemberships.teamId, orgUnitId: teams.orgUnitId })
    .from(teamMemberships)
    .innerJoin(users, eq(users.id, teamMemberships.userId))
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(
      and(
        gt(teamMemberships.effectiveFrom, input.today),
        activeUserCondition(viewer, input.today),
        ...(input.teamIds ? [inArray(teamMemberships.teamId, [...input.teamIds])] : []),
        ...orgUnitFilter,
      ),
    );
  const seen = new Set<string>();
  return [...current, ...future].filter((row) => {
    const key = `${row.userId}:${row.teamId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 07-21 게이트 사용자 결정(2026-10-23 「막기」): 한 사람의 「소속」 팀 — activeTeamMembers와 같은 술어(발령일 ≤ today 중 가장 늦은 행 +
// 발령일 > today 행)에서 사람의 활성 여부만 뺀다. 복원 · 퇴직일 지우기로 활성이 되기 전에 그 팀 · 본부의 보관 여부를 본다.
// 호출자는 사람 자리 키(`lockSeatKeys` personIds — 그 사람의 발령 팀 · 본부 키 전부)를 먼저 잡는다 — 팀 · 본부 보관과 줄 선다.
export async function seatedTeamsOf(
  viewer: Viewer,
  userId: string,
  today: string,
  tx: DbOrTx,
): Promise<{ teamId: string; teamArchived: boolean; orgUnitArchived: boolean }[]> {
  void viewer;
  const [latest] = await tx
    .select({ effectiveFrom: teamMemberships.effectiveFrom })
    .from(teamMemberships)
    .where(and(eq(teamMemberships.userId, userId), lte(teamMemberships.effectiveFrom, today)))
    .orderBy(desc(teamMemberships.effectiveFrom))
    .limit(1);
  const rows = await tx
    .select({ teamId: teams.id, teamArchivedAt: teams.archivedAt, orgUnitArchivedAt: orgUnits.archivedAt })
    .from(teamMemberships)
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .innerJoin(orgUnits, eq(orgUnits.id, teams.orgUnitId))
    .where(
      and(
        eq(teamMemberships.userId, userId),
        latest ? gte(teamMemberships.effectiveFrom, latest.effectiveFrom) : gt(teamMemberships.effectiveFrom, today),
      ),
    );
  return rows.map((row) => ({
    teamId: row.teamId,
    teamArchived: row.teamArchivedAt !== null,
    orgUnitArchived: row.orgUnitArchivedAt !== null,
  }));
}

// 04-11(사용자 D20 · 엔지 리뷰 A §1 P2): 팀장 후보 — date에 그 팀에 발령된 사람(사람마다 가장
// 늦은 발령, findMembershipsAtDate와 같은 조건) 중 보관되지 않았고, 계급의 업무 범위가 team이며
// 권한표에서 projects.status 쓰기가 허용된 사람. 한 문장이다(사람 × 발령 × 권한 N+1 없음).
// 계급 이름·id를 박지 않는다. 이름순은 호출자가 JS로 정한다(DB 정렬 규칙이 환경마다 다르다).
// 04-22(리뷰 S4): 기간 앞당기기 문구는 menu "projects.period"로 기간 쓰기 보유자에서 찾는다.
export async function teamLeadCandidatesAtDate(
  viewer: Viewer,
  input: { teamId: string; date: string; menu?: "projects.status" | "projects.period" },
  tx?: DbOrTx,
): Promise<{ userId: string; name: string }[]> {
  void viewer;
  const latest = db
    .selectDistinctOn([teamMemberships.userId], { userId: teamMemberships.userId, teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(lte(teamMemberships.effectiveFrom, input.date))
    .orderBy(teamMemberships.userId, desc(teamMemberships.effectiveFrom))
    .as("latest_memberships");
  return (tx ?? db)
    .select({ userId: users.id, name: users.name })
    .from(latest)
    .innerJoin(users, eq(users.id, latest.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .innerJoin(
      permissionMatrix,
      and(
        eq(permissionMatrix.roleId, roles.id),
        eq(permissionMatrix.menu, input.menu ?? "projects.status"),
        eq(permissionMatrix.action, "write"),
        eq(permissionMatrix.allowed, true),
      ),
    )
    .where(and(eq(latest.teamId, input.teamId), isNull(users.archivedAt), eq(roles.workScope, "team")));
}
