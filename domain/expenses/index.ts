import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { seoulToday } from "@/lib/dates";
import { formatForeignAmount, formatFxRate, formatKrw } from "@/lib/format-number";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { project } from "@/domain/permissions/project";
import { coversProjectTeam, loadActorTeamScope } from "@/domain/projects/status";
import { getSettingValue, getSimpleSettingValues } from "@/domain/settings/registry";
import {
  APPROVAL_ROUTE_EXPENSE_SELF_APPROVAL,
  APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED,
  APPROVAL_ROUTE_EXPENSE_STEP1_ROLE_ID,
  APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE,
  APPROVAL_ROUTE_EXPENSE_STEP1_ORG_UNIT_ID,
  APPROVAL_ROUTE_EXPENSE_STEP2_ENABLED,
  APPROVAL_ROUTE_EXPENSE_STEP2_ROLE_ID,
  APPROVAL_ROUTE_EXPENSE_STEP2_SCOPE,
  APPROVAL_ROUTE_EXPENSE_STEP2_ORG_UNIT_ID,
  APPROVAL_ROUTE_EXPENSE_STEP3_ENABLED,
  APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_EXPENSE_STEP3_SCOPE,
  APPROVAL_ROUTE_EXPENSE_STEP3_ORG_UNIT_ID,
  APPROVAL_ROUTE_EXPENSE_STEP4_ENABLED,
  APPROVAL_ROUTE_EXPENSE_STEP4_ROLE_ID,
  APPROVAL_ROUTE_EXPENSE_STEP4_SCOPE,
  APPROVAL_ROUTE_EXPENSE_STEP4_ORG_UNIT_ID,
  PROJECT_CUSTOMER_APPROVAL_GATE,
} from "@/domain/settings/keys";
import {
  canSeeApprovalDocument,
  prepareSubmission,
  registerDocumentKind,
  submitDocument,
  type RouteConfig,
  type RouteSettingDefs,
} from "@/domain/approvals";
import type { DescribeDeps, DocumentSummary, RouteConfigStep } from "@/domain/approvals/kinds";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { moneyFromRow, moneyToColumns, remainingForInstallments, type Money } from "@/domain/money";
import { CURRENCIES, recentFxRate } from "@/domain/money/currency";
import { allocateDocumentNumber, allocateExpenseNumber, loadDocumentNumberFormat, loadExpenseNumberFormat } from "@/domain/document-numbering";
import { teamAtDate } from "@/domain/org";
import { formatKstTime } from "@/domain/holidays/business-day";
import { computeExpenseTax, storedTaxResult, taxDriftText, taxLineText, type ExpenseTaxResult } from "@/domain/expenses/tax";
import { buildExpenseDetailRows } from "@/domain/expenses/detail";
import { expenseLineDoor, type ExpenseLineDoor } from "@/domain/expenses/line-door";
import { resolveLinkedDocumentsByLineage, type LineageLine } from "@/domain/quotes/lineage";
import { buildExpenseSubmitContext, nextActionTarget, PROJECT_COMPLETED, TAX_UNAVAILABLE, type ExpenseSubmitFacts, type ExpenseSubmitTarget } from "@/domain/expenses/gate";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  EXPENSE_DETAIL_DTO_SPEC,
  EXPENSE_DOCUMENT_DTO_SPEC,
  EXPENSE_NEW_DEFAULTS_DTO_SPEC,
  EXPENSE_PREVIEW_DTO_SPEC,
  type ExpenseDetailDto,
  type ExpenseDocumentDto,
  type ExpenseNewDefaultsDto,
  type ExpensePreviewDto,
} from "@/domain/expenses/dto";
import { listCodeItems } from "@/repositories/code-tables";
import { countActiveByOwner } from "@/repositories/files";
import { findProjectById, lockProjectForWrite, type ProjectRow } from "@/repositories/projects";
import { findLatestQuoteRevision, findQuoteRevisionById, summarizeRevisions } from "@/repositories/quote-revisions";
import { findQuoteLineById, listQuoteLinesByRevision, type QuoteLineRow } from "@/repositories/quote-lines";
import { findUserById } from "@/repositories/users";
import { findVendorById } from "@/repositories/vendors";
import {
  findDraftByLineAndDrafter,
  findExpenseApprovalStatus,
  findExpenseById,
  findExpenseByIdempotencyKey,
  insertDraftIfAbsent,
  insertTeamDraftIfAbsent,
  listDraftsByLines,
  listExpenseSummaries,
  listNumberedByLine,
  listNumberedByLines,
  lockExpenseForUpdate,
  saveSubmissionSnapshot,
  setExpenseNumber,
  updateDraftIfVersion,
  type ExpenseDraftFields,
  type ExpenseRow,
  type ExpenseSummaryRow,
  type NumberedLineExpense,
} from "@/repositories/expenses";

export type { ExpenseDocumentDto, ExpenseDraftDto, ExpenseNewDefaultsDto, ExpensePreviewDto } from "@/domain/expenses/dto";

// 05-03(EXP-01 · EXP-14): 지출결의 — 결재 모듈에 문서 종류로 등록되고 제출은 같은 결재 엔진(domain/approvals)을 지난다.
// 결재 모듈은 이 파일을 import하지 않는다(app/(app)/document-kinds.ts가 적재를 일으킨다).

// 종류 키 — 04.1 연차 "leave"와 같은 영어 소문자 단수 관례, 설정 키 approval_route.expense.*와 같은 낱말.
export const EXPENSE_DOCUMENT_KIND = "expense";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_IN_CURRENT_REVISION = "견적 줄이 현재 차수에 없음 · 견적 줄 바꾸기";
const NO_VENDOR = "거래처 없음 · 거래처 고르기";
const ACTIVE_STATUSES = new Set(["submitted", "in_review", "approved"]);
const NO_TEAM_AT_USAGE_DATE = "사용일에 소속 팀 없음 · 사용일 고치기";

// 05-07 팀 비용 종류(DB 체크 expenses_team_expense_kind_check와 같은 값) — 화면 글자.
export const TEAM_EXPENSE_KINDS = ["lost_bid", "team_overhead"] as const;
export type TeamExpenseKind = (typeof TEAM_EXPENSE_KINDS)[number];
export const TEAM_EXPENSE_KIND_LABELS: Record<TeamExpenseKind, string> = { lost_bid: "미수주 비용", team_overhead: "팀 관리비" };

function teamKindLabel(kind: string | null): string | null {
  return kind && kind in TEAM_EXPENSE_KIND_LABELS ? TEAM_EXPENSE_KIND_LABELS[kind as TeamExpenseKind] : null;
}

// 프로젝트 · 견적 줄 없이 팀 이름으로 올리는 문서(EXP-08).
function isTeamCostRow(row: Pick<ExpenseRow, "projectId" | "quoteLineId">): boolean {
  return row.projectId === null && row.quoteLineId === null;
}

export class ExpenseNotFoundError extends UserFacingError {
  constructor() {
    super("없는 지출결의 · 새로 고침");
  }
}

// 칸 오류 — 회차 상한 초과(게이트가 아니라 공급가액 칸 아래 한 줄).
export class ExpenseFieldError extends UserFacingError {
  constructor(
    readonly field: "supplyAmount" | "usageDate",
    message: string,
  ) {
    super(message);
  }
}

