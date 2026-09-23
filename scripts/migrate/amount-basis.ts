// Phase 4 Task 2 ④ · D-73 — 옛 금액 한 칸이 공급가인지 합계(부가세 포함)인지
// 판정하는 순수 함수. 지급액÷견적가 비율이 1(공급가)이나 1+부가세율(합계)에
// 근접한지만 본다. 부가세율·근접 허용 폭은 모듈 상수로 빼 Task 3 사람
// 체크포인트(표본 20~30건 대조)가 값을 바꿀 수 있게 한다. 확신하지 못하는
// 행은 "unknown"으로 남기고 추정하지 않는다(Eng OV-7) — 0 나눗셈·null·음수도
// 던지지 않고 "unknown"으로 떨어뜨린다.

export const VAT_RATE = 0.1;
export const AMOUNT_BASIS_TOLERANCE = 0.02;

export type AmountBasis = "supply" | "total" | "unknown";

export interface AmountBasisInput {
  quoteAmount: number;
  paidAmount: number | null;
}

// 부동소수점 나눗셈 오차(예: 1_020_000/1_000_000이 1.02가 아니라
// 1.0200000000000001로 나옴)가 허용 폭 경계값을 오판정하지 않도록 아주
// 작은 여유(EPSILON)를 더한다 — 실제 금액 비율 판정에 영향을 주지 않는
// 크기다.
const RATIO_COMPARISON_EPSILON = 1e-9;

function isNearRatio(ratio: number, target: number, tolerance: number): boolean {
  return Math.abs(ratio - target) <= tolerance + RATIO_COMPARISON_EPSILON;
}

export function classifyAmountBasis({ quoteAmount, paidAmount }: AmountBasisInput): AmountBasis {
  if (paidAmount === null) return "unknown";
  if (quoteAmount === 0) return "unknown";

  const ratio = paidAmount / quoteAmount;

  if (isNearRatio(ratio, 1, AMOUNT_BASIS_TOLERANCE)) return "supply";
  if (isNearRatio(ratio, 1 + VAT_RATE, AMOUNT_BASIS_TOLERANCE)) return "total";
  return "unknown";
}
