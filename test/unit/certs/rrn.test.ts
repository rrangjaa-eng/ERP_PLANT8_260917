import { describe, expect, it } from "vitest";
import { validateRrn } from "@/domain/certs/rrn";

// 04.3-02 Task 3 ① — 검증번호(2020-10 이전 발급분)·5~8(외국인)·9·0(1800년대,
// 거부)·미래 날짜 경계까지 채운 전체 규칙. 검증번호는 판정만 하고 거부하지
// 않는다(생년월일로는 발급 시점을 알 수 없다 — CONTEXT 31행).
describe("domain/certs/rrn validateRrn", () => {
  const NOW = new Date("2026-09-26T00:00:00Z");

  it("930412-2123458 → match(검증번호 계산이 실제 뒷자리와 일치)", () => {
    expect(validateRrn("930412", "2123458", NOW)).toEqual({
      ok: true,
      birthDate: "1993-04-12",
      checkDigit: "match",
    });
  });

  it("930412-2123459 → ok + mismatch(거부가 아니다 — 2020-10 뒤 재발급 가능성)", () => {
    expect(validateRrn("930412", "2123459", NOW)).toEqual({
      ok: true,
      birthDate: "1993-04-12",
      checkDigit: "mismatch",
    });
  });

  it("930231-1234567 → 거부(없는 날짜)", () => {
    expect(validateRrn("930231", "1234567", NOW)).toEqual({ ok: false });
  });

  it.each([
    ["5", "1900년대(외국인)"],
    ["6", "1900년대(외국인)"],
  ])("뒷자리 첫 숫자 %s(%s) → notApplicable, 거부하지 않는다", (digit) => {
    const result = validateRrn("930412", `${digit}123456`, NOW);
    expect(result).toEqual({ ok: true, birthDate: "1993-04-12", checkDigit: "notApplicable" });
  });

  it.each([
    ["7", "2000년대(외국인)"],
    ["8", "2000년대(외국인)"],
  ])("뒷자리 첫 숫자 %s(%s) → notApplicable, 거부하지 않는다", (digit) => {
    const result = validateRrn("050101", `${digit}123456`, NOW);
    expect(result).toEqual({ ok: true, birthDate: "2005-01-01", checkDigit: "notApplicable" });
  });

  it.each([["9"], ["0"]])("뒷자리 첫 숫자 %s(1800년대) → 거부", (digit) => {
    expect(validateRrn("930412", `${digit}123456`, NOW)).toEqual({ ok: false });
  });

  it("미래 날짜(991231 + 성별 3 → 2099-12-31)는 거부한다", () => {
    expect(validateRrn("991231", "3123456", NOW)).toEqual({ ok: false });
  });

  it("2020-10-01 출생(성별 3) + 아무 끝자리 → notApplicable(그 뒤 발급이 확실하다)", () => {
    expect(validateRrn("201001", "3123456", NOW)).toEqual({
      ok: true,
      birthDate: "2020-10-01",
      checkDigit: "notApplicable",
    });
  });

  it("2020-09-30 출생(성별 3) + 맞는 끝자리 → match", () => {
    expect(validateRrn("200930", "3123451", NOW)).toEqual({
      ok: true,
      birthDate: "2020-09-30",
      checkDigit: "match",
    });
  });

  it("2020-09-30 출생(성별 3) + 틀린 끝자리 → ok + mismatch(거부 아님)", () => {
    expect(validateRrn("200930", "3123452", NOW)).toEqual({
      ok: true,
      birthDate: "2020-09-30",
      checkDigit: "mismatch",
    });
  });

  it("형식이 아니면(자릿수 틀림) 거부한다", () => {
    expect(validateRrn("93041", "2123458", NOW)).toEqual({ ok: false });
    expect(validateRrn("930412", "212345", NOW)).toEqual({ ok: false });
  });
});
