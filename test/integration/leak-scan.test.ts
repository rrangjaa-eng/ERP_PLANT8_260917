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
import "@/domain/people/account";
import "@/domain/vendors";
import "@/domain/vendors/export";
import "@/domain/vendors/account-changes";
import "@/domain/vendors/contacts";
import "@/domain/vendors/documents";
import "@/domain/projects";
import "@/domain/projects/references";
import "@/domain/projects/members";
import "@/domain/projects/documents";
import "@/domain/projects/budget";
import "@/domain/quotes/lines";
import "@/domain/quotes/revisions";
import "@/domain/revenue";
import "@/domain/issue-requests";
import "@/domain/reserves";
import "@/domain/action-log/export";
import "@/domain/payments/bank-transfer";
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
import "@/app/(app)/admin/notification-rules/actions.registry";
import "@/app/(app)/projects/actions.registry";
import "@/app/(app)/projects/budget/actions.registry";
import "@/app/(app)/pnl/reserves/actions.registry";
import "@/domain/certs/events";
import "@/app/(app)/certs/events/actions.registry";
import "@/domain/certs/review";
import "@/app/(app)/certs/submissions/[id]/actions.registry";
import "@/app/(app)/admin/field-definitions/actions.registry";
import "@/domain/evidence-import";
import "@/domain/evidence-records";
import "@/domain/evidence-records/export";
import "@/app/(app)/expenses/evidence/actions.registry";
import "@/domain/evidence-records/attach";
import "@/domain/evidence-records/linked";
import "@/domain/evidence-records/pool";
import "@/app/(app)/expenses/evidence/attach/actions.registry";
import "@/domain/action-log";
import "@/domain/approvals/dto";
import "@/domain/corp-card-usages/link-targets";
import "@/domain/evidence/dto";
import "@/domain/expenses/dto";
import "@/domain/expenses/pick";
import "@/domain/leave/dto";
import "@/domain/pre-settle-check";
import "@/domain/people/seat-rules";
import "@/domain/settlements/dto";
import {
  createFieldDefinition,
  FIELD_DEFINITION_ADMIN_DTO_FIELDS,
  listFieldDefinitionsForAdmin,
} from "@/domain/custom-fields/admin";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { ForbiddenError as PeopleForbiddenError, resetPersonPassword } from "@/domain/people";
import { RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import type { DtoSpec } from "@/domain/permissions/project";
import { ROLE_DEFAULT_PERMISSIONS } from "@/domain/seed/role-defaults";
import { makeDelegatedRole } from "./admin-cap-fixtures";

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

    // 06.1-05 — 증빙 기록 목록 DTO: 금액 셋은 증빙 금액, 나머지(상태 2행의 팀 · 본부 이름 포함)는 증빙 내용으로 계급별 노출표를 지난다.
    it("EvidenceRecordDto의 금액 칸은 evidence.amount, 나머지는 evidence.value다", () => {
      const dto = DTO_REGISTRY.find((entry) => entry.name === "EvidenceRecordDto");
      const amounts = ["supplyKrw", "vatKrw", "totalKrw"];
      expect(dto?.fields.length).toBeGreaterThan(amounts.length);
      for (const field of dto?.fields ?? []) {
        expect(field.infoItem, field.key).toBe(amounts.includes(field.key) ? "evidence.amount" : "evidence.value");
      }
      expect(dto?.fields.filter((field) => amounts.includes(field.key))).toHaveLength(amounts.length);
    });

    // 06.1-06 — 붙은 증빙 읽기 행의 금액은 증빙 금액. 붙일 문서 후보 · 떼기 미리 보기의 금액은 문서 금액이라 문서 금액 항목(독립 검토 P3-1).
    // 나머지 칸은 증빙 내용.
    it("06.1-06 증빙 붙임 DTO의 금액 칸 정보 항목 · 나머지는 evidence.value다", () => {
      for (const [dtoName, amountKey, amountItem] of [
        ["EvidenceAttachCandidateDto", "amountKrw", "expense.amount"],
        ["EvidenceAttachRequestCandidateDto", "amountKrw", "purchase_request.amount"],
        ["EvidenceLinkedItemDto", "totalKrw", "evidence.amount"],
        ["EvidenceDetachPreviewDto", "amountKrw", "expense.amount"],
      ] as const) {
        const dto = DTO_REGISTRY.find((entry) => entry.name === dtoName);
        expect(dto?.fields.length, dtoName).toBeGreaterThan(1);
        for (const field of dto?.fields ?? []) expect(field.infoItem, `${dtoName}.${field.key}`).toBe(field.key === amountKey ? amountItem : "evidence.value");
      }
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
import "@/domain/evidence";
import "@/app/(app)/expenses/actions.registry";
import { PAYMENT_VIEW_DTO_SPEC, type PaymentViewDto } from "@/domain/payments";
import { project } from "@/domain/permissions/project";
import "@/app/(app)/expenses/[id]/actions.registry";
import "@/domain/settlements";

// 06-03 — 지급 섹션 DTO(getPaymentView): 금액 칸(지급 총액 · 이체액 · 차이 · 공급가 역산)은 05 정보 항목 expense.amount를 못 보는
// 계급의 직렬화에 키째 없다(RS-19 — 새 정보 항목 없음). 계좌 노출(O-17)은 06-20이 더한다.
describe("지급 섹션 DTO 축 — 금액 칸은 expense.amount를 보는 계급에만 (06-03)", () => {
  it("시드 계급마다 금액 칸 키의 유무가 expense.amount 노출과 같고, 노출표 행이 없는 계급에는 금액 칸이 없다", async () => {
    const amountKeys = ["payableKrw", "transferKrw", "diffKrw", "grossSupplyKrw"];
    for (const key of amountKeys) expect(PAYMENT_VIEW_DTO_SPEC.fields.find((field) => field.key === key)?.infoItem, key).toBe("expense.amount");
    const source: PaymentViewDto = {
      expenseId: "00000000-0000-4000-8000-000000000603",
      version: 2,
      row: { row: "P6", primary: null, ownerNote: null },
      payDate: "2026-09-22",
      paidTime: "14:02",
      payableKrw: 1_100_000,
      transferKrw: 1_100_000,
      diffKrw: 0,
      grossSupplyKrw: 1_000_000,
    };
    // 시드는 지금 모든 계급에 expense.amount를 켠다 — 음성 쪽은 노출표 행이 없는 계급(관리자가 새로 만든 계급의 기본 숨김)으로 단언한다.
    const hiddenProbe = "leak-scan-no-visibility-rows";
    const hidden: string[] = [];
    for (const roleId of [...SEED_ROLES.map((role) => role.id), hiddenProbe]) {
      const viewer: Viewer = { id: "leak-scan-probe", roleId };
      const amountVisible = await visible(viewer, "expense.amount");
      const dto = await project(viewer, source, PAYMENT_VIEW_DTO_SPEC);
      for (const key of amountKeys) expect(key in dto, `${roleId}·${key}`).toBe(amountVisible);
      if (!amountVisible) hidden.push(roleId);
    }
    expect(hidden).toContain(hiddenProbe);
  });

  // 06-06 검토 I-1 — 06-06이 더한 증빙 금액 칸(값 · 표시 묶음 · 고침 전후 · 서버 계산 줄 · Q-F 줄)과 금액을 싣는 증빙 지문도 금액 칸이다.
  // 지문은 문자열 안에 금액을 담으므로 키 유무만이 아니라 직렬화한 JSON에서 금액 probe 값을 찾는다 — 문서 칸은 보고 금액은 못 보는 계급으로.
  it("06-06 증빙 금액 칸 · 증빙 지문은 expense.amount를 못 보는 계급의 직렬화에 키도 금액 글자도 없다", async () => {
    // 06.5 D-6520 — 증빙 금액 값 · 표시 묶음 · Q-F 넘침 칸은 보기에서 빠졌다(금액은 공급가액 하나).
    for (const key of ["evidenceAmountKrw", "evidenceAmountDisplay", "evidenceOverrun"]) expect(PAYMENT_VIEW_DTO_SPEC.fields.some((field) => field.key === key), key).toBe(false);
    const amountKeys = ["reviewAmounts", "evidenceTaxLine", "evidenceStamp"];
    for (const key of amountKeys) expect(PAYMENT_VIEW_DTO_SPEC.fields.find((field) => field.key === key)?.infoItem, key).toBe("expense.amount");
    const probe = 12_345_678;
    const source: PaymentViewDto = {
      expenseId: "00000000-0000-4000-8000-000000000606",
      version: 3,
      row: { row: "P2", primary: "confirm", ownerNote: null },
      payDate: "2026-10-06",
      paidTime: null,
      payableKrw: probe,
      transferKrw: probe,
      diffKrw: 0,
      grossSupplyKrw: probe,
      evidenceStatus: "확인 전",
      evidenceRequired: true,
      reviewAmounts: { beforeKrw: probe, afterKrw: probe },
      evidenceStamp: `00000000-0000-4000-8000-0000000006f1|${probe}|2026-10-01`,
      evidenceTaxLine: [{ text: String(probe), emphasis: true }],
    };
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `금액숨김-${randomUUID().slice(0, 8)}`, workScope: "company" });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "expense.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "expense.amount", visible: false });
    const viewer: Viewer = { id: "leak-scan-probe", roleId: role.id };
    const dto = await project(viewer, source, PAYMENT_VIEW_DTO_SPEC);
    expect("expenseId" in dto).toBe(true);
    for (const key of amountKeys) expect(key in dto, key).toBe(false);
    expect(JSON.stringify(dto)).not.toContain(String(probe));
  });
});

// 06-05 — 카드 사용 목록 · 폼 선택지 DTO와 카드 사용 액션(06-27 정보 항목 card_usage.value · card_usage.amount).
import "@/domain/corp-card-usages";
import "@/app/(app)/cards/actions.registry";
import "@/domain/purchase-requests";
import "@/app/(app)/cards/purchases/actions.registry";
import { randomUUID } from "node:crypto";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import {
  createCardUsage,
  deleteCardUsage,
  listCardUsages,
  precheckCardUsage,
  precheckCardUsageRemoval,
  precheckCardUsageUpdate,
  restoreCardUsage,
  updateCardUsage,
} from "@/domain/corp-card-usages";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertRole } from "@/repositories/roles";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";

