import { describe, expect, it } from "vitest";
import {
  resolveHolders,
  walkRoute,
  type RouteStep,
  type SnapshotPerson,
  type WalkRouteInput,
  type WalkRouteResult,
} from "@/domain/approvals/route";

// 결재선 해석 — 순수 함수. DB·설정 없이 단계 · 처리 기록 · 스냅숏만으로 결정적이다.
// 사례 이름은 04.1-01 Task 3 ② 결정표의 칸 id(R1~R6 · W1~W13)로 시작한다.

const CEO = "role-ceo";
const TEAM_LEAD = "role-team-lead";
const DIV_HEAD = "role-division-head";
const PM = "role-pm";

const PLAN_TEAM = "team-plan1";
const PLAN_TEAM2 = "team-plan2";
const PLAN_ORG = "org-plan";
const MGMT_TEAM = "team-mgmt";
const MGMT_ORG = "org-mgmt";
const OTHER_TEAM = "team-other";
const OTHER_ORG = "org-other";

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

const teamLeadStep = (i: number, team: string | null) =>
  step(i, { label: "팀장", roleId: TEAM_LEAD, scopeKind: "team", scopeTargetId: team });
const divHeadStep = (i: number, org: string | null) =>
  step(i, { label: "본부 책임자", roleId: DIV_HEAD, scopeKind: "org_unit", scopeTargetId: org });
const mgmtStep = (i: number) => step(i, { label: "경영관리본부", roleId: null, scopeKind: "org_unit", scopeTargetId: MGMT_ORG });
const ceoStep = (i: number) => step(i, { label: "대표", roleId: CEO, scopeKind: "company", scopeTargetId: null });

// 기본 결재선(설정 기본값): 1단 팀장 × 기안자 팀 · 2단 본부 책임자 × 기안자 본부 ·
// 3단 계급 무관 × 경영관리본부 · 4단 대표 × 전사.
function defaultSteps(drafterTeam: string | null, drafterOrg: string | null): RouteStep[] {
  return [teamLeadStep(1, drafterTeam), divHeadStep(2, drafterOrg), mgmtStep(3), ceoStep(4)];
}

function walk(over: Partial<WalkRouteInput> & Pick<WalkRouteInput, "steps" | "snapshot">): WalkRouteResult {
  return walkRoute({ selfApproval: "skip", drafterId: "drafter", fallbackRoleId: CEO, at: "before_action", ...over });
}

function sorted(ids: string[]): string[] {
  return [...ids].sort();
}

// 트레이서 조직: 기획1팀에 기안자(PM) · 팀장, 대표 한 명(팀 없음). 본부 책임자·경영관리 소속 없음.
const tracerSnapshot: SnapshotPerson[] = [
  person("drafter", PM, PLAN_TEAM, PLAN_ORG),
  person("lead", TEAM_LEAD, PLAN_TEAM, PLAN_ORG),
  person("ceo", CEO, null, null),
];