// 버전 충돌 — 시각은 행의 updated_at 서울 HH:MM.
export class ExpenseConflictError extends UserFacingError {
  constructor(savedAt: Date) {
    super(`${formatKstTime(savedAt)}에 다른 곳에서 저장됨 · 새로 고침`);
  }
}

// ── 결재선 설정 17키 · 종류 등록 ─────────────────────────────────────────

export const EXPENSE_ROUTE_SETTINGS: RouteSettingDefs = {
  selfApproval: APPROVAL_ROUTE_EXPENSE_SELF_APPROVAL,
  steps: [
    {
      enabled: APPROVAL_ROUTE_EXPENSE_STEP1_ENABLED,
      roleId: APPROVAL_ROUTE_EXPENSE_STEP1_ROLE_ID,
      scope: APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE,
      orgUnitId: APPROVAL_ROUTE_EXPENSE_STEP1_ORG_UNIT_ID,
    },
    {
      enabled: APPROVAL_ROUTE_EXPENSE_STEP2_ENABLED,
      roleId: APPROVAL_ROUTE_EXPENSE_STEP2_ROLE_ID,
      scope: APPROVAL_ROUTE_EXPENSE_STEP2_SCOPE,
      orgUnitId: APPROVAL_ROUTE_EXPENSE_STEP2_ORG_UNIT_ID,
    },
    {
      enabled: APPROVAL_ROUTE_EXPENSE_STEP3_ENABLED,
      roleId: APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID,
      scope: APPROVAL_ROUTE_EXPENSE_STEP3_SCOPE,
      orgUnitId: APPROVAL_ROUTE_EXPENSE_STEP3_ORG_UNIT_ID,
    },
    {
      enabled: APPROVAL_ROUTE_EXPENSE_STEP4_ENABLED,
      roleId: APPROVAL_ROUTE_EXPENSE_STEP4_ROLE_ID,
      scope: APPROVAL_ROUTE_EXPENSE_STEP4_SCOPE,
      orgUnitId: APPROVAL_ROUTE_EXPENSE_STEP4_ORG_UNIT_ID,
    },
  ],
};

const EXPENSE_ROUTE_DEFS = [
  APPROVAL_ROUTE_EXPENSE_SELF_APPROVAL,
  ...EXPENSE_ROUTE_SETTINGS.steps.flatMap((step) => [step.enabled, step.roleId, step.scope, step.orgUnitId]),
];

function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) throw new Error(`결재선 설정 '${key}' 값 없음`);
  return value;
}

// 17키를 getSimpleSettingValues 한 번(SELECT 한 문장)으로 — 연차 로더와 같은 규칙(기본값 없는 org_unit_id 행이 없으면 "").
export async function loadExpenseRouteConfig(deps?: Parameters<typeof getSimpleSettingValues>[1]): Promise<RouteConfig> {
  const values = await getSimpleSettingValues(EXPENSE_ROUTE_DEFS, deps);
  const byKey = new Map(EXPENSE_ROUTE_DEFS.map((def, i) => [def.key, values[i]]));
  const read = <T>(def: { key: string }): T | undefined => byKey.get(def.key) as T | undefined;
  const steps: RouteConfigStep[] = EXPENSE_ROUTE_SETTINGS.steps.map((step) => ({
    enabled: required(read<boolean>(step.enabled), step.enabled.key),
    roleId: required(read<string>(step.roleId), step.roleId.key),
    scope: required(read<RouteConfigStep["scope"]>(step.scope), step.scope.key),
    orgUnitId: read<string>(step.orgUnitId) ?? "",
  }));
  const selfApproval = required(read<RouteConfig["selfApproval"]>(APPROVAL_ROUTE_EXPENSE_SELF_APPROVAL), APPROVAL_ROUTE_EXPENSE_SELF_APPROVAL.key);
  return { selfApproval, steps };
}

// 인스턴스 없음 → 작성 중, 있으면 04.1 낱말.
const STATUS_WORDS: Record<string, string> = {
  submitted: "결재 중",
  in_review: "결재 중",
  approved: "승인",
  rejected: "반려",
  withdrawn: "회수",
};

function statusWordFor(status: string | null): string {
  return status ? (STATUS_WORDS[status] ?? status) : "작성 중";
}

function supplyMoney(row: Pick<ExpenseRow, "supplyCurrency" | "supplyForeignAmount" | "supplyFxRate" | "supplyAmountKrw">): Money | null {
  if (row.supplyAmountKrw === null) return null;
  return moneyFromRow({ currency: row.supplyCurrency, foreignAmount: row.supplyForeignAmount, fxRate: row.supplyFxRate, amountKrw: row.supplyAmountKrw });
}

type SourceExtras = Partial<
  Pick<ExpenseDocumentDto, "evidenceTypeName" | "paymentMethodName" | "taxLine" | "taxDrift" | "defaultEvidenceName" | "executionLines" | "installmentMode" | "installmentText">
>;

function toSource(row: ExpenseSummaryRow, extras: SourceExtras = {}): ExpenseDocumentDto {
  return {
    id: row.id,
    projectId: row.projectId,
    quoteLineId: row.quoteLineId,
    vendorId: row.vendorId,
    evidenceType: row.evidenceType,
    paymentMethod: row.paymentMethod,
    scheduledPaymentDate: row.scheduledPaymentDate,
    note: row.note,
    installment: row.installment,
    version: row.version,
    supply: supplyMoney(row),
    number: row.number,
    drafterName: row.drafterName,
    projectName: row.projectName,
    projectNumber: row.projectNumber,
    lineNo: row.lineNo,
    itemName: row.itemName,
    vendorName: row.vendorName,
    evidenceTypeName: extras.evidenceTypeName ?? null,
    paymentMethodName: extras.paymentMethodName ?? null,
    installmentSeq: row.installmentSeq,
    teamExpenseKind: row.teamExpenseKind,
    teamExpenseKindLabel: teamKindLabel(row.teamExpenseKind),
    usageDate: row.usageDate,
    content: row.content,
    teamName: isTeamCostRow(row) ? row.teamName : null,
    statusWord: statusWordFor(row.status),
    instanceId: row.instanceId,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    taxRuleKind: row.taxRuleKind,
    taxRate: row.taxRate,
    vatKrw: row.vatKrw,
    withholdingKrw: row.withholdingKrw,
    companyBorneKrw: row.companyBorneKrw,
    payableKrw: row.payableKrw,
    taxLine: extras.taxLine ?? null,
    taxDrift: extras.taxDrift ?? null,
    defaultEvidenceName: extras.defaultEvidenceName ?? null,
    executionLines: extras.executionLines ?? [],
    installmentMode: extras.installmentMode ?? "none",
    installmentText: extras.installmentText ?? null,
  };
}

