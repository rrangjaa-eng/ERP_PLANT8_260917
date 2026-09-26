import type { Viewer } from "@/domain/viewer";
import {
  SEED_ROLES,
  SYSADMIN_ROLE_ID,
  DEFAULT_ROLE_ID,
  CEO_ROLE_ID,
  DIVISION_HEAD_ROLE_ID,
  TEAM_LEAD_ROLE_ID,
} from "@/domain/permissions/roles";
import { MENUS, PERMISSION_ACTIONS } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { SETTING_DEFS } from "@/domain/settings/keys";
import { seedRole } from "@/repositories/roles";
import {
  upsertPermission,
  upsertVisibility,
  insertPermissionIfAbsent,
  insertVisibilityIfAbsent,
} from "@/repositories/permissions";
import { seedCodeItem } from "@/repositories/code-tables";
import { seedSimpleValue, seedHistorizedValue } from "@/repositories/settings";
import { seedOrgUnit, findOrgUnitByName } from "@/repositories/org-units";
import { seedTeam } from "@/repositories/teams";

// 이력형 키의 시드 기본 행은 항상 과거인 고정 날짜를 쓴다 — 시드 직후부터
// 유효값이 즉시 성립해(오늘 기준 effective_from <= asOf) 03-UI-SPEC.md가
// 보장하는 "설정 화면에 EMPTY 상태가 발생하지 않는다"가 실제로 성립한다.
const SEED_HISTORIZED_EFFECTIVE_FROM = "2000-01-01";

// 프로젝트 상태 코드표 시드(D-41 → D-75, 04-06) — 수주중·진행·정산·완료·
// 미수주 다섯 값. 옛 다섯 값(planning/on_hold/done/cancelled + 이 목록에 없던
// in_progress도 값 자체는 그대로)은 db/migrations/0009_project_quote_ledger_spine.sql이
// DELETE/INSERT로 이미 교체했다 — 이 상수는 그 마이그레이션이 못 닿는
// 경로(멱등 재시드·픽스처 DB)에서도 같은 값이 나오게 하는 정본이다.
// 04-10(D-93): 설명 문장은 db/migrations/0011_code_item_descriptions.sql의
// description IS NULL UPDATE 문과 글자 그대로 같아야 한다(대조 검증: Task 2
// verify) — 새 DB(이 시드)와 기존 DB(그 마이그레이션)가 같은 설명으로
// 시작한다. 04-06(D-75): 다섯 값 — settling(정산)·completed(완료)의 라벨·정렬·
// 설명과 lost의 정렬 4는 db/migrations/0012_project_status_five_values.sql과
// 글자 그대로 같다.
const PROJECT_STATUS_CODES = [
  { value: "bidding", label: "수주중", sortOrder: 0, description: "제안·PT 단계 · 쌓인 비용은 진행 뒤 프로젝트 비용" },
  { value: "in_progress", label: "진행", sortOrder: 1, description: "수주 확정 · 종료일 다음 날 자동으로 정산" },
  { value: "settling", label: "정산", sortOrder: 2, description: "행사 종료 · 발행 요청과 증빙 첨부를 마치는 단계" },
  { value: "completed", label: "완료", sortOrder: 3, description: "정산 마감 · 견적 줄이 잠기고 되돌리기 없음" },
  { value: "lost", label: "미수주", sortOrder: 4, description: "수주 실패 · 쌓인 비용은 팀 미수주 비용" },
];

// D-62: 견적 줄 대분류 = 그룹 머리글(소분류에서 파생), 그룹 순서는
// `sort_order`. Phase 3은 `code_items`의 메커니즘만 세웠고 이 표(견적
// 소분류)는 Phase 4가 처음 쓴다 — REQUIREMENTS.md·`docs/inputs`가 이름을
// 확정하지 않아 인트라넷 실무에서 흔한 대분류 네 가지로 우선 시드한다.
// 관리자가 화면(04-05 이후)에서 언제든 늘리거나 이름을 바꿀 수 있다 —
// 시드는 출발점일 뿐 정본이 아니다(evidence_type과 같은 결).
const QUOTE_SUBCATEGORY_CODES = [
  { value: "stage_construction", label: "무대·시공", sortOrder: 0, description: "무대·부스 설치와 철거 공사" },
  { value: "print_production", label: "인쇄·제작", sortOrder: 1, description: "현수막·배너·인쇄물·소품 제작" },
  { value: "staffing", label: "인력", sortOrder: 2, description: "진행요원·MC·모델 등 사람 비용" },
  { value: "etc", label: "기타", sortOrder: 3, description: "위 분류에 들지 않는 비용" },
];

