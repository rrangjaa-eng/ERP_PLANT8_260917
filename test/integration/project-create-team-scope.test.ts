import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission } from "@/repositories/permissions";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject, ForbiddenError } from "@/domain/projects";
import { listProjectFormReferences, scopeCreateFormReferences } from "@/domain/projects/references";
import { kstToday } from "@/lib/kst-date";
import { log } from "@/lib/log";

// 보안 감사 — 팀 업무 범위 계급의 등록도 상태 · 기간 변경처럼 내 팀 안으로 묶는다.
// 발령일은 늘 과거인 고정 날짜(자정 경계에서 흔들리지 않게 — project-status.test.ts와 같은 이유).
const PAST_ASSIGNMENT_DATE = "2020-01-01";
const TEAM_DENIED = "내 팀 프로젝트만 등록 가능 · 내 팀 선택";
const PM_DENIED = "담당 PM은 내 팀 사람만 가능 · 내 팀 사람 선택";

afterEach(() => {
  vi.restoreAllMocks();
});

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
  return team.id;
}

async function makePerson(roleId: string, teamId?: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `scope-${randomUUID()}@example.test`,
    name: "등록 범위 테스트 사람",
    roleId,
  });
  if (teamId) await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: PAST_ASSIGNMENT_DATE });
  return { id: userId, roleId };
}

async function makeWriterRole(workScope: "team" | "company"): Promise<string> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `등록 계급-${randomUUID()}`, workScope });
  for (const action of ["view", "write"] as const) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action, allowed: true });
  }
  return role.id;
}

async function setup(workScope: "team" | "company") {
  const [teamA, teamB] = [await makeTeam(), await makeTeam()];
  const roleId = await makeWriterRole(workScope);
  const actor = await makePerson(roleId, teamA);
  const memberA = await makePerson(roleId, teamA);
  const memberB = await makePerson(roleId, teamB);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  return { teamA, teamB, roleId, actor, memberA, memberB, clientId: client.id };
}

function deniedWarnings(calls: unknown[][]) {
  return calls.filter((call) => call[0] === "write.denied");
}

async function projectsNamed(name: string) {
  return db.select().from(projects).where(eq(projects.name, name));
}

describe("프로젝트 등록의 팀 업무 범위(보안 감사, 실제 Postgres)", () => {
  it("(t1) 팀 범위 사람이 다른 팀으로 등록하면 거부되고 write.denied가 한 번 · 행이 생기지 않는다", async () => {
    const { teamB, actor, memberB, clientId } = await setup("team");
    const warn = vi.spyOn(log, "warn");
    const name = `다른팀-${randomUUID()}`;

    const attempt = createProject(actor, { clientId, teamId: teamB, pmUserId: memberB.id, name });
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attempt).rejects.toThrow(TEAM_DENIED);

    const denied = deniedWarnings(warn.mock.calls);
    expect(denied).toHaveLength(1);
    expect((denied[0] as unknown[])[1]).toMatchObject({ viewerId: actor.id, rule: "project.create-team-scope" });
    expect(await projectsNamed(name)).toHaveLength(0);
  });

  it("(t2) 팀 범위 사람이 내 팀으로 등록해도 담당 PM이 다른 팀 사람이면 거부되고 행이 생기지 않는다", async () => {
    const { teamA, actor, memberB, clientId } = await setup("team");
    const name = `다른팀PM-${randomUUID()}`;

    const attempt = createProject(actor, { clientId, teamId: teamA, pmUserId: memberB.id, name });
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attempt).rejects.toThrow(PM_DENIED);
    expect(await projectsNamed(name)).toHaveLength(0);
  });

  it("(t3) 팀 범위 사람이 발령 이력이 없으면 어느 팀으로도 등록할 수 없다", async () => {
    const { teamA, roleId, memberA, clientId } = await setup("team");
    const noTeam = await makePerson(roleId);
    const name = `무소속-${randomUUID()}`;

    await expect(createProject(noTeam, { clientId, teamId: teamA, pmUserId: memberA.id, name })).rejects.toThrow(TEAM_DENIED);
    expect(await projectsNamed(name)).toHaveLength(0);
  });

  it("(t4) 팀 범위 사람이 내 팀 · 내 팀 PM으로 등록하면 된다", async () => {
    const { teamA, actor, memberA, clientId } = await setup("team");
    const name = `내팀-${randomUUID()}`;
    await createProject(actor, { clientId, teamId: teamA, pmUserId: memberA.id, name });
    const [row] = await projectsNamed(name);
    expect(row?.teamId).toBe(teamA);
    expect(row?.pmUserId).toBe(memberA.id);
  });

  it("(t5) 회사 범위 사람은 어느 팀 · 어느 PM으로도 등록할 수 있다", async () => {
    const { teamB, actor, memberB, clientId } = await setup("company");
    const name = `회사-${randomUUID()}`;
    await createProject(actor, { clientId, teamId: teamB, pmUserId: memberB.id, name });
    const [row] = await projectsNamed(name);
    expect(row?.teamId).toBe(teamB);
  });
});

describe("등록 폼의 팀 · 담당 PM 목록(보안 감사 · CLAUDE.md §7, 실제 Postgres)", () => {
  it("(r1) 팀 범위 사람에게는 내 팀 하나와 오늘 내 팀 사람만 보인다", async () => {
    const { teamA, actor, memberA, memberB } = await setup("team");
    const references = await listProjectFormReferences(actor);

    const scoped = await scopeCreateFormReferences(actor, references, { todayKst: kstToday(new Date()) });

    expect(scoped.teams.map((team) => team.id)).toEqual([teamA]);
    const pmIds = scoped.pmUsers.map((user) => user.id);
    expect(pmIds).toEqual(expect.arrayContaining([actor.id, memberA.id]));
    expect(pmIds).not.toContain(memberB.id);
  });

  it("(r2) 팀 범위 사람이 발령 이력이 없으면 팀 · PM 목록이 비어 있다", async () => {
    const { roleId } = await setup("team");
    const noTeam = await makePerson(roleId);
    const references = await listProjectFormReferences(noTeam);

    expect(await scopeCreateFormReferences(noTeam, references, { todayKst: kstToday(new Date()) })).toEqual({ teams: [], pmUsers: [] });
  });

  it("(r3) 회사 범위 사람에게는 전체 목록이 그대로다", async () => {
    const { actor } = await setup("company");
    const references = await listProjectFormReferences(actor);

    const scoped = await scopeCreateFormReferences(actor, references, { todayKst: kstToday(new Date()) });

    expect(scoped).toEqual({ teams: references.teams, pmUsers: references.pmUsers });
  });
});
