// 04.1-06(D6 · ENG-8 · S9-FY): `?year=` 해석 한 곳 — `/leave`와 관리자 사람 상세 연차 섹션이 같이 쓴다. 정수이고
// 2000 ≤ year ≤ 올해이면 그 연도를 그대로(신청이 없어도 — 그때가 지난 연도 EMPTY), 없거나 미래 · 형식 오류 · 범위
// 밖이면 대체 연도(기본 = 올해). 「올해」는 호출자가 seoulToday()에서 구해 넘긴다(CEO-11).
const MIN_LEAVE_YEAR = 2000;

export function resolveLeaveYear(raw: string | string[] | undefined, thisYear: number, fallback: number = thisYear): number {
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) return fallback;
  const year = Number(raw);
  return year >= MIN_LEAVE_YEAR && year <= thisYear ? year : fallback;
}
