// 04.1-06(D6 · ENG-8 · S9-FY): `?year=` 해석 한 곳 — `/leave`와 관리자 사람 상세 연차 섹션이 같이 쓴다. 정수이고
// 2000 ≤ year ≤ 위 끝이면 그 연도를 그대로(신청이 없어도 — 그때가 지난 연도 EMPTY), 없거나 위 끝 뒤 · 형식 오류 ·
// 범위 밖이면 대체 연도(기본 = 위 끝). 위 끝은 호출자가 seoulToday()에서 구한 올해로 넘기고(CEO-11), `/leave`만
// max(올해, 내 신청의 가장 늦은 연도)를 넘긴다(사용자 결정 2026-09-29).
import { MIN_LEAVE_YEAR } from "@/domain/leave/days";

export function resolveLeaveYear(raw: string | string[] | undefined, maxYear: number, fallback: number = maxYear): number {
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) return fallback;
  const year = Number(raw);
  return year >= MIN_LEAVE_YEAR && year <= maxYear ? year : fallback;
}