describe("resolveHolders — 담당 해석(ENG-1)", () => {
  it("R1 team · 팀 id: 그 팀 현재 소속 × 계급", () => {
    expect(resolveHolders(teamLeadStep(1, PLAN_TEAM), tracerSnapshot).map((p) => p.id)).toEqual(["lead"]);
  });

  it("R2 team · null(기안자 팀 없음): 0명 — 팀 없는 기안자의 1단은 빈 자리", () => {
    expect(resolveHolders(teamLeadStep(1, null), tracerSnapshot)).toEqual([]);
  });

  it("R3 org_unit · 본부 id: 그 본부 아래 팀 현재 소속(계급 무관)", () => {
    const snap = [...tracerSnapshot, person("mgmt1", PM, MGMT_TEAM, MGMT_ORG)];
    expect(resolveHolders(mgmtStep(3), snap).map((p) => p.id)).toEqual(["mgmt1"]);
  });

  it("R4 org_unit · null(설정 \"\" — CEO-7): 0명 — 3단 부서 없음은 빈 자리", () => {
    const snap = [...tracerSnapshot, person("mgmt1", PM, MGMT_TEAM, MGMT_ORG)];
    expect(resolveHolders(step(3, { scopeKind: "org_unit", scopeTargetId: null }), snap)).toEqual([]);
  });

  it("R5 company × 대표 계급: 대상 id(null)를 보지 않고 대표 재직자 전원", () => {
    const snap = [...tracerSnapshot, person("ceo2", CEO, PLAN_TEAM, PLAN_ORG)];
    expect(sorted(resolveHolders(ceoStep(4), snap).map((p) => p.id))).toEqual(["ceo", "ceo2"]);
  });

  it("R6 company × 계급 없음: 재직자 전원(walkRoute 후보는 기안자를 뺀 전원)", () => {
    const all = step(1, { scopeKind: "company", roleId: null });
    expect(sorted(resolveHolders(all, tracerSnapshot).map((p) => p.id))).toEqual(["ceo", "drafter", "lead"]);
    const result = walk({ steps: [all], snapshot: tracerSnapshot });
    expect(result.outcome.kind === "actionable" && sorted(result.outcome.candidateIds)).toEqual(["ceo", "lead"]);
  });
});

describe("walkRoute — 기본 경로", () => {
  it("W1 처리 가능: 1단 팀장이 후보", () => {
    const result = walk({ steps: defaultSteps(PLAN_TEAM, PLAN_ORG), snapshot: tracerSnapshot });
    expect(result.outcome).toEqual({ kind: "actionable", stepIndex: 1, isFallback: false, candidateIds: ["lead"], selfApprove: false });
  });

  it("W2 빈 자리 건너뜀: 1단 승인 뒤 2·3단은 후보 0명이라 지금 단계는 4단(대표)", () => {
    const steps = defaultSteps(PLAN_TEAM, PLAN_ORG);
    steps[0] = approved(steps[0] as RouteStep, "lead");
    const result = walk({ steps, snapshot: tracerSnapshot });
    expect(result.outcome).toEqual({ kind: "actionable", stepIndex: 4, isFallback: false, candidateIds: ["ceo"], selfApprove: false });
    expect(result.display.map((d) => [d.stepIndex, d.state])).toEqual([
      [1, "approved"],
      [2, "empty"],
      [3, "empty"],
      [4, "current"],
    ]);
  });

  it("W2 제출 뒤 1단 팀장 보관(스냅숏에서 빠짐): 1단은 빈 자리, 지금 단계는 다음 비지 않은 단계", () => {
    const snap = tracerSnapshot.filter((p) => p.id !== "lead");
    const result = walk({ steps: defaultSteps(PLAN_TEAM, PLAN_ORG), snapshot: snap });
    expect(result.outcome).toMatchObject({ kind: "actionable", stepIndex: 4, candidateIds: ["ceo"] });
  });

  it("W12 끝 · 승인 반영 뒤: 대표가 4단을 승인하면 최종", () => {
    const steps = defaultSteps(PLAN_TEAM, PLAN_ORG);
    steps[0] = approved(steps[0] as RouteStep, "lead");
    steps[3] = approved(steps[3] as RouteStep, "ceo");
    expect(walk({ steps, snapshot: tracerSnapshot, at: "after_approval" }).outcome).toEqual({ kind: "final" });
  });
});

