import type { StatusWord } from "@/ui/status-tag/status-map";
import type { IssueRequestStatus } from "@/domain/issue-requests";

// 06-18(C2 · O-12): 발행 요청 DB 상태 값 → status-map 낱말 하나. 새 status 표를 만들지 않는다 — 색은 status-map.ts가 정한다.
const WORDS = {
  requested: "신청됨",
  issued: "발행됨",
  cancelled: "취소",
} as const satisfies Record<IssueRequestStatus, StatusWord>;

export function issueRequestStatusWord(status: IssueRequestStatus): StatusWord {
  return WORDS[status];
}
