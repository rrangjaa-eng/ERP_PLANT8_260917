// 07 D-715 — 지급 예정일 · 마감 · 지급 주 · 알림 기준일 · 규칙 줄은 이 파일 한 곳에서만. DB · 설정 · 시계 import 금지(결재 `domain/approvals/route.ts`와 같은
// 순수 모듈 관례). 260907 020_functions.sql:3415-3462(payment_due_date) · :96-130(approval_cutoff_at)의 번역 · 기한 안 지급 요일이 없을 때는 D-741.
// 요일 셈(요일 번호 · 요일 글자 표)은 이 파일 밖에 두지 않는다(260907 목요일 고정 알림 버그 재발 금지 — test/unit/payments/no-fixed-weekday.test.ts).
import { formatKstMinute, isBusinessDay, toKstDate, type HolidayLookup } from "@/domain/holidays/business-day";

export const PAY_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
export type PayWeekday = (typeof PAY_WEEKDAYS)[number];

export type PayScheduleConfig = { termDays: number; payWeekday: PayWeekday; cutoffHHmm: string };

// no-slot = 기한 창에 영업일로 맞춘 지급 요일이 없어 기한 이하 마지막 영업일(D-741 — 밀림 아님) · cutoff = 원래 지급일 마감을 넘겨 다음 지급 가능 요일로 밀림(D-704 첫 절).
export type PayPushReason = "cutoff" | "no-slot" | null;

