import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { formatKrw } from "@/lib/format-number";
import { kstDateOf, kstToday } from "@/lib/kst-date";
import { log } from "@/lib/log";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { project } from "@/domain/permissions/project";
import { visible } from "@/domain/permissions/visible";
import { findProject } from "@/domain/projects";
import {
  changeProjectStatus,
  loadActorTeamScope,
  loadStatusChangeFacts,
  ProjectNotFoundError,
  StatusChangedError,
  statusChangedMessage,
  type StatusChangeFacts,
} from "@/domain/projects/status";
import { PROJECT_STATUS_WORD } from "@/domain/projects/status-word";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { getCurrentQuoteRevision, listQuoteLines, type QuoteLineDto } from "@/domain/quotes/lines";
import { getSimpleSettingValues } from "@/domain/settings/registry";
import {
  APPROVAL_ROUTE_SETTLEMENT_SELF_APPROVAL,
  APPROVAL_ROUTE_SETTLEMENT_STEP1_ENABLED,
  APPROVAL_ROUTE_SETTLEMENT_STEP1_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP1_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP1_ORG_UNIT_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP2_ENABLED,
  APPROVAL_ROUTE_SETTLEMENT_STEP2_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP2_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP2_ORG_UNIT_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ENABLED,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ORG_UNIT_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ENABLED,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ORG_UNIT_ID,
} from "@/domain/settings/keys";
import {
  ApprovalConflictError,
  canSeeApprovalDocument,
  prepareSubmission,
  registerDocumentKind,
  resubmitDocument,
  submitDocument,
  withdrawDocument,
  type ApprovalDeps,
  type RouteConfig,
  type RouteSettingDefs,
} from "@/domain/approvals";
import { buildConflictMessage, buildLateUndoMessage } from "@/domain/approvals/conflict-message";
import type { ApprovalStatus } from "@/domain/approvals/route";
import type { DescribeDeps, DocumentDetailRow, DocumentDetailRows, DocumentSummary, RouteConfigStep } from "@/domain/approvals/kinds";
import { GateBlockedError } from "@/domain/rules/gate";
import { SETTLEMENT_DOCUMENT_DTO_SPEC, type SettlementDocumentDto, type SettlementDocumentSource } from "@/domain/settlements/dto";
import { findApprovalGraphByDocument, type ApprovalGraph } from "@/repositories/approvals";
import { findProjectById } from "@/repositories/projects";
import {
  findFinalStepActorInTx,
  findSettlementByProjectId,
  insertSettlementIfAbsent,
  listSettlementSummaries,
  type SettlementSummaryRow,
} from "@/repositories/settlement-approvals";

export type { SettlementDocumentDto } from "@/domain/settlements/dto";

// 05-11(D-98 · D-79 · ROADMAP 기준 6): 정산 결재 — 정산 상태 프로젝트의 담당 PM이 올리고 대표가 승인하는 순간 같은 트랜잭션에서
// 프로젝트가 완료된다(05-01 E2 최종 승인 훅). 문서는 프로젝트마다 하나 · 문서 id = 프로젝트 id · 식별 번호 = 프로젝트 번호(새 카운터 없음).
// 지출결의 · 증빙 마감 점검으로 막지 않는다(Phase 6 PROJ-06 — D-100 · D-99).

export const SETTLEMENT_DOCUMENT_KIND = "settlement";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IN_PROGRESS_STATUSES: ReadonlySet<string> = new Set(["submitted", "in_review"]);
const RESUBMITTABLE_STATUSES: ReadonlySet<string> = new Set(["rejected", "withdrawn"]);
const SETTLING: ProjectStatus = "settling";
// D-80: 결재 중 기간 변경으로 프로젝트가 진행으로 돌아갔을 때 대표 `승인`의 막힘 이유(UI-SPEC S10 — 2차 `반려`는 산다).
const BACK_TO_PROGRESS = "진행으로 바뀜 · 반려";

