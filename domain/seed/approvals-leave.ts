import type { Viewer } from "@/domain/viewer";
import { SEED_ROLES } from "@/domain/permissions/roles";
import { APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID } from "@/domain/settings/keys";
import { findOrgUnitByName } from "@/repositories/org-units";
import { seedSimpleValue } from "@/repositories/settings";
import { insertPermissionIfAbsent, insertVisibilityIfAbsent } from "@/repositories/permissions";

// 04.1: 결재·연차 시드 — seedMasterData 끝에서 한 번 부른다(멱등).
// ① 결재선 3단 특정 부서 = 경영관리본부(기본값이 없는 키 — 이미 값이 있으면 두지 않는다).
// ② 결재·연차 정보 항목을 계급 5종 모두에 참으로 — 행이 없을 때만 넣는다.
// ③ (04.1-02) 연차 메뉴 view·write를 계급 5종 모두에 참으로 — 행이 없을 때만(관리자가 끈 값 보존).
const APPROVAL_INFO_ITEMS = ["approval.value", "leave.value"];

export async function seedApprovalsLeave(viewer: Viewer): Promise<void> {
  const mgmt = await findOrgUnitByName(viewer, "경영관리본부");
  if (mgmt) await seedSimpleValue(viewer, APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID.key, mgmt.id);

  for (const role of SEED_ROLES) {
    for (const infoItem of APPROVAL_INFO_ITEMS) {
      await insertVisibilityIfAbsent(viewer, { roleId: role.id, infoItem, visible: true, updatedBy: null });
    }
    for (const action of ["view", "write"] as const) {
      await insertPermissionIfAbsent(viewer, { roleId: role.id, menu: "leave", action, allowed: true, updatedBy: null });
    }
  }
}
