import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { loadLeaveRouteConfig, LEAVE_ROUTE_SETTINGS } from "@/domain/leave";
import { SETTING_DEFS } from "@/domain/settings/keys";
import type { SettingSimpleRow } from "@/repositories/settings";

// 결재선 설정 17키 — SELECT 한 문장(일괄 읽기 1회)으로 읽고, 기본값 없는
// org_unit_id 키에 행이 없으면 원시 오류 대신 ""(특정 부서 없음)로 읽는다.

const ALL_DEFS = [
  LEAVE_ROUTE_SETTINGS.selfApproval,
  ...LEAVE_ROUTE_SETTINGS.steps.flatMap((s) => [s.enabled, s.roleId, s.scope, s.orgUnitId]),
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
  it("일괄 읽기가 정확히 1회, 17키 전부를 한 배열로 받고 키 단위 읽기는 0회(Codex HIGH 스냅숏)", async () => {
    const findSimpleValues = vi.fn((_viewer: unknown, keys: string[]) => {
      void keys;
      return Promise.resolve(seededRows());
    });
    const findSimpleValue = vi.fn(() => Promise.reject(new Error("키 단위 읽기를 부르면 안 된다")));
    const config = await loadLeaveRouteConfig({ findSimpleValues, findSimpleValue });
    expect(findSimpleValues).toHaveBeenCalledTimes(1);
    expect([...(findSimpleValues.mock.calls[0]?.[1] ?? [])].sort()).toEqual(ALL_DEFS.map((d) => d.key).sort());
    expect(ALL_DEFS).toHaveLength(17);
    expect(findSimpleValue).not.toHaveBeenCalled();
    expect(config.steps[2]?.orgUnitId).toBe(MGMT_ID);
  });

  it("CEO-7 3단 org_unit_id 행이 없으면 \"\"로 읽고 다른 16칸은 그대로다", async () => {
    const step3OrgKey = LEAVE_ROUTE_SETTINGS.steps[2]?.orgUnitId.key;
    const rows = seededRows().filter((r) => r.key !== step3OrgKey);
    const config = await loadLeaveRouteConfig({ findSimpleValues: () => Promise.resolve(rows) });
    expect(config).toEqual({
      selfApproval: "skip",
      steps: [
        { enabled: true, roleId: "role-team-lead", scope: "drafter_team", orgUnitId: "" },
        { enabled: true, roleId: "role-division-head", scope: "drafter_org_unit", orgUnitId: "" },
        { enabled: true, roleId: "", scope: "org_unit", orgUnitId: "" },
        { enabled: true, roleId: "role-ceo", scope: "company", orgUnitId: "" },
      ],
    });
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
