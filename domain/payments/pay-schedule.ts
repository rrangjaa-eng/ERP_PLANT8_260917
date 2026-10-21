// 07 D-715 — 지급 예정일 · 마감 · 지급 주 · 알림 기준일 · 규칙 줄은 이 파일 한 곳에서만. DB · 설정 · 시계 import 금지(결재 `domain/approvals/route.ts`와 같은
// 순수 모듈 관례). 260907 020_functions.sql:3415-3462(payment_due_date) · :96-130(approval_cutoff_at)의 번역 · 기한 안 지급 요일이 없을 때는 D-741.
// 요일 셈(요일 번호 · 요일 글자 표)은 이 파일 밖에 두지 않는다(260907 목요일 고정 알림 버그 재발 금지 — test/unit/payments/no-fixed-weekday.test.ts).
import { isBusinessDay, type HolidayLookup } from "@/domain/holidays/business-day";

export const PAY_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
export type PayWeekday = (typeof PAY_WEEKDAYS)[number];

export type PayScheduleConfig = { termDays: number; payWeekday: PayWeekday; cutoffHHmm: string };

// no-slot = 기한 창에 지급 요일이 없어 기한 이하 마지막 영업일(D-741 — 밀림 아님) · cutoff = 원래 지급일 마감을 넘겨 다음 지급 가능 요일로 밀림(D-704 첫 절).
export type PayPushReason = "cutoff" | "no-slot" | null;

export type PaySchedule = {
  // 유효 예정일 = 수동 지정 ?? 자동.
  payDate: string;
  autoPayDate: string;
  manual: boolean;
  cutoffAt: Date;
  alertDate: string;
  pushReason: PayPushReason;
};

export type PayScheduleInput = {
  baseDate: string;
  // 그 문서의 기한 일수(거래처 기한 ?? 회사 기본) — cfg.termDays는 부르는 쪽의 기본값.
  termDays: number;
  manualDate: string | null;
  approvedAt: Date | null;
  now: Date;
  lookup: HolidayLookup;
  cfg: PayScheduleConfig;
};

// 일요일 0 ~ 토요일 6(UTC 정오 Date의 getUTCDay — 날짜 문자열은 시간대가 없다).
const WEEKDAY_NUMBER: Readonly<Record<PayWeekday, number>> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };

function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// date 이하 마지막 지급 요일.
function weekdayOnOrBefore(date: string, weekday: PayWeekday): string {
  return shift(date, -((dayOfWeek(date) - WEEKDAY_NUMBER[weekday] + 7) % 7));
}

// 영업일이면 그 날, 아니면 앞 영업일. addBusinessDays(d, 0)은 앞으로 구르므로 쓰지 않는다.
export function prevBusinessOnOrBefore(date: string, lookup: HolidayLookup): string {
  let current = date;
  while (!isBusinessDay(current, lookup)) current = shift(current, -1);
  return current;
}

function cutoffOf(payDate: string, cfg: PayScheduleConfig, lookup: HolidayLookup): Date {
  return new Date(`${prevBusinessOnOrBefore(shift(payDate, -1), lookup)}T${cfg.cutoffHHmm}:00+09:00`);
}

// 기한 창 = 기준일 < d ≤ limit(기준일 당일은 창 밖). 창 안 마지막 지급 요일을 영업일로 맞추고, 창에 지급 요일이 없으면
// D-741 · D-749: 기한 이하 마지막 영업일(창에 영업일이 없으면 기준일 당일 포함 앞으로).
function firstCandidate(input: PayScheduleInput): { payDate: string; pushReason: PayPushReason } {
  const limit = shift(input.baseDate, input.termDays);
  const anchor = weekdayOnOrBefore(limit, input.cfg.payWeekday);
  if (anchor > input.baseDate) return { payDate: prevBusinessOnOrBefore(anchor, input.lookup), pushReason: null };
  return { payDate: prevBusinessOnOrBefore(limit, input.lookup), pushReason: "no-slot" };
}

export function resolvePaySchedule(input: PayScheduleInput): PaySchedule {
  const auto = firstCandidate(input);
  const payDate = input.manualDate ?? auto.payDate;
  const cutoffAt = cutoffOf(payDate, input.cfg, input.lookup);
  return {
    payDate,
    autoPayDate: auto.payDate,
    manual: input.manualDate !== null,
    cutoffAt,
    alertDate: payDate,
    pushReason: input.manualDate !== null ? null : auto.pushReason,
  };
}
