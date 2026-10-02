import { formatCount, formatForeignAmount, formatFxRate, formatKrw, formatPercent, formatQuantity } from "@/lib/format-number";
import styles from "./Num.module.css";

// UI-SPEC 「공용 컴포넌트 계약」 Num(SC 8) — 숫자는 이 컴포넌트 하나로 그린다. 서식은 lib/format-number.ts 함수만 쓴다.
// 훅 · 지시문이 없어 서버 컴포넌트(page.tsx)에서 표 칸 노드로 바로 쓸 수 있다.
// 오른쪽 정렬은 표 CSS(Table의 align="right")가 맡는다 — 이 컴포넌트는 정렬을 정하지 않는다.
export type NumUnit = "krw" | "count" | "quantity" | "percent";

export type NumProps = {
  /** 값이 없으면(null) —. */
  value: number | null;
  /** 서식 — 기본 원화(쉼표 · 소수 없음). */
  unit?: NumUnit;
  /** 외화 금액 하나(`USD 4,400.00`). KRW면 무시한다. */
  currency?: string;
  /** 외화 병기 2행(SYSTEM §2-4) — 1행 원화 환산액 `value`, 2행 `통화 금액` · `@환율` 두 묶음. KRW면 2행이 없다. */
  fx?: { currency: string; amount: number; rate: number };
};

function formatValue(value: number | null, unit: NumUnit, currency: string | undefined): string {
  if (value === null) return "—";
  if (currency && currency !== "KRW") return `${currency} ${formatForeignAmount(value)}`;
  switch (unit) {
    case "count":
      return formatCount(value);
    case "quantity":
      return formatQuantity(value);
    case "percent":
      return formatPercent(value);
    case "krw":
      return formatKrw(value);
  }
}

export function Num({ value, unit = "krw", currency, fx }: NumProps) {
  const text = formatValue(value, unit, currency);
  if (!fx || fx.currency === "KRW") return <span className={styles.num}>{text}</span>;
  return (
    <span className={`${styles.num} ${styles.withFx}`}>
      <span className={styles.main}>{text}</span>
      <span className={styles.fx}>
        <span className={styles.fxPart}>{`${fx.currency} ${formatForeignAmount(fx.amount)}`}</span>{" "}
        <span className={styles.fxPart}>{`@${formatFxRate(fx.rate)}`}</span>
      </span>
    </span>
  );
}
