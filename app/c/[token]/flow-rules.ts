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

const DEFINITE_KINDS = new Set(["wrong", "locked", "hardLocked", "ok", "submitted", "closed", "expiredProof"]);

type ActionResultLike = { data?: { kind?: string } | null; validationErrors?: unknown; serverError?: unknown } | undefined;

// 확정 판정 여덟(틀림 · 잠김 · 누적 잠김 · 맞음 · 이미 제출 · 닫힘 · 확인 시간
// 지남 · 입력 거부)만 멱등 키를 끝낸다. throttled · serverError(잠금 · 풀 시간
// 초과 포함) · 연결 끊김 · 모르는 응답은 결과 불명 — 같은 키로 다시 보낸다.
export function isDefiniteResult(result: ActionResultLike): boolean {
  if (!result) return false;
  if (result.validationErrors) return true;
  const kind = result.data?.kind;
  return typeof kind === "string" && DEFINITE_KINDS.has(kind);
}
