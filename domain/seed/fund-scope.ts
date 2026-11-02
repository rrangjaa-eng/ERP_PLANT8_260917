import type { Viewer } from "@/domain/viewer";
import { FUND_DIVISION_ORG_UNIT } from "@/domain/settings/keys";
import { log } from "@/lib/log";
import { findOrgUnitByName } from "@/repositories/org-units";
import { seedSimpleValue } from "@/repositories/settings";

// 07.3-01(D-7310): 자금 본부 설정을 값이 없을 때만 경영관리본부 uuid로 채운다(관리자 값은 덮지 않는다).
// 이름 조회는 시드 1회뿐이다(approvals-leave.ts와 같은 꼴) — 런타임 판정은 설정 uuid만 본다.
// 본부를 못 찾거나 보관됐으면 설정 없이 끝난다 — 자금 기능은 회사 전체 계급만 쓰게 닫히므로 경고 한 줄을 남긴다.
export async function seedFundScope(viewer: Viewer): Promise<void> {
  const mgmt = await findOrgUnitByName(viewer, "경영관리본부");
  if (!mgmt || mgmt.archivedAt !== null) {
    log.warn("seed.fund_division_missing", { key: FUND_DIVISION_ORG_UNIT.key });
    return;
  }
  await seedSimpleValue(viewer, FUND_DIVISION_ORG_UNIT.key, mgmt.id);
}
