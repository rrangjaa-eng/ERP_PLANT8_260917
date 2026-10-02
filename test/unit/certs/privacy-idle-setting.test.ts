import { describe, expect, it } from "vitest";
import { CERT_PRIVACY_IDLE_MINUTES } from "@/domain/settings/keys";

// 04.3-14 사용자 결정 ③ — 개인정보 화면 비활동 한도: 기본 30분 · 범위 10~30. 힌트는 플랜 「카피 계약」 문장 그대로.
describe("CERT_PRIVACY_IDLE_MINUTES 설정(사용자 결정 ③)", () => {
  it("기본값이 30이다", () => {
    expect(CERT_PRIVACY_IDLE_MINUTES.default).toBe(30);
  });

  it.each([10, 30])("%i은 받는다", (value) => {
    expect(CERT_PRIVACY_IDLE_MINUTES.schema.safeParse(value).success).toBe(true);
  });

  it.each([9, 31, 120])("%i은 거부한다", (value) => {
    expect(CERT_PRIVACY_IDLE_MINUTES.schema.safeParse(value).success).toBe(false);
  });

  it("힌트 문장이 카피 계약 그대로다", () => {
    expect(CERT_PRIVACY_IDLE_MINUTES.hint).toBe(
      "확인증 개인정보 화면에서 이 시간(분) 동안 활동이 없거나 로그인한 지 이 시간이 지난 뒤 처음 열면 로그인을 다시 요구합니다.",
    );
  });
});
