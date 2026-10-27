import type { Viewer } from "@/domain/viewer";
import { SEED_ROLES } from "@/domain/permissions/roles";
import { APPROVAL_ROUTE_EXPENSE_STEP3_ORG_UNIT_ID } from "@/domain/settings/keys";
import { findOrgUnitByName } from "@/repositories/org-units";
import { seedSimpleValue } from "@/repositories/settings";
import { insertVisibilityIfAbsent } from "@/repositories/permissions";
import { seedCodeItem } from "@/repositories/code-tables";

// 05-03: 지출결의 시드 — seedMasterData 끝에서 한 번 부른다(멱등, 있으면 두지 않는다 — 관리자가 바꾼 값 보존).
// ① 결재선 3단 특정 부서 = 경영관리본부(기본값 없는 키). ② · ⑤ 지출결의 메뉴 view · write(계급 넷)와 팀장 팀 지출결의 보기
// (expenses.team — 관리자가 권한표에서 끄면 그 팀장은 자기 문서와 결재 관련 문서만 본다)는 07.1(D-7107)부터 기본값 표
// (`domain/seed/role-defaults.ts`)가 넣는다. ③ 지출결의 정보 항목 둘을 계급 다섯에 참으로. ④ 지급 방식 코드표 값 셋(값 확정 · 관리 화면 점검은 Phase 6 MAST-05).
const EXPENSE_INFO_ITEMS = ["expense.value", "expense.amount"];
const PAYMENT_METHOD_CODES = [
  { value: "bank_transfer", label: "계좌이체", sortOrder: 0 },
  { value: "corp_card", label: "법인카드", sortOrder: 1 },
  { value: "cash", label: "현금", sortOrder: 2 },
];

export async function seedExpenses(viewer: Viewer): Promise<void> {
  const mgmt = await findOrgUnitByName(viewer, "경영관리본부");
  if (mgmt) await seedSimpleValue(viewer, APPROVAL_ROUTE_EXPENSE_STEP3_ORG_UNIT_ID.key, mgmt.id);

  for (const role of SEED_ROLES) {
    for (const infoItem of EXPENSE_INFO_ITEMS) {
      await insertVisibilityIfAbsent(viewer, { roleId: role.id, infoItem, visible: true, updatedBy: null });
    }
  }
  for (const code of PAYMENT_METHOD_CODES) {
    await seedCodeItem(viewer, { tableKey: "payment_method", ...code });
  }
}
