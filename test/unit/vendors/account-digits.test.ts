import { describe, expect, it } from "vitest";
import { accountNumberLast4, normalizeAccountDigits } from "@/domain/vendors/account-digits";
import { accountFieldsChanged } from "@/domain/vendors/account-fields";

// 07-20 C-35(D-713): 계좌번호는 숫자만 10~16자리 — 서버 판정과 패널 blur가 같은 함수.
describe("normalizeAccountDigits — 하이픈 · 공백 제거 · 10~16자리", () => {
  it("하이픈 · 공백을 지운 숫자를 돌려준다", () => {
    expect(normalizeAccountDigits("110-123 456789")).toEqual({ value: "110123456789", error: null });
    expect(normalizeAccountDigits(" 1101234567 ")).toEqual({ value: "1101234567", error: null });
    expect(normalizeAccountDigits("1234567890123456")).toEqual({ value: "1234567890123456", error: null });
  });

  it("9자리 · 17자리 · 글자 섞임은 `숫자 10~16자리 · 다시 입력`", () => {
    for (const raw of ["123456789", "12345678901234567", "110-12a-456789", "１１０１２３４５６７"]) {
      expect(normalizeAccountDigits(raw).error, raw).toBe("숫자 10~16자리 · 다시 입력");
    }
  });

  it("빈 값은 빈 값(필수 판정은 계좌 칸 판정이 한다)", () => {
    expect(normalizeAccountDigits("")).toEqual({ value: "", error: null });
    expect(normalizeAccountDigits(" - ")).toEqual({ value: "", error: null });
  });
});

// F6(07-11 넘김): 계좌 변경 기록 · 마스킹의 뒤 4자리 — 숫자 4자리가 안 되면 null(CHECK `^[0-9]{4}$` 또는 NULL).
describe("accountNumberLast4 — 숫자 끝 4자리 · 4자리 미만은 null", () => {
  it("숫자만 뽑아 끝 4자리", () => {
    expect(accountNumberLast4("110-222-334455")).toBe("4455");
    expect(accountNumberLast4("4455")).toBe("4455");
  });

  it("숫자가 4자리 미만이거나 없으면 null", () => {
    expect(accountNumberLast4("-123")).toBeNull();
    expect(accountNumberLast4("12")).toBeNull();
    expect(accountNumberLast4("")).toBeNull();
    expect(accountNumberLast4(null)).toBeNull();
  });
});

// R8 · B-P2-4: 계좌 세 칸(은행 · 예금주 · 번호)이 저장값과 다를 때만 `vendors.account` 판정을 한다.
describe("accountFieldsChanged — 세 칸 비교", () => {
  const stored = { bank: "신한", holder: "홍길동", hasNumber: true };

  it("셋 다 같으면 거짓(앞뒤 공백 · 빈 칸은 present 비교)", () => {
    expect(accountFieldsChanged({ stored, next: { bank: " 신한", holder: "홍길동 ", number: "keep" } })).toBe(false);
  });

  it("예금주만 다르면 참", () => {
    expect(accountFieldsChanged({ stored, next: { bank: "신한", holder: "김철수", number: "keep" } })).toBe(true);
  });

  it("번호 keep + 은행 · 예금주 같음 → 거짓 · 번호 set · clear → 참", () => {
    expect(accountFieldsChanged({ stored, next: { bank: "신한", holder: "홍길동", number: "keep" } })).toBe(false);
    expect(accountFieldsChanged({ stored, next: { bank: "신한", holder: "홍길동", number: "set" } })).toBe(true);
    expect(accountFieldsChanged({ stored, next: { bank: "신한", holder: "홍길동", number: "clear" } })).toBe(true);
  });

  it("은행을 비우면 참", () => {
    expect(accountFieldsChanged({ stored, next: { bank: "", holder: "홍길동", number: "keep" } })).toBe(true);
  });
});
