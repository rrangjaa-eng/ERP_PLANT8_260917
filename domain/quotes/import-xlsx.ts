import { formatKrw, stripNumberInput } from "@/lib/format-number";
import { moneyFromRow, quoteAmount, quoteAmountWithinBound } from "@/domain/money";
import type { ReadBook } from "@/lib/xlsx-server";

// 07.2-14(X2 · D-7239~7246) — 회사 견적 양식 xlsx → 견적 줄. 순수 함수: 저장 0 · server-only 의존 0(ReadBook은 타입만).
// 열은 머리글 이름으로 찾고(고정 셀 아님) 항목 + 단가 또는 금액이 있는 줄만 만든다. 못 읽은 줄은 「건너뜀」으로 돌려준다(전부 거부 아님).

export type QuoteImportLine = {
  /** 시트의 행 번호(1부터). */
  row: number;
  lineKind: "quote" | "commission";
  itemName: string;
  quantity: number;
  days: number;
  /** 원 정수. */
  unitPrice: number;
  clientRemark: string | null;
  majorCategory: string | null;
  midCategory: string | null;
};

export type QuoteImportSkipped = { row: number; reason: string };
export type QuoteImportSheet = { name: string; lines: number; grandTotal: number | null };

export type QuoteImportResult =
  | { kind: "rejected"; message: string }
  | { kind: "needsSheet"; sheets: QuoteImportSheet[] }
  | {
      kind: "ok";
      sheet: string;
      lines: QuoteImportLine[];
      /** 앞 SKIPPED_SHOWN 줄만 — 전체 수는 skippedTotal. */
      skipped: QuoteImportSkipped[];
      skippedTotal: number;
      /** 소계 · Total · Grand Total과 저장될 견적가 합의 차(절대값 · 0.5원 이하면 null). 비교할 합계가 없어도 null. */
      checksumDiff: number | null;
      /** 엑셀 AMOUNT ≠ 수량 × 단가 × 일수인 줄 수(곱으로 저장 — 07.2 D-7306). */
      mismatchedLines: number;
    };

export const NO_HEADER_MESSAGE = "열 이름 없음 · 항목 · 수량 · 단가 또는 금액";
const NO_LINES_MESSAGE = "올릴 줄 없음";
const SKIPPED_SHOWN = 100;
const HEADER_SCAN_ROWS = 100;
// 저장 칸 한도(lines.ts CLIENT_REMARK_LIMIT · CATEGORY_LIMIT와 같다) — 넘으면 저장 때 전부 거부되므로 올릴 때 자른다. 항목명은 한도가 없어 화면용으로 200자.
const REMARK_LIMIT = 500;
const CATEGORY_LIMIT = 100;
const ITEM_LIMIT = 200;
const WON_TOLERANCE = 1e-6;
const AMOUNT_TOLERANCE = 0.5;

// D-7246 — 별칭(공백 없이 비교 · 대문자). 줄바꿈 · 괄호를 걷은 머리글에 「포함」되면 걸린다.
export const HEADER_ALIASES = {
  item: ["ITEM", "항목", "품목"],
  quantity: ["QTY", "수량"],
  unitPrice: ["COST/UNIT", "UNITPRICE", "단가"],
  days: ["DAY/SET", "DAY", "SET", "일수"],
  amount: ["AMOUNT", "금액", "합계"],
  remark: ["REMARK", "비고"],
} as const;

type FieldKey = keyof typeof HEADER_ALIASES;
const FIELD_ORDER: readonly FieldKey[] = ["item", "quantity", "unitPrice", "days", "amount", "remark"];

export function normalizeHeader(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .replace(/\r?\n/g, " ")
    .replace(/[(（[][^)）\]]*[)）\]]/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// labelStart: 대분류가 놓인 첫 열. 병합 머리글(ITEM이 B:D 병합)이면 ITEM 머리글 열, 아니면 0.
type Columns = Partial<Record<FieldKey, number>> & { item: number; labelStart: number };

type HeaderMatch = { rowIndex: number; columns: Columns };

