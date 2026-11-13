import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { buildChanges } from "@/domain/action-log/changes";
import { GateBlockedError } from "@/domain/rules/gate";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import type { DbOrTx } from "@/repositories/document-counters";
import { projectRowScope } from "@/domain/projects/visibility";
import { findProjectInScope, lockProjectForWrite } from "@/repositories/projects";
import {
  archiveRevenueEntryIfCurrent,
  findRevenueEntryById,
  listRevenueEntriesByProject,
  restoreRevenueEntryRow,
  type RevenueEntryRow,
} from "@/repositories/revenue-entries";
import { hasIssueRequestForEntry } from "@/repositories/revenue-issue-requests";
import {
  ENTRY_NOT_FOUND,
  ForbiddenError,
  LINKED_REQUEST_BLOCK,
  ProjectNotFoundError,
  REVENUE_SETTLEMENT_MENU,
  entryChangeView,
  revenueWriteRights,
  type RevenueEntryKind,
} from "@/domain/revenue";
import { COMPLETED_DELETE_LOCK, COMPLETED_RESTORE_LOCK, UNDO_EXPIRED, UNDO_WINDOW_MS } from "@/domain/revenue/archive-rules";

// 07.6-01 — 매출 발행 · 입금 줄 지우기(보관) · 되돌리기의 쓰기 길 전부. domain/revenue/index.ts는 이 모듈을 import하지 않는다(런타임 순환).
// 순서: tx 앞 범위 · 권한(saveRevenue와 같은 판정 · 순서, D-7604) → 프로젝트 행 잠금(보관 · 완료 거부 — D-7612) → 줄 조건부 UPDATE(version ·
// archived_at is null) → 같은 tx 행동 로그(끌 수 없는 전용 종류 — E1). 잠금 순서는 원장 저장과 같은 프로젝트 행 → 줄. 판정은 can() + 행 범위만.

// D-7607 — 기존 저장 충돌 문구의 앞부분(저장 전용 꼬리 `덮어쓰기 / 그 값으로`는 지우기에 없는 행동이라 싣지 않는다).
const ENTRY_CHANGED = "다른 사람이 먼저 이 줄을 바꿈 · 새로 고침";

// E1(사용자 카드 확정 11/4 22:24 KST) — 종류 이름은 이 두 상수에서만 쓴다.
export const REVENUE_ARCHIVE_LOG = "revenue_entry_archive";
export const REVENUE_RESTORE_LOG = "revenue_entry_restore";

const REVENUE_ENTITY = "revenue_entry";

export type RevenueArchiveDeps = Partial<{
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  now: () => Date;
  /** 시험 — 프로젝트 행 잠금을 쥔 동안 멈춘다(동시 지우기). */
  afterLock: () => Promise<void>;
}>;

type ArchiveInput = { projectId: string; entryId: string; version: number };

async function guardRevenueWrite(viewer: Viewer, projectId: string, deps: RevenueArchiveDeps): Promise<void> {
  const scope = await projectRowScope(viewer, deps.can ? { can: deps.can } : undefined, { fundOp: [REVENUE_SETTLEMENT_MENU, "write"] });
  if (!(await findProjectInScope(viewer, scope, projectId))) throw new ProjectNotFoundError("존재하지 않는 프로젝트");
  if (!(await revenueWriteRights(viewer, deps.can)).canWriteEntries) throw new ForbiddenError("발행·입금 줄 삭제 권한 없음");
}

// 잠근 행으로 다시 판정한다 — 확인 뒤 보관 · 완료돼도 지나가지 않는다(members.ts inLockedProject 꼴). 정산 중은 막지 않는다.
// denyWrite는 부르지 않는다 — 낡은 화면의 정상 사용자이지 IDOR 신호가 아니다.
async function inLockedRevenueProject<T>(
  viewer: Viewer,
  projectId: string,
  deps: RevenueArchiveDeps,
  blocked: { archived: () => Error; completed: () => Error },
  write: (tx: DbOrTx) => Promise<T>,
): Promise<T> {
  return withTransaction(async (tx) => {
    const row = await lockProjectForWrite(viewer, projectId, tx);
    if (!row || row.archivedAt !== null) throw blocked.archived();
    if (row.status === "completed") throw blocked.completed();
    await deps.afterLock?.();
    return write(tx);
  });
}

