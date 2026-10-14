import { describe, expect, it } from "vitest";
import { AccountFieldsError, assertAccountFields, judgeAccountFields } from "@/domain/vendors/account-fields";

// 06.5 D-6506 · REVIEWS DH-3: 계좌 칸 저장 판정 — 바꾼 칸만, 저장 뒤 실효값으로.
const HOLDER_REQUIRED = "예금주 없음 · 예금주 적기";
const EMPTY = { bank: null, holder: null, hasNumber: false };

describe("judgeAccountFields — 예금주 필요(①)", () => {
  it("저장값 없음 · 은행 + 번호 set + 빈 예금주 → 예금주 없음", () => {
    expect(judgeAccountFields({ stored: EMPTY, next: { bank: "신한", holder: "", number: "set" } })).toEqual({
      accountHolder: HOLDER_REQUIRED,
    });
  });

  it("공백뿐인 예금주도 빈 값으로 본다", () => {
    expect(judgeAccountFields({ stored: EMPTY, next: { bank: "신한", holder: "  ", number: "set" } })).toEqual({
      accountHolder: HOLDER_REQUIRED,
    });
  });

  it("은행이 없으면 번호가 있어도 예금주가 필요 없다", () => {
    expect(judgeAccountFields({ stored: EMPTY, next: { bank: null, holder: null, number: "set" } })).toEqual({});
  });

  it("은행만 있고 keep(저장 번호 없음)이면 예금주가 필요 없다", () => {
    expect(judgeAccountFields({ stored: EMPTY, next: { bank: "신한", holder: undefined, number: "keep" } })).toEqual({});
  });

  it("셋 다 있으면 통과", () => {
    expect(judgeAccountFields({ stored: EMPTY, next: { bank: "신한", holder: "김직원", number: "set" } })).toEqual({});
  });

  it("DH-3 stale — 옛 행(은행 + 번호 + 빈 예금주)을 세 칸 손대지 않고 저장하면 막지 않는다", () => {
    const stored = { bank: "신한", holder: null, hasNumber: true };
    expect(judgeAccountFields({ stored, next: { bank: "신한", holder: "", number: "keep" } })).toEqual({});
  });

  it("D-6506 — 예금주만 지운 저장(keep)은 거절", () => {
    const stored = { bank: "신한", holder: "김직원", hasNumber: true };
    expect(judgeAccountFields({ stored, next: { bank: "신한", holder: "", number: "keep" } })).toEqual({
      accountHolder: HOLDER_REQUIRED,
    });
  });

  it("번호를 지우면서 예금주를 비우면 통과(저장 뒤 번호 없음)", () => {
    const stored = { bank: "신한", holder: "김직원", hasNumber: true };
    expect(judgeAccountFields({ stored, next: { bank: "신한", holder: "", number: "clear" } })).toEqual({});
  });
});

describe("assertAccountFields", () => {
  it("오류가 있으면 칸 오류 묶음을 실은 AccountFieldsError를 던진다", () => {
    let caught: unknown;
    try {
      assertAccountFields({ stored: EMPTY, next: { bank: "신한", holder: null, number: "set" } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AccountFieldsError);
    expect((caught as AccountFieldsError).fieldErrors).toEqual({ accountHolder: HOLDER_REQUIRED });
  });

  it("오류가 없으면 던지지 않는다", () => {
    expect(() => assertAccountFields({ stored: EMPTY, next: { bank: "신한", holder: "김직원", number: "set" } })).not.toThrow();
  });
});
