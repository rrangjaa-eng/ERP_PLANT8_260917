import { describe, expect, it } from "vitest";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import {
  OPEN_EXPENSE_STATUS_ORDER,
  forcedResultLine,
  isUnmatchedLine,
  lineDisplayNumbers,
  liveLinkCount,
  openExpenseState,
  preSettleBlockReason,
  preSettleExpenseGroup,
  revenueSummary,
  summarizePreSettle,
  type PreSettleAllowances,
} from "@/domain/pre-settle-check/summary";
import { resolveEvidenceStatus } from "@/domain/evidence-reviews";

// 06-19(PROJ-06 · D-611~D-613 · UA-610): 완료 전 점검의 순수 요약 — 막힘 건수 · 게이트 이유 · 강행 결과 줄 · 낱말 순서.
// 판정은 DTO(그룹별 건수)가 하고 게이트는 막힘 건수만 본다(RESEARCH Pitfall 4).

const OFF: PreSettleAllowances = { openExpenses: false, unmatchedLines: false, missingRevenue: false };
const NONE = { openExpenses: 0, unmatchedLines: 0, missingRevenue: 0 };

describe("summarizePreSettle — 막힘 건수 · 강행", () => {
  it("미결 지출결의 1건 · 강행 꺼짐 → 막힘 1", () => {
    const summary = summarizePreSettle({ ...NONE, openExpenses: 1 }, OFF);
    expect(summary.blockedCount).toBe(1);
    expect(summary.groups.openExpenses).toEqual({ count: 1, allowed: false });
    expect(summary.forcedResultLine).toBeNull();
  });

  it("미결 지출결의 1건 · 강행 켜짐 → 막힘 0 · 결과 줄 `강행 · 미결 지출결의 1건`", () => {
    const summary = summarizePreSettle({ ...NONE, openExpenses: 1 }, { ...OFF, openExpenses: true });
    expect(summary.blockedCount).toBe(0);
    expect(summary.groups.openExpenses).toEqual({ count: 1, allowed: true });
    expect(summary.forcedResultLine).toBe("강행 · 미결 지출결의 1건");
  });

  it("전부 빔 → 막힘 0 · 결과 줄 없음", () => {
    const summary = summarizePreSettle(NONE, OFF);
    expect(summary.blockedCount).toBe(0);
    expect(summary.forcedResultLine).toBeNull();
  });

  it("07.1-01 PD3 — 증빙 대기 건수는 막힘 · 강행 줄과 별개로 그대로 실린다(안 주면 0)", () => {
    expect(summarizePreSettle(NONE, OFF).evidencePendingCount).toBe(0);
    const summary = summarizePreSettle({ ...NONE, openExpenses: 1 }, OFF, 3);
    expect(summary.evidencePendingCount).toBe(3);
    expect(summary.blockedCount).toBe(1);
  });
});

describe("preSettleBlockReason — 게이트 이유 한 문자열", () => {
  it("0 → null", () => {
    expect(preSettleBlockReason(0)).toBeNull();
  });
  it("N → `완료 전 점검 {N}건 · 점검 보기`", () => {
    expect(preSettleBlockReason(1)).toBe("완료 전 점검 1건 · 점검 보기");
    expect(preSettleBlockReason(3)).toBe("완료 전 점검 3건 · 점검 보기");
  });
});

describe("게이트 `project.pre-settle-check` — 막힘 건수만 본다", () => {
  it("blockedCount 0 → 허용", async () => {
    expect(await gate(null, "project.pre-settle-check", { blockedCount: 0 })).toEqual({ allowed: true });
  });
  it("blockedCount 2 → 막힘 · 이유 = preSettleBlockReason", async () => {
    expect(await gate(null, "project.pre-settle-check", { blockedCount: 2 })).toEqual({ allowed: false, reason: "완료 전 점검 2건 · 점검 보기" });
  });
});

describe("O-14 — 미결 지출결의 낱말 순서", () => {
  it("`반려` > `선결제 · 증빙 없음` / `증빙 없음` > `결재 중`", () => {
    expect(OPEN_EXPENSE_STATUS_ORDER).toEqual(["rejected", "prepaid_no_evidence", "no_evidence", "in_review"]);
  });
});

