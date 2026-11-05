import type { Viewer } from "@/domain/viewer";
import { PERMISSION_REQUIRES } from "@/domain/permissions/matrix";
import { DIVISION_HEAD_ROLE_ID } from "@/domain/permissions/roles";
import { FUND_SEED_PERMISSIONS } from "@/domain/seed/role-defaults";
import {
  APPROVAL_ROUTE_EXPENSE_STEP3_ORG_UNIT_ID,
  APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ORG_UNIT_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID,
  FUND_DIVISION_ORG_UNIT,
} from "@/domain/settings/keys";
import { seoulToday } from "@/lib/dates";
import { log } from "@/lib/log";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { findOrgUnitByName } from "@/repositories/org-units";
import { insertPermissionIfAbsent, listPermissions } from "@/repositories/permissions";
import { findSimpleValues, seedSimpleValue, updateSimpleValueIfUnedited } from "@/repositories/settings";

// 결재선마다 ③단 담당 계급 키와 그 ③단 특정 부서 키(resolveStepScope가 쓰는 값)를 짝으로.
const STEP3_ROUTES = [
  { role: APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID, orgUnit: APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID },
  { role: APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID, orgUnit: APPROVAL_ROUTE_EXPENSE_STEP3_ORG_UNIT_ID },
  { role: APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID, orgUnit: APPROVAL_ROUTE_SETTLEMENT_STEP3_ORG_UNIT_ID },
];

// 07.3-01(D-7310): 자금 본부 설정을 값이 없을 때만 경영관리본부 uuid로 채운다(관리자 값은 덮지 않는다).
// 이름 조회는 시드 1회뿐이다(approvals-leave.ts와 같은 꼴) — 런타임 판정은 설정 uuid만 본다.
// 본부를 못 찾거나 보관됐으면 설정 없이 넘어간다 — 자금 기능은 회사 전체 계급만 쓰게 닫히므로 경고 한 줄을 남긴다.
// ③단 보정은 설정 시드 뒤에 돈다 — 01+02가 함께 처음 배포되는 DB에서도 같은 호출에서 보정되게.
export async function seedFundScope(viewer: Viewer): Promise<void> {
  await seedFundPermissions(viewer);
  const mgmt = await findOrgUnitByName(viewer, "경영관리본부");
  if (!mgmt || mgmt.archivedAt !== null) log.warn("seed.fund_division_missing", { key: FUND_DIVISION_ORG_UNIT.key });
  else await seedSimpleValue(viewer, FUND_DIVISION_ORG_UNIT.key, mgmt.id);
  await fixStep3RoleDefaults(viewer);
}

// 07.3-02(D-7316 · D-E2): 기존 DB의 ③단 담당 계급이 옛 기본값("")이고 관리자가 저장한 적 없으면 새 기본값(본부 책임자)으로 —
// 그 결재선의 ③단 특정 부서에 본부 책임자(결재 스냅숏 규칙: 팀이 이기고 팀 없으면 본부 칸 · 보관 본부 · 퇴직자 제외)가 1명 이상일 때만.
// 자금 본부 설정이 아니라 결재선마다 판정한다(Codex P2) — 없으면 그 결재선만 그대로 두고 다음 배포 시드가 다시 본다.
async function fixStep3RoleDefaults(viewer: Viewer): Promise<void> {
  const targets = new Map(
    (await findSimpleValues(viewer, STEP3_ROUTES.map((route) => route.orgUnit.key))).map((row) => [row.key, row.value]),
  );
  const snapshot = await listOrgSnapshot(viewer, seoulToday());
  const deferred: string[] = [];
  for (const route of STEP3_ROUTES) {
    const target = targets.get(route.orgUnit.key);
    const hasHead = typeof target === "string" && target !== "" && snapshot.some((p) => p.roleId === DIVISION_HEAD_ROLE_ID && p.orgUnitId === target);
    if (!hasHead) {
      deferred.push(route.role.key);
      continue;
    }
    if (await updateSimpleValueIfUnedited(viewer, route.role.key, "", route.role.default)) log.info("seed.step3_role_default_fixed", { key: route.role.key });
  }
  if (deferred.length > 0) log.info("seed.step3_role_default_deferred", { reason: "no_division_head", keys: deferred });
}

// 07.3-02(D-7315): 자금 시드 블록 — 줄마다 없을 때만 넣되, 쓰기 줄은 짝 칸(같은 메뉴 보기 · PERMISSION_REQUIRES) 중 하나라도
// 꺼진 행(allowed=false)이 있으면 넣지 않는다 — 관리자가 보기만 끈 계급에 「보기 꺼짐 · 쓰기 켜짐」이 생기지 않게. 관리자가 끈 칸은 되살리지 않는다.
async function seedFundPermissions(viewer: Viewer): Promise<void> {
  const off = new Set((await listPermissions(viewer)).filter((row) => !row.allowed).map((row) => `${row.roleId}|${row.menu}|${row.action}`));
  for (const entry of FUND_SEED_PERMISSIONS) {
    if (entry.action === "write") {
      const required = [
        { menu: entry.menu, action: "view" },
        ...PERMISSION_REQUIRES.filter((pair) => pair.from.menu === entry.menu && pair.from.action === "write").map((pair) => pair.to),
      ];
      if (required.some((cell) => off.has(`${entry.roleId}|${cell.menu}|${cell.action}`))) continue;
    }
    await insertPermissionIfAbsent(viewer, { ...entry, updatedBy: null });
  }
}
