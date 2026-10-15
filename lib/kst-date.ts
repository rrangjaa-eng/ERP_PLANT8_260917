// KST(Asia/Seoul, UTC+9) 날짜 계산 — 서버·DB 시간대와 무관하게 날짜 경계를
// 고정한다(04-RESEARCH.md Pitfall 7). 이 모듈은 현재 시각을 스스로 읽지
// 않는다 — 모든 함수가 now/ymd를 인자로 받는다(가짜 타이머 없이 테스트).
const KST_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// 06.5 V11: `YYYY-MM-DD HH:mm` KST — 보관함처럼 시각을 한 줄로 보이는 자리. hourCycle h23이라 자정이 24가 아니라 00이다.
const KST_DATETIME_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function kstDateOf(date: Date): string {
  return KST_FORMAT.format(date);
}

export function kstDateTimeOf(date: Date): string {
  const parts = Object.fromEntries(KST_DATETIME_FORMAT.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function kstToday(now: Date): string {
  return kstDateOf(now);
}

export function kstYear(now: Date): number {
  return Number(kstDateOf(now).slice(0, 4));
}

export function addDays(ymd: string, n: number): string {
  const [year, month, day] = ymd.split("-").map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + n);
  return utc.toISOString().slice(0, 10);
}

// 그날 KST 00:00 = 전날 UTC 15:00.
export function kstDayStart(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day, -9));
}
