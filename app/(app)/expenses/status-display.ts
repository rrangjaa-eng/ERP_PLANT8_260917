import type { StatusWord } from "@/ui/status-tag/status-map";
import { leaveStatusWord, toLeaveStatusKey } from "@/app/(app)/leave/status-display";

// 05-05: 지출결의 상태 낱말 — 인스턴스(결재)가 없으면 `작성 중`, 있으면 04.1 결재 상태 매핑(`leaveStatusWord`) 그대로 위임한다.
// 색은 여기서 고르지 않는다(`ui/status-tag/status-map.ts`가 정한다).
export function expenseStatusWord(approvalStatus: string | null | undefined): StatusWord {
  const key = toLeaveStatusKey(approvalStatus);
  return key ? leaveStatusWord(key) : "작성 중";
}
