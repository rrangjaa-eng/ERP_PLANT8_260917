import { describe, expect, it } from "vitest";
import { FUND_SEED_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS, ROLE_DEFAULT_VISIBILITY } from "@/domain/seed/role-defaults";
import { FUND_SCOPED_MENUS } from "@/domain/permissions/fund-scope";
import { PERMISSION_REQUIRES } from "@/domain/permissions/matrix";
import { MENUS } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, SEED_ROLES, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";

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

// 07.3(D-7315 · D-7305 · D-7303): 자금 시드 표 — 사원 · 팀장 · 본부 책임자 계급에 자금 7키 보기 · 쓰기, 조정 줄은 본부 책임자만,
// 본부 책임자 증빙 보기. 본부 조건(07.3-01 can())이 실제 사람을 거른다. 카드 대리 등록 · 시스템 관리자 · 대표 · 승인 칸은 없다.
describe("FUND_SEED_PERMISSIONS(07.3 D-7315)", () => {
  const SEED_TIERS = [DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID];
  const SEVEN = FUND_SCOPED_MENUS.filter((menu) => menu !== "projects.adjustment");
  const has = (roleId: string, menu: string, action: string) =>
    FUND_SEED_PERMISSIONS.some((row) => row.roleId === roleId && row.menu === menu && row.action === action && row.allowed);

  it("모든 줄이 MENUS · SEED_ROLES에 있고 겹치지 않으며 allowed=true다", () => {
    expect(FUND_SEED_PERMISSIONS.filter((row) => !menuKeys.has(row.menu) || !seedRoleIds.has(row.roleId) || !row.allowed)).toEqual([]);
    const keys = FUND_SEED_PERMISSIONS.map((row) => `${row.roleId}|${row.menu}|${row.action}`);
    expect(keys.length).toBe(new Set(keys).size);
  });

  // 짝 칸은 두 표를 합쳐 본다 — 사원 · 팀장의 증빙 보기는 06.1 줄(ROLE_DEFAULT_PERMISSIONS), 본부 책임자는 이 블록이 준다.
  it("모든 쓰기 줄마다 같은 계급의 같은 메뉴 보기 줄과 PERMISSION_REQUIRES 짝 줄이 시드 표에 있다", () => {
    const seeded = [...ROLE_DEFAULT_PERMISSIONS, ...FUND_SEED_PERMISSIONS];
    const seededHas = (roleId: string, menu: string, action: string) =>
      seeded.some((row) => row.roleId === roleId && row.menu === menu && row.action === action && row.allowed);
    for (const row of FUND_SEED_PERMISSIONS.filter((r) => r.action === "write")) {
      expect(has(row.roleId, row.menu, "view"), `${row.roleId} ${row.menu} 보기`).toBe(true);
      for (const pair of PERMISSION_REQUIRES.filter((p) => p.from.menu === row.menu && p.from.action === "write")) {
        expect(seededHas(row.roleId, pair.to.menu, pair.to.action), `${row.roleId} ${pair.to.menu} ${pair.to.action}`).toBe(true);
      }
    }
  });

  it("사원 · 팀장 · 본부 책임자 셋이 조정 줄 밖 자금 7키 보기 · 쓰기를 모두 갖는다", () => {
    expect(SEVEN).toHaveLength(7);
    for (const roleId of SEED_TIERS) {
      for (const menu of SEVEN) {
        expect(has(roleId, menu, "view") && has(roleId, menu, "write"), `${roleId} ${menu}`).toBe(true);
      }
    }
  });

  it("조정 줄은 본부 책임자뿐이다(D-7305) · 본부 책임자에게 증빙 보기가 있다(D-7303)", () => {
    expect([...new Set(FUND_SEED_PERMISSIONS.filter((row) => row.menu === "projects.adjustment").map((row) => row.roleId))]).toEqual([DIVISION_HEAD_ROLE_ID]);
    expect(has(DIVISION_HEAD_ROLE_ID, "projects.adjustment", "view") && has(DIVISION_HEAD_ROLE_ID, "projects.adjustment", "write")).toBe(true);
    expect(has(DIVISION_HEAD_ROLE_ID, "evidence", "view")).toBe(true);
  });

  it("카드 대리 등록 · 승인 칸 · 대표 · 시스템 관리자 줄이 없다(D-7308)", () => {
    expect(FUND_SEED_PERMISSIONS.filter((row) => row.menu === "cards.proxy")).toEqual([]);
    expect(FUND_SEED_PERMISSIONS.filter((row) => row.action === "approve")).toEqual([]);
    expect(FUND_SEED_PERMISSIONS.filter((row) => row.roleId === CEO_ROLE_ID || row.roleId === SYSADMIN_ROLE_ID)).toEqual([]);
  });

  it("45줄 — 세 계급 × 7키 × 보기 · 쓰기 + 조정 줄 둘 + 증빙 보기 하나", () => {
    expect(FUND_SEED_PERMISSIONS).toHaveLength(45);
  });
});
