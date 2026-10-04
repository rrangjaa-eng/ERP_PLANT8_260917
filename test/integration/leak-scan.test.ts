import { beforeAll, describe, expect, it } from "vitest";
import { seedMasterData } from "@/domain/seed";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { skipDbReset } from "./setup";
import { DTO_REGISTRY, registerDto } from "@/domain/permissions/dto-registry";
import { ACTION_REGISTRY, EXPORT_REGISTRY } from "@/lib/actions/registry";
import { SEED_ROLES } from "@/domain/permissions/roles";
import { MENUS, PERMISSION_ACTIONS } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { visible } from "@/domain/permissions/visible";
import type { Viewer } from "@/domain/viewer";

// 프로덕션 레지스트리 등록을 트리거하는 side-effect import(D-38: 순수 런타임
// 등록 — 모듈이 로드돼야 registerDto/registerAction이 실행된다). 액션
// 파일(actions.ts) 자체는 "use server" → lib/actions/client.ts →
// lib/viewer.ts → "server-only"/"next/headers" 의존 체인이라 Vitest(node
// 환경)에서 import할 수 없다(Rule 3, 실측: `Cannot find package 'server-only'`)
// — 그래서 등록 선언을 actions.registry.ts로 분리했고(03-03) 여기서는 그
// 부작용 없는 등록 파일만 import한다.
import "@/domain/code-tables";
import "@/domain/org";
import "@/domain/corp-cards";
import "@/domain/people";
import "@/domain/vendors";
import "@/domain/projects";
import "@/domain/projects/references";
import "@/domain/quotes/lines";
import "@/domain/quotes/revisions";
import "@/domain/revenue";
import "@/domain/reserves";
import "@/domain/action-log/export";
import "@/domain/archive";
import "@/app/(app)/admin/code-tables/actions.registry";
import "@/app/(app)/admin/settings/actions.registry";
import "@/app/(app)/admin/people/actions.registry";
import "@/app/(app)/admin/corp-cards/actions.registry";
import "@/app/(app)/admin/vendors/actions.registry";
import "@/app/(app)/admin/action-log/actions.registry";
import "@/app/(app)/admin/archive/actions.registry";
import "@/app/(app)/admin/permissions/actions.registry";
import "@/app/(app)/admin/visibility/actions.registry";
import "@/app/(app)/admin/holidays/actions.registry";
import "@/app/(app)/projects/actions.registry";
import "@/app/(app)/pnl/reserves/actions.registry";
import "@/domain/certs/events";
import "@/app/(app)/certs/events/actions.registry";
import "@/domain/certs/review";
import "@/app/(app)/certs/submissions/[id]/actions.registry";
import "@/app/(app)/admin/field-definitions/actions.registry";
import {
  createFieldDefinition,
  FIELD_DEFINITION_ADMIN_DTO_FIELDS,
  listFieldDefinitionsForAdmin,
} from "@/domain/custom-fields/admin";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";

// D-38: 이 페이즈의 정본 예외 목록은 이 하나뿐이다(03-04가 이 이름으로
// 등록한다) — dtoName이 null인 내보내기는 사람 단위 정보 항목이 없는
// 키-값 스냅샷만 여기 들어간다. 목록에 없는 null 항목은 실패한다.
const NULL_DTO_EXEMPT_EXPORTS = ["settings.export"];

// 이 파일은 노출표를 읽기만 한다 — 케이스 1611건마다 TRUNCATE+시드를 하면 CI에서
// 4분이 걸린다(건당 약 150ms). 매 테스트 리셋을 끄고 시드만 한 번 넣는다.
skipDbReset();
beforeAll(async () => {
  await seedMasterData(SYSTEM_VIEWER);
});

// Phase 4(04-32, ENG-D3 ②) — infoItem은 문자열(정보 항목 하나) 또는 목록
// (all-of, 전부 봐야 참)이다. 목록이면 원소마다 펼쳐 각각을 검사한다 —
// 문자열이면 한 원소로 취급해 기존 동작과 같다.
function infoItemsOf(field: { infoItem: string | readonly string[] }): readonly string[] {
  return typeof field.infoItem === "string" ? [field.infoItem] : field.infoItem;
}