// 머리 줄 = 항목 열 + (단가 또는 금액 열)이 걸리는 첫 줄. 같은 별칭에 두 열이 걸리면 왼쪽 첫 열, 한 열은 한 칸에만 쓴다.
function findHeader(rows: readonly (readonly unknown[])[]): HeaderMatch | null {
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let rowIndex = 0; rowIndex < limit; rowIndex++) {
    const cells = (rows[rowIndex] ?? []).map((cell) => normalizeHeader(cell).replace(/\s+/g, ""));
    const used = new Set<number>();
    const found: Partial<Record<FieldKey, number>> = {};
    for (const field of FIELD_ORDER) {
      const column = cells.findIndex((cell, index) => !used.has(index) && cell !== "" && HEADER_ALIASES[field].some((alias) => cell.includes(alias)));
      if (column >= 0) {
        found[field] = column;
        used.add(column);
      }
    }
    if (found.item !== undefined && (found.unitPrice !== undefined || found.amount !== undefined)) {
      // ITEM 머리글이 오른쪽 칸들과 병합이면(다음 머리글까지 빈 칸) 항목 글자는 병합의 오른쪽 끝 칸에 있고 병합 안쪽 왼쪽 칸들은 대 · 중분류다.
      const others = FIELD_ORDER.flatMap((field) => (field === "item" || found[field] === undefined ? [] : [found[field]])).filter((column): column is number => column !== undefined && column > found.item!);
      const nextHeader = others.length > 0 ? Math.min(...others) : null;
      const merged = nextHeader !== null && nextHeader - found.item > 1 && cells.slice(found.item + 1, nextHeader).every((cell) => cell === "");
      return { rowIndex, columns: { ...found, item: merged ? nextHeader - 1 : found.item, labelStart: merged ? found.item : 0 } };
    }
  }
  return null;
}

type Num = { t: "empty" } | { t: "num"; v: number } | { t: "foc"; label: string } | { t: "bad" };

const FOC_PATTERN = /^(F\.?O\.?C\.?|T\.?B\.?D\.?)$/i;

// 문자열 칸은 붙여넣기(ui/table/parse-tsv.ts normalizeNumericPaste)와 같은 규칙 — 쉼표 · 공백 · 통화 기호를 지운 뒤 숫자 모양만. 두 곳을 같이 고친다.
const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

function readNum(value: unknown): Num {
  if (value === null || value === undefined) return { t: "empty" };
  if (typeof value === "number") return Number.isFinite(value) ? { t: "num", v: value } : { t: "bad" };
  if (typeof value !== "string") return { t: "bad" };
  const trimmed = value.trim();
  if (trimmed === "") return { t: "empty" };
  if (FOC_PATTERN.test(trimmed)) return { t: "foc", label: trimmed.toUpperCase() };
  const stripped = stripNumberInput(trimmed);
  if (stripped === "" || !NUMERIC_PATTERN.test(stripped)) return { t: "bad" };
  const parsed = Number(stripped);
  return Number.isFinite(parsed) ? { t: "num", v: parsed } : { t: "bad" };
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

// 소계 · 합계 줄 이름(D-7241) — 항목 칸 정규화 글자가 완전 일치일 때만. 한글 소계 · 합계 · 총계는 같은 뜻의 완전 일치로 더했다.
function nameKey(item: string): string {
  return item
    .replace(/[(（[][^)）\]]*[)）\]]/g, " ")
    .toLowerCase().replace(/[^a-z0-9가-힣]+/g, " ").trim();
}

const SUBTOTAL_NAMES = new Map<string, "sub" | "total" | "grand">([
  ["sub", "sub"],
  ["sub total", "sub"],
  ["subtotal", "sub"],
  ["소계", "sub"],
  ["total", "total"],
  ["합계", "total"],
  ["총계", "total"],
  ["grand total", "grand"],
]);

// 수수료 줄(D-7241) — 완전 일치 목록 또는 commission으로 끝나는 항목. 포함 비교는 쓰지 않는다(정상 줄이 조용히 사라진다).
const COMMISSION_NAMES = new Set(["plan & management", "venue commission", "agency commission"]);

