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

// ---------------------------------------------------------------------------
// 입력 쉼표 도우미(UI-SPEC S15, CEO C-02) — 서버로 가는 값에는 쉼표가 없다.
// `stripNumberInput`의 제거 문자 집합은 `ui/table/parse-tsv.ts`의
// `normalizeNumericPaste`(붙여넣기 정규화, 04-04가 사람 확인까지 거친 규칙)와
// 완전히 같아야 한다(엔지 리뷰 A P3) — 그 함수가 이 함수를 부른다.
// ---------------------------------------------------------------------------

export type NumberInputKind = "krw" | "foreign" | "fxRate" | "quantity";
export type NumberInputRejection = "krw-fraction" | "precision" | "not-number";

export type FormatNumberInputResult = {
  text: string;
  caret: number;
  rejected?: NumberInputRejection;
};

export const MAX_DECIMALS: Record<NumberInputKind, number> = {
  krw: 0,
  foreign: 2,
  fxRate: 4,
  quantity: 2,
};

/** 쉼표·공백·통화 기호(₩$¥￦, 앞뒤 `원`)를 지운다 — 서버·붙여넣기 공용 규칙. */
export function stripNumberInput(text: string): string {
  return text.replace(/[,\s₩$¥￦]/g, "").replace(/^원|원$/g, "");
}

/** 쉼표 섞인 문자열을 숫자로 읽는다. 빈 문자열은 `null`, 숫자가 아니면
 * `NaN`을 그대로 돌려준다(대체값 없음 — 저장 경로가 `Number.isFinite`로 막는다). */
export function parseNumberInput(text: string): number | null {
  const stripped = stripNumberInput(text);
  if (stripped === "") return null;
  return Number(stripped);
}

/** 정수부에 3자리마다 쉼표를 넣는다(부호 없는 순수 숫자 문자열 입력). */
function groupIntegerDigits(digits: string): string {
  const len = digits.length;
  let result = "";
  for (let i = 0; i < len; i++) {
    if (i > 0 && (len - i) % 3 === 0) result += ",";
    result += digits[i];
  }
  return result;
}

/** `groupIntegerDigits(digits)`의 앞 `count`자리까지 그렸을 때의 문자 길이(쉼표 포함) — 커서 위치 계산용. */
function groupedLengthUpTo(digits: string, count: number): number {
  const len = digits.length;
  let outLen = 0;
  for (let i = 0; i < count; i++) {
    if (i > 0 && (len - i) % 3 === 0) outLen++;
    outLen++;
  }
  return outLen;
}

type ScanResult = { sign: string; intDigits: string; fracDigits: string; hasDecimalPoint: boolean; digitsBeforeCaretCount: number };

// raw 문자열을 한 글자씩 훑어 "부호 하나 + 정수부 + (있으면) 소수점 + 소수부
// (자리 상한까지)"만 남긴다. 쉼표·통화 기호·중복 부호·소수점(krw)·자리
// 상한을 넘는 소수 자리는 조용히 버려진다 — 버려진 글자는 digitsBeforeCaretCount
// 계산에서도 자동으로 빠진다(타이핑 상한 초과를 "그 글자만 무시"로 만드는 지점).
function scanTyped(raw: string, caretPos: number, maxDecimals: number): ScanResult {
  const allowDecimal = maxDecimals > 0;
  let sign = "";
  let intDigits = "";
  let fracDigits = "";
  let seenDecimal = false;
  let digitsBeforeCaretCount = 0;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    let kept = false;

    if (ch === "-") {
      if (i === 0 && sign === "" && intDigits === "" && fracDigits === "" && !seenDecimal) {
        sign = "-";
        kept = true;
      }
    } else if (ch >= "0" && ch <= "9") {
      if (!seenDecimal) {
        intDigits += ch;
        kept = true;
      } else if (fracDigits.length < maxDecimals) {
        fracDigits += ch;
        kept = true;
      }
    } else if (ch === "." && allowDecimal && !seenDecimal) {
      seenDecimal = true;
      kept = true;
    }

    if (kept && i < caretPos) digitsBeforeCaretCount++;
  }

  return { sign, intDigits, fracDigits, hasDecimalPoint: seenDecimal, digitsBeforeCaretCount };
}

function buildTypedResult(scan: ScanResult): FormatNumberInputResult {
  const { sign, intDigits, fracDigits, hasDecimalPoint, digitsBeforeCaretCount } = scan;
  const groupedInt = intDigits === "" ? "" : groupIntegerDigits(intDigits);
  const text = sign + groupedInt + (hasDecimalPoint ? `.${fracDigits}` : "");

  const signLen = sign.length;
  const intoInt = Math.min(Math.max(0, digitsBeforeCaretCount - signLen), intDigits.length);
  const afterInt = Math.max(0, digitsBeforeCaretCount - signLen - intDigits.length);
  const caret =
    digitsBeforeCaretCount <= signLen ? digitsBeforeCaretCount : signLen + groupedLengthUpTo(intDigits, intoInt) + afterInt;

  return { text, caret };
}