// 케이스 생성기: 프로덕션 레지스트리에서 flatMap으로만 만든다(정렬·셔플
// 없음) — 두 번 호출해도 같은 배열이 나와야 한다(아래 결정성 단언).
function buildDtoCases() {
  return DTO_REGISTRY.flatMap((dto) =>
    dto.fields.flatMap((field) =>
      infoItemsOf(field).flatMap((infoItem) =>
        SEED_ROLES.map((role) => ({
          // 케이스 식별자 = DTO 이름 + 필드 키 + 정보 항목 + 계급 — 같은 필드
          // 이름을 쓰는 DTO 둘이 있어도, all-of 필드가 항목을 여럿 펼쳐도
          // 케이스가 합쳐지지 않는다.
          name: `${dto.name}·${field.key}·${infoItem}·${role.id}`,
          dto,
          field,
          infoItem,
          role,
        })),
      ),
    ),
  );
}

function buildActionCases() {
  return ACTION_REGISTRY.flatMap((action) =>
    SEED_ROLES.map((role) => ({
      name: `${action.name}·${role.id}`,
      action,
      role,
    })),
  );
}

function buildExportCases() {
  return EXPORT_REGISTRY.flatMap((entry) =>
    SEED_ROLES.map((role) => ({
      name: `${entry.name}·${role.id}`,
      entry,
      role,
    })),
  );
}

