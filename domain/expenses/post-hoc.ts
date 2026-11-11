import { kstDateOf } from "@/lib/kst-date";

// 07.2-16(PU7 · D-7234~7236): 사후 추인 — 상신 시각을 서울 날짜로 바꿔 행사 시작일보다 뒤면 참(당일은 거짓). 임시 저장(상신 없음) ·
// 시작일 없음은 거짓. 결재함 요약 · 지출결의 목록 · 상세 세 자리가 이 함수 하나로 판정한다(D-7235). 읽을 때 계산 — 저장 칸 없음(D-7236).
// 260907 O: server/src/expenses.ts:479-482(당일 제외) — 다름: 곁말 문장 없이 배지 하나(D-7234).
export function isPostHocSubmitted(submittedAt: Date | null, eventStartDate: string | null): boolean {
  if (!submittedAt || !eventStartDate) return false;
  return kstDateOf(submittedAt) > eventStartDate;
}
