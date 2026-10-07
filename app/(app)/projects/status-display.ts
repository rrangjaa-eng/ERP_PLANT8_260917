import type { StatusTagKind } from "@/ui/status-tag/StatusTag";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import type { StatusWord } from "@/ui/status-tag/status-map";
import type { QuoteLineLinkedStatus } from "@/domain/quotes/lines";

// 04-UI-SPEC rev 5 Color 「상태 → 색 매핑」(D-75 · SYSTEM.md §7-5 개정 ⑤) — 목록 상태 열과
// 상세 머리 줄 태그가 같은 표를 쓴다. 미수주는 막힘이 아니라 붉게 칠하지 않는다(D-45).
export const PROJECT_STATUS_TAG_KIND: Record<ProjectStatus, StatusTagKind> = {
  bidding: "muted",
  in_progress: "accent",
  settling: "warning",
  completed: "success",
  lost: "muted",
};

// 05-15 UI-SPEC S1 「상태 열 파생값」 — 견적 줄 상태 열 낱말 하나. 06-13(SP-2 · O-14): 한 값 우선순위는 서버
// (`domain/quotes/lines.ts` QUOTE_LINE_STATUS_PRIORITY)가 정해 키 하나만 보내고, 여기는 취소 → 키 → 낱말 → 미착수로 바꾸기만 한다.
// 낱말 · 색은 ui/status-tag/status-map.ts 한 표다(표에 없는 낱말은 타입 오류).
const LINKED_STATUS_WORD: Record<QuoteLineLinkedStatus, StatusWord> = {
  rejected: "반려",
  evidence_missing: "증빙 없음",
  active: "지출결의 중",
  purchase_requested: "구매 요청 중",
  paid: "지급 완료",
  card_used: "카드 사용",
};

export function lineStatusWord(line: { lineStatus: string; linkedStatus: QuoteLineLinkedStatus | null }): StatusWord {
  if (line.lineStatus === "cancelled") return "취소";
  return line.linkedStatus ? LINKED_STATUS_WORD[line.linkedStatus] : "미착수";
}
