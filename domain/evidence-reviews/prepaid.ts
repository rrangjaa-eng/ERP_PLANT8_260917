// 06-06(O-5 · UI-SPEC 「표시 — 선결제」) — 선결제 증빙 기한. 잎 파일(값 import 없음) — 06-10 · 06-13 · 06-20 · 06-23이 옮겨 쓴다.
// 기한은 지급일부터 설정 날수(evidence.prepaid_due_days). 날짜는 KST 달력 `YYYY-MM-DD` 문자열 — 시각 · 시간대 셈 없이 달력 날짜만 더하고 뺀다.
// 선결제 아님 · 지급 전 · 면제 · 증빙 있음이면 null(2행 없음).

export type PrepaidDueInput = {
  prepaid: boolean;
  hasEvidence: boolean;
  waived: boolean;
  paidOn: string | null;
  dueDays: number;
  today: string;
};

export type PrepaidDue = { dueOn: string; overdueDays: number };

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / DAY_MS;
}

function dateOf(dayNo: number): string {
  return new Date(dayNo * DAY_MS).toISOString().slice(0, 10);
}

export function prepaidDueInfo(input: PrepaidDueInput): PrepaidDue | null {
  if (!input.prepaid || input.paidOn === null || input.waived || input.hasEvidence) return null;
  const due = dayNumber(input.paidOn) + input.dueDays;
  return { dueOn: dateOf(due), overdueDays: Math.max(0, dayNumber(input.today) - due) };
}
