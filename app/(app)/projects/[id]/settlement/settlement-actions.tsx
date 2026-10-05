"use client";

import { DocumentActions, type DocumentActionsProps } from "@/app/(app)/leave/[id]/document-actions";

// 05-11(UI-SPEC S10 (나)): 정산 결재 문서 화면 행동 줄 — 04.1 행동 줄(`DocumentActions`)을 그대로 쓴다(승인 1차 Ctrl+Enter · 반려 / 회수 2차 →
// 04.1 S6 확인, 제목은 종류 라벨 `정산 결재`). 다시 올리기 갈래는 폼이 아니라 이 화면의 1차다(Task 3).
export function SettlementActions(props: Omit<DocumentActionsProps, "resubmit" | "resubmitRoute">) {
  return <DocumentActions {...props} resubmit={null} resubmitRoute={null} />;
}
