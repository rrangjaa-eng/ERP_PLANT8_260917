import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { seoulToday } from "@/lib/dates";
import { formatForeignAmount, formatKrw } from "@/lib/format-number";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { project } from "@/domain/permissions/project";
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
import { allocateExpenseNumber, loadExpenseNumberFormat } from "@/domain/document-numbering";
import { formatKstTime } from "@/domain/holidays/business-day";
import { computeExpenseTax } from "@/domain/expenses/tax";
import { expenseLineDoor, type ExpenseLineDoor } from "@/domain/expenses/line-door";
import { evaluateExpenseSubmit } from "@/domain/expenses/gate";
import { EXPENSE_DOCUMENT_DTO_SPEC, type ExpenseDocumentDto } from "@/domain/expenses/dto";
import { listCodeItems } from "@/repositories/code-tables";
import { findProjectById, lockProjectForWrite, type ProjectRow } from "@/repositories/projects";
import { findLatestQuoteRevision, findQuoteRevisionById } from "@/repositories/quote-revisions";
import { findQuoteLineById, type QuoteLineRow } from "@/repositories/quote-lines";
import { findUserById } from "@/repositories/users";
import { findVendorById } from "@/repositories/vendors";
import {
  findDraftByLineAndDrafter,
  findExpenseApprovalStatus,
  findExpenseById,
  insertDraftIfAbsent,
  listExpenseSummaries,
  listNumberedByLine,
  lockExpenseForUpdate,
  saveSubmissionSnapshot,
  setExpenseNumber,
  updateDraftIfVersion,
  type ExpenseDraftFields,
  type ExpenseRow,
  type ExpenseSummaryRow,
  type NumberedLineExpense,
} from "@/repositories/expenses";

export type { ExpenseDocumentDto, ExpenseDraftDto } from "@/domain/expenses/dto";

// 05-03(EXP-01 · EXP-14): 지출결의 — 결재 모듈에 문서 종류로 등록되고 제출은 같은 결재 엔진(domain/approvals)을 지난다.
// 결재 모듈은 이 파일을 import하지 않는다(app/(app)/document-kinds.ts가 적재를 일으킨다).

// 종류 키 — 04.1 연차 "leave"와 같은 영어 소문자 단수 관례, 설정 키 approval_route.expense.*와 같은 낱말.
export const EXPENSE_DOCUMENT_KIND = "expense";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_IN_CURRENT_REVISION = "견적 줄이 현재 차수에 없음 · 견적 줄 바꾸기";
const PROJECT_COMPLETED = "완료 프로젝트 · 새 지출결의 없음";
const NO_VENDOR = "거래처 없음 · 거래처 고르기";
const TAX_UNAVAILABLE = "세금 계산 불가 · 세율은 경영관리";
const ACTIVE_STATUSES = new Set(["submitted", "in_review", "approved"]);

export class ExpenseNotFoundError extends UserFacingError {
  constructor() {
    super("없는 지출결의 · 새로 고침");
  }
}

