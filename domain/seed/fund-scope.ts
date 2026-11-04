import type { Viewer } from "@/domain/viewer";
import { readFundDivision } from "@/domain/permissions/fund-gate";
import { DIVISION_HEAD_ROLE_ID } from "@/domain/permissions/roles";
import {
  APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID,
  FUND_DIVISION_ORG_UNIT,
} from "@/domain/settings/keys";
import { seoulToday } from "@/lib/dates";
import { log } from "@/lib/log";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { findOrgUnitByName } from "@/repositories/org-units";
import { seedSimpleValue, updateSimpleValueIfUnedited } from "@/repositories/settings";

const STEP3_ROLE_DEFS = [APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID, APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID, APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID];

// 07.3-01(D-7310): 자금 본부 설정을 값이 없을 때만 경영관리본부 uuid로 채운다(관리자 값은 덮지 않는다).
// 이름 조회는 시드 1회뿐이다(approvals-leave.ts와 같은 꼴) — 런타임 판정은 설정 uuid만 본다.
// 본부를 못 찾거나 보관됐으면 설정 없이 끝난다 — 자금 기능은 회사 전체 계급만 쓰게 닫히므로 경고 한 줄을 남긴다.
export async function seedFundScope(viewer: Viewer): Promise<void> {
  await fixStep3RoleDefaults(viewer);
  const mgmt = await findOrgUnitByName(viewer, "경영관리본부");
  if (!mgmt || mgmt.archivedAt !== null) {
    log.warn("seed.fund_division_missing", { key: FUND_DIVISION_ORG_UNIT.key });
    return;
  }
  await seedSimpleValue(viewer, FUND_DIVISION_ORG_UNIT.key, mgmt.id);
}

// 07.3-02(D-7316 · D-E2): 기존 DB의 ③단 담당 계급이 옛 기본값("")이고 관리자가 저장한 적 없으면 새 기본값(본부 책임자)으로 —
// 자금 본부의 본부 책임자(결재 스냅숏 규칙: 팀이 이기고 팀 없으면 본부 칸)가 1명 이상일 때만. 없으면 그대로 두고 다음 배포 시드가 다시 본다.
async function fixStep3RoleDefaults(viewer: Viewer): Promise<void> {
  const fund = await readFundDivision(viewer);
  const heads = fund
    ? (await listOrgSnapshot(viewer, seoulToday())).filter((p) => p.roleId === DIVISION_HEAD_ROLE_ID && p.orgUnitId === fund.id).length
    : 0;
  if (heads === 0) {
    log.info("seed.step3_role_default_deferred", { reason: fund ? "no_division_head" : "no_fund_division" });
    return;
  }
  for (const def of STEP3_ROLE_DEFS) {
    if (await updateSimpleValueIfUnedited(viewer, def.key, "", def.default)) log.info("seed.step3_role_default_fixed", { key: def.key });
  }
}
