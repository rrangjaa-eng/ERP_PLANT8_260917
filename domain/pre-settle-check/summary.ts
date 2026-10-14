import type { EvidenceStatus } from "@/domain/evidence-reviews";
import { diffKrw } from "@/domain/money";

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

// 지출결의 하나가 미결인지와 그 낱말 갈래(D-611). 결재 상태는 approval_instances의 값, 증빙은 06-06 resolveEvidenceStatus의 값(면제가 선결제를 이긴다).
// 종결(C10) · 회수 · 작성 중 → 미결 아님. 증빙 갈래는 결재 중 · 결재 통과에만 — 반려는 그대로 `반려`.
export function openExpenseState(input: { approvalStatus: string; evidence: EvidenceStatus; closed: boolean }): OpenExpenseState | null {
  if (input.closed) return null;
  if (input.approvalStatus === "rejected") return "rejected";
  const missing: OpenExpenseState | null = input.evidence === "증빙 없음" ? "no_evidence" : input.evidence === "선결제" ? "prepaid_no_evidence" : null;
  if (input.approvalStatus === "submitted" || input.approvalStatus === "in_review") return missing ?? "in_review";
  if (input.approvalStatus === "approved") return missing;
  return null;
}

// PS-2 — 줄 사슬의 살아 있는 연결 수. 지출결의는 점검 대상 목록(결재 중 · 반려 · 결재 통과 · 종결 안 됨)에 든 것만 센다 — 회수 · 작성 중 · 종결 제외.
export function liveLinkCount(
  links: { expenses: readonly { id: string }[]; cardUsages: readonly unknown[]; purchaseRequests: readonly unknown[] },
  liveExpenseIds: ReadonlySet<string>,
): number {
  return links.expenses.filter((doc) => liveExpenseIds.has(doc.id)).length + links.cardUsages.length + links.purchaseRequests.length;
}

// D-612 — 실행가 ≠ 0 · 취소 아님 · 조정 줄 아님 · 살아 있는 연결 0. 연결 합이 실행가와 달라도 연결이 하나면 매칭이다.
export function isUnmatchedLine(line: { lineKind: string; cancelled: boolean; executionKrw: number; liveLinks: number }): boolean {
  return line.lineKind !== "adjustment" && !line.cancelled && line.executionKrw !== 0 && line.liveLinks === 0;
}

// 견적 표 번호 열과 같은 순서 — 종류(견적 · 견적 외 · 조정) 뒤 그룹(견적 줄은 소분류, 나머지는 종류)을 처음 나온 순서로 모은다(quote-table displayOrder).
const KIND_ORDER: Record<string, number> = { quote: 0, out_of_quote: 1, adjustment: 2 };
export function lineDisplayNumbers(lines: readonly { id: string; lineKind: string; subcategory: string }[]): Map<string, number> {
  const groups = new Map<string, string[]>();
  const sorted = [...lines].sort((a, b) => (KIND_ORDER[a.lineKind] ?? 0) - (KIND_ORDER[b.lineKind] ?? 0));
  for (const line of sorted) {
    const key = line.lineKind === "quote" ? `quote:${line.subcategory}` : line.lineKind;
    groups.set(key, [...(groups.get(key) ?? []), line.id]);
  }
  return new Map([...groups.values()].flat().map((id, index) => [id, index + 1]));
}

// D-613 — 발행 줄 0이면 매출 미입력 1. 매출 줄 = 계약 금액(미승인이면 null + 대기 글자) · 발행 합계 · 차이(막지 않는다).
export function revenueSummary(input: { contractKrw: number | null; pendingLabel: string | null; issuedCount: number; issuedTotalKrw: number }) {
  const issuedTotalKrw = input.issuedCount > 0 ? input.issuedTotalKrw : null;
  return {
    missingRevenue: input.issuedCount > 0 ? 0 : 1,
    contractKrw: input.contractKrw,
    issuedTotalKrw,
    diffKrw: input.contractKrw !== null && issuedTotalKrw !== null ? diffKrw(input.contractKrw, issuedTotalKrw) : null,
    pendingLabel: input.pendingLabel,
  };
}