// 칸 오류 — 회차 상한 초과(게이트가 아니라 공급가액 칸 아래 한 줄).
export class ExpenseFieldError extends UserFacingError {
  constructor(
    readonly field: "supplyAmount",
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

function toSource(row: ExpenseSummaryRow): ExpenseDocumentDto {
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
    itemName: row.itemName,
    vendorName: row.vendorName,
    installmentSeq: row.installmentSeq,
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
    if (projected.supply) {
      const { currency, amount, fxRate, amountKrw } = projected.supply;
      summary.measure = { kind: "money", money: { currency, amount, fxRate, amountKrw } };
    }
    result.set(row.id, summary);
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

  const gateEnabled = await getSettingValue(PROJECT_CUSTOMER_APPROVAL_GATE);
  const factsByProject = new Map<string, ProjectFacts | null>();
  let paymentMethod: string | null | undefined;
  const created: { lineId: string; expenseId: string }[] = [];
  const blocked: { lineId: string; reason: string }[] = [];

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
    const door = doorFor(line, await listNumberedByLine(viewer, line.id));
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
  })
  .strict()
  .partial();

export type ExpenseDraftInput = z.input<typeof draftFieldsSchema>;

function toDraftColumns(fields: z.output<typeof draftFieldsSchema>): ExpenseDraftFields {
  const { supply, ...rest } = fields;
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
  const fields = toDraftColumns(draftFieldsSchema.parse(input.fields));
  const saved = await updateDraftIfVersion(viewer, { id: row.id, expectedVersion: input.expectedVersion, fields, updatedBy: viewer.id });
  if (!saved) {
    const latest = await findExpenseById(viewer, row.id);
    throw new ExpenseConflictError(latest?.updatedAt ?? row.updatedAt);
  }
  return { version: saved.version };
}

// ── 제출 ──────────────────────────────────────────────────────────────

export type SubmitExpenseResult =
  | { kind: "submitted"; expenseId: string; number: string; instanceId: string; version: number }
  | { kind: "already_submitted"; expenseId: string; number: string };

function remainingText(remaining: Money, basis: "foreign" | "krw"): string {
  return basis === "foreign" ? `${remaining.currency} ${formatForeignAmount(remaining.amount)}` : formatKrw(remaining.amountKrw);
}

// 트랜잭션 전: 기안자 문서 읽기 · 세금 계산 · 결재선 스냅숏(prepareSubmission) · 번호 서식. 트랜잭션 안(tx 호출만):
// 프로젝트 행 잠금 → 문서 행 잠금 → 이미 제출됨 판정 → version → 다시 판정 → 스냅숏 → 결재 인스턴스 · 로그 → 마지막
// 쓰기로 번호(카운터 행 잠금을 가장 짧게).
export async function submitExpense(viewer: Viewer, input: { expenseId: string; expectedVersion: number }): Promise<SubmitExpenseResult> {
  const row = UUID_SHAPE.test(input.expenseId) ? await findExpenseById(viewer, input.expenseId) : null;
  if (!row || row.drafterId !== viewer.id) throw new ExpenseNotFoundError();
  if (!(await can(viewer, "expenses", "write"))) throw new ForbiddenError("지출결의 작성 권한 없음");
  const projectRow = row.projectId ? await findProjectById(viewer, row.projectId) : null;
  if (!projectRow) throw new ExpenseNotFoundError();

  const tax = await computeExpenseTax(viewer, row);
  const prepared = await prepareSubmission(viewer, { kind: EXPENSE_DOCUMENT_KIND, drafterId: viewer.id });
  const format = await loadExpenseNumberFormat();

  return withTransaction(async (tx): Promise<SubmitExpenseResult> => {
    await lockProjectForWrite(viewer, projectRow.id, tx);
    const locked = await lockExpenseForUpdate(viewer, row.id, tx);
    if (!locked) throw new ExpenseNotFoundError();
    if (locked.number !== null) {
      const status = await findExpenseApprovalStatus(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: locked.id }, tx);
      if (status && ACTIVE_STATUSES.has(status)) return { kind: "already_submitted", expenseId: locked.id, number: locked.number };
      throw new ExpenseConflictError(locked.updatedAt);
    }
    if (locked.version !== input.expectedVersion) throw new ExpenseConflictError(locked.updatedAt);

    let door: ExpenseLineDoor | null = null;
    let lineInCurrentRevision = true;
    if (locked.quoteLineId) {
      const line = await findQuoteLineById(viewer, locked.quoteLineId, tx);
      const latest = await findLatestQuoteRevision(viewer, projectRow.id, tx);
      const numbered = line ? await listNumberedByLine(viewer, line.id, tx) : [];
      door = line ? doorFor(line, numbered, locked.id) : null;
      lineInCurrentRevision = Boolean(line && latest && line.revisionId === latest.id && line.archivedAt === null && door && door.state !== "none");
      const decision = evaluateExpenseSubmit({
        lineInCurrentRevision,
        closedBy: door?.state === "closed" && door.latest ? door.latest : null,
        supplyAmountKrw: locked.supplyAmountKrw,
        evidenceType: locked.evidenceType,
        paymentMethod: locked.paymentMethod,
      });
      if (!decision.allowed) throw new GateBlockedError(decision.reason);
      const current = supplyMoney(locked);
      if (line && current) {
        const others = numbered.filter((doc) => doc.id !== locked.id).flatMap((doc) => supplyMoney(doc) ?? []);
        const cap = remainingForInstallments(lineExecution(line), others, current);
        if (cap.exceeds) throw new ExpenseFieldError("supplyAmount", `남은 실행가 ${remainingText(cap.remaining, cap.basis)} 넘음 · 공급가액 고치기`);
      }
    }
    if (tax.unavailable) throw new GateBlockedError(TAX_UNAVAILABLE);

    const installment = locked.installment || Boolean(door?.forcedInstallment);
    const submittedAt = new Date();
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
    const { number } = await allocateExpenseNumber(viewer, { projectNumber: projectRow.number, format }, tx);
    await setExpenseNumber(viewer, { id: locked.id, number }, tx);
    return { kind: "submitted", expenseId: locked.id, number, instanceId: instance.id, version: instance.version };
  });
}

// ── 읽기 ──────────────────────────────────────────────────────────────

// 문서 하나 — 보이는 사람(canSeeExpense)이 아니면 null(→ 404).
export async function getExpense(viewer: Viewer, input: { expenseId: string }): Promise<Partial<ExpenseDocumentDto> | null> {
  if (!UUID_SHAPE.test(input.expenseId)) return null;
  const [row] = await listExpenseSummaries(viewer, { ids: [input.expenseId], documentKind: EXPENSE_DOCUMENT_KIND });
  if (!row) return null;
  if (!(await canSeeExpense(viewer, row))) return null;
  return project(viewer, toSource(row), EXPENSE_DOCUMENT_DTO_SPEC);
}
