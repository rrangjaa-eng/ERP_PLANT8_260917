import type { LeaveFieldError } from "@/domain/leave/days";

// 06.3-01(확정 K-D1 · 리뷰 F1 · A2): 신청 폼 막힘 한 줄 — 폼 빈 칸 막힘(`own`)이 먼저, 없으면 미리보기 응답 `blockedReason`,
// 미리보기가 없으면 막힘 없음. 순수 함수 — React · next를 import하지 않는다.
// 대기 중에는 next-safe-action `useAction`이 새 응답 전까지 이전 `result`를 두므로 이전 막힘이 남는다(next-safe-action 8.7.3 `execute` 동작 — 단위 「A2 대기」가 고정).
// 미리보기 실패(서버 오류 · 네트워크)면 `result.data`가 비어 서버 쪽 막힘이 없다 — 제출 검사가 최종 판단.
export function formBlocked(
  own: LeaveFieldError | null,
  preview: { blockedReason: LeaveFieldError | null } | null | undefined,
): LeaveFieldError | null {
  return own ?? preview?.blockedReason ?? null;
}
