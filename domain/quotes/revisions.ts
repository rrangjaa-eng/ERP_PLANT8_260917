import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { projectRowScope } from "@/domain/projects/visibility";
import { findProjectById, findProjectInScope, lockProjectForWrite } from "@/repositories/projects";
import { listAliveByOwners } from "@/repositories/files";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { findProject } from "@/domain/projects";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import type { QuoteApprovalToggleCtx, QuoteCustomerApprovalCtx, QuoteRevisionCreateCtx } from "@/domain/rules/register";
import { denyWrite, type DenyWriteIds } from "@/domain/rules/deny-write";
import { loadProjectForGate } from "@/domain/projects/auto-transition";
import { ProjectNotFoundError } from "@/domain/projects/status";
import { structuralEditability } from "@/domain/quotes/edit-scope";
import { getCurrentQuoteRevision, linkedDocumentsByLine, listQuoteLines, type QuoteLineDto } from "@/domain/quotes/lines";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { isUniqueViolation } from "@/lib/pg-errors";
import type { DbOrTx } from "@/repositories/document-counters";
import { kstDateOf, kstDayStart, kstToday } from "@/lib/kst-date";
import {
  approvalBasis as repoApprovalBasis,
  findLatestQuoteRevision as repoFindLatestQuoteRevision,
  findQuoteRevisionById as repoFindQuoteRevisionById,
  findQuoteRevisionByProjectAndSeq as repoFindQuoteRevisionByProjectAndSeq,
  insertRevision as repoInsertRevision,
  setRevisionApproval as repoSetRevisionApproval,
  summarizeRevisions as repoSummarizeRevisions,
  type RevisionSummaryRow,
} from "@/repositories/quote-revisions";
import {
  copyQuoteLines as repoCopyQuoteLines,
  countCopyableLines as repoCountCopyableLines,
  moveAdjustmentLines as repoMoveAdjustmentLines,
} from "@/repositories/quote-lines";

// 04-14(PROJ-07 · D-53~D-56) — 상세 견적 차수: 새 차수(전체 복사 + 조정 줄 이동). 쓰기는 트랜잭션 첫 단계에서
// loadProjectForGate로 프로젝트 행을 잠가 줄 저장(04-12)과 한 줄로 선다. 권한(can)은 트랜잭션 앞에서 읽고 잠금 뒤
// 읽기·로그는 전부 tx다(04-32 · ARCHITECTURE §4-8).

const REVISION_ENTITY = "quote_revision";
const PROJECTS_MENU = "projects";
const REVISION_CREATE_RULE = "quote.revision-create";
const REVISION_CURRENT_RULE = "quote.revision-current";
const SEQ_UNIQUE_CONSTRAINT = "quote_revisions_project_seq_key";
// UI-SPEC rev 5 `막힘 — 새 차수(동시·오래된 화면)`.
const REVISION_STALE = "다른 사람이 먼저 새 차수를 만듦 · 새로 고침";
const WRITE_DENIED = "견적 줄 · 쓰기 권한 없음";
const PROJECT_NOT_FOUND = "존재하지 않는 프로젝트";

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

  const [rowScope, canWrite] = await Promise.all([projectRowScope(viewer, deps?.can ? { can: canFn } : undefined), canFn(viewer, PROJECTS_MENU, "write")]);
  if (rowScope.rows === "none") denyWrite(viewer, "projects.view", ids, new ProjectNotFoundError(PROJECT_NOT_FOUND));
  // 06.2(M3 · D-6206): 범위 밖은 쓰기 권리 판정보다 먼저 없음 — 트랜잭션(잠금) 전 전역 db 판정(04-32).
  if (!(await findProjectInScope(viewer, rowScope, input.projectId))) denyWrite(viewer, "projects.view", ids, new ProjectNotFoundError(PROJECT_NOT_FOUND));
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
const APPROVAL_DATE_IN_FUTURE = "승인일이 오늘보다 늦음 · 날짜 수정";

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
    projectRowScope(viewer, deps?.can ? { can: canFn } : undefined),
    canFn(viewer, PROJECTS_MENU, "write"),
    repoFindQuoteRevisionById(viewer, revisionId),
  ]);
  const ids: DenyWriteIds = { projectId: revision?.projectId, revisionId };
  if (rowScope.rows === "none" || !revision) denyWrite(viewer, "projects.view", ids, new ProjectNotFoundError(PROJECT_NOT_FOUND));
  const projectId = revision.projectId;
  // 06.2(M3 · D-6206): 범위 밖 프로젝트의 차수는 없음 — 트랜잭션 전 판정.
  if (!(await findProjectInScope(viewer, rowScope, projectId))) denyWrite(viewer, "projects.view", ids, new ProjectNotFoundError(PROJECT_NOT_FOUND));

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

