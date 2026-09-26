import { describe, expect, it, vi } from "vitest";
import { listApprovalRouteSettingWarnings } from "@/domain/approvals/settings-warnings";
import type { DocumentKindDef } from "@/domain/approvals/kinds";
import { LEAVE_ROUTE_SETTINGS } from "@/domain/leave";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";

// 04.1-04(UI-SPEC S8 · CXF3-B-FR01): 사용이 켜진 단계의 조직 범위가 특정 부서인데 부서가
// 비었거나 본부 목록에 없으면 그 단계 부서 키에 경고. 등록된 종류의 routeSettings만 순회한다.

const viewer: Viewer = { id: "u1", roleId: "role-sysadmin" };
const WARNING = "부서 없음 · 이 단계는 빈 자리로 건너뜀";
const MGMT_ID = "11111111-1111-4111-8111-111111111111";
const GONE_ID = "22222222-2222-4222-8222-222222222222";
const ARCHIVED_ID = "33333333-3333-4333-8333-333333333333";
const step3 = LEAVE_ROUTE_SETTINGS.steps[2]!;

function kind(name: string, withRoute: boolean): DocumentKindDef {
  return {
    kind: name,
    label: name,
    loadRouteConfig: () => Promise.resolve({ selfApproval: "skip", steps: [] }),
    href: (id) => `/${name}/${id}`,
    describeDocuments: () => Promise.resolve(new Map()),
    ...(withRoute ? { routeSettings: LEAVE_ROUTE_SETTINGS } : {}),
  };
}

function orgUnitRow(id: string, archivedAt: Date | null = null) {
  return {
    id,
    name: "경영관리본부",
    sortOrder: 1,
    customFields: {},
    archivedAt,
    archivedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const ORG_UNITS = [orgUnitRow(MGMT_ID), orgUnitRow(ARCHIVED_ID, new Date("2026-01-01T00:00:00Z"))];

async function warningsFor(values: Record<string, unknown>, kinds: DocumentKindDef[] = [kind("leave", true)]) {
  const findSimpleValues = vi.fn((_viewer: Viewer, keys: string[]) =>
    Promise.resolve(
      keys.filter((key) => key in values).map((key) => ({ key, value: values[key], updatedAt: new Date(), updatedBy: null })),
    ),
  );
  return listApprovalRouteSettingWarnings(viewer, {
    can: vi.fn().mockResolvedValue(true),
    listDocumentKinds: () => kinds,
    listOrgUnits: (_viewer: Viewer, options: { scope: Scope }) =>
      Promise.resolve(ORG_UNITS.filter((unit) => options.scope.includeArchived || unit.archivedAt === null)),
    findSimpleValues,
  });
}

describe("listApprovalRouteSettingWarnings", () => {
  it("3단 특정 부서가 비면 3단 부서 키에 경고", async () => {
    const warnings = await warningsFor({ [step3.scope.key]: "org_unit", [step3.orgUnitId.key]: "" });
    expect(warnings).toEqual({ [step3.orgUnitId.key]: WARNING });
  });

  it("부서 id가 본부 목록에 없어도 같은 경고", async () => {
    const warnings = await warningsFor({ [step3.scope.key]: "org_unit", [step3.orgUnitId.key]: GONE_ID });
    expect(warnings).toEqual({ [step3.orgUnitId.key]: WARNING });
  });

  it("보관된 부서도 같은 경고", async () => {
    const warnings = await warningsFor({ [step3.scope.key]: "org_unit", [step3.orgUnitId.key]: ARCHIVED_ID });
    expect(warnings).toEqual({ [step3.orgUnitId.key]: WARNING });
  });

  it("목록에 있는 부서면 경고 없음", async () => {
    expect(await warningsFor({ [step3.scope.key]: "org_unit", [step3.orgUnitId.key]: MGMT_ID })).toEqual({});
  });

  it("조직 범위가 기안자 팀이면 부서 칸이 비어도 경고 없음", async () => {
    expect(await warningsFor({ [step3.scope.key]: "drafter_team", [step3.orgUnitId.key]: "" })).toEqual({});
  });

  it.each(["", GONE_ID])("3단 사용이 꺼지면 경고 없음, 다시 켜면 경고(부서 %j)", async (orgUnitId) => {
    const base = { [step3.scope.key]: "org_unit", [step3.orgUnitId.key]: orgUnitId };
    expect(await warningsFor({ ...base, [step3.enabled.key]: false })).toEqual({});
    expect(await warningsFor({ ...base, [step3.enabled.key]: true })).toEqual({ [step3.orgUnitId.key]: WARNING });
  });

  it("routeSettings가 없는 종류는 순회하지 않는다", async () => {
    const values = { [step3.scope.key]: "org_unit", [step3.orgUnitId.key]: "" };
    expect(await warningsFor(values, [kind("memo", false)])).toEqual({});
  });
});
