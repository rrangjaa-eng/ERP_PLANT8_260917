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
import { projectRowScope } from "@/domain/projects/visibility";
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
import { hasPriorApproval, type ApprovalStatus } from "@/domain/approvals/route";
import type { DescribeDeps, DocumentDetailRow, DocumentDetailRows, DocumentSummary, RouteConfigStep } from "@/domain/approvals/kinds";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { computePreSettleCheck, loadPreSettleInputs, preSettleLogDetail, type PreSettleInputs } from "@/domain/pre-settle-check";
import type { TxLogDeps } from "@/domain/approvals/tx-log";
import { appendActionLog } from "@/repositories/action-log";
import { SETTLEMENT_DOCUMENT_DTO_SPEC, type SettlementDocumentDto, type SettlementDocumentSource } from "@/domain/settlements/dto";
import { findApprovalGraphByDocument, type ApprovalGraph } from "@/repositories/approvals";
import { countInReviewByProjects } from "@/repositories/expenses";
import { findProjectById, findProjectInScope, lockProjectForWrite } from "@/repositories/projects";
import { findLatestQuoteRevision } from "@/repositories/quote-revisions";
import { listQuoteLinesByRevision } from "@/repositories/quote-lines";
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
// 완료 전 점검(Phase 6 PROJ-06 — D-100 · D-99)은 기안(06-19)과 대표 최종 승인(06-22 O-16) 두 자리에서 같은 판정으로 막는다.

export const SETTLEMENT_DOCUMENT_KIND = "settlement";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IN_PROGRESS_STATUSES: ReadonlySet<string> = new Set(["submitted", "in_review"]);
const RESUBMITTABLE_STATUSES: ReadonlySet<string> = new Set(["rejected", "withdrawn"]);
const SETTLING: ProjectStatus = "settling";
// D-80: 결재 중 기간 변경으로 프로젝트가 진행으로 돌아갔을 때 대표 `승인`의 막힘 이유(UI-SPEC S10 — 2차 `반려`는 산다).
const BACK_TO_PROGRESS = "진행으로 바뀜 · 반려";
// 05 /review A8(사용자 확정 10/5): 결재 중 지출결의가 남은 프로젝트는 정산 최종 승인을 막는다 — 남은 건수 한 줄.
const expensesInReview = (count: number) => `결재 중 지출결의 ${count}건 · 먼저 결재`;
// 06-22(O-16 · M-6): 대표 최종 승인 앞 완료 전 점검 막힘 — 서버 거부 · 표시가 이 함수 하나를 쓴다(고치는 일은 담당 PM 몫이라 이름을 적는다).
function preSettleApproveReason(blockedCount: number, pmName: string | null): string {
  return pmName ? `완료 전 점검 ${blockedCount}건 · 담당 PM ${pmName}` : `완료 전 점검 ${blockedCount}건`;
}
// 점검을 계산하지 못한 정산 결재의 `승인` 막힘(fail-closed — 점검 없이 승인하지 않는다).
const PRE_SETTLE_UNKNOWN = "점검 결과 없음 · 다시 시도";

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

