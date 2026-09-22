import { describe, expect, it } from "vitest";
import { round, toKrw, moneyFromRow, quoteAmount, profit, type Money } from "@/domain/money";

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