describe("카드 사용 목록 범위 축 — 직원은 남의 카드 사용 · 남이 등록한 공용 카드 사용을 받지 않는다 (06-05 · T-06-23)", () => {
  async function team(): Promise<string> {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `누수카드본부-${randomUUID()}` });
    const name = `누수카드팀-${randomUUID()}`;
    await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name });
    return name;
  }

  async function card(input: { kind: "personal" | "shared"; holderUserId?: string }): Promise<string> {
    const created = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `누수-${randomUUID().slice(0, 8)}`,
      numberLast4: "1111",
      label: `누수 ${input.kind} 카드`,
      ...input,
    });
    if (!created.id) throw new Error("카드 id 없음");
    return created.id;
  }

  async function use(viewer: Viewer, corpCardId: string): Promise<string> {
    const input = {
      corpCardId,
      usedOn: seoulToday(),
      merchantVendorId: null,
      total: { currency: "KRW" as const, amount: 33_000, fxRate: 1 },
      evidenceTypeCode: "card_receipt",
      linkKind: "team_cost" as const,
      memo: null,
    };
    return (await createCardUsage(viewer, input, await precheckCardUsage(viewer, input))).id;
  }

  // 대리 등록 권한자(cards.proxy write) — 업무 범위는 팀. 범위가 권한에서 넓어지는지 본다(전사 범위로 넓히지 않는다).
  async function proxyRegistrant(teamName: string): Promise<Viewer> {
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `누수대리-${randomUUID().slice(0, 8)}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.proxy", action: "write", allowed: true });
    for (const infoItem of ["team.value", "card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    return makePerson("누수경영관리", role.id, teamName);
  }

  it("직원 결과에는 자기 것만, 대리 등록 권한자 · 대표 결과에는 셋 다", async () => {
    const today = seoulToday();
    const month = today.slice(0, 7);
    const staff = await makePerson("누수직원", DEFAULT_ROLE_ID, await team());
    const other = await makePerson("누수남", DEFAULT_ROLE_ID, await team());
    const proxy = await proxyRegistrant(await team());
    const ceo = await makePerson("누수대표", "role-ceo", await team());

    const own = await use(staff, await card({ kind: "personal", holderUserId: staff.id }));
    const others = await use(other, await card({ kind: "personal", holderUserId: other.id }));
    const shared = await use(proxy, await card({ kind: "shared" }));

    const idsOf = async (viewer: Viewer) => (await listCardUsages(viewer, { month }, today)).rows.map((row) => row.id);
    const staffIds = await idsOf(staff);
    expect(staffIds).toContain(own);
    expect(staffIds).not.toContain(others);
    expect(staffIds).not.toContain(shared);
    for (const viewer of [proxy, ceo]) expect(await idsOf(viewer)).toEqual(expect.arrayContaining([own, others, shared]));
  });
});

// 06-08 — 구매 요청 목록 DTO(정보 항목 purchase_request.value · purchase_request.amount · project.value): 범위 밖 계정 · 금액 가린 계정 · 권한자.
import { listPurchaseRequests } from "@/domain/purchase-requests";
import { purchaseRequests } from "@/db/schema";
import { db } from "@/db/client";
import { purchaseProject, request as purchaseRequest } from "./fixtures/purchase-requests";

describe("구매 요청 목록 누수 — 범위 밖 계정은 남의 요청이 없고, 금액을 가린 계급은 금액 키가 없다 (06-08)", () => {
  async function team(): Promise<string> {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `누수구매본부-${randomUUID()}` });
    const name = `누수구매팀-${randomUUID()}`;
    await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name });
    return name;
  }

  it("범위 밖 직원 결과에는 남의 요청 · 품목 글자가 없고, 구매 권한자 결과에는 있다", async () => {
    const fx = await purchaseProject();
    const created = await purchaseRequest(fx, fx.onlineLine);
    const today = seoulToday();
    const outsider = await makePerson("누수구매직원", DEFAULT_ROLE_ID, await team());
    const outsiderList = await listPurchaseRequests(outsider, { status: "all" }, today);
    expect(outsiderList.rows).toHaveLength(0);
    expect(outsiderList.anyInScope).toBe(false);
    expect(JSON.stringify(outsiderList)).not.toContain(created.id);
    expect(JSON.stringify(outsiderList)).not.toContain("현수막 3장");

    const purchaserRole = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `누수구매담당-${randomUUID().slice(0, 8)}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: purchaserRole.id, menu: "cards.purchases", action: "write", allowed: true });
    for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: purchaserRole.id, infoItem, visible: true });
    const purchaser = await makePerson("누수구매담당", purchaserRole.id, await team());
    const purchaserList = await listPurchaseRequests(purchaser, { status: "all" }, today);
    expect(purchaserList.rows.map((row) => row.id)).toContain(created.id);
    expect(purchaserList.privileged).toBe(true);
  });

  it("purchase_request.amount를 가린 계급 → 행에 금액 키(통화 · 외화 · 환율 · 예상 금액)가 없다", async () => {
    const fx = await purchaseProject();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `누수금액가림-${randomUUID().slice(0, 8)}`, workScope: "team" });
    for (const infoItem of ["purchase_request.value", "project.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "purchase_request.amount", visible: false });
    const viewer = await makePerson("누수금액가림", role.id, await team());
    const probe = 7_654_321;
    await db.insert(purchaseRequests).values({
      number: `${fx.projectNumber}-C${randomUUID().slice(0, 6)}`,
      linkKind: "quote_line",
      projectId: fx.projectId,
      quoteLineId: fx.onlineLine,
      requestedBy: viewer.id,
      itemName: "금액 가림 확인",
      estimateAmountKrw: probe,
    });
    const { rows } = await listPurchaseRequests(viewer, { status: "all" }, seoulToday());
    expect(rows).toHaveLength(1);
    const dto = rows[0] ?? {};
    for (const key of ["currency", "foreignAmount", "fxRate", "estimateKrw"]) expect(key in dto, key).toBe(false);
    expect(JSON.stringify(dto)).not.toContain(String(probe));
    expect(dto.itemName).toBe("금액 가림 확인");
  });
});