describe("walkRoute — 후보 표시(1명 · 2명 · 3명 이상)", () => {
  it("W1 1단 팀장 둘: 후보 둘 다, 표시 `이수아 · 박지훈`", () => {
    const snap: SnapshotPerson[] = [
      person("drafter", PM, PLAN_TEAM, PLAN_ORG),
      { id: "l1", name: "이수아", roleId: TEAM_LEAD, teamId: PLAN_TEAM, orgUnitId: PLAN_ORG },
      { id: "l2", name: "박지훈", roleId: TEAM_LEAD, teamId: PLAN_TEAM, orgUnitId: PLAN_ORG },
      person("ceo", CEO, null, null),
    ];
    const result = walk({ steps: defaultSteps(PLAN_TEAM, PLAN_ORG), snapshot: snap });
    expect(result.outcome.kind === "actionable" && sorted(result.outcome.candidateIds)).toEqual(["l1", "l2"]);
    expect(result.display[0]?.holderNames).toBe("이수아 · 박지훈");
  });

  it("W1 1단 팀장 셋: 표시 `이수아 외 2명`", () => {
    const snap: SnapshotPerson[] = [
      person("drafter", PM, PLAN_TEAM, PLAN_ORG),
      { id: "l1", name: "이수아", roleId: TEAM_LEAD, teamId: PLAN_TEAM, orgUnitId: PLAN_ORG },
      { id: "l2", name: "박지훈", roleId: TEAM_LEAD, teamId: PLAN_TEAM, orgUnitId: PLAN_ORG },
      { id: "l3", name: "정다은", roleId: TEAM_LEAD, teamId: PLAN_TEAM, orgUnitId: PLAN_ORG },
    ];
    expect(walk({ steps: defaultSteps(PLAN_TEAM, PLAN_ORG), snapshot: snap }).display[0]?.holderNames).toBe("이수아 외 2명");
  });
});

describe("walkRoute — 자기 승인(W4 · W5 · W6)", () => {
  // 기안자가 기획1팀 팀장, 기획본부 책임자 있음.
  const snap: SnapshotPerson[] = [
    person("drafter", TEAM_LEAD, PLAN_TEAM, PLAN_ORG),
    person("div", DIV_HEAD, PLAN_TEAM2, PLAN_ORG),
    person("ceo", CEO, null, null),
  ];

  it("W4 기안자 팀장 · skip: 1단은 통과(건너뜀)로 표시되고 지금 단계는 2단", () => {
    const result = walk({ steps: defaultSteps(PLAN_TEAM, PLAN_ORG), snapshot: snap, selfApproval: "skip" });
    expect(result.display[0]?.state).toBe("skipped_self");
    expect(result.outcome).toMatchObject({ kind: "actionable", stepIndex: 2, candidateIds: ["div"] });
  });

  it("W5 기안자 팀장 · self_approve: 1단 후보가 기안자 한 사람(본인 승인)", () => {
    const result = walk({ steps: defaultSteps(PLAN_TEAM, PLAN_ORG), snapshot: snap, selfApproval: "self_approve" });
    expect(result.outcome).toEqual({ kind: "actionable", stepIndex: 1, isFallback: false, candidateIds: ["drafter"], selfApprove: true });
  });

  it("W5 · W6 (ENG-2) 1단 본인 승인 + 3단 유일 담당 = 기안자: 3단은 빈 자리, 지금 단계 4단(대표)", () => {
    // 경영관리팀 팀장이 기안자 · 2단 꺼짐 · 경영관리팀 소속은 기안자뿐 · 대표는 다른 팀.
    const s: SnapshotPerson[] = [person("drafter", TEAM_LEAD, MGMT_TEAM, MGMT_ORG), person("ceo", CEO, OTHER_TEAM, OTHER_ORG)];
    const steps = [teamLeadStep(1, MGMT_TEAM), mgmtStep(3), ceoStep(4)];
    const first = walk({ steps, snapshot: s, selfApproval: "self_approve" });
    expect(first.outcome).toMatchObject({ kind: "actionable", stepIndex: 1, candidateIds: ["drafter"], selfApprove: true });

    const afterSelf = [approved(steps[0] as RouteStep, "drafter", true), steps[1] as RouteStep, steps[2] as RouteStep];
    for (const at of ["after_approval", "before_action"] as const) {
      const result = walk({ steps: afterSelf, snapshot: s, selfApproval: "self_approve", at });
      expect(result.display.find((d) => d.stepIndex === 3)?.state).toBe("empty");
      expect(result.outcome).toMatchObject({ kind: "actionable", stepIndex: 4, candidateIds: ["ceo"], selfApprove: false });
    }
  });
});

