import type { Viewer } from "@/domain/viewer";
import { SEED_ROLES, SYSADMIN_ROLE_ID, DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { MENUS, PERMISSION_ACTIONS } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { SETTING_DEFS } from "@/domain/settings/keys";
import { seedRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seedCodeItem } from "@/repositories/code-tables";
import { seedSimpleValue, seedHistorizedValue } from "@/repositories/settings";

// 이력형 키의 시드 기본 행은 항상 과거인 고정 날짜를 쓴다 — 시드 직후부터
// 유효값이 즉시 성립해(오늘 기준 effective_from <= asOf) 03-UI-SPEC.md가
// 보장하는 "설정 화면에 EMPTY 상태가 발생하지 않는다"가 실제로 성립한다.
const SEED_HISTORIZED_EFFECTIVE_FROM = "2000-01-01";

// 프로젝트 상태 코드표 시드(ROADMAP MAST-04) — 기획·진행·보류·완료·취소.
const PROJECT_STATUS_CODES = [
  { value: "planning", label: "기획", sortOrder: 0 },
  { value: "in_progress", label: "진행", sortOrder: 1 },
  { value: "on_hold", label: "보류", sortOrder: 2 },
  { value: "done", label: "완료", sortOrder: 3 },
  { value: "cancelled", label: "취소", sortOrder: 4 },
];

export type SeedResult = {
  roles: number;
  permissions: number;
  visibility: number;
  codeItems: number;
  settings: number;
};

// 이 모듈은 권한 판정을 거치지 않는 유일한 경로다 — 부트스트랩 시점에는 판정할
// 권한표가 아직 없다. 허용된 호출자는 scripts/seed-master.ts·통합 테스트
// setup·test/e2e/global-setup.ts 뿐이다 — 화면 계층의 어떤 파일도 이 모듈을
// import하지 않는다(검증: Task 2 <verify> BOOTSTRAP LEAK 스캔).
//
// 두 번 호출해도 결과 상태가 같다(멱등) — ①은 onConflictDoNothing, ②·③은
// onConflictDoUpdate(같은 값으로 갱신), ④는 onConflictDoNothing.
export async function seedMasterData(viewer: Viewer): Promise<SeedResult> {
  let rolesCount = 0;
  for (const role of SEED_ROLES) {
    const inserted = await seedRole(viewer, {
      id: role.id,
      name: role.name,
      isSeed: role.isSeed,
      sortOrder: role.sortOrder,
    });
    if (inserted) rolesCount++;
  }

  let permissionsCount = 0;
  for (const menu of MENUS) {
    for (const action of PERMISSION_ACTIONS) {
      await upsertPermission(viewer, {
        roleId: SYSADMIN_ROLE_ID,
        menu: menu.key,
        action,
        allowed: true,
        updatedBy: null,
      });
      permissionsCount++;
    }
  }

  let visibilityCount = 0;
  for (const item of INFO_ITEMS) {
    await upsertVisibility(viewer, {
      roleId: SYSADMIN_ROLE_ID,
      infoItem: item.key,
      visible: true,
      updatedBy: null,
    });
    await upsertVisibility(viewer, {
      roleId: DEFAULT_ROLE_ID,
      infoItem: item.key,
      visible: item.staffDefault,
      updatedBy: null,
    });
    visibilityCount += 2;
  }

  let codeItemsCount = 0;
  for (const code of PROJECT_STATUS_CODES) {
    const inserted = await seedCodeItem(viewer, { tableKey: "project_status", ...code });
    if (inserted) codeItemsCount++;
  }

  // ADMN-05: 등록된 키 중 default가 있는 것을 시드한다(onConflictDoNothing
  // — 이미 저장된 값을 덮어쓰지 않는다). Phase 1의 로그인 잠금 키가 이미
  // 여기 등록돼 있어 설정 화면의 키 0개 상태가 성립하지 않는다.
  let settingsCount = 0;
  for (const def of SETTING_DEFS) {
    if (def.default === undefined) continue;
    if (def.kind === "historized") {
      const inserted = await seedHistorizedValue(viewer, def.key, SEED_HISTORIZED_EFFECTIVE_FROM, def.default);
      if (inserted) settingsCount++;
    } else {
      const inserted = await seedSimpleValue(viewer, def.key, def.default);
      if (inserted) settingsCount++;
    }
  }

  return {
    roles: rolesCount,
    permissions: permissionsCount,
    visibility: visibilityCount,
    codeItems: codeItemsCount,
    settings: settingsCount,
  };
}
