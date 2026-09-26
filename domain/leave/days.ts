// 04.1(LEAV-01): 연차 일수 계산 — 순수 함수(DB·설정·시계 없음). 일수는 정수
// 1/4일(쿼터)로 센다 — 종일 = 기간 안 평일 수 × 4, 반차 = 2, 반반차 = 1,
// 재택 = 0. 공휴일은 빼지 않는다(UI-SPEC Assumptions #4). 입력 kind·half는
// 폼 경계의 문자열 그대로 받아(빈 값 `""` 포함) 여기서 검증하고, 저장에는
// 검증된 값만 쓴다.

export const LEAVE_KINDS = ["full_day", "half_day", "quarter_day", "remote"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

export const HALF_PERIODS = ["am", "pm"] as const;
export type HalfPeriod = (typeof HALF_PERIODS)[number];

// UI-SPEC Copywriting 「막힘 — 신청 폼 필수」 원문 — 폼(04.1-06)과 서버가 같은 글자를 쓴다.
export const LEAVE_KIND_EMPTY_ERROR = "종류 비어 있음 · 종류 고르기";
export const LEAVE_HALF_EMPTY_ERROR = "시간 비어 있음 · 시간 고르기";
// 반차·반반차 `시간` Select의 처음 값(UI-SPEC 사용자 확인 대상 #1 — `오전`).
export const DEFAULT_HALF_PERIOD: HalfPeriod = "am";

const START_EMPTY_ERROR = "시작일 비어 있음 · 시작일 적기";
const DATE_EMPTY_ERROR = "날짜 비어 있음 · 날짜 적기";
const DATE_FORMAT_ERROR = "날짜 형식 오류 · 2026-09-18처럼";
const END_BEFORE_START_ERROR = "종료일이 시작일보다 빠름 · 종료일 고치기";
const WEEKEND_ONLY_ERROR = "주말만 고른 기간 · 평일 넣기";
const FISCAL_YEAR_ERROR = "기간이 회계연도를 넘음 · 12-31과 01-01로 나눠 신청";
const SINGLE_DAY_ERROR = "반차·반반차는 하루뿐 · 날짜 하나만 적기";

export type LeaveDaysInput = { kind: string; startDate: string; endDate: string; half: string };
export type LeaveFieldError = { field: "kind" | "startDate" | "endDate" | "half"; message: string };
export type LeaveDaysResult =
  | {
      ok: true;
      quarters: number;
      kind: LeaveKind;
      half: HalfPeriod | null;
      startDate: string;
      endDate: string;
      fiscalYear: number;
    }
  | { ok: false; errors: LeaveFieldError[] };

function isLeaveKind(value: string): value is LeaveKind {
  return (LEAVE_KINDS as readonly string[]).includes(value);
}

function isHalfPeriod(value: string): value is HalfPeriod {
  return (HALF_PERIODS as readonly string[]).includes(value);
}

// `YYYY-MM-DD`이고 실제 달력 날짜일 때만 UTC 자정 시각(ms)을 돌려준다.
function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const time = Date.UTC(year, month - 1, day);
  return new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function countWeekdays(startMs: number, endMs: number): number {
  let count = 0;
  for (let t = startMs; t <= endMs; t += DAY_MS) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export function countLeaveQuarters(input: LeaveDaysInput): LeaveDaysResult {
  if (!isLeaveKind(input.kind)) return { ok: false, errors: [{ field: "kind", message: LEAVE_KIND_EMPTY_ERROR }] };
  const kind = input.kind;
  const singleDay = kind === "half_day" || kind === "quarter_day";

  const errors: LeaveFieldError[] = [];
  if (input.startDate === "") {
    errors.push({ field: "startDate", message: singleDay ? DATE_EMPTY_ERROR : START_EMPTY_ERROR });
  }
  const startMs = input.startDate === "" ? null : parseDate(input.startDate);
  if (input.startDate !== "" && startMs === null) errors.push({ field: "startDate", message: DATE_FORMAT_ERROR });

  // 종료일이 비면 시작일과 같은 날로 본다(폼이 시작일로 채우는 규칙과 같다).
  const endDate = input.endDate === "" ? input.startDate : input.endDate;
  const endMs = endDate === "" ? null : parseDate(endDate);
  if (endDate !== "" && endMs === null) errors.push({ field: "endDate", message: DATE_FORMAT_ERROR });

  let half: HalfPeriod | null = null;
  if (singleDay) {
    if (isHalfPeriod(input.half)) half = input.half;
    else errors.push({ field: "half", message: LEAVE_HALF_EMPTY_ERROR });
  }
  if (errors.length > 0 || startMs === null || endMs === null) return { ok: false, errors };

  if (singleDay && endMs !== startMs) return { ok: false, errors: [{ field: "endDate", message: SINGLE_DAY_ERROR }] };
  if (endMs < startMs) return { ok: false, errors: [{ field: "endDate", message: END_BEFORE_START_ERROR }] };
  if (input.startDate.slice(0, 4) !== endDate.slice(0, 4)) {
    return { ok: false, errors: [{ field: "endDate", message: FISCAL_YEAR_ERROR }] };
  }

  const weekdays = countWeekdays(startMs, endMs);
  if (weekdays === 0) return { ok: false, errors: [{ field: "startDate", message: WEEKEND_ONLY_ERROR }] };

  const quarters = kind === "full_day" ? weekdays * 4 : kind === "half_day" ? 2 : kind === "quarter_day" ? 1 : 0;
  return {
    ok: true,
    quarters,
    kind,
    half,
    startDate: input.startDate,
    endDate,
    fiscalYear: Number(input.startDate.slice(0, 4)),
  };
}

// 쿼터 → 화면 일수(`3일` · `0.5일` · `0.25일`). 쿼터를 4로 나눈 값은 늘 이진
// 소수로 정확히 표현된다(0.25 단위).
export function formatLeaveDays(quarters: number): string {
  return `${quarters / 4}일`;
}