describe("walkRoute — 한 사람 한 번(CEO-5 · W3 · W9)", () => {
  it("W3 · W9 경영관리팀 기안자: 1단 팀장 승인 뒤 팀장은 3단 후보에서 빠지고, 대표가 3단을 승인하면 4단은 빈 자리 → 최종", () => {
    const s: SnapshotPerson[] = [
      person("drafter", PM, MGMT_TEAM, MGMT_ORG),
      person("mlead", TEAM_LEAD, MGMT_TEAM, MGMT_ORG),
      person("ceo", CEO, MGMT_TEAM, MGMT_ORG),
    ];
    const steps = [teamLeadStep(1, MGMT_TEAM), mgmtStep(3), ceoStep(4)];
    steps[0] = approved(steps[0] as RouteStep, "mlead");
    const beforeCeo = walk({ steps, snapshot: s });
    expect(beforeCeo.outcome).toMatchObject({ kind: "actionable", stepIndex: 3, candidateIds: ["ceo"] });

    steps[1] = approved(steps[1] as RouteStep, "ceo");
    const after = walk({ steps, snapshot: s, at: "after_approval" });
    expect(after.display.find((d) => d.stepIndex === 4)?.state).toBe("empty");
    expect(after.outcome).toEqual({ kind: "final" });
  });

  it("W3 3단 담당이 이 차수 승인자뿐이면(기안자는 담당 아님) 빈 자리로 건너뛴다", () => {
    const s: SnapshotPerson[] = [
      person("drafter", PM, PLAN_TEAM, PLAN_ORG),
      person("ceo", CEO, MGMT_TEAM, MGMT_ORG),
      person("div", DIV_HEAD, PLAN_TEAM2, PLAN_ORG),
    ];
    const steps = [
      approved(ceoStep(1), "ceo"),
      mgmtStep(3),
      step(4, { label: "본부 책임자", roleId: DIV_HEAD, scopeKind: "company" }),
    ];
    const result = walk({ steps, snapshot: s });
    expect(result.display.find((d) => d.stepIndex === 3)?.state).toBe("empty");
    expect(result.outcome).toMatchObject({ kind: "actionable", stepIndex: 4, candidateIds: ["div"] });
  });

  it("W9 계획 가정 3: 대표 단계를 끈 결재선 · 남은 단계 전부 빔 → 대표 폴백인데 대표가 이미 이 차수에서 승인했으면 최종", () => {
    const steps = [approved(ceoStep(1), "ceo"), divHeadStep(2, PLAN_ORG), mgmtStep(3)];
    expect(walk({ steps, snapshot: tracerSnapshot, at: "after_approval" }).outcome).toEqual({ kind: "final" });
  });
});

