// 04.3-03 Task 2a ③ · 2b ② — 외부 수령자 흐름의 순수 판정. 브라우저 API를
// 부르지 않는다(단위 테스트가 node 환경에서 그대로 부른다).

export type HistoryStep = "verify" | "form" | "result";
export type HistoryRender = "E2" | "E3" | "E4" | "result";

const RENDER_OF: Record<HistoryStep, HistoryRender> = { verify: "E3", form: "E4", result: "result" };

// 고아 기록 항목(UI-SPEC E3 「뒤로 가기」): 화면이 E2가 아닌 기록 항목 위에
// 있는데 메모리에 그 단계가 없으면 E2를 그리고 history.back()으로 E2 항목에
// 돌아간다(replaceState로 바꾸면 E2 항목이 둘이 된다).
export function resolveHistoryEntry(input: {
  stateStep: HistoryStep | null;
  memoryStep: HistoryStep | null;
}): { render: HistoryRender; back: boolean } {
  if (input.stateStep === null) return { render: "E2", back: false };
  if (input.stateStep === input.memoryStep) return { render: RENDER_OF[input.stateStep], back: false };
  return { render: "E2", back: true };
}

const DEFINITE_KINDS = new Set(["wrong", "locked", "hardLocked", "ok", "submitted", "closed", "expiredProof", "notFound"]);

type ActionResultLike = { data?: { kind?: string; [field: string]: unknown } | null; validationErrors?: unknown; serverError?: unknown } | undefined;

// 확정 판정 아홉(틀림 · 잠김 · 누적 잠김 · 맞음 · 이미 제출 · 닫힘 · 확인 시간
// 지남 · 자리 없음 · 입력 거부)만 멱등 키를 끝낸다. throttled · serverError(잠금 · 풀 시간
// 초과 포함) · 연결 끊김 · 모르는 응답은 결과 불명 — 같은 키로 다시 보낸다.
export function isDefiniteResult(result: ActionResultLike): boolean {
  if (!result) return false;
  if (result.validationErrors) return true;
  const kind = result.data?.kind;
  return typeof kind === "string" && DEFINITE_KINDS.has(kind);
}

// 제출 입력 거부(invalid)의 fields → 오류를 보일 칸. 서명이 거부되면 서명을
// 지우고 다시 받는다(주민등록번호 오류로 안내하지 않는다).
export function invalidSubmitField(fields: readonly string[]): "signature" | "phone" | "rrn" {
  if (fields.includes("signature")) return "signature";
  if (fields.includes("phone")) return "phone";
  return "rrn";
}

// E4 제출 막힘 이유 — 빈 칸만 나열하고 마지막 항목의 받침에 맞춰 을/를을 붙인다.
export function submitBlockedReason(missing: readonly string[]): string | undefined {
  if (missing.length === 0) return undefined;
  if (missing.length === 1 && missing[0] === "서명") return "서명을 해 주세요";
  const last = missing[missing.length - 1] ?? "";
  const code = last.charCodeAt(last.length - 1) - 0xac00;
  const particle = code >= 0 && code <= 11171 && code % 28 !== 0 ? "을" : "를";
  return `${missing.join(" · ")}${particle} 채우면 제출할 수 있습니다`;
}

export type RecheckTrigger = "visible" | "button";
export type RecheckOutcome = {
  next: "closed" | "open" | "shortLock" | "stay" | "networkError";
  focus: "step" | "input" | "group" | "none";
};

// 잠금 다시 확인(누적 잠김 복구 길) 응답 → 다음 화면과 포커스. 보임 이벤트의
// 누적 잠김 · 실패는 조용하고(포커스 · 글 불변), 누름의 누적 잠김은 실패 줄
// 없이 포커스만 묶음으로, 누름의 실패는 묶음 안 실패 줄이다(UI-SPEC 6차 손질 2).
// 이 길은 E6-a로 가지 않는다 — 잠금 밖 응답(submitted 등)은 모르는 응답이다.
export function recheckOutcome(result: ActionResultLike, trigger: RecheckTrigger): RecheckOutcome {
  const kind = result?.data?.kind;
  if (kind === "closed") return { next: "closed", focus: "step" };
  if (kind === "shortLocked") return { next: "shortLock", focus: "group" };
  if (kind === "open") return { next: "open", focus: "input" };
  if (kind === "hardLocked") return { next: "stay", focus: trigger === "button" ? "group" : "none" };
  return trigger === "button" ? { next: "networkError", focus: "group" } : { next: "stay", focus: "none" };
}