function onlyDigits(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

// prev에서 raw로 한 글자가 빠졌을 때(raw.length === prev.length - 1) 그
// 빠진 글자 하나를 돌려준다 — 공통 접두사 뒤 prev의 그 자리 글자.
function removedChar(prev: string, raw: string): string {
  let i = 0;
  while (i < raw.length && prev[i] === raw[i]) i++;
  return prev[i] ?? "";
}

// prev→raw로 바뀔 때 실제로 "새로 끼어든" 가운데 구간의 길이 — 공통 앞부분·
// 뒷부분을 뺀 나머지. 순수 길이 차(raw.length - prev.length)로는 "9,800,000"
// 전체를 선택해 7글자짜리 값을 붙여넣는 경우(길이가 오히려 줄어든다)를 통째
// 입력으로 잡아내지 못한다 — 이 값이 1보다 크면 통째 입력(붙여넣기·자동완성)
// 이고, 0·1이면 한 글자 타이핑(삽입 또는 삭제)이다.
function insertedLength(raw: string, prev: string): number {
  const minLen = Math.min(raw.length, prev.length);
  let prefix = 0;
  while (prefix < minLen && raw[prefix] === prev[prefix]) prefix++;
  let suffix = 0;
  while (suffix < minLen - prefix && raw[raw.length - 1 - suffix] === prev[prev.length - 1 - suffix]) suffix++;
  return raw.length - prefix - suffix;
}

function formatTyped(raw: string, caret: number, maxDecimals: number, prev: string | undefined): FormatNumberInputResult {
  let workingRaw = raw;
  let workingCaret = caret;

  // 쉼표 뒤 Backspace(C-02·C-20) — 네이티브 삭제가 쉼표만 지우고 숫자는
  // 그대로 남으면(자리 수가 안 줄면), 커서에 인접한 숫자를 대신 지워
  // "쉼표만 사라지고 숫자는 그대로"인 상태를 만들지 않는다. 지워진 글자가
  // 실제로 쉼표일 때만 적용한다 — '-'·'.' 삭제까지 숫자를 더 지우면 안 된다.
  if (
    prev !== undefined &&
    workingRaw.length === prev.length - 1 &&
    onlyDigits(workingRaw) === onlyDigits(prev) &&
    removedChar(prev, workingRaw) === ","
  ) {
    const idx = Math.max(0, workingCaret - 1);
    workingRaw = workingRaw.slice(0, idx) + workingRaw.slice(idx + 1);
    workingCaret = idx;
  }

  const scan = scanTyped(workingRaw, workingCaret, maxDecimals);
  return buildTypedResult(scan);
}

function formatBulk(raw: string, kind: NumberInputKind, prev: string): FormatNumberInputResult {
  const maxDecimals = MAX_DECIMALS[kind];
  const stripped = stripNumberInput(raw);
  const negative = stripped.startsWith("-");
  const unsigned = negative ? stripped.slice(1) : stripped;

  if (unsigned === "" || !/^\d+(\.\d+)?$/.test(unsigned)) {
    return { text: prev, caret: prev.length, rejected: "not-number" };
  }

  const [intPart, fracPart = ""] = unsigned.split(".") as [string, string | undefined];

  if (kind === "krw") {
    if (!/^0*$/.test(fracPart)) {
      return { text: prev, caret: prev.length, rejected: "krw-fraction" };
    }
    const text = (negative ? "-" : "") + groupIntegerDigits(intPart);
    return { text, caret: text.length };
  }

  if (fracPart.length > maxDecimals) {
    return { text: prev, caret: prev.length, rejected: "precision" };
  }

  const text = (negative ? "-" : "") + groupIntegerDigits(intPart) + (fracPart ? `.${fracPart}` : "");
  return { text, caret: text.length };
}

/** 타이핑 중 쉼표 삽입 + 커서 보존, 문자열 통째 입력(붙여넣기·자동완성)
 * 거부(C-02). `prev`가 있고 `raw`의 "새로 끼어든" 가운데 구간(`insertedLength`)이
 * 1글자를 넘으면 통째 입력으로 본다 — 순수 길이 차만 보면 긴 값을 선택해
 * 짧은 값을 붙여넣는 경우(길이가 줄어든다)를 놓친다. 한 글자 타이핑은 언제나
 * 조용히 반영되거나(자리 상한 초과 글자만 무시) 삭제로 취급된다. */
export function formatNumberInput(params: { raw: string; caret: number; kind: NumberInputKind; prev?: string }): FormatNumberInputResult {
  const { raw, caret, kind, prev } = params;

  if (prev !== undefined && insertedLength(raw, prev) > 1) {
    return formatBulk(raw, kind, prev);
  }

  return formatTyped(raw, caret, MAX_DECIMALS[kind], prev);
}

/** 거부 이유 다섯 문구 — UI-SPEC rev 5 Copywriting `Error — 셀(형식)` · `Error — 셀(숫자 자리, 04-09)`을
 * 사용자 결정 2026-09-26(DECISIONS.md 「오류 문구 명사형 통일」)대로 명사형으로 고친 문구. */
export function numberInputRejectionReason(kind: NumberInputKind, rejected: NumberInputRejection): string {
  if (rejected === "krw-fraction") return "원화는 소수점 없이";
  if (rejected === "precision") {
    if (kind === "foreign") return "외화는 소수 2자리까지";
    if (kind === "fxRate") return "환율은 소수 4자리까지";
    return "수량은 소수 2자리까지";
  }
  return "숫자 형식 오류 · 12,400,000처럼";
}