// 결재함 요약 — 투영 뒤 값으로만(보이지 않으면 싣지 않는다). 문서 칸 = `{프로젝트명} · {항목}`, 측정값 = 공급가액.
async function describeExpenseDocuments(viewer: Viewer, ids: string[], deps?: DescribeDeps): Promise<Map<string, DocumentSummary>> {
  const rows = await listExpenseSummaries(viewer, { ids, documentKind: EXPENSE_DOCUMENT_KIND });
  const result = new Map<string, DocumentSummary>();
  for (const row of rows) {
    const projected = await project(viewer, toSource(row), EXPENSE_DOCUMENT_DTO_SPEC, deps?.visible ? { visible: deps.visible } : undefined);
    const summary: DocumentSummary = { ...projected };
    if (projected.projectName && projected.itemName) summary.documentText = `${projected.projectName} · ${projected.itemName}`;
    else if (projected.teamName) summary.documentText = ["지출결의", projected.teamName, projected.content].filter(Boolean).join(" · ");
    if (projected.supply) {
      const { currency, amount, fxRate, amountKrw } = projected.supply;
      summary.measure = { kind: "money", money: { currency, amount, fxRate, amountKrw } };
    }
    result.set(row.id, summary);
  }
  return result;
}

// 코드표 값 → 이름(보관 · 비활성도 — 이미 저장된 값을 이름으로 보인다).
export async function codeLabelsOf(viewer: Viewer, tableKey: string): Promise<Map<string, string>> {
  const items = await listCodeItems(viewer, { tableKey, scope: { rows: "all", includeArchived: true }, includeInactive: true });
  return new Map(items.map((item) => [item.value, item.label]));
}

// 05-05 C1(ENG-17): 결재 시트 상세 — 구조 필드만(엔진이 detailDto로 투영한 뒤 buildDetailRows가 문자열 행을 만든다). 엔진은 `내 결재`
// (이미 보임 판정을 지난) 문서 id만 한 번에 넘기므로 문서마다 다시 판정하지 않는다. 제출된 문서라 계산 한 줄은 저장 스냅숏이다.
async function loadExpenseDetails(viewer: Viewer, ids: string[]): Promise<Map<string, ExpenseDetailDto>> {
  const rows = await listExpenseSummaries(viewer, { ids, documentKind: EXPENSE_DOCUMENT_KIND });
  const [evidenceNames, paymentNames] = await Promise.all([codeLabelsOf(viewer, "evidence_type"), codeLabelsOf(viewer, "payment_method")]);
  const result = new Map<string, ExpenseDetailDto>();
  for (const row of rows) {
    const supply = supplyMoney(row);
    const stored = storedTaxResult(row);
    const evidenceTypeName = row.evidenceType ? (evidenceNames.get(row.evidenceType) ?? row.evidenceType) : null;
    result.set(row.id, {
      number: row.number,
      projectNumber: row.projectNumber,
      projectName: row.projectName,
      teamName: isTeamCostRow(row) ? row.teamName : null,
      teamExpenseKindLabel: teamKindLabel(row.teamExpenseKind),
      usageDate: row.usageDate,
      content: row.content,
      lineNo: row.lineNo,
      itemName: row.itemName,
      installment: row.installment,
      installmentSeq: row.installmentSeq,
      vendorName: row.vendorName,
      evidenceTypeName,
      supply,
      taxLine: supply && stored ? taxLineText(stored, supply, `${evidenceTypeName ?? ""} 규칙`).text : null,
      scheduledPaymentDate: row.scheduledPaymentDate,
      paymentMethodName: row.paymentMethod ? (paymentNames.get(row.paymentMethod) ?? row.paymentMethod) : null,
      note: row.note,
      drafterName: row.drafterName,
      createdAt: row.createdAt,
    });
  }
  return result;
}

registerDocumentKind({
  kind: EXPENSE_DOCUMENT_KIND,
  label: "지출결의",
  loadRouteConfig: () => loadExpenseRouteConfig(),
  href: (documentId) => `/expenses/${documentId}`,
  describeDocuments: describeExpenseDocuments,
  routeSettings: EXPENSE_ROUTE_SETTINGS,
  canResubmit: (viewer) => can(viewer, "expenses", "write"),
  resubmitFrom: ["rejected", "withdrawn"],
  loadDetails: loadExpenseDetails,
  detailDto: EXPENSE_DETAIL_DTO_SPEC,
  buildDetailRows: buildExpenseDetailRows,
});

// ── 보임 ──────────────────────────────────────────────────────────────

// 작성 중(번호 없음)은 기안자만, 번호가 있으면 기안자 ∪ 결재 관련자. 목록 범위(팀장 · 전사)는 05-08이 더한다.
export async function canSeeExpense(
  viewer: Viewer,
  expense: { id: string; drafterId: string; number: string | null },
  deps?: { today?: string },
): Promise<boolean> {
  if (expense.drafterId === viewer.id) return true;
  if (expense.number === null) return false;
  return canSeeApprovalDocument(viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expense.id }, { today: deps?.today ?? seoulToday() });
}

// ── 견적 줄 → 작성 중 ─────────────────────────────────────────────────

function lineExecution(line: QuoteLineRow): Money {
  return moneyFromRow({
    currency: line.executionCurrency,
    foreignAmount: line.executionForeignAmount,
    fxRate: line.executionFxRate,
    amountKrw: line.executionAmountKrw,
  });
}

function doorFor(line: QuoteLineRow, numbered: readonly NumberedLineExpense[], selfId?: string): ExpenseLineDoor {
  return expenseLineDoor({
    line: { lineKind: line.lineKind, cancelled: line.lineStatus === "cancelled", vendorId: line.vendorId, execution: lineExecution(line) },
    numbered: numbered.map((doc) => ({
      id: doc.id,
      number: doc.number ?? "",
      installment: doc.installment,
      supply: supplyMoney(doc) ?? moneyFromRow({ currency: doc.supplyCurrency, foreignAmount: null, fxRate: doc.supplyFxRate, amountKrw: 0 }),
    })),
    ...(selfId ? { selfId } : {}),
  });
}

// D-66 — 현재 차수 줄마다 계보(copied_from_line_id) 사슬 전체의 번호 있는 문서(제출 순). 줄 파생 상태
// (domain/quotes/lines.ts linkedDocumentsByLine)와 같은 해석이라 이전 차수에 제출한 줄은 지금 차수에서도 문이 닫힌다.
async function listNumberedByLineage(viewer: Viewer, projectId: string): Promise<Map<string, NumberedLineExpense[]>> {
  const lineage: LineageLine[] = [];
  for (const summary of await summarizeRevisions(viewer, projectId)) {
    for (const line of await listQuoteLinesByRevision(viewer, summary.id)) {
      lineage.push({ id: line.id, revisionSeq: summary.seq, copiedFromLineId: line.copiedFromLineId });
    }
  }
  const docsByLineId = new Map<string, NumberedLineExpense[]>();
  for (const doc of await listNumberedByLines(viewer, lineage.map((line) => line.id))) {
    docsByLineId.set(doc.quoteLineId, [...(docsByLineId.get(doc.quoteLineId) ?? []), doc]);
  }
  const { byCurrentLine } = resolveLinkedDocumentsByLineage(lineage, docsByLineId);
  for (const docs of byCurrentLine.values()) {
    docs.sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
  }
  return byCurrentLine;
}

type ProjectFacts = { project: ProjectRow; latestRevisionId: string | null; tableGateReason: string | null };