function isCommissionItem(item: string): boolean {
  const lower = item.replace(/[(（[][^)）\]]*[)）\]]/g, " ").toLowerCase().replace(/\s+/g, " ").trim();
  return COMMISSION_NAMES.has(lower) || lower.endsWith("commission");
}

function clip(value: string, limit: number): string {
  return [...value].slice(0, limit).join("");
}

const hasDecimals2 = (value: number): boolean => Math.abs(Math.round(value * 100) / 100 - value) <= WON_TOLERANCE;

type SheetAnalysis = { lines: QuoteImportLine[]; skipped: QuoteImportSkipped[]; checksumDiff: number | null; mismatchedLines: number; grandTotal: number | null };

// 분류 판정 규칙(D-7240 — 단위 시험이 고정):
//  · 항목 열 왼쪽 칸에 글자가 있는 줄: 첫 열 = 대분류(중분류는 비운다), 둘째 열부터 = 중분류. 줄이 숫자를 가진 데이터 줄이어도 같다.
//  · 병합으로 비어 있는 칸은 위 줄 값을 이어받는다(대 · 중분류만 — 수량 · 단가 · 일수 · 금액은 이어받지 않는다: 이중 계상 방지).
//  · 숫자가 하나도 없고 항목 칸에만 글자가 있는 줄: 줄 바로 뒤가 아니면 분류 머리 — 앞 공백(들여쓰기)이 있으면 중분류, 없으면 대분류.
//    데이터 줄 바로 뒤의 항목만 있는 줄은 설명용 둘째 줄로 보고 「단가·금액 없음」으로 건너뛴다(소계 · 빈 줄 · 분류 머리 뒤에서는 머리).
function analyzeSheet(rows: readonly (readonly unknown[])[], header: HeaderMatch): SheetAnalysis {
  const { columns } = header;
  const lines: QuoteImportLine[] = [];
  const skipped: QuoteImportSkipped[] = [];
  let major: string | null = null;
  let mid: string | null = null;
  let afterData = false;
  let checksum = 0;
  let mismatchedLines = 0;
  const totals: { kind: "sub" | "total" | "grand"; value: number | null }[] = [];

  const cell = (row: readonly unknown[], field: FieldKey): unknown => {
    const index = columns[field];
    return index === undefined ? null : row[index];
  };

  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const rowNumber = rowIndex + 1;
    const itemRaw = cell(row, "item");
    const rawItemText = textOf(itemRaw);
    const qty = readNum(cell(row, "quantity"));
    const unit = readNum(cell(row, "unitPrice"));
    const days = readNum(cell(row, "days"));
    const amount = readNum(cell(row, "amount"));
    const remarkText = textOf(cell(row, "remark"));
    const skip = (reason: string) => skipped.push({ row: rowNumber, reason: `행 ${rowNumber} · ${reason}` });

    let leftLabels: { column: number; text: string }[] = [];
    for (let column = 0; column < columns.item; column++) {
      const text = textOf(row[column]);
      if (text !== "") leftLabels.push({ column, text });
    }
    // 항목 칸이 빈 채 라벨 칸(B · C)에 소계 · 합계 · 수수료 이름과 금액만 있는 줄(sub · Total · Grand Total(KRW) · PLAN & MANAGEMENT) — 그 이름이 항목이고 분류가 아니다.
    const lastLabel = leftLabels[leftLabels.length - 1];
    const labelIsRowName =
      rawItemText === "" && lastLabel !== undefined && qty.t === "empty" && unit.t === "empty" && days.t === "empty" && amount.t === "num" &&
      (SUBTOTAL_NAMES.has(nameKey(lastLabel.text)) || isCommissionItem(lastLabel.text));
    const itemText = labelIsRowName && lastLabel ? lastLabel.text : rawItemText;
    if (labelIsRowName) leftLabels = [];
    const numberCells = [qty, unit, days, amount];
    const hasNumberCell = numberCells.some((value) => value.t !== "empty");
    if (itemText === "" && leftLabels.length === 0 && remarkText === "" && !hasNumberCell) {
      afterData = false;
      continue;
    }

    for (const label of leftLabels) {
      if (label.column <= columns.labelStart) {
        major = clip(label.text, CATEGORY_LIMIT);
        mid = null;
      } else {
        mid = clip(label.text, CATEGORY_LIMIT);
      }
    }

    const totalKind = SUBTOTAL_NAMES.get(nameKey(itemText));
    if (totalKind !== undefined && qty.t === "empty" && unit.t === "empty") {
      totals.push({ kind: totalKind, value: amount.t === "num" ? amount.v : null });
      // Total · Grand Total 아래(수수료)는 앞 분류를 이어받지 않는다.
      if (totalKind !== "sub") {
        major = null;
        mid = null;
      }
      afterData = false;
      continue;
    }

    if (!hasNumberCell) {
      if (itemText === "") {
        if (leftLabels.length > 0) {
          afterData = false;
        } else {
          skip("항목 없음");
        }
        continue;
      }
      if (afterData && leftLabels.length === 0) {
        skip("단가·금액 없음");
        continue;
      }
      if (leftLabels.length === 0) {
        const indented = typeof itemRaw === "string" && /^[\s ]+\S/.test(itemRaw);
        if (indented) {
          mid = clip(itemText, CATEGORY_LIMIT);
        } else {
          major = clip(itemText, CATEGORY_LIMIT);
          mid = null;
        }
      }
      afterData = false;
      continue;
    }

    afterData = true;
    if (itemText === "") {
      skip("항목 없음");
      continue;
    }
    const badField = ([
      ["수량", qty],
      ["단가", unit],
      ["일수", days],
      ["금액", amount],
    ] as const).find(([name, value]) => value.t === "bad" || (value.t === "foc" && (name === "수량" || name === "일수")));
    if (badField) {
      skip(`숫자 아님 · ${badField[0]}`);
      continue;
    }
    const isFoc = unit.t === "foc" || amount.t === "foc";
    const unitNum = unit.t === "num" ? unit.v : null;
    const amountNum = amount.t === "num" ? amount.v : null;
    if (!isFoc && unitNum === null && amountNum === null) {
      skip("단가·금액 없음");
      continue;
    }

    const commission = !isFoc && isCommissionItem(itemText);
    // 금액만 있는 줄(단가 칸이 비었다)은 수량 1 · 일수 1 · 단가 = 금액 — 수량 · 일수 칸은 쓰지 않는다. 수수료 줄도 같다(금액 그대로).
    const amountOnly = !isFoc && (commission || unitNum === null);
    let quantity = 1;
    let dayCount = 1;
    if (!amountOnly) {
      quantity = qty.t === "num" ? qty.v : 1;
      dayCount = days.t === "num" ? days.v : 1;
      if (quantity <= 0) {
        skip("0 이하 · 수량");
        continue;
      }
      if (dayCount <= 0) {
        skip("0 이하 · 일수");
        continue;
      }
      if (!hasDecimals2(quantity)) {
        skip("소수 2자리 초과 · 수량");
        continue;
      }
      if (!hasDecimals2(dayCount)) {
        skip("소수 2자리 초과 · 일수");
        continue;
      }
      quantity = Math.round(quantity * 100) / 100;
      dayCount = Math.round(dayCount * 100) / 100;
    }

    let unitPrice = 0;
    let clientRemark: string | null = remarkText === "" ? null : clip(remarkText, REMARK_LIMIT);
    if (isFoc) {
      const focLabel = unit.t === "foc" ? unit.label : amount.t === "foc" ? amount.label : "F.O.C";
      const original = unit.t === "foc" ? amountNum : unitNum;
      const head = original === null ? focLabel : `${focLabel} · 단가 ${formatKrw(original)}`;
      clientRemark = clip(remarkText === "" ? head : `${head} · ${remarkText}`, REMARK_LIMIT);
    } else {
      const raw = amountOnly ? (commission ? (amountNum ?? unitNum ?? 0) : (amountNum ?? 0)) : (unitNum ?? 0);
      // 견본 실측: 원 미만 단가 · 금액(94363636.36 등 부가세 역산)이 큰 줄에 흔하다 — 건너뛰면 큰 줄이 사라지므로 원 정수로 반올림하고 비교(합계 차 · 금액 다름)가 드러낸다.
      unitPrice = Math.round(raw);
    }
    if (!quoteAmountWithinBound(quantity, { currency: "KRW", amount: unitPrice, fxRate: 1 }, dayCount)) {
      skip("금액 상한 초과");
      continue;
    }

    const stored = quoteAmount(quantity, moneyFromRow({ currency: "KRW", foreignAmount: null, fxRate: "1", amountKrw: unitPrice }), dayCount);
    checksum += stored;
    // 07.2 D-7306 — 줄 AMOUNT가 저장될 견적가와 다르면 곱으로 두고 센다. 0.5원 이하는 같음(수식 캐시 double의 원 미만 꼬리).
    if (!isFoc && !amountOnly && amountNum !== null && Math.abs(amountNum - stored) > AMOUNT_TOLERANCE) mismatchedLines++;

    lines.push({
      row: rowNumber,
      lineKind: commission ? "commission" : "quote",
      itemName: clip(itemText, ITEM_LIMIT),
      quantity,
      days: dayCount,
      unitPrice,
      clientRemark,
      majorCategory: major,
      midCategory: mid,
    });
  }

  const lastOf = (kind: "grand" | "total") => [...totals].reverse().find((entry) => entry.kind === kind && entry.value !== null)?.value ?? null;
  const grandTotal = lastOf("grand") ?? lastOf("total");
  const subSum = totals.filter((entry) => entry.kind === "sub" && entry.value !== null);
  const reference = grandTotal ?? (subSum.length > 0 ? subSum.reduce((sum, entry) => sum + (entry.value ?? 0), 0) : null);
  const diff = reference === null ? 0 : Math.abs(checksum - reference);
  return { lines, skipped, checksumDiff: diff > AMOUNT_TOLERANCE ? Math.round(diff) : null, mismatchedLines, grandTotal };
}

