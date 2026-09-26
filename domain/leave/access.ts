import type { Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { canSeeApprovalDocument } from "@/domain/approvals";

// 04.1: 연차의 결재 문서 종류 키 — 결재 모듈은 이 문자열을 모른다(등록으로만 안다).
export const LEAVE_DOCUMENT_KIND = "leave";

// 연차 문서 보임 규칙 한 곳(CEO-4) — domain/leave/index.ts와 04.1-03 잔고 서비스가
// 함께 import한다(index.ts를 거치지 않아 순환이 없다). 기안자 · 처리한 사람 ·
// 지금 단계 후보(진행 중일 때만 — 종결 상태는 walkRoute 없이 처리 기록만, A-01).
// 스냅숏 기준일은 호출자 입구의 서울 날짜(deps.today)를 쓰고, 없을 때만 지금(A-09).
export async function canSeeLeaveDocument(
  viewer: Viewer,
  leave: { id: string; drafterId: string },
  deps?: { today?: string },
): Promise<boolean> {
  if (leave.drafterId === viewer.id) return true;
  return canSeeApprovalDocument(
    viewer,
    { kind: LEAVE_DOCUMENT_KIND, documentId: leave.id },
    { today: deps?.today ?? seoulToday() },
  );
}