// 표 전체 게이트 — 완료면 새 문서 없음, 그 밖은 고객 승인 게이트(설정)의 문자열 그대로.
async function loadProjectFacts(viewer: Viewer, projectId: string, gateEnabled: boolean): Promise<ProjectFacts | null> {
  const projectRow = await findProjectById(viewer, projectId);
  if (!projectRow) return null;
  const latest = await findLatestQuoteRevision(viewer, projectId);
  if (projectRow.status === "completed") return { project: projectRow, latestRevisionId: latest?.id ?? null, tableGateReason: PROJECT_COMPLETED };
  if (!latest) return { project: projectRow, latestRevisionId: null, tableGateReason: null };
  const pm = await findUserById(viewer, projectRow.pmUserId);
  const decision = await gate(projectRow, "quote.customer-approval", {
    status: projectRow.status,
    revisionSeq: latest.seq,
    revisionApproved: latest.customerApprovedAt !== null,
    gateEnabled,
    actorIsAssignedPm: projectRow.pmUserId === viewer.id,
    pmName: pm?.name ?? "",
  });
  return { project: projectRow, latestRevisionId: latest.id, tableGateReason: decision.allowed ? null : decision.reason };
}

async function firstPaymentMethod(viewer: Viewer): Promise<string | null> {
  const items = await listCodeItems(viewer, { tableKey: "payment_method", scope: { rows: "all", includeArchived: false }, includeInactive: false });
  return items[0]?.value ?? null;
}

export async function createExpenseFromLines(
  viewer: Viewer,
  input: { lineIds: string[] },
): Promise<{ created: { lineId: string; expenseId: string }[]; blocked: { lineId: string; reason: string }[] }> {
  const [canWriteExpense, canWriteProject] = await Promise.all([can(viewer, "expenses", "write"), can(viewer, "projects", "write")]);
  if (!canWriteExpense || !canWriteProject) throw new ForbiddenError("지출결의 작성 권한 없음");

  const [gateEnabled, teamScope] = await Promise.all([
    getSettingValue(PROJECT_CUSTOMER_APPROVAL_GATE),
    loadActorTeamScope(viewer, { todayKst: seoulToday() }),
  ]);
  const factsByProject = new Map<string, ProjectFacts | null>();
  let paymentMethod: string | null | undefined;
  const created: { lineId: string; expenseId: string }[] = [];
  const blocked: { lineId: string; reason: string }[] = [];

  // 줄 → 프로젝트를 먼저 다 읽고 그 프로젝트의 쓰기 권리(담당 PM 또는 업무 범위가 프로젝트 팀을 덮음 — Phase 4
  // 판정)를 판정한다. 하나라도 없으면 아무 행도 만들기 전에 거부한다(T-05-1401).
  const resolved: { lineId: string; line: QuoteLineRow; facts: ProjectFacts }[] = [];
  for (const lineId of [...new Set(input.lineIds)]) {
    const line = UUID_SHAPE.test(lineId) ? await findQuoteLineById(viewer, lineId) : null;
    const revision = line ? await findQuoteRevisionById(viewer, line.revisionId) : null;
    if (!line || !revision) {
      blocked.push({ lineId, reason: NOT_IN_CURRENT_REVISION });
      continue;
    }
    if (!factsByProject.has(revision.projectId)) factsByProject.set(revision.projectId, await loadProjectFacts(viewer, revision.projectId, gateEnabled));
    const facts = factsByProject.get(revision.projectId);
    if (!facts) {
      blocked.push({ lineId, reason: NOT_IN_CURRENT_REVISION });
      continue;
    }
    if (facts.project.pmUserId !== viewer.id && !coversProjectTeam(teamScope, facts.project.teamId)) {
      throw new ForbiddenError("지출결의 작성 권한 없음");
    }
    resolved.push({ lineId, line, facts });
  }

  const lineageByProject = new Map<string, Map<string, NumberedLineExpense[]>>();
  for (const { lineId, line, facts } of resolved) {
    if (facts.tableGateReason) {
      blocked.push({ lineId, reason: facts.tableGateReason });
      continue;
    }
    if (line.revisionId !== facts.latestRevisionId || line.archivedAt !== null) {
      blocked.push({ lineId, reason: NOT_IN_CURRENT_REVISION });
      continue;
    }

    const existing = await findDraftByLineAndDrafter(viewer, { quoteLineId: line.id, drafterId: viewer.id });
    if (existing) {
      created.push({ lineId, expenseId: existing.id });
      continue;
    }
    if (!lineageByProject.has(facts.project.id)) lineageByProject.set(facts.project.id, await listNumberedByLineage(viewer, facts.project.id));
    const door = doorFor(line, lineageByProject.get(facts.project.id)?.get(line.id) ?? []);
    if (door.state === "none") {
      blocked.push({ lineId, reason: NOT_IN_CURRENT_REVISION });
      continue;
    }
    if (door.state === "no_vendor" || !line.vendorId) {
      blocked.push({ lineId, reason: NO_VENDOR });
      continue;
    }
    if (door.state === "closed" || !door.remaining) {
      blocked.push({ lineId, reason: `이 줄에 지출결의 ${door.latest?.number ?? ""} 있음 · 지출결의 열기` });
      continue;
    }

    const vendor = await findVendorById(viewer, line.vendorId);
    if (paymentMethod === undefined) paymentMethod = await firstPaymentMethod(viewer);
    const supply = moneyToColumns({
      currency: door.remaining.currency,
      amount: door.remaining.amount,
      fxRate: await recentFxRate(door.remaining.currency),
    });
    const inserted = await insertDraftIfAbsent(viewer, {
      drafterId: viewer.id,
      projectId: facts.project.id,
      quoteLineId: line.id,
      vendorId: line.vendorId,
      evidenceType: vendor?.defaultEvidenceType ?? null,
      paymentMethod,
      supplyCurrency: supply.currency,
      supplyForeignAmount: supply.foreignAmount,
      supplyFxRate: supply.fxRate,
      supplyAmountKrw: supply.amountKrw,
      installment: door.forcedInstallment,
      updatedBy: viewer.id,
    });
    const expenseId = inserted?.id ?? (await findDraftByLineAndDrafter(viewer, { quoteLineId: line.id, drafterId: viewer.id }))?.id;
    if (!expenseId) throw new ExpenseNotFoundError();
    created.push({ lineId, expenseId });
  }
  return { created, blocked };
}

// ── 임시 저장 ─────────────────────────────────────────────────────────

const draftFieldsSchema = z
  .object({
    vendorId: z.string().uuid().nullable(),
    evidenceType: z.string().min(1).max(100).nullable(),
    paymentMethod: z.string().min(1).max(100).nullable(),
    supply: z.object({ currency: z.enum(CURRENCIES), amount: z.number().min(0), fxRate: z.number() }).strict().nullable(),
    scheduledPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    note: z.string().max(1000).nullable(),
    installment: z.boolean(),
    teamExpenseKind: z.enum(TEAM_EXPENSE_KINDS).nullable(),
    usageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    content: z.string().max(480).nullable(),
  })
  .strict()
  .partial();

export type ExpenseDraftInput = z.input<typeof draftFieldsSchema>;

function toDraftColumns(fields: z.output<typeof draftFieldsSchema>): ExpenseDraftFields {
  const { supply, content, ...others } = fields;
  // 공백뿐인 내용은 비운 것과 같다.
  const rest = content === undefined ? others : { ...others, content: content?.trim() ? content.trim() : null };
  if (supply === undefined) return rest;
  if (supply === null) return { ...rest, supplyCurrency: "KRW", supplyForeignAmount: null, supplyFxRate: "1.0000", supplyAmountKrw: null };
  // moneyToColumns가 normalizeMoneyInput으로 통화 · 정밀도 · 범위를 판정한다.
  const columns = moneyToColumns(supply);
  return {
    ...rest,
    supplyCurrency: columns.currency,
    supplyForeignAmount: columns.foreignAmount,
    supplyFxRate: columns.fxRate,
    supplyAmountKrw: columns.amountKrw,
  };
}

