import { describe, expect, it, vi } from "vitest";
import {
  round,
  toKrw,
  moneyFromRow,
  quoteAmount,
  profit,
  splitWithRemainder,
  grossFromTotal,
  moneyToColumns,
  normalizeMoneyInput,
  MoneyInputError,
  quoteAmountWithinBound,
  KRW_COLUMN_MIN,
  KRW_COLUMN_MAX,
  type Money,
  type MoneyInput,
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

  // bigint 전환(0016) 뒤 원화 환산이 약 90억(2^53 / 1e6)을 넘을 수 있다 — 정수로 올린 두 수의 곱이 JS 안전 정수를
  // 넘어도 반올림 경계에서 틀리지 않는다. 정확한 곱 10,596,128,621,499,999 / 1e6 = …621.499999 → 621.
  it("곱이 안전 정수를 넘는 큰 USD 환산도 .5 경계 바로 아래를 올리지 않는다 — 7,983,953.79 × 1,327.1781은 10,596,128,621", () => {
    expect(toKrw({ currency: "USD", amount: 7_983_953.79, fxRate: 1327.1781 })).toBe(10_596_128_621);
  });

  it("안전 정수를 넘는 곱에서도 음수는 Math.round처럼 반올림한다 — −7,983,953.79 × 1,327.1781은 −10,596,128,621", () => {
    expect(toKrw({ currency: "USD", amount: -7_983_953.79, fxRate: 1327.1781 })).toBe(-10_596_128_621);
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
      undefined,
    );
  });

  it("rememberFxRate(KRW, ...)는 아무것도 저장하지 않는다 — KRW는 갱신 대상이 아니다", async () => {
    const upsertSimpleValue = vi.fn();
    await rememberFxRate("KRW", 1, { upsertSimpleValue });
    expect(upsertSimpleValue).not.toHaveBeenCalled();
  });
});

// 04-40(엔지니어링 리뷰 B §2 · PR #38 알려진 문제) — 금액 입력 정규화 한 규칙. 부호는 호출자 몫이다.
describe("normalizeMoneyInput", () => {
  function rejection(input: MoneyInput): MoneyInputError {
    try {
      normalizeMoneyInput(input);
    } catch (error) {
      if (error instanceof MoneyInputError) return error;
      throw error;
    }
    throw new Error("거부되지 않았다");
  }

  it("KRW는 요청의 환율을 버리고 1로 고정한다", () => {
    expect(normalizeMoneyInput({ currency: "KRW", amount: 5000, fxRate: 1350 })).toEqual({ currency: "KRW", amount: 5000, fxRate: 1 });
  });

  it("USD 정상 입력은 그대로다", () => {
    expect(normalizeMoneyInput({ currency: "USD", amount: 100, fxRate: 1350 })).toEqual({ currency: "USD", amount: 100, fxRate: 1350 });
    expect(normalizeMoneyInput({ currency: "USD", amount: 4400.1, fxRate: 1318.1818 })).toEqual({ currency: "USD", amount: 4400.1, fxRate: 1318.1818 });
  });

  it("USD 환율 0 · 음수는 fx-rate — 「환율 0 이하 · 환율 수정」", () => {
    for (const fxRate of [0, -1]) {
      const error = rejection({ currency: "USD", amount: 100, fxRate });
      expect(error.reason).toBe("fx-rate");
      expect(error.message).toBe("환율 0 이하 · 환율 수정");
    }
  });

  it("환율 칸을 비운 요청(0 또는 NaN)은 0 환율로 저장되지 않고 fx-rate 또는 not-finite로 거부된다", () => {
    expect(["fx-rate", "not-finite"]).toContain(rejection({ currency: "USD", amount: 100, fxRate: 0 }).reason);
    expect(["fx-rate", "not-finite"]).toContain(rejection({ currency: "USD", amount: 100, fxRate: Number.NaN }).reason);
  });

  it("원화 환산이 금액 범위 밖이면 range — 양·음 경계와 USD 환산(1.35조)", () => {
    expect(rejection({ currency: "KRW", amount: 1_000_000_000_000, fxRate: 1 }).reason).toBe("range");
    expect(rejection({ currency: "KRW", amount: -1_000_000_000_001, fxRate: 1 }).reason).toBe("range");
    const usd = rejection({ currency: "USD", amount: 1_000_000_000, fxRate: 1350 });
    expect(usd.reason).toBe("range");
    expect(usd.message).toBe("금액이 상한을 넘습니다 · 999,999,999,999원 이하");
    expect(normalizeMoneyInput({ currency: "KRW", amount: KRW_COLUMN_MAX, fxRate: 1 }).amount).toBe(KRW_COLUMN_MAX);
    expect(normalizeMoneyInput({ currency: "KRW", amount: KRW_COLUMN_MIN, fxRate: 1 }).amount).toBe(KRW_COLUMN_MIN);
  });

  it("NaN · Infinity 금액은 not-finite — 「숫자 형식 오류 · 12,400,000처럼」", () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = rejection({ currency: "KRW", amount, fxRate: 1 });
      expect(error.reason).toBe("not-finite");
      expect(error.message).toBe("숫자 형식 오류 · 12,400,000처럼");
    }
  });

  it("음수 금액은 통과한다(부호 규칙은 각 쓰기 경로의 몫)", () => {
    expect(normalizeMoneyInput({ currency: "KRW", amount: -120_000, fxRate: 1 })).toEqual({ currency: "KRW", amount: -120_000, fxRate: 1 });
  });

  it("외화 금액 소수 3자리는 precision — 「외화는 소수 2자리까지」, 환율 소수 5자리는 「환율은 소수 4자리까지」", () => {
    const amount = rejection({ currency: "USD", amount: 4400.005, fxRate: 1350 });
    expect(amount.reason).toBe("precision");
    expect(amount.message).toBe("외화는 소수 2자리까지");
    const fx = rejection({ currency: "USD", amount: 4400.12, fxRate: 1318.18185 });
    expect(fx.reason).toBe("precision");
    expect(fx.message).toBe("환율은 소수 4자리까지");
  });

  it("(SF-1) 환율이 fx_rate numeric(12,4) 밖(≥ 10^8)이면 range — 원화 환산이 범위 안이어도 PG 22003으로 새지 않는다", () => {
    const fx = rejection({ currency: "USD", amount: 0, fxRate: 1_000_000_000 });
    expect(fx.reason).toBe("range");
    expect(fx.message).toBe("환율 상한 초과 · 환율 수정");
    expect(rejection({ currency: "USD", amount: 0, fxRate: 100_000_000 }).reason).toBe("range");
    expect(normalizeMoneyInput({ currency: "USD", amount: 0, fxRate: 99_999_999.9999 }).fxRate).toBe(99_999_999.9999);
  });

  it("(SF-1) 외화 금액이 foreign_amount numeric(14,2) 밖(|x| ≥ 10^12)이면 range", () => {
    const amount = rejection({ currency: "USD", amount: 1_000_000_000_000, fxRate: 0.0001 });
    expect(amount.reason).toBe("range");
    expect(amount.message).toBe("외화 금액 상한 초과 · 금액 수정");
    expect(rejection({ currency: "USD", amount: -1_000_000_000_000, fxRate: 0.0001 }).reason).toBe("range");
    expect(normalizeMoneyInput({ currency: "USD", amount: 999_999_999_999.99, fxRate: 0.0001 }).amount).toBe(999_999_999_999.99);
  });

  it("moneyToColumns가 먼저 정규화한다 — KRW 위조 환율 1350은 원화 5000 · 환율 1.0000으로", () => {
    const columns = moneyToColumns({ currency: "KRW", amount: 5000, fxRate: 1350 });
    expect(columns.amountKrw).toBe(5000);
    expect(columns.fxRate).toBe("1.0000");
    expect(() => moneyToColumns({ currency: "USD", amount: 100, fxRate: 0 })).toThrow(MoneyInputError);
  });
});

