import { describe, expect, it } from "vitest";
import {
  CERT_RRN_EXEMPT_PRIZE_VALUE_KRW,
  certPrizeListed,
  certRrnPurgeTarget,
} from "@/domain/certs/prize-value";

// 04.3-15 Task 1 ④ — 수령자 목록 판정 · 파기 대상 판정(순수). 경계는 과세최저한 50,000원(소득세법 제84조제3호).

describe("CERT_RRN_EXEMPT_PRIZE_VALUE_KRW", () => {
  it("50,000원이다", () => {
    expect(CERT_RRN_EXEMPT_PRIZE_VALUE_KRW).toBe(50_000);
  });
});

describe("certPrizeListed — 1개 가액 × 1 > 50,000이면 수령자 목록에 오른다", () => {
  it("50,000은 오르지 않는다", () => {
    expect(certPrizeListed(50_000)).toBe(false);
  });

  it("50,001은 오른다", () => {
    expect(certPrizeListed(50_001)).toBe(true);
  });
});

describe("certRrnPurgeTarget — 가액 × 수량 ≤ 50,000이면 파기 대상", () => {
  it("50,001 × 1은 아니다", () => {
    expect(certRrnPurgeTarget(50_001, 1)).toBe(false);
  });

  it("50,000 × 1은 파기 대상", () => {
    expect(certRrnPurgeTarget(50_000, 1)).toBe(true);
  });

  it("25,000 × 2 = 50,000은 파기 대상", () => {
    expect(certRrnPurgeTarget(25_000, 2)).toBe(true);
  });

  it("25,001 × 2 = 50,002는 아니다", () => {
    expect(certRrnPurgeTarget(25_001, 2)).toBe(false);
  });

  it("곱이 안전 정수를 넘어도 정수 비교로 맞다(999,999,999,999 × 500)", () => {
    expect(certRrnPurgeTarget(999_999_999_999, 500)).toBe(false);
  });
});