export type PaySchedule = {
  // 유효 예정일 = 수동 지정 ?? 자동.
  payDate: string;
  // 자동 결과(마감 넘김 밀림 포함) — 수동 값이 있어도 셈한다.
  autoPayDate: string;
  manual: boolean;
  // 판정에 쓴 승인 시각(승인 전이면 null — gate `payment.cutoff`가 「결재 중」으로 읽는다).
  approvedAt: Date | null;
  cutoffAt: Date;
  alertDate: string;
  pushReason: PayPushReason;
  // R15: 상한 가드에 걸려 대체 일정으로 채운 행.
  failed?: true;
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

// 해 경계 lookup 누락(모든 날이 휴일로 보임)을 무한 반복 대신 오류로 드러낸다.
export class PayScheduleLimitError extends Error {
  constructor(what: string) {
    super(`지급 일정 계산 상한 초과: ${what}`);
    this.name = "PayScheduleLimitError";
  }
}

const MAX_BACK_DAYS = 366;
const MAX_PUSH_WEEKS = 60;

// 일요일 0 ~ 토요일 6(UTC 정오 Date의 getUTCDay — 날짜 문자열은 시간대가 없다).
const WEEKDAY_NUMBER: Readonly<Record<PayWeekday, number>> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
const WEEKDAY_CHARS = "일월화수목금토";

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

// date가 든 주(월~일)의 월요일.
function mondayOf(date: string): string {
  return shift(date, -((dayOfWeek(date) + 6) % 7));
}

// 영업일이면 그 날, 아니면 앞 영업일. addBusinessDays(d, 0)은 앞으로 구르므로 쓰지 않는다.
export function prevBusinessOnOrBefore(date: string, lookup: HolidayLookup): string {
  let current = date;
  for (let step = 0; !isBusinessDay(current, lookup); step += 1) {
    if (step >= MAX_BACK_DAYS) throw new PayScheduleLimitError(`${date} 앞 영업일`);
    current = shift(current, -1);
  }
  return current;
}

// 마감 = 지급일 하루 전 날 이하 가장 가까운 영업일의 cutoffHHmm KST(D-701 · J6). KST 시각을 만드는 곳은 여기 한 곳.
function kstAt(date: string, cfg: PayScheduleConfig): Date {
  return new Date(`${date}T${cfg.cutoffHHmm}:00+09:00`);
}

function cutoffOf(payDate: string, cfg: PayScheduleConfig, lookup: HolidayLookup): Date {
  return kstAt(prevBusinessOnOrBefore(shift(payDate, -1), lookup), cfg);
}

// 기한 창 = 기준일 < d ≤ limit(기준일 당일은 창 밖). 창 안 마지막 지급 요일을 영업일로 맞춘 날이 창 안이면 그 날, 창에 지급 요일이 없거나
// 맞춘 날이 기준일 이하면 D-741 · D-749: 기한 이하 마지막 영업일(창에 영업일이 없으면 기준일 당일 포함 앞으로).
function firstCandidate(input: PayScheduleInput): { payDate: string; pushReason: PayPushReason } {
  const limit = shift(input.baseDate, input.termDays);
  const anchor = weekdayOnOrBefore(limit, input.cfg.payWeekday);
  if (anchor > input.baseDate) {
    const pay = prevBusinessOnOrBefore(anchor, input.lookup);
    if (pay > input.baseDate) return { payDate: pay, pushReason: null };
  }
  return { payDate: prevBusinessOnOrBefore(limit, input.lookup), pushReason: "no-slot" };
}

// D-703 · D-704 첫 절: 첫 후보의 마감을 넘기면(1분이라도) 다음 지급 가능 요일 — 지급 요일 anchor마다 앞 영업일로 맞춘 날 중
// 앞 후보보다 늦고 마감 ≥ ref인 첫 날. 기한을 넘겨도, no-slot에서 출발해도 민다. 걷기는 ref 날짜 7일 전부터(오래된 기준일이
// 상한 가드에 걸리지 않게 — 그보다 이른 anchor는 마감이 ref보다 앞이라 후보가 될 수 없다).
function autoSchedule(input: PayScheduleInput, ref: Date): { payDate: string; pushReason: PayPushReason } {
  const first = firstCandidate(input);
  if (ref.getTime() <= cutoffOf(first.payDate, input.cfg, input.lookup).getTime()) return first;
  const refDate = toKstDate(ref);
  const start = first.payDate > shift(refDate, -7) ? first.payDate : shift(refDate, -7);
  const anchor0 = weekdayOnOrBefore(start, input.cfg.payWeekday);
  let previous = first.payDate;
  for (let week = 1; week <= MAX_PUSH_WEEKS; week += 1) {
    const pay = prevBusinessOnOrBefore(shift(anchor0, 7 * week), input.lookup);
    if (pay <= previous) continue;
    previous = pay;
    if (cutoffOf(pay, input.cfg, input.lookup).getTime() >= ref.getTime()) return { payDate: pay, pushReason: "cutoff" };
  }
  throw new PayScheduleLimitError(`${input.baseDate} 다음 지급 가능일`);
}

export function resolvePaySchedule(input: PayScheduleInput): PaySchedule {
  const auto = autoSchedule(input, input.approvedAt ?? input.now);
  const manual = input.manualDate !== null;
  const payDate = input.manualDate ?? auto.payDate;
  // D-742: 수동 값은 밀지 않는다 — 그 날짜의 마감은 표시용.
  const cutoffAt = cutoffOf(payDate, input.cfg, input.lookup);
  return {
    payDate,
    autoPayDate: auto.payDate,
    manual,
    approvedAt: input.approvedAt,
    cutoffAt,
    alertDate: prevBusinessOnOrBefore(shift(toKstDate(cutoffAt), -1), input.lookup),
    pushReason: manual ? null : auto.pushReason,
  };
}

// R15: 한 행의 계산 오류가 목록 전체를 깨지 않게 대체 일정(failed)으로 바꾼다. 로그는 부르는 쪽(로더)이 남긴다.
export function resolvePayScheduleSafe(input: PayScheduleInput): PaySchedule {
  try {
    return resolvePaySchedule(input);
  } catch {
    const limit = shift(input.baseDate, input.termDays);
    return {
      payDate: input.manualDate ?? limit,
      autoPayDate: limit,
      manual: input.manualDate !== null,
      approvedAt: input.approvedAt,
      cutoffAt: kstAt(shift(limit, -1), input.cfg),
      alertDate: limit,
      pushReason: null,
      failed: true,
    };
  }
}

// 달력일의 요일 한 글자(월~일) — 요일 표 · 요일 계산의 유일한 출입구(D-715 · K7).
export function payWeekdayChar(date: string): string {
  return WEEKDAY_CHARS.charAt(dayOfWeek(date));
}

function weekdaySettingChar(cfg: PayScheduleConfig): string {
  return WEEKDAY_CHARS.charAt(WEEKDAY_NUMBER[cfg.payWeekday]);
}

export function payOffWeekdayText(date: string, cfg: PayScheduleConfig): string | null {
  return dayOfWeek(date) === WEEKDAY_NUMBER[cfg.payWeekday] ? null : `${weekdaySettingChar(cfg)}요일 아님`;
}

// 오늘이 든 주(월~일)의 지급 요일을 영업일로 맞춘 날. 지났는지는 부르는 쪽이 판단(오늘 > 이 값 — K6).
export function thisWeekPayDate(today: string, cfg: PayScheduleConfig, lookup: HolidayLookup): string {
  return prevBusinessOnOrBefore(shift(mondayOf(today), WEEKDAY_NUMBER[cfg.payWeekday] - 1), lookup);
}

// date가 든 주(월~일)가 today가 든 주에서 몇 주 뒤인지(이번 주 0 · 다음 주 1 · 지난 주 음수).
export function payWeekIndex(date: string, today: string): number {
  return Math.round((Date.parse(mondayOf(date)) - Date.parse(mondayOf(today))) / (7 * 24 * 60 * 60 * 1000));
}

export type PayWeekGroupLabel = { label: string; tone?: "warning" };

// 지급 주 머리글(AQ-20). 요일 글자는 cfg가 아니라 실제 payDate의 요일(D-741로 같은 주 머리글이 둘일 수 있음).
export function payWeekGroupLabel(schedule: PaySchedule, today: string): PayWeekGroupLabel {
  if (schedule.failed) return { label: "예정일 계산 실패", tone: "warning" };
  if (schedule.payDate < today) return { label: "예정일 지남", tone: "warning" };
  const week = payWeekIndex(schedule.payDate, today);
  const tail = `${payWeekdayChar(schedule.payDate)} ${schedule.payDate.slice(5)} · 마감 ${formatKstMinute(schedule.cutoffAt).slice(5)}`;
  if (week === 0) return { label: `이번 주 ${tail}` };
  if (week === 1) return { label: `다음 주 ${tail}` };
  return { label: "그 뒤" };
}

// D-731 규칙 줄(계약 §7 문구). termDays = 그 문서의 기한 일수(거래처 기한 ?? 회사 기본).
export function payRuleLine(schedule: PaySchedule, termDays: number, cfg: PayScheduleConfig): string {
  if (schedule.failed) return "예정일 계산 실패";
  if (schedule.manual) return "결재 마감 면제";
  const cutoff = `결재 마감 ${formatKstMinute(schedule.cutoffAt).slice(5)}`;
  if (schedule.pushReason === "cutoff") return cutoff;
  if (schedule.pushReason === "no-slot") return `${cutoff} · 기한 ${termDays}일 안 마지막 영업일`;
  return `${cutoff} · 기한 ${termDays}일 안 마지막 ${weekdaySettingChar(cfg)}요일`;
}
