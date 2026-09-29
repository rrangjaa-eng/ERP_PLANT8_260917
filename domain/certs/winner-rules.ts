import { maskName, normalizeName, normalizePhone } from "./format";
import { findIndistinguishable, type WinnerForDisplay } from "./roster-display";

// 04.3-04 Task 1 ③ — 당첨자 줄 묶음 검사(순수). 만들기(I2)와 상세 편집
// (04.3-10)이 같은 판정을 쓴다. DB · 설정을 import하지 않는다. 문장은
// 화면이 code로 고른다(UI-SPEC Copywriting 「I2 셀 오류」).

export type WinnerColumn = "name" | "phone" | "prizeName" | "quantity" | "delivery" | "distinguishLabel";

export type WinnerRuleCode =
  | "required"
  | "phoneFormat"
  | "quantity"
  | "delivery"
  | "duplicatePerson"
  | "nameTooLong"
  | "prizeTooLong"
  | "shapeDuplicate"
  | "labelTooLong"
  | "labelDigits"
  | "labelName";

export type WinnerCellError = {
  rowKey: string;
  column: WinnerColumn;
  code: WinnerRuleCode;
  shape?: string;
  count?: number;
};

export type WinnerRowInput = {
  key: string;
  name: string;
  phone: string;
  prizeName: string;
  quantity: string | number;
  delivery: string;
  distinguishLabel?: string | null;
};

export type NormalizedWinnerRow = {
  key: string;
  name: string;
  phone: string;
  prizeName: string;
  quantity: number;
  delivery: "onsite" | "parcel";
  distinguishLabel: string | null;
};

// 상세 편집(04.3-10) 때 이미 저장된 줄 — 이름 포함 · 모양 중복 판정에 함께 쓴다.
export type SavedWinnerForRules = {
  id: string;
  name: string | null;
  prizeName: string;
  quantity: number;
  distinguishLabel: string | null;
};

export type WinnerRulesContext = { savedRows?: SavedWinnerForRules[] };

export type WinnerRulesResult =
  | { ok: true; rows: NormalizedWinnerRow[] }
  | { ok: false; noWinners?: true; cellErrors: WinnerCellError[] };

export const WINNER_NAME_MAX = 40;
export const WINNER_PRIZE_MAX = 80;
export const WINNER_LABEL_MAX = 10;
const QUANTITY_MAX = 2_147_483_647; // integer 칸 한계

const COLUMN_ORDER: WinnerColumn[] = ["name", "phone", "prizeName", "quantity", "delivery", "distinguishLabel"];

const DELIVERY_BY_INPUT: Record<string, "onsite" | "parcel"> = {
  현장: "onsite",
  택배: "parcel",
  onsite: "onsite",
  parcel: "parcel",
};

// 판정 전용 — NFC 뒤 모든 공백 제거(저장값에는 쓰지 않는다).
function compact(value: string): string {
  return value.normalize("NFC").replace(/\s/g, "");
}

function parseQuantity(raw: string | number): number | "required" | "quantity" {
  const text = String(raw).trim();
  if (text === "") return "required";
  if (!/^\d+$/.test(text)) return "quantity";
  const value = Number(text);
  return value >= 1 && value <= QUANTITY_MAX ? value : "quantity";
}