// EXP-15·MAST-01: 증빙 종류 코드표 시드 — REQUIREMENTS.md가 열거한 일곱 종류와
// 각 항목의 세금 규칙 기본값(judgment — 03-06-SUMMARY.md 「실행자가 판단한 것」
// 참고. ROADMAP·EXP-15는 규칙 종류 네 값의 존재만 지정했고 일곱 종류 각각에
// 어느 값을 기본으로 둘지는 지정하지 않았다). 관리자가 화면(Task 3)에서 언제든
// 바꿀 수 있다 — 시드는 출발점일 뿐 정본이 아니다.
const EVIDENCE_TYPE_CODES: {
  value: string;
  label: string;
  sortOrder: number;
  taxRule: Record<string, unknown>;
  description: string;
}[] = [
  {
    value: "tax_invoice",
    label: "세금계산서",
    sortOrder: 0,
    description: "과세 거래 · 부가세가 붙는 세금계산서",
    taxRule: {
      ruleKind: "vat_surcharge",
      roundingUnit: 1,
      roundingMethod: "round",
      minWithholdingAmount: 0,
      basisDate: "evidence_date",
    },
  },
  { value: "invoice", label: "계산서", sortOrder: 1, description: "면세 거래 · 부가세 없는 계산서", taxRule: { ruleKind: "none" } },
  { value: "card_receipt", label: "카드 전표", sortOrder: 2, description: "법인카드 결제 전표", taxRule: { ruleKind: "none" } },
  { value: "cash_receipt", label: "현금영수증", sortOrder: 3, description: "지출 증빙용 현금영수증", taxRule: { ruleKind: "none" } },
  {
    value: "other_income",
    label: "기타소득",
    sortOrder: 4,
    description: "강사료·경품 등 일시 소득 · 원천징수 대상",
    taxRule: {
      ruleKind: "withholding",
      roundingUnit: 10,
      roundingMethod: "round",
      minWithholdingAmount: 125000,
      basisDate: "payment_date",
    },
  },
  {
    value: "business_income",
    label: "사업소득",
    sortOrder: 5,
    description: "프리랜서 용역 대가 · 원천징수 대상",
    taxRule: {
      ruleKind: "withholding",
      roundingUnit: 10,
      roundingMethod: "round",
      minWithholdingAmount: 0,
      basisDate: "payment_date",
    },
  },
  { value: "overseas_invoice", label: "해외 인보이스", sortOrder: 6, description: "해외 거래처 인보이스 · 부가세 없음", taxRule: { ruleKind: "none" } },
];

// MAST-02: 본부·팀 최소 시드 — PROJECT.md가 실명으로 쓰는 두 본부(기획본부·
// 경영관리본부), 각 본부에 팀 하나. 임의의 이름을 만들지 않는다. 멱등이다.
const ORG_SEED: { orgUnit: { name: string; sortOrder: number }; team: { name: string; sortOrder: number } }[] = [
  { orgUnit: { name: "기획본부", sortOrder: 0 }, team: { name: "기획1팀", sortOrder: 0 } },
  { orgUnit: { name: "경영관리본부", sortOrder: 1 }, team: { name: "경영관리팀", sortOrder: 0 } },
];

export type SeedResult = {
  roles: number;
  permissions: number;
  visibility: number;
  codeItems: number;
  settings: number;
  orgUnits: number;
  teams: number;
};

