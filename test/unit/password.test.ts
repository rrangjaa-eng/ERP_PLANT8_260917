import { describe, expect, it } from "vitest";
import { COMMON_PASSWORDS, WeakPasswordError, validateNewPassword } from "@/domain/auth/password";

describe("validateNewPassword", () => {
  it("7자는 WeakPasswordError로 거부된다", () => {
    expect(() => validateNewPassword("abcdefg")).toThrow(WeakPasswordError);
  });

  it("8자는 통과한다(문자 조합 규칙 없음, 소문자만도 OK)", () => {
    expect(() => validateNewPassword("abcdefgh")).not.toThrow();
  });

  it("흔한 비밀번호는 대소문자와 무관하게 거부된다", () => {
    expect(() => validateNewPassword("password")).toThrow(WeakPasswordError);
    expect(() => validateNewPassword("12345678")).toThrow(WeakPasswordError);
    expect(() => validateNewPassword("PASSWORD")).toThrow(WeakPasswordError);
  });

  it("내장 흔한 비밀번호 목록은 50개 이상이다", () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(50);
  });

  it("목록에 password와 12345678이 들어 있다", () => {
    expect(COMMON_PASSWORDS.has("password")).toBe(true);
    expect(COMMON_PASSWORDS.has("12345678")).toBe(true);
  });
});
