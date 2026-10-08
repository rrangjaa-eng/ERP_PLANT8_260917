import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction } from "@/domain/action-log/record";
import { GateBlockedError } from "@/domain/rules/gate";
import { denyWrite } from "@/domain/rules/deny-write";
import { projectRowScope } from "@/domain/projects/visibility";
import { coversProjectTeam, ForbiddenError, loadActorTeamScope } from "@/domain/projects/status";
import { withTransaction } from "@/lib/db-transaction";
import { kstToday } from "@/lib/kst-date";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import type { DbOrTx } from "@/repositories/document-counters";
import { findProjectInScope, lockProjectForWrite, type ProjectRow } from "@/repositories/projects";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { findUserNamesByIds } from "@/repositories/users";
import { archiveLiveMember, restoreArchivedMember, reviveOrInsertMembers } from "@/repositories/project-members";

// 06.2-05(D-6209~D-6213 · D-6222 · D-6223): 프로젝트 참여자 — 담당 팀 밖 사람을 붙이고 뗀다. 보이는 행은 rowScopeFor 번역기의
// 참여 조각(06.2-03 · 04)이 이미 처리한다 — 이 파일은 줄을 붙이고 떼는 일과 그 권리 · 후보 · 로그만 한다.
// 260907 대조:
//  - 후보 `O: server/src/projects.ts:3889-3935`(담당 팀의 본부 + 본부 없는 사람 − sys_admin · 담당 팀 · 이미 붙음) ↔ 본부 없는 사람은 대표 계급만(D-6221)
//  - 붙이기 `O: server/src/projects.ts:3949-4010`(보임 → 권리 → 잠금 · 한 명이라도 걸리면 전체 취소 `:3946-3947` · 되살림 뒤 삽입 `:3994-4007`)
//  - 떼기 `O: server/src/projects.ts:4028-4060`(보임 → 권리 → 잠금 `:4050` · archived_at)
// 권리는 260907 canManage(보는 범위, `O: server/src/projects.ts:727-745`)와 달리 키 projects.member 쓰기 ∧ (담당 PM ∨ 업무 범위가 그 팀을 덮음)(D-6210).

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_ENTITY = "project";
const MEMBER_ACTION = "project_member_change";
const NOT_PROCESSED = "처리 실패 · 다시 시도";
const LOCKED = "완료 프로젝트 · 참여자 잠김";
const NO_CHANGE_RIGHT = "참여자 변경 권한 없음";

// 보임 판정 뒤의 사실 — 범위 밖이면 null(존재 여부를 새지 않는다, T-06.2-52). 판정은 트랜잭션 전 전역 db로(04-32).
type ManagedProject = { project: ProjectRow; manage: boolean };

async function loadManagedProject(viewer: Viewer, projectId: string, todayKst: string): Promise<ManagedProject | null> {
  if (!UUID_SHAPE.test(projectId)) return null;
  const scope = await projectRowScope(viewer);
  const project = await findProjectInScope(viewer, scope, projectId);
  if (!project || (project.archivedAt !== null && !scope.includeArchived)) return null;
  const [key, teamScope] = await Promise.all([
    defaultCan(viewer, "projects.member", "write"),
    loadActorTeamScope(viewer, { todayKst }),
  ]);
  // 참여 여부는 권리가 아니다(D-6213 · T-06.2-51) — 기존 쓰기 게이트와 같은 담당 PM ∨ 업무 범위.
  const manage = key && (project.pmUserId === viewer.id || coversProjectTeam(teamScope, project.teamId));
  return { project, manage };
}

function editable(facts: ManagedProject): boolean {
  return facts.manage && facts.project.status !== "completed" && facts.project.archivedAt === null;
}

async function pmNameOf(viewer: Viewer, project: ProjectRow): Promise<string> {
  return (await findUserNamesByIds(viewer, [project.pmUserId])).get(project.pmUserId) ?? "";
}

export type ProjectMemberRights = { canEdit: boolean; locked: boolean; pmName: string | null };

export async function projectMemberRights(viewer: Viewer, projectId: string): Promise<ProjectMemberRights> {
  const facts = await loadManagedProject(viewer, projectId, kstToday(new Date()));
  if (!facts) return { canEdit: false, locked: false, pmName: null };
  return {
    canEdit: editable(facts),
    locked: facts.manage && facts.project.status === "completed",
    pmName: await pmNameOf(viewer, facts.project),
  };
}

