import type { Currency } from "@/domain/money/currency";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { formatKrw } from "@/lib/format-number";

export type { Currency } from "@/domain/money/currency";

// Phase 4 — 금액 모델 단일 지점. `plant8/money-boundary` 린트가 이 모듈
// 밖에서 `Money` 타입 산술을 막는다(eslint/rules/money-boundary.mjs). 문자열
// →숫자 변환은 `moneyFromRow` 안에서만 한다 — 리포지토리 반환 타입에 실린
// numeric 컬럼의 raw 문자열이 이 함수를 거치지 않고 domain 밖으로 나가지
// 않는다(04-RESEARCH.md Pitfall 4).
//
// KRW는 예외 경로가 아니라 **환율 1인 Money**다 — `money.test.ts`가 이것을
// 계약 테스트로 고정한다(플랜 `assumption_delta_decision`).
export type Money = {
  readonly __brand: "Money";
  currency: Currency;
  /** 표시용 금액 — 원화는 정수 원, 외화는 소수 2자리(서버가 반환한 그대로). */
  amount: number;
  /** 소수 4자리. KRW는 항상 1. */
  fxRate: number;
  /** 원화 환산액 — 정수 원. 합계·손익은 전부 이 값으로만 더한다. */
  amountKrw: number;
};

// 아직 amountKrw가 계산되지 않은 입력 — `toKrw`/`moneyToColumns`가 받는다.
export type MoneyInput = { currency: Currency; amount: number; fxRate: number };

export type RoundingUnit = 1 | 10;
export type RoundingMethod = "truncate" | "round" | "ceil";

// CEO 리뷰 D4 — 반올림은 서버 단일 함수 하나. 단위(1원·10원)와 방식(절사·
// 반올림·올림)은 코드표 세금 규칙(04-02)·설정이 고른다. 이 함수는 그 셋을
// 그대로 받아 적용만 한다.
export function round(value: number, unit: RoundingUnit, method: RoundingMethod): number {
  const scaled = value / unit;
  let steps: number;
  switch (method) {
    case "truncate":
      steps = Math.trunc(scaled);
      break;
    case "round":
      steps = Math.round(scaled);
      break;
    case "ceil":
      steps = Math.ceil(scaled);
      break;
  }
  return steps * unit;
}

// 통화·외화 금액·환율에서 원화 환산액(정수 원)을 계산한다. KRW는 fxRate가
// 항상 1이라 amount 그대로 반올림된 값이 나온다 — 예외 분기가 없다.
export function toKrw(input: MoneyInput): number {
  // amount는 소수 2자리, fxRate는 소수 4자리로 저장된다 — 정수로 올려
  // 곱한 뒤 나누면 부동소수점 오차(0.35×1350=472.49999999999994 등) 없이
  // 정확한 값이 나온다.
  const scaledAmount = Math.round(input.amount * 100);
  const scaledRate = Math.round(input.fxRate * 10000);
  const product = scaledAmount * scaledRate;
  if (Number.isSafeInteger(product)) return round(product / 1e6, 1, "round");
  // 원화 금액이 bigint(0016)라 곱이 2^53을 넘을 수 있다(원화 약 90억 초과) — double은 끝자리를 잃어 .5 경계를
  // 틀리게 올린다. BigInt로 정확히 나눈 뒤 Math.round처럼(반은 +∞ 쪽) 반올림한다.
  const million = BigInt(1_000_000);
  const exact = BigInt(scaledAmount) * BigInt(scaledRate);
  let quotient = exact / million;
  let remainder = exact % million;
  if (remainder < BigInt(0)) {
    quotient -= BigInt(1);
    remainder += million;
  }
  return Number(remainder * BigInt(2) >= million ? quotient + BigInt(1) : quotient);
}

// 04-40(엔지니어링 리뷰 B §2 · DR-9) — 원화 금액 범위. 금액 입력 범위와 계산 견적가 상한이 같은 두 상수를 쓴다.
// 원화 금액 컬럼은 bigint(0016)라 열 한계가 아니라 업무 상한이다 — 1조 원 미만(사용자 결정). 이 범위면 여러 줄을
// 더한 목록 합계도 bigint·2^53 안에 머문다. 하한은 옛 integer 범위처럼 한 칸 넓어 차익 상한 판정이 살아 있다.
export const KRW_COLUMN_MIN = -1_000_000_000_000;
export const KRW_COLUMN_MAX = 999_999_999_999;
// 04-40 검토 SF-1 — 외화 금액 numeric(14,2) · 환율 numeric(12,4)의 정수부 한계(db/schema/money-columns.ts).
const FOREIGN_AMOUNT_COLUMN_LIMIT = 1e12;
const FX_RATE_COLUMN_LIMIT = 1e8;

// UI-SPEC rev 5 Copywriting `Error — 셀(금액 범위)` · `Error — 셀(숫자 자리)` · `Error — 셀(형식)`.
export type MoneyInputErrorReason = "fx-rate" | "range" | "not-finite" | "precision";

export class MoneyInputError extends UserFacingError {
  constructor(
    readonly reason: MoneyInputErrorReason,
    message: string,
    readonly field: "amount" | "fxRate" = "amount",
  ) {
    super(message);
  }
}

