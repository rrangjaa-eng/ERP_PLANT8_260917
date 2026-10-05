import type { Viewer } from "@/domain/viewer";
import type { ApprovalInboxItem } from "@/domain/approvals";

// 05-10 Task 1 골격 — RED가 단언으로 실패하도록 빈 목록만 돌려준다(구현은 다음 커밋).
export type NextTurnEntry = {
  key: string;
  tag: "결재" | "막힘";
  label: string;
  reason: string;
  measureText: string;
  action: { label: string; href: string };
  approval?: ApprovalInboxItem;
};

export async function listNextTurnItems(viewer: Viewer): Promise<NextTurnEntry[]> {
  void viewer;
  return [];
}