// 로그 순번 — 같은 종류 활성 줄 안 1부터(numberEntryChanges 규칙). 없으면 0.
async function entryNo(viewer: Viewer, projectId: string, entry: RevenueEntryRow, tx: DbOrTx): Promise<number> {
  const rows = (await listRevenueEntriesByProject(viewer, projectId, tx)).filter((row) => row.kind === entry.kind);
  return rows.findIndex((row) => row.id === entry.id) + 1;
}

const projectGone = () => new ProjectNotFoundError("존재하지 않는 프로젝트");

export async function archiveRevenueEntry(
  viewer: Viewer,
  input: ArchiveInput,
  deps: RevenueArchiveDeps = {},
): Promise<{ kind: RevenueEntryKind; version: number }> {
  await guardRevenueWrite(viewer, input.projectId, deps);
  const now = deps.now ?? (() => new Date());
  const recordAction = deps.recordAction ?? defaultRecordAction;
  return inLockedRevenueProject(viewer, input.projectId, deps, { archived: projectGone, completed: () => new GateBlockedError(COMPLETED_DELETE_LOCK) }, async (tx) => {
    const entry = await findRevenueEntryById(viewer, input.entryId, tx);
    if (!entry || entry.projectId !== input.projectId || entry.archivedAt !== null) throw new UserFacingError(ENTRY_NOT_FOUND);
    // Q1(D-7610): 잠근 프로젝트 tx 안이라 잇기(원장 tx — 같은 프로젝트 잠금 뒤)가 판정 사이에 끼지 못한다.
    if (await hasIssueRequestForEntry(viewer, entry.id, tx)) throw new UserFacingError(LINKED_REQUEST_BLOCK);
    const no = await entryNo(viewer, input.projectId, entry, tx);
    const archived = await archiveRevenueEntryIfCurrent(viewer, { id: entry.id, projectId: input.projectId, expectedVersion: input.version, at: now() }, tx);
    if (!archived) throw new UserFacingError(ENTRY_CHANGED);
    const kind = entry.kind as RevenueEntryKind;
    await recordAction(
      viewer,
      {
        actionType: REVENUE_ARCHIVE_LOG,
        entity: REVENUE_ENTITY,
        entityId: input.projectId,
        detail: { entryId: entry.id, lineChanges: [{ id: entry.id, kind, no, name: null, changes: buildChanges(entryChangeView(entry), {}) }] },
      },
      { tx },
    );
    return { kind, version: archived.version };
  });
}

// input.version = 지우기 응답의 version(지운 뒤). 그 version일 때만 되살린다 — 그새 남이 고친 줄에 낡은 화면 값을 붙이지 않는다(eng r1 P2-A1).
export async function undoRevenueArchive(
  viewer: Viewer,
  input: ArchiveInput,
  deps: RevenueArchiveDeps = {},
): Promise<{ kind: RevenueEntryKind; version: number }> {
  await guardRevenueWrite(viewer, input.projectId, deps);
  const now = deps.now ?? (() => new Date());
  const recordAction = deps.recordAction ?? defaultRecordAction;
  return inLockedRevenueProject(viewer, input.projectId, deps, { archived: projectGone, completed: () => new GateBlockedError(COMPLETED_RESTORE_LOCK) }, async (tx) => {
    const entry = await findRevenueEntryById(viewer, input.entryId, tx);
    if (!entry || entry.projectId !== input.projectId) throw new UserFacingError(ENTRY_NOT_FOUND);
    const kind = entry.kind as RevenueEntryKind;
    if (entry.archivedAt === null) {
      // 응답 잃은 재전송 · 보관함 복원 뒤 아무도 안 고친 줄만 멱등 성공(로그 없음).
      if (entry.version === input.version + 1) return { kind, version: entry.version };
      throw new UserFacingError(ENTRY_CHANGED);
    }
    if (entry.archivedBy !== viewer.id) throw new UserFacingError(ENTRY_NOT_FOUND);
    // archived_at은 시간대 없는 timestamp라 양쪽으로 잰다(members.ts 되돌리기 창 꼴).
    if (Math.abs(now().getTime() - entry.archivedAt.getTime()) > UNDO_WINDOW_MS) throw new UserFacingError(UNDO_EXPIRED);
    const restored = await restoreRevenueEntryRow(viewer, { id: entry.id, projectId: input.projectId, at: now(), expectedVersion: input.version }, tx);
    if (!restored) throw new UserFacingError(ENTRY_CHANGED);
    const no = await entryNo(viewer, input.projectId, restored, tx);
    await recordAction(
      viewer,
      {
        actionType: REVENUE_RESTORE_LOG,
        entity: REVENUE_ENTITY,
        entityId: input.projectId,
        detail: { entryId: entry.id, via: "undo", lineChanges: [{ id: entry.id, kind, no, name: null, changes: buildChanges({}, entryChangeView(restored)) }] },
      },
      { tx },
    );
    return { kind, version: restored.version };
  });
}

