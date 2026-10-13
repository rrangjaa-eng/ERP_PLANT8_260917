import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { DtoSpec } from "@/domain/permissions/project";
import { getSettingValue } from "@/domain/settings/registry";
import {
  PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE,
  PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES,
  PROJECT_FORCE_COMPLETE_ALLOW_UNMATCHED_ESTIMATE_LINES,
  PURCHASE_ONLINE_VENDOR_NAME,
} from "@/domain/settings/keys";
import { hasEvidence } from "@/domain/evidence/has-evidence";
import { resolveEvidenceStatus } from "@/domain/evidence-reviews";
import { doorFor, lineExecution } from "@/domain/expenses";
import { sumKrw } from "@/domain/money";
import { resolveLineDoor } from "@/domain/quotes/line-door";
import { findReviewByExpense } from "@/repositories/expense-evidence-reviews";
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
};

export type PreSettleExpenseRowDto = {
  id: string;
  number: string;
  itemName: string | null;
  state: OpenExpenseState;
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
};

export type PreSettleRevenueDto = {
  /** 계약 금액 미승인이면 `{n}차 고객 승인 전`. */
  pendingLabel: string | null;
  contractKrw: number | null;
  issuedTotalKrw: number | null;
  diffKrw: number | null;
};

export type PreSettleCheckDto = {
  openExpenses: { count: number; allowed: boolean; rows: PreSettleExpenseRowDto[] };
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
export const PRE_SETTLE_CHECK_DTO_SPEC: DtoSpec<PreSettleAmounts, PreSettleAmounts> = {
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

export async function loadPreSettleInputs(viewer: Viewer): Promise<PreSettleInputs> {
  void viewer;
  const [openExpenses, unmatchedLines, missingRevenue, onlineVendorName] = await Promise.all([
    getSettingValue(PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES),
    getSettingValue(PROJECT_FORCE_COMPLETE_ALLOW_UNMATCHED_ESTIMATE_LINES),
    getSettingValue(PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE),
    getSettingValue(PURCHASE_ONLINE_VENDOR_NAME),
  ]);
  return { allowances: { openExpenses, unmatchedLines, missingRevenue }, onlineVendorName };
}

const STATE_RANK = new Map<OpenExpenseState, number>(OPEN_EXPENSE_STATUS_ORDER.map((state, index) => [state, index]));

function lineDoorOf(line: PreSettleLineRow, links: LineLinks, onlineVendorName: string): PreSettleLineDoor {
  if (resolveLineDoor({ vendorName: line.vendorName }, onlineVendorName) === "purchase") return { kind: "purchase", href: `/cards/purchases?new=1&line=${line.id}` };
  const door = doorFor(line, links.expenses);
  if (door.state === "open") return { kind: "expense_open" };
  if (door.state === "closed" && door.latest) return { kind: "expense_closed", latestId: door.latest.id };
  if (door.state === "no_vendor") return { kind: "no_vendor" };
  return { kind: "none" };
}

const NO_LINKS: LineLinks = { currentLineId: null, currentExecution: null, expenses: [], cardUsages: [], purchaseRequests: [] };

export async function computePreSettleCheck(viewer: Viewer, projectId: string, inputs: PreSettleInputs, tx?: DbOrTx): Promise<PreSettleCheckDto> {
  // ① 미결 지출결의(D-611 · C10) — 증빙은 hasEvidence(살아 있는 파일) · 면제는 리뷰 행 · 낱말은 resolveEvidenceStatus(C5).
  const expenseRows = await listPreSettleExpenseRows(viewer, projectId, tx);
  const open: PreSettleExpenseRowDto[] = [];
  for (const row of expenseRows) {
    const evidence = resolveEvidenceStatus({
      hasEvidence: await hasEvidence(viewer, { ownerKind: "expense", ownerId: row.id }, tx),
      prepaid: row.prepaid,
      review: await findReviewByExpense(viewer, row.id, tx),
    });
    const state = openExpenseState({ approvalStatus: row.approvalStatus, evidence, closed: false });
    if (state) open.push({ id: row.id, number: row.number, itemName: row.itemName, state });
  }
  open.sort((a, b) => (STATE_RANK.get(a.state) ?? 0) - (STATE_RANK.get(b.state) ?? 0) || a.number.localeCompare(b.number));

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
    unmatched.push({ lineId: line.id, displayNo: numbers.get(line.id) ?? 0, itemName: line.itemName, door: lineDoorOf(line, lineLinks, inputs.onlineVendorName) });
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

  const summary: PreSettleSummary = summarizePreSettle(
    { openExpenses: open.length, unmatchedLines: unmatched.length, missingRevenue: revenue.missingRevenue },
    inputs.allowances,
  );
  return {
    openExpenses: { ...summary.groups.openExpenses, rows: open },
    unmatchedLines: { ...summary.groups.unmatchedLines, rows: unmatched },
    missingRevenue: summary.groups.missingRevenue,
    revenue: { pendingLabel: revenue.pendingLabel, contractKrw: revenue.contractKrw, issuedTotalKrw: revenue.issuedTotalKrw, diffKrw: revenue.diffKrw },
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
