// 07.2-04 PU8(D-7247 · D-7248 · D-7249): 근속 가산 연차 — 순수 함수(DB·설정·시계 없음). 근속년 = 회계연도 − 입사연도,
// 3년 미만은 기본, 이상은 max(기본, min(기본 + ((근속년 − 3) 정수나눗셈 2) + 1, 25)). 설정 없음 · 상수(D-7249).
// 260907 `O: db/schema/020_functions.sql:2937-2952` leave_days_for · `O: server/src/leave.ts:858-875`(회계연도 부여 루프)와
// 같은 식 · 같은 근속년. 다름: 260907은 설정 4칸, 여기는 상수 · 기본이 상한보다 크면 깎지 않는다.

export const TENURE_BONUS_START_YEARS = 3;
export const TENURE_BONUS_CYCLE_YEARS = 2;
export const LEGAL_ANNUAL_MAX_DAYS = 25;

export function legalAnnualDays(input: { baseDays: number; fiscalYear: number; hireYear: number }): number {
  const tenure = input.fiscalYear - input.hireYear;
  if (tenure < TENURE_BONUS_START_YEARS) return input.baseDays;
  const bonus = Math.floor((tenure - TENURE_BONUS_START_YEARS) / TENURE_BONUS_CYCLE_YEARS) + 1;
  return Math.max(input.baseDays, Math.min(input.baseDays + bonus, LEGAL_ANNUAL_MAX_DAYS));
}
