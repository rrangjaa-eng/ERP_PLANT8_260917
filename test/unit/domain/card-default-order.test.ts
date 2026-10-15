import { describe, expect, it } from "vitest";
import { pickDefaultCardId, type DefaultCardOption } from "@/domain/corp-card-usages/default-card";

// 06-33(G-06-B · 사용자 카드 2026-10-06 20:42 「순서 더하기」): 카드 사용 새 건 카드 기본값 순서 — 직전 → 본인 개인(한 장) → 오늘 팀 카드(한 장) → 옵션 한 장 → 빈칸

const personal = (id: string, own = true): DefaultCardOption => ({ id, kind: "personal", own });
const team = (id: string, own = true): DefaultCardOption => ({ id, kind: "team", own });
const shared = (id: string): DefaultCardOption => ({ id, kind: "shared", own: false });

describe("G-06-B 카드 기본값 순서", () => {
  it("개인 P · 팀 T · 직전 없음 → P", () => {
    expect(pickDefaultCardId({ options: [personal("P"), team("T")], lastCardId: null })).toBe("P");
  });

  it("직전 = T(옵션 안) → T(직전 우선)", () => {
    expect(pickDefaultCardId({ options: [personal("P"), team("T")], lastCardId: "T" })).toBe("T");
  });

  it("직전 = 옵션 밖 X → P(건너뜀)", () => {
    expect(pickDefaultCardId({ options: [personal("P"), team("T")], lastCardId: "X" })).toBe("P");
  });

  it("팀 T(own) + 남의 개인 Q · 직전 없음 → T", () => {
    expect(pickDefaultCardId({ options: [team("T"), personal("Q", false)], lastCardId: null })).toBe("T");
  });

  it("개인 두 장 + 팀 한 장 → 빈칸(A-1: 팀으로 내려가지 않는다)", () => {
    expect(pickDefaultCardId({ options: [personal("P1"), personal("P2"), team("T")], lastCardId: null })).toBeNull();
  });

  it("팀 두 장(own) + 남의 카드 → 빈칸", () => {
    expect(pickDefaultCardId({ options: [team("T1"), team("T2"), personal("Q", false)], lastCardId: null })).toBeNull();
  });

  it("옵션 한 장(공용 S) → S", () => {
    expect(pickDefaultCardId({ options: [shared("S")], lastCardId: null })).toBe("S");
  });

  it("공용 S + 남의 개인 Q → 빈칸", () => {
    expect(pickDefaultCardId({ options: [shared("S"), personal("Q", false)], lastCardId: null })).toBeNull();
  });

  it("빈 옵션 → 빈칸", () => {
    expect(pickDefaultCardId({ options: [], lastCardId: "X" })).toBeNull();
  });
});