// 기안자 · 작성 중만(아니면 없는 문서). 원화는 서버가 계산한다. version 조건 저장 — 0행이면 충돌.
export async function saveExpenseDraft(
  viewer: Viewer,
  input: { expenseId: string; expectedVersion: number; fields: ExpenseDraftInput },
): Promise<{ version: number }> {
  const row = UUID_SHAPE.test(input.expenseId) ? await findExpenseById(viewer, input.expenseId) : null;
  if (!row || row.drafterId !== viewer.id || row.number !== null) throw new ExpenseNotFoundError();
  const parsed = draftFieldsSchema.parse(input.fields);
  const fields = toDraftColumns(parsed);
  // 팀 비용 칸은 팀 비용 문서만 받는다(DB 체크 expenses_line_or_team_check도 같은 편). 귀속 팀은 사용일 소속으로 저장 때 다시 정해진다 —
  // 팀 id를 호출자가 보낼 수 없다(T-05-703). 트랜잭션 · 잠금 밖의 읽기다.
  if (!isTeamCostRow(row)) {
    if (parsed.teamExpenseKind !== undefined || parsed.usageDate !== undefined || parsed.content !== undefined) throw new ExpenseNotFoundError();
  } else if (parsed.usageDate !== undefined) {
    fields.attributedTeamId = await attributedTeamFor(viewer, parsed.usageDate);
  }
  const saved = await updateDraftIfVersion(viewer, { id: row.id, expectedVersion: input.expectedVersion, fields, updatedBy: viewer.id });
  if (!saved) {
    const latest = await findExpenseById(viewer, row.id);
    throw new ExpenseConflictError(latest?.updatedAt ?? row.updatedAt);
  }
  return { version: saved.version };
}

// ── 팀 비용 첫 저장(05-07 · EXP-08) ───────────────────────────────────────

// 사용일 소속 팀 — 기안자 본인의 그날 소속. 없으면 사용일 칸 오류(임의의 기본 팀으로 떨어지지 않는다).
async function attributedTeamFor(viewer: Viewer, usageDate: string): Promise<string> {
  const team = await teamAtDate(viewer, viewer.id, usageDate);
  if (!team?.id) throw new ExpenseFieldError("usageDate", NO_TEAM_AT_USAGE_DATE);
  return team.id;
}

// `/expenses/new`의 첫 저장 — 폼이 열릴 때 만든 idempotency key로 두 번 눌러도 문서 하나(UNIQUE + ON CONFLICT DO NOTHING 뒤 재조회).
// 프로젝트 · 견적 줄 없이 사용일 소속 팀에 귀속된다(사용일이 없으면 서울 오늘). 팀 id는 입력에 없다.
export async function createTeamExpenseDraft(
  viewer: Viewer,
  input: { idempotencyKey: string; fields: ExpenseDraftInput },
  deps?: { now?: Date },
): Promise<{ expenseId: string; version: number }> {
  if (!(await can(viewer, "expenses", "write"))) throw new ForbiddenError("지출결의 작성 권한 없음");
  const key = z.string().uuid().parse(input.idempotencyKey);
  const reuse = (row: ExpenseRow | null): { expenseId: string; version: number } | null => {
    if (!row) return null;
    // 다른 사람의 key · 이미 제출된 문서는 없는 문서다.
    if (row.drafterId !== viewer.id || row.number !== null || !isTeamCostRow(row)) throw new ExpenseNotFoundError();
    return { expenseId: row.id, version: row.version };
  };
  const existing = reuse(await findExpenseByIdempotencyKey(viewer, key));
  if (existing) return existing;

  const parsed = draftFieldsSchema.parse(input.fields);
  const usageDate = parsed.usageDate ?? seoulToday(deps?.now);
  const attributedTeamId = await attributedTeamFor(viewer, usageDate);
  const inserted = await insertTeamDraftIfAbsent(viewer, {
    ...toDraftColumns(parsed),
    drafterId: viewer.id,
    idempotencyKey: key,
    usageDate,
    attributedTeamId,
    updatedBy: viewer.id,
  });
  const row = inserted ?? (await findExpenseByIdempotencyKey(viewer, key));
  const created = reuse(row);
  if (!created) throw new ExpenseNotFoundError();
  return created;
}

// 05-07 거래처 바꾸기 · 고르기(팀 비용 문서) — 기안자 · 작성 중만. 증빙 종류는 그 거래처 기본값(없으면 그대로). 견적 줄 문서의 거래처는
// 줄이 정한다(제출 판정 ⑤가 줄의 거래처를 본다) — 줄을 바꾸는 것이 그 길이다.
export async function changeExpenseVendor(
  viewer: Viewer,
  input: { expenseId: string; vendorId: string; expectedVersion: number },
): Promise<{ version: number; evidenceType: string | null }> {
  if (!(await can(viewer, "expenses", "write"))) throw new ForbiddenError("지출결의 작성 권한 없음");
  const row = UUID_SHAPE.test(input.expenseId) ? await findExpenseById(viewer, input.expenseId) : null;
  if (!row || row.drafterId !== viewer.id || row.number !== null || !isTeamCostRow(row)) throw new ExpenseNotFoundError();
  const vendor = UUID_SHAPE.test(input.vendorId) ? await findVendorById(viewer, input.vendorId) : null;
  if (!vendor || vendor.hidden || vendor.archivedAt !== null) throw new ExpenseNotFoundError();
  const fields: ExpenseDraftFields = { vendorId: vendor.id, ...(vendor.defaultEvidenceType ? { evidenceType: vendor.defaultEvidenceType } : {}) };
  const saved = await updateDraftIfVersion(viewer, { id: row.id, expectedVersion: input.expectedVersion, fields, updatedBy: viewer.id });
  if (!saved) {
    const latest = await findExpenseById(viewer, row.id);
    throw new ExpenseConflictError(latest?.updatedAt ?? row.updatedAt);
  }
  return { version: saved.version, evidenceType: saved.evidenceType };
}

// ── 제출 ──────────────────────────────────────────────────────────────

export type SubmitExpenseResult =
  | { kind: "submitted"; expenseId: string; number: string; instanceId: string; version: number }
  | { kind: "already_submitted"; expenseId: string; number: string };

function remainingText(remaining: Money, basis: "foreign" | "krw"): string {
  return basis === "foreign" ? `${remaining.currency} ${formatForeignAmount(remaining.amount)}` : formatKrw(remaining.amountKrw);
}

