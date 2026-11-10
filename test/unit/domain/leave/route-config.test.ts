import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { loadLeaveRouteConfig, LEAVE_ROUTE_SETTINGS } from "@/domain/leave";
import { APPROVAL_ROUTE_LEAVE_LIGHT_KINDS_STOP_AFTER, SETTING_DEFS } from "@/domain/settings/keys";
import type { SettingSimpleRow } from "@/repositories/settings";

// 결재선 설정 17키 + 07.2-13 반반차 · 재택 단계 수 1키 — SELECT 한 문장(일괄 읽기 1회)으로 읽고, 기본값 없는
// org_unit_id 키에 행이 없으면 원시 오류 대신 ""(특정 부서 없음)로 읽는다.

const ALL_DEFS = [
  LEAVE_ROUTE_SETTINGS.selfApproval,
  ...LEAVE_ROUTE_SETTINGS.steps.flatMap((s) => [s.enabled, s.roleId, s.scope, s.orgUnitId]),
  APPROVAL_ROUTE_LEAVE_LIGHT_KINDS_STOP_AFTER,
];

function row(key: string, value: unknown): SettingSimpleRow {
  return { key, value, updatedAt: new Date(), updatedBy: null };
}

// 시드 뒤와 같은 행: 기본값 16개 + 3단 부서 id.
const MGMT_ID = randomUUID();
function seededRows(): SettingSimpleRow[] {
  return ALL_DEFS.map((def) =>
    def === LEAVE_ROUTE_SETTINGS.steps[2]?.orgUnitId ? row(def.key, MGMT_ID) : row(def.key, def.default),
  );
}

describe("loadLeaveRouteConfig", () => {
  it("일괄 읽기가 정확히 1회, 18키 전부를 한 배열로 받고 키 단위 읽기는 0회(Codex HIGH 스냅숏)", async () => {
    const findSimpleValues = vi.fn((_viewer: unknown, keys: string[]) => {
      void keys;
      return Promise.resolve(seededRows());
    });
    const findSimpleValue = vi.fn(() => Promise.reject(new Error("키 단위 읽기를 부르면 안 된다")));
    const config = await loadLeaveRouteConfig(undefined, { findSimpleValues, findSimpleValue });
    expect(findSimpleValues).toHaveBeenCalledTimes(1);
    expect([...(findSimpleValues.mock.calls[0]?.[1] ?? [])].sort()).toEqual(ALL_DEFS.map((d) => d.key).sort());
    expect(ALL_DEFS).toHaveLength(18);
    expect(findSimpleValue).not.toHaveBeenCalled();
    expect(config.steps[2]?.orgUnitId).toBe(MGMT_ID);
  });

  it("CEO-7 3단 org_unit_id 행이 없으면 \"\"로 읽고 다른 칸은 그대로다", async () => {
    const step3OrgKey = LEAVE_ROUTE_SETTINGS.steps[2]?.orgUnitId.key;
    const rows = seededRows().filter((r) => r.key !== step3OrgKey);
    const config = await loadLeaveRouteConfig(undefined, { findSimpleValues: () => Promise.resolve(rows) });
    expect(config).toEqual({
      selfApproval: "skip",
      steps: [
        { enabled: true, roleId: "role-team-lead", scope: "drafter_team", orgUnitId: "" },
        { enabled: true, roleId: "role-division-head", scope: "drafter_org_unit", orgUnitId: "" },
        { enabled: true, roleId: "role-division-head", scope: "org_unit", orgUnitId: "" },
        { enabled: true, roleId: "role-ceo", scope: "company", orgUnitId: "" },
      ],
    });
  });
});