export function parseQuoteWorkbook(book: ReadBook, opts: { sheet?: string; maxLines: number }): QuoteImportResult {
  const found = book.sheets.flatMap((sheet) => {
    const header = findHeader(sheet.rows);
    return header ? [{ name: sheet.name, rows: sheet.rows, header }] : [];
  });
  if (opts.sheet === undefined && found.length > 1) {
    return {
      kind: "needsSheet",
      sheets: found.map((entry) => {
        const analysis = analyzeSheet(entry.rows, entry.header);
        return { name: entry.name, lines: analysis.lines.length, grandTotal: analysis.grandTotal };
      }),
    };
  }
  const target = opts.sheet === undefined ? found[0] : found.find((entry) => entry.name === opts.sheet);
  if (!target) return { kind: "rejected", message: NO_HEADER_MESSAGE };
  const analysis = analyzeSheet(target.rows, target.header);
  if (analysis.lines.length > opts.maxLines) return { kind: "rejected", message: `${opts.maxLines}줄 초과 · ${opts.maxLines}줄까지` };
  // 줄이 하나도 없어도 건너뜀이 있으면 ok(0줄)로 돌려준다 — 결과 줄 `건너뜀 N줄`과 펼침이 이유를 보인다.
  if (analysis.lines.length === 0 && analysis.skipped.length === 0) return { kind: "rejected", message: NO_LINES_MESSAGE };
  return {
    kind: "ok",
    sheet: target.name,
    lines: analysis.lines,
    skipped: analysis.skipped.slice(0, SKIPPED_SHOWN),
    skippedTotal: analysis.skipped.length,
    checksumDiff: analysis.checksumDiff,
    mismatchedLines: analysis.mismatchedLines,
  };
}
