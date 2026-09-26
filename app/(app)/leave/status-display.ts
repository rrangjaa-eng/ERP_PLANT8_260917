import type { StatusTagKind } from "@/ui/status-tag/StatusTag";

// 04.1 UI-SPEC Color 「상태 → 색 매핑」(SYSTEM.md §7-5 · A2) — 문서 상태 → kind · 글자의 유일한 출처.
// 화면 코드는 상태 문자열로 색을 직접 고르지 않고 이 함수만 쓴다. 자리: 제목 옆 `tag`(테두리) ·
// 표 상태 열과 결재선 목록 `text`(색 글자만 — 두~네 글자 규칙 밖).
export type LeaveStatusKey =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "withdrawn"
  // 결재선 목록 전용 — 보는 사람이 지금 담당 · 차례가 안 온 단계 · 자리가 빈 단계.
  | "mine"
  | "waiting"
  | "vacant";

export type LeaveStatusDisplay = { kind: StatusTagKind; label: string };

export function leaveStatusDisplay(status: LeaveStatusKey, options?: { stepLabel?: string | null; date?: string | null }): LeaveStatusDisplay {
  const dated = (word: string) => (options?.date ? `${word} ${options.date}` : word);
  switch (status) {
    case "submitted":
    case "in_review":
      return { kind: "accent", label: options?.stepLabel ? `${options.stepLabel} 결재 중` : "결재 중" };
    case "mine":
      return { kind: "accent", label: "내 결재" };
    case "approved":
      return { kind: "success", label: dated("승인") };
    case "rejected":
      return { kind: "danger", label: dated("반려") };
    case "withdrawn":
      return { kind: "muted", label: dated("회수") };
    case "waiting":
      return { kind: "muted", label: "대기" };
    case "vacant":
      return { kind: "danger", label: "담당 없음" };
    case "draft":
      return { kind: "muted", label: "임시" };
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

const STATUS_KEYS: readonly string[] = ["draft", "submitted", "in_review", "approved", "rejected", "withdrawn"];

// 서버가 준 상태 문자열(투영에서 빠지면 undefined)을 매핑 키로 — 모르는 값은 null(그리지 않는다).
export function toLeaveStatusKey(status: string | null | undefined): LeaveStatusKey | null {
  return status && STATUS_KEYS.includes(status) ? (status as LeaveStatusKey) : null;
}
