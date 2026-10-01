import { describe, expect, it } from "vitest";
import {
  submitBlockedReason,
  isDefiniteResult,
  nextRrnRecheckConfirmed,
  resolveHistoryEntry,
  submitOutcomeFromValidationErrors,
} from "@/app/c/[token]/flow-rules";

// 04.3-03 Task 2a ③ — 외부 수령자 흐름의 순수 판정(브라우저 API 없음).
// 04.3-15 — 명단 · 확인 단계가 없어져 기록 단계는 pick · form · result(렌더 E2′ · E4 · result)다.

describe("resolveHistoryEntry — 고아 기록 항목", () => {
  it("E4 항목인데 메모리에 단계가 없으면 E2′를 그리고 뒤로 간다", () => {
    expect(resolveHistoryEntry({ stateStep: "form", memoryStep: null })).toEqual({ render: "E2′", back: true });
  });

  it("결과 항목인데 메모리에 단계가 없어도 같다", () => {
    expect(resolveHistoryEntry({ stateStep: "result", memoryStep: null })).toEqual({ render: "E2′", back: true });
  });

  it("기록 단계가 없거나 pick 항목이면 E2′, 뒤로 가지 않는다", () => {
    expect(resolveHistoryEntry({ stateStep: null, memoryStep: null })).toEqual({ render: "E2′", back: false });
    expect(resolveHistoryEntry({ stateStep: "pick", memoryStep: null })).toEqual({ render: "E2′", back: false });
  });

  it("메모리와 항목이 같은 E4면 E4 그대로", () => {
    expect(resolveHistoryEntry({ stateStep: "form", memoryStep: "form" })).toEqual({ render: "E4", back: false });
  });
});

describe("isDefiniteResult — 확정 판정 / 결과 불명(04.3-15 새 결과 유니온)", () => {
  it.each([
    [{ data: { kind: "saved" } }],
    [{ data: { kind: "invalid", fields: ["phone"] } }],
    [{ data: { kind: "rrnRecheck" } }],
    [{ data: { kind: "closed", reason: "manual", at: "2026-09-26T00:00:00Z" } }],
    [{ data: { kind: "notFound" } }],
    [{ data: { kind: "notYetOpen" } }],
    [{ data: { kind: "prizeGone", prizes: [] } }],
    [{ data: { kind: "termsChanged", terms: { consentVersion: "v2", retentionYears: 5 } } }],
    [{ validationErrors: { signaturePngBase64: { _errors: ["x"] } } }],
  ])("%o → true", (result) => {
    expect(isDefiniteResult(result)).toBe(true);
  });

  it.each([
    [{ data: { kind: "wrong" } }],
    [{ data: { kind: "ok" } }],
    [{ data: { kind: "expiredProof" } }],
    [{ data: { kind: "alreadySubmitted" } }],
  ])("옛 확인 결과 종류(%o)는 더 이상 확정 판정이 아니다", (result) => {
    expect(isDefiniteResult(result)).toBe(false);
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

// 04.3-06 Task 2 ① — 되물음 표시 · 스키마 거절 → 칸 오류.
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

  // 04.3-15 — 확인 단계(새 증표)가 없어져, 수령자가 고칠 칸이 없는 거절(경품 id · 멱등 키 · 안내 판처럼
  // 페이지가 만든 값만)은 결과 불명 줄로 둔다(값을 잃지 않는 쪽 — 갈래 화면은 04.3-16).
  it.each([
    [{ idempotencyKey: { _errors: ["x"] } }],
    [{ consentVersion: { _errors: ["x"] } }],
    [{ prizeId: { _errors: ["x"] }, retentionYears: { _errors: ["x"] } }],
    [{ _errors: ["root"] }],
  ])("화면에 칸이 없는 키만 오면 null(결과 불명) — %j", (errors) => {
    expect(submitOutcomeFromValidationErrors(errors)).toBeNull();
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
