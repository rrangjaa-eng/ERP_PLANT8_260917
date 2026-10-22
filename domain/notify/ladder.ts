// 독촉 사다리(N10 · D-707 · D-708) — 첫 기한부터 3영업일마다 회차를 올리고 3회에서 멈춘다. 순수 함수(공휴일 lookup 주입).
import { addBusinessDays, type HolidayLookup } from "@/domain/holidays/business-day";

export const LADDER_MAX_ROUNDS = 3;
export const LADDER_STEP_BUSINESS_DAYS = 3;

// 회차 r의 기한 = 첫 기한(비영업일이면 다음 영업일로 구름 — P6) + 3(r-1)영업일.
function roundDue(firstDue: string, round: number, lookup: HolidayLookup): string {
  return addBusinessDays(addBusinessDays(firstDue, 0, lookup), LADDER_STEP_BUSINESS_DAYS * (round - 1), lookup);
}

// today까지 기한이 된 회차 전부(1부터, 상한 3).
export function ladderRounds(firstDue: string, today: string, lookup: HolidayLookup): number[] {
  const rounds: number[] = [];
  for (let round = 1; round <= LADDER_MAX_ROUNDS; round += 1) {
    if (roundDue(firstDue, round, lookup) > today) break;
    rounds.push(round);
  }
  return rounds;
}

// 사다리가 끝난(3회차 기한) 날이 floorDate보다 이른가 — 첫 배포 백로그를 만들지 않는 판정(C-P2-2).
export function ladderFinishedBefore(firstDue: string, floorDate: string, lookup: HolidayLookup): boolean {
  return roundDue(firstDue, LADDER_MAX_ROUNDS, lookup) < floorDate;
}
