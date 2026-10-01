// 행동 로그 「정리」가 표시할 수 없는 종류(순수 — 리포지토리 정리 조건과 화면의 정리 건수가 함께 쓴다).
// - action_log_prune: 정리 흔적 — 두 번의 정리로 첫 정리 기록이 사라지지 않게(03-07).
// - cert_view · mask_reveal · cert_correct: 개인정보 접속기록 — 월 1회 점검 대상이라 정리 표시를 하지 않는다
//   (안전성 확보조치 기준 제8조② · 04.3-14 사용자 결정 5936870579).
export const UNPRUNABLE_ACTION_TYPES = ["action_log_prune", "cert_view", "mask_reveal", "cert_correct"] as const;

export function isPrunableActionType(actionType: string): boolean {
  return !(UNPRUNABLE_ACTION_TYPES as readonly string[]).includes(actionType);
}
