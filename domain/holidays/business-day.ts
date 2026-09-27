// 영업일·KST 날짜 순수 함수. 날짜는 KST 달력 날짜 문자열(YYYY-MM-DD)이고,
// 산술은 UTC 자정 Date의 setUTCDate로만 한다 — 로컬 시간대 메서드를 쓰지 않는다.
export type HolidayLookup = (year: number) => ReadonlySet<string>;

const KST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const KST_MINUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function kstParts(instant: Date): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  const parts = { year: "", month: "", day: "", hour: "", minute: "" };
  for (const part of KST_MINUTE.formatToParts(instant)) {
    if (part.type in parts) parts[part.type as keyof typeof parts] = part.value;
  }
  return parts;
}

export function toKstDate(instant: Date): string {
  return KST_DATE.format(instant);
}

export function formatKstMinute(instant: Date): string {
  const p = kstParts(instant);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export function formatKstTime(instant: Date): string {
  const p = kstParts(instant);
  return `${p.hour}:${p.minute}`;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekday(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

export function isBusinessDay(date: string, lookup: HolidayLookup): boolean {
  return isWeekday(date) && !lookup(Number(date.slice(0, 4))).has(date);
}

export function addBusinessDays(date: string, n: number, lookup: HolidayLookup): string {
  // 한 번의 계산 안에서 해마다 조회를 한 번만 부른다. 조회 오류는 그대로 전파한다.
  const cache = new Map<number, ReadonlySet<string>>();
  const cachedLookup: HolidayLookup = (year) => {
    let set = cache.get(year);
    if (!set) {
      set = lookup(year);
      cache.set(year, set);
    }
    return set;
  };

  let current = date;
  if (n === 0) {
    while (!isBusinessDay(current, cachedLookup)) current = shiftDate(current, 1);
    return current;
  }
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    current = shiftDate(current, step);
    if (isBusinessDay(current, cachedLookup)) remaining -= 1;
  }
  return current;
}
