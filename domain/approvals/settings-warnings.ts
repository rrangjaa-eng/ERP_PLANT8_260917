import type { Viewer } from "@/domain/viewer";
import { can as defaultCan, ForbiddenError } from "@/domain/permissions/can";
import { listDocumentKinds } from "@/domain/approvals/kinds";
import { getSimpleSettingValuesOrDefault } from "@/domain/settings/registry";
import { findSimpleValues as defaultFindSimpleValues } from "@/repositories/settings";
import { listOrgUnits as defaultListOrgUnits } from "@/repositories/org-units";
import { listOrgSnapshot as defaultListOrgSnapshot } from "@/repositories/org-snapshot";
import { CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { seoulToday } from "@/lib/dates";

// 04.1-04(UI-SPEC S8): 사용이 켜진 단계의 조직 범위가 특정 부서인데 부서가 비었거나
// 지금 본부 목록에 없으면 그 단계는 빈 자리로 건너뛴다 — 저장은 막지 않고 그 단계
// 부서 칸 아래에 경고 한 줄. 꺼진 단계는 결재선에 행이 없어 경고하지 않는다(CXF3-B-FR01).
const MISSING_ORG_UNIT_WARNING = "부서 없음 · 이 단계는 빈 자리로 건너뜀";

// 07.2-13(D-7299 · D7298-A · UI-SPEC S19): 커스텀 계급 단계 보유자 경고 — 자리 규칙은 넓히지 않는다(그 계급 보유자 누구나 승인).
// 저장은 막지 않고 그 단계 계급 칸 아래 한 줄(키 = step.roleId.key — 부서 없음 경고와 다른 키라 둘 다 설 수 있다).
// 자리 계급(팀장 · 본부 책임자 — 한 팀 · 한 본부에 한 명)과 대표(빈 단계를 대신 승인하는 자리 — 0명이면 「대신 승인」이 거짓)는
// 세지 않는다. 계급 판정은 계급 id 상수 비교만(이름 글자 비교 0).
const NO_HOLDER_WARNING = "보유자 없음 · 대표가 대신 승인";
const manyHoldersWarning = (count: number) => `보유자 ${count}명 · 한 명이 승인`;
const SEAT_ROLE_IDS: ReadonlySet<string> = new Set([TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID, CEO_ROLE_ID]);

export type SettingsWarningsDeps = {
  can: typeof defaultCan;
  listDocumentKinds: typeof listDocumentKinds;
  listOrgUnits: typeof defaultListOrgUnits;
  findSimpleValues: typeof defaultFindSimpleValues;
  listOrgSnapshot: typeof defaultListOrgSnapshot;
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

  // 보유자 셈은 오늘 조직 스냅숏 한 번(엔진 readSnapshot과 같은 원천) — 단계마다 다시 읽지 않는다.
  const snapshot = await (deps?.listOrgSnapshot ?? defaultListOrgSnapshot)(viewer, seoulToday());

  const warnings: Record<string, string> = {};
  for (const kind of (deps?.listDocumentKinds ?? listDocumentKinds)()) {
    if (!kind.routeSettings) continue;
    for (const step of kind.routeSettings.steps) {
      const [enabled, roleId, scope, orgUnitId] = await getSimpleSettingValuesOrDefault(
        [step.enabled, step.roleId, step.scope, step.orgUnitId] as const,
        { findSimpleValues: deps?.findSimpleValues },
      );
      if (enabled !== true) continue;
      if (scope === "org_unit" && !liveOrgUnitIds.has(orgUnitId ?? "")) {
        warnings[step.orgUnitId.key] = MISSING_ORG_UNIT_WARNING;
      }
      if (!roleId || SEAT_ROLE_IDS.has(roleId)) continue;
      const holders = snapshot.filter((person) => person.roleId === roleId);
      // 셀 수 있는 범위(전사 · 특정 부서)만 0 · 2명 이상을 판정한다. 기안자 · 문서 상대 범위(기안자 팀 · 기안자 본부 · 행사 담당 팀)는
      // 기안자마다 달라 회사 전체 0명일 때만 「보유자 없음」(eng r2 C N6).
      const counted =
        scope === "company" ? holders.length : scope === "org_unit" ? holders.filter((person) => person.orgUnitId === orgUnitId).length : null;
      if ((counted ?? holders.length) === 0) warnings[step.roleId.key] = NO_HOLDER_WARNING;
      else if (counted !== null && counted >= 2) warnings[step.roleId.key] = manyHoldersWarning(counted);
    }
  }
  return warnings;
}
