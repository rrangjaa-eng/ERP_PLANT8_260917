import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { denyWrite } from "@/domain/rules/deny-write";
import { projectRowScope } from "@/domain/projects/visibility";
import {
  coversProjectTeam,
  ForbiddenError,
  loadActorTeamScope,
  ProjectNotFoundError,
  teamScopeForProject,
  type ActorTeamScope,
} from "@/domain/projects/status";
import { countMoneyAttachments, moneyBlockedReason, moneyLockedRestoreReason } from "@/domain/projects/money-attachment";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { kstToday } from "@/lib/kst-date";
import {
  archiveLiveLinesOfProject,
  archiveProjectRow,
  findProjectInScope,
  lockProjectForWrite,
  restoreLinesArchivedAt,
  restoreProjectRow,
} from "@/repositories/projects";
import { findTeamById } from "@/repositories/teams";

// 07.2-17(PU1 · D-7210~D-7213) — 프로젝트 「삭제」는 지우지 않고 보관한다(projects.archived_at · archived_by). 연결된 돈 문서(D-7211)가
// 0건일 때만 보관하고, 되살리기도 0건일 때만. 견적 줄은 같은 시각 · 같은 사람으로 함께 보관하고 되살릴 때 그 시각 줄만 복원한다(D-7212 —
// 차수 표는 보관 칸이 없어 프로젝트 보관을 따라 숨는다).
// 권리 = `projects.delete` 쓰기 + 업무 범위가 프로젝트 팀을 덮음(계급 이름 판정 없음). 행 범위는 쓰기 용도(projectRowScope(viewer, undefined,
// "write")) — #333(07.3-01 Q5) 뒤 기본값 view는 자금 키 보유자의 보기 확대를 포함하므로 쓰지 않는다(eng r2 D P2-3).
// 260907 `O: server/src/projects.ts:3524-3612`(POST /archive · requirePermission('project.delete')) · :3614-3650(restore)와 같은 방향.

const PROJECT_ENTITY = "project";
const DELETE_MENU = "projects.delete";
const NOT_FOUND = "존재하지 않는 프로젝트";
const TEAM_ARCHIVED = "담당 팀 사용중지 · 팀 먼저 복원";
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 돈 문서가 붙어 지우지 못함 — 화면이 이유 글자를 그대로 싣는다.
export class ProjectDeleteBlockedError extends UserFacingError {}
// 되살리지 못함(담당 팀 사용중지 · 돈 문서) — 보관함 행 아래 이유 줄로 간다.
export class ProjectRestoreBlockedError extends UserFacingError {}

export type ProjectArchiveDeps = {
  can: typeof defaultCan;
  now: () => Date;
  recordAction: typeof defaultRecordAction;
  // 테스트 전용 — 잠금 획득 직후 호출(경합 재현, sleep 없이).
  afterLock: () => Promise<void>;
};

type Reach = { visible: false } | { visible: true; canDelete: boolean; teamScope: ActorTeamScope; project: { teamId: string; archivedAt: Date | null; archivedBy: string | null; number: string } };

// 트랜잭션 전 사실 — 쓰기 범위 안에서 보이는가 · 키 · 업무 범위(참여 뺀 보임으로 좁힘, 06.2-09 I-2). 전역 db로 읽는다(04-32).
async function readReach(viewer: Viewer, projectId: string, deps?: Partial<ProjectArchiveDeps>): Promise<Reach> {
  if (!UUID_SHAPE.test(projectId)) return { visible: false };
  const canFn = deps?.can ?? defaultCan;
  const now = deps?.now ?? (() => new Date());
  const rowScope = await projectRowScope(viewer, deps?.can ? { can: canFn } : undefined, "write");
  const row = await findProjectInScope(viewer, rowScope, projectId);
  if (!row) return { visible: false };
  const [canDelete, baseTeamScope] = await Promise.all([canFn(viewer, DELETE_MENU, "write"), loadActorTeamScope(viewer, { todayKst: kstToday(now()) })]);
  const teamScope = await teamScopeForProject(viewer, baseTeamScope, rowScope, projectId);
  return { visible: true, canDelete, teamScope, project: { teamId: row.teamId, archivedAt: row.archivedAt, archivedBy: row.archivedBy, number: row.number } };
}

function allowed(reach: Reach): boolean {
  return reach.visible && reach.canDelete && coversProjectTeam(reach.teamScope, reach.project.teamId);
}

// 화면 · 서버가 같이 부르는 권리(트랜잭션 전). 보이지 않거나 키 · 범위가 없으면 false — 화면은 입구를 그리지 않는다.
export async function deleteRights(viewer: Viewer, projectId: string, deps?: Partial<ProjectArchiveDeps>): Promise<boolean> {
  return allowed(await readReach(viewer, projectId, deps));
}

function assertReach(viewer: Viewer, projectId: string, reach: Reach): asserts reach is Extract<Reach, { visible: true }> {
  if (!reach.visible) denyWrite(viewer, "projects.view", { projectId }, new ProjectNotFoundError(NOT_FOUND));
  if (!allowed(reach)) denyWrite(viewer, DELETE_MENU, { projectId }, new ForbiddenError("프로젝트 삭제 권한 없음"));
}