// G4: 현재 차수 견적 줄(보관 제외)의 견적가(원화) 합 · 실행가(원화 환산) 합 — 견적 줄 표가 그리는 같은 줄 값의 단순 합(새 계산 규칙 없음).
// 06.2(D-6205 ② · 06.2-03 넘김): 두 합은 문서 보임(canSeeSettlement · 결재 엔진의 결재 관련자 판정) 뒤에만 읽는다(post-gate) —
// 프로젝트 행 범위로 다시 거르지 않는다(범위 밖 결재자도 결재 근거를 오류 없이 본다). 금액 노출은 SETTLEMENT_DOCUMENT_DTO_SPEC의
// `quote.amount` 투영이 가린다(견적 표 금액 열과 같은 항목 — 못 보면 키째 없다).
async function totalsOf(viewer: Viewer, row: Pick<SettlementSummaryRow, "projectId">): Promise<Totals> {
  const revision = await findLatestQuoteRevision(viewer, row.projectId);
  if (!revision) return {};
  const lines = await listQuoteLinesByRevision(viewer, revision.id);
  let quoteTotalKrw = 0;
  let executionTotalKrw = 0;
  for (const line of lines) {
    quoteTotalKrw += line.quoteAmountKrw;
    executionTotalKrw += line.executionAmountKrw;
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
  // 문서마다 합계 읽기를 동시에(05 /review A13).
  const entries = await Promise.all(rows.map(async (row) => [row.id, toSource(row, await totalsOf(viewer, row))] as const));
  return new Map<string, Record<string, unknown>>(entries);
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

// 문서 화면 레이아웃의 404 판정 — 두 합을 만들지 않는 가벼운 읽기(getSettlement와 같은 보임 규칙).
export async function canSeeSettlementDocument(viewer: Viewer, input: { projectId: string }): Promise<boolean> {
  if (!UUID_SHAPE.test(input.projectId)) return false;
  const [row] = await listSettlementSummaries(viewer, { projectIds: [input.projectId], documentKind: SETTLEMENT_DOCUMENT_KIND });
  if (!row) return false;
  return canSeeSettlement(viewer, row);
}

export async function getSettlement(viewer: Viewer, input: { projectId: string }): Promise<Partial<SettlementDocumentDto> | null> {
  if (!UUID_SHAPE.test(input.projectId)) return null;
  const [row] = await listSettlementSummaries(viewer, { projectIds: [input.projectId], documentKind: SETTLEMENT_DOCUMENT_KIND });
  if (!row || !(await canSeeSettlement(viewer, row))) return null;
  return project(viewer, toSource(row, await totalsOf(viewer, row)), SETTLEMENT_DOCUMENT_DTO_SPEC);
}

// 06-22(S18 · PS-4): 정산 결재 문서 화면의 완료 전 점검 요약 — 문서를 볼 수 있고 프로젝트가 정산일 때 막힘 건수 · 강행 결과 줄(지금 판정 —
// 스냅숏 칸 없음), 아니면 null. 계산 예외는 던진다(화면이 오류 갈래로 — 점검 없이 다시 올리지 않는다).
export async function getSettlementPreSettleSummary(
  viewer: Viewer,
  input: { projectId: string },
): Promise<{ blockedCount: number; forcedResultLine: string | null } | null> {
  if (!UUID_SHAPE.test(input.projectId)) return null;
  const [row] = await listSettlementSummaries(viewer, { projectIds: [input.projectId], documentKind: SETTLEMENT_DOCUMENT_KIND });
  if (!row || row.projectStatus !== SETTLING || !(await canSeeSettlement(viewer, row))) return null;
  const check = await computePreSettleCheck(viewer, row.projectId, await loadPreSettleInputs(viewer));
  return { blockedCount: check.blockedCount, forcedResultLine: check.forcedResultLine };
}

// 프로젝트 상세 머리 줄 재료(S10 (가)) — 문서가 있고 볼 수 있으면 상태 낱말(`정산 결재 {낱말}` 링크), 없고 정산 · 담당 PM 쓰기 권리면 올리기,
// 둘 다 아니면 null(아무것도 그리지 않는다). 낱말은 04.1 결재 낱말에서 `결재`를 뺀 꼴(`결재 중` → `중`).
const HEADER_WORDS: Record<string, string> = { submitted: "중", in_review: "중", approved: "승인", rejected: "반려", withdrawn: "회수" };

export async function getSettlementHeader(viewer: Viewer, input: { projectId: string }): Promise<{ statusWord: string | null; canSubmit: boolean } | null> {
  if (!UUID_SHAPE.test(input.projectId)) return null;
  const [row] = await listSettlementSummaries(viewer, { projectIds: [input.projectId], documentKind: SETTLEMENT_DOCUMENT_KIND });
  if (row) {
    if (!row.status || !(await canSeeSettlement(viewer, row))) return null;
    return { statusWord: HEADER_WORDS[row.status] ?? row.status, canSubmit: false };
  }
  // 06.2(D-6208): 프로젝트 범위 — 260907 `O: server/src/settlement.ts:453` 참여자 조각 누락을 따르지 않는다.
  const projectRow = await findProjectInScope(viewer, await projectRowScope(viewer), input.projectId);
  if (!projectRow || projectRow.status !== SETTLING || !(await isAssignedPmWriter(viewer, projectRow.pmUserId))) return null;
  return { statusWord: null, canSubmit: true };
}

// 문서 화면 한 줄 `진행 중 · 정산 뒤 다시 올리기`(D-80) — 반려 · 회수된 내 정산 결재인데 프로젝트가 진행으로 돌아가 지금은 다시 올릴 수 없다.
export async function isSettlementResubmitWaiting(viewer: Viewer, input: { projectId: string }): Promise<boolean> {
  if (!UUID_SHAPE.test(input.projectId)) return false;
  const [row] = await listSettlementSummaries(viewer, { projectIds: [input.projectId], documentKind: SETTLEMENT_DOCUMENT_KIND });
  return Boolean(row && row.drafterId === viewer.id && row.status && RESUBMITTABLE_STATUSES.has(row.status) && row.projectStatus === "in_progress");
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
  // 06.2(D-6208): 프로젝트 범위 — 260907 `O: server/src/settlement.ts:453` 참여자 조각 누락을 따르지 않는다.
  const projectRow = await findProjectInScope(viewer, await projectRowScope(viewer), input.projectId);
  if (!projectRow) throw new ProjectNotFoundError("존재하지 않는 프로젝트");
  if (!(await isAssignedPmWriter(viewer, projectRow.pmUserId))) throw new ForbiddenError("정산 결재는 담당 PM만");
  if (projectRow.status !== SETTLING) throw notSettling(projectRow.status);
  const prepared = await prepareSubmission(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, drafterId: viewer.id });
  // 06-19(UA-610 · ENG E-1): 완료 전 점검의 권한 · 설정은 트랜잭션 앞에서 읽는다(예외면 트랜잭션을 열지 않고 거부).
  const preSettleInputs = await loadPreSettleInputs(viewer);

  return withTransaction(async (tx): Promise<SubmitSettlementResult> => {
    // post-gate: 트랜잭션 전 findProjectInScope 판정 뒤 tx 읽기(잠그지 않음 — T-05-1106).
    const current = await findProjectById(viewer, input.projectId, tx);
    if (!current) throw new ProjectNotFoundError("존재하지 않는 프로젝트");
    if (current.status !== SETTLING) throw notSettling(current.status);
    const inserted = await insertSettlementIfAbsent(viewer, { projectId: input.projectId, drafterId: viewer.id }, tx);
    const doc = inserted ?? (await findSettlementByProjectId(viewer, input.projectId, tx));
    if (!doc) throw new ProjectNotFoundError("존재하지 않는 프로젝트");
    // 06-19: 기안 직전 같은 tx로 완료 전 점검 — 막힘이면 거부(문서 행도 롤백). 점검 예외는 잡지 않는다(fail-closed).
    // 강행으로 통과하면 같은 tx의 document_submit 로그 상세에 기안 시점 요약을 싣는다(PS-4 — 새 행동 종류 없음).
    const passPreSettle = async (): Promise<TxLogDeps | undefined> => {
      const check = await computePreSettleCheck(viewer, input.projectId, preSettleInputs, tx);
      const decision = await gate(null, "project.pre-settle-check", { blockedCount: check.blockedCount });
      if (!decision.allowed) throw new GateBlockedError(decision.reason);
      if (check.forcedResultLine === null) return undefined;
      const preSettle = preSettleLogDetail(check);
      return { appendActionLog: (v, entry, logTx) => appendActionLog(v, { ...entry, detail: { ...entry.detail, preSettle } }, logTx) };
    };
    if (!inserted) {
      const graph = await findApprovalGraphByDocument(viewer, { documentKind: SETTLEMENT_DOCUMENT_KIND, documentId: doc.id }, tx);
      if (graph && RESUBMITTABLE_STATUSES.has(graph.instance.status)) {
        const logDeps = await passPreSettle();
        const again = await resubmitDocument(viewer, prepared, { instanceId: graph.instance.id, expectedVersion: graph.instance.version }, tx, logDeps);
        return { kind: "submitted", documentId: doc.id, instanceId: graph.instance.id, version: again.version, round: again.round };
      }
      if (graph) return { kind: "already_submitted", documentId: doc.id };
    }
    const logDeps = await passPreSettle();
    const instance = await submitDocument(viewer, prepared, { documentId: doc.id }, tx, logDeps);
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
    // 06.6 D-6609: 기안자 아닌 사람의 승인이 있으면 문서 화면 회수도 막혀 꼬리는 새로 고침.
    const withdrawable = IN_PROGRESS_STATUSES.has(instance.status) && !hasPriorApproval(steps, instance.drafterId);
    const message = buildLateUndoMessage({ actorName, at: acted.actedAt, action: acted.action, withdrawable });
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

type PreparedFinal = { projectId: string; facts: StatusChangeFacts; preSettle: { inputs: PreSettleInputs; pmName: string | null } };

function asPreparedFinal(value: unknown): PreparedFinal {
  if (typeof value === "object" && value !== null && "projectId" in value && "facts" in value && "preSettle" in value) return value as PreparedFinal;
  throw new Error("정산 최종 승인 사전 사실 없음");
}

// 점검 읽기 · 계산이 던지면 표시 훅과 같은 `점검 결과 없음 · 다시 시도`로 거부한다(06-22 검토 1 — 원인은 로그에만).
function preSettleUnknown(error: unknown, projectId: string | null): GateBlockedError {
  log.warn("settlement.pre_settle_approve_failed", { projectId, reason: error instanceof Error ? error.constructor.name : "unknown" });
  return new GateBlockedError(PRE_SETTLE_UNKNOWN);
}

// 트랜잭션 전(풀 읽기) — 문서의 프로젝트 id와 상태 전환 사실(문구 라벨 · 시작일 규칙만 쓰인다 — 메뉴 · 팀 범위는 결재 경로에서 쓰이지 않는다).
// 06-22(O-16 · ENG E-1): 완료 전 점검의 권한 · 설정 · 노출(loadPreSettleInputs)과 담당 PM 이름도 여기서 읽는다 — 던지면 `점검 결과 없음`
// 으로 거부한다(엔진이 트랜잭션을 열기 전에 거부된다 · 같은 종류의 승인마다 불리므로 앞 단 승인도 막는다 — SA-3).
async function prepareSettlementFinalApproval(viewer: Viewer, documentId: string): Promise<PreparedFinal> {
  const [row] = await listSettlementSummaries(viewer, { ids: [documentId], documentKind: SETTLEMENT_DOCUMENT_KIND });
  if (!row) throw new SettlementNotFoundError();
  let preSettle: PreparedFinal["preSettle"];
  try {
    const inputs = await loadPreSettleInputs(viewer);
    // 담당 PM 이름은 문서 DTO의 pmName과 같은 정보 항목(project.value)을 볼 때만 막힘 문구에 싣는다.
    preSettle = { inputs, pmName: (await visible(viewer, "project.value")) ? row.pmName : null };
  } catch (error) {
    throw preSettleUnknown(error, row.projectId);
  }
  return { projectId: row.projectId, facts: await loadStatusChangeFacts(viewer), preSettle };
}

// 같은 tx — ⓐ 이 문서 인스턴스 지금 차수의 마지막 단계 기록이 viewer의 승인인지와 문서의 project_id를 한 번에 읽고(대표 폴백 행 포함)
// ⓑ 프로젝트 행을 잡고(06-22 X-12 — 06-11 증빙 무효가 같은 행을 먼저 잡으므로 무효와 재점검이 직렬화된다) ⓒ 정산이면 A8(R-2 — 강행 허용과
// 무관) → 완료 전 점검(O-16 — 같은 tx · 사전 조회 값만) ⓓ 통과하면 브랜드 권한으로 `정산 → 완료`(trigger approval). 정산이 아니면(진행 복귀)
// ⓒ를 건너뛰고 ⓓ가 05 그대로 거부한다. 던지면 승인 전체가 롤백된다(경고 로그 뒤 다시 던짐 — 이름 · 금액 없음).
async function onSettlementFinalApprovalInTx(viewer: Viewer, documentId: string, tx: Parameters<typeof findFinalStepActorInTx>[2], prepared: unknown): Promise<void> {
  const before = asPreparedFinal(prepared);
  try {
    const found = await findFinalStepActorInTx(viewer, { documentId, documentKind: SETTLEMENT_DOCUMENT_KIND }, tx);
    if (!found || found.projectId !== before.projectId) throw new GateBlockedError("지금 담당이 아님 · 새로 고침");
    const locked = await lockProjectForWrite(viewer, found.projectId, tx);
    if (locked?.status === SETTLING) {
      // 프로젝트 행을 잡은 뒤 센다 — 그 사이 지출결의 제출은 이 잠금을 기다렸다가 완료 프로젝트(②)로 막힌다.
      const inReview = (await countInReviewByProjects(viewer, [found.projectId], tx)).get(found.projectId) ?? 0;
      if (inReview > 0) throw new GateBlockedError(expensesInReview(inReview));
      let blockedCount: number;
      try {
        blockedCount = (await computePreSettleCheck(viewer, found.projectId, before.preSettle.inputs, tx)).blockedCount;
      } catch (error) {
        throw preSettleUnknown(error, found.projectId);
      }
      const decision = await gate(null, "project.pre-settle-check", { blockedCount });
      if (!decision.allowed) throw new GateBlockedError(preSettleApproveReason(blockedCount, before.preSettle.pmName));
    }
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

// 표시 전용(트랜잭션 없음) — 엔진은 viewer가 지금 담당인 문서만 넘긴다. 프로젝트가 정산이 아니면(D-80 진행 복귀) · 결재 중 지출결의가
// 남았으면(A8) · 완료 전 점검이 막히면(06-22 O-16) `승인`을 막아 보인다 — 순서는 서버와 같다(R-2). 점검은 앞 두 갈래에 걸리지 않은
// 프로젝트마다 한 번, 사전 조회(프로젝트 무관)는 호출당 한 번(E-30). 계산하지 못하면 `점검 결과 없음 · 다시 시도`(fail-closed).
async function settlementApproveBlockedReason(viewer: Viewer, ids: string[]): Promise<Map<string, string>> {
  const rows = await listSettlementSummaries(viewer, { ids, documentKind: SETTLEMENT_DOCUMENT_KIND });
  const inReview = await countInReviewByProjects(viewer, [...new Set(rows.map((row) => row.projectId))]);
  const reasons = new Map<string, string>();
  const toCheck: SettlementSummaryRow[] = [];
  for (const row of rows) {
    const count = inReview.get(row.projectId) ?? 0;
    if (row.projectStatus !== SETTLING) reasons.set(row.id, BACK_TO_PROGRESS);
    else if (count > 0) reasons.set(row.id, expensesInReview(count));
    else toCheck.push(row);
  }
  const projectIds = [...new Set(toCheck.map((row) => row.projectId))];
  if (projectIds.length === 0) return reasons;
  const blockedByProject = new Map<string, number | null>();
  let namesVisible = false;
  try {
    const inputs = await loadPreSettleInputs(viewer);
    namesVisible = await visible(viewer, "project.value");
    for (const projectId of projectIds) {
      try {
        blockedByProject.set(projectId, (await computePreSettleCheck(viewer, projectId, inputs)).blockedCount);
      } catch (error) {
        log.warn("settlement.pre_settle_display_failed", { projectId, reason: error instanceof Error ? error.constructor.name : "unknown" });
        blockedByProject.set(projectId, null);
      }
    }
  } catch (error) {
    log.warn("settlement.pre_settle_display_failed", { projectId: null, reason: error instanceof Error ? error.constructor.name : "unknown" });
  }
  for (const row of toCheck) {
    const blockedCount = blockedByProject.get(row.projectId) ?? null;
    if (blockedCount === null) reasons.set(row.id, PRE_SETTLE_UNKNOWN);
    else if (blockedCount > 0) reasons.set(row.id, preSettleApproveReason(blockedCount, namesVisible ? row.pmName : null));
  }
  return reasons;
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
