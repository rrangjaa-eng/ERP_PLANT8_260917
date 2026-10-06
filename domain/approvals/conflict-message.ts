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
  // 05-01 E4: 상태는 그대로 version만 오른 이유 — 제출 뒤 증빙 변경(추가 · 삭제 공통).
  versionReason?: "evidence" | null;
};

export function buildConflictMessage(state: ConflictState): string {
  const who = (verb: string) =>
    state.actorName ? `${state.actorName}${subjectParticle(state.actorName)} ${SEOUL_TIME.format(state.at)}에 ${verb}${NEXT}` : NOT_HOLDER;
  // 상태 switch보다 먼저 — 증빙 변경은 in_review · 차수 1 · 차수 2 submitted 어디서든 같은 문구다(05-01 Round 4 D1).
  if (state.versionReason === "evidence") return who("증빙을 바꿈");
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

// 05-09 늦은 되돌리기(UI-SPEC Copywriting 「거부 — 늦은 되돌리기」) — 제출 토스트 `되돌리기`를 눌렀을 때 지금 차수 첫 처리가 이미 있다.
// 승인됐고 결재가 아직 진행 중이면 다음 행동은 문서 화면 회수(04.1 S6 확인), 반려 · 최종 승인이면 새로 고침. 이름을 볼 수 없으면 이름 없이.
export function buildLateUndoMessage(state: { actorName: string | null; at: Date; action: "approved" | "rejected"; withdrawable: boolean }): string {
  const head = state.actorName ? `${state.actorName}${subjectParticle(state.actorName)} ` : "";
  const verb = state.action === "approved" ? "승인함" : "반려함";
  const next = state.action === "approved" && state.withdrawable ? " · 문서에서 회수" : NEXT;
  return `${head}${SEOUL_TIME.format(state.at)}에 ${verb}${next}`;
}

// 관련자 = 기안자 · 이 인스턴스에서 단계를 처리한 사람(모든 차수) · 지금 차수 단계들의 지금 해석한 담당
// (기안자 제외 전 — 지금 자리가 대표 폴백이면 폴백 후보 포함, X-3). 입력 집합은 호출자가 만든다.
export function isApprovalParty(
  viewerId: string,
  input: { drafterId: string; actedByIds: readonly string[]; currentHolderIds: readonly string[] },
): boolean {
  return viewerId === input.drafterId || input.actedByIds.includes(viewerId) || input.currentHolderIds.includes(viewerId);
}

// 05-09 이미 무효인 증빙(design-review D9 · UI-SPEC Copywriting 「Error — 증빙 무효 처리」) — 04.1 「거부 — 동시 처리」 꼴.
// 처리자 = 그 행의 voided_by 이름 · 시각 = voided_at(서울 HH:MM). 이름을 모르면 이름 없이.
export function buildEvidenceVoidedMessage(state: { actorName: string | null; at: Date }): string {
  const head = state.actorName ? `${state.actorName}${subjectParticle(state.actorName)} ` : "";
  return `${head}${SEOUL_TIME.format(state.at)}에 무효 처리함${NEXT}`;
}

// 06-28 종결 · 다시 제출 경합(UI-SPEC Copywriting 「거부 — 문서 화면 동시성」) — 종결하려던 문서를 기안자가 먼저 다시 제출했다.
// 시각 = 지금 차수 결재선의 제출 시각(서울 HH:MM — 06-28 /review m3). 이름을 모르면 이름 없이.
export function buildResubmittedMessage(state: { drafterName: string | null; at: Date }): string {
  const time = SEOUL_TIME.format(state.at);
  return state.drafterName ? `${state.drafterName}${subjectParticle(state.drafterName)} ${time}에 다시 제출함${NEXT}` : `${time}에 다시 제출됨${NEXT}`;
}
