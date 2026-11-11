import { describe, expect, it, vi } from "vitest";
import { listApprovalRouteSettingWarnings } from "@/domain/approvals/settings-warnings";
import type { DocumentKindDef } from "@/domain/approvals/kinds";
import { LEAVE_ROUTE_SETTINGS } from "@/domain/leave";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";
import type { SnapshotPerson } from "@/domain/approvals/route";
import { CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";

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

async function warningsFor(
  values: Record<string, unknown>,
  kinds: DocumentKindDef[] = [kind("leave", true)],
  snapshot: SnapshotPerson[] = [],
  listOrgSnapshot = vi.fn(() => Promise.resolve(snapshot)),
) {
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
    listOrgSnapshot,
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

// 07.2-13(D-7299 · D7298-A): 커스텀 계급 단계 보유자 경고 — 자리 규칙은 넓히지 않는다(그 계급 보유자 누구나 승인).
// 셀 수 있는 범위(전사 · 특정 부서)는 0명 · 2명 이상, 기안자 · 문서 상대 범위는 회사 전체 0명일 때만.
// 계급 판정은 계급 id 상수 비교 — 자리 계급(팀장 · 본부 책임자)과 대표(빈 단계를 대신 승인하는 자리)는 세지 않는다.
describe("listApprovalRouteSettingWarnings — 커스텀 계급 단계 보유자(D-7299)", () => {
  const VICE = "role-vice-lead";
  const NONE = "보유자 없음 · 대표가 대신 승인";
  const OTHER_UNIT = "44444444-4444-4444-8444-444444444444";
  const step1 = LEAVE_ROUTE_SETTINGS.steps[0]!;
  let seq = 0;
  const person = (roleId: string | null, orgUnitId: string | null = MGMT_ID, teamId: string | null = "team-a"): SnapshotPerson => ({
    id: `p${++seq}`,
    name: `사람${seq}`,
    roleId,
    teamId,
    orgUnitId,
  });
  // 3단 기본값(특정 부서 · 부서 id 시드)이 비어 부서 없음 경고가 섞이지 않게 3단 부서를 채워 둔다.
  const base = { [step3.orgUnitId.key]: MGMT_ID };
  const companyStep = (roleId: string) => ({ ...base, [step1.roleId.key]: roleId, [step1.scope.key]: "company" });
  const unitStep = (roleId: string, orgUnitId = MGMT_ID) => ({
    ...base,
    [step1.roleId.key]: roleId,
    [step1.scope.key]: "org_unit",
    [step1.orgUnitId.key]: orgUnitId,
  });

  it("전사 범위: 0명 → `보유자 없음 · 대표가 대신 승인` · 1명 → 없음 · 2명 → `보유자 2명 · 한 명이 승인` · 3명 → `보유자 3명`", async () => {
    expect(await warningsFor(companyStep(VICE), undefined, [person(TEAM_LEAD_ROLE_ID)])).toEqual({ [step1.roleId.key]: NONE });
    expect(await warningsFor(companyStep(VICE), undefined, [person(VICE)])).toEqual({});
    expect(await warningsFor(companyStep(VICE), undefined, [person(VICE), person(VICE, OTHER_UNIT, "team-b")])).toEqual({
      [step1.roleId.key]: "보유자 2명 · 한 명이 승인",
    });
    expect(await warningsFor(companyStep(VICE), undefined, [person(VICE), person(VICE), person(VICE)])).toEqual({
      [step1.roleId.key]: "보유자 3명 · 한 명이 승인",
    });
  });

  it("특정 부서 범위: 그 본부 보유자로 센다 — 다른 본부 사람은 세지 않는다", async () => {
    const snapshot = [person(VICE, MGMT_ID), person(VICE, OTHER_UNIT), person(VICE, OTHER_UNIT)];
    expect(await warningsFor(unitStep(VICE), undefined, snapshot)).toEqual({});
    expect(await warningsFor(unitStep(VICE), undefined, [person(VICE, OTHER_UNIT)])).toEqual({ [step1.roleId.key]: NONE });
    expect(await warningsFor(unitStep(VICE), undefined, [...snapshot, person(VICE, MGMT_ID)])).toEqual({
      [step1.roleId.key]: "보유자 2명 · 한 명이 승인",
    });
  });

  it("특정 부서가 비면 부서 없음 경고와 보유자 없음 경고가 둘 다 선다(키가 다르다)", async () => {
    expect(await warningsFor(unitStep(VICE, ""), undefined, [])).toEqual({
      [step1.orgUnitId.key]: WARNING,
      [step1.roleId.key]: NONE,
    });
  });

  it.each(["drafter_team", "drafter_org_unit"])("기안자 상대 범위(%s): 회사 전체 0명만 경고 · 2명 이상은 셀 수 없어 경고 없음", async (scope) => {
    const values = { ...base, [step1.roleId.key]: VICE, [step1.scope.key]: scope };
    expect(await warningsFor(values, undefined, [])).toEqual({ [step1.roleId.key]: NONE });
    expect(await warningsFor(values, undefined, [person(VICE, MGMT_ID, "team-a"), person(VICE, OTHER_UNIT, "team-b")])).toEqual({});
  });

  it("행사 담당 팀(project_team) 범위도 회사 전체 0명만 경고", async () => {
    const values = { ...base, [step1.roleId.key]: VICE, [step1.scope.key]: "project_team" };
    expect(await warningsFor(values, undefined, [])).toEqual({ [step1.roleId.key]: NONE });
    expect(await warningsFor(values, undefined, [person(VICE), person(VICE)])).toEqual({});
  });

  it.each([TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID, CEO_ROLE_ID])("자리 계급 · 대표(%s)는 이 경고를 내지 않는다(0명이어도)", async (roleId) => {
    expect(await warningsFor(companyStep(roleId), undefined, [])).toEqual({});
    expect(await warningsFor(companyStep(roleId), undefined, [person(roleId), person(roleId)])).toEqual({});
  });

  it("계급 무관 · 꺼진 단계는 경고 없음", async () => {
    expect(await warningsFor(companyStep(""), undefined, [])).toEqual({});
    expect(await warningsFor({ ...companyStep(VICE), [step1.enabled.key]: false }, undefined, [])).toEqual({});
  });

  it("보유자 셈은 스냅숏 한 번 — 단계 · 종류가 여럿이어도 조직 스냅숏 읽기 1회", async () => {
    const listOrgSnapshot = vi.fn(() => Promise.resolve([] as SnapshotPerson[]));
    await warningsFor(companyStep(VICE), [kind("leave", true), kind("expense", true)], [], listOrgSnapshot);
    expect(listOrgSnapshot).toHaveBeenCalledTimes(1);
  });
});