// 06-09 DOM D-1 — 삭제 · 되돌리기 · 수정 액션이 돌려주는 값도 목록 DTO와 같은 규칙: card_usage.amount를 못 보면 결제 합계가 없다.
describe("카드 사용 삭제 · 되돌리기 · 수정 반환 — card_usage.amount 숨김이면 결제 합계 없음 (06-09 D-1)", () => {
  it("숨김 계정의 자기 건 — 세 반환 모두 금액 값이 실리지 않는다", async () => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `누수삭제본부-${randomUUID()}` });
    const teamName = `누수삭제팀-${randomUUID()}`;
    await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `누수숨김-${randomUUID().slice(0, 8)}`, workScope: "team" });
    for (const infoItem of ["team.value", "card_usage.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "card_usage.amount", visible: false });
    const hidden = await makePerson("누수숨김", role.id, teamName);
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `누수-${randomUUID().slice(0, 8)}`, numberLast4: "2222", label: "누수 숨김 카드", kind: "personal", holderUserId: hidden.id });
    if (!card.id) throw new Error("카드 id 없음");
    const probe = 456_789;
    const input = {
      corpCardId: card.id,
      usedOn: seoulToday(),
      merchantVendorId: null,
      total: { currency: "KRW" as const, amount: probe, fxRate: 1 },
      evidenceTypeCode: "invoice",
      linkKind: "team_cost" as const,
      memo: null,
    };
    const { id } = await createCardUsage(hidden, input, await precheckCardUsage(hidden, input));
    const removed = await deleteCardUsage(hidden, { id, version: 1 }, await precheckCardUsageRemoval(hidden, { id }));
    const restored = await restoreCardUsage(hidden, { id, version: removed.version }, await precheckCardUsageRemoval(hidden, { id }));
    const edit = { ...input, total: null, memo: "메모", id, version: restored.version };
    const updated = await updateCardUsage(hidden, edit, await precheckCardUsageUpdate(hidden, edit));
    for (const result of [removed, restored, updated]) {
      expect(result.totalKrw).toBeNull();
      expect(JSON.stringify(result)).not.toContain(String(probe));
    }
  });
});