export function withinKrwColumn(value: number): boolean {
  return value >= KRW_COLUMN_MIN && value <= KRW_COLUMN_MAX;
}

function hasAtMostDecimals(value: number, digits: number): boolean {
  const scaled = value * 10 ** digits;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

// 04-40 — 금액 입력 한 규칙: KRW는 요청 환율을 버리고 1, USD는 환율 > 0 · 외화 소수 2자리 · 환율 소수 4자리, 원화 환산은
// 정수 컬럼 범위 안. 부호는 보지 않는다(각 쓰기 경로의 몫). 조용히 반올림하지 않고 거부한다.
export function normalizeMoneyInput(input: MoneyInput): MoneyInput {
  if (!Number.isFinite(input.amount)) throw new MoneyInputError("not-finite", "숫자 형식 오류 · 12,400,000처럼");
  const normalized: MoneyInput =
    input.currency === "KRW" ? { currency: "KRW", amount: input.amount, fxRate: 1 } : { currency: input.currency, amount: input.amount, fxRate: input.fxRate };
  if (normalized.currency !== "KRW") {
    if (!Number.isFinite(normalized.fxRate) || normalized.fxRate <= 0) {
      throw new MoneyInputError("fx-rate", "환율 0 이하 · 환율 수정", "fxRate");
    }
    if (!hasAtMostDecimals(normalized.amount, 2)) throw new MoneyInputError("precision", "외화는 소수 2자리까지");
    if (!hasAtMostDecimals(normalized.fxRate, 4)) throw new MoneyInputError("precision", "환율은 소수 4자리까지", "fxRate");
    if (normalized.fxRate >= FX_RATE_COLUMN_LIMIT) throw new MoneyInputError("range", "환율 상한 초과 · 환율 수정", "fxRate");
    if (Math.abs(normalized.amount) >= FOREIGN_AMOUNT_COLUMN_LIMIT) throw new MoneyInputError("range", "외화 금액 상한 초과 · 금액 수정");
  }
  if (!withinKrwColumn(toKrw(normalized))) {
    throw new MoneyInputError("range", `금액 상한 초과 · ${formatKrw(KRW_COLUMN_MAX)}원 이하`);
  }
  return normalized;
}

// Drizzle numeric 컬럼이 돌려주는 문자열을 숫자로 바꾸는 **유일한 지점**.
// foreignAmount가 null이면(원화 행) amount는 amountKrw와 같다 — 통화가
// 둘로 갈리지 않고 KRW도 이 함수 하나를 거친다.
export function moneyFromRow(row: {
  currency: string;
  foreignAmount: string | null;
  fxRate: string;
  amountKrw: number;
}): Money {
  const fxRate = Number(row.fxRate);
  const amount = row.foreignAmount !== null ? Number(row.foreignAmount) : row.amountKrw;
  return {
    __brand: "Money",
    currency: row.currency as Currency,
    amount,
    fxRate,
    amountKrw: row.amountKrw,
  };
}

// Money(또는 아직 브랜드되지 않은 MoneyInput)를 저장용 컬럼 값으로 되돌린다
// — numeric 컬럼은 문자열을 받으므로 여기서 숫자→문자열 변환도 함께 한다
// (역시 이 모듈 밖에서 하지 않는다). KRW는 foreignAmount를 null로 둔다.
export function moneyToColumns(input: MoneyInput): {
  currency: Currency;
  foreignAmount: string | null;
  fxRate: string;
  amountKrw: number;
} {
  const money = normalizeMoneyInput(input);
  return {
    currency: money.currency,
    foreignAmount: money.currency === "KRW" ? null : money.amount.toFixed(2),
    fxRate: money.fxRate.toFixed(4),
    amountKrw: toKrw(money),
  };
}

// D-63: 견적가 = 수량(기본 1) × 단가. 서버 계산·저장, 브라우저 계산값은
// 버린다(PROJ-02). 수량이 비었거나 0 이하이면 기본 1이 적용돼 단가와 같다.
export function quoteAmount(quantity: number | null | undefined, unitPrice: Money): number {
  return quoteAmountFromKrw(quantity, unitPrice.amountKrw);
}

function quoteAmountFromKrw(quantity: number | null | undefined, unitPriceKrw: number): number {
  const qty = quantity && quantity > 0 ? quantity : 1;
  return round(qty * unitPriceKrw, 1, "round");
}

// 04-40(DR-9) — 수량 × 단가로 계산한 견적가(quoteAmount와 같은 계산)가 quote_amount_krw 컬럼 범위 안인가. 서버 전용
// import가 없어 화면도 같은 함수를 부른다.
export function quoteAmountWithinBound(quantity: number | null | undefined, unitPrice: MoneyInput): boolean {
  return withinKrwColumn(quoteAmountFromKrw(quantity, toKrw(unitPrice)));
}

// 차익 = 견적가 − 실행가. 실행가가 음수면(EXP-14 회수·환불) 차익이 견적가보다
// 커진다 — 별도 분기 없이 뺄셈 그대로다.
export function profit(quoteAmountKrw: number, execution: Money): number {
  return quoteAmountKrw - execution.amountKrw;
}

// 04-02 Task 1 ① — 분할 시 마지막 회차가 나머지를 흡수해 합계가 정확히
// 원금과 같다(04-RESEARCH.md Pattern 2). 반올림 오차가 누적되지 않도록
// 정수 나눗셈만 쓴다.
export function splitWithRemainder(totalKrw: number, count: number): number[] {
  const base = Math.floor(totalKrw / count);
  const remainder = totalKrw - base * count;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? base + remainder : base));
}