// 트랜잭션 전: 기안자 문서 읽기 · 세금 계산 · 결재선 스냅숏(prepareSubmission) · 번호 서식. 트랜잭션 안(tx 호출만):
// 프로젝트 행 잠금 → 문서 행 잠금 → 이미 제출됨 판정 → version → 다시 판정(증빙 수는 tx로 — 증빙 추가 · 삭제도 같은
// 지출결의 행을 잠근다) → 스냅숏 → 결재 인스턴스 · 로그 → 마지막
// 쓰기로 번호(카운터 행 잠금을 가장 짧게).
// deps.afterLock — 테스트가 두 잠금(프로젝트 → 지출결의)을 잡은 직후에 멈춰 경합 순서를 고정한다(ARCHITECTURE §4-8 (5)).
export async function submitExpense(
  viewer: Viewer,
  input: { expenseId: string; expectedVersion: number },
  deps?: { afterLock?: () => Promise<void>; now?: Date },
): Promise<SubmitExpenseResult> {
  const row = UUID_SHAPE.test(input.expenseId) ? await findExpenseById(viewer, input.expenseId) : null;
  if (!row || row.drafterId !== viewer.id) throw new ExpenseNotFoundError();
  if (!(await can(viewer, "expenses", "write"))) throw new ForbiddenError("지출결의 작성 권한 없음");
  // 팀 비용 문서는 프로젝트가 없다 — 프로젝트 행 잠금 · 고객 승인 판정 없이 지출결의 행 잠금만.
  const projectRow = row.projectId ? await findProjectById(viewer, row.projectId) : null;
  if (!projectRow && !isTeamCostRow(row)) throw new ExpenseNotFoundError();

  const tax = await computeExpenseTax(viewer, row);
  const pre = projectRow ? await loadSubmitPre(viewer, projectRow) : null;
  const prepared = await prepareSubmission(viewer, { kind: EXPENSE_DOCUMENT_KIND, drafterId: viewer.id });
  const numbering = projectRow
    ? ({ kind: "project", projectNumber: projectRow.number, format: await loadExpenseNumberFormat() } as const)
    : ({ kind: "team", format: await loadDocumentNumberFormat("expense_team") } as const);
  // 팀 비용 번호 연도 = 제출일(서울)의 연도.
  const teamNumberYear = Number(seoulToday(deps?.now).slice(0, 4));

  return withTransaction(async (tx): Promise<SubmitExpenseResult> => {
    const lockedProject = projectRow ? await lockProjectForWrite(viewer, projectRow.id, tx) : null;
    const locked = await lockExpenseForUpdate(viewer, row.id, tx);
    await deps?.afterLock?.();
    if (!locked) throw new ExpenseNotFoundError();
    if (locked.number !== null) {
      const status = await findExpenseApprovalStatus(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: locked.id }, tx);
      if (status && ACTIVE_STATUSES.has(status)) return { kind: "already_submitted", expenseId: locked.id, number: locked.number };
      throw new ExpenseConflictError(locked.updatedAt);
    }
    if (locked.version !== input.expectedVersion) throw new ExpenseConflictError(locked.updatedAt);

    // 잠근 프로젝트 행 · tx로 읽은 차수 · 줄 · 문 · 증빙 수로 같은 규칙을 다시 판정한다(T-05-601).
    const { facts, line, numbered, door } = await loadSubmitFacts(viewer, locked, lockedProject ?? projectRow, pre, tax, tx);
    const decision = await gate(locked, "expense.submit", buildExpenseSubmitContext(facts));
    if (!decision.allowed) throw new GateBlockedError(decision.reason);
    if (locked.quoteLineId) {
      const current = supplyMoney(locked);
      if (line && current) {
        const others = numbered.filter((doc) => doc.id !== locked.id).flatMap((doc) => supplyMoney(doc) ?? []);
        const cap = remainingForInstallments(lineExecution(line), others, current);
        if (cap.exceeds) throw new ExpenseFieldError("supplyAmount", `남은 실행가 ${remainingText(cap.remaining, cap.basis)} 넘음 · 공급가액 고치기`);
      }
    }
    if (tax.unavailable) throw new GateBlockedError(TAX_UNAVAILABLE);

    const installment = locked.installment || Boolean(door?.forcedInstallment);
    const submittedAt = deps?.now ?? new Date();
    await saveSubmissionSnapshot(
      viewer,
      {
        id: locked.id,
        taxSnapshot: {
          taxRuleKind: tax.ruleKind,
          taxRate: tax.rate === null ? null : tax.rate.toFixed(6),
          taxRateSettingId: tax.historizedId,
          taxRateEffectiveFrom: tax.rateEffectiveFrom,
          taxCompanyBorneMethod: tax.method,
          taxBasisDate: tax.basisDate,
          vatKrw: tax.vatKrw,
          withholdingKrw: tax.withholdingKrw,
          companyBorneKrw: tax.companyBorneKrw,
          payableKrw: tax.payableKrw,
        },
        installment,
        installmentSeq: installment ? (door?.nextInstallmentSeq ?? 1) : null,
        submittedAt,
      },
      tx,
    );
    const instance = await submitDocument(viewer, prepared, { documentId: locked.id }, tx);
    const { number } =
      numbering.kind === "project"
        ? await allocateExpenseNumber(viewer, { projectNumber: numbering.projectNumber, format: numbering.format }, tx)
        : await allocateDocumentNumber(viewer, { counterKey: "expense_team", year: teamNumberYear, format: numbering.format }, tx);
    await setExpenseNumber(viewer, { id: locked.id, number }, tx);
    return { kind: "submitted", expenseId: locked.id, number, instanceId: instance.id, version: instance.version };
  });
}

// ── 제출 판정 사실(05-06 — 미리보기 · 제출 공용) ──────────────────────────

// 트랜잭션 전에 읽는 사실 — 고객 승인 게이트 설정과 담당 PM 이름.
type SubmitPre = { gateEnabled: boolean; pmName: string };

async function loadSubmitPre(viewer: Viewer, projectRow: ProjectRow): Promise<SubmitPre> {
  const [gateEnabled, pm] = await Promise.all([getSettingValue(PROJECT_CUSTOMER_APPROVAL_GATE), findUserById(viewer, projectRow.pmUserId)]);
  return { gateEnabled, pmName: pm?.name ?? "" };
}

// 규칙 `expense.submit`의 사실 — 미리보기는 기본 연결로, 제출은 tx로 읽는다(차수 · 줄 · 문 · 증빙 수 · 금액). 팀 비용 문서는 프로젝트 행이 없다(null).
async function loadSubmitFacts(
  viewer: Viewer,
  row: ExpenseRow,
  projectRow: ProjectRow | null,
  pre: SubmitPre | null,
  tax: ExpenseTaxResult,
  tx?: DbOrTx,
): Promise<{ facts: ExpenseSubmitFacts; line: QuoteLineRow | null; numbered: NumberedLineExpense[]; door: ExpenseLineDoor | null }> {
  const line = row.quoteLineId ? await findQuoteLineById(viewer, row.quoteLineId, tx) : null;
  const latest = projectRow ? await findLatestQuoteRevision(viewer, projectRow.id, tx) : null;
  const numbered = line ? await listNumberedByLine(viewer, line.id, tx) : [];
  const door = line ? doorFor(line, numbered, row.id) : null;
  const evidenceCount = await countActiveByOwner(viewer, EXPENSE_DOCUMENT_KIND, row.id, tx);
  const facts: ExpenseSubmitFacts = {
    customerApproval:
      row.quoteLineId && latest && projectRow && pre
        ? {
            status: projectRow.status,
            revisionSeq: latest.seq,
            revisionApproved: latest.customerApprovedAt !== null,
            gateEnabled: pre.gateEnabled,
            actorIsAssignedPm: projectRow.pmUserId === viewer.id,
            pmName: pre.pmName,
          }
        : null,
    projectCompleted: projectRow?.status === "completed",
    line: row.quoteLineId
      ? {
          inCurrentRevision: Boolean(line && latest && line.revisionId === latest.id && line.archivedAt === null && door && door.state !== "none"),
          closedBy: door?.state === "closed" && door.latest ? door.latest : null,
        }
      : null,
    vendorId: line ? line.vendorId : row.vendorId,
    // 팀 비용 문서(프로젝트 없음) — ①~④는 건너뛰고 ⑥ 묶음에 종류 · 내용이 든다.
    teamCost: projectRow ? null : { kind: row.teamExpenseKind, content: row.content },
    supplyAmountKrw: row.supplyAmountKrw,
    evidenceType: row.evidenceType,
    paymentMethod: row.paymentMethod,
    evidenceCount,
    taxUnavailable: tax.unavailable === true,
  };
  return { facts, line, numbered, door };
}

