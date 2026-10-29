import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson } from "./approvals-fixtures";
import { makeAdmin } from "./admin-cap-fixtures";

// 게이트 #323 P3: 본부 id가 uuid 모양이 아니면 액션 입력 검사에서 거부한다 — 도메인까지 가면 Postgres 22P02 오류가 된다.

const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { setPersonDivisionAction } = await import("@/app/(app)/admin/people/[id]/actions");
const { registerPersonAction } = await import("@/app/(app)/admin/people/actions");

describe("본부 id 입력 검사(게이트 #323 P3)", () => {
  it("사람 상세 본부 저장 — uuid 모양이 아니면 입력 오류 · 칸 그대로", async () => {
    session.viewer = await makeAdmin("본부입력관리자");
    const p = await makePerson("본부입력검사", DEFAULT_ROLE_ID, null);

    const result = await setPersonDivisionAction({ userId: p.id, divisionId: "not-a-uuid" });

    expect(result?.validationErrors?.divisionId).toBeDefined();
    const [row] = await db.select({ divisionId: users.divisionId }).from(users).where(eq(users.id, p.id));
    expect(row?.divisionId).toBeNull();
  });

  it("사람 등록 — 본부 id가 uuid 모양이 아니면 입력 오류 · 계정 없음", async () => {
    session.viewer = await makeAdmin("본부입력관리자");
    const email = `${randomUUID()}@test.local`;

    const result = await registerPersonAction({ name: "본부입력등록", email, roleId: DEFAULT_ROLE_ID, hireDate: "2026-03-10", divisionId: "not-a-uuid" });

    expect(result?.validationErrors?.divisionId).toBeDefined();
    expect(await db.$count(users, eq(users.email, email))).toBe(0);
  });
});