describe("정보 노출 누수 스캔 (ADMN-03)", () => {
  // 빈 레지스트리를 조용히 통과시키지 않는다 — 이 페이즈에 실제 항목이 있는
  // 두 축(액션·DTO)은 1개 이상을 요구한다. 내보내기 축은 이 플랜이 끝나는
  // 시점엔 0개가 정상이라(03-04·03-07이 채운다) 배열 타입만 확인한다.
  it("액션 레지스트리가 비어 있지 않다 — 0건 초록은 이 검사의 존재 이유를 무력화한다", () => {
    expect(ACTION_REGISTRY.length).toBeGreaterThan(0);
  });

  it("DTO 레지스트리가 비어 있지 않다", () => {
    expect(DTO_REGISTRY.length).toBeGreaterThan(0);
  });

  // 03-04(설정)·03-07(행동 로그)이 실제로 채웠으므로 "0개가 정상"이던 시기는
  // 끝났다. 배열 타입만 보면 내보내기 등록이 통째로 사라져도 초록불이 된다 —
  // 액션·DTO 축과 같이 하한을 건다.
  it("내보내기 레지스트리가 비어 있지 않다 — 0건 초록은 이 검사의 존재 이유를 무력화한다", () => {
    expect(EXPORT_REGISTRY.length).toBeGreaterThanOrEqual(2);
  });

  it("dtoName이 null인 내보내기 항목은 전부 NULL_DTO_EXEMPT_EXPORTS 목록에 있다(검토되지 않은 우회 방지)", () => {
    const unreviewed = EXPORT_REGISTRY.filter(
      (entry) => entry.dtoName === null && !NULL_DTO_EXEMPT_EXPORTS.includes(entry.name),
    );
    expect(
      unreviewed,
      `검토되지 않은 DTO 없는 내보내기: ${unreviewed.map((entry) => entry.name).join(", ")}`,
    ).toEqual([]);
  });

  it("생성 함수를 두 번 불러도 케이스 이름 배열이 같다(결정적 순서)", () => {
    expect(buildDtoCases().map((c) => c.name)).toEqual(buildDtoCases().map((c) => c.name));
    expect(buildActionCases().map((c) => c.name)).toEqual(buildActionCases().map((c) => c.name));
    expect(buildExportCases().map((c) => c.name)).toEqual(buildExportCases().map((c) => c.name));
  });

  describe("DTO 축 — 등록된 DTO의 모든 필드가 정보 항목 레지스트리에 매핑되어 있다", () => {
    it.each(buildDtoCases())("$name", async ({ infoItem, role }) => {
      const registered = INFO_ITEMS.some((item) => item.key === infoItem);
      expect(registered, `정보 항목 '${infoItem}'이 INFO_ITEMS에 없습니다`).toBe(true);

      // (계급, 정보 항목) 노출표 조회가 실제로 도는지 확인한다 — 행이
      // 있어야 하는 것이 아니라 "조회 가능"(예외 없이 boolean으로 확정)
      // 이어야 한다는 것이 이 축의 계약이다(값 자체의 정합성은
      // visibility.test.ts가 증명한다).
      const viewer: Viewer = { id: "leak-scan-probe", roleId: role.id };
      const result = await visible(viewer, infoItem);
      expect(typeof result).toBe("boolean");
    });

    // 04-18(ENG-D3 ② · T-04-93) — 목록 행의 매출은 발행 항목 하나, 기준 · 수익금 · 수익률은 견적 · 발행 all-of로 등록돼
    // 이 스캔이 두 항목을 모두 펼쳐 본다(투영 전 손 삭제가 아니라 명세가 규칙이다).
    it("ProjectListItemDto의 매출 · 기준 · 수익금 · 수익률 정보 항목이 등록돼 있다", () => {
      const dto = DTO_REGISTRY.find((entry) => entry.name === "ProjectListItemDto");
      const infoItemOf = (key: string) => dto?.fields.find((field) => field.key === key)?.infoItem;
      expect(infoItemOf("revenueKrw")).toBe("revenue.issued_amount");
      for (const key of ["profitBasis", "profitKrw", "profitRate"]) {
        expect(infoItemOf(key), key).toEqual(["quote.amount", "revenue.issued_amount"]);
      }
    });

    // 04-42 리뷰 B1 — 리저브 대장의 선택지(클라이언트 · 프로젝트 · 증빙 종류)와 대장 DTO의 이름 칸도 명세로 등록돼 이 스캔이
    // 본다 — 거래처 이름은 vendor.value, 프로젝트 이름은 project.value와 reserve.amount의 all-of다.
    it("리저브 선택지 DTO와 대장 DTO의 이름 칸 정보 항목이 등록돼 있다", () => {
      const infoItemOf = (dtoName: string, key: string) => DTO_REGISTRY.find((entry) => entry.name === dtoName)?.fields.find((field) => field.key === key)?.infoItem;
      expect(infoItemOf("ReserveClientOptionDto", "name")).toEqual(["reserve.amount", "vendor.value"]);
      expect(infoItemOf("ReserveClientOptionDto", "label")).toEqual(["reserve.amount", "vendor.value"]);
      expect(infoItemOf("ReserveProjectOptionDto", "name")).toEqual(["reserve.amount", "project.value"]);
      expect(infoItemOf("ReserveEvidenceOptionDto", "label")).toBe("reserve.amount");
      expect(infoItemOf("ReserveEntryDto", "projectName")).toEqual(["reserve.amount", "project.value"]);
      expect(infoItemOf("ReserveEntryDto", "evidenceLabel")).toBe("reserve.amount");
    });

    // /qa ISSUE-001(PR #121) — 견적 줄의 거래처 이름은 프로젝트 정보와 거래처 정보를 모두 볼 때만(all-of).
    it("QuoteLineDto의 거래처 이름 정보 항목이 등록돼 있다", () => {
      const dto = DTO_REGISTRY.find((entry) => entry.name === "QuoteLineDto");
      expect(dto?.fields.find((field) => field.key === "vendorName")?.infoItem).toEqual(["project.value", "vendor.value"]);
    });

    // quick 261001-85g(ADMN-03) — 프로젝트 등록 폼 선택지(거래처 · 팀 · 사람)도 명세로 등록돼 이 스캔이 본다.
    // 정보 항목은 각 마스터 DTO의 이름 칸과 같다(마스터 목록 자체를 싣기 때문).
    it("프로젝트 등록 폼 선택지 DTO의 정보 항목이 등록돼 있다", () => {
      const infoItemOf = (dtoName: string, key: string) => DTO_REGISTRY.find((entry) => entry.name === dtoName)?.fields.find((field) => field.key === key)?.infoItem;
      for (const [dtoName, infoItem] of [
        ["ProjectVendorOptionDto", "vendor.value"],
        ["ProjectTeamOptionDto", "team.value"],
        ["ProjectPersonOptionDto", "person.value"],
      ] as const) {
        expect(infoItemOf(dtoName, "id"), dtoName).toBe(infoItem);
        expect(infoItemOf(dtoName, "name"), dtoName).toBe(infoItem);
      }
    });

    it("registerDto가 빈 목록 infoItem: []을 거부한다", () => {
      expect(() =>
        registerDto({
          name: `__leak-scan-empty-infoitem-probe-${Date.now()}`,
          fields: [{ key: "x", infoItem: [] }],
        }),
      ).toThrow();
    });
  });

  describe("액션 축 — 등록된 액션의 메뉴·동작·DTO 참조가 전부 다른 레지스트리에 있다", () => {
    it.each(buildActionCases())("$name", ({ action }) => {
      const menuRegistered = MENUS.some((menu) => menu.key === action.menu);
      expect(menuRegistered, `메뉴 '${action.menu}'이 MENUS에 없습니다`).toBe(true);

      const actionRegistered = PERMISSION_ACTIONS.includes(action.action);
      expect(actionRegistered, `동작 '${action.action}'이 PERMISSION_ACTIONS에 없습니다`).toBe(true);

      if (action.dtoName !== null) {
        const dtoRegistered = DTO_REGISTRY.some((dto) => dto.name === action.dtoName);
        expect(dtoRegistered, `DTO '${action.dtoName}'이 DTO_REGISTRY에 없습니다`).toBe(true);
      }
    });
  });

  describe("내보내기 축 — 메뉴가 등록되어 있고, DTO가 있으면 그 필드가 전부 노출표에 매핑되어 있다", () => {
    // it.each가 빈 배열이면 자식 스위트에 테스트가 0개가 되어 vitest가
    // "No test found in suite"로 스위트 자체를 실패시킨다 — 이 항상-존재하는
    // 테스트가 그 상태를 막는다. 실제 케이스 유무는 위의 하한 단언이 지킨다.
    it("EXPORT_REGISTRY 배열 자체는 항상 검사 대상이다(0건이어도 스위트가 죽지 않는다)", () => {
      expect(Array.isArray(buildExportCases())).toBe(true);
    });

    it.each(buildExportCases())("$name", async ({ entry, role }) => {
      const menuRegistered = MENUS.some((menu) => menu.key === entry.menu);
      expect(menuRegistered, `메뉴 '${entry.menu}'이 MENUS에 없습니다`).toBe(true);

      if (entry.dtoName === null) return;

      const dto = DTO_REGISTRY.find((candidate) => candidate.name === entry.dtoName);
      expect(dto, `DTO '${entry.dtoName}'이 DTO_REGISTRY에 없습니다`).toBeTruthy();
      if (!dto) return;

      for (const field of dto.fields) {
        for (const infoItem of infoItemsOf(field)) {
          const registered = INFO_ITEMS.some((item) => item.key === infoItem);
          expect(registered, `정보 항목 '${infoItem}'이 INFO_ITEMS에 없습니다`).toBe(true);

          const viewer: Viewer = { id: "leak-scan-probe", roleId: role.id };
          const result = await visible(viewer, infoItem);
          expect(typeof result).toBe("boolean");
        }
      }
    });
  });
});
import "@/domain/approvals";
import "@/domain/leave";
import "@/app/(app)/leave/actions.registry";
import "@/app/(app)/approvals/actions.registry";
import "@/app/(app)/admin/people/[id]/actions.registry";