export function validateWinnerRows(rows: WinnerRowInput[], context?: WinnerRulesContext): WinnerRulesResult {
  if (rows.length === 0) return { ok: false, noWinners: true, cellErrors: [] };

  const saved = context?.savedRows ?? [];
  const errors = new Map<string, WinnerCellError>();
  const setError = (error: WinnerCellError) => {
    const id = `${error.rowKey}\u0000${error.column}`;
    if (!errors.has(id)) errors.set(id, error);
  };

  const eventNames = [...rows.map((r) => r.name), ...saved.map((s) => s.name ?? "")]
    .map(compact)
    .filter((name) => name !== "");

  const normalized = rows.map((r) => {
    const name = normalizeName(r.name);
    const prizeName = r.prizeName.normalize("NFC").trim();
    const phone = r.phone.trim() === "" ? null : normalizePhone(r.phone);
    const quantity = parseQuantity(r.quantity);
    const delivery = DELIVERY_BY_INPUT[r.delivery.trim()];
    const label = (r.distinguishLabel ?? "").normalize("NFC").trim();

    if (name === "") setError({ rowKey: r.key, column: "name", code: "required" });
    else if (name.length > WINNER_NAME_MAX) setError({ rowKey: r.key, column: "name", code: "nameTooLong" });

    if (r.phone.trim() === "") setError({ rowKey: r.key, column: "phone", code: "required" });
    else if (phone === null) setError({ rowKey: r.key, column: "phone", code: "phoneFormat" });

    if (prizeName === "") setError({ rowKey: r.key, column: "prizeName", code: "required" });
    else if (prizeName.length > WINNER_PRIZE_MAX) setError({ rowKey: r.key, column: "prizeName", code: "prizeTooLong" });

    if (typeof quantity === "string") setError({ rowKey: r.key, column: "quantity", code: quantity });

    if (r.delivery.trim() === "") setError({ rowKey: r.key, column: "delivery", code: "required" });
    else if (!delivery) setError({ rowKey: r.key, column: "delivery", code: "delivery" });

    if (label !== "") {
      const compactLabel = compact(label);
      if (label.length > WINNER_LABEL_MAX) {
        setError({ rowKey: r.key, column: "distinguishLabel", code: "labelTooLong" });
      } else if (/\p{Nd}{3,}/u.test(label.normalize("NFKC").replace(/[\s\-.]/g, ""))) {
        setError({ rowKey: r.key, column: "distinguishLabel", code: "labelDigits" });
      } else if (eventNames.some((n) => compactLabel.includes(n))) {
        setError({ rowKey: r.key, column: "distinguishLabel", code: "labelName" });
      }
    }

    return { key: r.key, name, phone, prizeName, quantity, delivery, label };
  });

  // 같은 사람(이름 + 전화번호) 두 번 — 이번 표 안. 저장된 줄과의 겹침은
  // DB 제약(event_id, name, phone)이 막는다.
  const byPerson = new Map<string, string[]>();
  for (const n of normalized) {
    if (n.name === "" || n.phone === null) continue;
    const id = `${n.name}\u0000${n.phone}`;
    byPerson.set(id, [...(byPerson.get(id) ?? []), n.key]);
  }
  for (const keys of byPerson.values()) {
    if (keys.length > 1) for (const key of keys) setError({ rowKey: key, column: "name", code: "duplicatePerson" });
  }

  // 공개 모양이 같은 줄 — 외부 목록과 같은 함수(findIndistinguishable).
  const display: WinnerForDisplay[] = [];
  for (const n of normalized) {
    if (n.name === "" || n.prizeName === "" || typeof n.quantity !== "number") continue;
    display.push({ id: `new:${n.key}`, name: n.name, prizeName: n.prizeName, quantity: n.quantity, distinguishLabel: n.label || null, sortOrder: 0 });
  }
  for (const s of saved) {
    display.push({ id: `saved:${s.id}`, name: s.name, prizeName: s.prizeName, quantity: s.quantity, distinguishLabel: s.distinguishLabel, sortOrder: 0 });
  }
  const displayById = new Map(display.map((d) => [d.id, d]));
  for (const group of findIndistinguishable(display)) {
    const first = displayById.get(group[0]!)!;
    const label = first.distinguishLabel ? ` · ${first.distinguishLabel}` : "";
    const shape = `${maskName(normalizeName(first.name ?? ""))} · ${first.prizeName} ${first.quantity}개${label}`;
    for (const id of group) {
      if (!id.startsWith("new:")) continue;
      setError({ rowKey: id.slice(4), column: "distinguishLabel", code: "shapeDuplicate", shape, count: group.length });
    }
  }

  if (errors.size > 0) {
    const rowIndex = new Map(rows.map((r, i) => [r.key, i]));
    const cellErrors = [...errors.values()].sort(
      (a, b) =>
        (rowIndex.get(a.rowKey) ?? 0) - (rowIndex.get(b.rowKey) ?? 0) ||
        COLUMN_ORDER.indexOf(a.column) - COLUMN_ORDER.indexOf(b.column),
    );
    return { ok: false, cellErrors };
  }

  return {
    ok: true,
    rows: normalized.map((n) => ({
      key: n.key,
      name: n.name,
      phone: n.phone!,
      prizeName: n.prizeName,
      quantity: n.quantity as number,
      delivery: n.delivery!,
      distinguishLabel: n.label === "" ? null : n.label,
    })),
  };
}
