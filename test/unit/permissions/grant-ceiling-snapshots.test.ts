import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_PERMISSIONS_WRITE_KEY,
  assertCanGrantRoles,
  loadRoleGrantSnapshots,
  RoleGrantForbiddenError,
} from "@/domain/permissions/grant-ceiling";
import type { RoleGrantRow } from "@/repositories/permissions";
import type { Viewer } from "@/domain/viewer";

// 06.4 /review F6: 모르는 범위 문자열 — 대상 계급은 거부(fail-closed), 행위자는 가장 낮은 빈 계급으로 친다. DB CHECK가 막는
// 값이라 통합 테스트로 만들 수 없어 리포지토리를 가짜로 바꾼다.
const repo = vi.hoisted(() => ({
  listRoleGrantRows: vi.fn<(viewer: unknown, roleIds: readonly string[]) => Promise<RoleGrantRow[]>>(),
}));
vi.mock("@/repositories/permissions", () => ({ listRoleGrantRows: repo.listRoleGrantRows }));

const actor: Viewer = { id: "u1", roleId: "role-actor" };

function rows(...list: RoleGrantRow[]): void {
  repo.listRoleGrantRows.mockImplementation((_viewer, roleIds) =>
    Promise.resolve(list.filter((row) => roleIds.includes(row.roleId))),
  );
}

beforeEach(() => {
  repo.listRoleGrantRows.mockReset();
});

describe("loadRoleGrantSnapshots — 모르는 범위", () => {
  it("보는 범위 · 업무 범위 중 하나라도 모르는 값이면 그 계급을 결과에서 뺀다", async () => {
    rows(
      { roleId: "role-ok", viewScope: "team", workScope: "team", keys: [] },
      { roleId: "role-bad-view", viewScope: "galaxy", workScope: "team", keys: [] },
      { roleId: "role-bad-work", viewScope: "team", workScope: "galaxy", keys: [] },
    );

    const map = await loadRoleGrantSnapshots(actor, ["role-ok", "role-bad-view", "role-bad-work"]);

    expect([...map.keys()]).toEqual(["role-ok"]);
  });
});

describe("assertCanGrantRoles — 모르는 범위", () => {
  it("관리자 키를 가진 행위자라도 모르는 범위의 대상 계급은 거부", async () => {
    rows(
      { roleId: "role-actor", viewScope: "company", workScope: "company", keys: [ADMIN_PERMISSIONS_WRITE_KEY] },
      { roleId: "role-bad", viewScope: "galaxy", workScope: "team", keys: [] },
    );

    await expect(assertCanGrantRoles(actor, ["role-bad"])).rejects.toBeInstanceOf(RoleGrantForbiddenError);
  });

  it("행위자 범위가 모르는 값이면 가장 낮은 빈 계급으로 친다 — 빈 계급은 통과, 키가 있는 계급은 거부", async () => {
    rows(
      { roleId: "role-actor", viewScope: "galaxy", workScope: "company", keys: [ADMIN_PERMISSIONS_WRITE_KEY] },
      { roleId: "role-empty", viewScope: "own", workScope: "team", keys: [] },
      { roleId: "role-keyed", viewScope: "own", workScope: "team", keys: ["m:projects::view"] },
    );

    await expect(assertCanGrantRoles(actor, ["role-empty"])).resolves.toBeUndefined();
    await expect(assertCanGrantRoles(actor, ["role-keyed"])).rejects.toBeInstanceOf(RoleGrantForbiddenError);
  });
});