// ── 결재 권한 브랜드(F1 · A1) ───────────────────────────────────────────────
// `changeProjectStatus`의 결재 경로(trigger approval)가 요구하는 권한 값 — 이 모듈 안의 비공개 생성 함수만 만든다(타입만 export).
// 값은 최종 승인 훅이 같은 tx에서 「이 인스턴스 지금 차수의 마지막 단계 기록 = viewer의 승인」을 확인한 뒤에만 생긴다.
declare const brand: unique symbol;
export type SettlementApprovalAuthority = { projectId: string; documentId: string } & { readonly [brand]: true };

function grantApprovalAuthority(projectId: string, documentId: string): SettlementApprovalAuthority {
  return { projectId, documentId } as SettlementApprovalAuthority;
}

// ── 결재선 설정 17키 ──────────────────────────────────────────────────────

export const SETTLEMENT_ROUTE_SETTINGS: RouteSettingDefs = {
  selfApproval: APPROVAL_ROUTE_SETTLEMENT_SELF_APPROVAL,
  steps: [
    {
      enabled: APPROVAL_ROUTE_SETTLEMENT_STEP1_ENABLED,
      roleId: APPROVAL_ROUTE_SETTLEMENT_STEP1_ROLE_ID,
      scope: APPROVAL_ROUTE_SETTLEMENT_STEP1_SCOPE,
      orgUnitId: APPROVAL_ROUTE_SETTLEMENT_STEP1_ORG_UNIT_ID,
    },
    {
      enabled: APPROVAL_ROUTE_SETTLEMENT_STEP2_ENABLED,
      roleId: APPROVAL_ROUTE_SETTLEMENT_STEP2_ROLE_ID,
      scope: APPROVAL_ROUTE_SETTLEMENT_STEP2_SCOPE,
      orgUnitId: APPROVAL_ROUTE_SETTLEMENT_STEP2_ORG_UNIT_ID,
    },
    {
      enabled: APPROVAL_ROUTE_SETTLEMENT_STEP3_ENABLED,
      roleId: APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID,
      scope: APPROVAL_ROUTE_SETTLEMENT_STEP3_SCOPE,
      orgUnitId: APPROVAL_ROUTE_SETTLEMENT_STEP3_ORG_UNIT_ID,
    },
    {
      enabled: APPROVAL_ROUTE_SETTLEMENT_STEP4_ENABLED,
      roleId: APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID,
      scope: APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE,
      orgUnitId: APPROVAL_ROUTE_SETTLEMENT_STEP4_ORG_UNIT_ID,
    },
  ],
};

const SETTLEMENT_ROUTE_DEFS = [
  APPROVAL_ROUTE_SETTLEMENT_SELF_APPROVAL,
  ...SETTLEMENT_ROUTE_SETTINGS.steps.flatMap((step) => [step.enabled, step.roleId, step.scope, step.orgUnitId]),
];

function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) throw new Error(`결재선 설정 '${key}' 값 없음`);
  return value;
}

// 17키를 getSimpleSettingValues 한 번으로 — 지출결의 로더와 같은 규칙(기본값 없는 org_unit_id 행이 없으면 "").
async function loadSettlementRouteConfig(): Promise<RouteConfig> {
  const values = await getSimpleSettingValues(SETTLEMENT_ROUTE_DEFS);
  const byKey = new Map(SETTLEMENT_ROUTE_DEFS.map((def, i) => [def.key, values[i]]));
  const read = <T>(def: { key: string }): T | undefined => byKey.get(def.key) as T | undefined;
  const steps: RouteConfigStep[] = SETTLEMENT_ROUTE_SETTINGS.steps.map((step) => ({
    enabled: required(read<boolean>(step.enabled), step.enabled.key),
    roleId: required(read<string>(step.roleId), step.roleId.key),
    scope: required(read<RouteConfigStep["scope"]>(step.scope), step.scope.key),
    orgUnitId: read<string>(step.orgUnitId) ?? "",
  }));
  const selfApproval = required(read<RouteConfig["selfApproval"]>(APPROVAL_ROUTE_SETTLEMENT_SELF_APPROVAL), APPROVAL_ROUTE_SETTLEMENT_SELF_APPROVAL.key);
  return { selfApproval, steps };
}

