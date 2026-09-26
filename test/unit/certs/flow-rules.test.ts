import { describe, expect, it } from "vitest";
import { isDefiniteResult, resolveHistoryEntry } from "@/app/c/[token]/flow-rules";

// 04.3-03 Task 2a ③ — 외부 수령자 흐름의 순수 판정(브라우저 API 없음).

describe("resolveHistoryEntry — 고아 기록 항목", () => {
  it("E3 항목인데 메모리에 단계가 없으면 E2를 그리고 뒤로 간다", () => {
    expect(resolveHistoryEntry({ stateStep: "verify", memoryStep: null })).toEqual({ render: "E2", back: true });
  });

  it("E4 항목인데 메모리에 단계가 없어도 같다", () => {
    expect(resolveHistoryEntry({ stateStep: "form", memoryStep: null })).toEqual({ render: "E2", back: true });
  });

  it("E2 항목이면 E2, 뒤로 가지 않는다", () => {
    expect(resolveHistoryEntry({ stateStep: null, memoryStep: null })).toEqual({ render: "E2", back: false });
  });

  it("메모리와 항목이 같은 E3면 E3 그대로", () => {
    expect(resolveHistoryEntry({ stateStep: "verify", memoryStep: "verify" })).toEqual({ render: "E3", back: false });
  });
});

describe("isDefiniteResult — 확정 판정 여덟 / 결과 불명", () => {
  it.each([
    [{ data: { kind: "wrong", remaining: 4 } }],
    [{ data: { kind: "locked", limit: 5, unlockAtDisplay: "18:45", remainingSeconds: 180 } }],
    [{ data: { kind: "hardLocked" } }],
    [{ data: { kind: "ok" } }],
    [{ data: { kind: "submitted" } }],
    [{ data: { kind: "closed", reason: "manual", at: "2026-09-26T00:00:00Z" } }],
    [{ data: { kind: "expiredProof" } }],
    [{ validationErrors: { last4: { _errors: ["x"] } } }],
  ])("%o → true", (result) => {
    expect(isDefiniteResult(result)).toBe(true);
  });

  it.each([
    [{ data: { kind: "throttled" } }],
    [{ serverError: "boom" }],
    [undefined],
    [{ data: { kind: "somethingElse" } }],
    [{ data: undefined }],
  ])("%o → false", (result) => {
    expect(isDefiniteResult(result)).toBe(false);
  });

  it("Phase 4 잠금 · 풀 시간 초과 UserFacingError가 실린 serverError는 결과 불명(AX-P2)", () => {
    expect(isDefiniteResult({ serverError: "다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장" })).toBe(false);
  });
});
