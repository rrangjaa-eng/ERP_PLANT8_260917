import { describe, expect, it } from "vitest";
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
import "@/domain/quotes/lines";
import "@/domain/quotes/revisions";
import "@/domain/revenue";
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
import "@/app/(app)/projects/actions.registry";

// D-38: 이 페이즈의 정본 예외 목록은 이 하나뿐이다(03-04가 이 이름으로
// 등록한다) — dtoName이 null인 내보내기는 사람 단위 정보 항목이 없는
// 키-값 스냅샷만 여기 들어간다. 목록에 없는 null 항목은 실패한다.
const NULL_DTO_EXEMPT_EXPORTS = ["settings.export"];

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