// 다음 한 수가 페이지 이동인 막힘의 주소 — ① 담당 PM이면 프로젝트 상세(고객 승인 표시), ④ 가장 최근 제출 문서.
function blockHref(target: ExpenseSubmitTarget | null, facts: ExpenseSubmitFacts, projectId: string | null): string | null {
  if (target === "customerApproval" && projectId && facts.customerApproval?.actorIsAssignedPm) return `/projects/${projectId}`;
  if (target === "openLatest" && facts.line?.closedBy) return `/expenses/${facts.line.closedBy.id}`;
  return null;
}

// ── 미리보기(05-06 — 쓰기 없음) ─────────────────────────────────────────

export type ExpenseSubmitBlock = NonNullable<ExpensePreviewDto["block"]>;

// 저장 전 칸 값을 초안에 겹쳐 세금 한 줄 · 제출 막힘 첫 이유와 대상 · 회차 상한 칸 오류를 돌려준다. 기안자 · 작성 중만(아니면 없는 문서 —
// 남의 초안을 계산하지 않는다, T-05-603). 트랜잭션 · 쓰기 없음 — 미리보기 통과가 제출 통과를 보장하지 않는다(제출이 tx 안에서 같은 규칙으로 다시 판정).
export async function previewExpense(viewer: Viewer, input: { expenseId: string; fields: ExpenseDraftInput }): Promise<Partial<ExpensePreviewDto>> {
  const saved = UUID_SHAPE.test(input.expenseId) ? await findExpenseById(viewer, input.expenseId) : null;
  if (!saved || saved.drafterId !== viewer.id || saved.number !== null) throw new ExpenseNotFoundError();
  const projectRow = saved.projectId ? await findProjectById(viewer, saved.projectId) : null;
  if (!projectRow && !isTeamCostRow(saved)) throw new ExpenseNotFoundError();
  const row: ExpenseRow = { ...saved, ...toDraftColumns(draftFieldsSchema.parse(input.fields)) };
  const supply = supplyMoney(row);

  const evidenceNames = await codeLabelsOf(viewer, "evidence_type");
  const tax = await computeExpenseTax(viewer, row);
  const evidenceTypeName = row.evidenceType ? (evidenceNames.get(row.evidenceType) ?? row.evidenceType) : null;
  const taxLine = supply ? taxLineText(tax, supply, `${evidenceTypeName ?? ""} 규칙`) : null;

  const { facts, line, numbered } = await loadSubmitFacts(viewer, row, projectRow, projectRow ? await loadSubmitPre(viewer, projectRow) : null, tax);
  const decision = await gate(row, "expense.submit", buildExpenseSubmitContext(facts));
  let block: ExpenseSubmitBlock | null = null;
  if (!decision.allowed) {
    const target = await nextActionTarget(facts);
    block = { reason: decision.reason, target, href: blockHref(target, facts, projectRow?.id ?? null) };
  }

  const fieldErrors: ExpensePreviewDto["fieldErrors"] = {};
  // 팀 비용 — 사용일을 바꾸면 그날 소속 팀이 다시 온다(소속 없으면 사용일 칸 오류). 쓰기 없음.
  let teamName: string | null = null;
  if (!projectRow && row.usageDate) {
    const team = await teamAtDate(viewer, viewer.id, row.usageDate);
    if (team) teamName = team.name ?? null;
    else fieldErrors.usageDate = NO_TEAM_AT_USAGE_DATE;
  }
  if (line && supply) {
    const others = numbered.filter((doc) => doc.id !== row.id).flatMap((doc) => supplyMoney(doc) ?? []);
    const cap = remainingForInstallments(lineExecution(line), others, supply);
    if (cap.exceeds) fieldErrors.supplyAmount = `남은 실행가 ${remainingText(cap.remaining, cap.basis)} 넘음 · 공급가액 고치기`;
  }
  return project(viewer, { taxLine, block, fieldErrors, teamName }, EXPENSE_PREVIEW_DTO_SPEC);
}

// ── 읽기 ──────────────────────────────────────────────────────────────

// 05-05 폼 자동 채움 재료(작성 중 문서만) — 견적 줄 실행가 줄 · 분할 지급 갈래와 힌트 한 줄(체크박스를 켰을 때 보일 글자 — 켜고 끄는 것은 화면). 앞 회차가 있는 줄의 문서는 체크박스 대신 값
// 글자(`2회차 · 앞 회차 26001-0004 · 남은 실행가 …`)이고 남은 실행가가 이번 공급가액과 같으면 `N회차 · 마지막 회차`다. 저장된 값 기준이다
// (입력하는 동안의 즉시 재계산은 05-06).
type LineFacts = Pick<SourceExtras, "executionLines" | "installmentMode" | "installmentText">;

async function lineFactsFor(viewer: Viewer, row: ExpenseSummaryRow, supply: Money | null): Promise<LineFacts> {
  if (row.number !== null || !row.quoteLineId) return {};
  const line = await findQuoteLineById(viewer, row.quoteLineId);
  if (!line) return {};
  const execution = lineExecution(line);
  const executionLines = [`실행가 ${formatKrw(execution.amountKrw)}`];
  if (execution.currency !== "KRW") executionLines.push(`${execution.currency} ${formatForeignAmount(execution.amount)} @${formatFxRate(execution.fxRate)}`);

  const numbered = await listNumberedByLine(viewer, line.id);
  const forced = numbered.length > 0;
  const installmentMode = forced ? "fixed" : "checkbox";
  const { basis, remaining } = remainingForInstallments(
    execution,
    numbered.flatMap((doc) => supplyMoney(doc) ?? []),
  );
  const isLast =
    supply !== null && (basis === "foreign" ? Math.round(remaining.amount * 100) === Math.round(supply.amount * 100) : remaining.amountKrw === supply.amountKrw);
  const previous = numbered.at(-1)?.number;
  const parts = [`${numbered.length + 1}회차`];
  if (forced && previous) parts.push(`앞 회차 ${previous}`);
  parts.push(isLast ? "마지막 회차" : `남은 실행가 ${remainingText(remaining, basis)}`);
  return { executionLines, installmentMode, installmentText: parts.join(" · ") };
}

// 05-06 폼 선택지(증빙 종류 · 지급 방식) — 코드표 메뉴(`admin.code-tables`) 보기 권한과 무관하게 지출결의 쓰기 권한이 있으면 활성 코드를
// 받는다(PM 계급은 코드표 메뉴가 없어 domain/code-tables의 목록이 비었다 — 증빙 종류를 바꿀 수 없었다). 라벨 · 설명만 싣는다.
export type ExpenseCodeOption = { value: string; label: string; description: string | null };