describe("forcedResultLine", () => {
  it("강행 허용 그룹 중 항목이 있는 것만", () => {
    expect(forcedResultLine({ ...NONE, openExpenses: 2 }, { ...OFF, openExpenses: true })).toBe("강행 · 미결 지출결의 2건");
    expect(forcedResultLine({ ...NONE, openExpenses: 2 }, OFF)).toBeNull();
  });
});

// ── Task 2 — 세 그룹(D-611 · C10 · D-612 · D-613) · 강행 조합 ─────────────────────

// 결재 상태 + 증빙 사실 → 미결 갈래. 증빙 낱말은 06-06 resolveEvidenceStatus(면제가 선결제를 이긴다)가 정한다 — 파일 수를 직접 세지 않는다(C5).
function stateOf(input: { approvalStatus: string; hasEvidence: boolean; prepaid?: boolean; waived?: boolean; closed?: boolean }) {
  const evidence = resolveEvidenceStatus({ hasEvidence: input.hasEvidence, prepaid: input.prepaid ?? false, review: input.waived ? { status: "waived" } : null });
  return openExpenseState({ approvalStatus: input.approvalStatus, evidence, closed: input.closed ?? false });
}

describe("D-611 — 결재 통과 지출결의의 증빙 갈래", () => {
  it("결재 통과 · 살아 있는 파일 0 · 면제 아님 · 지급 전 → 증빙 없음", () => {
    expect(stateOf({ approvalStatus: "approved", hasEvidence: false })).toBe("no_evidence");
  });
  it("같은데 지급 뒤 → 증빙 없음(지급 여부는 낱말을 바꾸지 않는다)", () => {
    expect(stateOf({ approvalStatus: "approved", hasEvidence: false })).toBe("no_evidence");
  });
  it("같은데 선결제 → 선결제 · 증빙 없음", () => {
    expect(stateOf({ approvalStatus: "approved", hasEvidence: false, prepaid: true })).toBe("prepaid_no_evidence");
  });
  it("면제 → 행 없음(선결제여도)", () => {
    expect(stateOf({ approvalStatus: "approved", hasEvidence: false, waived: true })).toBeNull();
    expect(stateOf({ approvalStatus: "approved", hasEvidence: false, prepaid: true, waived: true })).toBeNull();
  });
  it("결재 통과 · 증빙 있음 · 지급 전 → 행 없음", () => {
    expect(stateOf({ approvalStatus: "approved", hasEvidence: true })).toBeNull();
  });
  it("증빙 필수 off · 증빙 0 · 면제 아님 → 증빙 없음(설정은 점검을 바꾸지 않는다)", () => {
    expect(stateOf({ approvalStatus: "approved", hasEvidence: false })).toBe("no_evidence");
  });
  it("파일이 무효 처리만 된 문서(hasEvidence = 살아 있는 파일만 → false) → 증빙 없음", () => {
    expect(stateOf({ approvalStatus: "approved", hasEvidence: false })).toBe("no_evidence");
  });
});

describe("D-611 낱말 — 결재 중 · 반려", () => {
  it("반려 · 증빙 0 → 반려", () => {
    expect(stateOf({ approvalStatus: "rejected", hasEvidence: false })).toBe("rejected");
  });
  it("결재 중 · 증빙 0 → 증빙 없음", () => {
    expect(stateOf({ approvalStatus: "in_review", hasEvidence: false })).toBe("no_evidence");
    expect(stateOf({ approvalStatus: "submitted", hasEvidence: false })).toBe("no_evidence");
  });
  it("결재 중 · 증빙 있음 → 결재 중", () => {
    expect(stateOf({ approvalStatus: "submitted", hasEvidence: true })).toBe("in_review");
  });
});

