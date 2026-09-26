import { text, numeric, bigint } from "drizzle-orm/pg-core";

// Phase 4 Task 1 ① — 통화·외화 금액·환율·원화 환산액 네 컬럼의 공용 정의.
// 견적 줄·매출·리저브가 같은 모양을 물려받는다(FX-01). 원화는 **정수 원**,
// 외화는 소수 2자리, 환율은 소수 4자리(CEO 리뷰 D4). KRW는 예외 경로가
// 아니라 환율 1인 Money다 — foreignAmount는 KRW 행에서 null로 둔다.
//
// 접두어(prefix)는 camelCase 어간(예: "preEstimate")을 받아 JS 필드 키는
// `${prefix}Currency` 형태(camelCase), DB 컬럼명은 스네이크케이스로 조립한다
// (`preEstimateCurrency` → `pre_estimate_currency`). 타입은 각 컬럼의 실제
// 빌더 반환 타입을 정확히 매핑해 스프레드해도 리터럴 키가 살아남는다
// (Task 2 ③에서 `pnpm db:generate` 실측으로 검증).
function snakeSegment(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function columnName(prefix: string, suffix: string): string {
  const snakePrefix = snakeSegment(prefix);
  return snakePrefix ? `${snakePrefix}_${suffix}` : suffix;
}

type CurrencyBuilder = ReturnType<typeof buildCurrency>;
type ForeignAmountBuilder = ReturnType<typeof buildForeignAmount>;
type FxRateBuilder = ReturnType<typeof buildFxRate>;
type AmountKrwBuilder = ReturnType<typeof buildAmountKrw>;

function buildCurrency(prefix: string) {
  return text(columnName(prefix, "currency")).notNull().default("KRW");
}

function buildForeignAmount(prefix: string) {
  return numeric(columnName(prefix, "foreign_amount"), { precision: 14, scale: 2 });
}

function buildFxRate(prefix: string) {
  return numeric(columnName(prefix, "fx_rate"), { precision: 12, scale: 4 }).notNull().default("1.0000");
}

function buildAmountKrw(prefix: string) {
  return bigint(columnName(prefix, "amount_krw"), { mode: "number" }).notNull();
}

export type MoneyColumns<Prefix extends string> = {
  [K in `${Prefix}Currency`]: CurrencyBuilder;
} & {
  [K in `${Prefix}ForeignAmount`]: ForeignAmountBuilder;
} & {
  [K in `${Prefix}FxRate`]: FxRateBuilder;
} & {
  [K in `${Prefix}AmountKrw`]: AmountKrwBuilder;
};

export function moneyColumns<Prefix extends string>(prefix: Prefix): MoneyColumns<Prefix> {
  return {
    [`${prefix}Currency`]: buildCurrency(prefix),
    [`${prefix}ForeignAmount`]: buildForeignAmount(prefix),
    [`${prefix}FxRate`]: buildFxRate(prefix),
    [`${prefix}AmountKrw`]: buildAmountKrw(prefix),
  } as MoneyColumns<Prefix>;
}
