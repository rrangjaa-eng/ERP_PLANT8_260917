import { describe, expect, it } from "vitest";
import { seedMasterData } from "@/domain/seed";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { upsertPermission, findPermission } from "@/repositories/permissions";

// 버그: seedMasterData가 DEFAULT_ROLE_ID의 projects view/write를 매번
// upsertPermission(onConflictDoUpdate)으로 다시 켠다 — 관리자가 권한표에서
// 껐어도 다음 배포(=다음 시드 실행)에서 조용히 되살아난다.
describe("seedMasterData가 관리자의 권한 회수를 덮어쓰지 않는다", () => {
  it("DEFAULT_ROLE_ID의 projects write를 꺼둔 뒤 시드를 다시 돌려도 꺼진 채로 유지된다", async () => {
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "projects", action: "write", allowed: false });

    await seedMasterData(SYSTEM_VIEWER);

    const row = await findPermission(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "projects", "write");
    expect(row?.allowed).toBe(false);
  });
});
