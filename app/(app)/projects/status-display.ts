import type { StatusTagKind } from "@/ui/status-tag/StatusTag";
import type { ProjectStatus } from "@/domain/projects/status-transitions";

// 04-UI-SPEC rev 5 Color 「상태 → 색 매핑」(D-75 · SYSTEM.md §7-5 개정 ⑤) — 목록 상태 열과
// 상세 머리 줄 태그가 같은 표를 쓴다. 미수주는 막힘이 아니라 붉게 칠하지 않는다(D-45).
export const PROJECT_STATUS_TAG_KIND: Record<ProjectStatus, StatusTagKind> = {
  bidding: "muted",
  in_progress: "accent",
  settling: "warning",
  completed: "success",
  lost: "muted",
};
