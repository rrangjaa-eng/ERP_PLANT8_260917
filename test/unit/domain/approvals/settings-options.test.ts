import { describe, expect, it } from "vitest";
import { isSettingActive, routeActiveWhen } from "@/domain/approvals/settings-options";
import { LEAVE_ROUTE_SETTINGS } from "@/domain/leave";

// 04.1-04(CX-W2): 지금 효과가 없는 결재선 칸은 비활성이다. 켜짐 조건은 등록된 종류의
// routeSettings에서 나오고(종류 이름 분기 없음), 판정은 저장값을 지우지 않는다.

const steps = LEAVE_ROUTE_SETTINGS.steps;

function stepKeys(index: number) {
  const step = steps[index];
  if (!step) throw new Error(`단계 없음: ${index}`);
  return { enabled: step.enabled.key, roleId: step.roleId.key, scope: step.scope.key, orgUnitId: step.orgUnitId.key };
}

describe("routeActiveWhen (CX-W2)", () => {
  const activeWhen = routeActiveWhen(LEAVE_ROUTE_SETTINGS);

  it("4단 × 담당 계급 · 조직 범위 · 특정 부서 = 12키에만 조건이 있다", () => {
    const expected = steps.flatMap((step) => [step.roleId.key, step.scope.key, step.orgUnitId.key]);
    expect(Object.keys(activeWhen).sort()).toEqual([...expected].sort());
    expect(Object.keys(activeWhen)).toHaveLength(12);
    expect(activeWhen[LEAVE_ROUTE_SETTINGS.selfApproval.key]).toBeUndefined();
    for (const step of steps) expect(activeWhen[step.enabled.key]).toBeUndefined();
  });

  it("계급 · 범위 키는 그 단계 사용 = 참 하나, 특정 부서 키는 범위 = org_unit이 하나 더", () => {
    steps.forEach((_, index) => {
      const keys = stepKeys(index);
      expect(activeWhen[keys.roleId]).toEqual([{ key: keys.enabled, equals: true }]);
      expect(activeWhen[keys.scope]).toEqual([{ key: keys.enabled, equals: true }]);
      expect(activeWhen[keys.orgUnitId]).toEqual([
        { key: keys.enabled, equals: true },
        { key: keys.scope, equals: "org_unit" },
      ]);
    });
  });
});

describe("isSettingActive (CX-W2)", () => {
  const activeWhen = routeActiveWhen(LEAVE_ROUTE_SETTINGS);
  const step2 = stepKeys(1);
  const state = (values: Record<string, unknown>) => ({
    roleId: isSettingActive(activeWhen[step2.roleId], values),
    scope: isSettingActive(activeWhen[step2.scope], values),
    orgUnitId: isSettingActive(activeWhen[step2.orgUnitId], values),
  });

  it("조건이 없으면 늘 활성", () => {
    expect(isSettingActive(undefined, {})).toBe(true);
    expect(isSettingActive([], {})).toBe(true);
  });

  it("2단 사용 거짓 → 셋 다 비활성 / 참 + 기안자 본부 → 부서만 비활성 / 특정 부서 → 전부 활성 / 다시 거짓 → 부서 비활성", () => {
    const values: Record<string, unknown> = {
      [step2.enabled]: false,
      [step2.roleId]: "role-division-head",
      [step2.scope]: "drafter_org_unit",
      [step2.orgUnitId]: "",
    };
    const before = structuredClone(values);
    expect(state(values)).toEqual({ roleId: false, scope: false, orgUnitId: false });
    expect(values).toEqual(before);

    const on = { ...values, [step2.enabled]: true };
    expect(state(on)).toEqual({ roleId: true, scope: true, orgUnitId: false });

    const orgUnit = { ...on, [step2.scope]: "org_unit" };
    expect(state(orgUnit)).toEqual({ roleId: true, scope: true, orgUnitId: true });

    const offAgain = { ...orgUnit, [step2.enabled]: false };
    const offAgainBefore = structuredClone(offAgain);
    expect(state(offAgain)).toEqual({ roleId: false, scope: false, orgUnitId: false });
    expect(offAgain).toEqual(offAgainBefore);
  });
});
