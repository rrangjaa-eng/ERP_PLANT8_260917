import type { Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { recordAction } from "@/domain/action-log/record";
import { GateBlockedError } from "@/domain/rules/gate";
import { denyWrite } from "@/domain/rules/deny-write";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { CEO_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { projectRowScope } from "@/domain/projects/visibility";
import { coversProjectTeam, ForbiddenError, loadActorTeamScope } from "@/domain/projects/status";
import { withTransaction } from "@/lib/db-transaction";
import { kstToday } from "@/lib/kst-date";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import type { DbOrTx } from "@/repositories/document-counters";
import { findProjectInScope, lockProjectForWrite, type ProjectRow } from "@/repositories/projects";
import { findLatestMemberChangeFor } from "@/repositories/action-log";
import { listOrgSnapshot, type OrgSnapshotRow } from "@/repositories/org-snapshot";
import { listActiveUserIdsAllowed } from "@/repositories/permissions";
import { findTeamById, findTeamsByIds } from "@/repositories/teams";
import { findUserNamesByIds } from "@/repositories/users";
import {
  archiveLiveMember,
  findLiveMemberUserIds,
  findPersonRow,
  listLiveMembersWithPeople,
  restoreArchivedMember,
  reviveOrInsertMembers,
  type MemberPersonRow,
} from "@/repositories/project-members";

// 06.2-05(D-6209~D-6213 · D-6222 · D-6223): 프로젝트 참여자 — 담당 팀 밖 사람을 붙이고 뗀다. 보이는 행은 rowScopeFor 번역기의
// 참여 조각(06.2-03 · 04)이 이미 처리한다 — 이 파일은 줄을 붙이고 떼는 일과 그 권리 · 후보 · 로그만 한다.
// 260907 대조:
//  - 후보 `O: server/src/projects.ts:3889-3935`(담당 팀의 본부 + 본부 없는 사람 − 시스템 관리자 직책 · 담당 팀 · 이미 붙음) ↔ 본부 없는 사람은 대표 계급만(D-6221)
//  - 붙이기 `O: server/src/projects.ts:3949-4010`(보임 → 권리 → 잠금 · 한 명이라도 걸리면 전체 취소 `:3946-3947` · 되살림 뒤 삽입 `:3994-4007`)
//  - 떼기 `O: server/src/projects.ts:4028-4060`(보임 → 권리 → 잠금 `:4050` · archived_at)
// 권리는 260907 canManage(보는 범위, `O: server/src/projects.ts:727-745`)와 달리 키 projects.member 쓰기 ∧ (담당 PM ∨ 업무 범위가 그 팀을 덮음)(D-6210).

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_ENTITY = "project";
const MEMBER_ACTION = "project_member_change";
const NOT_PROCESSED = "처리 실패 · 다시 시도";
const LOCKED = "완료 프로젝트 · 참여자 잠김";
const NO_CHANGE_RIGHT = "참여자 변경 권한 없음";
const CANDIDATE_LIMIT = 50;
// 되돌리기 기한 — 뗀 뒤 이 안에서만(I-1 · 사용자 결정 2026-10-08 「10분 안만」). 그 뒤엔 더하기(후보 검사)로.
const RESTORE_WINDOW_MS = 10 * 60_000;

// 참여자 표 한 행(담당 PM 행도 같은 투영 — UI-SPEC S2). 이름 · 팀만 — 가릴 금액이 없다.
export type ProjectMemberDto = { userId: string; name: string; teamName: string | null; retired: boolean; archived: boolean };
type MemberSource = ProjectMemberDto;

const PROJECT_MEMBER_DTO_SPEC: DtoSpec<MemberSource, ProjectMemberDto> = {
  fields: [
    { key: "userId", from: "userId", infoItem: "person.value" },
    { key: "name", from: "name", infoItem: "person.value" },
    { key: "teamName", from: "teamName", infoItem: "team.value" },
    { key: "retired", from: "retired", infoItem: "person.value" },
    { key: "archived", from: "archived", infoItem: "person.value" },
  ],
};

registerDto({
  name: "ProjectMemberDto",
  fields: PROJECT_MEMBER_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type ProjectMemberCandidateDto = { userId: string; name: string; teamName: string | null };

const PROJECT_MEMBER_CANDIDATE_DTO_SPEC: DtoSpec<ProjectMemberCandidateDto, ProjectMemberCandidateDto> = {
  fields: [
    { key: "userId", from: "userId", infoItem: "person.value" },
    { key: "name", from: "name", infoItem: "person.value" },
    { key: "teamName", from: "teamName", infoItem: "team.value" },
  ],
};

registerDto({
  name: "ProjectMemberCandidateDto",
  fields: PROJECT_MEMBER_CANDIDATE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// 보임 판정 뒤의 사실 — 범위 밖이면 null(존재 여부를 새지 않는다, T-06.2-52). 판정은 트랜잭션 전 전역 db로(04-32).
type ManagedProject = { project: ProjectRow; manage: boolean };

async function loadManagedProject(viewer: Viewer, projectId: string, todayKst: string): Promise<ManagedProject | null> {
  if (!UUID_SHAPE.test(projectId)) return null;
  const scope = await projectRowScope(viewer);
  const project = await findProjectInScope(viewer, scope, projectId);
  if (!project || (project.archivedAt !== null && !scope.includeArchived)) return null;
  const [key, teamScope] = await Promise.all([
    can(viewer, "projects.member", "write"),
    loadActorTeamScope(viewer, { todayKst }),
  ]);
  // 참여 여부는 권리가 아니다(D-6213 · T-06.2-51) — 기존 쓰기 게이트와 같은 담당 PM ∨ 업무 범위.
  // 업무 범위 갈래는 참여 조각을 뺀 보는 범위로 보일 때만 인정한다(검토 반영 I-2 · 사용자 결정 2026-10-08 「막기」 — 260907
  // `O: server/src/projects.ts:705-711`이 참여 조건을 뺀 이유). 전사 업무 범위 계급이 참여자가 돼도 관리하지 못한다.
  const pm = project.pmUserId === viewer.id;
  const work =
    key &&
    !pm &&
    coversProjectTeam(teamScope, project.teamId) &&
    (await findProjectInScope(viewer, scope, projectId, undefined, { excludeMembership: true })) !== null;
  return { project, manage: key && (pm || work) };
}

function editable(facts: ManagedProject): boolean {
  return facts.manage && facts.project.status !== "completed" && facts.project.archivedAt === null;
}

// 이름은 person.value 투영을 지난다(검토 반영 M-1 — 06.2 F-3과 같은 꼴: 못 보면 빈 이름 → 이름 없는 문구).
async function personNameOf(viewer: Viewer, userId: string): Promise<string> {
  if (!(await visible(viewer, "person.value"))) return "";
  return (await findUserNamesByIds(viewer, [userId])).get(userId) ?? "";
}

// ── 후보(D-6211 · D-6221) ───────────────────────────────────────────────────
// 후보 계산의 입력 범위 — 담당 본부 사람 + 본부 없는 대표. 거부 문구가 이름을 실어도 되는 사람도 이 범위다(/cso M-1(a)).
function inCandidateRange(person: OrgSnapshotRow, division: string | null): boolean {
  return (division !== null && person.orgUnitId === division) || (person.orgUnitId === null && person.roleId === CEO_ROLE_ID);
}

async function candidateRangeIds(viewer: Viewer, project: ProjectRow, todayKst: string): Promise<Set<string>> {
  const [team, people] = await Promise.all([findTeamById(viewer, project.teamId), listOrgSnapshot(viewer, todayKst)]);
  const division = team?.orgUnitId ?? null;
  return new Set(people.filter((person) => inCandidateRange(person, division)).map((person) => person.id));
}

// 후보 목록 · 더하기 재판정 · hasCandidates가 이 하나를 부른다(같은 질의 — UI-SPEC S2). 오늘(KST) 조직 스냅숏은 보관된 사람 ·
// 퇴직일 < 오늘을 이미 뺐다(퇴직일 = 오늘은 남는다). 발령 없는 신규자는 본부가 null이라 대표 계급이 아니면 빠진다.
async function computeMemberCandidates(viewer: Viewer, project: ProjectRow, todayKst: string): Promise<OrgSnapshotRow[]> {
  const [team, people, live, viewers] = await Promise.all([
    findTeamById(viewer, project.teamId),
    listOrgSnapshot(viewer, todayKst),
    findLiveMemberUserIds(viewer, project.id),
    // 붙여도 아무것도 못 보는 사람 제외 — 260907 후보 질의엔 없던 조건(`O: server/src/projects.ts:3890` 호출자 권한만, C7 · eng N9).
    listActiveUserIdsAllowed(viewer, [{ menu: "projects", action: "view" }]),
  ]);
  const division = team?.orgUnitId ?? null;
  const canView = new Set(viewers);
  return people.filter(
    (person) =>
      inCandidateRange(person, division) &&
      // 권한 판정이 아니라 후보 제외 — Pitfall 6: 260907 `O: server/src/projects.ts:3925` 직책 문자열 대신 계급 id 상수.
      person.roleId !== SYSADMIN_ROLE_ID &&
      person.teamId !== project.teamId &&
      // 담당 PM은 섹션 첫 행에 따로 — 후보로 붙으면 두 줄이다(260907 `O: server/src/projects.ts:3909`는 담당 팀만 뺐다, R2-I2).
      person.id !== project.pmUserId &&
      !live.has(person.id) &&
      canView.has(person.id),
  );
}

// canEdit이 거짓이면 계산하지 않는다(T-06.2-56).
async function hasCandidatesFor(viewer: Viewer, facts: ManagedProject, todayKst: string): Promise<boolean> {
  if (!editable(facts)) return false;
  return (await computeMemberCandidates(viewer, facts.project, todayKst)).length > 0;
}

export type ProjectMemberRights = { canEdit: boolean; locked: boolean; pmName: string | null; hasCandidates: boolean };

export async function projectMemberRights(viewer: Viewer, projectId: string): Promise<ProjectMemberRights> {
  const todayKst = kstToday(new Date());
  const facts = await loadManagedProject(viewer, projectId, todayKst);
  if (!facts) return { canEdit: false, locked: false, pmName: null, hasCandidates: false };
  return {
    canEdit: editable(facts),
    locked: facts.manage && facts.project.status === "completed",
    pmName: (await personNameOf(viewer, facts.project.pmUserId)) || null,
    hasCandidates: await hasCandidatesFor(viewer, facts, todayKst),
  };
}

// ── 읽기 ────────────────────────────────────────────────────────────────────
function memberSource(row: MemberPersonRow, todayKst: string): MemberSource {
  return {
    userId: row.userId,
    name: row.name,
    teamName: row.teamName,
    // 퇴직일 ≥ 오늘이면 재직 — 퇴직 표시는 다음 날부터(UI-SPEC E6).
    retired: row.resignationDate !== null && row.resignationDate < todayKst,
    archived: row.userArchivedAt !== null,
  };
}

export type ProjectMembersView = {
  pm: Partial<ProjectMemberDto> | null;
  rows: Array<Partial<ProjectMemberDto>>;
  canEdit: boolean;
  locked: boolean;
  hasCandidates: boolean;
};

// 범위 밖이면 null. 담당 PM은 참여자 줄이 아니라 읽기 행으로 따로 내린다(design B2 — 260907은 개요 카드 별도 줄 `O: app/src/pages/Projects.tsx:1686`).
export async function listProjectMembers(viewer: Viewer, projectId: string): Promise<ProjectMembersView | null> {
  const todayKst = kstToday(new Date());
  const facts = await loadManagedProject(viewer, projectId, todayKst);
  if (!facts) return null;
  const [memberRows, pmRow, hasCandidates] = await Promise.all([
    listLiveMembersWithPeople(viewer, projectId, todayKst),
    findPersonRow(viewer, facts.project.pmUserId, todayKst),
    hasCandidatesFor(viewer, facts, todayKst),
  ]);
  const sources = memberRows.map((row) => memberSource(row, todayKst));
  const projected = await projectMany(viewer, pmRow ? [memberSource(pmRow, todayKst), ...sources] : sources, PROJECT_MEMBER_DTO_SPEC);
  return {
    pm: pmRow ? (projected[0] ?? null) : null,
    rows: pmRow ? projected.slice(1) : projected,
    canEdit: editable(facts),
    locked: facts.manage && facts.project.status === "completed",
    hasCandidates,
  };
}

// 보임 ∧ canEdit이 아니면 빈 결과(화면이 열 수 없는 자리). 검색어는 이름 · 팀 이름 부분 일치, 이름순 50행 상한.
export async function listMemberCandidates(
  viewer: Viewer,
  projectId: string,
  input: { query?: string },
): Promise<{ rows: Array<Partial<ProjectMemberCandidateDto>>; truncated: boolean }> {
  const todayKst = kstToday(new Date());
  const facts = await loadManagedProject(viewer, projectId, todayKst);
  if (!facts || !editable(facts)) return { rows: [], truncated: false };
  const people = await computeMemberCandidates(viewer, facts.project, todayKst);
  const teamIds = [...new Set(people.flatMap((person) => (person.teamId ? [person.teamId] : [])))];
  const teamNames = new Map((await findTeamsByIds(viewer, teamIds)).map((team) => [team.id, team.name]));
  const query = input.query?.trim() ?? "";
  const matched = people
    .map((person) => ({ userId: person.id, name: person.name, teamName: person.teamId ? (teamNames.get(person.teamId) ?? null) : null }))
    .filter((row) => query === "" || row.name.includes(query) || (row.teamName ?? "").includes(query))
    .slice(0, CANDIDATE_LIMIT + 1);
  return {
    rows: await projectMany(viewer, matched.slice(0, CANDIDATE_LIMIT), PROJECT_MEMBER_CANDIDATE_DTO_SPEC),
    truncated: matched.length > CANDIDATE_LIMIT,
  };
}

// 보임 → 권리 → 잠금(트랜잭션 전) 순서 — 260907 `O: server/src/projects.ts:3960-3967`과 같다.
async function guardManage(viewer: Viewer, projectId: string, forbidden: string, todayKst: string): Promise<ProjectRow> {
  const facts = await loadManagedProject(viewer, projectId, todayKst);
  if (!facts) denyWrite(viewer, "projects.view", { projectId }, new UserFacingError(NOT_PROCESSED));
  if (!facts.manage) {
    const pmName = await personNameOf(viewer, facts.project.pmUserId);
    denyWrite(viewer, "projects.member", { projectId }, new ForbiddenError(pmName ? `${forbidden} · 담당 PM ${pmName}` : forbidden));
  }
  if (facts.project.status === "completed") denyWrite(viewer, "projects.member.locked", { projectId }, new GateBlockedError(LOCKED));
  return facts.project;
}

// 잠금 읽기 행으로 다시 판정한다 — 확인 뒤 완료 · 보관돼도 붙지 않는다(T-06.2-53).
// 판정 때와 담당 팀 · PM이 다르면 옛 기준의 권리 · 후보로 쓰지 않는다(검토 반영 M-3, fail-closed).
async function inLockedProject<T>(viewer: Viewer, basis: ProjectRow, write: (tx: DbOrTx, row: ProjectRow) => Promise<T>): Promise<T> {
  return withTransaction(async (tx) => {
    const row = await lockProjectForWrite(viewer, basis.id, tx);
    if (!row || row.archivedAt !== null) throw new UserFacingError(NOT_PROCESSED);
    if (row.teamId !== basis.teamId || row.pmUserId !== basis.pmUserId) throw new UserFacingError(NOT_PROCESSED);
    if (row.status === "completed") throw new GateBlockedError(LOCKED);
    return write(tx, row);
  });
}

// UI-SPEC S3 「오류 문구」 — 고른 순서의 첫 사람 이름. 사람 정보를 못 보는 계급이면 이름 대신 사람 수(검토 반영 M-1).
// 첫 사람이 nameable 밖(후보 범위 밖 · 없는 id — 조작한 목록)이어도 사람 수 — 임의 id의 이름 · 존재를 답하지 않는다(/cso M-1(a)).
async function rejectedError(viewer: Viewer, rejected: string[], nameable: ReadonlySet<string>): Promise<UserFacingError> {
  if (!(await visible(viewer, "person.value")) || !nameable.has(rejected[0] ?? "")) {
    return new UserFacingError(`${rejected.length}명 더할 수 없음 · 새로 고침`);
  }
  const first = (await findUserNamesByIds(viewer, rejected.slice(0, 1))).get(rejected[0] ?? "");
  if (!first) return new UserFacingError(NOT_PROCESSED);
  const who = rejected.length === 1 ? first : `${first} 외 ${rejected.length - 1}명`;
  return new UserFacingError(`${who} 더할 수 없음 · 새로 고침`);
}

export async function addProjectMembers(viewer: Viewer, projectId: string, userIds: string[]): Promise<{ added: number }> {
  const todayKst = kstToday(new Date());
  const project = await guardManage(viewer, projectId, "참여자 더하기 권한 없음", todayKst);
  const ids = [...new Set(userIds)];
  // 클라이언트가 보낸 목록을 믿지 않는다 — 고른 사람마다 후보 규칙으로 다시 계산(T-06.2-50).
  const candidates = new Set((await computeMemberCandidates(viewer, project, todayKst)).map((person) => person.id));
  const rejected = ids.filter((id) => !candidates.has(id));
  // 한 명이라도 어긋나면 트랜잭션을 열기 전에 전체 거부(260907 `O: server/src/projects.ts:3946-3947` — 코드에만 있던 규칙).
  if (rejected.length > 0) throw await rejectedError(viewer, rejected, await candidateRangeIds(viewer, project, todayKst));

  const added = await inLockedProject(viewer, project, async (tx) => {
    // 판정 뒤 다른 탭이 먼저 붙였으면 같은 거부 문구(검토 반영 M-2 — 아니면 유일 제약이 일반 오류로 샌다).
    const live = await findLiveMemberUserIds(viewer, projectId, tx);
    const taken = ids.filter((id) => live.has(id));
    if (taken.length > 0) throw await rejectedError(viewer, taken, live);
    const count = await reviveOrInsertMembers(viewer, { projectId, userIds: ids, addedBy: viewer.id }, tx);
    await recordAction(viewer, { actionType: MEMBER_ACTION, entity: PROJECT_ENTITY, entityId: projectId, detail: { projectId, added: ids } }, { tx });
    return count;
  });
  return { added };
}

export async function removeProjectMember(viewer: Viewer, projectId: string, userId: string): Promise<void> {
  const project = await guardManage(viewer, projectId, NO_CHANGE_RIGHT, kstToday(new Date()));
  await inLockedProject(viewer, project, async (tx) => {
    // 바뀐 줄 0 = 이미 뗐거나 붙은 적 없음.
    if (!(await archiveLiveMember(viewer, { projectId, userId }, tx))) throw new UserFacingError(NOT_PROCESSED);
    await recordAction(viewer, { actionType: MEMBER_ACTION, entity: PROJECT_ENTITY, entityId: projectId, detail: { projectId, removed: userId } }, { tx });
  });
}

// 되돌리기 = 보관 해제(UI-SPEC 「떼기 — 확인 창 대신 되돌리기」). 후보 계산을 부르지 않는다 — 퇴직 · 보관된 사람 · 그 사이 담당 팀으로
// 옮긴 사람도 돌아온다. 대신 그 사람의 마지막 참여자 변경 로그가 떼기이고 10분 안일 때만이다(검토 반영 I-1 · 사용자 결정
// 2026-10-08 「10분 안만」 — 오래된 보관 줄로 후보 규칙을 우회하지 못한다). 지금 담당 PM은 되살리지 않는다(M-5 · R2-I2).
// 판정은 잠근 트랜잭션 안 — 같은 프로젝트의 참여자 쓰기가 차례로 돌아 로그가 그 사이 바뀌지 않는다.
// 260907엔 되돌리기가 없었다(떼기 확인 창 `O: app/src/pages/Projects.tsx:2314` · 다시 붙이기는 퇴직 · 보관 거부 `O: server/src/projects.ts:3969-3976`).
export async function restoreProjectMember(viewer: Viewer, projectId: string, userId: string, deps?: { now?: () => Date }): Promise<void> {
  const now = deps?.now ?? (() => new Date());
  const project = await guardManage(viewer, projectId, NO_CHANGE_RIGHT, kstToday(now()));
  await inLockedProject(viewer, project, async (tx, row) => {
    if (userId === row.pmUserId) throw new UserFacingError(NOT_PROCESSED);
    const latest = await findLatestMemberChangeFor(viewer, { actionType: MEMBER_ACTION, entity: PROJECT_ENTITY, projectId, userId }, tx);
    const removedRecently =
      latest !== null &&
      (latest.detail as { removed?: unknown }).removed === userId &&
      // 양쪽으로 잰다 — occurred_at(시간대 없는 timestamp)이 미래로 읽히면(DB 세션 시간대가 UTC가 아님) 기한이 닫히지 않는다(/review R-1).
      Math.abs(now().getTime() - latest.occurredAt.getTime()) <= RESTORE_WINDOW_MS;
    if (!removedRecently) throw new UserFacingError(NOT_PROCESSED);
    if (!(await restoreArchivedMember(viewer, { projectId, userId, restoredBy: viewer.id }, tx))) throw new UserFacingError(NOT_PROCESSED);
    await recordAction(viewer, { actionType: MEMBER_ACTION, entity: PROJECT_ENTITY, entityId: projectId, detail: { projectId, restored: userId } }, { tx });
  });
}
