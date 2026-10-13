import type { EvidenceStatus } from "@/domain/evidence-reviews";

// 06-19(PROJ-06 · D-611~D-613 · UA-610): 완료 전 점검의 순수 요약. 판정은 그룹별 항목 수(DTO)가 하고 게이트는 막힘 건수만 본다
// (RESEARCH Pitfall 4 — 세 조건을 게이트 check() 안에 다시 쓰지 않는다).

export type PreSettleGroupKey = "openExpenses" | "unmatchedLines" | "missingRevenue";
export type PreSettleCounts = Record<PreSettleGroupKey, number>;
export type PreSettleAllowances = Record<PreSettleGroupKey, boolean>;

export type PreSettleSummary = {
  blockedCount: number;
  groups: Record<PreSettleGroupKey, { count: number; allowed: boolean }>;
  forcedResultLine: string | null;
};

const GROUP_ORDER: readonly PreSettleGroupKey[] = ["openExpenses", "unmatchedLines", "missingRevenue"];

const GROUP_PHRASE: Record<PreSettleGroupKey, (count: number) => string> = {
  openExpenses: (count) => `미결 지출결의 ${count}건`,
  unmatchedLines: (count) => `미매칭 견적 줄 ${count}줄`,
  missingRevenue: () => "매출 미입력",
};

// 강행 허용 그룹 중 항목이 있는 것만 — 강행 기안 결과 한 줄(UI-SPEC S18).
export function forcedResultLine(counts: PreSettleCounts, allowances: PreSettleAllowances): string | null {
  const parts = GROUP_ORDER.filter((key) => allowances[key] && counts[key] > 0).map((key) => GROUP_PHRASE[key](counts[key]));
  return parts.length > 0 ? `강행 · ${parts.join(" · ")}` : null;
}

export function summarizePreSettle(counts: PreSettleCounts, allowances: PreSettleAllowances): PreSettleSummary {
  const groups = {
    openExpenses: { count: counts.openExpenses, allowed: allowances.openExpenses },
    unmatchedLines: { count: counts.unmatchedLines, allowed: allowances.unmatchedLines },
    missingRevenue: { count: counts.missingRevenue, allowed: allowances.missingRevenue },
  };
  const blockedCount = GROUP_ORDER.reduce((sum, key) => sum + (allowances[key] ? 0 : counts[key]), 0);
  return { blockedCount, groups, forcedResultLine: forcedResultLine(counts, allowances) };
}

export function preSettleBlockReason(blockedCount: number): string | null {
  return blockedCount > 0 ? `완료 전 점검 ${blockedCount}건 · 점검 보기` : null;
}

// O-14 확정 순서 — `반려` > `선결제 · 증빙 없음` / `증빙 없음` > `결재 중`.
export const OPEN_EXPENSE_STATUS_ORDER = ["rejected", "prepaid_no_evidence", "no_evidence", "in_review"] as const;
export type OpenExpenseState = (typeof OPEN_EXPENSE_STATUS_ORDER)[number];

// 지출결의 하나가 미결인지와 그 낱말 갈래(D-611). 결재 상태는 approval_instances의 값, 증빙은 06-06 resolveEvidenceStatus의 값.
// 회수 · 작성 중 → 미결 아님(종결은 리포지토리가 `closed_at IS NULL`로 거른다 — C10).
export function openExpenseState(input: { approvalStatus: string; evidence: EvidenceStatus }): OpenExpenseState | null {
  if (input.approvalStatus === "rejected") return "rejected";
  if (input.approvalStatus === "submitted" || input.approvalStatus === "in_review") return "in_review";
  return null;
}
