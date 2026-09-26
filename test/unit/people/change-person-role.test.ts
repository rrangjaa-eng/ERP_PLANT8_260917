import { describe, expect, it, vi } from "vitest";
import { changePersonRole, ValidationError } from "@/domain/people";
import type { Viewer } from "@/domain/viewer";

const viewer: Viewer = { id: "admin-1", roleId: "role-sysadmin" };

// T-03-30(위협 모델): "zod 스키마가 계급 식별자를 등록된 계급 집합으로 제한"은
// 사람 등록·계급 변경 두 진입점 모두에 걸려야 한다. 등록에는 있었지만
// (registerPerson의 findRoleById + archivedAt 검사) 계급 변경에는 없어서,
// DB 외래키만이 유일한 방어였다 — 외래키는 없는 식별자는 막지만 보관된 계급은
// 그대로 통과시키고, findPermission은 roles.archived_at을 보지 않으므로
// 은퇴한 계급의 권한 행이 사용자 단위로 되살아난다.
describe("changePersonRole 계급 검증 (T-03-30)", () => {
  it("등록되지 않은 계급 식별자는 거부한다", async () => {
    const recordAction = vi.fn();
    await expect(
      changePersonRole(viewer, "target-1", "role-does-not-exist", {
        can: () => Promise.resolve(true),
        findRoleById: () => Promise.resolve(null),
        recordAction,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(recordAction).not.toHaveBeenCalled();
  });

  it("보관된 계급은 거부한다(외래키만으로는 통과하는 경로)", async () => {
    const recordAction = vi.fn();
    await expect(
      changePersonRole(viewer, "target-1", "role-retired", {
        can: () => Promise.resolve(true),
        findRoleById: () =>
          Promise.resolve({
            id: "role-retired",
            name: "은퇴한 계급",
            isSeed: false,
            sortOrder: 90,
            workScope: "team",
            customFields: null,
            archivedAt: new Date("2026-01-01T00:00:00Z"),
            archivedBy: null,
            createdAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-01T00:00:00Z"),
          }),
        recordAction,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(recordAction).not.toHaveBeenCalled();
  });
});
