// SYSTEM.md §2-4 · §7-2 — 화면의 숫자 표시 서식 한 모듈(D-95). 순수 함수만,
// React·DOM·domain import 없음(ui·app·domain 셋 다 lib를 import할 수 있다,
// eslint boundaries — 반대 방향은 막힌다). `Intl.NumberFormat` 인스턴스는
// 모듈 수준에서 한 번만 만들어 재사용한다.

const krwFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const foreignAmountFormat = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fxRateFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 });
const quantityFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const countFormat = krwFormat;

// CEO C-15 — 개발 모드에서만 알린다(ui/button/Button.tsx 38행 선례와 같은
// 모양). 운영 화면은 "—"로 조용히 보인다.
function warnNotFinite(fnName: string, value: number): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[lib/format-number] ${fnName}에 비유한 값(${value})이 왔다 — 화면엔 "—"로 보인다.`);
  }
}

// 반올림 뒤 음의 0이 되는 값을 부호 없는 0으로 바꾼다(CEO C-15) — `Intl`이
// -0을 "-0"으로 그리므로 서식 전에 정규화한다.
function roundToZeroSafe(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** 원화 — 쉼표, 소수 없음. */
export function formatKrw(value: number): string {
  if (!Number.isFinite(value)) {
    warnNotFinite("formatKrw", value);
    return "—";
  }
  return krwFormat.format(roundToZeroSafe(value, 0));
}

/** 외화 금액 — 쉼표 + 소수 2자리 고정. */
export function formatForeignAmount(value: number): string {
  if (!Number.isFinite(value)) {
    warnNotFinite("formatForeignAmount", value);
    return "—";
  }
  return foreignAmountFormat.format(roundToZeroSafe(value, 2));
}

/** 환율 — 쉼표 + 끝의 0을 뗀 최대 4자리. */
export function formatFxRate(value: number): string {
  if (!Number.isFinite(value)) {
    warnNotFinite("formatFxRate", value);
    return "—";
  }
  return fxRateFormat.format(roundToZeroSafe(value, 4));
}

/** 수량 — 쉼표 + 끝의 0을 뗀 최대 2자리. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) {
    warnNotFinite("formatQuantity", value);
    return "—";
  }
  return quantityFormat.format(roundToZeroSafe(value, 2));
}

/** 비율 — 소수 1자리 + %, null이면 —. */
export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    if (value !== null) warnNotFinite("formatPercent", value);
    return "—";
  }
  return `${roundToZeroSafe(value, 1).toFixed(1)}%`;
}

/** 건수 — 쉼표 정수. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    warnNotFinite("formatCount", value);
    return "—";
  }
  return countFormat.format(roundToZeroSafe(value, 0));
}

/** 외화 견적 줄 2행 한 줄 — `USD 4,400.00 @1,318.1818`. KRW면 표시할 2행이 없다(null). */
export function formatForeignLine(input: { currency: string; amount: number; fxRate: number }): string | null {
  if (input.currency === "KRW") return null;
  return `${input.currency} ${formatForeignAmount(input.amount)} @${formatFxRate(input.fxRate)}`;
}
