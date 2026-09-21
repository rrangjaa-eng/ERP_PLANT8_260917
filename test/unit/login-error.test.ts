import { describe, it, expect } from "vitest";
import { GENERIC_ERROR, loginErrorMessage } from "@/app/(auth)/login/login-error";

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
    const locked = "로그인 시도가 너무 많습니다. 15분 뒤 다시 시도하거나 관리자에게 문의하세요.";
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
    const locked = "로그인 시도가 너무 많습니다. 15분 뒤 다시 시도하거나 관리자에게 문의하세요.";
    expect(loginErrorMessage({ status: 403, message: locked })).toBe(locked);
  });
});