// ── 투영 재료 ──────────────────────────────────────────────────────────────

const STATUS_WORDS: Record<string, string> = {
  submitted: "결재 중",
  in_review: "결재 중",
  approved: "승인",
  rejected: "반려",
  withdrawn: "회수",
};

type Totals = Partial<Pick<SettlementDocumentDto, "quoteTotalKrw" | "executionTotalKrw">>;

// G4: 현재 차수 견적 줄의 견적가(원화) 합 · 실행가(원화 환산) 합 — 견적 줄 표가 그리는 같은 줄 DTO 값의 단순 합(새 계산 규칙 없음).
// viewer가 `quote.amount`를 못 보면 줄 DTO에 두 필드가 없다(투영이 뺐음) — 그때는 합도 만들지 않는다.
async function totalsOf(viewer: Viewer, row: Pick<SettlementSummaryRow, "projectId" | "projectStatus">): Promise<Totals> {
  const revision = await getCurrentQuoteRevision(viewer, row.projectId);
  if (!revision) return {};
  const lines: Partial<QuoteLineDto>[] = await listQuoteLines(viewer, revision.id, { status: row.projectStatus, canWrite: false });
  let quoteTotalKrw = 0;
  let executionTotalKrw = 0;
  for (const line of lines) {
    if (line.quoteAmountKrw === undefined || line.execution === undefined) return {};
    quoteTotalKrw += line.quoteAmountKrw;
    executionTotalKrw += line.execution.amountKrw;
  }
  return { quoteTotalKrw, executionTotalKrw };
}

function toSource(row: SettlementSummaryRow, totals: Totals = {}): SettlementDocumentSource {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    projectNumber: row.projectNumber,
    projectStatus: row.projectStatus,
    startDate: row.startDate,
    endDate: row.endDate,
    pmName: row.pmName,
    ...totals,
    drafterName: row.drafterName,
    createdAt: row.createdAt,
    statusWord: row.status ? (STATUS_WORDS[row.status] ?? row.status) : "작성 중",
    instanceId: row.instanceId,
  };
}

// 결재함 요약 — 투영 뒤 값으로만. 문서 칸 `{프로젝트명}`(결재함이 `정산 결재 · `를 앞에 붙인다), 숫자 칸 없음(measure null).
async function describeSettlementDocuments(viewer: Viewer, ids: string[], deps?: DescribeDeps): Promise<Map<string, DocumentSummary>> {
  const rows = await listSettlementSummaries(viewer, { ids, documentKind: SETTLEMENT_DOCUMENT_KIND });
  const result = new Map<string, DocumentSummary>();
  for (const row of rows) {
    const projected = await project(viewer, toSource(row), SETTLEMENT_DOCUMENT_DTO_SPEC, deps?.visible ? { visible: deps.visible } : undefined);
    const summary: DocumentSummary = { ...projected, measure: null };
    if (projected.projectName) {
      summary.documentText = projected.projectName;
      summary.nextTurnText = { target: projected.projectName, situation: ["정산 결재", projected.drafterName].filter(Boolean).join(", ") };
    }
    if (projected.projectNumber) {
      summary.number = projected.projectNumber;
      summary.finalApprovalNote = `${projected.projectNumber} 완료`;
    }
    result.set(row.id, summary);
  }
  return result;
}

// 결재 시트 상세 — 구조 필드만(엔진이 detailDto로 투영한 뒤 buildDetailRows가 문자열 행을 만든다).
async function loadSettlementDetails(viewer: Viewer, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const rows = await listSettlementSummaries(viewer, { ids, documentKind: SETTLEMENT_DOCUMENT_KIND });
  const result = new Map<string, Record<string, unknown>>();
  for (const row of rows) result.set(row.id, toSource(row, await totalsOf(viewer, row)));
  return result;
}