// 07.6-01(D-7603 · D-7611 · Q2) — 보관함 복원 거부(원인 토스트로 보이게 보관함이 아는 클래스). 이 모듈은 domain/archive를 import하지 않는다(순환).
export class RevenueRestoreBlockedError extends UserFacingError {}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 보관함 「매출 줄」 복원기(domain/archive DOMAIN_RESTORERS). 범용 restore()가 admin.archive 쓰기 · requiredMenu(projects.revenue) 쓰기를 먼저 봤다(E2).
// 순서: 권한(방어) → 줄 읽기 → 쓰기 범위 → 잠근 프로젝트(보관 · 완료 거부) → 이미 활성이면 { restored: false } → 되살림 · 로그(via archive).
export async function restoreRevenueEntry(viewer: Viewer, id: string, deps: RevenueArchiveDeps = {}): Promise<{ restored: boolean }> {
  if (!(await revenueWriteRights(viewer, deps.can)).canWriteEntries) throw new RevenueRestoreBlockedError("보관함 쓰기 권한 없음");
  const entry = UUID_SHAPE.test(id) ? await findRevenueEntryById(viewer, id) : null;
  if (!entry) throw new UserFacingError(ENTRY_NOT_FOUND);
  const scope = await projectRowScope(viewer, deps.can ? { can: deps.can } : undefined, { fundOp: [REVENUE_SETTLEMENT_MENU, "write"] });
  if (!(await findProjectInScope(viewer, scope, entry.projectId))) throw new RevenueRestoreBlockedError("매출 줄 복원 권한 없음 · 복원 불가");
  const now = deps.now ?? (() => new Date());
  const recordAction = deps.recordAction ?? defaultRecordAction;
  return inLockedRevenueProject(
    viewer,
    entry.projectId,
    deps,
    { archived: () => new RevenueRestoreBlockedError("프로젝트 삭제됨 · 복원 불가"), completed: () => new RevenueRestoreBlockedError(COMPLETED_RESTORE_LOCK) },
    async (tx) => {
      const latest = await findRevenueEntryById(viewer, id, tx);
      if (!latest || latest.archivedAt === null) return { restored: false };
      const restored = await restoreRevenueEntryRow(viewer, { id, projectId: entry.projectId, at: now() }, tx);
      if (!restored) return { restored: false };
      const kind = restored.kind as RevenueEntryKind;
      const no = await entryNo(viewer, entry.projectId, restored, tx);
      await recordAction(
        viewer,
        {
          actionType: REVENUE_RESTORE_LOG,
          entity: REVENUE_ENTITY,
          entityId: entry.projectId,
          detail: { entryId: id, via: "archive", lineChanges: [{ id, kind, no, name: null, changes: buildChanges({}, entryChangeView(restored)) }] },
        },
        { tx },
      );
      return { restored: true };
    },
  );
}
