import { describe, expect, it } from "vitest";
import {
  resolveHolders,
  walkRoute,
  type RouteStep,
  type SnapshotPerson,
  type WalkRouteInput,
} from "@/domain/approvals/route";

// 결재선 해석 — 순수 함수. DB·설정 없이 단계 · 처리 기록 · 스냅숏만으로 결정적이다.
// 사례 이름은 04.1-01 Task 3 ② 결정표의 칸 id(R1~R6 · W1~W13)로 시작한다.

const CEO = "role-ceo";
const TEAM_LEAD = "role-team-lead";
const DIV_HEAD = "role-division-head";
const PM = "role-pm";

const PLAN_TEAM = "team-plan1";
const PLAN_ORG = "org-plan";
const MGMT_TEAM = "team-mgmt";
const MGMT_ORG = "org-mgmt";

function person(id: string, roleId: string | null, teamId: string | null, orgUnitId: string | null): SnapshotPerson {
  return { id, name: id, roleId, teamId, orgUnitId };
}

function step(stepIndex: number, over: Partial<RouteStep> & Pick<RouteStep, "scopeKind">): RouteStep {
  return {
    stepIndex,
    label: `단계${stepIndex}`,
    roleId: null,
    scopeTargetId: null,
    isFallback: false,
    actedBy: null,
    actedByName: null,
    actedAt: null,
    action: null,
    selfApproved: false,
    ...over,
  };
}

function approved(s: RouteStep, by: string, selfApproved = false): RouteStep {
  return { ...s, actedBy: by, actedByName: by, actedAt: new Date("2026-09-21T01:00:00Z"), action: "approved", selfApproved };
}

// 기본 결재선(설정 기본값): 1단 팀장 × 기안자 팀 · 2단 본부 책임자 × 기안자 본부 ·
// 3단 계급 무관 × 경영관리본부 · 4단 대표 × 전사.
function defaultSteps(drafterTeam: string | null, drafterOrg: string | null): RouteStep[] {
  return [
    step(1, { label: "팀장", roleId: TEAM_LEAD, scopeKind: "team", scopeTargetId: drafterTeam }),
    step(2, { label: "본부 책임자", roleId: DIV_HEAD, scopeKind: "org_unit", scopeTargetId: drafterOrg }),
    step(3, { label: "경영관리본부", roleId: null, scopeKind: "org_unit", scopeTargetId: MGMT_ORG }),
    step(4, { label: "대표", roleId: CEO, scopeKind: "company", scopeTargetId: null }),
  ];
}

function input(over: Partial<WalkRouteInput> & Pick<WalkRouteInput, "steps" | "snapshot">): WalkRouteInput {
  return { selfApproval: "skip", drafterId: "drafter", fallbackRoleId: CEO, at: "before_action", ...over };
}

// 트레이서 조직: 기획1팀에 기안자(PM) · 팀장, 대표 한 명(팀 없음). 본부 책임자·경영관리 소속 없음.
const tracerSnapshot: SnapshotPerson[] = [
  person("drafter", PM, PLAN_TEAM, PLAN_ORG),
  person("lead", TEAM_LEAD, PLAN_TEAM, PLAN_ORG),
  person("ceo", CEO, null, null),
];

describe("resolveHolders — 담당 해석", () => {
  it("R1 team · 팀 id: 그 팀 현재 소속 × 계급", () => {
    const s = step(1, { roleId: TEAM_LEAD, scopeKind: "team", scopeTargetId: PLAN_TEAM });
    expect(resolveHolders(s, tracerSnapshot).map((p) => p.id)).toEqual(["lead"]);
  });

  it("R3 org_unit · 본부 id: 그 본부 아래 팀 현재 소속(계급 무관)", () => {
    const snap = [...tracerSnapshot, person("mgmt1", PM, MGMT_TEAM, MGMT_ORG)];
    const s = step(3, { roleId: null, scopeKind: "org_unit", scopeTargetId: MGMT_ORG });
    expect(resolveHolders(s, snap).map((p) => p.id)).toEqual(["mgmt1"]);
  });
});

describe("walkRoute — 기본 경로", () => {
  it("W1 처리 가능: 1단 팀장이 후보", () => {
    const result = walkRoute(input({ steps: defaultSteps(PLAN_TEAM, PLAN_ORG), snapshot: tracerSnapshot }));
    expect(result.outcome).toEqual({ kind: "actionable", stepIndex: 1, isFallback: false, candidateIds: ["lead"], selfApprove: false });
  });

  it("W2 빈 자리 건너뜀: 1단 승인 뒤 2·3단은 후보 0명이라 지금 단계는 4단(대표)", () => {
    const steps = defaultSteps(PLAN_TEAM, PLAN_ORG);
    steps[0] = approved(steps[0] as RouteStep, "lead");
    const result = walkRoute(input({ steps, snapshot: tracerSnapshot }));
    expect(result.outcome).toEqual({ kind: "actionable", stepIndex: 4, isFallback: false, candidateIds: ["ceo"], selfApprove: false });
    expect(result.display.map((d) => [d.stepIndex, d.state])).toEqual([
      [1, "approved"],
      [2, "empty"],
      [3, "empty"],
      [4, "current"],
    ]);
  });

  it("W12 끝 · 승인 반영 뒤: 대표가 4단을 승인하면 최종", () => {
    const steps = defaultSteps(PLAN_TEAM, PLAN_ORG);
    steps[0] = approved(steps[0] as RouteStep, "lead");
    steps[3] = approved(steps[3] as RouteStep, "ceo");
    const result = walkRoute(input({ steps, snapshot: tracerSnapshot, at: "after_approval" }));
    expect(result.outcome).toEqual({ kind: "final" });
  });
});
