import { describe, expect, it } from "vitest";
import {
  ADMIN_PERMISSIONS_WRITE_KEY,
  NO_ROLE_SNAPSHOT,
  canEditRole,
  canGrantRole,
  permissionKey,
  visibilityKey,
  type RoleGrantSnapshot,
} from "@/domain/permissions/grant-ceiling";

// 06.4(D-6401 · D-6407): 권한 상한 순수 판정 — 권한 집합 부분집합 + 범위 순위 + 관리자 키 통과. DB 없음.

function snap(keys: readonly string[], viewScope: RoleGrantSnapshot["viewScope"], workScope: RoleGrantSnapshot["workScope"]): RoleGrantSnapshot {
  return { keys: new Set(keys), viewScope, workScope };
}

const ACTOR = snap(["m:projects::view", "m:projects::write", "v:person.value"], "company", "company");

describe("canGrantRole", () => {
  it.each([
    ["부분집합 · 범위 이하", ACTOR, snap(["m:projects::view", "v:person.value"], "team", "team"), true],
    ["행위자에게 없는 키 하나", ACTOR, snap(["m:projects::view", "v:pnl.amount"], "team", "team"), false],
    ["보는 범위 company > org_unit", snap([], "org_unit", "company"), snap([], "company", "team"), false],
    ["보는 범위 같음", snap([], "org_unit", "company"), snap([], "org_unit", "team"), true],
    ["보는 범위 own < team", snap([], "team", "company"), snap([], "own", "team"), true],
    ["업무 범위 company > team", snap([], "company", "team"), snap([], "team", "company"), false],
    [
      "관리자 키가 있으면 더 크고 넓어도 통과",
      snap([ADMIN_PERMISSIONS_WRITE_KEY], "own", "team"),
      snap(["m:projects::view", "v:pnl.amount"], "company", "company"),
      true,
    ],
    ["계급 없는 행위자 vs 빈 계급", NO_ROLE_SNAPSHOT, snap([], "own", "team"), true],
    ["계급 없는 행위자 vs 키 하나", NO_ROLE_SNAPSHOT, snap(["m:projects::view"], "own", "team"), false],
  ] as const)("%s", (_name, actor, role, expected) => {
    expect(canGrantRole(actor, role)).toBe(expected);
  });
});

describe("canEditRole", () => {
  const actor = snap(["m:projects::view"], "team", "team");
  it.each([
    ["바꾸기 전 안 · 바꾼 뒤 넓어짐", snap([], "team", "team"), snap([], "company", "team"), false],
    ["바꾸기 전 밖 · 바꾼 뒤 좁아져 안", snap(["v:pnl.amount"], "team", "team"), snap([], "team", "team"), false],
    ["둘 다 안", snap([], "own", "team"), snap(["m:projects::view"], "team", "team"), true],
    ["새 계급(E3) — 범위 company", NO_ROLE_SNAPSHOT, snap([], "company", "company"), false],
    ["새 계급(E3) — 범위 team", NO_ROLE_SNAPSHOT, snap([], "team", "team"), true],
  ] as const)("%s", (_name, before, after, expected) => {
    expect(canEditRole(actor, before, after)).toBe(expected);
  });
});

describe("키", () => {
  it("permissionKey · visibilityKey 형식", () => {
    expect(permissionKey("admin.permissions", "write")).toBe(ADMIN_PERMISSIONS_WRITE_KEY);
    expect(visibilityKey("cf.vendor.a")).toBe("v:cf.vendor.a");
  });
});
