import { describe, expect, it } from "vitest";
import { buildCardSlipWaitingBundle, buildIssueBundle, buildPaymentBundle, buildPreSettleBlockedItems, buildPurchaseBundle, type PaymentBundleTarget } from "@/domain/next-turn/phase6-items";

// 06-23(S19 · UA-611) — 「내 차례」 Phase 6 묶음 빌더. 순수 함수라 DB 없이 돈다. 날짜는 서울 달력 `YYYY-MM-DD`.
// 2026-09-24는 목요일 — 이번 주(서울 월~일) = 09-21 ~ 09-27.

const TODAY = "2026-09-24";

function target(scheduledPaymentDate: string | null, payableKrw: number, evidenceStatus = "확인됨"): PaymentBundleTarget {
  return { scheduledPaymentDate, payableKrw, evidenceStatus };
}

describe("buildPaymentBundle — 지급 묶음", () => {
  it("예정일 지남 · 오늘 3건(그중 확인 전 1) → [오늘] label `지급 3건` · reason `예정일 지남·오늘 · 확인 전 1건` · 합계 = 세 건 합 · 지급 대상 보기", () => {
    const entry = buildPaymentBundle(
      [target("2026-09-20", 1_000_000, "확인 전"), target("2026-09-24", 2_000_000), target("2026-09-01", 500_000, "증빙 없음"), target("2026-09-25", 9_000_000)],
      TODAY,
    );

    expect(entry).toMatchObject({
      key: "phase6-payment",
      tag: "오늘",
      label: "지급 3건",
      reason: "예정일 지남·오늘 · 확인 전 1건",
      measureText: "3,500,000",
      action: { label: "지급 대상 보기", href: "/expenses?status=지급 대상" },
    });
  });

  it("확인 전이 0건이면 reason에 `확인 전` 조각이 없다", () => {
    const entry = buildPaymentBundle([target("2026-09-24", 2_000_000), target("2026-09-23", 1_000_000)], TODAY);

    expect(entry).toMatchObject({ label: "지급 2건", reason: "예정일 지남·오늘" });
  });

  it("오늘 이전 0건 · 이번 주 2건 → [대기] label `지급 2건` · reason `이번 주` · 합계 = 이번 주 두 건", () => {
    const entry = buildPaymentBundle([target("2026-09-25", 1_000_000), target("2026-09-27", 2_000_000), target("2026-09-28", 7_000_000)], TODAY);

    expect(entry).toMatchObject({ tag: "대기", label: "지급 2건", reason: "이번 주", measureText: "3,000,000", action: { label: "지급 대상 보기", href: "/expenses?status=지급 대상" } });
  });

  it("예정일 없는 대상만 있으면 줄이 없다", () => {
    expect(buildPaymentBundle([target(null, 1_000_000), target(null, 2_000_000)], TODAY)).toBeNull();
  });

  it("대상 0건이면 줄이 없다", () => {
    expect(buildPaymentBundle([], TODAY)).toBeNull();
  });

  it("일요일 경계 — 오늘이 일요일이면 다음 월요일 예정은 이번 주가 아니다", () => {
    expect(buildPaymentBundle([target("2026-09-28", 1_000_000)], "2026-09-27")).toBeNull();
  });

  it("금액을 볼 수 없으면 숫자 칸은 빈 글자", () => {
    expect(buildPaymentBundle([target("2026-09-24", 2_000_000)], TODAY, false)?.measureText).toBe("");
  });
});

describe("buildPurchaseBundle — 구매 요청 묶음", () => {
  it("신청 3건 · 가장 오래된 09-18 → [대기] label `구매 요청 3건` · reason `신청 · 가장 오래된 09-18` · 합계 · 구매 요청 보기", () => {
    const entry = buildPurchaseBundle({ count: 3, estimateKrw: 1_250_000, oldestRequestedOn: "2026-09-18" });

    expect(entry).toEqual({
      key: "phase6-purchase",
      tag: "대기",
      label: "구매 요청 3건",
      reason: "신청 · 가장 오래된 09-18",
      measureText: "1,250,000",
      action: { label: "구매 요청 보기", href: "/cards/purchases" },
    });
  });

  it("신청 0건이면 줄이 없다", () => {
    expect(buildPurchaseBundle({ count: 0, estimateKrw: 0, oldestRequestedOn: null })).toBeNull();
  });

  it("구매 완료 · 취소만 남아 신청 집계가 비면(가장 오래된 날짜 없음) 줄이 없다", () => {
    expect(buildPurchaseBundle({ count: 0, estimateKrw: null, oldestRequestedOn: null })).toBeNull();
  });

  it("예상 금액을 볼 수 없으면(합계 null) 숫자 칸은 빈 글자", () => {
    expect(buildPurchaseBundle({ count: 1, estimateKrw: null, oldestRequestedOn: "2026-09-18" })?.measureText).toBe("");
  });
});

