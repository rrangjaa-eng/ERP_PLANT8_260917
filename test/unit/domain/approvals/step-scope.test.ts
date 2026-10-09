import { describe, expect, it } from "vitest";
import { resolveStepScope } from "@/domain/approvals";
import type { RouteConfigScope, RouteConfigStep } from "@/domain/approvals/kinds";

// 06.2-02(검토 반영 R1: eng I4 · T-06.2-16): 단계 범위 해석은 빠짐없는 switch — 다섯 값은 각자 갈래로 풀리고,
// 모르는 저장 값은 조용히 「전사」가 되지 않고 오류다(260907 `O: server/src/scope.ts:106-109` default → 닫힘과 같은 쪽).

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const DOC_TEAM_ID = "22222222-2222-4222-8222-222222222222";
const ORG_UNIT_ID = "33333333-3333-4333-8333-333333333333";
const CONFIG_ORG_UNIT_ID = "44444444-4444-4444-8444-444444444444";

const names = {
  roles: [{ id: "role-team-lead", name: "팀장" }],
  teams: [
    { id: TEAM_ID, name: "경영관리팀" },
    { id: DOC_TEAM_ID, name: "기획1팀" },
  ],
  orgUnits: [
    { id: ORG_UNIT_ID, name: "기획본부" },
    { id: CONFIG_ORG_UNIT_ID, name: "경영관리본부" },
  ],
};
const drafter = { teamId: TEAM_ID, orgUnitId: ORG_UNIT_ID };
const doc = { teamId: DOC_TEAM_ID };

function step(scope: RouteConfigScope, orgUnitId = ""): RouteConfigStep {
  return { enabled: true, roleId: "role-team-lead", scope, orgUnitId };
}

describe("resolveStepScope — 단계 범위 다섯 값 (06.2-02 eng I4)", () => {
  it("drafter_team → team · 기안자 팀 id", () => {
    expect(resolveStepScope(step("drafter_team"), drafter, doc, names)).toEqual({ scopeKind: "team", scopeTargetId: TEAM_ID, scopeLabel: "경영관리팀" });
  });

  it("project_team → team · 문서 팀 id (기안자 팀이 아니다)", () => {
    expect(resolveStepScope(step("project_team"), drafter, doc, names)).toEqual({ scopeKind: "team", scopeTargetId: DOC_TEAM_ID, scopeLabel: "행사 담당 팀" });
  });

  it("project_team · 문서 정보 없음 → team · 대상 없음(빈 자리)", () => {
    expect(resolveStepScope(step("project_team"), drafter, undefined, names)).toEqual({ scopeKind: "team", scopeTargetId: null, scopeLabel: "행사 담당 팀" });
  });

  it("drafter_org_unit → org_unit · 기안자 본부 id", () => {
    expect(resolveStepScope(step("drafter_org_unit"), drafter, doc, names)).toEqual({ scopeKind: "org_unit", scopeTargetId: ORG_UNIT_ID, scopeLabel: "기획본부" });
  });

  it("org_unit → org_unit · 설정 부서 id", () => {
    expect(resolveStepScope(step("org_unit", CONFIG_ORG_UNIT_ID), drafter, doc, names)).toEqual({
      scopeKind: "org_unit",
      scopeTargetId: CONFIG_ORG_UNIT_ID,
      scopeLabel: "경영관리본부",
    });
  });

  it("company → company · 대상 없음", () => {
    expect(resolveStepScope(step("company"), drafter, doc, names)).toEqual({ scopeKind: "company", scopeTargetId: null, scopeLabel: "전사" });
  });

  it("모르는 저장 값은 전사로 풀리지 않고 오류다", () => {
    // 손상된 저장 값 흉내 — 제품 코드는 스키마로 거른 값만 받는다.
    const corrupted = step("bogus" as unknown as RouteConfigScope);
    expect(() => resolveStepScope(corrupted, drafter, doc, names)).toThrow("결재선: 모르는 단계 범위");
  });
});