export async function archiveProject(viewer: Viewer, projectId: string, deps?: Partial<ProjectArchiveDeps>): Promise<{ archived: boolean; number: string }> {
  const reach = await readReach(viewer, projectId, deps);
  assertReach(viewer, projectId, reach);
  const now = deps?.now ?? (() => new Date());
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  return withTransaction(async (tx) => {
    const locked = await lockProjectForWrite(viewer, projectId, tx);
    await deps?.afterLock?.();
    if (!locked) throw new ProjectNotFoundError(NOT_FOUND);
    // 담당 팀이 그사이 바뀌었으면 잠근 행으로 범위를 다시 잰다(PU5 담당 팀 변경과 직렬).
    if (!coversProjectTeam(reach.teamScope, locked.teamId)) denyWrite(viewer, DELETE_MENU, { projectId }, new ForbiddenError("프로젝트 삭제 권한 없음"));
    if (locked.archivedAt !== null) return { archived: false, number: locked.number };
    // 잠근 뒤 센다 — 잠금 전에 커밋된 돈 문서(FK 확인이 이 행을 붙잡고 있던 쓰기 포함)를 놓치지 않는다.
    const money = await countMoneyAttachments(viewer, projectId, tx);
    if (money.total > 0) throw new ProjectDeleteBlockedError(moneyBlockedReason(money.total));
    const at = now();
    const archived = await archiveProjectRow(viewer, projectId, { at, by: viewer.id }, tx);
    if (!archived) throw new ProjectNotFoundError(NOT_FOUND);
    const lines = await archiveLiveLinesOfProject(viewer, projectId, { at, by: viewer.id }, tx);
    await recordAction(viewer, { actionType: "archive", entity: PROJECT_ENTITY, entityId: projectId, detail: { lines } }, { tx });
    return { archived: true, number: locked.number };
  });
}

// via undo = 착지 토스트 `되돌리기`(내가 지운 것만) · via archive = 보관함 `복원`(같은 권리, 지운 사람 무관).
export async function restoreProject(
  viewer: Viewer,
  projectId: string,
  opts: { via: "undo" | "archive" },
  deps?: Partial<ProjectArchiveDeps>,
): Promise<{ restored: boolean; number: string }> {
  const reach = await readReach(viewer, projectId, deps);
  // 되돌리기는 남이 지운 것에 「없음」 — 만든 요청이 남의 삭제를 되돌리지 못한다(T-07.2-17-04).
  if (opts.via === "undo" && reach.visible && reach.project.archivedBy !== viewer.id && reach.project.archivedAt !== null) {
    throw new ProjectNotFoundError(NOT_FOUND);
  }
  assertReach(viewer, projectId, reach);
  const now = deps?.now ?? (() => new Date());
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  return withTransaction(async (tx) => {
    const locked = await lockProjectForWrite(viewer, projectId, tx);
    await deps?.afterLock?.();
    if (!locked) throw new ProjectNotFoundError(NOT_FOUND);
    if (!coversProjectTeam(reach.teamScope, locked.teamId)) denyWrite(viewer, DELETE_MENU, { projectId }, new ForbiddenError("프로젝트 삭제 권한 없음"));
    if (locked.archivedAt === null) return { restored: false, number: locked.number };
    if (opts.via === "undo" && locked.archivedBy !== viewer.id) throw new ProjectNotFoundError(NOT_FOUND);
    // 팀 보관(archiveSeatedOrg)은 활성 프로젝트를 세지 않는다 — 팀 행을 잠그지 않고 같은 tx로 읽는다(경합 한계는 SUMMARY에 적었다).
    const team = await findTeamById(viewer, locked.teamId, tx);
    if (!team || team.archivedAt !== null) throw new ProjectRestoreBlockedError(TEAM_ARCHIVED);
    const money = await countMoneyAttachments(viewer, projectId, tx);
    if (money.total > 0) throw new ProjectRestoreBlockedError(moneyLockedRestoreReason(money.total));
    const lines = await restoreLinesArchivedAt(viewer, projectId, locked.archivedAt, tx);
    const restored = await restoreProjectRow(viewer, projectId, { at: locked.archivedAt, now: now() }, tx);
    if (!restored) throw new ProjectNotFoundError(NOT_FOUND);
    await recordAction(viewer, { actionType: "restore", entity: PROJECT_ENTITY, entityId: projectId, detail: { lines, via: opts.via } }, { tx });
    return { restored: true, number: locked.number };
  });
}

// 착지 토스트(`/projects?deleted=`) 재료 — 보관 · 내가 지움 · 되살릴 권리가 있을 때만. 아니면 null(만든 링크가 남의 되돌리기를 띄우지 못함).
export async function findDeletedProjectForUndo(viewer: Viewer, projectId: string): Promise<{ id: string; number: string } | null> {
  const reach = await readReach(viewer, projectId);
  if (!reach.visible || !allowed(reach)) return null;
  if (reach.project.archivedAt === null || reach.project.archivedBy !== viewer.id) return null;
  return { id: projectId, number: reach.project.number };
}
