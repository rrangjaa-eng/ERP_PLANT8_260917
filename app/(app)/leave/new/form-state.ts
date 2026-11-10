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

// 07.2-08(PU11 · D-7257 · D-7258 · UI-SPEC S17): 반반차 = 날짜 + 시작 시각(기본 09:00 — 채워져 있어 안 바꿔도 제출된다).
// 오전/오후 칸은 반차만. 종류별 칸 집합과 보내는 값이 여기 한 곳이다(폼은 이 결과대로 그린다).
export const DEFAULT_START_TIME = "09:00";

// 시작 시각 칸의 처음 값 — 새 신청은 09:00, 다시 신청은 저장된 시각. 시각 없이 저장된 기존 반반차(07.2-08 전)는 빈 칸으로 두어
// 사람이 고르게 한다(09:00을 채우면 오후 반반차가 말없이 09:00으로 바뀐다 · PR #368 리뷰 P3-1). 빈 칸은 서버 형식 검사가 막는다.
export function initialStartTime(resubmit: { kind: string; startTime: string | null } | undefined): string {
  if (!resubmit) return DEFAULT_START_TIME;
  return resubmit.startTime ?? (resubmit.kind === "quarter_day" ? "" : DEFAULT_START_TIME);
}

export type LeaveFormField = "startDate" | "endDate" | "half" | "startTime";

export function leaveFieldsOf(kind: string): LeaveFormField[] {
  if (kind === "quarter_day") return ["startDate", "startTime"];
  if (kind === "half_day") return ["startDate", "half"];
  return ["startDate", "endDate"];
}

export type LeaveFormValues = { kind: string; half: string; startTime: string; startDate: string; endDate: string; note: string };
export type LeaveInput = { kind: string; startDate: string; endDate: string; half: string; startTime?: string; note: string };

// 보내는 값 — 하루짜리(반차 · 반반차)는 종료일 = 날짜, half는 반차만, startTime은 반반차만.
export function toLeaveInput(values: LeaveFormValues): LeaveInput {
  const fields = leaveFieldsOf(values.kind);
  const singleDay = !fields.includes("endDate");
  return {
    kind: values.kind,
    startDate: values.startDate,
    endDate: singleDay ? values.startDate : values.endDate,
    half: fields.includes("half") ? values.half : "",
    ...(fields.includes("startTime") ? { startTime: values.startTime } : {}),
    note: values.note,
  };
}

// 06.3-02(리뷰 A1): 마지막 제출 입력(next-safe-action `useAction`의 `input`)과 지금 입력이 같은가 — 비고는 없으면 빈 문자열.
type LeaveInputLike = { kind: string; startDate: string; endDate: string; half: string; startTime?: string; note?: string };

export function sameLeaveInput(a: LeaveInputLike, b: LeaveInputLike): boolean {
  return (
    a.kind === b.kind &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.half === b.half &&
    (a.startTime ?? "") === (b.startTime ?? "") &&
    (a.note ?? "") === (b.note ?? "")
  );
}

// 06.3-02(리뷰 A1 · eng R2-W2): 입력이 제출값과 달라지면(stale) 낡은 칸 · 비고 오류만 숨긴다 — 입력과 무관한 서버 오류는 그대로.
type SubmitErrors = { fieldErrors: LeaveFieldError[]; noteError: string | undefined; serverError: string | undefined };

// 06.3-02 /design-review: 제출값으로 되돌려 미리보기 막힘 줄(`blocked`)이 같은 칸 · 같은 문구를 말하면 칸 오류는 숨긴다(같은 말 두 번 금지).
export function shownSubmitErrors(stale: boolean, errors: SubmitErrors, blocked: LeaveFieldError | null = null): SubmitErrors {
  if (stale) return { fieldErrors: [], noteError: undefined, serverError: errors.serverError };
  if (!blocked) return errors;
  return { ...errors, fieldErrors: errors.fieldErrors.filter((error) => error.field !== blocked.field || error.message !== blocked.message) };
}