// 06-24(ROADMAP 기준 5 · T-06-117) — Phase 6(06-01 ~ 06-30)이 새로 등록한 DTO가 전부 레지스트리에 있다.
// 목록은 05-13 SUMMARY가 들어온 커밋(acf1cf2) 이후 `registerDto`로 새로 생긴 이름을 06-03 · 06-07 · 06-15 · 06-17 · 06-18 · 06-19 · 06-20 SUMMARY(`paymentView` · `CardUsageListItemDto` ·
// `ProjectCardUsageDto` · `paymentTargetRow` · `IssueRequestDto` · `PreSettleCheckDto` · `paidPaymentRow`)와 `git diff` 대조로 모은 상수다 — 레지스트리에서 거꾸로 만들면 빠진 등록을 잡지 못한다.
// `ProjectMember*` 둘은 06.2(보임 범위) 몫이라 뺐다.
const PHASE6_DTO_NAMES = [
  "paymentView",
  "payablePreview",
  "paymentTargetRow",
  "paidPaymentRow",
  "CardUsageListItemDto",
  "CardUsageEditDto",
  "CardUsageCardOptionDto",
  "ProjectCardUsageDto",
  "ProjectCardUsageTotalsDto",
  "CardLinkProjectDto",
  "CardLinkLineDto",
  "PurchaseRequestListItemDto",
  "PurchaseCompletionDto",
  "IssueRequestDto",
  "PreSettleCheckDto",
] as const;

describe("Phase 6 DTO 완전성 (06-24 · ROADMAP 기준 5)", () => {
  it("Phase 6 DTO가 모두 등록돼 있다", () => {
    expect(PHASE6_DTO_NAMES.length).toBeGreaterThanOrEqual(6);
    const registered = new Set(DTO_REGISTRY.map((entry) => entry.name));
    const missing = PHASE6_DTO_NAMES.filter((name) => !registered.has(name));
    expect(missing, `누수 스캔 레지스트리에 없는 Phase 6 DTO: ${missing.join(", ")} (registerDto를 빠뜨렸거나 그 모듈이 누수 스캔 import 목록에 없다)`).toEqual([]);
  });
});

