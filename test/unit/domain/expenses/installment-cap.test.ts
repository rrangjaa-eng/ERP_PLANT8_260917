import { describe, expect, it } from "vitest";
import { moneyFromRow, remainingForInstallments, type Money } from "@/domain/money";
import { expenseLineDoor } from "@/domain/expenses/line-door";

// 05-14 Task 2 — 회차 상한(RESEARCH Open Q4 RESOLVED): 줄 통화 · 앞 문서 통화 · 이번 통화가 모두 같은 외화면 원래
// 통화로, 하나라도 다르면 원화로 비교한다.

function krw(amount: number): Money {
  return moneyFromRow({ currency: "KRW", foreignAmount: null, fxRate: "1.0000", amountKrw: amount });
}

function usd(amount: number, fxRate: number): Money {
  return moneyFromRow({ currency: "USD", foreignAmount: amount.toFixed(2), fxRate: fxRate.toFixed(4), amountKrw: Math.round(amount * fxRate) });
}

describe("remainingForInstallments — 원화 비교", () => {
  it("KRW 줄 실행가 10,000,000 · 앞 문서 6,000,000이면 남음 4,000,000이고 이번 4,000,001은 넘는다", () => {
    const cap = remainingForInstallments(krw(10_000_000), [krw(6_000_000)], { currency: "KRW", amount: 4_000_001, fxRate: 1 });
    expect(cap.basis).toBe("krw");
    expect(cap.remaining.amountKrw).toBe(4_000_000);
    expect(cap.exceeds).toBe(true);
  });

  it("KRW 줄에서 남은 실행가와 같은 4,000,000은 넘지 않는다", () => {
    const cap = remainingForInstallments(krw(10_000_000), [krw(6_000_000)], { currency: "KRW", amount: 4_000_000, fxRate: 1 });
    expect(cap.exceeds).toBe(false);
  });

  it("USD 줄인데 앞 문서 하나가 KRW면 원화로 비교한다(basis krw)", () => {
    // 실행가 USD 10,000 @1,300 = 13,000,000원 · 앞 문서 KRW 7,800,000 → 남음 5,200,000원. 이번 USD 4,000 @1,400 = 5,600,000원.
    const cap = remainingForInstallments(usd(10_000, 1_300), [krw(7_800_000)], { currency: "USD", amount: 4_000, fxRate: 1_400 });
    expect(cap.basis).toBe("krw");
    expect(cap.remaining).toMatchObject({ currency: "KRW", amountKrw: 5_200_000 });
    expect(cap.exceeds).toBe(true);
  });
});

describe("remainingForInstallments — 원래 통화 비교", () => {
  it("USD 줄 · 앞 문서 USD 6,000(1,300) · 이번 USD 4,000(1,400)은 원화 합이 실행가를 넘어도 넘지 않는다(basis foreign)", () => {
    const cap = remainingForInstallments(usd(10_000, 1_300), [usd(6_000, 1_300)], { currency: "USD", amount: 4_000, fxRate: 1_400 });
    expect(cap.basis).toBe("foreign");
    expect(cap.remaining).toMatchObject({ currency: "USD", amount: 4_000 });
    expect(cap.exceeds).toBe(false);
  });

  it("USD 4,000.01은 남은 USD 4,000을 넘는다", () => {
    const cap = remainingForInstallments(usd(10_000, 1_300), [usd(6_000, 1_300)], { currency: "USD", amount: 4_000.01, fxRate: 1_400 });
    expect(cap.exceeds).toBe(true);
  });

  it("환율이 올라 앞 문서 원화 합이 실행가 원화를 넘어도 남은 USD 1,000이 있으면 남은 원화는 0보다 크고 줄의 문은 열려 있다", () => {
    // 실행가 13,000,000원 · 앞 문서 7,800,000 + 5,700,000(USD 3,000 @1,900) = 13,500,000원 — 원화로는 이미 넘었지만 USD는 1,000 남음.
    const others = [usd(6_000, 1_300), usd(3_000, 1_900)];
    const cap = remainingForInstallments(usd(10_000, 1_300), others);
    expect(cap.basis).toBe("foreign");
    expect(cap.remaining.amount).toBe(1_000);
    expect(cap.remaining.amountKrw).toBeGreaterThan(0);

    const door = expenseLineDoor({
      line: { lineKind: "quote", cancelled: false, vendorId: "vendor", execution: usd(10_000, 1_300) },
      numbered: others.map((supply, i) => ({ id: `doc-${i}`, number: `26001-000${i + 1}`, installment: true, supply })),
    });
    expect(door.state).toBe("open");
    expect(door.nextInstallmentSeq).toBe(3);
  });

  it("남은 USD가 0이면 줄의 문이 닫힌다", () => {
    const others = [usd(6_000, 1_300), usd(4_000, 1_100)];
    const door = expenseLineDoor({
      line: { lineKind: "quote", cancelled: false, vendorId: "vendor", execution: usd(10_000, 1_300) },
      numbered: others.map((supply, i) => ({ id: `doc-${i}`, number: `26001-000${i + 1}`, installment: true, supply })),
    });
    expect(door.state).toBe("closed");
  });
});