describe("walkRoute — 승인 0건 대표 폴백(CEO-1 · W7 · W8 · W11)", () => {
  it("W7 CEO-1 ① 네 단계가 전부 꺼져 단계 행이 0개: 대표 폴백, 후보 = 대표 — 최종이 아니다", () => {
    const result = walk({ steps: [], snapshot: tracerSnapshot });
    expect(result.outcome).toEqual({ kind: "actionable", stepIndex: 1, isFallback: true, candidateIds: ["ceo"], selfApprove: false });
  });

  it("W7 CEO-1 ② 기안자 팀장 · 1단만 · skip: 1단은 통과지만 승인 0건이라 대표 폴백", () => {
    const s: SnapshotPerson[] = [person("drafter", TEAM_LEAD, PLAN_TEAM, PLAN_ORG), person("ceo", CEO, null, null)];
    const result = walk({ steps: [teamLeadStep(1, PLAN_TEAM)], snapshot: s });
    expect(result.display[0]?.state).toBe("skipped_self");
    expect(result.outcome).toEqual({ kind: "actionable", stepIndex: 2, isFallback: true, candidateIds: ["ceo"], selfApprove: false });
  });

  it("W8 CEO-1 ③ 네 단계 전부 꺼짐 + 기안자가 대표: 폴백 후보가 기안자 본인 승인", () => {
    const s: SnapshotPerson[] = [person("drafter", CEO, null, null)];
    const result = walk({ steps: [], snapshot: s });
    expect(result.outcome).toEqual({ kind: "actionable", stepIndex: 1, isFallback: true, candidateIds: ["drafter"], selfApprove: true });
    const fallbackRow = approved(
      step(1, { label: "대표", roleId: CEO, scopeKind: "company", isFallback: true }),
      "drafter",
      true,
    );
    expect(walk({ steps: [fallbackRow], snapshot: s, at: "after_approval" }).outcome).toEqual({ kind: "final" });
  });

  it("W8 1~3단 빈 자리 + 기안자가 대표 + skip: 4단은 통과, 대표 폴백 후보가 기안자 한 사람(결정 4)", () => {
    const s: SnapshotPerson[] = [person("drafter", CEO, null, null)];
    const result = walk({ steps: defaultSteps(null, null), snapshot: s });
    expect(result.display.find((d) => d.stepIndex === 4)?.state).toBe("skipped_self");
    expect(result.outcome).toEqual({ kind: "actionable", stepIndex: 5, isFallback: true, candidateIds: ["drafter"], selfApprove: true });
  });

  it("W11 CEO-1 ④ 네 단계 전부 꺼짐 + 대표 계급 재직자 없음: 막힘", () => {
    const s: SnapshotPerson[] = [person("drafter", PM, PLAN_TEAM, PLAN_ORG)];
    expect(walk({ steps: [], snapshot: s }).outcome).toEqual({ kind: "blocked", reason: "no_fallback_holder", stepIndex: 1 });
  });

  it("W11 1~4단 전부 빈 자리 + 대표 없음: 막힘", () => {
    const s: SnapshotPerson[] = [person("drafter", PM, PLAN_TEAM, PLAN_ORG)];
    expect(walk({ steps: defaultSteps(PLAN_TEAM, PLAN_ORG), snapshot: s }).outcome).toMatchObject({ kind: "blocked" });
  });
});

describe("walkRoute — 전사 범위(ENG-1 · R5 · W1 · W12)", () => {
  it("R5 · W1 · W12 전사 단계만 켠 결재선: 지금 단계 = 4단 자체(폴백 아님), 대표 승인 뒤 최종", () => {
    const steps = [ceoStep(4)];
    expect(walk({ steps, snapshot: tracerSnapshot }).outcome).toEqual({
      kind: "actionable",
      stepIndex: 4,
      isFallback: false,
      candidateIds: ["ceo"],
      selfApprove: false,
    });
    expect(walk({ steps: [approved(ceoStep(4), "ceo")], snapshot: tracerSnapshot, at: "after_approval" }).outcome).toEqual({
      kind: "final",
    });
  });

  it("R5 · W1 1단 승인 뒤 전사 단계: 4단 본부 책임자 × 전사의 후보는 모든 본부의 본부 책임자, 대표 아님", () => {
    const s: SnapshotPerson[] = [
      ...tracerSnapshot,
      person("div1", DIV_HEAD, PLAN_TEAM2, PLAN_ORG),
      person("div2", DIV_HEAD, MGMT_TEAM, MGMT_ORG),
    ];
    const steps = [
      approved(teamLeadStep(1, PLAN_TEAM), "lead"),
      step(4, { label: "본부 책임자", roleId: DIV_HEAD, scopeKind: "company" }),
    ];
    const result = walk({ steps, snapshot: s, at: "after_approval" });
    expect(result.outcome).toMatchObject({ kind: "actionable", stepIndex: 4, isFallback: false });
    expect(result.outcome.kind === "actionable" && sorted(result.outcome.candidateIds)).toEqual(["div1", "div2"]);
  });
});