// 보임 → 권리 → 잠금(트랜잭션 전) 순서 — 260907 `O: server/src/projects.ts:3960-3967`과 같다.
async function guardManage(viewer: Viewer, projectId: string, forbidden: string, todayKst: string): Promise<ProjectRow> {
  const facts = await loadManagedProject(viewer, projectId, todayKst);
  if (!facts) denyWrite(viewer, "projects.view", { projectId }, new UserFacingError(NOT_PROCESSED));
  if (!facts.manage) {
    denyWrite(viewer, "projects.member", { projectId }, new ForbiddenError(`${forbidden} · 담당 PM ${await pmNameOf(viewer, facts.project)}`));
  }
  if (facts.project.status === "completed") denyWrite(viewer, "projects.member.locked", { projectId }, new GateBlockedError(LOCKED));
  return facts.project;
}

// 잠금 읽기 행으로 다시 판정한다 — 확인 뒤 완료 · 보관돼도 붙지 않는다(T-06.2-53).
async function inLockedProject<T>(viewer: Viewer, projectId: string, write: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return withTransaction(async (tx) => {
    const row = await lockProjectForWrite(viewer, projectId, tx);
    if (!row || row.archivedAt !== null) throw new UserFacingError(NOT_PROCESSED);
    if (row.status === "completed") throw new GateBlockedError(LOCKED);
    return write(tx);
  });
}

// UI-SPEC S3 「오류 문구」 — 고른 순서의 첫 사람 이름. 없는 id(조작한 목록)면 이름이 없어 일반 문구.
async function rejectedError(viewer: Viewer, rejected: string[]): Promise<UserFacingError> {
  const first = (await findUserNamesByIds(viewer, rejected.slice(0, 1))).get(rejected[0] ?? "");
  if (!first) return new UserFacingError(NOT_PROCESSED);
  const who = rejected.length === 1 ? first : `${first} 외 ${rejected.length - 1}명`;
  return new UserFacingError(`${who} 더할 수 없음 · 새로 고침`);
}

export async function addProjectMembers(viewer: Viewer, projectId: string, userIds: string[]): Promise<{ added: number }> {
  const todayKst = kstToday(new Date());
  const project = await guardManage(viewer, projectId, "참여자 더하기 권한 없음", todayKst);
  const ids = [...new Set(userIds)];
  const teamOf = new Map((await listOrgSnapshot(viewer, todayKst)).map((person) => [person.id, person.teamId]));
  const rejected = ids.filter((id) => !teamOf.has(id) || teamOf.get(id) === project.teamId);
  // 한 명이라도 어긋나면 트랜잭션을 열기 전에 전체 거부(260907 `O: server/src/projects.ts:3946-3947` — 코드에만 있던 규칙).
  if (rejected.length > 0) throw await rejectedError(viewer, rejected);

  const added = await inLockedProject(viewer, projectId, async (tx) => {
    const count = await reviveOrInsertMembers(viewer, { projectId, userIds: ids, addedBy: viewer.id }, tx);
    await recordAction(viewer, { actionType: MEMBER_ACTION, entity: PROJECT_ENTITY, entityId: projectId, detail: { projectId, added: ids } }, { tx });
    return count;
  });
  return { added };
}

export async function removeProjectMember(viewer: Viewer, projectId: string, userId: string): Promise<void> {
  await guardManage(viewer, projectId, NO_CHANGE_RIGHT, kstToday(new Date()));
  await inLockedProject(viewer, projectId, async (tx) => {
    // 바뀐 줄 0 = 이미 뗐거나 붙은 적 없음.
    if (!(await archiveLiveMember(viewer, { projectId, userId }, tx))) throw new UserFacingError(NOT_PROCESSED);
    await recordAction(viewer, { actionType: MEMBER_ACTION, entity: PROJECT_ENTITY, entityId: projectId, detail: { projectId, removed: userId } }, { tx });
  });
}

// 되돌리기 = 보관 해제(UI-SPEC 「떼기 — 확인 창 대신 되돌리기」). 후보 계산을 부르지 않는다 — 퇴직 · 보관된 사람 · 그 사이 담당 팀으로
// 옮긴 사람도 돌아온다(T-06.2-57: 이미 붙었다가 보관된 줄만 되살린다). 260907엔 되돌리기가 없었다(떼기 확인 창
// `O: app/src/pages/Projects.tsx:2314` · 다시 붙이기는 퇴직 · 보관 거부 `O: server/src/projects.ts:3969-3976`).
export async function restoreProjectMember(viewer: Viewer, projectId: string, userId: string): Promise<void> {
  await guardManage(viewer, projectId, NO_CHANGE_RIGHT, kstToday(new Date()));
  await inLockedProject(viewer, projectId, async (tx) => {
    if (!(await restoreArchivedMember(viewer, { projectId, userId, restoredBy: viewer.id }, tx))) throw new UserFacingError(NOT_PROCESSED);
    await recordAction(viewer, { actionType: MEMBER_ACTION, entity: PROJECT_ENTITY, entityId: projectId, detail: { projectId, restored: userId } }, { tx });
  });
}
