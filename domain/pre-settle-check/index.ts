import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { DtoSpec } from "@/domain/permissions/project";
import { getSettingValue } from "@/domain/settings/registry";
import {
  PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE,
  PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES,
  PROJECT_FORCE_COMPLETE_ALLOW_UNMATCHED_ESTIMATE_LINES,
} from "@/domain/settings/keys";
import { listPreSettleExpenseRows } from "@/repositories/pre-settle-check";
import {
  OPEN_EXPENSE_STATUS_ORDER,
  openExpenseState,
  preSettleBlockReason,
  summarizePreSettle,
  type OpenExpenseState,
  type PreSettleAllowances,
  type PreSettleSummary,
} from "./summary";

// 06-19(PROJ-06 · D-611~D-613 · UA-610 · ENG E-1): 완료 전 점검 — 상세 섹션 · 정산 기안 게이트가 같은 DTO를 본다.
// loadPreSettleInputs = 트랜잭션 밖(권한 · 설정 — 전역 풀). computePreSettleCheck = tx 리포지토리 · 순수 함수만(권한 · 설정을 다시 읽지 않는다).
// PreSettleInputs에는 프로젝트별 칸이 없다 — 한 번 읽어 여러 프로젝트에 쓴다(06-22 · 06-23).

export type PreSettleInputs = {
  allowances: PreSettleAllowances;
};

export type PreSettleExpenseRowDto = {
  id: string;
  number: string;
  itemName: string | null;
  state: OpenExpenseState;
};

export type PreSettleCheckDto = {
  openExpenses: { count: number; allowed: boolean; rows: PreSettleExpenseRowDto[] };
  unmatchedLines: { count: number; allowed: boolean };
  missingRevenue: { count: number; allowed: boolean };
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
  const [openExpenses, unmatchedLines, missingRevenue] = await Promise.all([
    getSettingValue(PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES),
    getSettingValue(PROJECT_FORCE_COMPLETE_ALLOW_UNMATCHED_ESTIMATE_LINES),
    getSettingValue(PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE),
  ]);
  return { allowances: { openExpenses, unmatchedLines, missingRevenue } };
}

const STATE_RANK = new Map<OpenExpenseState, number>(OPEN_EXPENSE_STATUS_ORDER.map((state, index) => [state, index]));

export async function computePreSettleCheck(viewer: Viewer, projectId: string, inputs: PreSettleInputs, tx?: DbOrTx): Promise<PreSettleCheckDto> {
  const expenseRows = await listPreSettleExpenseRows(viewer, projectId, tx);
  const open: PreSettleExpenseRowDto[] = [];
  for (const row of expenseRows) {
    const state = openExpenseState({ approvalStatus: row.approvalStatus, evidence: "증빙 없음" });
    if (state) open.push({ id: row.id, number: row.number, itemName: row.itemName, state });
  }
  open.sort((a, b) => (STATE_RANK.get(a.state) ?? 0) - (STATE_RANK.get(b.state) ?? 0) || a.number.localeCompare(b.number));

  const summary: PreSettleSummary = summarizePreSettle({ openExpenses: open.length, unmatchedLines: 0, missingRevenue: 0 }, inputs.allowances);
  return {
    openExpenses: { ...summary.groups.openExpenses, rows: open },
    unmatchedLines: summary.groups.unmatchedLines,
    missingRevenue: summary.groups.missingRevenue,
    blockedCount: summary.blockedCount,
    blockReason: preSettleBlockReason(summary.blockedCount),
    forcedResultLine: summary.forcedResultLine,
  };
}

// 화면 경로(풀) — 사전 조회 + 계산.
export async function getPreSettleCheck(viewer: Viewer, projectId: string): Promise<PreSettleCheckDto> {
  return computePreSettleCheck(viewer, projectId, await loadPreSettleInputs(viewer));
}
