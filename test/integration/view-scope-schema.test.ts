import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import { isCheckViolation } from "@/lib/pg-errors";

// 06.2(D-6201 · D-6203): 계급 보는 범위 칸 — DB가 네 값만 받고, 칸 없이 넣은 새 계급은 team이다.
// 도메인을 거치지 않은 Drizzle 직접 쓰기로 최후 방어선(CHECK · 기본값)을 증명한다.
describe("roles.view_scope", () => {
  it("네 값 밖의 값(step)은 roles_view_scope_check가 거부한다", async () => {
    const error = await db
      .insert(roles)
      .values({ id: `role-test-${randomUUID()}`, name: `범위 밖-${randomUUID()}`, viewScope: "step" })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isCheckViolation(error, "roles_view_scope_check")).toBe(true);
  });

  it("view_scope 없이 넣은 새 계급은 team이다", async () => {
    const id = `role-test-${randomUUID()}`;
    await db.insert(roles).values({ id, name: `기본값-${randomUUID()}` });
    const [row] = await db.select({ viewScope: roles.viewScope }).from(roles).where(eq(roles.id, id));
    expect(row?.viewScope).toBe("team");
  });
});
