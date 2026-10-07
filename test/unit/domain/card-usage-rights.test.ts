import { describe, expect, it } from "vitest";
import { cardUsageRights } from "@/domain/corp-card-usages/rights";

// 06-09 O-11(확정 — U-6): 카드 사용 수정 · 연결 변경 · 삭제 권리 한 함수.
const ALL = { edit: true, changeLink: true, delete: true };
const NONE = { edit: false, changeLink: false, delete: false };

describe("cardUsageRights(O-11)", () => {
  it("등록자 · 미완료 → 셋 다 참", () => {
    expect(cardUsageRights({ registeredBy: "u1", registeredVia: "self", projectCompleted: false }, { userId: "u1", proxy: false })).toEqual(ALL);
  });

  it("대리 등록 권한자(등록자 아님) → 셋 다 참", () => {
    expect(cardUsageRights({ registeredBy: "u1", registeredVia: "self", projectCompleted: false }, { userId: "p1", proxy: true })).toEqual(ALL);
  });

  it("등록자도 권한자도 아님 → 셋 다 거짓", () => {
    expect(cardUsageRights({ registeredBy: "u1", registeredVia: "proxy", projectCompleted: false }, { userId: "u2", proxy: false })).toEqual(NONE);
  });

  it("완료 프로젝트 줄 · 등록자 · 권한자 아님 → 셋 다 거짓", () => {
    expect(cardUsageRights({ registeredBy: "u1", registeredVia: "self", projectCompleted: true }, { userId: "u1", proxy: false })).toEqual(NONE);
  });

  it("완료 프로젝트 줄 · 권한자 → 셋 다 참(U-4)", () => {
    expect(cardUsageRights({ registeredBy: "u1", registeredVia: "proxy", projectCompleted: true }, { userId: "p1", proxy: true })).toEqual(ALL);
  });

  it("구매 완료로 생긴 건 · 등록자 또는 권한자 → 수정만(연결 변경 · 삭제 없음)", () => {
    const usage = { registeredBy: "buyer", registeredVia: "purchase", projectCompleted: false };
    const editOnly = { edit: true, changeLink: false, delete: false };
    expect(cardUsageRights(usage, { userId: "buyer", proxy: false })).toEqual(editOnly);
    expect(cardUsageRights(usage, { userId: "p1", proxy: true })).toEqual(editOnly);
  });

  it("팀 비용 건(프로젝트 없음 — projectCompleted 거짓) · 등록자 → 셋 다 참", () => {
    expect(cardUsageRights({ registeredBy: "u1", registeredVia: "self", projectCompleted: false }, { userId: "u1", proxy: false })).toEqual(ALL);
  });
});
