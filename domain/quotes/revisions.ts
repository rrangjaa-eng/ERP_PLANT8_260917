import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import type { QuoteApprovalToggleCtx, QuoteRevisionCreateCtx } from "@/domain/rules/register";
import { denyWrite, type DenyWriteIds } from "@/domain/rules/deny-write";
import { loadProjectForGate } from "@/domain/projects/auto-transition";
import { ProjectNotFoundError } from "@/domain/projects/status";
import { structuralEditability } from "@/domain/quotes/edit-scope";
import { linkedDocumentsByLine } from "@/domain/quotes/lines";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { isUniqueViolation } from "@/lib/pg-errors";
import { kstDateOf, kstDayStart, kstToday } from "@/lib/kst-date";
import {
  approvalBasis as repoApprovalBasis,
  findLatestQuoteRevision as repoFindLatestQuoteRevision,
  findQuoteRevisionById as repoFindQuoteRevisionById,
  insertRevision as repoInsertRevision,
  setRevisionApproval as repoSetRevisionApproval,
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

// ── 고객 승인 표시(D-56 · CEO 리뷰 B-25 · B-30 · ENG-D4 · ENG-D9) ──────────────────────────────────────────────

const APPROVAL_TOGGLE_RULE = "quote.approval-toggle";
// rev 5 밖 방어 문구 — 사람이 고칠 입력 오류라 「~해 주세요」.
const APPROVAL_DATE_IN_FUTURE = "승인일이 오늘보다 늦음 · 날짜를 고쳐 주세요";

// B-25 — 승인일은 KST 달력 날짜로 받아 그날 KST 00:00 순간으로 저장하고(`customer_approved_at`은 시간대 없는
// timestamp라 SQL 날짜 캐스트는 하루 앞 날짜를 준다), 읽을 때 같은 날짜로 돌린다. 04-29의 한 쌍만 쓴다.
export function customerApprovalColumns(
  viewerId: string,
  approvedOn: string | null,
): { customerApprovedAt: Date | null; customerApprovedBy: string | null } {
  if (approvedOn === null) return { customerApprovedAt: null, customerApprovedBy: null };
  return { customerApprovedAt: kstDayStart(approvedOn), customerApprovedBy: viewerId };
}

export function approvedOnOf(at: Date | null): string | null {
  return at === null ? null : kstDateOf(at);
}

export type CustomerApprovalInput = { approvedOn: string; seenTotalKrw: number; contentToken: string };

export type SetCustomerApprovalDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  now: () => Date;
  afterLock: () => Promise<void>;
  // 연결 문서 조회(이 페이즈는 빈 결과 — Phase 5가 채운다). 테스트가 한 건을 주입한다.
  linkedDocuments: typeof linkedDocumentsByLine;
};

export type CustomerApprovalResult = { revisionId: string; seq: number; approvedOn: string | null };

// 담당 PM(`pm_user_id` + `projects` 쓰기)이 현재 차수의 승인 표시를 승인일과 함께 켜거나 끈다. 결재를 거치지 않고
// 행동 로그 `document_update`(kind: customer_approval)를 같은 트랜잭션에 남긴다. 켜기는 PM이 본 기준값(합계 · 내용
// 토큰)을 싣고, 잠금 뒤 같은 tx로 다시 계산한 값과 다르면 거부한다. 끄기(input null)는 기준값을 받지 않는다.
export async function setCustomerApproval(
  viewer: Viewer,
  revisionId: string,
  input: CustomerApprovalInput | null,
  deps?: Partial<SetCustomerApprovalDeps>,
): Promise<CustomerApprovalResult> {
  const canFn = deps?.can ?? defaultCan;
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  const linkedDocuments = deps?.linkedDocuments ?? linkedDocumentsByLine;
  const now = deps?.now ?? (() => new Date());

  // 트랜잭션 앞(04-32) — 권한 · 행 범위 · 차수의 프로젝트(바뀌지 않는 사실).
  const [rowScope, canWrite, revision] = await Promise.all([
    scopeFor(viewer, PROJECT_ENTITY, { can: canFn }),
    canFn(viewer, PROJECTS_MENU, "write"),
    repoFindQuoteRevisionById(viewer, revisionId),
  ]);
  const ids: DenyWriteIds = { projectId: revision?.projectId, revisionId };
  if (rowScope.rows === "none" || !revision) denyWrite(viewer, "projects.view", ids, new ProjectNotFoundError(PROJECT_NOT_FOUND));
  const projectId = revision.projectId;

  return withTransaction(async (tx) => {
    const project = await loadProjectForGate(viewer, projectId, { now, tx, afterLock: deps?.afterLock }, { recordAction });
    if (!project || (project.archivedAt !== null && !rowScope.includeArchived)) {
      denyWrite(viewer, "projects.view", ids, new ProjectNotFoundError(PROJECT_NOT_FOUND));
    }

    const current = await repoFindLatestQuoteRevision(viewer, projectId, tx);
    const turningOn = input !== null;
    let approvableLineCount = 0;
    let basisMatches = false;
    let hasLinkedDocuments = false;
    if (input) {
      const basis = await repoApprovalBasis(viewer, revisionId, tx);
      approvableLineCount = basis.approvableLineCount;
      basisMatches = input.seenTotalKrw === basis.totalKrw && input.contentToken === basis.contentToken;
    } else {
      const linked = await linkedDocuments(viewer, revisionId, tx);
      hasLinkedDocuments = [...linked.values()].some((docs) => docs.length > 0);
    }

    const ctx: QuoteApprovalToggleCtx = {
      turningOn,
      status: project.status,
      actorIsAssignedPm: project.pmUserId === viewer.id,
      actorCanWrite: canWrite,
      isCurrentRevision: current?.id === revisionId,
      approvableLineCount,
      basisMatches,
      hasLinkedDocuments,
    };
    const decision = await gate(project, APPROVAL_TOGGLE_RULE, ctx);
    if (!decision.allowed) denyWrite(viewer, APPROVAL_TOGGLE_RULE, ids, new GateBlockedError(decision.reason));
    if (input && input.approvedOn > kstToday(now())) denyWrite(viewer, APPROVAL_TOGGLE_RULE, ids, new UserFacingError(APPROVAL_DATE_IN_FUTURE));

    const columns = customerApprovalColumns(viewer.id, input?.approvedOn ?? null);
    await repoSetRevisionApproval(viewer, revisionId, columns, tx);
    // 승인 DTO(04-24 부제)의 승인일은 저장한 순간에서 되읽은 KST 날짜다.
    const approvedOn = approvedOnOf(columns.customerApprovedAt);
    const seq = revision.seq;
    await recordAction(
      viewer,
      {
        actionType: "document_update",
        entity: REVISION_ENTITY,
        entityId: revisionId,
        detail: approvedOn === null ? { kind: "customer_approval", revisionSeq: seq, cleared: true } : { kind: "customer_approval", revisionSeq: seq, approvedOn },
      },
      { tx },
    );
    return { revisionId, seq, approvedOn };
  });
}