const DASH = "—";

function textRow(label: string, value: string | null | undefined): DocumentDetailRow | null {
  if (value === undefined) return null;
  return value === null || value === "" ? { label, value: DASH, tone: "muted" } : { label, value, tone: "default" };
}

export function periodText(startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  if (!startDate && !endDate) return null;
  return `${startDate ?? ""} ~ ${endDate ?? ""}`;
}

// 문서 화면 읽기 칸과 같은 순서 — 프로젝트 · 기간 · 담당 PM · 견적가 합 · 실행가 합 · 기안. 투영에서 빠진 필드는 행째 없다(손익 행 없음 — D11).
function buildSettlementDetailRows(projected: Partial<SettlementDocumentDto>): DocumentDetailRows {
  const projectText = projected.projectName === undefined ? undefined : [projected.projectNumber, projected.projectName].filter(Boolean).join(" ");
  const rows = [
    textRow("프로젝트", projectText),
    textRow("기간", projected.startDate === undefined && projected.endDate === undefined ? undefined : periodText(projected.startDate, projected.endDate)),
    textRow("담당 PM", projected.pmName),
    textRow("견적가 합", projected.quoteTotalKrw === undefined ? undefined : formatKrw(projected.quoteTotalKrw)),
    textRow("실행가 합", projected.executionTotalKrw === undefined ? undefined : formatKrw(projected.executionTotalKrw)),
    textRow("기안", projected.drafterName === undefined ? undefined : [projected.drafterName, projected.createdAt ? kstDateOf(projected.createdAt) : null].filter(Boolean).join(" · ")),
  ].filter((row): row is DocumentDetailRow => row !== null);
  return {
    title: projected.projectName ? `정산 결재 — ${projected.projectName}` : "정산 결재",
    subtitle: [projected.projectNumber, projected.drafterName].filter(Boolean).join(" · "),
    rows,
  };
}

// ── 보임 ──────────────────────────────────────────────────────────────────
// 기안자 ∪ 결재 관련자(처리한 사람 · 지금 단계 후보) ∪ (계급 업무 범위 company ∧ 그 프로젝트를 볼 수 있음). 그 밖은 없는 문서(404).
async function canSeeSettlement(viewer: Viewer, row: Pick<SettlementSummaryRow, "id" | "drafterId" | "projectId">): Promise<boolean> {
  if (row.drafterId === viewer.id) return true;
  if (await canSeeApprovalDocument(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: row.id })) return true;
  const scope = await loadActorTeamScope(viewer, { todayKst: kstToday(new Date()) });
  if (scope.workScope !== "company") return false;
  return (await findProject(viewer, row.projectId)) !== null;
}

export async function getSettlement(viewer: Viewer, input: { projectId: string }): Promise<Partial<SettlementDocumentDto> | null> {
  if (!UUID_SHAPE.test(input.projectId)) return null;
  const [row] = await listSettlementSummaries(viewer, { projectIds: [input.projectId], documentKind: SETTLEMENT_DOCUMENT_KIND });
  if (!row || !(await canSeeSettlement(viewer, row))) return null;
  return project(viewer, toSource(row, await totalsOf(viewer, row)), SETTLEMENT_DOCUMENT_DTO_SPEC);
}

// 프로젝트 상세 머리 줄 재료(S10 (가)) — 문서가 없으면 null, 있으면 결재 상태(투영 없는 구조 값 — 버튼 · 링크 낱말만 정한다).
export async function getSettlementState(viewer: Viewer, input: { projectId: string }): Promise<{ status: string | null } | null> {
  const row = await findSettlementByProjectId(viewer, input.projectId);
  if (!row) return null;
  const graph = await findApprovalGraphByDocument(viewer, { documentKind: SETTLEMENT_DOCUMENT_KIND, documentId: row.id });
  return { status: graph?.instance.status ?? null };
}

