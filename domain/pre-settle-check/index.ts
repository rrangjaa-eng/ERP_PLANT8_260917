import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { can } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { visible } from "@/domain/permissions/visible";
import { getSettingValue } from "@/domain/settings/registry";
import {
  PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE,
  PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES,
  PROJECT_FORCE_COMPLETE_ALLOW_UNMATCHED_ESTIMATE_LINES,
  PURCHASE_ONLINE_VENDOR_NAME,
} from "@/domain/settings/keys";
import { evidenceSourcesOf } from "@/domain/evidence/has-evidence";
import { resolveEvidenceStatus } from "@/domain/evidence-reviews";
import { doorFor, lineExecution } from "@/domain/expenses";
import { EXPENSE_DOCUMENT_KIND, visibleExpenseScope } from "@/domain/expenses/access";
import { sumKrw } from "@/domain/money";
import { resolveLineDoor } from "@/domain/quotes/line-door";
import { listReviewStatusByExpenses } from "@/repositories/expense-evidence-reviews";
import { listExpenseIdsInScope, type ExpenseScope } from "@/repositories/expenses";
import { listIssuedAmountsKrw, listPreSettleExpenseRows, listPreSettleLineRows, type PreSettleLineRow } from "@/repositories/pre-settle-check";
import { sumQuoteAmountByRevision } from "@/repositories/quote-lines";
import { findLineLinks, type LineLinks } from "@/repositories/quote-line-links";
import { findLatestQuoteRevision } from "@/repositories/quote-revisions";
import {
  OPEN_EXPENSE_STATUS_ORDER,
  isUnmatchedLine,
  lineDisplayNumbers,
  liveLinkCount,
  openExpenseState,
  preSettleBlockReason,
  preSettleExpenseGroup,
  revenueSummary,
  summarizePreSettle,
  type OpenExpenseState,
  type PreSettleAllowances,
  type PreSettleGroupKey,
  type PreSettleSummary,
} from "./summary";

// 06-19(PROJ-06 · D-611~D-613 · UA-610 · ENG E-1): 완료 전 점검 — 상세 섹션 · 정산 기안 게이트가 같은 DTO를 본다.
// loadPreSettleInputs = 트랜잭션 밖(권한 · 설정 — 전역 풀). computePreSettleCheck = tx 리포지토리 · 순수 함수만(권한 · 설정을 다시 읽지 않는다).
// PreSettleInputs에는 프로젝트별 칸이 없다 — 한 번 읽어 여러 프로젝트에 쓴다(06-22 · 06-23).

export type PreSettleInputs = {
  allowances: PreSettleAllowances;
  /** 설정 `purchase.online_vendor_name` — 미매칭 줄의 문(resolveLineDoor) 입력. */
  onlineVendorName: string;
  /** 05 visibleExpenseScope — 미결 지출결의 행을 보는 사람의 범위로 가른다(R-6). */
  scope: ExpenseScope;
  /** 금액 칸 정보 항목별 노출(visible) — 투영이 트랜잭션 안에서 노출표를 다시 읽지 않게 미리 읽는다. */
  exposure: Record<string, boolean>;
  /** 프로젝트 쓰기 권한 — 없으면 미매칭 줄의 문을 싣지 않는다(화면은 `담당 PM {이름}` · listLineDoors와 같이 숨김 — 검토 F-1). */
  lineDoors: boolean;
};

export type PreSettleExpenseRowDto = {
  id: string;
  number: string;
  itemName: string | null;
  state: OpenExpenseState;
  expenseAmountKrw?: number | null;
};

// 미매칭 줄의 다음 한 수 — 사람이 고르지 않고 거래처 설정에서 나온다(S14 문 가르기와 같은 함수).
export type PreSettleLineDoor =
  | { kind: "purchase"; href: string }
  | { kind: "expense_open" }
  | { kind: "expense_closed"; latestId: string }
  | { kind: "no_vendor" }
  | { kind: "none" };

export type PreSettleLineRowDto = {
  lineId: string;
  displayNo: number;
  itemName: string;
  door: PreSettleLineDoor;
  executionKrw?: number | null;
};

export type PreSettleRevenueDto = {
  /** 계약 금액 미승인이면 `{n}차 고객 승인 전`. */
  pendingLabel: string | null;
  contractKrw?: number | null;
  issuedTotalKrw?: number | null;
  diffKrw?: number | null;
};

