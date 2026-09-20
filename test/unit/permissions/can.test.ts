import { describe, expect, it } from "vitest";
import { can } from "@/domain/permissions/can";
import type { Viewer } from "@/domain/viewer";

const roleViewer: Viewer = { id: "u1", isAdmin: false, roleId: "role-pm" };
const noRoleViewer: Viewer = { id: "u2", isAdmin: false, roleId: null };

function permissionRow(allowed: boolean) {
  return {
    id: "p1",
    roleId: "role-pm",
    menu: "admin.code-tables",
    action: "view",
    allowed,
    updatedAt: new Date(),
    updatedBy: null,
  };
}

describe("can (ADMN-01)", () => {
  it("viewer에 계급 식별자가 없으면(undefined/null) 항상 false다 — 권한표를 조회하지도 않는다", async () => {
    const result = await can(noRoleViewer, "admin.code-tables", "view", {
      findPermission: () => {
        throw new Error("findPermission이 호출되면 안 된다");
      },
    });
    expect(result).toBe(false);
  });

  it("권한표에 해당 행이 없으면 false다", async () => {
    const result = await can(roleViewer, "admin.code-tables", "view", {
      findPermission: () => Promise.resolve(null),
    });
    expect(result).toBe(false);
  });

  it("권한표 행의 allowed가 거짓이면 false다 — 거짓인 행은 없는 것과 같다", async () => {
    const result = await can(roleViewer, "admin.code-tables", "view", {
      findPermission: () => Promise.resolve(permissionRow(false)),
    });
    expect(result).toBe(false);
  });

  it("권한표 행의 allowed가 참일 때만 true다", async () => {
    const result = await can(roleViewer, "admin.code-tables", "view", {
      findPermission: () => Promise.resolve(permissionRow(true)),
    });
    expect(result).toBe(true);
  });
});
