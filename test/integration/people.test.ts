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
  setHireDate,
  setResignationDate,
  ForbiddenError,
  SelfRoleChangeError,
  ValidationError,
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

  it("입사일 형식이 틀리면 계정 생성 전에 거부된다(사용자 수 불변)", async () => {
    const before = await db.$count(users);

    await expect(
      registerPerson(SYSTEM_VIEWER, {
        name: "입사일틀림",
        email: `${randomUUID()}@test.local`,
        roleId: DEFAULT_ROLE_ID,
        hireDate: "2026-13-01",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await db.$count(users)).toBe(before);
  });

  it("입사일 저장이 실패하면 방금 만든 사용자가 보관 상태이고 오류가 보관·입사일 입력을 안내한다", async () => {
    const email = `${randomUUID()}@test.local`;

    await expect(
      registerPerson(
        SYSTEM_VIEWER,
        { name: "입사일실패", email, roleId: DEFAULT_ROLE_ID, hireDate: "2026-03-10" },
        { saveHireDate: () => Promise.reject(new Error("가짜 인프라 오류")) },
      ),
    ).rejects.toThrow(/보관함.*입사일/);

    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row?.archivedAt).not.toBeNull();
  });

  it("입사일을 주면 등록된 사람에게 저장된다", async () => {
    const { userId } = await registerPerson(SYSTEM_VIEWER, {
      name: "입사일저장",
      email: `${randomUUID()}@test.local`,
      roleId: DEFAULT_ROLE_ID,
      hireDate: "2026-03-10",
    });
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row?.hireDate).toBe("2026-03-10");
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

const INVERTED_MESSAGE = "퇴직일이 입사일보다 빠름 · 날짜 확인";

async function datesOf(userId: string) {
  const [row] = await db
    .select({ hireDate: users.hireDate, resignationDate: users.resignationDate })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

async function makePlainPerson(name: string): Promise<string> {
  const { userId } = await registerPerson(SYSTEM_VIEWER, {
    name,
    email: `${randomUUID()}@test.local`,
    roleId: DEFAULT_ROLE_ID,
  });
  return userId;
}

describe("입사일·퇴직일 — 권한 · 역전 · 로그 · DB CHECK(A-04 · A2-02)", () => {
  it("사람 메뉴 쓰기 권한이 없는 기획 PM이 남의 입사일·퇴직일을 바꾸면 ForbiddenError이고 행이 그대로다", async () => {
    const userId = await makePlainPerson("권한대상");
    await setHireDate(SYSTEM_VIEWER, userId, "2026-03-10");
    const before = await datesOf(userId);
    const pmViewer = { id: "dates-pm-tester", roleId: DEFAULT_ROLE_ID };

    await expect(setHireDate(pmViewer, userId, "2026-04-01")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setResignationDate(pmViewer, userId, "2026-12-31")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await datesOf(userId)).toEqual(before);
  });

  it("퇴직일 < 입사일이 되는 쓰기는 ValidationError이고 행이 그대로다 · 같은 날은 통과", async () => {
    const a = await makePlainPerson("역전A");
    await setHireDate(SYSTEM_VIEWER, a, "2026-03-10");
    await expect(setResignationDate(SYSTEM_VIEWER, a, "2026-03-09")).rejects.toThrow(INVERTED_MESSAGE);
    await expect(setResignationDate(SYSTEM_VIEWER, a, "2026-03-09")).rejects.toBeInstanceOf(ValidationError);
    expect(await datesOf(a)).toEqual({ hireDate: "2026-03-10", resignationDate: null });

    const b = await makePlainPerson("역전B");
    await setResignationDate(SYSTEM_VIEWER, b, "2026-06-15");
    await expect(setHireDate(SYSTEM_VIEWER, b, "2026-06-16")).rejects.toThrow(INVERTED_MESSAGE);
    expect(await datesOf(b)).toEqual({ hireDate: null, resignationDate: "2026-06-15" });

    await setResignationDate(SYSTEM_VIEWER, a, "2026-03-10");
    expect(await datesOf(a)).toEqual({ hireDate: "2026-03-10", resignationDate: "2026-03-10" });
  });

  it("성공한 쓰기마다 document_update · entity user 로그가 한 건씩 남고 detail에 필드명이 있다", async () => {
    const userId = await makePlainPerson("로그대상");
    const logsFor = async () =>
      (await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" })).filter(
        (entry) => entry.entity === "user" && entry.entityId === userId,
      );

    await setHireDate(SYSTEM_VIEWER, userId, "2026-03-10");
    const afterHire = await logsFor();
    expect(afterHire).toHaveLength(1);
    expect(JSON.stringify(afterHire[0]?.detail)).toContain("hire_date");

    await setResignationDate(SYSTEM_VIEWER, userId, "2026-10-31");
    const afterResign = await logsFor();
    expect(afterResign).toHaveLength(2);
    expect(JSON.stringify(afterResign.map((entry) => entry.detail))).toContain("resignation_date");
  });

  it("앱 검증을 거치지 않은 직접 UPDATE도 역전이면 23514로 거부된다", async () => {
    const userId = await makePlainPerson("CHECK대상");
    await setHireDate(SYSTEM_VIEWER, userId, "2026-03-10");

    const error = await db
      .update(users)
      .set({ resignationDate: "2026-03-09" })
      .where(eq(users.id, userId))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    const cause = (error as Error & { cause?: { code?: string } }).cause;
    expect(cause?.code).toBe("23514");
    expect((await datesOf(userId))?.resignationDate).toBeNull();
  });

  it("입사일·퇴직일을 동시에 바꾸는 경합 10회 — 매번 정확히 하나만 성공하고 나머지는 ValidationError, 끝 행은 역전이 없다", async () => {
    const userId = await makePlainPerson("경합대상");
    for (let round = 0; round < 10; round++) {
      await db.update(users).set({ hireDate: "2026-01-01", resignationDate: "2026-12-31" }).where(eq(users.id, userId));

      const results = await Promise.allSettled([
        setHireDate(SYSTEM_VIEWER, userId, "2026-10-01"),
        setResignationDate(SYSTEM_VIEWER, userId, "2026-03-31"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected");
      expect(rejected?.status === "rejected" ? rejected.reason : null).toBeInstanceOf(ValidationError);
      expect(rejected?.status === "rejected" ? (rejected.reason as Error).message : "").toBe(INVERTED_MESSAGE);

      const row = await datesOf(userId);
      expect(row?.hireDate && row.resignationDate ? row.resignationDate >= row.hireDate : false).toBe(true);
    }
  });
});
