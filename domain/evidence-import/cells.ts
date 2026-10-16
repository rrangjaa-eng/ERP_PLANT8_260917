import { withinKrwColumn } from "@/domain/money";
import { excelSerialDateParts } from "@/lib/xlsx-server";

// 06.1-02: 칸 정규화 헬퍼 — 세 카드 서식 · 홈택스 · 06.1-11이 같이 쓴다. 금액 셈은 하지 않는다(정규화만).

export function cellText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

// 카드 끝 4자리(E1). 붙임표 · 공백만 걷고 별표는 남긴다 — 숫자만 남겨 끝 넷을 집으면 끝까지 가린
// `5531-52**-****-****`에서 카드사 대역 조각 `3152`가 끝 4자리 행세를 한다(남의 카드에 붙는다).
export function cardLast4Of(value: unknown): string | null {
  const compact = cellText(value).replaceAll(/[\s-]/g, "");
  if (compact.length < 8) return null;
  const last4 = compact.slice(-4);
  return /^\d{4}$/.test(last4) ? last4 : null;
}

// 카드 승인번호 — `00000000` 같은 가짜 번호(1~9 숫자 없음)와 빈칸은 null: 열쇠로 쓰지 않고 대체 열쇠로 간다.
export function cardApprovalNoOf(value: unknown): string | null {
  const text = cellText(value);
  return /[1-9]/.test(text) ? text : null;
}

// 원 정수 칸. 공백 · 쉼표 · `원` · `₩`를 뗀다. 정수가 아니거나 금액 울타리 밖이면 null — 반올림하지 않는다(B-F19).
export function cellKrw(value: unknown): number | null {
  let amount: number;
  if (typeof value === "number") {
    amount = value;
  } else if (typeof value === "string") {
    const text = value.replaceAll(/[\s,원₩]/g, "");
    if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
    amount = Number(text);
  } else {
    return null;
  }
  if (!Number.isInteger(amount) || !withinKrwColumn(amount)) return null;
  return amount === 0 ? 0 : amount;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// 외화 · 현지 금액 칸이 0(또는 빈칸)인가 — 해외 이용 표시(E15)에만 쓴다. 금액으로 읽지 않으므로 소수도 받는다.
// 숫자로 못 읽는 값은 0이 아니라고 본다(확인 필요 쪽으로 닫는다).
export function isZeroOrBlank(value: unknown): boolean {
  const text = cellText(value).replaceAll(/[\s,]/g, "");
  if (text === "") return true;
  return /^[+-]?\d+(\.\d+)?$/.test(text) && Number(text) === 0;
}

// 날짜 칸 → 한국 날짜 글자 `YYYY-MM-DD`(+ 같은 칸에 시각이 있으면 `HH:MM:SS`). `Date` 객체로 바꾸지 않는다 — 시간대 하루 밀림.
// 숫자는 엑셀 일련번호로 보고 통합문서의 1904 날짜 체계로 푼다.
export function cellDate(value: unknown, date1904: boolean): { date: string; time: string | null } | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    const parts = excelSerialDateParts(value, date1904);
    if (!parts || !validDate(parts.y, parts.m, parts.d)) return null;
    const hasTime = parts.H !== 0 || parts.M !== 0 || parts.S !== 0;
    return { date: `${parts.y}-${pad2(parts.m)}-${pad2(parts.d)}`, time: hasTime ? `${pad2(parts.H)}:${pad2(parts.M)}:${pad2(parts.S)}` : null };
  }
  const found = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?$/.exec(cellText(value));
  if (!found) return null;
  const [y, m, d] = [Number(found[1]), Number(found[2]), Number(found[3])];
  if (!validDate(y, m, d)) return null;
  const time = found[4] === undefined ? null : `${pad2(Number(found[4]))}:${found[5] ?? "00"}:${found[6] ?? "00"}`;
  return { date: `${y}-${pad2(m)}-${pad2(d)}`, time };
}

// 시각만 든 칸(`17:59:03`). 없으면 null.
export function cellTime(value: unknown): string | null {
  const found = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(cellText(value));
  return found ? `${pad2(Number(found[1]))}:${found[2]}:${found[3]}` : null;
}

// 사업자번호 숫자 10자리 — domain/vendors의 businessNoDigits와 같은 규칙(숫자만 · 10자리). vendors 모듈은 DB · 암호를
// 끌어오므로 순수 층이 import하지 않는다. 가린 번호(`113-**-*****`)는 null(오류 아님).
export function businessNoDigitsOf(value: unknown): string | null {
  const digits = cellText(value).replaceAll(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

// 전부 빈 줄(모든 칸이 null · 빈 글자 · 공백뿐) — 어느 서식에서도 건너뛴다(E43).
export function isBlankRow(row: readonly unknown[]): boolean {
  return row.every((cell) => cellText(cell) === "");
}
