import type { Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { canSeeApprovalDocument } from "@/domain/approvals";
import { can as defaultCan, ForbiddenError } from "@/domain/permissions/can";
import { TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { withTransaction } from "@/lib/db-transaction";
import { seatedTeamsOf } from "@/repositories/team-memberships";
import { listSeatHolders } from "@/repositories/seats";

// 04.1: 연차의 결재 문서 종류 키 — 결재 모듈은 이 문자열을 모른다(등록으로만 안다).
export const LEAVE_DOCUMENT_KIND = "leave";
// 07.2-15(PU10 · D-7253): 승인된 연차의 취소 요청 종류 — document_id = 원 연차 id(문서당 취소 건 하나 · 유일키). 등록은 domain/leave/cancel.ts.
// 상수는 여기 — 보임 규칙(아래)과 알림 착지(domain/notify/href.ts)가 cancel.ts를 거치지 않고 읽는다(순환 없음).
export const LEAVE_CANCEL_KIND = "leave_cancel";

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
  const today = deps?.today ?? seoulToday();
  if (await canSeeApprovalDocument(viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: leave.id }, { today })) return true;
  // 07.2-15(Codex PR #335): 원 연차 승인 뒤 팀장이 바뀌어도 그 연차의 취소 결재 참여자(지금 단계 후보 · 처리한 사람)는 원 연차 문서를 본다.
  return canSeeApprovalDocument(viewer, { kind: LEAVE_CANCEL_KIND, documentId: leave.id }, { today });
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

// 07.2-08(PU12 · D-7261 · 07.2 D-7308 · T-07.2-08-01/02): 사람별 연차 잔여(`/leave?view=all`)를 누가 어디까지 보나 — 판정 한 곳.
// `leave` 보기가 없으면 null(D-7261 — 「전체」는 `/leave` 안 탭이라 연차 메뉴 보기 권한자만). 그다음
// `admin.people` 보기 = 전사, 그 밖은 오늘(서울) seat-rules 팀장 자리의 그 팀만, 둘 다 아니면 null(화면 링크 0 · 직접 주소 404 ·
// 도메인 ForbiddenError). 팀장 자리 = seat-rules 정본(TEAM_LEAD_ROLE_ID 계급 + 오늘 발령 팀 ∩ 그 팀 팀장 자리 보유자) —
// 계급 이름 · 업무 범위 · 쓰기 권한(teamLeadCandidatesAtDate · projects.status)에 읽기 권리를 묶지 않는다(D-6202).
export type PeopleLeaveScope = { kind: "company" } | { kind: "teams"; teamIds: string[] };

export async function peopleLeaveScopeOf(
  viewer: Viewer,
  deps?: { now?: Date; can?: typeof defaultCan },
): Promise<PeopleLeaveScope | null> {
  const can = deps?.can ?? defaultCan;
  if (!(await can(viewer, "leave", "view"))) return null;
  if (await can(viewer, "admin.people", "view")) return { kind: "company" };
  if (viewer.roleId !== TEAM_LEAD_ROLE_ID) return null;
  const today = seoulToday(deps?.now);
  // domain은 db를 직접 쓰지 않는다(boundaries) — 두 읽기를 같은 스냅숏의 읽기 트랜잭션 하나로.
  const teamIds = await withTransaction(async (tx) => {
    const seated = (await seatedTeamsOf(viewer, viewer.id, today, tx)).map((row) => row.teamId);
    const holders = await listSeatHolders(viewer, { roleId: TEAM_LEAD_ROLE_ID, today, teamIds: seated }, tx);
    // 자리 구간이 오늘을 덮는 줄만 — 예정 발령(시작이 오늘 뒤)은 아직 자리가 아니다.
    return holders.filter((holder) => holder.userId === viewer.id && holder.from <= today && (holder.to === null || holder.to >= today)).map((holder) => holder.teamId);
  });
  const unique = [...new Set(teamIds)];
  return unique.length > 0 ? { kind: "teams", teamIds: unique } : null;
}