// 이 모듈은 권한 판정을 거치지 않는 유일한 경로다 — 부트스트랩 시점에는 판정할
// 권한표가 아직 없다. 허용된 호출자는 scripts/seed-master.ts·통합 테스트
// setup·test/e2e/global-setup.ts 뿐이다 — 화면 계층의 어떤 파일도 이 모듈을
// import하지 않는다(검증: Task 2 <verify> BOOTSTRAP LEAK 스캔).
//
// 두 번 호출해도 결과 상태가 같다(멱등) — ①은 onConflictDoNothing, ②·③은
// 시스템 관리자만 onConflictDoUpdate(같은 값으로 갱신)이고 나머지 계급은
// onConflictDoNothing(04-20 — 관리자 변경 보존), ④는 onConflictDoNothing.
export async function seedMasterData(viewer: Viewer): Promise<SeedResult> {
  let rolesCount = 0;
  for (const role of SEED_ROLES) {
    const inserted = await seedRole(viewer, {
      id: role.id,
      name: role.name,
      isSeed: role.isSeed,
      sortOrder: role.sortOrder,
      workScope: role.workScope,
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

  // Phase 4(04-01): 기획 PM(DEFAULT_ROLE_ID)의 기본 업무 메뉴 — "projects"
  // 보기·쓰기. `app/(app)/projects/page.tsx`가 이 페이즈에서 `can(viewer,
  // "projects", "view")` 게이트를 얻는다(admin/vendors 선례). 관리자 메뉴와
  // 달리 이 메뉴는 PM의 일상 업무라 admin.*처럼 관리자가 권한표에서 매번
  // 켜야 하는 빈 기본값으로 두지 않는다 — 이미 여러 기존 E2E(page-chrome·
  // mobile-page-chrome·a11y·mobile-list-empty)가 role-pm의 `/projects` 접근을
  // 전제하고 있고(게이트가 없던 시절부터), 이 시드가 없으면 이 플랜이 추가하는
  // 게이트가 그 전제를 조용히 깬다.
  for (const action of ["view", "write"] as const) {
    await insertPermissionIfAbsent(viewer, {
      roleId: DEFAULT_ROLE_ID,
      menu: "projects",
      action,
      allowed: true,
      updatedBy: null,
    });
    permissionsCount++;
  }

  // 04-20(D-46·D-79·A-05): 상태 전환 기본 권한 — 팀장·본부 책임자·대표는
  // 프로젝트 화면(보기)과 수주중·미수주 전환(projects.status 쓰기), 대표는
  // 정산 → 완료(projects.complete 쓰기)까지. 없을 때만 넣는다 — 관리자가 권한표에서
  // 끈 값을 다음 배포의 시드가 되살리지 않는다. 04-22(사용자 결정 2026-09-25): 같은 계급에
  // 기간만 고치는 projects.period 쓰기를 더한다.
  const statusDefaults: { roleId: string; menu: string; action: "view" | "write" }[] = [
    ...[TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID, CEO_ROLE_ID].flatMap((roleId) => [
      { roleId, menu: "projects", action: "view" as const },
      { roleId, menu: "projects.status", action: "write" as const },
      { roleId, menu: "projects.period", action: "write" as const },
    ]),
    { roleId: CEO_ROLE_ID, menu: "projects.complete", action: "write" },
  ];
  for (const entry of statusDefaults) {
    await insertPermissionIfAbsent(viewer, { ...entry, allowed: true, updatedBy: null });
    permissionsCount++;
  }

  // 04-20(ENG-D2·ENG-D3 ③): 시스템 관리자만 전 항목을 매번 켜고, 나머지 계급은
  // 없을 때만 넣는다 — 기획 PM·팀장·본부 책임자는 staffDefault, 대표는 그에 더해
  // 매출(revenue.*) 항목까지. 관리자가 노출표에서 끈 값을 시드가 되살리지 않는다.
  const staffDefaultRoles = [DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID];
  let visibilityCount = 0;
  for (const item of INFO_ITEMS) {
    await upsertVisibility(viewer, {
      roleId: SYSADMIN_ROLE_ID,
      infoItem: item.key,
      visible: true,
      updatedBy: null,
    });
    for (const roleId of staffDefaultRoles) {
      // 04-16(D-85 · CEO 리뷰 B-29): 발행액은 기획 PM 행만 upsert해 재시드한 기존 DB에도 공개하고,
      // 팀장·본부 책임자 행은 없을 때만 숨김으로 넣는다 — 관리자가 노출표에서 켠다.
      if (item.key === "revenue.issued_amount") {
        if (roleId === DEFAULT_ROLE_ID) {
          await upsertVisibility(viewer, { roleId, infoItem: item.key, visible: true, updatedBy: null });
        } else {
          await insertVisibilityIfAbsent(viewer, { roleId, infoItem: item.key, visible: false, updatedBy: null });
        }
        continue;
      }
      await insertVisibilityIfAbsent(viewer, { roleId, infoItem: item.key, visible: item.staffDefault, updatedBy: null });
    }
    await insertVisibilityIfAbsent(viewer, {
      roleId: CEO_ROLE_ID,
      infoItem: item.key,
      visible: item.staffDefault || item.key.startsWith("revenue."),
      updatedBy: null,
    });
    visibilityCount += 2 + staffDefaultRoles.length;
  }

  let codeItemsCount = 0;
  for (const code of PROJECT_STATUS_CODES) {
    const inserted = await seedCodeItem(viewer, { tableKey: "project_status", ...code });
    if (inserted) codeItemsCount++;
  }
  for (const code of EVIDENCE_TYPE_CODES) {
    const inserted = await seedCodeItem(viewer, { tableKey: "evidence_type", ...code });
    if (inserted) codeItemsCount++;
  }
  for (const code of QUOTE_SUBCATEGORY_CODES) {
    const inserted = await seedCodeItem(viewer, { tableKey: "quote_subcategory", ...code });
    if (inserted) codeItemsCount++;
  }

  let orgUnitsCount = 0;
  let teamsCount = 0;
  for (const entry of ORG_SEED) {
    const insertedOrgUnit = await seedOrgUnit(viewer, entry.orgUnit);
    if (insertedOrgUnit) orgUnitsCount++;

    const orgUnit = await findOrgUnitByName(viewer, entry.orgUnit.name);
    if (!orgUnit) continue;
    const insertedTeam = await seedTeam(viewer, { orgUnitId: orgUnit.id, ...entry.team });
    if (insertedTeam) teamsCount++;
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
    orgUnits: orgUnitsCount,
    teams: teamsCount,
  };
}
