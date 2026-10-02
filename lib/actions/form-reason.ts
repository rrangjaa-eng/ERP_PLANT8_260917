// 04.5-08(U1-A): 폼 전체 서버 오류 한 줄 규칙. import 0개 — 클라이언트 폼이 import한다.
// 재시도로 풀리지 않는 원인은 표에 있는 원문과 **정확히** 같을 때만 짧은 원인 · 다음 행동으로 바꾼다.
// domain이 던지는 문구와 폼의 상수 비교가 같은 상수를 쓰도록 원인 문자열은 여기서 내보낸다.
export const PERMISSION_DENIED_CAUSE = "권한 없음";

export type FormReasonNext = "retry" | "refresh" | "list";
export type FormReason = { text: string; next: FormReasonNext; blocked: boolean };

// lib/actions/user-facing-error.ts의 LOGIN_REQUIRED_MESSAGE와 같은 글자(그 파일은 클래스를 export해
// 순수 모듈 규칙상 import하지 않는다 — 같은 값임은 단위 테스트가 지킨다).
const LOGIN_REQUIRED_CAUSE_SOURCE = "로그인 필요 · 다시 로그인";

// 원문 → { cause, next }. 02·06이 같은 표에 원인을 더한다.
const NON_RETRYABLE_CAUSES: Record<string, { cause: string; next: "refresh" | "list" }> = {
  [PERMISSION_DENIED_CAUSE]: { cause: PERMISSION_DENIED_CAUSE, next: "refresh" },
  [LOGIN_REQUIRED_CAUSE_SOURCE]: { cause: "로그인 필요", next: "refresh" },
};

export function formReason(verb: string, serverError: string): FormReason {
  const known = Object.hasOwn(NON_RETRYABLE_CAUSES, serverError) ? NON_RETRYABLE_CAUSES[serverError] : undefined;
  if (known) {
    return { text: `${verb}할 수 없음 — ${known.cause} · `, next: known.next, blocked: true };
  }
  const base = `${verb}할 수 없음 — ${serverError}`;
  return { text: serverError.includes(" · ") ? base : `${base} · 다시 시도`, next: "retry", blocked: false };
}
