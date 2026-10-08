import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { projectMembers, roles } from "@/db/schema";
import { isCheckViolation, isUniqueViolation } from "@/lib/pg-errors";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";
import { makePerson, teamIdByName } from "./approvals-fixtures";

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

// 06.2(D-6209): 참여자 표 — 같은 (프로젝트, 사람)에 살아 있는 줄은 하나(부분 유니크), 보관한 뒤에는 다시 들어간다.
describe("project_members", () => {
  async function projectAndPeople(): Promise<{ projectId: string; pm: Viewer; member: Viewer }> {
    const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const member = await makePerson("참여자", DEFAULT_ROLE_ID, null);
    const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
    const project = await createProject(pm, {
      clientId: client.id,
      teamId: await teamIdByName("기획1팀"),
      pmUserId: pm.id,
      name: "참여자 표",
      startDate: "2026-09-01",
      endDate: "2026-12-31",
    });
    if (!project.id) throw new Error("프로젝트가 없습니다");
    return { projectId: project.id, pm, member };
  }

  function caught(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
      () => null,
      (e: unknown) => e,
    );
  }

  it("같은 (project_id, user_id)에 살아 있는 줄 둘째는 project_members_live_uniq가 거부한다", async () => {
    const { projectId, pm, member } = await projectAndPeople();
    await db.insert(projectMembers).values({ projectId, userId: member.id, addedBy: pm.id });
    const error = await caught(db.insert(projectMembers).values({ projectId, userId: member.id, addedBy: pm.id }));
    expect(isUniqueViolation(error, "project_members_live_uniq")).toBe(true);
  });

  it("첫 줄을 보관하면 같은 쌍 새 줄이 들어가고, 살아 있는 줄이 하나면 보관 줄을 되살릴 수 있다", async () => {
    const { projectId, pm, member } = await projectAndPeople();
    const [first] = await db.insert(projectMembers).values({ projectId, userId: member.id, addedBy: pm.id }).returning();
    if (!first) throw new Error("첫 줄이 없습니다");
    await db.update(projectMembers).set({ archivedAt: new Date() }).where(eq(projectMembers.id, first.id));
    const [second] = await db.insert(projectMembers).values({ projectId, userId: member.id, addedBy: pm.id }).returning();
    if (!second) throw new Error("둘째 줄이 없습니다");

    // 둘째를 보관하고 첫 줄을 되살리면 살아 있는 줄이 하나라 들어간다.
    await db.update(projectMembers).set({ archivedAt: new Date() }).where(eq(projectMembers.id, second.id));
    await db.update(projectMembers).set({ archivedAt: null }).where(eq(projectMembers.id, first.id));
    const live = await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
    expect(live.filter((row) => row.archivedAt === null).map((row) => row.id)).toEqual([first.id]);
  });

  it("없는 project_id · 없는 user_id는 외래키(23503)가 거부한다", async () => {
    const { projectId, pm, member } = await projectAndPeople();
    const fkCode = (e: unknown): unknown => (e as { cause?: { code?: string } } | null)?.cause?.code;
    expect(fkCode(await caught(db.insert(projectMembers).values({ projectId: randomUUID(), userId: member.id, addedBy: pm.id })))).toBe(
      "23503",
    );
    expect(fkCode(await caught(db.insert(projectMembers).values({ projectId, userId: `missing-${randomUUID()}`, addedBy: pm.id })))).toBe(
      "23503",
    );
  });
});
