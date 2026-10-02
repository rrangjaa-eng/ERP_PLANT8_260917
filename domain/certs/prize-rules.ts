import { KRW_COLUMN_MAX } from "@/domain/money";

// 04.3-10 Task 1 ④ — 경품 줄 셀 판정(순수). 서버(applyPrizeChanges)와 I′3 경품 편집 표가 함께 부른다 — 규칙은
// 하나다(설계 /cso H-3: 화면만 막으면 규칙이 둘). DB · 설정을 부르지 않는다. 수령자 화면(app/c/)은 import하지 않는다.

export const CERT_PRIZE_NAME_MAX = 80;
export const CERT_PRIZE_WINNER_MAX = 999;

export type PrizeColumn = "name" | "unitValue" | "delivery" | "winnerCount";
export type PrizeCellCode = "required" | "tooLong" | "duplicateName" | "amount" | "delivery" | "winnerCount";
export type PrizeCellError = { rowKey: string; column: PrizeColumn; code: PrizeCellCode; count?: number };

/** 표 한 줄(저장된 줄은 id가 있다). 값은 화면 글자 또는 숫자 — 판정이 정규형으로 바꾼다. */
export type PrizeRowInput = {
  key: string;
  id?: string;
  name: string;
  unitValue: string | number;
  delivery: string;
  winnerCount: string | number;
};

export type ValidPrizeRow = {
  key: string;
  id?: string;
  name: string;
  unitValueKrw: number;
  delivery: "onsite" | "parcel";
  winnerCount: number;
};

/** 읽기 전용 판정 재료 — 저장된 줄(경품명 · 전달) · 제출 있는 줄 id · 닫힘 · 지울 줄 id. */
export type PrizeRuleContext = {
  saved?: ReadonlyArray<{ id: string; name: string; delivery: "onsite" | "parcel" }>;
  lockedIds?: readonly string[];
  closed?: boolean;
  deletedIds?: readonly string[];
};

export type PrizeRuleResult =
  | { kind: "ok"; rows: ValidPrizeRow[] }
  | { kind: "invalid"; cellErrors: PrizeCellError[] }
  | { kind: "readOnly" };

export function normalizePrizeName(value: string): string {
  return value.normalize("NFC").trim();
}

/** 쉼표 허용 정수 1 이상 KRW_COLUMN_MAX 이하, 아니면 null. */
export function parsePrizeAmount(value: string | number): number | null {
  const text = typeof value === "number" ? String(value) : value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(text)) return null;
  const amount = Number(text);
  return amount >= 1 && amount <= KRW_COLUMN_MAX ? amount : null;
}

export function parseWinnerCount(value: string | number): number | null {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  return count >= 1 && count <= CERT_PRIZE_WINNER_MAX ? count : null;
}

export function parseDelivery(value: string): "onsite" | "parcel" | null {
  const text = value.trim();
  if (text === "현장" || text === "onsite") return "onsite";
  if (text === "택배" || text === "parcel") return "parcel";
  return null;
}

// 셀 오류(전부 거부) → 읽기 전용 위반 → ok. 셀 오류는 줄 순서 · 열 순서(경품명 · 가액 · 전달 · 당첨 수).
export function validatePrizeRows(rows: readonly PrizeRowInput[], context: PrizeRuleContext = {}): PrizeRuleResult {
  const names = rows.map((row) => normalizePrizeName(row.name));
  const nameCounts = new Map<string, number>();
  for (const name of names) if (name !== "") nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);

  const cellErrors: PrizeCellError[] = [];
  const valid: ValidPrizeRow[] = [];
  rows.forEach((row, index) => {
    const name = names[index] ?? "";
    const unitValueKrw = parsePrizeAmount(row.unitValue);
    const delivery = parseDelivery(row.delivery);
    const winnerCount = parseWinnerCount(row.winnerCount);
    const duplicates = nameCounts.get(name) ?? 0;

    if (name === "") cellErrors.push({ rowKey: row.key, column: "name", code: "required" });
    else if (name.length > CERT_PRIZE_NAME_MAX) cellErrors.push({ rowKey: row.key, column: "name", code: "tooLong" });
    else if (duplicates > 1) cellErrors.push({ rowKey: row.key, column: "name", code: "duplicateName", count: duplicates });
    if (unitValueKrw === null) cellErrors.push({ rowKey: row.key, column: "unitValue", code: "amount" });
    if (delivery === null) cellErrors.push({ rowKey: row.key, column: "delivery", code: "delivery" });
    if (winnerCount === null) cellErrors.push({ rowKey: row.key, column: "winnerCount", code: "winnerCount" });

    if (unitValueKrw !== null && delivery !== null && winnerCount !== null) {
      valid.push({ key: row.key, ...(row.id ? { id: row.id } : {}), name, unitValueKrw, delivery, winnerCount });
    }
  });
  if (cellErrors.length > 0) return { kind: "invalid", cellErrors };

  const saved = new Map((context.saved ?? []).map((row) => [row.id, row]));
  const locked = new Set(context.lockedIds ?? []);
  const deleted = context.deletedIds ?? [];
  if (deleted.some((id) => locked.has(id)) || (context.closed && deleted.length > 0)) return { kind: "readOnly" };
  for (const row of valid) {
    const before = row.id ? saved.get(row.id) : undefined;
    if (!before) {
      if (context.closed) return { kind: "readOnly" };
      continue;
    }
    const frozen = context.closed || locked.has(before.id);
    if (frozen && (row.name !== normalizePrizeName(before.name) || row.delivery !== before.delivery)) return { kind: "readOnly" };
  }
  return { kind: "ok", rows: valid };
}
