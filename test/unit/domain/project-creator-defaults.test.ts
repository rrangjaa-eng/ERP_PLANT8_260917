import { describe, expect, it, vi } from "vitest";
import { loadCreatorDefaults } from "@/domain/projects/references";
import { log } from "@/lib/log";

// 사용자 결정(/review D3) — 등록 폼 기본값은 보조 정보다. 조회가 실패해도 목록 화면 전체를 오류로 바꾸지 않고
// 기본값 없이(빈 칸) 폼을 연다.
describe("loadCreatorDefaults — 조회 실패", () => {
  it("소속 조회가 실패하면 null(기본값 없음)을 돌려주고 서버 로그에 남긴다", async () => {
    const error = vi.spyOn(log, "error").mockImplementation(() => {});
    const result = await loadCreatorDefaults(
      { id: "user-1", roleId: "role-pm" },
      { todayKst: "2026-09-26" },
      {
        findMembershipAtDate: async () => {
          throw new Error("db down");
        },
      },
    );
    expect(result).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
