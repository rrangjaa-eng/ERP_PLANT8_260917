import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, settingsSimple } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import {
  CEO_ROLE_ID,
  DEFAULT_ROLE_ID,
  DIVISION_HEAD_ROLE_ID,
  SYSADMIN_ROLE_ID,
  TEAM_LEAD_ROLE_ID,
  createRole,
} from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { approveDocument, currentHolderNames, getApprovalView } from "@/domain/approvals";
import { listApprovalRouteOptions } from "@/domain/approvals/settings-options";
import { submitLeave, LEAVE_DOCUMENT_KIND, LEAVE_ROUTE_SETTINGS } from "@/domain/leave";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import {
  APPROVAL_ROUTE_LEAVE_SELF_APPROVAL,
  APPROVAL_ROUTE_LEAVE_STEP2_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP2_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_SCOPE,
} from "@/domain/settings/keys";
import { listRoles } from "@/repositories/roles";
import { listOrgUnits } from "@/repositories/org-units";
import { makePerson, orgUnitIdByName, NOW_2026 } from "./approvals-fixtures";

// 04.1-04 트레이서(ADMN-04 · EXP-04): 관리자가 설정 저장 경로(setSettingValue)로 바꾼
// 결재선은 그 뒤 제출한 문서부터 적용되고, 진행 중 문서의 단계 행은 그대로다.

const FULL_DAY = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "" };
const deps = { now: NOW_2026 };

async function stepsOf(instanceId: string) {
  return db
    .select({
      stepIndex: approvalSteps.stepIndex,
      label: approvalSteps.label,
      roleId: approvalSteps.roleId,
      scopeKind: approvalSteps.scopeKind,
      scopeTargetId: approvalSteps.scopeTargetId,
      isFallback: approvalSteps.isFallback,
    })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, instanceId))
    .orderBy(asc(approvalSteps.stepIndex));
}

async function routeOf(instanceId: string) {
  const [row] = await db.select().from(approvalRoutes).where(eq(approvalRoutes.instanceId, instanceId));
  if (!row) throw new Error("결재선이 없습니다");
  return row;
}

async function viewOf(viewer: Viewer, leaveId: string) {
  return getApprovalView(viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: leaveId }, deps);
}

async function baseOrg() {
  const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
  const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
  const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
  return { drafter, lead, ceo };
}

describe("설정 변경 → 새 제출만 반영 · 진행 중 문서는 그대로(ADMN-04 · EXP-04)", () => {
  it("2단 사용을 끄면 그 뒤 문서는 3단(1 · 3 · 4)이고, 앞 문서는 4단과 지금 단계가 그대로다", async () => {
    const org = await baseOrg();
    const docA = await submitLeave(org.drafter, FULL_DAY, deps);
    const stepsA = await stepsOf(docA.instanceId);
    expect(stepsA.map((step) => step.stepIndex)).toEqual([1, 2, 3, 4]);
    const currentA = (await viewOf(org.lead, docA.leaveId))?.currentStepIndex;

    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ENABLED, false);
    const docB = await submitLeave(org.drafter, FULL_DAY, deps);

    expect((await stepsOf(docB.instanceId)).map((step) => step.stepIndex)).toEqual([1, 3, 4]);
    expect(await stepsOf(docA.instanceId)).toEqual(stepsA);
    expect((await viewOf(org.lead, docA.leaveId))?.currentStepIndex).toBe(currentA);
  });

  it("자기 승인을 본인 승인으로 바꾸면 그 뒤 팀장 기안 문서는 1단 후보가 기안자 본인이고, 앞 문서는 건너뜀 그대로다", async () => {
    const org = await baseOrg();
    const docD = await submitLeave(org.lead, FULL_DAY, deps);
    const viewDBefore = await viewOf(org.lead, docD.leaveId);
    expect(viewDBefore?.currentStepIndex).not.toBe(1);

    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, "self_approve");
    const docC = await submitLeave(org.lead, FULL_DAY, deps);

    expect((await routeOf(docC.instanceId)).selfApproval).toBe("self_approve");
    const viewC = await viewOf(org.lead, docC.leaveId);
    expect(viewC?.currentStepIndex).toBe(1);
    expect(viewC?.actions).toEqual(["approve", "withdraw"]);

    expect((await routeOf(docD.instanceId)).selfApproval).toBe("skip");
    const viewDAfter = await viewOf(org.lead, docD.leaveId);
    expect(viewDAfter?.currentStepIndex).toBe(viewDBefore?.currentStepIndex);
    expect(viewDAfter?.actions).toEqual(["withdraw"]);
  });

  it("2단 계급을 바꾸면 그 뒤 문서만 바뀌고, 같은 값을 두 번 저장해도 결과가 같다(행 1개 · settings_change 로그)", async () => {
    const org = await baseOrg();
    const before = await submitLeave(org.drafter, FULL_DAY, deps);

    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID, DEFAULT_ROLE_ID);
    const first = await submitLeave(org.drafter, FULL_DAY, deps);
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID, DEFAULT_ROLE_ID);
    const second = await submitLeave(org.drafter, FULL_DAY, deps);

    const step2Role = async (instanceId: string) => (await stepsOf(instanceId)).find((step) => step.stepIndex === 2)?.roleId;
    expect(await step2Role(before.instanceId)).toBe(DIVISION_HEAD_ROLE_ID);
    expect(await step2Role(first.instanceId)).toBe(DEFAULT_ROLE_ID);
    expect(await stepsOf(second.instanceId)).toEqual(await stepsOf(first.instanceId));

    const rows = await db.select().from(settingsSimple).where(eq(settingsSimple.key, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID.key));
    expect(rows.map((row) => row.value)).toEqual([DEFAULT_ROLE_ID]);
    const logs = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.actionType, "settings_change"), eq(actionLog.entityId, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID.key)));
    expect(logs).toHaveLength(2);
  });
});

