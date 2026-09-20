import { describe, expect, it } from "vitest";
import { cardOwnerKind, InvalidCardOwnerError } from "@/domain/corp-cards";

// MAST-03: 법인카드 소유 규칙 — 소지자만 있으면 personal, 팀만 있으면 team,
// 둘 다 있거나 둘 다 없으면 거부. 순수·동기 함수라 DB 없이 돈다.
describe("cardOwnerKind (MAST-03, 단위)", () => {
  it("소지자만 있으면 personal이다", () => {
    expect(cardOwnerKind({ holderUserId: "u1", teamId: null })).toBe("personal");
  });

  it("팀만 있으면 team이다", () => {
    expect(cardOwnerKind({ holderUserId: null, teamId: "team-1" })).toBe("team");
  });

  it("둘 다 있으면 거부된다", () => {
    expect(() => cardOwnerKind({ holderUserId: "u1", teamId: "team-1" })).toThrow(InvalidCardOwnerError);
  });

  it("둘 다 없으면 거부된다", () => {
    expect(() => cardOwnerKind({ holderUserId: null, teamId: null })).toThrow(InvalidCardOwnerError);
  });
});