// 04.5-09(Codex #6 · ROADMAP 04.5 기준 5) — 메뉴 게이트 DTO 축. 정보 노출표 항목이 없는 관리 메타데이터 DTO의
// 검토된 목록이다(사람 단위 값 없음 · 메뉴 view 뒤에서만 나간다). 여기 없는 관리 DTO는 위 DTO 등록부 축에 있어야 한다.
// 필드를 더하려면 아래 검토 목록도 손으로 고친다(생산 상수를 복사해 비교하지 않는다 — 검토 게이트).
const MENU_GATED_DTOS = [
  {
    name: "FieldDefinitionAdminDto",
    menu: "admin.field-definitions",
    reviewedFields: ["id", "key", "label", "type", "options", "archivedOptions", "required", "sortOrder", "version", "archived"],
    fields: FIELD_DEFINITION_ADMIN_DTO_FIELDS,
    list: listFieldDefinitionsForAdmin,
  },
];

function buildMenuGatedDtoCases() {
  return MENU_GATED_DTOS.flatMap((dto) =>
    SEED_ROLES.map((role) => ({
      name: `${dto.name}·${role.id}`,
      dto,
      role,
    })),
  );
}

describe("메뉴 게이트 DTO 축 — 정보 노출표 항목이 없는 관리 DTO는 메뉴 view 뒤에서만 나간다 (04.5-09)", () => {
  it("검토된 목록이 비어 있지 않고 케이스가 DTO마다 시드 계급 수만큼 생긴다", () => {
    expect(MENU_GATED_DTOS.length).toBeGreaterThan(0);
    expect(buildMenuGatedDtoCases()).toHaveLength(MENU_GATED_DTOS.length * SEED_ROLES.length);
  });

  it.each(MENU_GATED_DTOS)("$name: 메뉴가 MENUS에 있고 DTO 등록부에 없으며 검토된 필드 목록과 DTO 필드 상수가 같다", (dto) => {
    expect(MENUS.some((menu) => menu.key === dto.menu), `메뉴 '${dto.menu}'이 MENUS에 없습니다`).toBe(true);
    expect(DTO_REGISTRY.some((entry) => entry.name === dto.name), `'${dto.name}'은 두 축 중 하나에만 있어야 합니다`).toBe(false);
    expect([...dto.fields]).toEqual(dto.reviewedFields);
  });

  it("FieldDefinitionAdminDto: 시스템 관리자가 거래처 칸을 만든 뒤 목록이 돌려준 DTO의 키 집합이 검토된 목록과 같다", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, {
      email: `leak-scan-fd-${Date.now()}@example.test`,
      name: "누수 스캔 화면 항목",
      roleId: SYSADMIN_ROLE_ID,
    });
    const admin: Viewer = { id: userId, roleId: SYSADMIN_ROLE_ID };
    const { id } = await createFieldDefinition(admin, {
      name: `누수스캔${Date.now() % 100000}`,
      type: "text",
      required: false,
      sortOrder: 1,
    });

    const [entry] = MENU_GATED_DTOS;
    if (!entry) throw new Error("MENU_GATED_DTOS가 비었다 — 전제가 깨졌다");
    const rows = await entry.list(admin);
    const row = rows.find((candidate) => candidate.id === id);
    expect(row, "방금 만든 칸이 관리 목록에 없다").toBeTruthy();
    expect(Object.keys(row ?? {}).sort()).toEqual([...entry.reviewedFields].sort());
  });

  it.each(buildMenuGatedDtoCases())("$name", async ({ dto, role }) => {
    const viewer: Viewer = { id: "leak-scan-probe", roleId: role.id };
    if (await can(viewer, dto.menu, "view")) {
      expect(Array.isArray(await dto.list(viewer))).toBe(true);
    } else {
      await expect(dto.list(viewer)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("시드 기준으로 목록을 받는 계급은 시스템 관리자 하나다", async () => {
    const allowedRoles: string[] = [];
    for (const role of SEED_ROLES) {
      if (await can({ id: "leak-scan-probe", roleId: role.id }, "admin.field-definitions", "view")) allowedRoles.push(role.id);
    }
    expect(allowedRoles).toEqual([SYSADMIN_ROLE_ID]);
  });
});

// 04.5-03(ROADMAP 04.5 기준 4·5 · T-04.5-04) — 커스텀 칸 축. 활성 거래처 칸 × 시드 계급마다, 그 계급에 거래처 메뉴 보기와
// 「거래처 정보」(vendor.value)를 켠 상태로 끄기 전 직렬화에 두 칸 값이 있음을 먼저 확인(헛통과 방지)한 뒤, 그 칸만 끄면
// 그 값만 사라지고 다른 칸 값은 남는다. vendor.value를 켜지 않으면 상위 차단으로 DTO가 비어 헛되이 통과한다.
import { listVendors, searchVendors } from "@/domain/vendors";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";

function buildCustomFieldCases(
  defs: ReadonlyArray<{ key: string; value: string }>,
  roles: ReadonlyArray<{ id: string }>,
) {
  return defs.flatMap((def) =>
    roles.map((role) => ({
      name: `cf.vendor.${def.key}·${role.id}`,
      def,
      role,
    })),
  );
}

describe("커스텀 칸 축 — 계급에게서 끈 거래처 칸의 값이 그 계급의 거래처 DTO 직렬화에 없다 (04.5-03)", () => {
  it("활성 칸 × 시드 계급마다 끄기 전 값이 있고, 끈 칸 값만 사라진다", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, {
      email: `leak-scan-cf-${Date.now()}@example.test`,
      name: "누수 스캔 커스텀 칸",
      roleId: SYSADMIN_ROLE_ID,
    });
    const admin: Viewer = { id: userId, roleId: SYSADMIN_ROLE_ID };
    const suffix = Date.now() % 100000;
    const first = await createFieldDefinition(admin, { name: `누수칸가${suffix}`, type: "text", required: false, sortOrder: 1 });
    const second = await createFieldDefinition(admin, { name: `누수칸나${suffix}`, type: "text", required: false, sortOrder: 2 });
    const defs = [
      { key: first.key, value: `누수금지가-${suffix}` },
      { key: second.key, value: `누수금지나-${suffix}` },
    ];
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `누수스캔거래처${suffix}`,
      normalizedName: `누수스캔거래처${suffix}`,
      customFields: Object.fromEntries(defs.map((def) => [def.key, def.value])),
    });

    const cases = buildCustomFieldCases(defs, SEED_ROLES);
    expect(cases.map((c) => c.name)).toEqual(buildCustomFieldCases(defs, SEED_ROLES).map((c) => c.name));
    expect(cases).toHaveLength(SEED_ROLES.length * defs.length);

    const checked: string[] = [];
    for (const { name, def, role } of cases) {
      await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.vendors", action: "view", allowed: true });
      await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: true });
      const viewer: Viewer = { id: "leak-scan-probe", roleId: role.id };
      // 04.5-05(03 검토 M-3): 목록 · 검색 두 출구를 함께 직렬화한다.
      const serialize = async () =>
        JSON.stringify([
          ...(await listVendors(viewer)).filter((row) => row.id === vendor.id),
          ...(await searchVendors(viewer, vendor.name)).filter((row) => row.id === vendor.id),
        ]);

      const before = await serialize();
      for (const each of defs) expect(before, `${name}: 끄기 전 ${each.key} 값이 없다(헛통과)`).toContain(each.value);

      const item = customFieldInfoItem("vendor", def.key);
      await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: item, visible: false });
      try {
        const after = await serialize();
        expect(after, `${name}: 끈 칸 값이 남았다`).not.toContain(def.value);
        for (const other of defs.filter((each) => each.key !== def.key)) {
          expect(after, `${name}: 다른 칸 ${other.key} 값이 사라졌다`).toContain(other.value);
        }
      } finally {
        await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: item, visible: true });
      }
      checked.push(name);
    }
    console.log(`커스텀 칸 축 양성·음성 단언 통과 ${checked.length}건: ${checked.join(", ")}`);
    expect(checked).toEqual(cases.map((c) => c.name));
  });
});
import "@/domain/expenses";