describe("C10 — 종결 · 회수 · 작성 중", () => {
  it("종결된 반려 문서 → 행 없음 · 막힘에 안 셈", () => {
    expect(stateOf({ approvalStatus: "rejected", hasEvidence: false, closed: true })).toBeNull();
  });
  it("회수 · 작성 중 → 행 없음", () => {
    expect(stateOf({ approvalStatus: "withdrawn", hasEvidence: false })).toBeNull();
    expect(stateOf({ approvalStatus: "draft", hasEvidence: false })).toBeNull();
  });
});

// 06-36(G-06-E · 카드 ② 「경고만」): 결재 통과 · 증빙 없음은 막지 않는 증빙 대기, 결재 중 · 반려만 막는다(D-611의 결재 통과 갈래를 대체).
describe("G-06-E — preSettleExpenseGroup(카드 ② 「경고만」)", () => {
  const groupOf = (input: Parameters<typeof stateOf>[0]) => preSettleExpenseGroup({ approvalStatus: input.approvalStatus, state: stateOf(input) });

  it("결재 통과 · 증빙 없음 → 증빙 대기", () => {
    expect(groupOf({ approvalStatus: "approved", hasEvidence: false })).toBe("evidencePending");
  });
  it("결재 통과 · 선결제 · 증빙 없음 → 증빙 대기", () => {
    expect(groupOf({ approvalStatus: "approved", hasEvidence: false, prepaid: true })).toBe("evidencePending");
  });
  it("결재 중(submitted) · 증빙 없음 → 미결 지출결의(막힘 그대로 — 가정 A-1)", () => {
    expect(groupOf({ approvalStatus: "submitted", hasEvidence: false })).toBe("openExpenses");
  });
  it("결재 중(in_review) · 증빙 있음 → 미결 지출결의", () => {
    expect(groupOf({ approvalStatus: "in_review", hasEvidence: true })).toBe("openExpenses");
  });
  it("반려 → 미결 지출결의", () => {
    expect(groupOf({ approvalStatus: "rejected", hasEvidence: false })).toBe("openExpenses");
  });
  it("낱말 없음(면제 · 증빙 있음 · 종결) → null", () => {
    expect(groupOf({ approvalStatus: "approved", hasEvidence: false, waived: true })).toBeNull();
    expect(groupOf({ approvalStatus: "approved", hasEvidence: true })).toBeNull();
    expect(groupOf({ approvalStatus: "rejected", hasEvidence: false, closed: true })).toBeNull();
  });
});

const LIVE = new Set(["e-live"]);
const NO_LINKS = { expenses: [], cardUsages: [], purchaseRequests: [] };
function unmatched(line: Partial<{ lineKind: string; cancelled: boolean; executionKrw: number }>, links: { expenses: { id: string }[]; cardUsages: unknown[]; purchaseRequests: unknown[] } = NO_LINKS) {
  return isUnmatchedLine({ lineKind: "quote", cancelled: false, executionKrw: 1_000_000, ...line, liveLinks: liveLinkCount(links, LIVE) });
}

describe("D-612 — 미매칭 견적 줄", () => {
  it("실행가 있는 견적 줄 · 연결 없음 → 미매칭", () => {
    expect(unmatched({})).toBe(true);
  });
  it("실행가 0 → 제외", () => {
    expect(unmatched({ executionKrw: 0 })).toBe(false);
  });
  it("취소 줄 → 제외", () => {
    expect(unmatched({ cancelled: true })).toBe(false);
  });
  it("조정 줄 → 제외", () => {
    expect(unmatched({ lineKind: "adjustment" })).toBe(false);
  });
  it("종결 · 회수된 지출결의만 걸린 줄 → 미매칭(PS-2 — 살아 있는 연결만 센다)", () => {
    expect(unmatched({}, { expenses: [{ id: "e-closed" }, { id: "e-withdrawn" }], cardUsages: [], purchaseRequests: [] })).toBe(true);
  });
  it("카드 사용 1건 → 제외", () => {
    expect(unmatched({}, { expenses: [], cardUsages: [{}], purchaseRequests: [] })).toBe(false);
  });
  it("구매 요청 1건 → 제외", () => {
    expect(unmatched({}, { expenses: [], cardUsages: [], purchaseRequests: [{}] })).toBe(false);
  });
  it("연결 합 ≠ 실행가 → 제외(살아 있는 지출결의 하나면 매칭)", () => {
    expect(unmatched({ executionKrw: 10_000_000 }, { expenses: [{ id: "e-live" }], cardUsages: [], purchaseRequests: [] })).toBe(false);
  });
});