describe("buildCardSlipWaitingBundle — 전표 대기 (07.1-17 PD1 · U-11)", () => {
  it("2건 · 가장 오래된 구매 완료 10-03 → [대기] label `전표 대기 2건` · reason `결제 완료 · 가장 오래된 10-03` · 금액 빈 글자 · 구매 요청 보기 → /cards/purchases?status=구매 완료", () => {
    expect(buildCardSlipWaitingBundle({ count: 2, oldestCompletedOn: "2026-10-03" })).toEqual({
      key: "phase6-card-slip",
      tag: "대기",
      label: "전표 대기 2건",
      reason: "결제 완료 · 가장 오래된 10-03",
      measureText: "",
      action: { label: "구매 요청 보기", href: `/cards/purchases?status=${encodeURIComponent("구매 완료")}` },
    });
  });

  it("0건이면 줄이 없다(날짜가 없어도 없다)", () => {
    expect(buildCardSlipWaitingBundle({ count: 0, oldestCompletedOn: null })).toBeNull();
    expect(buildCardSlipWaitingBundle({ count: 0, oldestCompletedOn: "2026-10-03" })).toBeNull();
  });
});

describe("buildIssueBundle — 매출 발행 요청 묶음", () => {
  it("2건 · 희망 09-30 · 오늘 09-24 → [대기] label `매출 발행 요청 2건` · reason `희망 09-30` · 공급가 합 · 발행 요청 보기", () => {
    const entry = buildIssueBundle({ count: 2, earliestDesiredDate: "2026-09-30", supplyKrw: 22_000_000 }, TODAY);

    expect(entry).toEqual({
      key: "phase6-issue",
      tag: "대기",
      label: "매출 발행 요청 2건",
      reason: "희망 09-30",
      measureText: "22,000,000",
      action: { label: "발행 요청 보기", href: "/projects/issue-requests" },
    });
  });

  it("가장 이른 희망일이 오늘이거나 그 전이면 [오늘]", () => {
    expect(buildIssueBundle({ count: 1, earliestDesiredDate: "2026-09-24", supplyKrw: 1 }, TODAY)?.tag).toBe("오늘");
    expect(buildIssueBundle({ count: 1, earliestDesiredDate: "2026-09-01", supplyKrw: 1 }, TODAY)?.tag).toBe("오늘");
  });

  it("count 0이면 줄이 없다", () => {
    expect(buildIssueBundle({ count: 0 }, TODAY)).toBeNull();
  });

  it("공급가를 볼 수 없으면(키 없음) 숫자 칸은 빈 글자", () => {
    expect(buildIssueBundle({ count: 2, earliestDesiredDate: "2026-09-30" }, TODAY)?.measureText).toBe("");
  });
});

describe("buildPreSettleBlockedItems — PM 완료 전 점검 막힘", () => {
  it("막힘 3 → [막힘] label `{프로젝트}` · reason `완료 전 점검 3건` · 숫자 `—` · 점검 보기 → 프로젝트 점검 섹션", () => {
    expect(buildPreSettleBlockedItems([{ projectId: "p1", projectName: "아이오닉9", blockedCount: 3 }])).toEqual([
      {
        key: "phase6-presettle-p1",
        tag: "막힘",
        label: "아이오닉9",
        reason: "완료 전 점검 3건",
        measureText: "—",
        action: { label: "점검 보기", href: "/projects/p1#pre-settle-check" },
      },
    ]);
  });

  it("막힘 0(강행 허용만 남음)이면 그 프로젝트 줄이 없다", () => {
    expect(buildPreSettleBlockedItems([{ projectId: "p1", projectName: "아이오닉9", blockedCount: 0 }])).toEqual([]);
  });

  it("프로젝트마다 한 줄 — 막힘이 있는 프로젝트만", () => {
    const items = buildPreSettleBlockedItems([
      { projectId: "p1", projectName: "가", blockedCount: 1 },
      { projectId: "p2", projectName: "나", blockedCount: 0 },
      { projectId: "p3", projectName: "다", blockedCount: 2 },
    ]);
    expect(items.map((item) => [item.label, item.reason])).toEqual([
      ["가", "완료 전 점검 1건"],
      ["다", "완료 전 점검 2건"],
    ]);
  });

  it("정산 프로젝트가 없으면 줄이 없다", () => {
    expect(buildPreSettleBlockedItems([])).toEqual([]);
  });
});
