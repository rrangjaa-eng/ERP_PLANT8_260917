import { describe, expect, it, vi } from "vitest";
import {
  round,
  toKrw,
  moneyFromRow,
  quoteAmount,
  profit,
  splitWithRemainder,
  grossFromTotal,
  type Money,
} from "@/domain/money";
import { recentFxRate, rememberFxRate } from "@/domain/money/currency";

// Phase 4 Task 2 ⑫ — FX-01(반올림 4종 × 절사 표 기반), splitWithRemainder·
// grossFromTotal은 이 플랜에 없다(04-02의 몫, `<behavior>`가 요구하는 다섯
// 함수만 여기서 단언한다).
describe("round", () => {
  it("단위 1 · round는 12345.6 → 12346", () => {
    expect(round(12345.6, 1, "round")).toBe(12346);
  });

  it("단위 10 · truncate는 12345.6 → 12340", () => {
    expect(round(12345.6, 10, "truncate")).toBe(12340);
  });

  it("단위 10 · ceil은 12341 → 12350", () => {
    expect(round(12341, 10, "ceil")).toBe(12350);
  });
});

describe("toKrw", () => {
  it("USD 환산은 정수 원 하나이고, 같은 입력을 두 번 부르면 같은 값이다", () => {
    const input = { currency: "USD" as const, amount: 100, fxRate: 1318.1818 };
    const first = toKrw(input);
    const second = toKrw(input);
    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBe(second);
  });

  it("KRW는 예외 경로가 아니라 환율 1인 Money다 — amount 그대로 5000이 나온다", () => {
    expect(toKrw({ currency: "KRW", amount: 5000, fxRate: 1 })).toBe(5000);
  });

  it("부동소수점 오차로 내려가지 않는다 — 0.35 × 1350은 473", () => {
    expect(toKrw({ currency: "USD", amount: 0.35, fxRate: 1350 })).toBe(473);
  });
});

describe("moneyFromRow", () => {
  it("fx_rate 문자열 '1318.1818'을 주면 숫자 1318.1818이 나온다 — 이 함수 밖에서는 문자열→숫자 변환이 없다", () => {
    const money = moneyFromRow({
      currency: "USD",
      foreignAmount: "4400.00",
      fxRate: "1318.1818",
      amountKrw: 5799999,
    });
    expect(money.fxRate).toBe(1318.1818);
    expect(money.amount).toBe(4400);
    expect(money.amountKrw).toBe(5799999);
  });

  it("foreignAmount가 null이면(원화 행) amount는 amountKrw와 같다 — KRW도 이 함수 하나를 거친다", () => {
    const money = moneyFromRow({ currency: "KRW", foreignAmount: null, fxRate: "1.0000", amountKrw: 5000 });
    expect(money.amount).toBe(5000);
    expect(money.fxRate).toBe(1);
  });
});

describe("quoteAmount", () => {
  it("수량 3 · 단가 1,200,000 → 3,600,000", () => {
    const unitPrice: Money = { __brand: "Money", currency: "KRW", amount: 1_200_000, fxRate: 1, amountKrw: 1_200_000 };
    expect(quoteAmount(3, unitPrice)).toBe(3_600_000);
  });

  it("수량을 비우면 기본 1이 적용돼 단가와 같다(D-63)", () => {
    const unitPrice: Money = { __brand: "Money", currency: "KRW", amount: 1_200_000, fxRate: 1, amountKrw: 1_200_000 };
    expect(quoteAmount(undefined, unitPrice)).toBe(1_200_000);
    expect(quoteAmount(0, unitPrice)).toBe(1_200_000);
  });
});

describe("profit", () => {
  it("견적가 3,600,000 · 실행가 2,800,000 → 800,000", () => {
    const execution: Money = { __brand: "Money", currency: "KRW", amount: 2_800_000, fxRate: 1, amountKrw: 2_800_000 };
    expect(profit(3_600_000, execution)).toBe(800_000);
  });

  it("실행가가 음수면(EXP-14) 차익이 견적가보다 커진다", () => {
    const execution: Money = { __brand: "Money", currency: "KRW", amount: -100_000, fxRate: 1, amountKrw: -100_000 };
    expect(profit(3_600_000, execution)).toBe(3_700_000);
  });
});

