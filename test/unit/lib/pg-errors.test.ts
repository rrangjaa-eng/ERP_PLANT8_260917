import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/lib/pg-errors";

// defect 1 특정 사례: 같은 발급사·뒤 4자리로 법인카드를 두 번 등록하면 drizzle이
// DrizzleQueryError(message에 SQL·바인딩 값 포함)를 던지고, 그 .cause가 원본
// pg DatabaseError(code 23505, constraint 이름)다(node-postgres pg-protocol
// 실측 — message.code = fields.C, message.constraint = fields.n). 이 판정
// 함수는 그 .cause를 보고 "이 특정 unique 제약 위반인가"만 판단한다 — 실제
// DB 없이 단위 테스트가 돌아야 하므로 합성 객체로 모양만 흉내낸다.
function fakeDrizzleQueryError(cause: unknown): Error {
  const err = new Error("Failed query: insert into ...\nparams: ...");
  (err as { cause?: unknown }).cause = cause;
  return err;
}

describe("isUniqueViolation", () => {
  it("cause에 일치하는 code·constraint가 있으면 true다", () => {
    const error = fakeDrizzleQueryError({ code: "23505", constraint: "corp_cards_issuer_last4_key" });
    expect(isUniqueViolation(error, "corp_cards_issuer_last4_key")).toBe(true);
  });

  it("constraint 이름이 다르면 false다(다른 unique 제약과 혼동하지 않는다)", () => {
    const error = fakeDrizzleQueryError({ code: "23505", constraint: "users_email_key" });
    expect(isUniqueViolation(error, "corp_cards_issuer_last4_key")).toBe(false);
  });

  it("code가 23505가 아니면 false다(다른 종류의 DB 오류)", () => {
    const error = fakeDrizzleQueryError({ code: "23503", constraint: "corp_cards_issuer_last4_key" });
    expect(isUniqueViolation(error, "corp_cards_issuer_last4_key")).toBe(false);
  });

  it("cause가 없는 평범한 Error는 false다", () => {
    expect(isUniqueViolation(new Error("아무 오류"), "corp_cards_issuer_last4_key")).toBe(false);
  });

  it("Error가 아닌 값이 와도 던지지 않고 false를 반환한다", () => {
    expect(isUniqueViolation("문자열", "corp_cards_issuer_last4_key")).toBe(false);
    expect(isUniqueViolation(null, "corp_cards_issuer_last4_key")).toBe(false);
  });

  it("cause 없이 code·constraint가 오류 자체에 바로 있어도(래핑 안 된 경우) 감지한다", () => {
    const direct = new Error("duplicate key value violates unique constraint") as Error & {
      code?: string;
      constraint?: string;
    };
    direct.code = "23505";
    direct.constraint = "corp_cards_issuer_last4_key";
    expect(isUniqueViolation(direct, "corp_cards_issuer_last4_key")).toBe(true);
  });
});
