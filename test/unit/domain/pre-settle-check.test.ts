import { describe, expect, it } from "vitest";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import {
  OPEN_EXPENSE_STATUS_ORDER,
  forcedResultLine,
  preSettleBlockReason,
  summarizePreSettle,
  type PreSettleAllowances,
} from "@/domain/pre-settle-check/summary";

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

