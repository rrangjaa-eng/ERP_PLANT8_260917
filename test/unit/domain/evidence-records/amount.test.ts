import { describe, expect, it } from "vitest";
import { amountLockOf, resolveEditedAmounts } from "@/domain/evidence-records/amount";

// 06.1-07(PA-AMT · D-6106 · E13 · RP-13): 증빙 기록 금액 고침 — 합계(파일 값)는 고정, 공급가만 바꾸고 세액 = 합계 − 공급가(domain/money).
// 금액 잠김(E7 · DB-3 · 사용자 결정 2026-10-05) — 작성 중 > 결재 중 > 지급 완료 > 종결 > 승인됨. 완료 프로젝트는 잠김을 바꾸지 않는다.

describe("resolveEditedAmounts", () => {
  it("합계 1,100,000 · 공급가 1,000,000 → 세액 100,000 · 합계 그대로", () => {
    expect(resolveEditedAmounts({ totalKrw: 1_100_000, supplyKrw: 1_000_000 })).toEqual({ ok: true, amounts: { supplyKrw: 1_000_000, vatKrw: 100_000, totalKrw: 1_100_000 } });
  });

  it("공급가 = 합계 → 세액 0(면세)", () => {
    expect(resolveEditedAmounts({ totalKrw: 500_000, supplyKrw: 500_000 })).toEqual({ ok: true, amounts: { supplyKrw: 500_000, vatKrw: 0, totalKrw: 500_000 } });
  });

  it("공급가가 합계보다 큼 → 오류", () => {
    expect(resolveEditedAmounts({ totalKrw: 1_100_000, supplyKrw: 1_100_001 })).toEqual({ ok: false, reason: "공급가가 합계보다 큼" });
  });

  it("취소 줄: 합계 −55,000 · 공급가 −50,000 → 세액 −5,000", () => {
    expect(resolveEditedAmounts({ totalKrw: -55_000, supplyKrw: -50_000 })).toEqual({ ok: true, amounts: { supplyKrw: -50_000, vatKrw: -5_000, totalKrw: -55_000 } });
  });

  it("취소 줄 공급가 절댓값이 합계보다 큼 → 오류", () => {
    expect(resolveEditedAmounts({ totalKrw: -55_000, supplyKrw: -55_001 })).toEqual({ ok: false, reason: "공급가가 합계보다 큼" });
  });

  it("부호 다름 → 오류(양수 합계 · 음수 공급가, 음수 합계 · 양수 공급가)", () => {
    expect(resolveEditedAmounts({ totalKrw: 1_100_000, supplyKrw: -1 })).toEqual({ ok: false, reason: "공급가 부호 다름" });
    expect(resolveEditedAmounts({ totalKrw: -55_000, supplyKrw: 1 })).toEqual({ ok: false, reason: "공급가 부호 다름" });
  });

  it("0 합계 · 0 공급가 → 세액 0 · 0 합계에 0 아닌 공급가 → 오류", () => {
    expect(resolveEditedAmounts({ totalKrw: 0, supplyKrw: 0 })).toEqual({ ok: true, amounts: { supplyKrw: 0, vatKrw: 0, totalKrw: 0 } });
    expect(resolveEditedAmounts({ totalKrw: 0, supplyKrw: 1 }).ok).toBe(false);
  });

  it("공급가가 withinKrwColumn 밖 → 기존 금액 상한 문구(E13 — 1조 원 미만, RP-13)", () => {
    const result = resolveEditedAmounts({ totalKrw: 1_100_000, supplyKrw: 1_000_000_000_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^금액 상한 초과 · /);
  });

  it("정수가 아닌 공급가 → 숫자 형식 오류", () => {
    expect(resolveEditedAmounts({ totalKrw: 1_100_000, supplyKrw: 1.5 })).toEqual({ ok: false, reason: "숫자 형식 오류 · 12,400,000처럼" });
    expect(resolveEditedAmounts({ totalKrw: 1_100_000, supplyKrw: Number.NaN }).ok).toBe(false);
  });
});

describe("amountLockOf", () => {
  const cases: Array<[string, Parameters<typeof amountLockOf>[0], string | null]> = [
    ["결재 중", { owner: { phase: "in_review", projectCompleted: false }, paid: false }, "결재 중 문서에 붙음 · 금액 잠김"],
    ["승인", { owner: { phase: "approved", projectCompleted: false }, paid: false }, "승인됨 문서에 붙음 · 금액 잠김"],
    ["승인 + 지급", { owner: { phase: "approved", projectCompleted: false }, paid: true }, "지급 완료 문서에 붙음 · 금액 잠김"],
    ["종결", { owner: { phase: "closed", projectCompleted: false }, paid: false }, "종결 문서에 붙음 · 금액 잠김"],
    ["종결 + 지급(지급 완료가 앞)", { owner: { phase: "closed", projectCompleted: false }, paid: true }, "지급 완료 문서에 붙음 · 금액 잠김"],
    ["반려 · 회수", { owner: { phase: "returned", projectCompleted: false }, paid: false }, null],
    ["작성 중(번호 없는 임시 문서 — Round 2 eng B-P2)", { pending: true }, "작성 중 문서에 붙음 · 금액 잠김"],
  ];

  it.each(cases)("%s", (_label, input, expected) => {
    expect(amountLockOf(input)).toBe(expected);
  });

  it.each(cases.filter(([, input]) => !("pending" in input)))("%s — 완료 프로젝트여도 같은 값(사용자 결정 2026-10-05 「사후 처리 열기」)", (_label, input, expected) => {
    if ("pending" in input) throw new Error("갈래 밖");
    expect(amountLockOf({ owner: { ...input.owner, projectCompleted: true }, paid: input.paid })).toBe(expected);
  });
});
