import { describe, expect, it } from "vitest";
import {
  submitBlockedReason,
  isDefiniteResult,
  nextRrnRecheckConfirmed,
  recheckOutcome,
  resolveHistoryEntry,
  restoreDraft,
  submitOutcomeFromValidationErrors,
} from "@/app/c/[token]/flow-rules";

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

describe("isDefiniteResult — 확정 판정 아홉 / 결과 불명", () => {
  it.each([
    [{ data: { kind: "wrong", remaining: 4 } }],
    [{ data: { kind: "locked", limit: 5, unlockAtDisplay: "18:45", remainingSeconds: 180 } }],
    [{ data: { kind: "hardLocked" } }],
    [{ data: { kind: "ok" } }],
    [{ data: { kind: "submitted" } }],
    [{ data: { kind: "closed", reason: "manual", at: "2026-09-26T00:00:00Z" } }],
    [{ data: { kind: "expiredProof" } }],
    [{ data: { kind: "notFound" } }],
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

describe("recheckOutcome — 잠금 다시 확인 응답 → {next, focus}(4차 E3 계약)", () => {
  const both = ["visible", "button"] as const;

  it.each(both)("closed → E6-b · 단계 전환 포커스(%s)", (trigger) => {
    expect(recheckOutcome({ data: { kind: "closed", reason: "manual", at: "x" } }, trigger)).toEqual({
      next: "closed",
      focus: "step",
    });
  });

  it.each(both)("shortLocked → 묶음 안 짧은 잠김 · 포커스 묶음(%s)", (trigger) => {
    expect(
      recheckOutcome({ data: { kind: "shortLocked", unlockAt: "x", remainingSec: 100, limit: 5 } }, trigger),
    ).toEqual({ next: "shortLock", focus: "group" });
  });

  it.each(both)("open → 입력 살림 · 포커스 칸(%s)", (trigger) => {
    expect(recheckOutcome({ data: { kind: "open" } }, trigger)).toEqual({ next: "open", focus: "input" });
  });

  it("hardLocked — 버튼이면 포커스만 묶음, 보임이면 조용히", () => {
    expect(recheckOutcome({ data: { kind: "hardLocked" } }, "button")).toEqual({ next: "stay", focus: "group" });
    expect(recheckOutcome({ data: { kind: "hardLocked" } }, "visible")).toEqual({ next: "stay", focus: "none" });
  });

  it.each([[{ serverError: "boom" }], [undefined], [{ data: { kind: "weird" } }], [{ data: { kind: "submitted" } }]])(
    "실패 · 모르는 응답(%o) — 버튼이면 networkError + 묶음, 보임이면 조용히",
    (result) => {
      expect(recheckOutcome(result, "button")).toEqual({ next: "networkError", focus: "group" });
      expect(recheckOutcome(result, "visible")).toEqual({ next: "stay", focus: "none" });
    },
  );
});

describe("submitBlockedReason — 빈 칸 나열과 받침에 맞는 조사(/design-review)", () => {
  it.each([
    [["서명"], "서명을 해 주세요"],
    [["연락처", "동의"], "연락처 · 동의를 채우면 제출할 수 있습니다"],
    [["주민등록번호"], "주민등록번호를 채우면 제출할 수 있습니다"],
    [["이름", "서명"], "이름 · 서명을 채우면 제출할 수 있습니다"],
    [["주소"], "주소를 채우면 제출할 수 있습니다"],
  ] as const)("%o → %s", (missing, expected) => {
    expect(submitBlockedReason(missing)).toBe(expected);
  });

  it("빈 칸이 없으면 이유 없음", () => {
    expect(submitBlockedReason([])).toBeUndefined();
  });
});

// 04.3-06 Task 2 ① — 제출 결과 종류 · 되물음 표시 · 스키마 거절 → 칸 오류.
describe("isDefiniteResult — 제출 결과 종류(04.3-06)", () => {
  it.each([
    [{ data: { kind: "saved" } }],
    [{ data: { kind: "alreadySubmitted", maskedName: "김*늘", submittedAt: "2026-09-26T00:00:00Z" } }],
    [{ data: { kind: "invalid", fields: ["phone"] } }],
    [{ data: { kind: "rrnRecheck" } }],
    [{ validationErrors: { signaturePngBase64: { _errors: ["x"] } } }],
  ])("%o → true", (result) => {
    expect(isDefiniteResult(result)).toBe(true);
  });

  it.each([[{ data: { kind: "throttled" } }], [{ serverError: "x" }], [undefined], [{ data: { kind: "somethingElse" } }]])(
    "%o → false",
    (result) => {
      expect(isDefiniteResult(result)).toBe(false);
    },
  );
});

describe("nextRrnRecheckConfirmed — 되물음 표시는 값에 묶인다(codex-final3-B 2)", () => {
  it("되물음을 받은 값 그대로면 true", () => {
    expect(nextRrnRecheckConfirmed({ armedRrn: "9304122123458", rrn: "9304122123458" })).toBe(true);
  });

  it("값이 바뀌면 false", () => {
    expect(nextRrnRecheckConfirmed({ armedRrn: "9304122123458", rrn: "9304122123459" })).toBe(false);
  });

  it("되물음을 받은 적 없으면 false", () => {
    expect(nextRrnRecheckConfirmed({ armedRrn: null, rrn: "9304122123458" })).toBe(false);
  });
});

describe("submitOutcomeFromValidationErrors — 액션 스키마 거절을 칸 오류로", () => {
  it("서명 길이 초과 → invalid [signature](결과 불명이 아니다)", () => {
    expect(submitOutcomeFromValidationErrors({ signaturePngBase64: { _errors: ["too long"] } })).toEqual({
      kind: "invalid",
      fields: ["signature"],
    });
  });

  it("여러 칸은 E4 시각 순서(이름 먼저, 두 주민등록번호 칸은 rrn 하나)", () => {
    expect(
      submitOutcomeFromValidationErrors({
        signaturePngBase64: { _errors: ["x"] },
        rrnBack7: { _errors: ["x"] },
        rrnFront6: { _errors: ["x"] },
        name: { _errors: ["x"] },
        phone: { _errors: ["x"] },
      }),
    ).toEqual({ kind: "invalid", fields: ["name", "rrn", "phone", "signature"] });
  });

  // 검토 L5 — 수령자가 고칠 칸이 없는 거절은 확정 판정이다. 결과 불명 줄(「다시 눌러 주세요」)을
  // 띄우면 같은 본문을 다시 보내 같은 거절만 받는다 — 확인 시간 지남 길(E3 다시 확인)로 새 증표 ·
  // winnerVersion · 동의 판을 받는다.
  it.each([
    [{ idempotencyKey: { _errors: ["x"] }, winnerVersion: { _errors: ["x"] } }],
    [{ consentVersion: { _errors: ["x"] } }],
    [{ proof: { _errors: ["x"] }, retentionYears: { _errors: ["x"] } }],
    [{ _errors: ["root"] }],
  ])("화면에 칸이 없는 키만 오면 확인 시간 지남(E3 다시 확인) — %j", (errors) => {
    expect(submitOutcomeFromValidationErrors(errors)).toEqual({ kind: "expiredProof" });
  });

  it("validationErrors가 객체가 아니면(해석 불가) null — 결과 불명", () => {
    expect(submitOutcomeFromValidationErrors("oops")).toBeNull();
    expect(submitOutcomeFromValidationErrors(null)).toBeNull();
  });

  it("_errors가 비어 있는 칸은 세지 않는다", () => {
    expect(submitOutcomeFromValidationErrors({ name: { _errors: [] }, address: { _errors: ["x"] } })).toEqual({
      kind: "invalid",
      fields: ["address"],
    });
  });
});

// 검토 L7 — 확인 시간 지남 뒤 같은 자리 재확인은 값을 되살리지만, 동의는 그 판(동의 판 ·
// 보존 기간)에 한 것이다. 재확인이 다른 판을 주면 동의를 풀어 새 판에 다시 동의하게 한다.
describe("restoreDraft — 재확인 때 draft 되살림", () => {
  const offer = { consentVersion: "2026-09", retentionYears: 5 };
  const kept = { rowId: "row-a", name: "김하늘", consent: true, ...offer };

  it("다른 자리의 draft는 되살리지 않는다(null)", () => {
    expect(restoreDraft(kept, "row-b", offer)).toBeNull();
    expect(restoreDraft(null, "row-a", offer)).toBeNull();
  });

  it("같은 자리 · 같은 판이면 동의까지 그대로", () => {
    expect(restoreDraft(kept, "row-a", offer)).toEqual(kept);
  });

  it.each([
    ["동의 판이 바뀜", { consentVersion: "2026-10", retentionYears: 5 }],
    ["보존 기간이 바뀜", { consentVersion: "2026-09", retentionYears: 7 }],
  ])("%s → 동의만 풀고 나머지 값은 남긴다 · 새 판을 싣는다", (_label, next) => {
    expect(restoreDraft(kept, "row-a", next)).toEqual({ ...kept, ...next, consent: false });
  });
});
