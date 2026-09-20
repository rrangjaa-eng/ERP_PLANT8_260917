import { describe, expect, it } from "vitest";
import { scopeFor, UnknownScopeEntityError } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";

const viewer: Viewer = { id: "u1", roleId: "role-pm" };

describe("scopeFor (ADMN-01·ADMN-12 행 필터 서술자)", () => {
  it("메뉴 보기 권한이 있으면 rows가 all이다", async () => {
    const scope = await scopeFor(viewer, "code_items", {
      can: (_v, menu) => Promise.resolve(menu === "admin.code-tables"),
    });
    expect(scope.rows).toBe("all");
  });

  it("해당 엔티티의 메뉴 보기 권한이 없으면 rows가 none이다", async () => {
    const scope = await scopeFor(viewer, "code_items", {
      can: () => Promise.resolve(false),
    });
    expect(scope.rows).toBe("none");
  });

  it("보관함 메뉴 보기 권한이 없으면 includeArchived가 거짓이다", async () => {
    const scope = await scopeFor(viewer, "code_items", {
      can: (_v, menu) => Promise.resolve(menu === "admin.code-tables"),
    });
    expect(scope.includeArchived).toBe(false);
  });

  it("보관함 메뉴 보기 권한이 있으면 includeArchived가 참이다", async () => {
    const scope = await scopeFor(viewer, "code_items", {
      can: () => Promise.resolve(true),
    });
    expect(scope.includeArchived).toBe(true);
  });

  it("등록되지 않은 entity면 UnknownScopeEntityError를 던진다", async () => {
    await expect(scopeFor(viewer, "not_registered")).rejects.toBeInstanceOf(UnknownScopeEntityError);
  });
});