// 올릴 수 있는 사람 = 그 프로젝트의 담당 PM ∧ `projects` 쓰기(프로젝트 쓰기 권리). 상태는 호출자가 본다.
async function isAssignedPmWriter(viewer: Viewer, pmUserId: string): Promise<boolean> {
  return pmUserId === viewer.id && (await can(viewer, "projects", "write"));
}

function notSettling(status: string): StatusChangedError {
  return new StatusChangedError(statusChangedMessage(PROJECT_STATUS_WORD[status as ProjectStatus] ?? status, "새로 고침"), status);
}

// ── 올리기 · 다시 올리기 ────────────────────────────────────────────────────

export type SubmitSettlementResult =
  | { kind: "submitted"; documentId: string; instanceId: string; version: number; round: number }
  | { kind: "already_submitted"; documentId: string };

// 트랜잭션 전: 프로젝트 보임 · 담당 PM 쓰기 권리 · 상태 settling · 결재선(prepareSubmission). 트랜잭션 안: 프로젝트 상태를 tx로 읽기만
// (잠그지 않는다 — 승인 경로의 인스턴스 → 프로젝트 순서와 반대로 잠그면 교착, T-05-1106) → 문서 행(ON CONFLICT DO NOTHING + 재조회) →
// 인스턴스(처음이면 제출, 반려 · 회수면 같은 문서 다음 차수 — 05-01 E1, 진행 중이면 기존 문서 그대로).
export async function submitSettlement(viewer: Viewer, input: { projectId: string }): Promise<SubmitSettlementResult> {
  const found = UUID_SHAPE.test(input.projectId) ? await findProject(viewer, input.projectId) : null;
  if (!found || !found.id) throw new ProjectNotFoundError("존재하지 않는 프로젝트");
  const projectRow = await findProjectById(viewer, input.projectId);
  if (!projectRow) throw new ProjectNotFoundError("존재하지 않는 프로젝트");
  if (!(await isAssignedPmWriter(viewer, projectRow.pmUserId))) throw new ForbiddenError("정산 결재는 담당 PM만");
  if (projectRow.status !== SETTLING) throw notSettling(projectRow.status);
  const prepared = await prepareSubmission(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, drafterId: viewer.id });

  return withTransaction(async (tx): Promise<SubmitSettlementResult> => {
    const current = await findProjectById(viewer, input.projectId, tx);
    if (!current) throw new ProjectNotFoundError("존재하지 않는 프로젝트");
    if (current.status !== SETTLING) throw notSettling(current.status);
    const inserted = await insertSettlementIfAbsent(viewer, { projectId: input.projectId, drafterId: viewer.id }, tx);
    const doc = inserted ?? (await findSettlementByProjectId(viewer, input.projectId, tx));
    if (!doc) throw new ProjectNotFoundError("존재하지 않는 프로젝트");
    if (!inserted) {
      const graph = await findApprovalGraphByDocument(viewer, { documentKind: SETTLEMENT_DOCUMENT_KIND, documentId: doc.id }, tx);
      if (graph && RESUBMITTABLE_STATUSES.has(graph.instance.status)) {
        const again = await resubmitDocument(viewer, prepared, { instanceId: graph.instance.id, expectedVersion: graph.instance.version }, tx);
        return { kind: "submitted", documentId: doc.id, instanceId: graph.instance.id, version: again.version, round: again.round };
      }
      if (graph) return { kind: "already_submitted", documentId: doc.id };
    }
    const instance = await submitDocument(viewer, prepared, { documentId: doc.id }, tx);
    return { kind: "submitted", documentId: doc.id, instanceId: instance.id, version: instance.version, round: instance.currentRound };
  });
}

// ── 회수 · 되돌리기(05-09 withdrawExpense와 같은 모양) ──────────────────────

export type SettlementUndoRefusal = { actorName: string | null; at: Date; status: string };

export class SettlementUndoRefusedError extends UserFacingError {
  constructor(
    message: string,
    readonly detail: SettlementUndoRefusal,
  ) {
    super(message);
  }
}

export class SettlementNotFoundError extends UserFacingError {
  constructor() {
    super("없는 정산 결재 · 새로 고침");
  }
}

