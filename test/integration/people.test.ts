import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
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
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
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

// 이슈 #56: 목록이 사람마다 팀·계급·노출표를 따로 조회해(N+1) 사람이 늘수록 느려졌다.
describe("listPeople — 조회 횟수와 현재 소속(이슈 #56)", () => {
  it("사람이 늘어도 DB 조회 횟수가 그대로다", async () => {
    const teamId = await makeTestTeam();
    const countQueries = async () => {
      const spy = vi.spyOn(pool, "query");
      await listPeople(SYSTEM_VIEWER);
      const calls = spy.mock.calls.length;
      spy.mockRestore();
      return calls;
    };

    const register = (i: number) =>
      registerPerson(SYSTEM_VIEWER, {
        name: `조회수-${i}`,
        email: `${randomUUID()}@test.local`,
        roleId: DEFAULT_ROLE_ID,
        teamId,
        effectiveFrom: "2026-01-01",
      });

    // 테스트마다 표를 비우므로 한 명은 먼저 넣어 둔다 — 빈 목록은 조회를 건너뛴다.
    await register(0);
    const before = await countQueries();
    // 04.4-04 변경 전 측정값(PLAN_BASE c222083): 1명 기준 전체 조회 9 — 새 칸이 고정 조회를 더하면 빨개진다.
    expect(before).toBeLessThanOrEqual(9);
    for (let i = 1; i <= 3; i++) {
      await register(i);
    }
    const after = await countQueries();

    expect(after).toBe(before);
  });

  it("현재 소속은 오늘까지 발령된 가장 최근 팀이고 미래 발령은 아직 반영되지 않는다", async () => {
    const oldTeamId = await makeTestTeam();
    const currentTeamId = await makeTestTeam();
    const futureTeamId = await makeTestTeam();
    const { userId } = await registerPerson(SYSTEM_VIEWER, {
      name: "발령이력",
      email: `${randomUUID()}@test.local`,
      roleId: DEFAULT_ROLE_ID,
      teamId: oldTeamId,
      effectiveFrom: "2020-01-01",
    });
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: currentTeamId, effectiveFrom: "2021-06-01" });
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: futureTeamId, effectiveFrom: "2999-01-01" });
    const { userId: noTeamUserId } = await registerPerson(SYSTEM_VIEWER, {
      name: "발령없음",
      email: `${randomUUID()}@test.local`,
      roleId: SYSADMIN_ROLE_ID,
    });

    const people = await listPeople(SYSTEM_VIEWER);
    const person = people.find((p) => p.id === userId);
    const noTeam = people.find((p) => p.id === noTeamUserId);

    expect(person?.currentTeamId).toBe(currentTeamId);
    expect(person?.currentTeamName).toMatch(/^팀-/);
    expect(person?.roleId).toBe(DEFAULT_ROLE_ID);
    expect(person?.roleName).toBeTruthy();
    expect(noTeam?.currentTeamId).toBeNull();
    expect(noTeam?.currentTeamName).toBeNull();
    expect(noTeam?.roleId).toBe(SYSADMIN_ROLE_ID);
    // 목록 결과는 한 사람 상세(getPerson)와 같은 DTO여야 한다.
    const detail = await getPerson(SYSTEM_VIEWER, userId);
    expect(person).toEqual(detail?.person);
  });
});