// 04-02 Task 1 ① — 분할 시 마지막 회차가 나머지를 흡수해 합계가 정확히
// 원금과 같다(04-RESEARCH.md Pattern 2).
describe("splitWithRemainder", () => {
  it("1,000,000을 3회차로 나누면 세 값의 합이 정확히 1,000,000이고 마지막 회차가 나머지를 흡수한다", () => {
    const parts = splitWithRemainder(1_000_000, 3);
    expect(parts).toEqual([333_333, 333_333, 333_334]);
    expect(parts.reduce((sum, value) => sum + value, 0)).toBe(1_000_000);
  });

  it("0을 나누면 전부 0이다", () => {
    expect(splitWithRemainder(0, 3)).toEqual([0, 0, 0]);
  });

  it("1을 1회차로 나누면 [10]이다", () => {
    expect(splitWithRemainder(10, 1)).toEqual([10]);
  });

  it("나누어떨어지는 수는 나머지 없이 균등하게 나뉜다", () => {
    expect(splitWithRemainder(900, 3)).toEqual([300, 300, 300]);
  });
});

// 04-02 Task 1 ① — 합계(포함세)에서 공급가액을 역산한다. 재계산 합계가
// 원래 입력과 어긋나도 이 함수는 조정하지 않는다(구조적 1원 오차,
// 04-RESEARCH.md Pattern 2 "Rounding pitfall").
describe("grossFromTotal", () => {
  it("52,800,000(부가세 10% 포함) → 공급가액 48,000,000", () => {
    expect(grossFromTotal(52_800_000, 0.1, 1, "round")).toBe(48_000_000);
  });

  it("정수 하나를 돌려준다 — 재계산 합계가 입력과 어긋나도 조정하지 않는다", () => {
    // 100,005원(절사 방식)을 부가세 10%로 역산하면 90,913원이 나오고,
    // 그 값에 다시 10% 부가세를 절사해 더하면 100,004원으로 1원이
    // 어긋난다 — grossFromTotal은 이 어긋남을 스스로 고치지 않는다.
    const gross = grossFromTotal(100_005, 0.1, 1, "truncate");
    expect(gross).toBe(90_913);
    expect(Number.isInteger(gross)).toBe(true);

    const recomputedVat = round(gross * 0.1, 1, "truncate");
    const recomputedTotal = gross + recomputedVat;
    expect(recomputedTotal).not.toBe(100_005);
    expect(recomputedTotal).toBe(100_004);
  });
});

// 04-02 Task 1 ③ — 통화별 최근 환율 설정 키. KRW는 예외 경로가 아니라
// 환율 1인 Money다 — 키를 만들지 않고 항상 1을 돌려준다(D-71).
describe("recentFxRate / rememberFxRate", () => {
  it("KRW는 설정을 읽지 않고 항상 1이다", async () => {
    const getSettingValue = vi.fn();
    const rate = await recentFxRate("KRW", { getSettingValue });
    expect(rate).toBe(1);
    expect(getSettingValue).not.toHaveBeenCalled();
  });

  it("USD는 설정 값을 그대로 돌려준다", async () => {
    const getSettingValue = vi.fn().mockResolvedValue(1318.1818);
    const rate = await recentFxRate("USD", { getSettingValue });
    expect(rate).toBe(1318.1818);
  });

  it("rememberFxRate(USD, ...) 뒤 저장 함수가 그 값으로 불린다", async () => {
    const upsertSimpleValue = vi.fn().mockResolvedValue(undefined);
    await rememberFxRate("USD", 1318.1818, { upsertSimpleValue });
    expect(upsertSimpleValue).toHaveBeenCalledWith(
      expect.anything(),
      "fx.recent_rate.USD",
      1318.1818,
      expect.anything(),
    );
  });

  it("rememberFxRate(KRW, ...)는 아무것도 저장하지 않는다 — KRW는 갱신 대상이 아니다", async () => {
    const upsertSimpleValue = vi.fn();
    await rememberFxRate("KRW", 1, { upsertSimpleValue });
    expect(upsertSimpleValue).not.toHaveBeenCalled();
  });
});
