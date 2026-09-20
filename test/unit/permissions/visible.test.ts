import { describe, expect, it, vi } from "vitest";
import * as canModule from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import type { Viewer } from "@/domain/viewer";

const roleViewer: Viewer = { id: "u1", isAdmin: false, roleId: "role-pm" };
const noRoleViewer: Viewer = { id: "u2", isAdmin: false, roleId: null };

function visibilityRow(isVisible: boolean) {
  return {
    id: "v1",
    roleId: "role-pm",
    infoItem: "code_item.label",
    visible: isVisible,
    updatedAt: new Date(),
    updatedBy: null,
  };
}

describe("visible (ADMN-02, D-35 완전 독립)", () => {
  it("viewer에 계급 식별자가 없으면 항상 false다", async () => {
    const result = await visible(noRoleViewer, "code_item.label", {
      findVisibility: () => {
        throw new Error("findVisibility가 호출되면 안 된다");
      },
    });
    expect(result).toBe(false);
  });

  it("노출표에 행이 없으면 false다 — 새 기능 정보는 기본 숨김", async () => {
    const result = await visible(roleViewer, "code_item.label", {
      findVisibility: () => Promise.resolve(null),
    });
    expect(result).toBe(false);
  });

  it("노출표 행의 visible이 참일 때만 true다", async () => {
    const result = await visible(roleViewer, "code_item.label", {
      findVisibility: () => Promise.resolve(visibilityRow(true)),
    });
    expect(result).toBe(true);
  });

  it("D-35: 메뉴×동작 판정 함수(can)를 호출하지 않는다 — 스텁이 호출되면 실패한다", async () => {
    const canSpy = vi.spyOn(canModule, "can").mockImplementation(() => {
      throw new Error("visible()이 can()을 호출했다 — D-35 위반");
    });
    try {
      await visible(roleViewer, "code_item.label", {
        findVisibility: () => Promise.resolve(null),
      });
      expect(canSpy).not.toHaveBeenCalled();
    } finally {
      canSpy.mockRestore();
    }
  });
});
