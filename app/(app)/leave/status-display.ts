import type { StatusTagKind } from "@/ui/status-tag/StatusTag";
import type { StatusWord } from "@/ui/status-tag/status-map";
import type { LeaveCancelState } from "@/domain/leave/dto";

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
  // 결재선 목록 전용 — 보는 사람이 지금 담당 · 차례가 안 온 단계 · 자리가 빈 단계 · 기안자가 본인 승인한 단계(05-01 E6).
  | "mine"
  | "waiting"
  | "vacant"
  | "self_approved";

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
    case "self_approved":
      return { kind: "success", label: dated("본인 승인") };
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

// 04.6-18: `StatusTag status` 낱말 — 색은 상태 배지 표(`status-map.ts`)가 정한다. 낱말은 `leaveStatusDisplay`의 글자와 같다(날짜 없이).
export function leaveStatusWord(status: LeaveStatusKey, stepLabel?: string | null): StatusWord {
  switch (status) {
    case "submitted":
    case "in_review":
      return stepLabel ? `${stepLabel} 결재 중` : "결재 중";
    case "mine":
      return "내 결재";
    case "approved":
      return "승인";
    case "self_approved":
      return "본인 승인";
    case "rejected":
      return "반려";
    case "withdrawn":
      return "회수";
    case "waiting":
      return "대기";
    case "vacant":
      return "담당 없음";
    case "draft":
      return "임시";
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

// 07.2-15(S18 · PU10): 연차 문서 · 목록의 상태 낱말 — 승인된 연차에 취소 요청이 결재 중이면 `취소 요청 중`, 취소가 승인되면 `취소됨`.
// 반려 · 회수된 취소(none)는 `승인` 그대로. 승인이 아닌 문서는 취소가 있을 수 없어 원래 낱말.
export function leaveDocumentStatusWord(status: LeaveStatusKey, cancelState: LeaveCancelState | undefined, stepLabel?: string | null): StatusWord {
  if (status === "approved" && cancelState === "requested") return "취소 요청 중";
  if (status === "approved" && cancelState === "cancelled") return "취소됨";
  return leaveStatusWord(status, stepLabel);
}

const STATUS_KEYS: readonly string[] = ["draft", "submitted", "in_review", "approved", "rejected", "withdrawn"];

// 서버가 준 상태 문자열(투영에서 빠지면 undefined)을 매핑 키로 — 모르는 값은 null(그리지 않는다).
export function toLeaveStatusKey(status: string | null | undefined): LeaveStatusKey | null {
  return status && STATUS_KEYS.includes(status) ? (status as LeaveStatusKey) : null;
}

// 04.1-05(S7 · A3): 서버가 해석한 결재선 표시 목록 → ui/approval-route 목록 한 줄. 자기 승인 건너뜀 단계는
// 줄이 아니라 끝 줄(서버 endLines)이 말한다. 처리한 단계 = 저장된 처리자, 지금 · 남은 단계 = 표시 시점 담당.
export type RouteStepSource = Partial<{
  stepIndex: number;
  label: string;
  state: "approved" | "rejected" | "current" | "pending" | "empty" | "skipped_self" | "blocked";
  holderNames: string;
  actedByName: string | null;
  actedAt: Date | null;
  reason: string | null;
  viewerHolds: boolean;
  selfApproved: boolean;
}>;

export type RouteListStep = {
  key: string;
  person: string;
  label: string;
  result: { text: string; status: StatusWord };
  at: string | null;
  reason: string | null;
};

const SEOUL_MINUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// `09-18 14:02`(서울).
export function seoulMinuteOf(at: Date): string {
  const parts = Object.fromEntries(SEOUL_MINUTE.formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function stepStatusKey(step: RouteStepSource): LeaveStatusKey | null {
  switch (step.state) {
    case "approved":
      return step.selfApproved ? "self_approved" : "approved";
    case "rejected":
      return "rejected";
    case "current":
      return step.viewerHolds ? "mine" : "submitted";
    case "pending":
      return "waiting";
    case "empty":
    case "blocked":
      return "vacant";
    default:
      return null;
  }
}

function stepPerson(step: RouteStepSource): string {
  if (step.state === "empty" || step.state === "blocked") return "—";
  if (step.state === "approved" || step.state === "rejected") return step.actedByName ?? step.holderNames ?? "";
  const names = step.holderNames ?? "";
  // 후보가 한 명이고 그 사람이 보는 사람이면 `(나)`.
  return step.viewerHolds && !names.includes(" · ") && !names.includes(" 외 ") ? `${names}(나)` : names;
}

export function routeListSteps(steps: RouteStepSource[] | null | undefined): RouteListStep[] {
  const result: RouteListStep[] = [];
  for (const [index, step] of (steps ?? []).entries()) {
    const key = stepStatusKey(step);
    if (!key) continue;
    result.push({
      key: `${step.stepIndex ?? index}-${step.label ?? ""}`,
      person: stepPerson(step),
      label: step.label ?? "",
      result: { text: leaveStatusDisplay(key).label, status: leaveStatusWord(key) },
      at: step.actedAt ? seoulMinuteOf(step.actedAt) : null,
      reason: step.state === "rejected" ? (step.reason ?? null) : null,
    });
  }
  return result;
}

// 07.2-15(S18): 연차 문서 결재선 목록 끝에 붙는 취소 요청 결재선 — 같은 표시 목록에서 낱말만 취소 쪽으로(반려 = `취소 요청 반려` +
// 사유 원문, 승인 = `취소됨`, 남이 담당인 지금 단계 = `취소 요청 중`). 내 차례(`내 결재`) · 대기 · 담당 없음은 그대로.
export function cancelRouteListSteps(steps: RouteStepSource[] | null | undefined): RouteListStep[] {
  return routeListSteps(steps).map((step, index) => {
    const source = (steps ?? []).filter((item) => stepStatusKey(item) !== null)[index];
    const word: StatusWord | null =
      source?.state === "rejected" ? "취소 요청 반려" : source?.state === "approved" ? "취소됨" : source?.state === "current" && !source.viewerHolds ? "취소 요청 중" : null;
    return { ...step, key: `cancel-${step.key}`, result: word ? { text: word, status: word } : step.result };
  });
}

// 04.1-05(UI-SPEC Destructive — 회수 · #18): 회수 확인 결과 줄 — 첫 줄 `결재 멈춤 · {지금 담당}의 결재함에서 빠짐`
// (담당 표기는 서버 표시 목록의 후보 글자 그대로, 지금 담당이 없으면 `결재 멈춤`만). 06.6 D-6610: 회수는 앞 사람 승인이
// 없을 때만 되므로 승인 기록 줄을 두지 않는다.
export function withdrawResultLines(steps: RouteStepSource[] | null | undefined): string[] {
  const current = (steps ?? []).find((step) => step.state === "current");
  const holders = current?.holderNames ?? "";
  return [holders ? `결재 멈춤 · ${holders}의 결재함에서 빠짐` : "결재 멈춤"];
}