// 04-02 Task 1 ① — 합계(부가세 포함)에서 공급가액을 역산한다. `round()`를
// 재사용해 이 모듈 안에서도 반올림 지점이 하나다. **재계산 합계가 원래
// 입력과 어긋나도 이 함수는 조정하지 않는다** — 1원 오차가 구조적임을
// 04-RESEARCH.md Pattern 2가 설명한다. 차이 판단·표시는 호출자(도메인
// revenue)의 몫이다.
export function grossFromTotal(totalKrw: number, vatRate: number, unit: RoundingUnit, method: RoundingMethod): number {
  const raw = totalKrw / (1 + vatRate);
  return round(raw, unit, method);
}

// 05-03(06-02와 같은 이름 · 계약) — 원 정수 합과 차이. 부호를 유지하고 빈 배열의 합은 0이다.
export function sumKrw(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function diffKrw(a: number, b: number): number {
  return a - b;
}

// 외화 금액의 최소 단위 배율(소수 둘째 자리) — 외화 금액 비교 · 차감은 이 정수 단위로 한다(부동소수 오차 없음).
const MINOR_UNITS = 100;

function toMinor(amount: number): number {
  return Math.round(amount * MINOR_UNITS);
}

// 05 /review A11 — 두 금액이 같은 기준(외화 = 최소 단위, 원화 = 원화 환산액)에서 같은가. 분할 지급 「마지막 회차」 판정이 쓴다.
export function sameAmountOn(basis: "foreign" | "krw", a: Pick<Money, "amount" | "amountKrw">, b: Pick<Money, "amount" | "amountKrw">): boolean {
  return basis === "foreign" ? toMinor(a.amount) === toMinor(b.amount) : a.amountKrw === b.amountKrw;
}

// 05-03(EXP-01 · Q4 계획 결정) — 분할 회차의 남은 실행가. 앞 회차 문서 통화와 (있으면) 이번 문서 통화가 모두 줄 통화와
// 같은 외화면 원래 통화 금액으로 비교하고(환율 차이로 남은 금액이 흔들리지 않게), 하나라도 다르거나 원화 줄이면 원화로
// 비교한다. 남은 금액은 음수일 수 있다(호출자가 0 이하를 「닫힘」으로 읽는다). exceeds = 이번 문서가 남은 금액보다 크다.
export function remainingForInstallments(
  execution: Money,
  others: readonly Money[],
  current?: MoneyInput,
): { basis: "foreign" | "krw"; remaining: Money; exceeds: boolean } {
  const sameCurrency =
    execution.currency !== "KRW" &&
    others.every((money) => money.currency === execution.currency) &&
    (!current || current.currency === execution.currency);
  if (sameCurrency) {
    const cents = toMinor(execution.amount) - sumKrw(others.map((money) => toMinor(money.amount)));
    // 원래 통화 비교의 남은 원화는 남은 외화 × 줄 실행가 환율 — 앞 문서 원화 합(환율 변동)으로 문이 열리고 닫히지 않는다(05-14).
    const amount = cents / MINOR_UNITS;
    const remaining: Money = { __brand: "Money", currency: execution.currency, amount, fxRate: execution.fxRate, amountKrw: toKrw({ currency: execution.currency, amount, fxRate: execution.fxRate }) };
    const exceeds = current !== undefined && toMinor(current.amount) > cents;
    return { basis: "foreign", remaining, exceeds };
  }
  const remainingKrw = execution.amountKrw - sumKrw(others.map((money) => money.amountKrw));
  const remaining: Money = { __brand: "Money", currency: "KRW", amount: remainingKrw, fxRate: 1, amountKrw: remainingKrw };
  const exceeds = current !== undefined && toKrw(current) > remainingKrw;
  return { basis: "krw", remaining, exceeds };
}

// 05-06(UI-SPEC S5 · Copywriting 「계산 한 줄」 · 「세율 바뀜」) — 세율 → `%` 글자, 소수 둘째 자리까지(끝의 0은 뗀다). 곱셈 대신
// 소수점 자리를 글자로 옮겨 부동소수 오차(0.07 × 100 = 7.000000000000001)가 글자에 새지 않는다. 0.088 → `8.8%` · 0.0275 → `2.75%`.
export function formatRatePercent(rate: number): string {
  const [whole = "0", fraction = ""] = rate.toFixed(4).split(".");
  const percent = String(Number(`${whole}${fraction.slice(0, 2)}`));
  const decimal = fraction.slice(2).replace(/0+$/, "");
  return `${percent}${decimal ? `.${decimal}` : ""}%`;
}
