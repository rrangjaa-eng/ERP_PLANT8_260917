import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import type { QuoteRevisionCreateCtx } from "@/domain/rules/register";
import { denyWrite, type DenyWriteIds } from "@/domain/rules/deny-write";
import { loadProjectForGate } from "@/domain/projects/auto-transition";
import { ProjectNotFoundError } from "@/domain/projects/status";
import { structuralEditability } from "@/domain/quotes/edit-scope";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { isUniqueViolation } from "@/lib/pg-errors";
import {
  findLatestQuoteRevision as repoFindLatestQuoteRevision,
  insertRevision as repoInsertRevision,
} from "@/repositories/quote-revisions";
import {
  copyQuoteLines as repoCopyQuoteLines,
  countCopyableLines as repoCountCopyableLines,
  moveAdjustmentLines as repoMoveAdjustmentLines,
} from "@/repositories/quote-lines";

// 04-14(PROJ-07 · D-53~D-56) — 상세 견적 차수: 새 차수(전체 복사 + 조정 줄 이동). 쓰기는 트랜잭션 첫 단계에서
// loadProjectForGate로 프로젝트 행을 잠가 줄 저장(04-12)과 한 줄로 선다. 권한(can)은 트랜잭션 앞에서 읽고 잠금 뒤
// 읽기·로그는 전부 tx다(04-32 · ARCHITECTURE §4-8).

const PROJECT_ENTITY = "project";
const REVISION_ENTITY = "quote_revision";
const PROJECTS_MENU = "projects";
const REVISION_CREATE_RULE = "quote.revision-create";
const REVISION_CURRENT_RULE = "quote.revision-current";
const SEQ_UNIQUE_CONSTRAINT = "quote_revisions_project_seq_key";
// UI-SPEC rev 5 `막힘 — 새 차수(동시·오래된 화면)`.
const REVISION_STALE = "다른 사람이 먼저 새 차수를 만듦 · 새로 고침";
const WRITE_DENIED = "견적 줄 · 쓰기 권한 없음";
const PROJECT_NOT_FOUND = "존재하지 않는 프로젝트입니다.";

export type CreateRevisionDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  // 테스트 전용 주입 — 날짜(자동 정산 판정) · 잠금 직후 호출(04-40 경합) · 순번 유일 제약 위반 흉내(엔지 리뷰 B §1).
  now: () => Date;
  afterLock: () => Promise<void>;
  insertRevision: typeof repoInsertRevision;
};

export type CreatedRevision = { revisionId: string; seq: number };

// D-53 · CEO 리뷰 B-02 — 요청은 사용자가 보던 차수 id를 싣는다. 잠금 뒤 현재 차수(최신 순번 — 승인 여부 무관,
// D-54)가 그것이 아니면 거부한다(더블클릭의 두 번째 요청 · 오래된 탭). 잠금을 지나서도 순번이 부딪히면(유일 제약)
// 같은 문구다 — 반쪽 차수는 트랜잭션이 되돌린다.
export async function createRevisionFromCurrent(
  viewer: Viewer,
  input: { projectId: string; fromRevisionId: string },
  deps?: Partial<CreateRevisionDeps>,
): Promise<CreatedRevision> {
  const canFn = deps?.can ?? defaultCan;
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  const insertRevision = deps?.insertRevision ?? repoInsertRevision;
  const ids: DenyWriteIds = { projectId: input.projectId, revisionId: input.fromRevisionId };

  const [rowScope, canWrite] = await Promise.all([scopeFor(viewer, PROJECT_ENTITY, { can: canFn }), canFn(viewer, PROJECTS_MENU, "write")]);
  if (rowScope.rows === "none") denyWrite(viewer, "projects.view", ids, new ProjectNotFoundError(PROJECT_NOT_FOUND));
  if (!canWrite) denyWrite(viewer, REVISION_CREATE_RULE, ids, new GateBlockedError(WRITE_DENIED));

  return withTransaction(async (tx) => {
    const project = await loadProjectForGate(viewer, input.projectId, { now: deps?.now, tx, afterLock: deps?.afterLock }, { recordAction });
    if (!project || (project.archivedAt !== null && !rowScope.includeArchived)) {
      denyWrite(viewer, "projects.view", ids, new ProjectNotFoundError(PROJECT_NOT_FOUND));
    }

    const current = await repoFindLatestQuoteRevision(viewer, input.projectId, tx);
    if (!current || current.id !== input.fromRevisionId) denyWrite(viewer, REVISION_CURRENT_RULE, ids, new UserFacingError(REVISION_STALE));

    const copyableLineCount = await repoCountCopyableLines(viewer, current.id, tx);
    const ctx: QuoteRevisionCreateCtx = {
      canCreateRevision: structuralEditability({ status: project.status, canWrite }).newRevision,
      copyableLineCount,
      status: project.status,
    };
    const decision = await gate(project, REVISION_CREATE_RULE, ctx);
    if (!decision.allowed) denyWrite(viewer, REVISION_CREATE_RULE, ids, new GateBlockedError(decision.reason));

    let revision;
    try {
      revision = await insertRevision(viewer, { projectId: input.projectId, seq: current.seq + 1 }, tx);
    } catch (error) {
      if (isUniqueViolation(error, SEQ_UNIQUE_CONSTRAINT)) denyWrite(viewer, REVISION_CURRENT_RULE, ids, new UserFacingError(REVISION_STALE));
      throw error;
    }

    const copiedLineCount = await repoCopyQuoteLines(viewer, { fromRevisionId: current.id, toRevisionId: revision.id, withLineage: true }, tx);
    const movedAdjustmentCount = await repoMoveAdjustmentLines(viewer, { fromRevisionId: current.id, toRevisionId: revision.id }, tx);
    await recordAction(
      viewer,
      {
        actionType: "document_create",
        entity: REVISION_ENTITY,
        entityId: revision.id,
        detail: { kind: "quote_revision", seq: revision.seq, copiedLineCount, movedAdjustmentCount },
      },
      { tx },
    );
    return { revisionId: revision.id, seq: revision.seq };
  });
}
