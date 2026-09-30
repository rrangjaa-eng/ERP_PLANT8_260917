import type { Viewer } from "@/domain/viewer";
import { can as defaultCan, ForbiddenError } from "@/domain/permissions/can";
import { listDocumentKinds, type RouteSettingDefs } from "@/domain/approvals/kinds";
import { listRoles as defaultListRoles } from "@/repositories/roles";
import { listOrgUnits as defaultListOrgUnits } from "@/repositories/org-units";
import { findSimpleValues as defaultFindSimpleValues } from "@/repositories/settings";
import { getSimpleSettingValues } from "@/domain/settings/registry";

// 04.1-04(U3 · Codex MEDIUM): 설정 화면 결재선 칸의 동적 옵션. 설정 보기 권한만 보고
// 리포지토리에서 계급 · 본부의 id · 이름 · 보관 여부만 읽는다 — 사람 관리 권한 범위
// 판정이나 정보 노출 투영을 거치지 않는다(설정 화면을 여는 사람이 곧 옵션을 고른다).

export type SettingCondition = { key: string; equals: unknown };
export type RouteOption = { id: string; name: string; archived: boolean };
export type RouteStepField = { kind: string; stepIndex: number; field: "enabled" | "roleId" | "scope" | "orgUnitId" };
export type ApprovalRouteOptions = {
  roles: RouteOption[];
  orgUnits: RouteOption[];
  // 설정 키 → 켜짐 조건(CX-W2). 조건이 없는 키는 늘 활성이다.
  activeWhen: Record<string, SettingCondition[]>;
  // 설정 키 → 그 키가 속한 결재선 단계(사용자 결정 2026-09-30 A — 화면이 단계 네 칸을 모아 한 번에 저장).
  steps: Record<string, RouteStepField>;
  // 설정 키 → 단계 칸 저장값(Codex r4141687065). 단계 칸 전부를 SELECT 한 문장으로 읽는다 — 키마다 읽으면
  // 그 사이 커밋된 다른 단계 저장이 섞여, 한 번도 저장된 적 없는 결재선이 화면 기준값이 된다.
  values: Record<string, unknown>;
};

export type SettingsOptionsDeps = {
  can: typeof defaultCan;
  listRoles: typeof defaultListRoles;
  listOrgUnits: typeof defaultListOrgUnits;
  listDocumentKinds: typeof listDocumentKinds;
  findSimpleValues: typeof defaultFindSimpleValues;
};

// 단계마다 담당 계급 · 조직 범위 · 특정 부서는 그 단계 사용이 켜져야, 특정 부서는
// 조직 범위가 특정 부서여야 효과가 있다.
export function routeActiveWhen(settings: RouteSettingDefs): Record<string, SettingCondition[]> {
  const result: Record<string, SettingCondition[]> = {};
  for (const step of settings.steps) {
    const enabled: SettingCondition = { key: step.enabled.key, equals: true };
    result[step.roleId.key] = [enabled];
    result[step.scope.key] = [enabled];
    result[step.orgUnitId.key] = [enabled, { key: step.scope.key, equals: "org_unit" }];
  }
  return result;
}

export function routeStepFields(kind: string, settings: RouteSettingDefs): Record<string, RouteStepField> {
  const result: Record<string, RouteStepField> = {};
  settings.steps.forEach((step, index) => {
    for (const field of ["enabled", "roleId", "scope", "orgUnitId"] as const) {
      result[step[field].key] = { kind, stepIndex: index + 1, field };
    }
  });
  return result;
}

export function isSettingActive(conditions: SettingCondition[] | undefined, values: Record<string, unknown>): boolean {
  return (conditions ?? []).every((condition) => values[condition.key] === condition.equals);
}

export async function listApprovalRouteOptions(viewer: Viewer, deps?: Partial<SettingsOptionsDeps>): Promise<ApprovalRouteOptions> {
  const can = deps?.can ?? defaultCan;
  if (!(await can(viewer, "admin.settings", "view"))) throw new ForbiddenError("설정 보기 권한 없음");

  const listRoles = deps?.listRoles ?? defaultListRoles;
  const listOrgUnits = deps?.listOrgUnits ?? defaultListOrgUnits;
  const kinds = (deps?.listDocumentKinds ?? listDocumentKinds)();

  const roles = await listRoles(viewer, { includeArchived: true });
  const orgUnits = await listOrgUnits(viewer, { scope: { rows: "all", includeArchived: true } });

  const activeWhen: Record<string, SettingCondition[]> = {};
  const steps: Record<string, RouteStepField> = {};
  for (const kind of kinds) {
    if (!kind.routeSettings) continue;
    Object.assign(activeWhen, routeActiveWhen(kind.routeSettings));
    Object.assign(steps, routeStepFields(kind.kind, kind.routeSettings));
  }

  const stepDefs = kinds.flatMap((kind) =>
    (kind.routeSettings?.steps ?? []).flatMap((step) => [step.enabled, step.roleId, step.scope, step.orgUnitId]),
  );
  const stepValues = await getSimpleSettingValues(stepDefs, { findSimpleValues: deps?.findSimpleValues });
  const values = Object.fromEntries(stepDefs.map((def, index) => [def.key, stepValues[index]]));

  return {
    roles: roles.map((row) => ({ id: row.id, name: row.name, archived: row.archivedAt !== null })),
    orgUnits: orgUnits.map((row) => ({ id: row.id, name: row.name, archived: row.archivedAt !== null })),
    activeWhen,
    steps,
    values,
  };
}
