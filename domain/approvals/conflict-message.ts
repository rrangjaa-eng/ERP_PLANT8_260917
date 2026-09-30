import type { ApprovalStatus } from "@/domain/approvals/route";

// 04.1-02 Task 3(EXP-03 concurrency · ENG-6 · D1): 동시 처리 거부 문구 조립과 관련자 판정 — 순수 함수.
// 문구는 UI-SPEC Copywriting 「거부 — 동시 처리」 원문이다. 사람 · 시각 · 동작은 서버 값이고, 상세
// 문구는 관련자에게만 간다(호출자가 isApprovalParty로 가른다 — handleServerError가 UserFacingError
// 문구를 그대로 화면에 보내므로).

const NEXT = " · 새로 고침";
const NOT_HOLDER = `지금 담당이 아님${NEXT}`;
const FINAL = `최종 승인됨${NEXT}`;

const SEOUL_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// 조사 규칙: 마지막 글자가 한글 음절이면 받침 있으면 「이」, 없으면 「가」 — 한글이 아니면 「이」로 고정한다.
function subjectParticle(name: string): string {
  const code = name.charCodeAt(name.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return "이";
  return (code - 0xac00) % 28 === 0 ? "가" : "이";
}

export type ConflictAttempt = "approve" | "reject" | "withdraw" | "resubmit";

export type ConflictState = {
  status: ApprovalStatus;
  round: number;
  // 마지막으로 바꾼 사람(updated_by)의 이름 · 바꾼 시각.
  actorName: string | null;
  at: Date;
  attempted: ConflictAttempt;
};

export function buildConflictMessage(state: ConflictState): string {
  const who = (verb: string) =>
    state.actorName ? `${state.actorName}${subjectParticle(state.actorName)} ${SEOUL_TIME.format(state.at)}에 ${verb}${NEXT}` : NOT_HOLDER;
  switch (state.status) {
    case "in_review":
      return who("승인함");
    case "approved":
      // 회수 시도에는 끝났다는 사실만, 같은 자리를 승인 · 반려하려던 진 쪽에는 누가 언제 승인했는지.
      return state.attempted === "withdraw" ? FINAL : who("승인함");
    case "rejected":
      return who("반려함");
    case "withdrawn":
      return who("회수함");
    case "submitted":
      // 차수 > 1 = 반려 뒤 기안자가 다시 신청한 지금 상태. 차수 1은 제출 직후라 옛 version이 없다.
      return state.round > 1 ? who("다시 신청함") : NOT_HOLDER;
    case "draft":
      return NOT_HOLDER;
    default: {
      const unreachable: never = state.status;
      return unreachable;
    }
  }
}

// 관련자 = 기안자 · 이 인스턴스에서 단계를 처리한 사람(모든 차수) · 지금 차수 단계들의 지금 해석한 담당
// (기안자 제외 전 — 지금 자리가 대표 폴백이면 폴백 후보 포함, X-3). 입력 집합은 호출자가 만든다.
export function isApprovalParty(
  viewerId: string,
  input: { drafterId: string; actedByIds: readonly string[]; currentHolderIds: readonly string[] },
): boolean {
  return viewerId === input.drafterId || input.actedByIds.includes(viewerId) || input.currentHolderIds.includes(viewerId);
}
