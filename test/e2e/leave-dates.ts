// 04.1-02(Codex HIGH 06): E2E 연차 날짜 헬퍼 — 실행하는 날과 무관하게 기준일의 연도 안
// 평일 범위를 만든다. 기준 = 그해 3월 1일 이후 첫 월요일, 거기서 `week`주 뒤 월요일부터
// 토·일을 건너뛰며 `weekdays`번째 평일까지. 인자 범위(week 0..30 · weekdays 1..20)가 끝을
// 늦어도 11월로 묶어 회계연도를 넘지 않는다. 날짜 산술은 UTC 자정 기준(시간대가 날짜를
// 밀지 않게). Playwright를 import하지 않는다 — 단위 테스트 대상이다.

const DAY_MS = 86_400_000;

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function leaveWeekdayRange(
  today: string,
  options: { week: number; weekdays: number },
): { startDate: string; endDate: string } {
  const { week, weekdays } = options;
  if (!Number.isInteger(week) || week < 0 || week > 30) throw new Error(`week 범위 밖: ${week}`);
  if (!Number.isInteger(weekdays) || weekdays < 1 || weekdays > 20) throw new Error(`weekdays 범위 밖: ${weekdays}`);
  const year = Number(today.slice(0, 4));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isInteger(year)) throw new Error(`날짜 형식 아님: ${today}`);

  const march1 = Date.UTC(year, 2, 1);
  const toMonday = (8 - new Date(march1).getUTCDay()) % 7;
  const start = march1 + (toMonday + week * 7) * DAY_MS;

  let cursor = start;
  let counted = 0;
  let end = start;
  while (counted < weekdays) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) {
      counted += 1;
      end = cursor;
    }
    cursor += DAY_MS;
  }
  return { startDate: toIso(start), endDate: toIso(end) };
}
