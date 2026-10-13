import { describe, expect, it } from "vitest";
import { buildPaymentBundle, type PaymentBundleTarget } from "@/domain/next-turn/phase6-items";

// 06-23(S19 · UA-611) — 「내 차례」 Phase 6 묶음 빌더. 순수 함수라 DB 없이 돈다. 날짜는 서울 달력 `YYYY-MM-DD`.
// 2026-09-24는 목요일 — 이번 주(서울 월~일) = 09-21 ~ 09-27.

const TODAY = "2026-09-24";

function target(scheduledPaymentDate: string | null, payableKrw: number, evidenceStatus = "확인됨"): PaymentBundleTarget {
  return { scheduledPaymentDate, payableKrw, evidenceStatus };
}

describe("buildPaymentBundle — 지급 묶음", () => {
  it("예정일 지남 · 오늘 3건(그중 확인 전 1) → [오늘] `지급 — 예정일 지남·오늘 3건 · 확인 전 1건` · 합계 = 세 건 합 · 지급 대상 보기", () => {
    const entry = buildPaymentBundle(
      [target("2026-09-20", 1_000_000, "확인 전"), target("2026-09-24", 2_000_000), target("2026-09-01", 500_000, "증빙 없음"), target("2026-09-25", 9_000_000)],
      TODAY,
    );

    expect(entry).toMatchObject({
      key: "phase6-payment",
      tag: "오늘",
      label: "지급 — 예정일 지남·오늘 3건 · 확인 전 1건",
      reason: "",
      measureText: "3,500,000",
      action: { label: "지급 대상 보기", href: "/expenses?status=지급 대상" },
    });
  });

  it("확인 전이 0건이면 label에 `확인 전` 조각이 없다", () => {
    const entry = buildPaymentBundle([target("2026-09-24", 2_000_000), target("2026-09-23", 1_000_000)], TODAY);

    expect(entry?.label).toBe("지급 — 예정일 지남·오늘 2건");
  });

  it("오늘 이전 0건 · 이번 주 2건 → [대기] `지급 — 이번 주 2건` · 합계 = 이번 주 두 건", () => {
    const entry = buildPaymentBundle([target("2026-09-25", 1_000_000), target("2026-09-27", 2_000_000), target("2026-09-28", 7_000_000)], TODAY);

    expect(entry).toMatchObject({ tag: "대기", label: "지급 — 이번 주 2건", measureText: "3,000,000", action: { label: "지급 대상 보기", href: "/expenses?status=지급 대상" } });
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