// 04-40(DR-9) — 수량 × 단가로 계산한 견적가가 quote_amount_krw 금액 범위 안인가(quoteAmount와 같은 계산).
describe("quoteAmountWithinBound", () => {
  const krw = (amount: number): MoneyInput => ({ currency: "KRW", amount, fxRate: 1 });

  it("금액 범위 상수가 −1,000,000,000,000 / 999,999,999,999(1조 원 미만)이다", () => {
    expect(KRW_COLUMN_MIN).toBe(-1_000_000_000_000);
    expect(KRW_COLUMN_MAX).toBe(999_999_999_999);
  });

  it("수량 1 × 단가 999,999,999,999는 참 · 1,000,000,000,000(정규화 전 값)은 거짓", () => {
    expect(quoteAmountWithinBound(1, krw(999_999_999_999))).toBe(true);
    expect(quoteAmountWithinBound(1, krw(1_000_000_000_000))).toBe(false);
  });

  it("수량 3 × 단가 5,000억은 각각 상한 안이어도 곱이 1.5조라 거짓", () => {
    expect(quoteAmountWithinBound(3, krw(500_000_000_000))).toBe(false);
  });

  it("소수 수량은 quoteAmount의 원화 반올림 뒤 값으로 판정한다 — 단가는 상한 안이고 38.33 × 26,089,225,150만 반올림해 1조가 되어 거짓, × 26,089,225,149 참", () => {
    expect(quoteAmountWithinBound(38.33, krw(26_089_225_150))).toBe(false);
    expect(quoteAmountWithinBound(38.33, krw(26_089_225_149))).toBe(true);
  });

  it("USD 수량 2 × USD 400,000,000 @1,350(원화 1.08조)은 거짓 · 수량 0은 기본 1이라 참", () => {
    expect(quoteAmountWithinBound(2, { currency: "USD", amount: 400_000_000, fxRate: 1350 })).toBe(false);
    expect(quoteAmountWithinBound(0, krw(1_000_000))).toBe(true);
  });
});
