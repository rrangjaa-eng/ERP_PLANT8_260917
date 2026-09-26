import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec, type ProjectDeps } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import {
  listOrgUnits as repoListOrgUnits,
  findOrgUnitById as repoFindOrgUnitById,
  insertOrgUnit as repoInsertOrgUnit,
  renameOrgUnit as repoRenameOrgUnit,
  type OrgUnitRow,
} from "@/repositories/org-units";
import {
  listTeams as repoListTeams,
  findTeamById as defaultFindTeamById,
  findTeamsByIds as defaultFindTeamsByIds,
  insertTeam as repoInsertTeam,
  renameTeam as repoRenameTeam,
  type TeamRow,
} from "@/repositories/teams";
import {
  findMembershipAtDate as defaultFindMembershipAtDate,
  findMembershipsAtDate as defaultFindMembershipsAtDate,
  listMemberships as repoListMemberships,
  insertMembership as repoInsertMembership,
  deleteMembership as repoDeleteMembership,
} from "@/repositories/team-memberships";

export class ForbiddenError extends UserFacingError {}
export class NotFoundError extends UserFacingError {}
export class PastAssignmentCancelError extends UserFacingError {}

const PEOPLE_MENU = "admin.people";

// MAST-02: 본부 DTO. 구조/식별 정보 하나뿐이라 code_item 패턴처럼 항목 하나로
// 게이트한다.
export type OrgUnitDto = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: Date | null;
};

export const ORG_UNIT_DTO_SPEC: DtoSpec<OrgUnitRow, OrgUnitDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "org_unit.value" },
    { key: "name", from: "name", infoItem: "org_unit.value" },
    { key: "sortOrder", from: "sortOrder", infoItem: "org_unit.value" },
    { key: "archivedAt", from: "archivedAt", infoItem: "org_unit.value" },
  ],
};

registerDto({
  name: "OrgUnitDto",
  fields: ORG_UNIT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type TeamDto = {
  id: string;
  orgUnitId: string;
  name: string;
  sortOrder: number;
  archivedAt: Date | null;
};

export const TEAM_DTO_SPEC: DtoSpec<TeamRow, TeamDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "team.value" },
    { key: "orgUnitId", from: "orgUnitId", infoItem: "team.value" },
    { key: "name", from: "name", infoItem: "team.value" },
    { key: "sortOrder", from: "sortOrder", infoItem: "team.value" },
    { key: "archivedAt", from: "archivedAt", infoItem: "team.value" },
  ],
};