import { getPerson, listPeople } from "@/domain/people";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// 06.5-04(D-6505): users 행에 암호화 계좌 칸이 생겼다 — 행 전체를 읽는 사람 DTO 경로가 그 칸을 싣지 않는다.
describe("직원 지급 계좌 축 — 계좌 칸은 지급 계좌 DTO에만, 사람 DTO에는 없다 (06.5-04)", () => {
  it("지급 계좌 DTO와 저장 · 번호 보기 액션이 레지스트리에 있다", () => {
    expect(DTO_REGISTRY.map((entry) => entry.name)).toContain("PersonPayoutAccountDto");
    expect(ACTION_REGISTRY.map((entry) => entry.name)).toContain("updatePersonPayoutAccountAction");
    expect(ACTION_REGISTRY.map((entry) => entry.name)).toContain("revealPersonAccountNumberAction");
  });

  it("계좌 칸을 채운 사람의 getPerson · listPeople 직렬화에 계좌 키 · 값이 없다", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, {
      email: `leak-payout-${randomUUID()}@example.test`,
      name: "누수계좌대상",
      roleId: SYSADMIN_ROLE_ID,
    });
    await db
      .update(users)
      .set({ accountBank: "누수은행", accountHolder: "누수예금주", accountNumberEncrypted: "v1:leak-cipher-text", accountNumberLast4: "4321" })
      .where(eq(users.id, userId));

    const detail = JSON.stringify(await getPerson(SYSTEM_VIEWER, userId));
    const list = JSON.stringify((await listPeople(SYSTEM_VIEWER)).filter((person) => person.id === userId));
    expect(list).toContain(userId);
    for (const text of [detail, list]) {
      expect(text).not.toMatch(/account(Bank|Holder|NumberEncrypted|NumberLast4)/);
      for (const value of ["누수은행", "누수예금주", "leak-cipher-text", "4321"]) expect(text).not.toContain(value);
    }
  });
});

// 07-03(R1 · K31 · ROADMAP 기준 5 Issue 11) — `domain/`의 `export type …Dto`가 전부 DTO 레지스트리로 덮인다.
// 등록 이름은 정적으로 긁지 않는다: registerDto는 객체 인자이고 domain/certs/events.ts는 반복문으로 등록한다.
// 위쪽 import가 등록 모듈을 전부 로드한 뒤의 런타임 DTO_REGISTRY(배열)가 정본이다.
// (모듈이 로드되는지는 test/unit/leak-scan-coverage.test.ts가 지킨다.)
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// 규칙 ② 밖의 실제 다른 이름만: Dto 타입 이름 → 레지스트리 등록 이름.
// 값은 그 타입이 실려 나가는(또는 그 타입을 감싸는) 등록 DTO다 — 필드의 정보 항목이 그 값을 거른다.
const DTO_TYPE_TO_REGISTRY_NAME: Record<string, string> = {
  CardOptionDto: "CardUsageCardOptionDto", // 같은 CARD_OPTION_SPEC으로 등록 — 이름만 다르다
  IssueRequestBoardDto: "IssueRequestDto", // IssueRequestDto & { 프로젝트 · 요청자 · 그룹 } — 투영은 IssueRequestDto 명세
  PreSettleExpenseRowDto: "PreSettleCheckDto", // 정산 전 점검 DTO의 행(금액 칸은 PRE_SETTLE_CHECK_DTO_SPEC)
  PreSettleLineRowDto: "PreSettleCheckDto",
  PreSettleRevenueDto: "PreSettleCheckDto",
  RevenueEntryDto: "RevenueDto", // RevenueDto.issuedEntries · paidEntries의 원소
  CertSubmissionGroupDto: "CertSubmissionReconcileDto", // 경품별 묶음 — 사람 값은 안의 대조 줄(rows)이 싣는다
  MoneyDto: "QuoteLineDto", // 금액 값 객체 — QuoteLineDto · RevenueDto 안에서 실려 나간다
  MoneyInputDto: "QuoteLineDto", // MoneyDto의 입력 쪽 부분(MoneyDto = MoneyInputDto & { amountKrw })
  SeatHolderDto: "SeatDuplicatesDto", // SeatDuplicatesDto.teams · orgUnits의 원소
};

// 레지스트리에 올리지 않는 타입 → 이유(화면 내부 조립용 · 다른 DTO의 부분 타입 등). 이유 없는 면제는 허용하지 않는다.
const DTO_COVERAGE_EXEMPT: Record<string, string> = {
  FieldDefinitionAdminDto: "관리 메타데이터 — 정보 항목이 없고 위 MENU_GATED_DTOS 축(메뉴 view 게이트)이 계급마다 덮는다",
  FieldDefinitionDto: "구조 메타데이터(어떤 칸이 있는지) — 사람 단위 값이 없고 project()를 거치지 않는다(domain/vendors/index.ts 주석)",
  GridDto: "권한 · 노출 격자(계급 × 메뉴/정보 항목의 참/거짓) — 사람 단위 값이 없고 admin.permissions · admin.visibility 메뉴 view 뒤에서만 나간다",
};

function listDomainDtoTypeNames(): string[] {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        for (const match of readFileSync(full, "utf8").matchAll(/export type (\w+(?:Dto|DTO))\b/g)) names.add(match[1] as string);
      }
    }
  };
  walk(resolve(process.cwd(), "domain"));
  return [...names].sort();
}

