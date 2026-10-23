import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec, type ProjectDeps } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { assertCanGrantRoles } from "@/domain/permissions/grant-ceiling";
import { assertSeatsFree, newSeats } from "@/domain/people/seat-rules";
import type { DbOrTx } from "@/repositories/document-counters";
import { listOccupiedTeams, lockSeatKeys, type OccupiedTeamRow } from "@/repositories/seats";
import { findUserById as repoFindUserById, type UserRow } from "@/repositories/users";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { kstToday } from "@/lib/kst-date";
import { withTransaction } from "@/lib/db-transaction";
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
export class ValidationError extends UserFacingError {}

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
    throw new NotFoundError(`본부 찾을 수 없음: ${input.orgUnitId}`);
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
  now: () => Date;
  visible: typeof defaultVisible;
};

// 발령 쓰기(추가 · 취소) 전후 점유 구간의 차가 새 자리면 보유자와 겹침을 본다 — 계급은 그대로라 앞뒤 같은 계급 · 고용.
async function assertAssignmentSeatsFree(
  viewer: Viewer,
  input: { person: UserRow | null; before: readonly OccupiedTeamRow[]; after: readonly OccupiedTeamRow[]; today: string; showNames: boolean },
  tx: DbOrTx,
): Promise<void> {
  const { person } = input;
  if (!person?.roleId) return;
  const seats = newSeats({
    roleBefore: person.roleId,
    roleAfter: person.roleId,
    employedBefore: person,
    employedAfter: person,
    occupiedBefore: input.before,
    occupiedAfter: input.after,
  });
  await assertSeatsFree(viewer, { userId: person.id, roleId: person.roleId, seats, today: input.today, showNames: input.showNames }, tx);
}

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
    throw new NotFoundError(`팀 찾을 수 없음: ${input.teamId}`);
  }

  // 06.4(D-6404 · D-6408 · D-6415): 사람 키 → 점유 구간(전) → 쓰기 → 점유 구간(후) → 팀/본부 키 → 보유자 구간 겹침. 대상이
  // 지금 팀장이 아니어도 사람 키를 잡는다 — 계급 변경과 겹치는 경합(RESEARCH 동시성 설계). 없는 사람은 자리 계산 없이 쓰기의
  // 외래키가 거부한다(기존 동작).
  const today = kstToday((deps?.now ?? (() => new Date()))());
  const showNames = await (deps?.visible ?? defaultVisible)(viewer, "person.value");
  const insertMembership = deps?.insertMembership ?? repoInsertMembership;
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await withTransaction(async (tx) => {
    // 06.4 /cso: 발령할 팀(보관이어도)의 팀 · 본부 키도 같은 층 정렬로 먼저 — 팀 복원과 줄 서고 뒤 자리 키는 다시 기다리지 않는다.
    await lockSeatKeys(viewer, { personIds: [input.userId], teamIds: [input.teamId] }, tx);
    const person = await repoFindUserById(viewer, input.userId, tx);
    // 07-17 R15: 대상 계급이 내 상한 밖이면 발령하지 못한다 — 화면 숨김은 UX일 뿐(퇴직일 진입점과 같은 잠금 뒤 재조회 판정).
    await assertCanGrantRoles(viewer, [person?.roleId ?? null], tx);
    const before = await listOccupiedTeams(viewer, input.userId, today, tx);
    const row = await insertMembership(viewer, input, tx);
    const after = await listOccupiedTeams(viewer, input.userId, today, tx);
    await assertAssignmentSeatsFree(viewer, { person, before, after, today, showNames }, tx);
    await recordAction(viewer, { actionType: "document_create", entity: "team_membership", entityId: row.id }, { tx });
  });
}

export type CancelAssignmentDeps = {
  can: typeof defaultCan;
  deleteMembership: typeof repoDeleteMembership;
  recordAction: typeof defaultRecordAction;
  now: () => Date;
  visible: typeof defaultVisible;
};

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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

  // 아래 판정은 문자열 비교라 실제 YYYY-MM-DD 날짜가 아니면 Postgres가 다른 날짜로
  // 읽어 과거 발령을 지우거나(예: "2026-9-30") 쿼리가 실패한다(예: "2027-02-30").
  if (!isIsoDate(input.effectiveFrom)) {
    throw new ValidationError("발령일 형식 오류 — YYYY-MM-DD로");
  }
  const now = deps?.now ?? (() => new Date());
  const today = kstToday(now());
  if (input.effectiveFrom <= today) {
    throw new PastAssignmentCancelError("과거·오늘 발령은 취소할 수 없음 — 미래로 예정된 발령만 취소 가능");
  }

  // quick 261001-85g — 삭제와 document_delete 기록을 한 트랜잭션에 묶는다(기록이 실패하면 발령도 남는다).
  // 행이 사라진 뒤에도 누구의 어떤 발령이었는지 남도록 detail에 사람 · 발령일을 싣는다.
  // 06.4 D-6415 사용자 확정(2026-10-11 카드): 미래 발령을 지우면 앞 팀 구간이 다시 열린다 — 그 사이 앞 팀에 예약된 후임과
  // 겹치면 거부(Pitfall 1). CONTEXT 재량(대상 아님)보다 오케스트레이터 O1 · D-6415가 앞선다.
  const showNames = await (deps?.visible ?? defaultVisible)(viewer, "person.value");
  const deleteMembership = deps?.deleteMembership ?? repoDeleteMembership;
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await withTransaction(async (tx) => {
    await lockSeatKeys(viewer, { personIds: [input.userId] }, tx);
    const person = await repoFindUserById(viewer, input.userId, tx);
    // 07-17 R15: 대상 계급이 내 상한 밖이면 미래 발령도 취소하지 못한다 — assignTeam과 같은 잠금 뒤 재조회 판정.
    await assertCanGrantRoles(viewer, [person?.roleId ?? null], tx);
    const before = await listOccupiedTeams(viewer, input.userId, today, tx);
    const deletedId = await deleteMembership(viewer, input.userId, input.effectiveFrom, tx);
    if (deletedId === null) {
      throw new NotFoundError("취소할 발령 찾을 수 없음");
    }
    const after = await listOccupiedTeams(viewer, input.userId, today, tx);
    await assertAssignmentSeatsFree(viewer, { person, before, after, today, showNames }, tx);
    await recordAction(
      viewer,
      {
        actionType: "document_delete",
        entity: "team_membership",
        entityId: deletedId,
        detail: { userId: input.userId, effectiveFrom: input.effectiveFrom },
      },
      { tx },
    );
  });
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
