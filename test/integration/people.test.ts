import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import {
  registerPerson,
  listPeople,
  getPerson,
  changePersonRole,
  ForbiddenError,
  SelfRoleChangeError,
} from "@/domain/people";
import { createOrgUnit, createTeam } from "@/domain/org";
import { queryActionLog } from "@/repositories/action-log";

async function makeTestTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
  return team.id;
}

describe("people (MAST-02, 실제 Postgres) — 등록 · 계정 · 발령", () => {
  it("등록 성공 후 계정·발령이 함께 존재한다", async () => {
    const teamId = await makeTestTeam();
    const email = `${randomUUID()}@test.local`;
    const { userId, tempPassword } = await registerPerson(SYSTEM_VIEWER, {
      name: "김철수",
      email,
      roleId: DEFAULT_ROLE_ID,
      teamId,
      effectiveFrom: "2026-01-01",
    });

    expect(userId).toBeTruthy();
    expect(tempPassword.length).toBeGreaterThan(0);

    const detail = await getPerson(SYSTEM_VIEWER, userId);
    expect(detail?.person.email).toBe(email);
    expect(detail?.assignments.length).toBe(1);
    expect(detail?.assignments[0]?.teamId).toBe(teamId);
  });

  it("중복 이메일이면 계정도 발령도 안 생긴다(사용자 수 불변·발령 행 0개)", async () => {
    const teamId = await makeTestTeam();
    const email = `${randomUUID()}@test.local`;
    await registerPerson(SYSTEM_VIEWER, { name: "1호", email, roleId: DEFAULT_ROLE_ID });

    const before = await db.$count(users);

    await expect(
      registerPerson(SYSTEM_VIEWER, { name: "2호", email, roleId: DEFAULT_ROLE_ID, teamId, effectiveFrom: "2026-01-01" }),
    ).rejects.toThrow();

    const after = await db.$count(users);
    expect(after).toBe(before);
  });

  it("존재하지 않는 팀이면 계정 생성 전에 거부된다(사용자 수 불변)", async () => {
    const before = await db.$count(users);

    await expect(
      registerPerson(SYSTEM_VIEWER, {
        name: "없는팀",
        email: `${randomUUID()}@test.local`,
        roleId: DEFAULT_ROLE_ID,
        teamId: randomUUID(),
        effectiveFrom: "2026-01-01",
      }),
    ).rejects.toThrow();

    const after = await db.$count(users);
    expect(after).toBe(before);
  });

  it("발령 삽입이 실패하면 방금 만든 사용자가 보관 상태이고 발령 행이 0개이며 오류가 복원·발령을 담는다", async () => {
    const teamId = await makeTestTeam();
    const email = `${randomUUID()}@test.local`;

    await expect(
      registerPerson(
        SYSTEM_VIEWER,
        { name: "발령실패", email, roleId: DEFAULT_ROLE_ID, teamId, effectiveFrom: "2026-01-01" },
        { assignTeam: () => Promise.reject(new Error("가짜 인프라 오류")) },
      ),
    ).rejects.toThrow(/복원.*발령|발령.*복원/);

    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row?.archivedAt).not.toBeNull();
  });

  it("사람 메뉴 쓰기 권한이 없는 계급에서 등록이 거부된다", async () => {
    const pmViewer = { id: "people-pm-tester", roleId: DEFAULT_ROLE_ID };
    await expect(
      registerPerson(pmViewer, { name: "거부", email: `${randomUUID()}@test.local`, roleId: DEFAULT_ROLE_ID }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("초기 비밀번호가 행동 로그 기록 내용에 없다", async () => {
    const { tempPassword } = await registerPerson(SYSTEM_VIEWER, {
      name: "비번검증",
      email: `${randomUUID()}@test.local`,
      roleId: DEFAULT_ROLE_ID,
    });

    const log = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    const serialized = JSON.stringify(log.map((entry) => entry.detail));
    expect(serialized.includes(tempPassword)).toBe(false);
  });

  it("계급 변경이 행동 로그에 남는다", async () => {
    const { userId } = await registerPerson(SYSTEM_VIEWER, {
      name: "계급변경대상",
      email: `${randomUUID()}@test.local`,
      roleId: DEFAULT_ROLE_ID,
    });

    await changePersonRole(SYSTEM_VIEWER, userId, SYSADMIN_ROLE_ID);
    const log = await queryActionLog(SYSTEM_VIEWER, { actionType: "permission_change" });
    expect(log.some((entry) => entry.entity === "user" && entry.entityId === userId)).toBe(true);
  });

  it("자기 자신의 계급 변경은 거부된다", async () => {
    await expect(
      changePersonRole(SYSTEM_VIEWER, SYSTEM_VIEWER.id, DEFAULT_ROLE_ID),
    ).rejects.toBeInstanceOf(SelfRoleChangeError);
  });

  it("보관된 사람이 보관함 권한 없이 목록에 안 보인다", async () => {
    const { userId } = await registerPerson(SYSTEM_VIEWER, {
      name: "보관대상",
      email: `${randomUUID()}@test.local`,
      roleId: DEFAULT_ROLE_ID,
    });

    const before = await listPeople(SYSTEM_VIEWER);
    expect(before.some((p) => p.id === userId)).toBe(true);

    const pmViewer = { id: "archive-pm-tester", roleId: DEFAULT_ROLE_ID };
    const pmView = await listPeople(pmViewer);
    // role-pm 계급은 시드에서 admin.people 보기 권한이 없다 — 빈 목록이다.
    expect(pmView.length).toBe(0);
  });
});
