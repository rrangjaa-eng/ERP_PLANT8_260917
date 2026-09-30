import type { Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { canSeeApprovalDocument } from "@/domain/approvals";
import { can as defaultCan, ForbiddenError } from "@/domain/permissions/can";

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

// 04.1-02(Codex HIGH 02 · CX-W1): 연차 쓰기 권한 — 「새로 신청하는 일」(신청 · 다시 신청 · 신청 미리보기)의
// 판정 한 곳. authedActionClient는 로그인 · 크기만 보므로 도메인 첫 줄에서 막는다. 반려 문서의 가능 행동
// `다시 신청`도 이 함수로 정한다(연차 종류 등록의 canResubmit). 회수는 기안자 판정만(계획 가정 4).
export async function canWriteLeave(viewer: Viewer, deps?: { can?: typeof defaultCan }): Promise<boolean> {
  const can = deps?.can ?? defaultCan;
  return can(viewer, "leave", "write");
}

export async function assertLeaveWrite(viewer: Viewer, deps?: { can?: typeof defaultCan }): Promise<void> {
  if (!(await canWriteLeave(viewer, deps))) throw new ForbiddenError("연차 신청 권한 없음");
}