export type PreSettleCheckDto = {
  /** count는 프로젝트 전체(막힘 건수와 같은 값) · rows는 보는 사람의 범위 안 · 범위 밖은 건수만(R-6). */
  openExpenses: { count: number; allowed: boolean; rows: PreSettleExpenseRowDto[]; outOfScopeCount: number };
  /** 06-36 — 결재 통과 · 증빙 없음(막힘 건수 밖). 범위 · 금액은 openExpenses와 같고 강행 대상이 아니라 allowed 없음. */
  evidencePending: { count: number; rows: PreSettleExpenseRowDto[]; outOfScopeCount: number };
  unmatchedLines: { count: number; allowed: boolean; rows: PreSettleLineRowDto[] };
  missingRevenue: { count: number; allowed: boolean };
  revenue: PreSettleRevenueDto;
  blockedCount: number;
  blockReason: string | null;
  forcedResultLine: string | null;
};

type PreSettleAmounts = {
  expenseAmountKrw: number | null;
  executionKrw: number | null;
  contractKrw: number | null;
  issuedTotalKrw: number | null;
  diffKrw: number | null;
};

// 금액 칸마다 정보 항목(누수 스캔이 계급마다 돈다).
export const PRE_SETTLE_CHECK_DTO_SPEC: DtoSpec<Partial<PreSettleAmounts>, PreSettleAmounts> = {
  fields: [
    { key: "expenseAmountKrw", from: "expenseAmountKrw", infoItem: "expense.amount" },
    { key: "executionKrw", from: "executionKrw", infoItem: "quote.amount" },
    { key: "contractKrw", from: "contractKrw", infoItem: "quote.amount" },
    { key: "issuedTotalKrw", from: "issuedTotalKrw", infoItem: "revenue.issued_amount" },
    { key: "diffKrw", from: "diffKrw", infoItem: ["quote.amount", "revenue.issued_amount"] },
  ],
};