// ── 표시 번호 · 계보 해석 · 차수 요약 · 이전 차수 잠김 조회(D-55 · D-56 · S5 · U-2 · DR-4 · DR-13) ─────────────────

// D-56 — 견적 표시 번호 `26001-2차`. 저장 컬럼·카운터가 없다.
// D-43 · D-54 — `quote.customer-approval`의 ctx를 만드는 한 곳. 「현재 차수가 승인됐는가」는 호출자 트랜잭션(프로젝트
// 행을 잠근 tx) 안의 최신 차수로만 판정한다 — 이전 승인 차수를 대신 보지 않는다. 설정값·담당 여부는 호출자가 tx 앞에서
// 읽어 넘긴다(04-32). 이 페이즈에는 호출자가 없고 Phase 5 지출결의가 부른다.
export async function customerApprovalGateCtx(
  viewer: Viewer,
  project: { id: string; status: string },
  input: { tx: DbOrTx; gateEnabled: boolean; actorIsAssignedPm: boolean; pmName: string },
): Promise<QuoteCustomerApprovalCtx> {
  const current = await getCurrentQuoteRevision(viewer, project.id, input.tx);
  if (!current) throw new ProjectNotFoundError(PROJECT_NOT_FOUND);
  return {
    status: project.status,
    revisionSeq: current.seq,
    revisionApproved: current.approved,
    gateEnabled: input.gateEnabled,
    actorIsAssignedPm: input.actorIsAssignedPm,
    pmName: input.pmName,
  };
}

export function quoteDisplayNumber(projectNumber: string, seq: number): string {
  return `${projectNumber}-${seq}차`;
}

export { resolveLinkedDocumentsByLineage, type LineageLine } from "@/domain/quotes/lineage";

// S5 · U-2(사용자 확정) — 최신 미승인 `현재` · 승인 `승인`(최신이어도 `승인`만) · 승인 없이 지나간 이전 차수 빈 값.
export function revisionStatusWord(input: { seq: number; latestSeq: number; approved: boolean }): "현재" | "승인" | "" {
  if (input.approved) return "승인";
  return input.seq === input.latestSeq ? "현재" : "";
}

// S5 · CEO 리뷰 B-18·B-20 · ENG-D9 · DR-4 — 차수 요약 한 행. 합계는 `quote.amount`, 나머지(내용 토큰 — 줄 id·버전의
// 해시라 금액이 없다)는 `project.value`로 게이트한다. 차수 id는 04-24가 보관 키의 다른 차수를 `{n}차`로 읽는 데 쓴다.
export type RevisionSummaryDto = {
  revisionId: string;
  seq: number;
  createdOn: string;
  lineCount: number;
  totalKrw: number;
  statusWord: "현재" | "승인" | "";
  approvedOn: string | null;
  approvedBy: string | null;
  contentToken: string;
  // 06-16(D-56) — 이 차수의 승인 증빙 파일 수(살아 있는 파일). 합계를 볼 수 있는 사람(quote.amount)에게만 싣는다.
  approvalEvidenceCount: number;
};

type RevisionSummaryProjectable = RevisionSummaryDto;

export const REVISION_SUMMARY_DTO_SPEC: DtoSpec<RevisionSummaryProjectable, RevisionSummaryDto> = {
  fields: [
    { key: "revisionId", from: "revisionId", infoItem: "project.value" },
    { key: "seq", from: "seq", infoItem: "project.value" },
    { key: "createdOn", from: "createdOn", infoItem: "project.value" },
    { key: "lineCount", from: "lineCount", infoItem: "project.value" },
    { key: "totalKrw", from: "totalKrw", infoItem: "quote.amount" },
    { key: "statusWord", from: "statusWord", infoItem: "project.value" },
    { key: "approvedOn", from: "approvedOn", infoItem: "project.value" },
    { key: "approvedBy", from: "approvedBy", infoItem: "project.value" },
    { key: "contentToken", from: "contentToken", infoItem: "project.value" },
    { key: "approvalEvidenceCount", from: "approvalEvidenceCount", infoItem: "quote.amount" },
  ],
};