describe("네 단계를 모두 꺼도 결재 없이 승인되지 않는다(CEO-1)", () => {
  it("그 뒤 제출은 submitted · 지금 단계 = 대표 폴백 · 담당 = 대표, 대표 승인 뒤에야 approved", async () => {
    const org = await baseOrg();
    for (const step of LEAVE_ROUTE_SETTINGS.steps) await setSettingValue(SYSTEM_VIEWER, step.enabled, false);

    const doc = await submitLeave(org.drafter, FULL_DAY, deps);
    const [instance] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, doc.instanceId));
    expect(instance?.status).toBe("submitted");

    const view = await viewOf(org.ceo, doc.leaveId);
    const current = view?.steps?.find((step) => step.state === "current");
    expect(current?.isFallback).toBe(true);
    expect(view?.currentStepIndex).toBe(current?.stepIndex);
    expect(await currentHolderNames(org.drafter, { kind: LEAVE_DOCUMENT_KIND, documentId: doc.leaveId }, deps)).toBe("최대표");

    const result = await approveDocument(org.ceo, { instanceId: doc.instanceId, expectedVersion: 1 }, deps);
    expect(result.status).toBe("approved");
  });
});

// 평일 열 개 — 반복마다 다른 날짜(같은 기안자의 같은 날 신청을 피한다).
const RACE_DATES = [
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-06",
  "2026-10-07",
];

describe("두 관리자 동시 저장 + 제출 경주(ADMN-04 concurrency · Codex HIGH)", () => {
  it("10회 — 오류 0 · 행 1개 · 최종 값 ∈ {Y, Z} · 문서 2단 계급 ∈ {X, Y, Z} · 제출 뒤 단계 행 불변", async () => {
    const adminY = await makePerson("관리자와이", SYSADMIN_ROLE_ID, null);
    const adminZ = await makePerson("관리자지", SYSADMIN_ROLE_ID, null);
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const drafters: Viewer[] = [];
    for (let i = 0; i < 6; i++) drafters.push(await makePerson(`기안자${i}`, DEFAULT_ROLE_ID, "기획1팀"));

    const X = DIVISION_HEAD_ROLE_ID;
    const Y = DEFAULT_ROLE_ID;
    const Z = TEAM_LEAD_ROLE_ID;
    const KEY = APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID;
    const submittedSteps = new Map<string, Awaited<ReturnType<typeof stepsOf>>>();

    for (const date of RACE_DATES) {
      await setSettingValue(SYSTEM_VIEWER, KEY, X);
      const results = await Promise.allSettled([
        setSettingValue(adminY, KEY, Y),
        setSettingValue(adminZ, KEY, Z),
        ...drafters.map(async (drafter) => {
          const doc = await submitLeave(drafter, { kind: "full_day", startDate: date, endDate: date, half: "" }, deps);
          submittedSteps.set(doc.instanceId, await stepsOf(doc.instanceId));
        }),
      ]);
      expect(results.filter((result) => result.status === "rejected")).toEqual([]);

      const rows = await db.select().from(settingsSimple).where(eq(settingsSimple.key, KEY.key));
      expect(rows).toHaveLength(1);
      expect([Y, Z]).toContain(rows[0]?.value);
    }

    expect(submittedSteps.size).toBe(RACE_DATES.length * drafters.length);
    for (const [instanceId, steps] of submittedSteps) {
      expect([X, Y, Z]).toContain(steps.find((step) => step.stepIndex === 2)?.roleId);
      expect(await stepsOf(instanceId)).toEqual(steps);
    }
  }, 60000);
});

