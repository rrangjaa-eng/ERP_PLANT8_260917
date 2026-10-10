// 06.3(D-6308 · D-6309): 겹침 = 같은 영업일을 하나라도 먹음, 예외는 반차 오전 + 반차 오후뿐 — 260907
// `O: server/src/leave.ts:548-574`(주석 543-546). 260907은 영업일 줄끼리 비교했고 우리는 일별 줄이 없어
// 지금 휴일 표로 전개한다(겹침 판정에만 — 저장 일수는 그대로, D-6305).
// 한계: 관리자가 기존 신청 기간 안의 공휴일을 지우면 그 날이 영업일로 펼쳐져 새 신청이 겹침으로 막힐 수 있다
// (옛 신청은 그 날을 차감하지 않았다 — 260907은 저장된 일별 줄 비교라 없던 일). 드물고 막는 쪽이라 받아들인다.
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { LEAVE_KIND_WORDS, leaveBusinessDays, type HalfPeriod, type LeaveKind } from "@/domain/leave/days";

export type LeaveSpan = { kind: LeaveKind; half: HalfPeriod | null; startDate: string; endDate: string };
export type LeaveOverlapHit = { date: string; kind: LeaveKind };

export function findLeaveOverlap(candidate: LeaveSpan, live: readonly LeaveSpan[], holidays: HolidayLookup): LeaveOverlapHit | null {
  const days = new Set(leaveBusinessDays(candidate.startDate, candidate.endDate, holidays));
  let hit: LeaveOverlapHit | null = null;
  for (const span of live) {
    // 우리 반반차에도 `half`가 있다 — 양쪽이 반차일 때만 예외(D-6309).
    if (candidate.kind === "half_day" && span.kind === "half_day" && candidate.half !== span.half) continue;
    const date = leaveBusinessDays(span.startDate, span.endDate, holidays).find((d) => days.has(d));
    if (date !== undefined && (hit === null || date < hit.date)) hit = { date, kind: span.kind };
  }
  return hit;
}

// D-6315: `{M월 D일} {갈래} 신청과 겹침 · 날짜 바꾸기`(앞자리 0 없음).
export function overlapMessage(hit: LeaveOverlapHit): string {
  const [, month, day] = hit.date.split("-").map(Number);
  return `${month}월 ${day}일 ${LEAVE_KIND_WORDS[hit.kind]} 신청과 겹침 · 날짜 바꾸기`;
}
