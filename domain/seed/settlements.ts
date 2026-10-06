import type { Viewer } from "@/domain/viewer";
import { APPROVAL_ROUTE_SETTLEMENT_STEP3_ORG_UNIT_ID } from "@/domain/settings/keys";
import { findOrgUnitByName } from "@/repositories/org-units";
import { seedSimpleValue } from "@/repositories/settings";

// 05-11: 정산 결재 시드 — seedMasterData 끝에서 한 번 부른다(멱등, 있으면 두지 않는다 — 관리자가 바꾼 값 보존).
// 결재선 3단 특정 부서 = 경영관리본부(기본값 없는 키 — 연차·지출결의와 같은 결).
export async function seedSettlements(viewer: Viewer): Promise<void> {
  const mgmt = await findOrgUnitByName(viewer, "경영관리본부");
  if (mgmt) await seedSimpleValue(viewer, APPROVAL_ROUTE_SETTLEMENT_STEP3_ORG_UNIT_ID.key, mgmt.id);
}
