import { describe, expect, it } from "vitest";
import { AMOUNT_BASIS_TOLERANCE, VAT_RATE, classifyAmountBasis } from "@/scripts/migrate/amount-basis";

// Phase 4 Task 2 ⑥ · D-73 — classifyAmountBasis 경계 케이스 표. 덤프 없이
// 도는 순수 함수 테스트다. 부가세율·근접 허용 폭이 모듈 상수로 빠져 있어
// Task 3 사람 체크포인트가 값을 바꿔도 이 표의 기대값 자체(공급가/합계/
// 불명 판정 방향)는 그대로 유지된다.
describe("classifyAmountBasis", () => {
  it.each([
    ["부가세 포함 비율(1.1) 근접 — 합계", 1_000_000, 1_100_000, "total"],
    ["비율 1 근접 — 공급가", 1_000_000, 1_000_000, "supply"],
    ["어느 쪽에도 근접하지 않음(비율 1.037) — 불명", 1_000_000, 1_037_000, "unknown"],
  ] as const)("%s", (_label, quoteAmount, paidAmount, expected) => {
    expect(classifyAmountBasis({ quoteAmount, paidAmount })).toBe(expected);
  });

  it("견적가가 0이면 나누지 않고 불명으로 판정한다", () => {
    expect(classifyAmountBasis({ quoteAmount: 0, paidAmount: 500_000 })).toBe("unknown");
  });

  it("지급액이 null이면 불명으로 판정한다", () => {
    expect(classifyAmountBasis({ quoteAmount: 1_000_000, paidAmount: null })).toBe("unknown");
  });

  it("음수 견적가·지급액도 던지지 않고 판정값을 돌려준다", () => {
    expect(() => classifyAmountBasis({ quoteAmount: -1_000_000, paidAmount: -1_000_000 })).not.toThrow();
    expect(() => classifyAmountBasis({ quoteAmount: -1_000_000, paidAmount: 500_000 })).not.toThrow();
    expect(classifyAmountBasis({ quoteAmount: -1_000_000, paidAmount: -1_000_000 })).toBe("supply");
  });

  it("같은 입력에 항상 같은 결과를 낸다 — 난수·시간 의존 없음", () => {
    const input = { quoteAmount: 1_000_000, paidAmount: 1_100_000 } as const;
    expect(classifyAmountBasis(input)).toBe(classifyAmountBasis(input));
  });

  it("공급가 근접 허용 폭 경계 안쪽은 공급가로 판정한다", () => {
    const boundaryPaid = 1_000_000 * (1 + AMOUNT_BASIS_TOLERANCE);
    expect(classifyAmountBasis({ quoteAmount: 1_000_000, paidAmount: boundaryPaid })).toBe("supply");
  });

  it("합계 근접 허용 폭 경계 바깥쪽은 불명으로 판정한다", () => {
    const justOutside = 1_000_000 * (1 + VAT_RATE + AMOUNT_BASIS_TOLERANCE) + 1_000;
    expect(classifyAmountBasis({ quoteAmount: 1_000_000, paidAmount: justOutside })).toBe("unknown");
  });
});