describe("줄 번호 — 견적 표의 표시 순서(종류 → 소분류 그룹 처음 나온 순서)", () => {
  it("견적 줄 소분류 그룹 · 견적 외 · 조정 순서로 1부터", () => {
    const numbers = lineDisplayNumbers([
      { id: "a", lineKind: "adjustment", subcategory: "x" },
      { id: "b", lineKind: "quote", subcategory: "s1" },
      { id: "c", lineKind: "quote", subcategory: "s2" },
      { id: "d", lineKind: "out_of_quote", subcategory: "x" },
      { id: "e", lineKind: "quote", subcategory: "s1" },
    ]);
    expect([...numbers.entries()]).toEqual([
      ["b", 1],
      ["e", 2],
      ["c", 3],
      ["d", 4],
      ["a", 5],
    ]);
  });
});

describe("D-613 — 매출 미입력 · 매출 줄", () => {
  it("발행 줄 0 → 항목 1 · 발행 합계 · 차이 없음", () => {
    expect(revenueSummary({ contractKrw: 48_000_000, pendingLabel: null, issuedCount: 0, issuedTotalKrw: 0 })).toEqual({
      missingRevenue: 1,
      contractKrw: 48_000_000,
      issuedTotalKrw: null,
      diffKrw: null,
      pendingLabel: null,
    });
  });
  it("발행 줄 ≥ 1 → 그룹 빔", () => {
    expect(revenueSummary({ contractKrw: 48_000_000, pendingLabel: null, issuedCount: 2, issuedTotalKrw: 48_000_000 }).missingRevenue).toBe(0);
  });
  it("차이 = 계약 − 발행 합계, ≠ 0이어도 막힘 아님", () => {
    const line = revenueSummary({ contractKrw: 48_000_000, pendingLabel: null, issuedCount: 1, issuedTotalKrw: 44_000_000 });
    expect(line).toMatchObject({ missingRevenue: 0, issuedTotalKrw: 44_000_000, diffKrw: 4_000_000 });
  });
  it("계약 미승인 → 계약 금액 null · 대기 글자 · 차이 null", () => {
    expect(revenueSummary({ contractKrw: null, pendingLabel: "3차 고객 승인 전", issuedCount: 1, issuedTotalKrw: 1_000_000 })).toEqual({
      missingRevenue: 0,
      contractKrw: null,
      issuedTotalKrw: 1_000_000,
      diffKrw: null,
      pendingLabel: "3차 고객 승인 전",
    });
  });
});

describe("강행 허용 세 키 조합", () => {
  const counts = { openExpenses: 2, unmatchedLines: 1, missingRevenue: 1 };
  it("전부 꺼짐 → 막힘 4 · 결과 줄 없음", () => {
    expect(summarizePreSettle(counts, OFF)).toMatchObject({ blockedCount: 4, forcedResultLine: null });
  });
  it("전부 켜짐 → 막힘 0 · 결과 줄 세 그룹", () => {
    expect(summarizePreSettle(counts, { openExpenses: true, unmatchedLines: true, missingRevenue: true })).toMatchObject({
      blockedCount: 0,
      forcedResultLine: "강행 · 미결 지출결의 2건 · 미매칭 견적 줄 1줄 · 매출 미입력",
    });
  });
  it("미매칭만 켜짐 → 막힘 3 · 결과 줄 미매칭", () => {
    expect(summarizePreSettle(counts, { ...OFF, unmatchedLines: true })).toMatchObject({ blockedCount: 3, forcedResultLine: "강행 · 미매칭 견적 줄 1줄" });
  });
  it("매출만 켜짐 → 막힘 3 · 결과 줄 매출 미입력", () => {
    expect(summarizePreSettle(counts, { ...OFF, missingRevenue: true })).toMatchObject({ blockedCount: 3, forcedResultLine: "강행 · 매출 미입력" });
  });
});
