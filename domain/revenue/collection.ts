// 07-22(D-746 · D-735 · C-P2-11 · K23 · UI-SPEC SC-20) — 수금 지연 판정 한 벌. 목록 · 상세 매출 면 · 알림 종류가 모두 이 함수만 부른다.
// 순수 모듈 — DB · 저장소 · 설정 · 시계를 import하지 않는다(설정 일수 · 오늘 · 공휴일은 호출자가 넣는다, domain/payments/pay-schedule.ts와 같은 관례).
// 260907 db/schema/020_functions.sql:754-760 collect_due_date = previous_business_day(발행일 + 수금 기한)(notes에서 인용, 원본 미확인).
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { prevBusinessOnOrBefore } from "@/domain/payments/pay-schedule";
import { addDays } from "@/lib/kst-date";

export type CollectionIssue = { entryDate: string; amountKrw: number; createdAt: Date; id: string };

export type CollectionStatus = { overdue: boolean; dueDate: string | null };

export type CollectionInput = {
  /** 보관 안 된 발행 줄(공급가액 · 음수 = 감액 · 전액 취소). */
  issues: readonly CollectionIssue[];
  /** 입금 줄 공급가액 합계(상세 잔액 줄과 같은 기준 — 통장액에서 역산). */
  paidSupplyKrw: number;
  dueDays: number;
  today: string;
  lookup: HolidayLookup;
};

const NOT_OVERDUE: CollectionStatus = { overdue: false, dueDate: null };

function byEntryOrder(a: CollectionIssue, b: CollectionIssue): number {
  if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? -1 : 1;
  const time = a.createdAt.getTime() - b.createdAt.getTime();
  if (time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// 덮는 금액 = 입금 공급가액 + 음수 발행 줄 절댓값 합 — 앞 양수 발행부터 채운다(AQ-32). 처음으로 누적 > 덮는 금액인 양수 줄이
// 덜 받은 첫 계산서이고, 그 발행일 + 기한 일수(쉬는 날이면 앞 영업일)가 수금 예정일이다. 같은 날 줄의 입력 순서와 무관하다.
export function collectionStatus(input: CollectionInput): CollectionStatus {
  const issuedTotal = input.issues.reduce((sum, line) => sum + line.amountKrw, 0);
  if (issuedTotal <= input.paidSupplyKrw) return NOT_OVERDUE;

  const covered = input.paidSupplyKrw + input.issues.reduce((sum, line) => sum + (line.amountKrw < 0 ? -line.amountKrw : 0), 0);
  const positives = input.issues.filter((line) => line.amountKrw > 0).sort(byEntryOrder);
  let cumulative = 0;
  for (const line of positives) {
    cumulative += line.amountKrw;
    if (cumulative > covered) {
      const dueDate = prevBusinessOnOrBefore(addDays(line.entryDate, input.dueDays), input.lookup);
      return { overdue: input.today > dueDate, dueDate };
    }
  }
  return NOT_OVERDUE;
}