export type WithdrawSettlementInput = { projectId: string; undo: true; round: number } | { projectId: string; expectedInstanceVersion: number };

// 되돌리기가 열린 상태 = 지금 차수가 토스트의 차수 · 상태 submitted · 지금 차수 처리 기록 없음. 아니면 늦은 되돌리기 거부.
async function undoRefusal(viewer: Viewer, graph: ApprovalGraph, round: number, deps?: ApprovalDeps): Promise<SettlementUndoRefusedError | null> {
  const { instance } = graph;
  const steps = graph.routes.find((route) => route.round === instance.currentRound)?.steps ?? [];
  const acted = steps
    .flatMap((step) => (step.action !== null && step.actedAt !== null ? [{ ...step, actedAt: step.actedAt }] : []))
    .sort((a, b) => b.actedAt.getTime() - a.actedAt.getTime())[0];
  if (instance.currentRound === round && instance.status === "submitted" && !acted) return null;
  const namesVisible = await visible(viewer, "approval.value", deps?.findVisibility ? { findVisibility: deps.findVisibility } : undefined);
  if (acted && (acted.action === "approved" || acted.action === "rejected")) {
    const actorName = namesVisible ? acted.actedByName : null;
    const message = buildLateUndoMessage({ actorName, at: acted.actedAt, action: acted.action, withdrawable: IN_PROGRESS_STATUSES.has(instance.status) });
    return new SettlementUndoRefusedError(message, { actorName, at: acted.actedAt, status: acted.action });
  }
  const actorName = namesVisible && instance.updatedBy === instance.drafterId ? instance.drafterName : null;
  const message = buildConflictMessage({ status: instance.status as ApprovalStatus, round: instance.currentRound, actorName, at: instance.updatedAt, attempted: "withdraw", versionReason: null });
  return new SettlementUndoRefusedError(message, { actorName, at: instance.updatedAt, status: instance.status });
}

export async function withdrawSettlement(viewer: Viewer, input: WithdrawSettlementInput, deps?: ApprovalDeps): Promise<{ status: string; version: number; round: number }> {
  const doc = UUID_SHAPE.test(input.projectId) ? await findSettlementByProjectId(viewer, input.projectId) : null;
  if (!doc || doc.drafterId !== viewer.id) throw new SettlementNotFoundError();
  const readGraph = async () => {
    const graph = await findApprovalGraphByDocument(viewer, { documentKind: SETTLEMENT_DOCUMENT_KIND, documentId: doc.id });
    if (!graph) throw new SettlementNotFoundError();
    return graph;
  };
  if ("expectedInstanceVersion" in input) {
    const graph = await readGraph();
    const done = await withdrawDocument(viewer, { instanceId: graph.instance.id, expectedVersion: input.expectedInstanceVersion }, deps);
    return { status: done.status, version: done.version, round: graph.instance.currentRound };
  }
  const attempt = async () => {
    const graph = await readGraph();
    const refusal = await undoRefusal(viewer, graph, input.round, deps);
    if (refusal) throw refusal;
    const done = await withdrawDocument(viewer, { instanceId: graph.instance.id, expectedVersion: graph.instance.version }, deps);
    return { status: done.status, version: done.version, round: graph.instance.currentRound };
  };
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof ApprovalConflictError)) throw error;
    return attempt();
  }
}

// ── 최종 승인 훅(05-01 E2) · 승인 막힘 이유(E3) · 다시 올리기 조건(E1) ─────────

type PreparedFinal = { projectId: string; facts: StatusChangeFacts };

function asPreparedFinal(value: unknown): PreparedFinal {
  if (typeof value === "object" && value !== null && "projectId" in value && "facts" in value) return value as PreparedFinal;
  throw new Error("정산 최종 승인 사전 사실 없음");
}