registerDto({
  name: "TeamDto",
  fields: TEAM_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// 발령 이력 한 행 — team 이름을 미리 합쳐 둔 "row 같은" 객체를 project()에
// 넘긴다(리포지토리는 join하지 않고 InferSelectModel 그대로 둔다 —
// TeamMembershipRow 계약을 지킨다. team 이름 합성은 domain의 일이다).
export type TeamAssignmentDto = {
  userId: string;
  teamId: string;
  teamName: string;
  effectiveFrom: string;
};

type TeamAssignmentSource = TeamAssignmentDto;

export const TEAM_ASSIGNMENT_DTO_SPEC: DtoSpec<TeamAssignmentSource, TeamAssignmentDto> = {
  fields: [
    { key: "userId", from: "userId", infoItem: "team_assignment.value" },
    { key: "teamId", from: "teamId", infoItem: "team_assignment.value" },
    { key: "teamName", from: "teamName", infoItem: "team_assignment.value" },
    { key: "effectiveFrom", from: "effectiveFrom", infoItem: "team_assignment.value" },
  ],
};

registerDto({
  name: "TeamAssignmentDto",
  fields: TEAM_ASSIGNMENT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

async function assertPeopleWrite(viewer: Viewer, can: typeof defaultCan): Promise<void> {
  if (!(await can(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("조직 관리 권한 없음");
  }
}

export async function listOrgUnits(viewer: Viewer): Promise<OrgUnitDto[]> {
  const scope = await scopeFor(viewer, "org_unit");
  const rows = await repoListOrgUnits(viewer, { scope });
  return Promise.all(rows.map((row) => project(viewer, row, ORG_UNIT_DTO_SPEC))) as Promise<OrgUnitDto[]>;
}

export async function listTeams(viewer: Viewer): Promise<TeamDto[]> {
  const scope = await scopeFor(viewer, "team");
  const rows = await repoListTeams(viewer, { scope });
  return Promise.all(rows.map((row) => project(viewer, row, TEAM_DTO_SPEC))) as Promise<TeamDto[]>;
}

export type OrgWriteDeps = { can: typeof defaultCan; recordAction: typeof defaultRecordAction };

export async function createOrgUnit(
  viewer: Viewer,
  input: { name: string; sortOrder?: number },
  deps?: Partial<OrgWriteDeps>,
): Promise<OrgUnitDto> {
  await assertPeopleWrite(viewer, deps?.can ?? defaultCan);
  const row = await repoInsertOrgUnit(viewer, input);
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: "org_unit", entityId: row.id });
  return (await project(viewer, row, ORG_UNIT_DTO_SPEC)) as OrgUnitDto;
}

export async function renameOrgUnit(
  viewer: Viewer,
  id: string,
  name: string,
  deps?: Partial<OrgWriteDeps>,
): Promise<void> {
  await assertPeopleWrite(viewer, deps?.can ?? defaultCan);
  await repoRenameOrgUnit(viewer, id, name);
}

export async function createTeam(
  viewer: Viewer,
  input: { orgUnitId: string; name: string; sortOrder?: number },
  deps?: Partial<OrgWriteDeps>,
): Promise<TeamDto> {
  await assertPeopleWrite(viewer, deps?.can ?? defaultCan);

  const orgUnit = await repoFindOrgUnitById(viewer, input.orgUnitId);
  if (!orgUnit) {
    throw new NotFoundError(`본부를 찾을 수 없습니다: ${input.orgUnitId}`);
  }

  const row = await repoInsertTeam(viewer, input);
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: "team", entityId: row.id });
  return (await project(viewer, row, TEAM_DTO_SPEC)) as TeamDto;
}

export async function renameTeam(
  viewer: Viewer,
  id: string,
  name: string,
  deps?: Partial<OrgWriteDeps>,
): Promise<void> {
  await assertPeopleWrite(viewer, deps?.can ?? defaultCan);
  await repoRenameTeam(viewer, id, name);
}

// Phase 5·10의 계약 — 발령일이 조회 날짜 이하인 행 중 가장 늦은 것의 팀
// Dto를 돌려준다. 해당 행이 없으면(발령 이력이 없거나 전부 미래) null을
// 돌려준다 — 호출자가 그 null을 처리한다(임의의 기본 팀으로 떨어지지 않는다).
export type TeamAtDateDeps = {
  findMembershipAtDate: typeof defaultFindMembershipAtDate;
  findTeamById: typeof defaultFindTeamById;
  // project()가 내부적으로 visible()→리포지토리를 거쳐 실제 DB를 연다 —
  // 단위 테스트가 DB 없이 돌려면 이 계층까지 스텁할 수 있어야 한다.
  project: typeof project;
};

export async function teamAtDate(
  viewer: Viewer,
  userId: string,
  date: string,
  deps?: Partial<TeamAtDateDeps>,
): Promise<TeamDto | null> {
  const findMembershipAtDate = deps?.findMembershipAtDate ?? defaultFindMembershipAtDate;
  const membership = await findMembershipAtDate(viewer, userId, date);
  if (!membership) return null;

  const findTeamById = deps?.findTeamById ?? defaultFindTeamById;
  const team = await findTeamById(viewer, membership.teamId);
  if (!team) return null;

  const projectFn = deps?.project ?? project;
  return (await projectFn(viewer, team, TEAM_DTO_SPEC)) as TeamDto;
}

// teamAtDate의 묶음판. deps.visible로 호출자가 노출 판정을 메모이즈할 수 있다.
export async function teamsAtDate(
  viewer: Viewer,
  userIds: string[],
  date: string,
  deps?: Partial<ProjectDeps>,
): Promise<Map<string, TeamDto>> {
  const memberships = await defaultFindMembershipsAtDate(viewer, userIds, date);
  const teamIds = [...new Set(memberships.map((m) => m.teamId))];
  const teams = await defaultFindTeamsByIds(viewer, teamIds);

  const teamDtoById = new Map<string, TeamDto>();
  await Promise.all(
    teams.map(async (team) => {
      teamDtoById.set(team.id, (await project(viewer, team, TEAM_DTO_SPEC, deps)) as TeamDto);
    }),
  );

  const result = new Map<string, TeamDto>();
  for (const membership of memberships) {
    const teamDto = teamDtoById.get(membership.teamId);
    if (teamDto) result.set(membership.userId, teamDto);
  }
  return result;
}

export type AssignTeamDeps = {
  can: typeof defaultCan;
  findTeamById: typeof defaultFindTeamById;
  insertMembership: typeof repoInsertMembership;
  recordAction: typeof defaultRecordAction;
};

// 사람 메뉴 쓰기 권한 확인 → 대상 팀 실재 확인(원시 SQL FK 에러 대신 사람이
// 읽는 메시지) → 복합 UNIQUE로 같은 발령일 중복 거부(리포지토리 레벨) →
// recordAction으로 발령 기록.
export async function assignTeam(
  viewer: Viewer,
  input: { userId: string; teamId: string; effectiveFrom: string },
  deps?: Partial<AssignTeamDeps>,
): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  await assertPeopleWrite(viewer, canFn);

  const findTeamById = deps?.findTeamById ?? defaultFindTeamById;
  const team = await findTeamById(viewer, input.teamId);
  if (!team) {
    throw new NotFoundError(`팀을 찾을 수 없습니다: ${input.teamId}`);
  }

  const insertMembership = deps?.insertMembership ?? repoInsertMembership;
  const row = await insertMembership(viewer, input);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: "team_membership", entityId: row.id });
}