describe("walkRoute — 행동 전 최종 = 막힘(ENG-3 · D2 · W10 · W13)", () => {
  it("W9 · W10 대표 1단 승인 뒤 남은 담당 전원 소멸: before_action = 막힘 · after_approval = 최종", () => {
    const steps = [approved(ceoStep(1), "ceo"), divHeadStep(2, PLAN_ORG), mgmtStep(3), ceoStep(4)];
    const before = walk({ steps, snapshot: tracerSnapshot, at: "before_action" });
    expect(before.outcome).toMatchObject({ kind: "blocked", reason: "orphan_final" });
    expect(before.display.at(-1)?.state).toBe("blocked");
    expect(walk({ steps, snapshot: tracerSnapshot, at: "after_approval" }).outcome).toEqual({ kind: "final" });
  });

  it("W4 · W13 남은 단계가 기안자 skip 통과뿐: before_action = 막힘 · after_approval = 최종", () => {
    const s: SnapshotPerson[] = [person("drafter", PM, MGMT_TEAM, MGMT_ORG), person("mlead", TEAM_LEAD, MGMT_TEAM, MGMT_ORG)];
    const steps = [approved(teamLeadStep(1, MGMT_TEAM), "mlead"), mgmtStep(3)];
    const before = walk({ steps, snapshot: s, at: "before_action" });
    expect(before.display.find((d) => d.stepIndex === 3)?.state).toBe("skipped_self");
    expect(before.outcome).toMatchObject({ kind: "blocked", reason: "orphan_final" });
    expect(walk({ steps, snapshot: s, at: "after_approval" }).outcome).toEqual({ kind: "final" });
  });
});

describe("walkRoute — currentHolderIds(ENG-6 · D1 재료 · X-3)", () => {
  it("W1 기안자가 1단 담당 · 1단 승인 기록 · 2단 담당 둘 · 3단 빈 자리 · 4단 대표: 합집합(기안자·승인자 포함), at과 무관", () => {
    const s: SnapshotPerson[] = [
      person("drafter", TEAM_LEAD, PLAN_TEAM, PLAN_ORG),
      person("lead2", TEAM_LEAD, PLAN_TEAM, PLAN_ORG),
      person("div1", DIV_HEAD, PLAN_TEAM2, PLAN_ORG),
      person("div2", DIV_HEAD, PLAN_TEAM2, PLAN_ORG),
      person("ceo", CEO, null, null),
    ];
    const steps = [approved(teamLeadStep(1, PLAN_TEAM), "lead2"), divHeadStep(2, PLAN_ORG), mgmtStep(3), ceoStep(4)];
    const expected = ["ceo", "div1", "div2", "drafter", "lead2"];
    expect(sorted(walk({ steps, snapshot: s, at: "before_action" }).currentHolderIds)).toEqual(expected);
    expect(sorted(walk({ steps, snapshot: s, at: "after_approval" }).currentHolderIds)).toEqual(expected);
  });

  it("W2 단계가 전부 빈 자리면(대표도 없음) 빈 배열", () => {
    const s: SnapshotPerson[] = [person("drafter", PM, PLAN_TEAM, PLAN_ORG)];
    expect(walk({ steps: [divHeadStep(2, PLAN_ORG), mgmtStep(3)], snapshot: s }).currentHolderIds).toEqual([]);
  });

  it("W7 · W11 (X-3) 폴백 자리의 폴백 후보는 지금 담당 — 대표가 없어 막히면 더하지 않는다", () => {
    const withCeos: SnapshotPerson[] = [
      person("drafter", PM, PLAN_TEAM, PLAN_ORG),
      person("lead", TEAM_LEAD, PLAN_TEAM, PLAN_ORG),
      person("ceo1", CEO, null, null),
      person("ceo2", CEO, null, null),
    ];
    const steps = [approved(teamLeadStep(1, PLAN_TEAM), "lead"), divHeadStep(2, PLAN_ORG), mgmtStep(3)];
    const fallback = walk({ steps, snapshot: withCeos });
    expect(fallback.outcome).toMatchObject({ kind: "actionable", isFallback: true });
    expect(sorted(fallback.currentHolderIds)).toEqual(["ceo1", "ceo2", "lead"]);

    const noCeo = withCeos.filter((p) => p.roleId !== CEO);
    const blocked = walk({ steps, snapshot: noCeo });
    expect(blocked.outcome).toMatchObject({ kind: "blocked" });
    expect(blocked.currentHolderIds).toEqual(["lead"]);
  });
});