// 덮이지 않는 `*Dto` · `*DTO` 타입 이름을 돌려준다 — 이름 그대로 · Dto/DTO를 뗀 첫 글자 소문자 · 명시 대응 표 · 이유 있는 면제 중 하나.
function unmappedDtoTypes(
  typeNames: readonly string[],
  registeredNames: readonly string[],
  typeMap: Record<string, string>,
  exempt: Record<string, string>,
): string[] {
  const registered = new Set(registeredNames);
  return typeNames.filter((type) => {
    if (registered.has(type)) return false;
    const stem = type.slice(0, -"Dto".length);
    if (registered.has(stem.charAt(0).toLowerCase() + stem.slice(1))) return false;
    if (typeMap[type] !== undefined && registered.has(typeMap[type])) return false;
    if (exempt[type] !== undefined && exempt[type].trim() !== "") return false;
    return true;
  });
}

describe("`*Dto` 타입 ↔ DTO 레지스트리 대조 — 미매핑 0 (07-03 · K31)", () => {
  const typeNames = listDomainDtoTypeNames();
  const registeredNames = DTO_REGISTRY.map((entry) => entry.name);

  it("검출기가 살아 있다 — 타입 이름 · 등록 이름을 모두 찾았다", () => {
    expect(typeNames.length).toBeGreaterThan(0);
    expect(registeredNames.length).toBeGreaterThan(0);
  });

  it("덮이지 않는 `*Dto` 타입이 없다", () => {
    const unmapped = unmappedDtoTypes(typeNames, registeredNames, DTO_TYPE_TO_REGISTRY_NAME, DTO_COVERAGE_EXEMPT);
    expect(unmapped, `레지스트리에 없는 *Dto 타입: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("등록 하나를 빼면 그 이름을 쓰는 실제 타입이 미매핑으로 잡힌다(대조가 빈 시험이 아니다)", () => {
    expect(typeNames).toContain("EvidenceFileDto");
    expect(registeredNames).toContain("evidenceFile");
    const without = registeredNames.filter((name) => name !== "evidenceFile");
    expect(unmappedDtoTypes(typeNames, without, DTO_TYPE_TO_REGISTRY_NAME, DTO_COVERAGE_EXEMPT)).toContain("EvidenceFileDto");
  });

  it("전부 대문자 `*DTO` 접미사 타입도 대조된다 — routePreview · routePreviewStep 등록을 빼면 RoutePreviewDTO · RoutePreviewStepDTO가 미매핑으로 잡힌다", () => {
    expect(typeNames).toContain("RoutePreviewDTO");
    expect(typeNames).toContain("RoutePreviewStepDTO");
    expect(registeredNames).toContain("routePreview");
    expect(registeredNames).toContain("routePreviewStep");
    const without = registeredNames.filter((name) => name !== "routePreview" && name !== "routePreviewStep");
    const unmapped = unmappedDtoTypes(typeNames, without, DTO_TYPE_TO_REGISTRY_NAME, DTO_COVERAGE_EXEMPT);
    expect(unmapped).toEqual(expect.arrayContaining(["RoutePreviewDTO", "RoutePreviewStepDTO"]));
  });

  it("대응 표 · 면제 표의 키가 실제 `*Dto` 타입 이름이다(죽은 항목 0)", () => {
    const known = new Set(typeNames);
    const dead = [...Object.keys(DTO_TYPE_TO_REGISTRY_NAME), ...Object.keys(DTO_COVERAGE_EXEMPT)].filter((name) => !known.has(name));
    expect(dead, `죽은 항목: ${dead.join(", ")}`).toEqual([]);
  });

  it("대응 표의 값은 실제 등록 이름이고 면제마다 이유가 있다", () => {
    const registered = new Set(registeredNames);
    const badTargets = Object.entries(DTO_TYPE_TO_REGISTRY_NAME).filter(([, target]) => !registered.has(target));
    expect(badTargets.map(([type]) => type), "등록 이름이 아닌 대응 값").toEqual([]);
    const noReason = Object.entries(DTO_COVERAGE_EXEMPT).filter(([, reason]) => reason.trim() === "");
    expect(noReason.map(([type]) => type), "이유 없는 면제").toEqual([]);
  });

  it("DTO_REGISTRY 길이가 registerDto( 정적 호출 지점 수 이상이다(반복문 등록이 있어 같거나 크다)", () => {
    let callSites = 0;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && entry.name !== "dto-registry.ts") {
          callSites += readFileSync(full, "utf8").match(/\bregisterDto\(/g)?.length ?? 0;
        }
      }
    };
    walk(resolve(process.cwd(), "domain"));
    walk(resolve(process.cwd(), "app"));
    expect(DTO_REGISTRY.length).toBeGreaterThanOrEqual(callSites);
  });
});

// 07-24(SC-20 · T-07-24-02): 예산 · 사용액 · 남은 예산은 예산 현황 DTO(budgetRow)에만 — 프로젝트 · 견적 · 매출 DTO 명세에 그 계열 칸이 없다.
describe("예산 칸은 예산 현황 DTO에만 (07-24 SC-20)", () => {
  // usedOn(카드 사용일) 같은 날짜 칸은 예산 계열이 아니다 — 금액 칸 이름만 본다.
  const BUDGET_KEY = /^(budget|usage|remaining|used(Krw|Amount))/i;
  const screens = DTO_REGISTRY.filter((entry) => /^(project|quote|revenue)/i.test(entry.name));

  it("검출기가 살아 있다 — 프로젝트 · 견적 · 매출 DTO를 찾았고 예산 현황 DTO에는 그 칸이 있다", () => {
    expect(screens.map((entry) => entry.name)).toEqual(expect.arrayContaining(["ProjectDto", "ProjectListItemDto", "QuoteLineDto", "RevenueDto"]));
    const budgetRow = DTO_REGISTRY.find((entry) => entry.name === "budgetRow");
    expect(budgetRow?.fields.filter((field) => BUDGET_KEY.test(field.key)).map((field) => field.key)).toEqual(["budgetKrw", "usedKrw", "remainingKrw"]);
  });

  it("프로젝트 · 견적 · 매출 DTO 명세에 예산 계열 칸이 없다", () => {
    const leaked = screens.flatMap((entry) => entry.fields.filter((field) => BUDGET_KEY.test(field.key)).map((field) => `${entry.name}.${field.key}`));
    expect(leaked).toEqual([]);
  });
});

// 07-25(ROADMAP 기준 5 · K31 · T-07-25-02): 07이 더한 액션 · DTO · 비밀 액션을 이름으로 못 박아 검사한다. 위 일반 축(등록된 것 전부)은 「등록을 빠뜨린」 모듈을 못 보므로
// 07 SUMMARY들의 새 액션 · DTO 목록을 여기 적고, 목록에 있는데 등록이 없거나 튜플이 다르면 빨갛다. 07 뒤 새 액션은 이 표에 한 줄을 더한다.
const SEVEN_ACTIONS: readonly (readonly [name: string, menu: string, action: "view" | "write", dtoName: string | null])[] = [
  ["setRuleEnabledAction", "admin.notification-rules", "write", null], // 07-19
  ["saveNotificationRuleAction", "admin.notification-rules", "write", null], // 07-19
  ["moveToThisWeekAction", "expenses.payments", "write", null], // 07-16
  ["revertScheduledPayDatesAction", "expenses.payments", "write", null], // 07-16
  ["unlockPersonAction", "admin.people", "write", "PersonDto"], // 07-17
  ["resetPersonPasswordAction", "admin.people", "write", null], // 07-17 DTO 없는 비밀 액션
  ["exportVendorsCsvAction", "admin.vendors", "view", "VendorDto"], // 07-20 파일 받기(D-736)
  ["markVendorConfirmedAction", "vendors.account", "write", null], // 07-23
  ["unmarkVendorConfirmedAction", "vendors.account", "write", null], // 07-23
  ["requestVendorDocumentUploadAction", "vendors.account", "write", null], // 07-23
  ["registerVendorFromWorkAction", "expenses", "write", "VendorDto"], // 07-23
  ["pickExistingVendorFromWorkAction", "expenses", "write", "VendorDto"], // 07-23
  ["requestProjectDocumentUploadAction", "projects", "write", null], // 07-22
  ["requestInvoiceFileUploadAction", "projects.revenue", "write", null], // 07-22
  ["getInvoiceFileAction", "projects", "view", "evidenceFile"], // 07-22
  ["listBudgetHistoryAction", "projects.budget", "view", "budgetHistory"], // 07-24
  ["setBudgetManuallyAction", "projects.budget", "write", "budgetHistory"], // 07-24
];

// 07이 새로 만든 메뉴 · 지급/사람/거래처 관리 메뉴는 07-05 확정 표대로 시드 계급 중 시스템 관리자만 연다.
const SEVEN_SYSADMIN_ONLY_MENUS = ["admin.notification-rules", "projects.budget", "vendors.account", "expenses.payments", "admin.people", "admin.vendors"];

describe("07 새 액션 — 등록 튜플 · 권한 없는 계급 거부 (07-25 기준 5)", () => {
  it.each(SEVEN_ACTIONS)("%s 등록 — 메뉴 %s · 동작 %s · DTO %s", (name, menu, action, dtoName) => {
    expect(ACTION_REGISTRY.find((entry) => entry.name === name)).toEqual({ name, menu, action, dtoName });
  });

  // 시드 표(ROLE_DEFAULT_PERMISSIONS)로 판정한다 — 이 파일의 앞 describe들이 같은 DB에서 계급 권한을 켜 두므로 DB를 읽으면 순서에 기댄다.
  it("07 새 액션이 쓰는 시스템 관리자 전용 메뉴는 시드 표의 시스템 관리자 외 계급 줄에 없고, 시스템 관리자는 MENUS 루프로 켜진다", async () => {
    const guarded = SEVEN_ACTIONS.filter(([, menu]) => SEVEN_SYSADMIN_ONLY_MENUS.includes(menu));
    expect(guarded.length).toBeGreaterThan(10);
    const granted = ROLE_DEFAULT_PERMISSIONS.filter((row) => row.allowed && SEVEN_SYSADMIN_ONLY_MENUS.includes(row.menu));
    expect(granted.map((row) => `${row.roleId}|${row.menu}|${row.action}`)).toEqual([]);
    for (const menu of SEVEN_SYSADMIN_ONLY_MENUS) expect(MENUS.some((item) => item.key === menu), `${menu}이 MENUS에 없다`).toBe(true);
    const sysadmin = { id: "leak-scan-07-probe", roleId: SYSADMIN_ROLE_ID };
    for (const [name, menu, action] of guarded) expect(await can(sysadmin, menu, action), `${name} · 시스템 관리자`).toBe(true);
  });
});

describe("07 새 내보내기 — 등록 (07-25 C-P2-9 · D-736)", () => {
  it("거래처 내려받기(07-20)가 registerExport로 등록돼 있다 — 메뉴 admin.vendors · DTO VendorDto", () => {
    expect(EXPORT_REGISTRY.find((entry) => entry.name === "vendors.export")).toEqual({ name: "vendors.export", menu: "admin.vendors", dtoName: "VendorDto" });
  });
});

describe("07 새 DTO — 정보 항목을 하나씩 끈 viewer에게 그 칸이 없다 (07-25 기준 5)", () => {
  const SEVEN_DTOS = ["budgetRow", "budgetHistory", "AccountChangeDto", "VendorContactDto", "VendorDocumentFileDto"];

  it("07 새 DTO가 레지스트리에 모두 있다", () => {
    const names = new Set(DTO_REGISTRY.map((entry) => entry.name));
    expect(SEVEN_DTOS.filter((name) => !names.has(name))).toEqual([]);
  });

  it("정보 항목 하나를 끈 계급은 그 항목에 걸린 칸만 잃고 나머지 칸은 받는다", async () => {
    for (const dtoName of SEVEN_DTOS) {
      const entry = DTO_REGISTRY.find((item) => item.name === dtoName);
      if (!entry) throw new Error(`${dtoName} 미등록`);
      const spec: DtoSpec<Record<string, unknown>, Record<string, unknown>> = {
        fields: entry.fields.map((field) => ({ key: field.key, from: field.key, infoItem: field.infoItem })),
      };
      const row = Object.fromEntries(entry.fields.map((field) => [field.key, `sentinel-${field.key}`]));
      const usedItems = [...new Set(entry.fields.flatMap((field) => infoItemsOf(field)))];
      for (const off of usedItems) {
        const roleId = await makeDelegatedRole({
          name: "누수07",
          copyFrom: [],
          menus: [],
          infoItems: INFO_ITEMS.filter((item) => item.key !== off).map((item) => item.key),
        });
        const result = await project({ id: "leak-scan-07-probe", roleId }, row, spec);
        for (const field of entry.fields) {
          const dependsOnOff = infoItemsOf(field).includes(off);
          expect(field.key in result, `${dtoName}.${field.key} (끈 항목 ${off})`).toBe(!dependsOnOff);
        }
      }
    }
  });
});

// 07-17 D-P2-7: DTO 없는 비밀 액션 — 결과 `{ tempPassword }` 하나가 응답으로만 나간다. 면제가 아니라 DTO가 아닌 것이라 DTO_REGISTRY에 이름이 없어야 한다.
describe("resetPersonPasswordAction — 검토 목록의 DTO 없는 비밀 액션 (07-25 T-07-25-02)", () => {
  it("메뉴 admin.people 쓰기 · dtoName null이고 DTO_REGISTRY에 그 결과 이름이 없다", () => {
    expect(ACTION_REGISTRY.find((entry) => entry.name === "resetPersonPasswordAction")).toEqual({
      name: "resetPersonPasswordAction",
      menu: "admin.people",
      action: "write",
      dtoName: null,
    });
    expect(DTO_REGISTRY.some((entry) => /tempPassword|resetPerson/i.test(entry.name))).toBe(false);
  });

  it("admin.people 쓰기가 없는 viewer는 거부된다", async () => {
    const outcome = await resetPersonPassword({ id: "leak-scan-07-probe", roleId: DEFAULT_ROLE_ID }, "any-person").then(
      () => new Error("거부되어야 하는데 성공함"),
      (caught: unknown) => caught,
    );
    expect(outcome).toBeInstanceOf(PeopleForbiddenError);
    expect((outcome as Error).message).toBe("비밀번호 초기화 권한 없음");
  });

  it("상한 밖(시스템 관리자) 대상 · 자기 자신은 거부되고, 상한 안 대상은 결과 키가 tempPassword 하나뿐이다", async () => {
    const delegate = await makePerson("위임 07", await makeDelegatedRole({ copyFrom: [DEFAULT_ROLE_ID] }), null);
    const admin = await makePerson("관리자 대상 07", SYSADMIN_ROLE_ID, null);
    const staff = await makePerson("일반 대상 07", DEFAULT_ROLE_ID, null);

    const aboveCeiling = await resetPersonPassword(delegate, admin.id).then(
      () => new Error("거부되어야 하는데 성공함"),
      (caught: unknown) => caught,
    );
    expect(aboveCeiling).toBeInstanceOf(RoleGrantForbiddenError);

    const self = await resetPersonPassword(delegate, delegate.id).then(
      () => new Error("거부되어야 하는데 성공함"),
      (caught: unknown) => caught,
    );
    expect(self).toBeInstanceOf(PeopleForbiddenError);
    expect((self as Error).message).toContain("본인");

    const result = await resetPersonPassword(delegate, staff.id);
    expect(Object.keys(result)).toEqual(["tempPassword"]);
    expect(typeof result.tempPassword).toBe("string");
  });
});