registerDto({
  name: "PreSettleCheckDto",
  fields: PRE_SETTLE_CHECK_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

const AMOUNT_INFO_ITEMS = [...new Set(PRE_SETTLE_CHECK_DTO_SPEC.fields.flatMap((field) => (typeof field.infoItem === "string" ? [field.infoItem] : [...field.infoItem])))];

export async function loadPreSettleInputs(viewer: Viewer): Promise<PreSettleInputs> {
  const [openExpenses, unmatchedLines, missingRevenue, onlineVendorName, lineDoors] = await Promise.all([
    getSettingValue(PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES),
    getSettingValue(PROJECT_FORCE_COMPLETE_ALLOW_UNMATCHED_ESTIMATE_LINES),
    getSettingValue(PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE),
    getSettingValue(PURCHASE_ONLINE_VENDOR_NAME),
    can(viewer, "projects", "write"),
  ]);
  const scope = await visibleExpenseScope(viewer);
  // 노출 판정은 정보 항목마다 차례로(projectMany와 같이 — 같은 요청이 풀을 한꺼번에 잡지 않는다).
  const exposure: Record<string, boolean> = {};
  for (const item of AMOUNT_INFO_ITEMS) exposure[item] = await visible(viewer, item);
  return { allowances: { openExpenses, unmatchedLines, missingRevenue }, onlineVendorName, scope, exposure, lineDoors };
}

// 금액 칸 투영 — 노출은 inputs에서만(트랜잭션 안에서 노출표를 다시 읽지 않는다 · ENG E-1).
function projectAmounts(viewer: Viewer, inputs: PreSettleInputs, source: Partial<PreSettleAmounts>): Promise<Partial<PreSettleAmounts>> {
  return project(viewer, source, PRE_SETTLE_CHECK_DTO_SPEC, { visible: (_viewer, item) => Promise.resolve(inputs.exposure[item] === true) });
}

const STATE_RANK = new Map<OpenExpenseState, number>(OPEN_EXPENSE_STATUS_ORDER.map((state, index) => [state, index]));

function lineDoorOf(line: PreSettleLineRow, links: LineLinks, inputs: PreSettleInputs): PreSettleLineDoor {
  if (!inputs.lineDoors) return { kind: "none" };
  const { onlineVendorName } = inputs;
  if (resolveLineDoor({ vendorName: line.vendorName }, onlineVendorName) === "purchase") return { kind: "purchase", href: `/cards/purchases?new=1&line=${line.id}` };
  const door = doorFor(line, links.expenses);
  if (door.state === "open") return { kind: "expense_open" };
  if (door.state === "closed" && door.latest) return { kind: "expense_closed", latestId: door.latest.id };
  if (door.state === "no_vendor") return { kind: "no_vendor" };
  return { kind: "none" };
}

const NO_LINKS: LineLinks = { currentLineId: null, currentExecution: null, expenses: [], cardUsages: [], purchaseRequests: [] };

export async function computePreSettleCheck(viewer: Viewer, projectId: string, inputs: PreSettleInputs, tx?: DbOrTx): Promise<PreSettleCheckDto> {
  // ① 미결 지출결의(D-611 · C10) — 증빙은 evidenceSourcesOf 묶음 하나(살아 있는 파일 또는 붙임 — 06.1-12 · T-061-63) · 면제는 리뷰 행 ·
  // 낱말은 resolveEvidenceStatus(C5).
  const expenseRows = await listPreSettleExpenseRows(viewer, projectId, tx);
  const evidenceSources = await evidenceSourcesOf(viewer, { ownerKind: "expense", ownerIds: expenseRows.map((row) => row.id) }, tx);
  // 07.1-01 PF2 — 확인 기록은 문서마다 따로 읽지 않고 한 번에(질의 수가 지출결의 수에 비례하지 않는다).
  const reviewStatuses = await listReviewStatusByExpenses(viewer, expenseRows.map((row) => row.id), tx);
  const open: (PreSettleExpenseRowDto & { supplyAmountKrw: number | null })[] = [];
  const pending: (PreSettleExpenseRowDto & { supplyAmountKrw: number | null })[] = [];
  for (const row of expenseRows) {
    const reviewStatus = reviewStatuses.get(row.id);
    const evidence = resolveEvidenceStatus({
      hasEvidence: evidenceSources.has(row.id),
      prepaid: row.prepaid,
      review: reviewStatus ? { status: reviewStatus } : null,
    });
    const state = openExpenseState({ approvalStatus: row.approvalStatus, evidence, closed: false });
    const group = preSettleExpenseGroup({ approvalStatus: row.approvalStatus, state });
    if (state && group) (group === "evidencePending" ? pending : open).push({ id: row.id, number: row.number, itemName: row.itemName, state, supplyAmountKrw: row.supplyAmountKrw });
  }
  const byStateThenNumber = (a: PreSettleExpenseRowDto, b: PreSettleExpenseRowDto) => (STATE_RANK.get(a.state) ?? 0) - (STATE_RANK.get(b.state) ?? 0) || a.number.localeCompare(b.number);
  open.sort(byStateThenNumber);
  pending.sort(byStateThenNumber);

  // ② 미매칭 견적 줄(D-612) — 최신 차수 줄만, 연결은 그 줄 id 전부로 findLineLinks 한 번(계보 사슬 전체 — X-1). 살아 있는 지출결의 = ①의 대상 목록(PS-2).
  const latest = await findLatestQuoteRevision(viewer, projectId, tx);
  const lines = latest ? await listPreSettleLineRows(viewer, latest.id, tx) : [];
  const numbers = lineDisplayNumbers(lines);
  const links = await findLineLinks(viewer, lines.map((line) => line.id), tx);
  const liveExpenseIds = new Set(expenseRows.map((row) => row.id));
  const unmatched: PreSettleLineRowDto[] = [];
  for (const line of lines) {
    const lineLinks = links.get(line.id) ?? NO_LINKS;
    const candidate = { lineKind: line.lineKind, cancelled: line.lineStatus === "cancelled", executionKrw: lineExecution(line).amountKrw, liveLinks: liveLinkCount(lineLinks, liveExpenseIds) };
    if (!isUnmatchedLine(candidate)) continue;
    const amounts = await projectAmounts(viewer, inputs, { executionKrw: candidate.executionKrw });
    unmatched.push({ lineId: line.id, displayNo: numbers.get(line.id) ?? 0, itemName: line.itemName, door: lineDoorOf(line, lineLinks, inputs), ...amounts });
  }
  unmatched.sort((a, b) => a.displayNo - b.displayNo);

  // ③ 매출 미입력 · 매출 줄(D-613) — 계약 금액은 매출 섹션과 같은 출처(최신 차수 고객 승인 합계, A-604).
  const contractKrw = latest && latest.customerApprovedAt !== null ? await sumQuoteAmountByRevision(viewer, latest.id, tx) : null;
  const issued = await listIssuedAmountsKrw(viewer, projectId, tx);
  const revenue = revenueSummary({
    contractKrw,
    pendingLabel: latest && latest.customerApprovedAt === null ? `${latest.seq}차 고객 승인 전` : null,
    issuedCount: issued.length,
    issuedTotalKrw: sumKrw(issued),
  });

  // 건수 · 막힘은 범위로 가르기 전 프로젝트 전체 목록으로 센다(R-6).
  const summary: PreSettleSummary = summarizePreSettle(
    { openExpenses: open.length, unmatchedLines: unmatched.length, missingRevenue: revenue.missingRevenue },
    inputs.allowances,
    pending.length,
  );
  // 미결 지출결의 · 증빙 대기 행만 보는 사람의 범위로 가른다 — 범위 밖은 건수만(번호 · 항목 · 금액을 싣지 않는다).
  // 미매칭 줄 문의 마지막 문서(회수 등 — listNumberedByLines는 결재 상태 · 범위를 보지 않는다)도 같은 범위로 거른다 — 범위 밖이면 문 없음(검토 F-1).
  const closedDoorIds = unmatched.flatMap((row) => (row.door.kind === "expense_closed" ? [row.door.latestId] : []));
  const inScope = await listExpenseIdsInScope(viewer, { ids: [...open.map((row) => row.id), ...pending.map((row) => row.id), ...closedDoorIds], scope: inputs.scope, documentKind: EXPENSE_DOCUMENT_KIND }, tx);
  for (const row of unmatched) if (row.door.kind === "expense_closed" && !inScope.has(row.door.latestId)) row.door = { kind: "none" };
  const visibleRows: PreSettleExpenseRowDto[] = [];
  for (const { supplyAmountKrw, ...row } of open) {
    if (inScope.has(row.id)) visibleRows.push({ ...row, ...(await projectAmounts(viewer, inputs, { expenseAmountKrw: supplyAmountKrw })) });
  }
  const visiblePending: PreSettleExpenseRowDto[] = [];
  for (const { supplyAmountKrw, ...row } of pending) {
    if (inScope.has(row.id)) visiblePending.push({ ...row, ...(await projectAmounts(viewer, inputs, { expenseAmountKrw: supplyAmountKrw })) });
  }
  return {
    openExpenses: { ...summary.groups.openExpenses, rows: visibleRows, outOfScopeCount: open.length - visibleRows.length },
    evidencePending: { count: summary.evidencePendingCount, rows: visiblePending, outOfScopeCount: pending.length - visiblePending.length },
    unmatchedLines: { ...summary.groups.unmatchedLines, rows: unmatched },
    missingRevenue: summary.groups.missingRevenue,
    revenue: {
      pendingLabel: revenue.pendingLabel,
      ...(await projectAmounts(viewer, inputs, { contractKrw: revenue.contractKrw, issuedTotalKrw: revenue.issuedTotalKrw, diffKrw: revenue.diffKrw })),
    },
    blockedCount: summary.blockedCount,
    blockReason: preSettleBlockReason(summary.blockedCount),
    forcedResultLine: summary.forcedResultLine,
  };
}

// PS-4 — 강행 기안의 행동 로그 상세(기안 시점 그룹별 건수 · 강행 그룹). 새 행동 종류 없이 document_submit 상세에 싣는다.
const GROUP_KEYS: readonly PreSettleGroupKey[] = ["openExpenses", "unmatchedLines", "missingRevenue"];
export function preSettleLogDetail(check: PreSettleCheckDto) {
  const groups = Object.fromEntries(GROUP_KEYS.map((key) => [key, { count: check[key].count, allowed: check[key].allowed }]));
  return { groups, forced: GROUP_KEYS.filter((key) => check[key].allowed && check[key].count > 0) };
}

// 화면 경로(풀) — 사전 조회 + 계산.
export async function getPreSettleCheck(viewer: Viewer, projectId: string): Promise<PreSettleCheckDto> {
  return computePreSettleCheck(viewer, projectId, await loadPreSettleInputs(viewer));
}