describe("설정 보기 권한만으로 옵션 전부(Codex MEDIUM)", () => {
  it("admin.settings view만 있는 계급은 계급 · 본부 목록을 빠짐없이 보고, view가 없으면 ForbiddenError", async () => {
    const settingsOnly = await createRole(SYSTEM_VIEWER, { name: `설정만-${Date.now()}` });
    await setPermissionCell(SYSTEM_VIEWER, { roleId: settingsOnly.id, menu: "admin.settings", action: "view", allowed: true });
    const viewer = await makePerson("설정담당", settingsOnly.id, null);
    expect(await can(viewer, "admin.people", "view")).toBe(false);

    const options = await listApprovalRouteOptions(viewer);
    const roles = await listRoles(SYSTEM_VIEWER);
    const units = await listOrgUnits(SYSTEM_VIEWER, { scope: { rows: "all", includeArchived: false } });
    expect(options.roles.filter((role) => !role.archived)).toEqual(roles.map((role) => ({ id: role.id, name: role.name, archived: false })));
    expect(options.orgUnits.filter((unit) => !unit.archived)).toEqual(units.map((unit) => ({ id: unit.id, name: unit.name, archived: false })));
    expect(options.orgUnits.length).toBeGreaterThan(0);

    const noView = await createRole(SYSTEM_VIEWER, { name: `권한없음-${Date.now()}` });
    const outsider = await makePerson("외부인", noView.id, null);
    await expect(listApprovalRouteOptions(outsider)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("비활성 칸의 저장값 보존(CX-W2)", () => {
  it("3단 범위를 기안자 팀으로 바꿔도 3단 부서는 그대로이고, 다시 특정 부서로 두면 3단이 경영관리본부다", async () => {
    const org = await baseOrg();
    const mgmt = await orgUnitIdByName("경영관리본부");

    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP3_SCOPE, "drafter_team");
    expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID)).toBe(mgmt);

    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP3_SCOPE, "org_unit");
    const doc = await submitLeave(org.drafter, FULL_DAY, deps);
    const step3 = (await stepsOf(doc.instanceId)).find((step) => step.stepIndex === 3);
    expect([step3?.scopeKind, step3?.scopeTargetId]).toEqual(["org_unit", mgmt]);
  });

  it("2단 사용을 꺼도 2단 계급 · 범위 저장값이 그대로이고, 다시 켜면 그 값으로 2단이 생긴다", async () => {
    const org = await baseOrg();
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID, TEAM_LEAD_ROLE_ID);
    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_SCOPE, "company");

    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ENABLED, false);
    expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID)).toBe(TEAM_LEAD_ROLE_ID);
    expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_SCOPE)).toBe("company");

    await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ENABLED, true);
    const doc = await submitLeave(org.drafter, FULL_DAY, deps);
    const step2 = (await stepsOf(doc.instanceId)).find((step) => step.stepIndex === 2);
    expect([step2?.roleId, step2?.scopeKind]).toEqual([TEAM_LEAD_ROLE_ID, "company"]);
  });

  it("옵션의 activeWhen에 연차 결재선 12키가 있다", async () => {
    const options = await listApprovalRouteOptions(SYSTEM_VIEWER);
    for (const step of LEAVE_ROUTE_SETTINGS.steps) {
      for (const def of [step.roleId, step.scope, step.orgUnitId]) expect(options.activeWhen[def.key]).toBeDefined();
    }
  });
});
