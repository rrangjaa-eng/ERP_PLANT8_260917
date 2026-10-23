import { describe, expect, it } from "vitest";
import {
  ADMIN_PERMISSIONS_WRITE_KEY,
  NO_ROLE_SNAPSHOT,
  type RoleGrantSnapshot,
} from "@/domain/permissions/grant-ceiling";
import {
  ceilingLocked,
  roleRowControls,
  type RoleRowControls,
} from "@/app/(app)/admin/people/roles/role-row-controls";

// 07-21 R14 · SYSTEM 개정 10: 계급 줄 화면 판정 — 서버 `assertCanEditRole`과 같은 순서(관리자 키 → 스냅숏 없음 → canEditRole).

function snap(
  keys: readonly string[],
  viewScope: RoleGrantSnapshot["viewScope"],
  workScope: RoleGrantSnapshot["workScope"],
): RoleGrantSnapshot {
  return { keys: new Set(keys), viewScope, workScope };
}

const LOCKED: RoleRowControls = { editable: false, workScopes: null, viewScopes: null };

describe("roleRowControls", () => {
  it("관리자 키가 있으면 편집 가능 · 두 칸 전체 목록", () => {
    const actor = snap([ADMIN_PERMISSIONS_WRITE_KEY], "own", "team");
    expect(roleRowControls(actor, snap(["m:projects::view"], "company", "company"))).toEqual({
      editable: true,
      workScopes: ["team", "company"],
      viewScopes: ["company", "org_unit", "team", "own"],
    });
  });

  it("관리자 키 없음 + 계급 스냅숏 없음 → 잠김(fail-closed)", () => {
    expect(roleRowControls(snap(["m:projects::view"], "company", "company"), undefined)).toEqual(LOCKED);
  });

  it("계급 키가 행위자 키의 부분집합이 아니면 잠김", () => {
    const actor = snap(["m:projects::view"], "company", "company");
    expect(roleRowControls(actor, snap(["m:projects::view", "m:pnl::view"], "team", "team"))).toEqual(LOCKED);
  });

  it("범위가 행위자보다 넓으면 잠김", () => {
    expect(roleRowControls(snap([], "team", "team"), snap([], "company", "team"))).toEqual(LOCKED);
  });

  it("행위자 team·team, 계급 team·team → 업무 하나뿐(null) · 보는 범위 [team, own]", () => {
    const actor = snap(["m:projects::view"], "team", "team");
    expect(roleRowControls(actor, snap(["m:projects::view"], "team", "team"))).toEqual({
      editable: true,
      workScopes: null,
      viewScopes: ["team", "own"],
    });
  });

  it("행위자 company·company, 계급 team·own → 업무 [team, company] · 보는 범위 넷", () => {
    const actor = snap(["m:projects::view"], "company", "company");
    expect(roleRowControls(actor, snap([], "own", "team"))).toEqual({
      editable: true,
      workScopes: ["team", "company"],
      viewScopes: ["company", "org_unit", "team", "own"],
    });
  });

  it("계급 없는 행위자(NO_ROLE_SNAPSHOT) vs 빈 계급 own·team → 편집 가능 · 두 칸 하나뿐", () => {
    expect(roleRowControls(NO_ROLE_SNAPSHOT, snap([], "own", "team"))).toEqual({
      editable: true,
      workScopes: null,
      viewScopes: null,
    });
  });
});

describe("ceilingLocked", () => {
  const open: RoleRowControls = { editable: true, workScopes: ["team", "company"], viewScopes: ["team", "own"] };

  it("빈 객체 → 거짓", () => {
    expect(ceilingLocked({}, "r-self")).toBe(false);
  });

  it("자기 계급 줄만 잠김 → 거짓", () => {
    expect(ceilingLocked({ "r-self": LOCKED, other: open }, "r-self")).toBe(false);
  });

  it("다른 줄이 편집 불가면 참", () => {
    expect(ceilingLocked({ "r-self": open, other: LOCKED }, "r-self")).toBe(true);
  });

  it("다른 줄의 칸 하나가 null이면 참", () => {
    expect(ceilingLocked({ "r-self": open, other: { ...open, workScopes: null } }, "r-self")).toBe(true);
  });

  it("viewerRoleId null이면 모든 줄을 본다", () => {
    expect(ceilingLocked({ "r-self": LOCKED }, null)).toBe(true);
  });
});
