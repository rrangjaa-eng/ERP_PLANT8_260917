import { describe, expect, it } from "vitest";
import { cardOwnerKind, InvalidCardOwnerError, type CardOwnerInput } from "@/domain/corp-cards";

// MAST-03 · 06-30(Q5 · C8): 카드 종류는 사람이 고른 값이다(promote). cardOwnerKind는
// FK 유무로 종류를 유도하지 않고, 고른 종류에 맞는 소유 칸 조합인지만 판정한다 —
// personal = 소지자만 · team = 팀만 · shared = 둘 다 없음. 06-27 DB CHECK
// corp_cards_owner_kind_check와 같은 세 조합이다. 뒤 플랜이 FK 유무로 종류를 다시
// 유도하면 이 표가 빨개진다(누락 입력이 조용히 공용으로 떨어지는 것을 막는 짝 불변).
describe("cardOwnerKind — 종류 셋 × 소유 칸 조합 (MAST-03 · 06-30, 단위)", () => {
  it.each<[string, CardOwnerInput, string]>([
    ["personal + 소지자만", { kind: "personal", holderUserId: "u1" }, "personal"],
    ["team + 팀만", { kind: "team", teamId: "t1" }, "team"],
    ["shared + 둘 다 없음", { kind: "shared" }, "shared"],
    ["shared + 둘 다 null", { kind: "shared", holderUserId: null, teamId: null }, "shared"],
  ])("%s → 통과", (_name, input, expected) => {
    expect(cardOwnerKind(input)).toBe(expected);
  });

  it.each<[string, CardOwnerInput]>([
    ["personal + 소지자 없음(누락 입력)", { kind: "personal" }],
    ["personal + 팀만", { kind: "personal", teamId: "t1" }],
    ["team + 팀 없음(누락 입력)", { kind: "team" }],
    ["team + 소지자 · 팀 둘 다", { kind: "team", holderUserId: "u1", teamId: "t1" }],
    ["personal + 소지자 · 팀 둘 다", { kind: "personal", holderUserId: "u1", teamId: "t1" }],
    ["shared + 팀", { kind: "shared", teamId: "t1" }],
    ["shared + 소지자", { kind: "shared", holderUserId: "u1" }],
  ])("%s → InvalidCardOwnerError", (_name, input) => {
    expect(() => cardOwnerKind(input)).toThrow(InvalidCardOwnerError);
  });

  it("거부 메시지는 고른 종류를 명사형으로 짚는다", () => {
    expect(() => cardOwnerKind({ kind: "shared", holderUserId: "u1" })).toThrow("소유 칸 조합 오류 · 공용에 맞는 칸만");
  });
});
