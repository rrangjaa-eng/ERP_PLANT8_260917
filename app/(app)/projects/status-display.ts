import type { StatusTagKind } from "@/ui/status-tag/StatusTag";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import type { StatusWord } from "@/ui/status-tag/status-map";

// 04-UI-SPEC rev 5 Color 「상태 → 색 매핑」(D-75 · SYSTEM.md §7-5 개정 ⑤) — 목록 상태 열과
// 상세 머리 줄 태그가 같은 표를 쓴다. 미수주는 막힘이 아니라 붉게 칠하지 않는다(D-45).
export const PROJECT_STATUS_TAG_KIND: Record<ProjectStatus, StatusTagKind> = {
  bidding: "muted",
  in_progress: "accent",
  settling: "warning",
  completed: "success",
  lost: "muted",
};

// 05-15 UI-SPEC S1 「상태 열 파생값」 — 견적 줄 상태 열 낱말 하나. 한 값 규칙 취소 > 반려 > 지출결의 중 > 미착수
// (작성 중 · 회수 문서는 linkedStatus가 null이라 줄 상태를 바꾸지 않는다). 색은 ui/status-tag/status-map.ts 한 표가 정한다.
export function lineStatusWord(line: { lineStatus: string; linkedStatus: "rejected" | "active" | null }): StatusWord {
  if (line.lineStatus === "cancelled") return "취소";
  if (line.linkedStatus === "rejected") return "반려";
  if (line.linkedStatus === "active") return "지출결의 중";
  return "미착수";
}