// 07.2-13(PU9 · D-7251): 반반차 · 재택은 설정 슬롯 번호 ≤ N인 단계만 남는다(켜진 단계 수가 아니라 슬롯 번호).
// 종일 · 반차 · 힌트 없음은 그대로. 꺼진 단계는 그대로 꺼져 있다(번호 재정렬은 엔진 몫 — planRoute가 슬롯 번호를 쓴다).
describe("loadLeaveRouteConfig(hint) — 반반차 · 재택 결재 단계(PU9)", () => {
  function rowsWith(stopAfter: number, overrides: Record<string, unknown> = {}): SettingSimpleRow[] {
    return seededRows().map((r) =>
      r.key === APPROVAL_ROUTE_LEAVE_LIGHT_KINDS_STOP_AFTER.key ? row(r.key, stopAfter) : r.key in overrides ? row(r.key, overrides[r.key]) : r,
    );
  }
  async function enabledOf(rows: SettingSimpleRow[], hint?: Parameters<typeof loadLeaveRouteConfig>[0]) {
    const config = await loadLeaveRouteConfig(hint, { findSimpleValues: () => Promise.resolve(rows) });
    return config.steps.flatMap((step, i) => (step.enabled ? [i + 1] : []));
  }

  it("값 2 → 반반차 · 재택 [1, 2] · 종일 · 반차 · 힌트 없음 [1, 2, 3, 4]", async () => {
    const rows = rowsWith(2);
    expect(await enabledOf(rows, { leaveKind: "quarter_day" })).toEqual([1, 2]);
    expect(await enabledOf(rows, { leaveKind: "remote" })).toEqual([1, 2]);
    expect(await enabledOf(rows, { leaveKind: "full_day" })).toEqual([1, 2, 3, 4]);
    expect(await enabledOf(rows, { leaveKind: "half_day" })).toEqual([1, 2, 3, 4]);
    expect(await enabledOf(rows)).toEqual([1, 2, 3, 4]);
  });

  it("값 4(기본) → 전 종류 현행 [1, 2, 3, 4]", async () => {
    const rows = rowsWith(4);
    for (const leaveKind of ["full_day", "half_day", "quarter_day", "remote"] as const) {
      expect(await enabledOf(rows, { leaveKind })).toEqual([1, 2, 3, 4]);
    }
  });

  it("값 1 → 반반차 [1]", async () => {
    expect(await enabledOf(rowsWith(1), { leaveKind: "quarter_day" })).toEqual([1]);
  });

  it("슬롯 번호 기준 — 1단 꺼짐 · 값 2 → 반반차 [2](켜진 단계 두 개가 아니다) · 종일 [2, 3, 4]", async () => {
    const step1Enabled = LEAVE_ROUTE_SETTINGS.steps[0]?.enabled.key ?? "";
    const rows = rowsWith(2, { [step1Enabled]: false });
    expect(await enabledOf(rows, { leaveKind: "quarter_day" })).toEqual([2]);
    expect(await enabledOf(rows, { leaveKind: "full_day" })).toEqual([2, 3, 4]);
  });

  it("키 스키마 1~4 정수만(select 글자 \"2\"는 숫자 2로) · 기본 4 · 선택지 글자 `N단까지`", () => {
    const schema = APPROVAL_ROUTE_LEAVE_LIGHT_KINDS_STOP_AFTER.schema;
    expect(APPROVAL_ROUTE_LEAVE_LIGHT_KINDS_STOP_AFTER.default).toBe(4);
    for (const ok of [1, 2, 3, 4]) expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse("2")).toEqual({ success: true, data: 2 });
    for (const bad of [0, 5, 2.5, -1, "0", "5"]) expect(schema.safeParse(bad).success).toBe(false);
    expect(APPROVAL_ROUTE_LEAVE_LIGHT_KINDS_STOP_AFTER.optionLabels).toEqual({ "1": "1단까지", "2": "2단까지", "3": "3단까지", "4": "4단까지" });
  });
});

describe("B-NEW02 — 결재선 org_unit_id 네 키의 스키마", () => {
  const defs = [1, 2, 3, 4].map((n) => SETTING_DEFS.find((def) => def.key === `approval_route.leave.step${n}.org_unit_id`));

  it("네 키가 SETTING_DEFS에 있다", () => {
    expect(defs.every(Boolean)).toBe(true);
  });

  for (const [i, def] of defs.entries()) {
    it(`${i + 1}단: "" · uuid는 통과, 비uuid는 실패`, () => {
      expect(def?.schema.safeParse("").success).toBe(true);
      expect(def?.schema.safeParse(randomUUID()).success).toBe(true);
      expect(def?.schema.safeParse("not-a-uuid").success).toBe(false);
      expect(def?.schema.safeParse("경영관리본부").success).toBe(false);
    });
  }
});
