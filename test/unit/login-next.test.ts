import { describe, expect, it } from "vitest";
import { PRIVACY_LOGIN_REASON, loginDestination, privacyLoginHref, safeLoginNext } from "@/lib/login-next";

// 04.3-14 사용자 결정 U5 a — 개인정보 화면에서 끊긴 뒤 다시 로그인하면 원래 보던 I4 · 인쇄로 돌아간다. 되돌아갈 곳은 같은
// 출처의 확인증 화면 두 경로만 받는다(열린 리디렉션 없음 — T-04.3-311).
const ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";

describe("safeLoginNext", () => {
  it.each([`/certs/submissions/${ID}`, `/print/certs/${ID}`])("%s는 그대로 돌려준다", (path) => {
    expect(safeLoginNext(path)).toBe(path);
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "/account",
    "/certs/submissions/../account",
    "/certs/submissions/not-a-uuid",
    `/certs/submissions/${ID}/../../account`,
    `/certs/submissions/${ID}?x=1`,
    `https://evil.example/certs/submissions/${ID}`,
    "",
    "%2F%2Fevil.example",
    encodeURIComponent(`/certs/submissions/${ID}`),
  ])("%s는 null이다", (raw) => {
    expect(safeLoginNext(raw)).toBeNull();
  });

  it("값이 없으면 null이다", () => {
    expect(safeLoginNext(undefined)).toBeNull();
  });
});

describe("privacyLoginHref", () => {
  it("이유 privacy-session과 인코딩한 next를 붙인다", () => {
    expect(PRIVACY_LOGIN_REASON).toBe("privacy-session");
    expect(privacyLoginHref(`/certs/submissions/${ID}`)).toBe(
      `/login?reason=privacy-session&next=${encodeURIComponent(`/certs/submissions/${ID}`)}`,
    );
  });
});

// G0 DR-12 — 이메일 로그인 성공 이동과 Google 버튼의 callbackURL이 같은 값이다.
describe("loginDestination", () => {
  it("허용된 next가 있으면 그 경로, 없으면 /account", () => {
    expect(loginDestination(`/print/certs/${ID}`)).toBe(`/print/certs/${ID}`);
    expect(loginDestination(null)).toBe("/account");
  });
});