// 트랜잭션 전(풀 읽기) — 문서의 프로젝트 id와 상태 전환 사실(문구 라벨 · 시작일 규칙만 쓰인다 — 메뉴 · 팀 범위는 결재 경로에서 쓰이지 않는다).
async function prepareSettlementFinalApproval(viewer: Viewer, documentId: string): Promise<PreparedFinal> {
  const [row] = await listSettlementSummaries(viewer, { ids: [documentId], documentKind: SETTLEMENT_DOCUMENT_KIND });
  if (!row) throw new SettlementNotFoundError();
  return { projectId: row.projectId, facts: await loadStatusChangeFacts(viewer) };
}

// 같은 tx — ⓐ 이 문서 인스턴스 지금 차수의 마지막 단계 기록이 viewer의 승인인지와 문서의 project_id를 한 번에 읽고(대표 폴백 행 포함)
// ⓑ 통과하면 브랜드 권한으로 `정산 → 완료`(trigger approval). 던지면 승인 전체가 롤백된다(경고 로그 뒤 다시 던짐 — 이름 · 금액 없음).
async function onSettlementFinalApprovalInTx(viewer: Viewer, documentId: string, tx: Parameters<typeof findFinalStepActorInTx>[2], prepared: unknown): Promise<void> {
  const before = asPreparedFinal(prepared);
  try {
    const found = await findFinalStepActorInTx(viewer, { documentId, documentKind: SETTLEMENT_DOCUMENT_KIND }, tx);
    if (!found || found.projectId !== before.projectId) throw new GateBlockedError("지금 담당이 아님 · 새로 고침");
    await changeProjectStatus(
      viewer,
      found.projectId,
      { from: SETTLING, to: "completed", trigger: "approval" },
      { tx, facts: before.facts, approvalAuthority: grantApprovalAuthority(found.projectId, documentId) },
    );
  } catch (error) {
    log.warn("settlement.final_approval_rolled_back", { documentId, projectId: before.projectId, reason: error instanceof Error ? error.constructor.name : "unknown" });
    throw error;
  }
}

// 표시 전용(트랜잭션 없음) — 엔진은 viewer가 지금 담당인 문서만 넘긴다. 프로젝트가 정산이 아니면(D-80 진행 복귀) `승인`을 막아 보인다.
async function settlementApproveBlockedReason(viewer: Viewer, ids: string[]): Promise<Map<string, string>> {
  const rows = await listSettlementSummaries(viewer, { ids, documentKind: SETTLEMENT_DOCUMENT_KIND });
  return new Map(rows.filter((row) => row.projectStatus !== SETTLING).map((row) => [row.id, BACK_TO_PROGRESS]));
}

// 다시 올리기 = 그 문서 프로젝트의 담당 PM 쓰기 권리 ∧ 프로젝트 상태 settling(문서 id가 없으면 거짓 — Round 4 D5).
async function canResubmitSettlement(viewer: Viewer, documentId?: string): Promise<boolean> {
  if (!documentId) return false;
  const [row] = await listSettlementSummaries(viewer, { ids: [documentId], documentKind: SETTLEMENT_DOCUMENT_KIND });
  if (!row || row.projectStatus !== SETTLING) return false;
  return isAssignedPmWriter(viewer, row.pmUserId);
}

registerDocumentKind({
  kind: SETTLEMENT_DOCUMENT_KIND,
  label: "정산 결재",
  loadRouteConfig: () => loadSettlementRouteConfig(),
  href: (documentId) => `/projects/${documentId}/settlement`,
  describeDocuments: describeSettlementDocuments,
  routeSettings: SETTLEMENT_ROUTE_SETTINGS,
  canResubmit: canResubmitSettlement,
  resubmitFrom: ["rejected", "withdrawn"],
  prepareFinalApproval: prepareSettlementFinalApproval,
  onFinalApprovalInTx: onSettlementFinalApprovalInTx,
  approveBlockedReason: settlementApproveBlockedReason,
  loadDetails: loadSettlementDetails,
  detailDto: SETTLEMENT_DOCUMENT_DTO_SPEC,
  buildDetailRows: buildSettlementDetailRows,
});
