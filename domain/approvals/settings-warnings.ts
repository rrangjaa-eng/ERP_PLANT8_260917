import type { Viewer } from "@/domain/viewer";
import { can as defaultCan, ForbiddenError } from "@/domain/permissions/can";
import { listDocumentKinds } from "@/domain/approvals/kinds";
import { getSimpleSettingValues } from "@/domain/settings/registry";
import { findSimpleValues as defaultFindSimpleValues } from "@/repositories/settings";
import { listOrgUnits as defaultListOrgUnits } from "@/repositories/org-units";

// 04.1-04(UI-SPEC S8): 사용이 켜진 단계의 조직 범위가 특정 부서인데 부서가 비었거나
// 지금 본부 목록에 없으면 그 단계는 빈 자리로 건너뛴다 — 저장은 막지 않고 그 단계
// 부서 칸 아래에 경고 한 줄. 꺼진 단계는 결재선에 행이 없어 경고하지 않는다(CXF3-B-FR01).
const MISSING_ORG_UNIT_WARNING = "부서 없음 · 이 단계는 빈 자리로 건너뜀";

export type SettingsWarningsDeps = {
  can: typeof defaultCan;
  listDocumentKinds: typeof listDocumentKinds;
  listOrgUnits: typeof defaultListOrgUnits;
  findSimpleValues: typeof defaultFindSimpleValues;
};

// 설정 키 → 경고 문구.
export async function listApprovalRouteSettingWarnings(
  viewer: Viewer,
  deps?: Partial<SettingsWarningsDeps>,
): Promise<Record<string, string>> {
  const can = deps?.can ?? defaultCan;
  if (!(await can(viewer, "admin.settings", "view"))) throw new ForbiddenError("설정 보기 권한 없음");

  const listOrgUnits = deps?.listOrgUnits ?? defaultListOrgUnits;
  const orgUnits = await listOrgUnits(viewer, { scope: { rows: "all", includeArchived: false } });
  const liveOrgUnitIds = new Set(orgUnits.map((unit) => unit.id));

  const warnings: Record<string, string> = {};
  for (const kind of (deps?.listDocumentKinds ?? listDocumentKinds)()) {
    if (!kind.routeSettings) continue;
    for (const step of kind.routeSettings.steps) {
      const [enabled, scope, orgUnitId] = await getSimpleSettingValues([step.enabled, step.scope, step.orgUnitId] as const, {
        findSimpleValues: deps?.findSimpleValues,
      });
      if (enabled === true && scope === "org_unit" && !liveOrgUnitIds.has(orgUnitId ?? "")) {
        warnings[step.orgUnitId.key] = MISSING_ORG_UNIT_WARNING;
      }
    }
  }
  return warnings;
}
