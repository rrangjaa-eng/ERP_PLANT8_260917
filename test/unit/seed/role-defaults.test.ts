import { describe, expect, it } from "vitest";
import { ROLE_DEFAULT_PERMISSIONS, ROLE_DEFAULT_VISIBILITY } from "@/domain/seed/role-defaults";
import { MENUS } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { SEED_ROLES, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 07-05(D-722): 시드 계급 기본값 정본 표 — 키가 등록부와 어긋나거나 줄이 겹치면 시드가 조용히 엉뚱한 행을 넣는다.
const menuKeys = new Set(MENUS.map((menu) => menu.key));
const infoItemKeys = new Set(INFO_ITEMS.map((item) => item.key));
const seedRoleIds = new Set(SEED_ROLES.map((role) => role.id));

describe("ROLE_DEFAULT_PERMISSIONS(07-05 D-722)", () => {
  it("모든 줄의 메뉴가 MENUS에, 계급이 SEED_ROLES에 있다", () => {
    expect(ROLE_DEFAULT_PERMISSIONS.filter((row) => !menuKeys.has(row.menu))).toEqual([]);
    expect(ROLE_DEFAULT_PERMISSIONS.filter((row) => !seedRoleIds.has(row.roleId))).toEqual([]);
  });

  it("같은 (계급, 메뉴, 동작) 줄이 두 번 나오지 않는다", () => {
    const keys = ROLE_DEFAULT_PERMISSIONS.map((row) => `${row.roleId}|${row.menu}|${row.action}`);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("시스템 관리자 줄이 없다 — 시스템 관리자는 seedMasterData의 MENUS 루프가 맡는다", () => {
    expect(ROLE_DEFAULT_PERMISSIONS.filter((row) => row.roleId === SYSADMIN_ROLE_ID)).toEqual([]);
  });

  // 사용자 결정 2026-10-22: ① 행동 로그 메뉴 보기는 ⑧ 상세 노출(action_log.detail)과 함께 켠다 — 하나만 켜면 메뉴에 못 쓰는 링크가 생긴다.
  it("admin.action-log 보기를 켠 계급은 action_log.detail 노출도 켜져 있다", () => {
    const detailVisible = new Set(
      ROLE_DEFAULT_VISIBILITY.filter((row) => row.infoItem === "action_log.detail" && row.visible).map((row) => row.roleId),
    );
    const menuOn = ROLE_DEFAULT_PERMISSIONS.filter((row) => row.menu === "admin.action-log" && row.action === "view" && row.allowed);
    expect(menuOn.filter((row) => !detailVisible.has(row.roleId))).toEqual([]);
  });
});

describe("ROLE_DEFAULT_VISIBILITY(07-05 D-722)", () => {
  it("모든 줄의 정보 항목이 INFO_ITEMS에, 계급이 SEED_ROLES에 있다", () => {
    expect(ROLE_DEFAULT_VISIBILITY.filter((row) => !infoItemKeys.has(row.infoItem))).toEqual([]);
    expect(ROLE_DEFAULT_VISIBILITY.filter((row) => !seedRoleIds.has(row.roleId))).toEqual([]);
  });

  it("같은 (계급, 정보 항목) 줄이 두 번 나오지 않는다", () => {
    const keys = ROLE_DEFAULT_VISIBILITY.map((row) => `${row.roleId}|${row.infoItem}`);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("시스템 관리자 줄이 없다 — 시스템 관리자는 seedMasterData의 INFO_ITEMS 루프가 맡는다", () => {
    expect(ROLE_DEFAULT_VISIBILITY.filter((row) => row.roleId === SYSADMIN_ROLE_ID)).toEqual([]);
  });

  it("시드 계급 4종이 INFO_ITEMS 항목마다 한 줄씩 갖는다 — 새 정보 항목이 표에서 빠지지 않는다", () => {
    const roles = ["role-ceo", "role-division-head", "role-team-lead", "role-pm"];
    for (const roleId of roles) {
      const items = ROLE_DEFAULT_VISIBILITY.filter((row) => row.roleId === roleId).map((row) => row.infoItem);
      expect(items.sort()).toEqual([...infoItemKeys].sort());
    }
  });

  it("발행액은 기획 PM 줄만 「관리자가 손대지 않았으면 갱신」 표지를 단다(04-16 D-85) — 나머지 줄은 insert-if-absent", () => {
    const marked = ROLE_DEFAULT_VISIBILITY.filter((row) => row.mode === "upsertIfUnedited");
    expect(marked.map((row) => `${row.roleId}|${row.infoItem}|${row.visible}`)).toEqual(["role-pm|revenue.issued_amount|true"]);
  });
});
