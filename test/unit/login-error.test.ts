import { describe, it, expect } from "vitest";
import { GENERIC_ERROR, loginErrorMessage } from "@/app/(auth)/login/login-error";
import { isLockedMessage, lockedMessage } from "@/domain/auth/locked-message";

// SYSTEM.md §6-7 A②·A③ — 실패 문구는 한국어 한 문장이고, 계정 잠금만 같은 자리에
// 서버 문구를 그대로 보인다. better-auth의 영문 메시지가 화면에 새어 나오면 안 된다.
describe("loginErrorMessage (§6-7 A②·A③)", () => {
  it("A②: 자격 증명 오류(401)의 better-auth 영문 메시지를 한국어 문구로 접는다", () => {
    expect(loginErrorMessage({ status: 401, message: "Invalid email or password" })).toBe(
      "이메일 또는 비밀번호가 올바르지 않습니다.",
    );
  });

  it("A②: message가 없어도 같은 한국어 문구다", () => {
    expect(loginErrorMessage({ status: 401 })).toBe(GENERIC_ERROR);
    expect(loginErrorMessage(null)).toBe(GENERIC_ERROR);
    expect(loginErrorMessage(undefined)).toBe(GENERIC_ERROR);
  });

  it("A③: 계정 잠금(403)은 서버가 준 문구를 그대로 보인다 — 잠긴 사용자가 비밀번호를 계속 고쳐 보는 것을 막는다", () => {
    const locked = lockedMessage(15);
    expect(loginErrorMessage({ status: 403, message: locked })).toBe(locked);
  });

  it("403인데 문구가 비어 있으면 일반 문구로 되돌린다 — 빈 alert를 렌더하지 않는다", () => {
    expect(loginErrorMessage({ status: 403 })).toBe(GENERIC_ERROR);
    expect(loginErrorMessage({ status: 403, message: "" })).toBe(GENERIC_ERROR);
  });

  it("500(client-ip 누락 등)도 영문 누출을 막기 위해 일반 문구로 접는다", () => {
    expect(loginErrorMessage({ status: 500, message: "Internal Server Error" })).toBe(GENERIC_ERROR);
  });

  // /review L-3: 판정 기준이 상태 코드 하나였다. 잠금 문구만 통과시키려는
  // 의도인데, better-auth가 오리진 불일치 같은 다른 이유로 내는 403의 영문
  // 메시지도 그대로 새어 나간다 — 사용자는 「Invalid origin」을 보고 아무것도
  // 할 수 없고, 서버 구성 정보만 노출된다.
  it("L-3: 잠금이 아닌 403(오리진 불일치 등)의 영문 메시지는 접는다", () => {
    expect(loginErrorMessage({ status: 403, message: "Invalid origin" })).toBe(GENERIC_ERROR);
    expect(loginErrorMessage({ status: 403, message: "CSRF token mismatch" })).toBe(GENERIC_ERROR);
  });

  it("L-3: 잠금 문구는 그대로 보인다 — 잠긴 줄 모르고 비밀번호만 고쳐 보게 두지 않는다", () => {
    const locked = lockedMessage(15);
    expect(loginErrorMessage({ status: 403, message: locked })).toBe(locked);
  });

  // 04.2-03: 분 숫자는 설정값이라 정확 대조 대신 고정 접두어·접미어로 판정한다.
  it("설정 분 숫자가 바뀐 잠금 문구(403)도 그대로 보인다", () => {
    expect(loginErrorMessage({ status: 403, message: lockedMessage(20) })).toBe(lockedMessage(20));
  });

  it("잠금 문구라도 403이 아니면 일반 문구로 접는다", () => {
    expect(loginErrorMessage({ status: 401, message: lockedMessage(20) })).toBe(GENERIC_ERROR);
  });
});

describe("lockedMessage · isLockedMessage (04.2-03)", () => {
  it("분 숫자를 문장에 넣는다", () => {
    expect(lockedMessage(20)).toBe("로그인 시도가 너무 많습니다. 20분 뒤 다시 시도하거나 관리자에게 문의하세요.");
  });

  it("15분이면 옛 문구와 글자 하나까지 같다", () => {
    expect(lockedMessage(15)).toBe("로그인 시도가 너무 많습니다. 15분 뒤 다시 시도하거나 관리자에게 문의하세요.");
  });

  it("소수 분은 정수로 표시한다", () => {
    expect(lockedMessage(20.7)).toBe(lockedMessage(20));
  });

  it("잠금 문구를 알아본다", () => {
    expect(isLockedMessage(lockedMessage(7))).toBe(true);
  });

  it("다른 문장·숫자 없는 자리·숫자가 아닌 자리는 잠금 문구가 아니다", () => {
    expect(isLockedMessage("Invalid origin")).toBe(false);
    expect(isLockedMessage("로그인 시도가 너무 많습니다. 분 뒤 다시 시도하거나 관리자에게 문의하세요.")).toBe(false);
    expect(isLockedMessage("로그인 시도가 너무 많습니다. 십오분 뒤 다시 시도하거나 관리자에게 문의하세요.")).toBe(false);
    expect(isLockedMessage("로그인 시도가 너무 많습니다. 1.5분 뒤 다시 시도하거나 관리자에게 문의하세요.")).toBe(false);
  });
});