registerDto({
  name: "RevisionSummaryDto",
  fields: REVISION_SUMMARY_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

function toSummaryProjectable(row: RevisionSummaryRow, latestSeq: number, evidenceCounts: ReadonlyMap<string, number>): RevisionSummaryProjectable {
  return {
    revisionId: row.id,
    seq: row.seq,
    createdOn: kstDateOf(row.createdAt),
    lineCount: row.lineCount,
    totalKrw: row.totalKrw,
    statusWord: revisionStatusWord({ seq: row.seq, latestSeq, approved: row.customerApprovedAt !== null }),
    approvedOn: approvedOnOf(row.customerApprovedAt),
    approvedBy: row.customerApprovedBy,
    contentToken: row.contentToken,
    approvalEvidenceCount: evidenceCounts.get(row.id) ?? 0,
  };
}

// 차수 요약(최신 순번부터) — 한 번의 GROUP BY 쿼리, 합계는 리포지토리 경계에서 JS 숫자. findProject가 못 보는
// 프로젝트(행 범위 밖 · 없음 · 보관함 권한 없는 보관)면 빈 목록 — 이전 차수 잠김 조회와 같은 기준.
export async function listRevisionSummaries(viewer: Viewer, projectId: string): Promise<Partial<RevisionSummaryDto>[]> {
  if (!(await findProject(viewer, projectId))) return [];
  const rows = await repoSummarizeRevisions(viewer, projectId);
  const latestSeq = Math.max(...rows.map((row) => row.seq));
  const evidenceCounts = new Map<string, number>();
  for (const file of await listAliveByOwners(viewer, { ownerKind: APPROVAL_EVIDENCE_KIND, ownerIds: rows.map((row) => row.id) })) {
    evidenceCounts.set(file.ownerId, (evidenceCounts.get(file.ownerId) ?? 0) + 1);
  }
  return projectMany(
    viewer,
    rows.map((row) => toSummaryProjectable(row, latestSeq, evidenceCounts)),
    REVISION_SUMMARY_DTO_SPEC,
  );
}

// DR-13 · DR-4 · GAP 5c — 이전 차수 잠김 조회(보기 액션 listRevisionLinesAction의 domain 입구). 현재보다 작은 순번이면
// 그 차수의 줄을 모든 셀 `locked`로(조정 줄은 새 차수로 옮겨 가 없다), 현재 이상·없는 순번이면 현재 차수 조회다. 행
// 범위·투영은 findProject · listQuoteLines(QUOTE_LINE_DTO_SPEC)가 한다.
export const revisionLinesInputSchema = z.object({
  projectId: z.string().uuid(),
  revisionSeq: z.number().int().positive(),
});

export async function listRevisionLines(viewer: Viewer, projectId: string, input: { revisionSeq: number }): Promise<QuoteLineDto[]> {
  const project = await findProject(viewer, projectId);
  if (!project) throw new ProjectNotFoundError(PROJECT_NOT_FOUND);
  const current = await repoFindLatestQuoteRevision(viewer, projectId);
  if (!current) throw new ProjectNotFoundError(PROJECT_NOT_FOUND);

  if (input.revisionSeq < current.seq) {
    const previous = await repoFindQuoteRevisionByProjectAndSeq(viewer, projectId, input.revisionSeq);
    if (previous) return listQuoteLines(viewer, previous.id, { status: project.status, canWrite: false, locked: true });
  }
  // 현재 차수 — 상세 화면과 같은 판정(금액을 볼 수 없으면 편집하지 않는다).
  const [canWrite, canAdjust, canSeeAmount] = await Promise.all([
    defaultCan(viewer, PROJECTS_MENU, "write"),
    defaultCan(viewer, "projects.adjustment", "write"),
    defaultVisible(viewer, "quote.amount"),
  ]);
  return listQuoteLines(viewer, current.id, { status: project.status, canWrite: canWrite && canSeeAmount, canAdjust: canAdjust && canSeeAmount });
}

// ── 승인 증빙 주인(06-16 · D-56) ───────────────────────────────────────────────────────────────────────────────
// 05 domain/evidence의 주인 표 `quote_revision` 줄이 부른다(이 파일은 @/domain/evidence를 import하지 않는다 — 순환). 첨부 권리는
// 04 승인 표시(setCustomerApproval)가 읽는 두 사실 — 담당 PM(actorIsAssignedPm) · projects 쓰기(actorCanWrite) — 과 같은 기준이다.

export const APPROVAL_EVIDENCE_KIND = "quote_revision";
export const APPROVAL_EVIDENCE_PM_ONLY = "승인 증빙은 담당 PM만";
export const APPROVAL_EVIDENCE_OFF = "승인 표시 없음 · 증빙 잠김";
export const APPROVAL_EVIDENCE_PROJECT_CLOSED = "완료 · 보관 프로젝트 · 증빙 잠김";

// status: open = 붙이고 뗄 수 있음 · off = 승인 표시 꺼짐(파일은 남아 읽기) · closed = 완료(completed) · 보관 프로젝트(읽기).
export type ApprovalEvidenceOwner = {
  id: string;
  drafterId: string;
  number: null;
  status: "open" | "off" | "closed";
  updatedAt: Date;
  version: number;
  projectId: string;
  instance: null;
  closed: false;
  projectCompleted: false;
};

// tx가 없으면 풀 읽기(보임 · 권리 판정), 있으면 04 setCustomerApproval과 같은 프로젝트 행 잠금 뒤 같은 tx로 차수를 다시 읽는다.
export async function revisionEvidenceOwner(viewer: Viewer, revisionId: string, tx?: DbOrTx): Promise<ApprovalEvidenceOwner | null> {
  const first = await repoFindQuoteRevisionById(viewer, revisionId, tx);
  if (!first) return null;
  const project = tx ? await lockProjectForWrite(viewer, first.projectId, tx) : await findProjectById(viewer, first.projectId);
  if (!project) return null;
  const revision = tx ? await repoFindQuoteRevisionById(viewer, revisionId, tx) : first;
  if (!revision) return null;
  const projectClosed = project.status === "completed" || project.archivedAt !== null;
  return {
    id: revision.id,
    drafterId: project.pmUserId,
    number: null,
    status: projectClosed ? "closed" : revision.customerApprovedAt === null ? "off" : "open",
    updatedAt: revision.updatedAt,
    version: 0,
    projectId: project.id,
    instance: null,
    closed: false,
    projectCompleted: false,
  };
}

// read = 행 범위 안 프로젝트 ∧ quote.amount 노출(승인 버튼과 같은 노출 기준), write = read ∧ 담당 PM ∧ projects 쓰기 ∧ 열림.
// 권리 판정(can · visible · 행 범위)은 풀 읽기라 트랜잭션 밖에서만 부른다(06-03 tx 규약).
export async function revisionEvidenceRights(viewer: Viewer, owner: ApprovalEvidenceOwner): Promise<{ read: boolean; write: boolean }> {
  const [rowScope, canWrite, showsAmount] = await Promise.all([projectRowScope(viewer), defaultCan(viewer, PROJECTS_MENU, "write"), defaultVisible(viewer, "quote.amount")]);
  if (rowScope.rows === "none" || !showsAmount) return { read: false, write: false };
  const project = await findProjectInScope(viewer, rowScope, owner.projectId);
  if (!project || (project.archivedAt !== null && !rowScope.includeArchived)) return { read: false, write: false };
  return { read: true, write: canWrite && owner.drafterId === viewer.id && owner.status === "open" };
}

// 잠근 뒤 순수 판정 — 같은 사실 중 DB 없이 볼 수 있는 것(담당 PM · 열림).
export function revisionEvidenceWriteOpen(owner: ApprovalEvidenceOwner, viewerId: string): boolean {
  return owner.status === "open" && owner.drafterId === viewerId;
}

export function revisionEvidenceNotFound(): UserFacingError {
  return new ProjectNotFoundError(PROJECT_NOT_FOUND);
}

// 권리 밖 직접 호출의 거부 — 04 거부 입구(denyWrite)로 운영 로그 write.denied(허용 id만 · 금액 없음)를 남긴다.
export function denyRevisionEvidenceWrite(viewer: Viewer, owner: ApprovalEvidenceOwner): never {
  const reason = owner.status === "off" ? APPROVAL_EVIDENCE_OFF : owner.status === "closed" ? APPROVAL_EVIDENCE_PROJECT_CLOSED : APPROVAL_EVIDENCE_PM_ONLY;
  return denyWrite(viewer, APPROVAL_TOGGLE_RULE, { projectId: owner.projectId, revisionId: owner.id }, new GateBlockedError(reason));
}