export async function listExpenseFormOptions(viewer: Viewer): Promise<{ evidence: ExpenseCodeOption[]; payment: ExpenseCodeOption[] }> {
  if (!(await can(viewer, "expenses", "write"))) return { evidence: [], payment: [] };
  const read = async (tableKey: string): Promise<ExpenseCodeOption[]> =>
    (await listCodeItems(viewer, { tableKey, scope: { rows: "all", includeArchived: false }, includeInactive: false })).map((item) => ({
      value: item.value,
      label: item.label,
      description: item.description,
    }));
  const [evidence, payment] = await Promise.all([read("evidence_type"), read("payment_method")]);
  return { evidence, payment };
}

// 05-05 폼 통화 선택지 — 통화마다 설정의 최근 환율(Phase 4 D-71)이 기본 환율이다.
export async function listExpenseCurrencies(): Promise<{ value: string; fxRate: number }[]> {
  return Promise.all(CURRENCIES.map(async (currency) => ({ value: currency, fxRate: await recentFxRate(currency) })));
}

// 05-07 `/expenses/new` 첫 그림 — 사용일 기본(서울 오늘)과 그날 내 소속 팀 이름. 사용일을 주면 그 날짜로 다시 본다(문서가 없어 미리보기를 못 부르는
// 새 문서 화면의 팀 텍스트 갱신 — 소속 없으면 사용일 칸 오류). 쓰기 권한이 없으면 null(→ 404).
export async function getNewExpenseDefaults(viewer: Viewer, deps?: { now?: Date; usageDate?: string }): Promise<Partial<ExpenseNewDefaultsDto> | null> {
  if (!(await can(viewer, "expenses", "write"))) return null;
  const usageDate = deps?.usageDate ?? seoulToday(deps?.now);
  const team = await teamAtDate(viewer, viewer.id, usageDate);
  return project(viewer, { usageDate, teamName: team?.name ?? null, usageDateError: team ? null : NO_TEAM_AT_USAGE_DATE }, EXPENSE_NEW_DEFAULTS_DTO_SPEC);
}

// 문서 하나 — 보이는 사람(canSeeExpense)이 아니면 null(→ 404).
export async function getExpense(viewer: Viewer, input: { expenseId: string }): Promise<Partial<ExpenseDocumentDto> | null> {
  if (!UUID_SHAPE.test(input.expenseId)) return null;
  const [row] = await listExpenseSummaries(viewer, { ids: [input.expenseId], documentKind: EXPENSE_DOCUMENT_KIND });
  if (!row) return null;
  if (!(await canSeeExpense(viewer, row))) return null;
  const [evidenceNames, paymentNames] = await Promise.all([codeLabelsOf(viewer, "evidence_type"), codeLabelsOf(viewer, "payment_method")]);
  const evidenceTypeName = row.evidenceType ? (evidenceNames.get(row.evidenceType) ?? row.evidenceType) : null;
  const supply = supplyMoney(row);
  // 제출 뒤는 저장된 스냅숏, 작성 중은 지금 기준 계산. 번호 있는 문서는 지금 설정 · 기준일로 다시 계산해 저장값과 다르면
  // 세율 바뀜(값 비교만 — 스냅숏의 이력 행 id로 설정 이력을 다시 읽지 않는다, B1 Round 2).
  const stored = storedTaxResult(row);
  const current = supply && (stored === null || row.number !== null) ? await computeExpenseTax(viewer, row) : null;
  const result = stored ?? current;
  const taxLine = result && supply ? taxLineText(result, supply, `${evidenceTypeName ?? ""} 규칙`) : null;
  const taxDrift = stored && current && row.number !== null ? taxDriftText(stored, current) : null;
  const vendor = row.number === null && row.vendorId ? await findVendorById(viewer, row.vendorId) : null;
  return project(
    viewer,
    toSource(row, {
      evidenceTypeName,
      paymentMethodName: row.paymentMethod ? (paymentNames.get(row.paymentMethod) ?? row.paymentMethod) : null,
      taxLine,
      taxDrift,
      defaultEvidenceName: vendor?.defaultEvidenceType ? (evidenceNames.get(vendor.defaultEvidenceType) ?? vendor.defaultEvidenceType) : null,
      ...(await lineFactsFor(viewer, row, supply)),
    }),
    EXPENSE_DOCUMENT_DTO_SPEC,
  );
}

// ── 견적 줄 표 행 행동 열(05-05 ④) ────────────────────────────────────────

export type LineDoorCell = {
  state: ExpenseLineDoor["state"];
  // 내가 이 줄로 만든 작성 중 문서(있으면 같은 글자 `지출결의 올리기`가 그 문서를 연다 — R6-08).
  expenseId?: string;
  // 이 줄의 가장 최근 제출 문서(문이 닫힘 `지출결의 열기`의 도착지).
  latestId?: string;
};
export type LineDoors = { showColumn: boolean; tableGateReason: string | null; cells: Record<string, LineDoorCell> };

// 화면은 이 값만 그린다 — 셀 · 표 전체 게이트 · 열 여부 판정은 서버다. 열은 `expenses` 쓰기 권한 ∧ 그 프로젝트 쓰기 권리
// (담당 PM 또는 업무 범위가 프로젝트 팀을 덮음 — createExpenseFromLines와 같은 판정)가 있을 때만 선다. 현재(최신) 차수 줄만 셀을 갖는다.
export async function listLineDoors(viewer: Viewer, input: { projectId: string }): Promise<LineDoors> {
  const hidden: LineDoors = { showColumn: false, tableGateReason: null, cells: {} };
  const [canWriteExpense, canWriteProject] = await Promise.all([can(viewer, "expenses", "write"), can(viewer, "projects", "write")]);
  if (!canWriteExpense || !canWriteProject) return hidden;
  const [gateEnabled, teamScope] = await Promise.all([
    getSettingValue(PROJECT_CUSTOMER_APPROVAL_GATE),
    loadActorTeamScope(viewer, { todayKst: seoulToday() }),
  ]);
  const facts = await loadProjectFacts(viewer, input.projectId, gateEnabled);
  if (!facts) return hidden;
  if (facts.project.pmUserId !== viewer.id && !coversProjectTeam(teamScope, facts.project.teamId)) return hidden;
  if (!facts.latestRevisionId) return { showColumn: true, tableGateReason: facts.tableGateReason, cells: {} };

  const lines = await listQuoteLinesByRevision(viewer, facts.latestRevisionId);
  const lineIds = lines.map((line) => line.id);
  const [numbered, drafts] = await Promise.all([listNumberedByLineage(viewer, input.projectId), listDraftsByLines(viewer, { lineIds, drafterId: viewer.id })]);
  const cells: Record<string, LineDoorCell> = {};
  for (const line of lines) {
    const door = doorFor(line, numbered.get(line.id) ?? []);
    const draft = drafts.find((doc) => doc.quoteLineId === line.id);
    cells[line.id] = {
      state: door.state,
      ...(door.state === "open" && draft ? { expenseId: draft.id } : {}),
      ...(door.latest ? { latestId: door.latest.id } : {}),
    };
  }
  return { showColumn: true, tableGateReason: facts.tableGateReason, cells };
}
