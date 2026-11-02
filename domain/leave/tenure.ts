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

// 07.2-04 PU14(D-7264): 퇴직 시점 입사일 기준 법정 합 — 260907 `O: server/src/leave.ts:3040-3058`과 같은 뜻. 첫 해 월차는 만 개월 수
// (상한 11) · 그 뒤는 만 근속년 n마다 법정 연차 legalAnnualDays(근속 n년). 만 개월 · 만 년은 서울 날짜 문자열의 연 · 월 · 일 비교.
const FIRST_YEAR_MONTHLY_MAX_DAYS = 11;

function completedMonths(from: string, to: string): number {
  const [fy = 0, fm = 0, fd = 0] = from.split("-").map(Number);
  const [ty = 0, tm = 0, td = 0] = to.split("-").map(Number);
  // 기념일은 월차 부여(balance.ts addMonths)와 같이 그달에 없으면 말일로 당긴다(1월 31일 입사 → 2월 28일에 1개월).
  const anniversaryDay = Math.min(fd, new Date(Date.UTC(ty, tm, 0)).getUTCDate());
  return Math.max(0, (ty - fy) * 12 + (tm - fm) - (td < anniversaryDay ? 1 : 0));
}

export function legalTotalQuartersByHireDate(input: { hireDate: string; resignationDate: string; baseDays: number }): number {
  const months = completedMonths(input.hireDate, input.resignationDate);
  let days = Math.min(months, FIRST_YEAR_MONTHLY_MAX_DAYS);
  for (let tenure = 1; tenure <= Math.floor(months / 12); tenure++) {
    days += legalAnnualDays({ baseDays: input.baseDays, fiscalYear: tenure, hireYear: 0 });
  }
  return days * 4;
}
