import { isDeepStrictEqual } from "node:util";
import { formatForeignLine, formatKrw } from "@/lib/format-number";

// 07-04(R5): 행동 로그 `detail.changes = {칸: [이전, 이후]}`를 만드는 도우미.
// 바뀐 칸만, 전부 싣는다(자르기는 읽는 쪽 몫 — 07-25 detail-lines). 민감 칸은 원값이 반환값에 들어가지 않는다.
export type SensitiveMode = "last4" | "changed";

const CHANGED_LABEL = "바뀜";

export function maskLast4(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return CHANGED_LABEL;
  return `····${digits.slice(-4)}`;
}

function maskValue(value: unknown, mode: SensitiveMode): string {
  if (mode === "last4" && typeof value === "string") return maskLast4(value);
  return CHANGED_LABEL;
}

// JSON 동치 비교 — 키 순서가 달라도 같은 객체이고, undefined는 null로 본다.
function sameValue(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));
}

export function buildChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  sensitive?: Partial<Record<string, SensitiveMode>>,
): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const key of keys) {
    const prev = before[key] ?? null;
    const next = after[key] ?? null;
    if (sameValue(prev, next)) continue;
    const mode = sensitive?.[key];
    changes[key] = mode ? [prev === null ? null : maskValue(prev, mode), next === null ? null : maskValue(next, mode)] : [prev, next];
  }
  return changes;
}

// 07.1-13 S8(E-P2-40 · CG-09): 견적 · 매출 줄의 전후 — 줄 하나 = 원소 하나(항목명을 키로 쓰지 않아 같은 이름 줄이 겹치지 않는다).
// no = 화면 표시 순번(1부터), name = 견적 줄 항목명 · 매출 줄 null, changes = buildChanges 결과.
export type LineChange = {
  id: string;
  kind: "quote" | "issue" | "payment";
  no: number;
  name: string | null;
  changes: Record<string, [unknown, unknown]>;
};

// 금액 네 열(통화 · 외화 금액 · 환율 · 원화)을 로그 한 줄 글자로 — 원화 `1,000,000원`, 외화는 견적 줄 2행 글자 + ` · {원화}원`.
export function moneyChangeText(money: {
  currency: string;
  foreignAmount: string | number | null;
  fxRate: string | number;
  amountKrw: number;
}): string {
  const krw = `${formatKrw(money.amountKrw)}원`;
  if (money.foreignAmount === null) return krw;
  const foreign = formatForeignLine({ currency: money.currency, amount: Number(money.foreignAmount), fxRate: Number(money.fxRate) });
  return foreign === null ? krw : `${foreign} · ${krw}`;
}