export type CancelAssignmentDeps = {
  can: typeof defaultCan;
  deleteMembership: typeof repoDeleteMembership;
  now: () => Date;
};

function todayIsoDate(now: () => Date): string {
  return now().toISOString().slice(0, 10);
}

// append-only 원칙: 발령일이 오늘 이전(또는 오늘)이면 거부한다 — 미래로
// 예정된 발령만 취소할 수 있다.
export async function cancelFutureAssignment(
  viewer: Viewer,
  input: { userId: string; effectiveFrom: string },
  deps?: Partial<CancelAssignmentDeps>,
): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  await assertPeopleWrite(viewer, canFn);

  const now = deps?.now ?? (() => new Date());
  if (input.effectiveFrom <= todayIsoDate(now)) {
    throw new PastAssignmentCancelError("과거·오늘 발령은 취소할 수 없음 — 미래로 예정된 발령만 취소 가능");
  }

  const deleteMembership = deps?.deleteMembership ?? repoDeleteMembership;
  const deleted = await deleteMembership(viewer, input.userId, input.effectiveFrom);
  if (deleted === 0) {
    throw new NotFoundError("취소할 발령 찾을 수 없음");
  }
}

// 사람 상세 화면의 §7-14 이력 목록이 그대로 쓰는 발령 이력 전체 — 발령일
// 내림차순(리포지토리 정렬을 그대로 물려받는다).
export async function listAssignments(viewer: Viewer, userId: string): Promise<TeamAssignmentDto[]> {
  const memberships = await repoListMemberships(viewer, userId);
  if (memberships.length === 0) return [];

  const teamIds = [...new Set(memberships.map((m) => m.teamId))];
  const teamNames = new Map<string, string>();
  await Promise.all(
    teamIds.map(async (teamId) => {
      const team = await defaultFindTeamById(viewer, teamId);
      if (team) teamNames.set(teamId, team.name);
    }),
  );

  return Promise.all(
    memberships.map((m) =>
      project(
        viewer,
        {
          userId: m.userId,
          teamId: m.teamId,
          teamName: teamNames.get(m.teamId) ?? "",
          effectiveFrom: m.effectiveFrom,
        },
        TEAM_ASSIGNMENT_DTO_SPEC,
      ),
    ),
  ) as Promise<TeamAssignmentDto[]>;
}
