import { describe, expect, it, vi } from "vitest";
import { updateVendor, ArchivedVendorError } from "@/domain/vendors";
import type { Viewer } from "@/domain/viewer";

const viewer: Viewer = { id: "admin-1", roleId: "role-sysadmin" };

// DOM 감사 실측: 목록은 보관된 행에 「수정」 링크를 보여주지 않는데,
// /admin/vendors?editId=<보관된 id>로 직접 들어가면 수정 모드가 열리고
// 저장까지 됐다(감사자가 보관된 행의 이름과 계좌번호를 실제로 바꿨다).
// 화면만 고치면 URL로 다시 뚫리므로 도메인에서 막는다 — 보관은 사용자에게
// "삭제"로 보이는 상태이고, 삭제된 것이 조용히 바뀌면 안 된다.
describe("보관된 거래처는 수정할 수 없다 (DOM 감사 결함 1)", () => {
  it("보관된 거래처를 수정하려 하면 ArchivedVendorError를 던지고 아무것도 쓰지 않는다", async () => {
    const recordAction = vi.fn();
    await expect(
      updateVendor(viewer, "vendor-1", { name: "바꾼 이름" }, {
        can: () => Promise.resolve(true),
        findVendorById: () =>
          Promise.resolve({
            id: "vendor-1",
            name: "보관된 거래처",
            archivedAt: new Date("2026-01-01T00:00:00Z"),
          } as never),
        recordAction,
      }),
    ).rejects.toBeInstanceOf(ArchivedVendorError);
    expect(recordAction).not.toHaveBeenCalled();
  });

  it("존재하지 않는 거래처도 수정할 수 없다", async () => {
    const recordAction = vi.fn();
    await expect(
      updateVendor(viewer, "nope", { name: "바꾼 이름" }, {
        can: () => Promise.resolve(true),
        findVendorById: () => Promise.resolve(null),
        recordAction,
      }),
    ).rejects.toBeInstanceOf(ArchivedVendorError);
    expect(recordAction).not.toHaveBeenCalled();
  });
});
