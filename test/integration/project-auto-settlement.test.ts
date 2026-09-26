import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, documentCounters, projects, teams, users } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { aggregateProjects, createProject, findProject, listProjects, settleForProjectList } from "@/domain/projects";
import { changeProjectStatus, lastStatusChangeOn } from "@/domain/projects/status";
import { applyAutoSettlement, loadProjectForGate } from "@/domain/projects/auto-transition";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { withTransaction } from "@/lib/db-transaction";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { projectResponsibles } from "@/domain/projects/responsibles";
import { teamLeadCandidatesAtDate } from "@/repositories/team-memberships";
import { addDays, kstToday } from "@/lib/kst-date";
import { deferred } from "./lock-race";

// 04-11(D-76 · CEO A-01·A-08·A-15·A-29·OV-5 · 엔지 리뷰 A P3) — 진행 → 정산 자동 전환을
// 실제 DB에서 본다. 로그 단언은 「그 프로젝트의 그 전환(진행 → 정산) 1회당 한 줄」로 센다 —
// 파일 전체 로그 수를 세지 않는다(엔지 r2 E2-07).

const BEFORE_MIDNIGHT = new Date("2026-09-17T14:59:59Z"); // KST 09-17 23:59:59
const AFTER_MIDNIGHT = new Date("2026-09-17T15:00:00Z"); // KST 09-18 00:00:00

async function makeViewer(roleId: string | null): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `auto-settle-${randomUUID()}@example.test`,
    name: "자동 정산 테스트 사람",
    roleId: roleId ?? DEFAULT_ROLE_ID,
  });
  return { id: userId, roleId };
}

async function makeProject(input: {
  status: string;
  endDate: string | null;
  archived?: boolean;
  teamId?: string;
}): Promise<string> {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const pm = await makeViewer(DEFAULT_ROLE_ID);
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: input.teamId ?? team.id,
    pmUserId: pm.id,
    name: `자동 정산-${randomUUID()}`,
    startDate: input.endDate,
    endDate: input.endDate,
  });
  await db
    .update(projects)
    .set({ status: input.status, archivedAt: input.archived ? new Date() : null })
    .where(eq(projects.id, created.id));
  return created.id;
}

async function statusOf(projectId: string): Promise<string | undefined> {
  const [row] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, projectId));
  return row?.status;
}

// 그 프로젝트의 진행 → 정산 전환 로그만.
async function settleLogs(projectId: string) {
  return db
    .select()
    .from(actionLog)
    .where(
      and(
        eq(actionLog.entityId, projectId),
        eq(actionLog.actionType, "status_change"),
        sql`${actionLog.detail}->>'from' = 'in_progress'`,
        sql`${actionLog.detail}->>'to' = 'settling'`,
      ),
    );
}

function captureLogLines(): Record<string, unknown>[] {
  const lines: Record<string, unknown>[] = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    lines.push(JSON.parse(line) as Record<string, unknown>);
  });
  return lines;
}

describe("자동 정산 — KST 경계 · 멱등 · 행위자 (04-11 Task 1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("세션 시간대가 UTC다 — 타임스탬프가 시간대 없는 칸이라 경계 계산의 전제다(A-29)", async () => {
    // 이미지에 따라 이름이 'UTC' 또는 'Etc/UTC'다 — 이름과 오프셋 0을 함께 본다.
    const result = await pool.query<{ tz: string; offset: number }>(
      "SELECT current_setting('TimeZone') AS tz, extract(timezone from now())::int AS offset",
    );
    expect(result.rows[0]?.tz).toMatch(/^(Etc\/)?UTC$/);
    expect(result.rows[0]?.offset).toBe(0);
  });

  it("(a) 종료일 9/17 진행은 KST 9/17 23:59:59에는 진행, KST 9/18 00:00부터 정산이다", async () => {
    const projectId = await makeProject({ status: "in_progress", endDate: "2026-09-17" });

    expect(await applyAutoSettlement({ projectIds: [projectId] }, { now: () => BEFORE_MIDNIGHT })).toEqual([]);
    expect(await statusOf(projectId)).toBe("in_progress");

    expect(await applyAutoSettlement({ projectIds: [projectId] }, { now: () => AFTER_MIDNIGHT })).toEqual([projectId]);
    expect(await statusOf(projectId)).toBe("settling");
  });

  it("(b) 두 번 호출해도 · 동시에 두 번 호출해도 그 전환의 로그는 한 줄이다", async () => {
    const sequential = await makeProject({ status: "in_progress", endDate: "2026-09-17" });
    await applyAutoSettlement({ projectIds: [sequential] }, { now: () => AFTER_MIDNIGHT });
    expect(await applyAutoSettlement({ projectIds: [sequential] }, { now: () => AFTER_MIDNIGHT })).toEqual([]);
    expect(await settleLogs(sequential)).toHaveLength(1);

    const concurrent = await makeProject({ status: "in_progress", endDate: "2026-09-17" });
    const results = await Promise.all([
      applyAutoSettlement({ projectIds: [concurrent] }, { now: () => AFTER_MIDNIGHT }),
      applyAutoSettlement({ projectIds: [concurrent] }, { now: () => AFTER_MIDNIGHT }),
    ]);
    expect(results.flat()).toEqual([concurrent]);
    expect(await statusOf(concurrent)).toBe("settling");
    expect(await settleLogs(concurrent)).toHaveLength(1);
  });

  it("(c) 로그의 사람 id는 비어 있고 detail에 from·to·trigger·발효일이 있다", async () => {
    const projectId = await makeProject({ status: "in_progress", endDate: "2026-09-17" });
    await applyAutoSettlement({ projectIds: [projectId] }, { now: () => AFTER_MIDNIGHT });

    const [log] = await settleLogs(projectId);
    expect(log?.actorId).toBeNull();
    expect(log?.entity).toBe("project");
    expect(log?.detail).toEqual({
      from: "in_progress",
      to: "settling",
      trigger: "end_date_passed",
      effectiveOn: "2026-09-18",
    });
  });

  it("(d) 다른 상태 넷 · 보관된 진행 · 종료일 없는 진행은 바뀌지 않는다", async () => {
    const ids = await Promise.all([
      makeProject({ status: "bidding", endDate: "2026-09-01" }),
      makeProject({ status: "lost", endDate: "2026-09-01" }),
      makeProject({ status: "settling", endDate: "2026-09-01" }),
      makeProject({ status: "completed", endDate: "2026-09-01" }),
      makeProject({ status: "in_progress", endDate: "2026-09-01", archived: true }),
      makeProject({ status: "in_progress", endDate: null }),
    ]);
    const before = await Promise.all(ids.map(statusOf));

    expect(await applyAutoSettlement({ projectIds: ids }, { now: () => AFTER_MIDNIGHT })).toEqual([]);
    expect(await Promise.all(ids.map(statusOf))).toEqual(before);
  });
});

describe("상세 읽기의 선판정 · 발효일 · 실패 격리 (04-11 Task 1 ④)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(e) 종료일이 어제인 진행 프로젝트를 findProject로 열면 정산 DTO다", async () => {
    const viewer = await makeViewer(DEFAULT_ROLE_ID);
    const projectId = await makeProject({ status: "in_progress", endDate: addDays(kstToday(new Date()), -1) });

    const dto = await findProject(viewer, projectId);

    expect(dto?.status).toBe("settling");
    expect(await statusOf(projectId)).toBe("settling");
    expect(await settleLogs(projectId)).toHaveLength(1);
  });

  it("(e2) KST 9/23에 사람이 진행으로 바꾼 종료일 9/10 프로젝트의 발효일은 9/23이고 부제 날짜도 9/23이다(A-08)", async () => {
    const viewer = await makeViewer(DEFAULT_ROLE_ID);
    const projectId = await makeProject({ status: "in_progress", endDate: "2026-09-10" });
    await db.insert(actionLog).values({
      actorId: viewer.id,
      actorRoleId: viewer.roleId,
      actionType: "status_change",
      entity: "project",
      entityId: projectId,
      detail: { from: "bidding", to: "in_progress", trigger: "manual" },
      // 2026-09-22T16:00Z = KST 9/23 01:00.
      occurredAt: new Date("2026-09-22T16:00:00Z"),
    });

    await applyAutoSettlement({ projectIds: [projectId] }, { now: () => new Date("2026-09-24T01:00:00Z") });

    const [log] = await settleLogs(projectId);
    expect((log?.detail as { effectiveOn?: string }).effectiveOn).toBe("2026-09-23");
    const dto = await findProject(viewer, projectId);
    if (!dto) throw new Error("상세를 보지 못했습니다");
    expect(await lastStatusChangeOn(viewer, dto)).toBe("2026-09-23");
  });

  it("(e3) 로그 쓰기가 실패하면 상태는 진행 그대로이고 findProject는 오류 없이 진행을 돌려주며 실패 로그가 한 줄이다", async () => {
    const viewer = await makeViewer(DEFAULT_ROLE_ID);
    const projectId = await makeProject({ status: "in_progress", endDate: addDays(kstToday(new Date()), -1) });

    const lines = captureLogLines();
    const dto = await findProject(viewer, projectId, {
      autoSettlement: { recordAction: () => Promise.reject(new Error("로그 쓰기 실패")) },
    });
    vi.restoreAllMocks();

    expect(dto?.status).toBe("in_progress");
    expect(await statusOf(projectId)).toBe("in_progress");
    expect(await settleLogs(projectId)).toEqual([]);
    const failed = lines.filter((line) => line.event === "project.auto_settle_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ severity: "ERROR", projectIds: [projectId] });
  });

  it("(e4) 틀린 모양의 id는 없음이고 실패 로그가 없다 · 보기 권한 없는 viewer의 요청은 판정을 돌리지 않는다", async () => {
    const viewer = await makeViewer(DEFAULT_ROLE_ID);
    const noView = await makeViewer(null);
    const projectId = await makeProject({ status: "in_progress", endDate: addDays(kstToday(new Date()), -1) });

    const lines = captureLogLines();
    expect(await findProject(viewer, "abc")).toBeNull();
    expect(await findProject(noView, projectId)).toBeNull();
    vi.restoreAllMocks();

    expect(lines.filter((line) => line.event === "project.auto_settle_failed")).toEqual([]);
    expect(await statusOf(projectId)).toBe("in_progress");
    expect(await settleLogs(projectId)).toEqual([]);
  });
});

// 발령일은 과거 고정 날짜 — 오늘(KST) 발령 판정이 자정 경계에서 흔들리지 않게(04-20 선례).
async function makeTeamWithLead(): Promise<{ teamId: string; lead: Viewer }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
  const lead = await makeViewer("role-team-lead");
  await assignTeam(SYSTEM_VIEWER, { userId: lead.id, teamId: team.id, effectiveFrom: "2020-01-01" });
  return { teamId: team.id, lead };
}

async function allStatusLogs(projectId: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.entityId, projectId), eq(actionLog.actionType, "status_change")));
}

describe("목록 요청의 판정 한 번 · 보기 권한 (04-11 Task 2 ② · A-07 · 엔지 리뷰 A P3)", () => {
  it("(f) settleForProjectList 뒤 listProjects가 지난 진행을 정산으로 돌려준다", async () => {
    const viewer = await makeViewer(DEFAULT_ROLE_ID);
    const projectId = await makeProject({ status: "in_progress", endDate: addDays(kstToday(new Date()), -1) });

    await settleForProjectList(viewer);
    const rows = await listProjects(viewer, {});

    expect(rows.find((row) => row.id === projectId)?.status).toBe("settling");
    expect(await settleLogs(projectId)).toHaveLength(1);
  });

  it("(f2) settleForProjectList 없이 listProjects·aggregateProjects만 부르면 지난 진행은 진행 그대로다", async () => {
    const viewer = await makeViewer(DEFAULT_ROLE_ID);
    const projectId = await makeProject({ status: "in_progress", endDate: addDays(kstToday(new Date()), -1) });

    const [rows, aggregate] = await Promise.all([
      listProjects(viewer, {}),
      aggregateProjects(viewer, { status: "in_progress" }),
    ]);

    expect(rows.find((row) => row.id === projectId)?.status).toBe("in_progress");
    expect(aggregate.count).toBe(1);
    expect(await statusOf(projectId)).toBe("in_progress");
    expect(await settleLogs(projectId)).toEqual([]);
  });

  it("(f3) settleForProjectList 한 번 뒤 정산 목록 건수와 합계 건수가 같다", async () => {
    const viewer = await makeViewer(DEFAULT_ROLE_ID);
    const yesterday = addDays(kstToday(new Date()), -1);
    await makeProject({ status: "in_progress", endDate: yesterday });
    await makeProject({ status: "in_progress", endDate: addDays(yesterday, -5) });
    await makeProject({ status: "settling", endDate: addDays(yesterday, -9) });

    await settleForProjectList(viewer);
    const [rows, aggregate] = await Promise.all([
      listProjects(viewer, { filter: { status: "settling" } }),
      aggregateProjects(viewer, { status: "settling" }),
    ]);

    expect(rows).toHaveLength(3);
    expect(aggregate.count).toBe(rows.length);
  });

  it("(f4) projects 보기 권한이 없는 viewer의 settleForProjectList는 판정하지 않는다", async () => {
    const noView = await makeViewer(null);
    const projectId = await makeProject({ status: "in_progress", endDate: addDays(kstToday(new Date()), -1) });

    await settleForProjectList(noView);

    expect(await statusOf(projectId)).toBe("in_progress");
    expect(await settleLogs(projectId)).toEqual([]);
  });
});

describe("쓰기 경로의 잠금 안 선판정 · 경합 · 번호 연도 (04-11 Task 2 ③④ · OV-5 · C-17 · E2-07)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(h) 자정을 넘긴 뒤의 정산 → 완료 요청은 잠금 안에서 먼저 정산으로 판정돼 통과하고 로그는 시스템 1줄 + 사람 1줄이다", async () => {
    const ceo = await makeViewer("role-ceo");
    const projectId = await makeProject({ status: "in_progress", endDate: "2026-09-17" });

    await changeProjectStatus(ceo, projectId, { from: "settling", to: "completed" }, { now: () => AFTER_MIDNIGHT });

    expect(await statusOf(projectId)).toBe("completed");
    const logs = await allStatusLogs(projectId);
    expect(logs).toHaveLength(2);
    const system = logs.filter((log) => log.actorId === null);
    expect(system.map((log) => log.detail)).toEqual([
      { from: "in_progress", to: "settling", trigger: "end_date_passed", effectiveOn: "2026-09-18" },
    ]);
    const human = logs.filter((log) => log.actorId === ceo.id);
    expect(human.map((log) => log.detail)).toEqual([{ from: "settling", to: "completed", trigger: "manual" }]);
  });

  it("(i) 쓰기가 행을 잠근 동안 상세 읽기는 기다리지 않고 저장된 상태로 돌아오고, 쓰기를 풀면 쓰기 쪽이 정산한다 · 로그 1줄", async () => {
    const viewer = await makeViewer(DEFAULT_ROLE_ID);
    const projectId = await makeProject({ status: "in_progress", endDate: addDays(kstToday(new Date()), -1) });

    const locked = deferred();
    const release = deferred();
    const writer = withTransaction(async (tx) => {
      const row = await loadProjectForGate(viewer, projectId, {
        tx,
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      });
      return row?.status;
    });
    await locked.promise;

    const lines = captureLogLines();
    let reader: Awaited<ReturnType<typeof findProject>>;
    try {
      // 잠긴 행을 기다리면 lock_timeout(5s) 뒤 실패 로그가 남는다 — 그 로그가 없고 반환이 쓰기 해제 전이다.
      reader = await findProject(viewer, projectId);
    } finally {
      release.resolve();
    }
    vi.restoreAllMocks();

    expect(reader?.status).toBe("in_progress");
    expect(lines.filter((line) => line.event === "project.auto_settle_failed")).toEqual([]);
    expect(await writer).toBe("settling");
    expect(await statusOf(projectId)).toBe("settling");
    expect(await settleLogs(projectId)).toHaveLength(1);
  });

  it("(j) 잠금 안 판정의 로그 쓰기가 실패하면 상태 전환도 던지고 상태·로그가 그대로다(fail-closed)", async () => {
    const ceo = await makeViewer("role-ceo");
    const projectId = await makeProject({ status: "in_progress", endDate: "2026-09-17" });

    await expect(
      changeProjectStatus(
        ceo,
        projectId,
        { from: "settling", to: "completed" },
        { now: () => AFTER_MIDNIGHT, recordAction: () => Promise.reject(new Error("로그 쓰기 실패")) },
      ),
    ).rejects.toThrow("로그 쓰기 실패");

    expect(await statusOf(projectId)).toBe("in_progress");
    expect(await allStatusLogs(projectId)).toEqual([]);
  });

  it("(k) KST 1월 1일 00:30(UTC 12/31 15:30)에 등록하면 번호 연도가 새해다", async () => {
    const client = await insertVendor(SYSTEM_VIEWER, {
      name: `거래처-${randomUUID()}`,
      normalizedName: `거래처-${randomUUID()}`,
    });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const pm = await makeViewer(DEFAULT_ROLE_ID);

    await createProject(
      SYSTEM_VIEWER,
      { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `새해-${randomUUID()}` },
      { now: () => new Date("2026-12-31T15:30:00Z") },
    );

    const counters = await db.select().from(documentCounters).where(eq(documentCounters.counterKey, "project"));
    expect(counters.map((counter) => counter.period)).toEqual(["2027"]);
  });

  it("(l) 오래된 화면의 전환이 거부되면 잠금 안 정산도 함께 롤백되고, 다음 목록 읽기가 정산하며 그 전환 로그는 1줄이다", async () => {
    const { teamId, lead } = await makeTeamWithLead();
    const projectId = await makeProject({ status: "in_progress", endDate: addDays(kstToday(new Date()), -1), teamId });

    await expect(changeProjectStatus(lead, projectId, { from: "bidding", to: "lost" })).rejects.toThrow(
      "상태가 정산으로 바뀜 · 새로 고침",
    );
    expect(await statusOf(projectId)).toBe("in_progress");
    expect(await allStatusLogs(projectId)).toEqual([]);

    await settleForProjectList(lead);
    const rows = await listProjects(lead, {});

    expect(rows.find((row) => row.id === projectId)?.status).toBe("settling");
    const logs = await settleLogs(projectId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBeNull();
  });
});

describe("팀장 이름 출처 — teamLeadCandidatesAtDate 한 쿼리 (04-11 Task 3 · 사용자 D20 · 엔지 리뷰 A §1 P2)", () => {
  async function namedViewer(roleId: string, name: string, teamId: string, effectiveFrom = "2020-01-01"): Promise<Viewer> {
    const { userId } = await createAccount(SYSTEM_VIEWER, {
      email: `lead-${randomUUID()}@example.test`,
      name,
      roleId,
    });
    await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom });
    return { id: userId, roleId };
  }

  async function freshTeam(): Promise<string> {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
    return team.id;
  }

  it("후보는 오늘 그 팀에 발령된 업무 범위 team + projects.status 쓰기 계급뿐이고, 여럿이면 이름순 첫 사람이 팀장이다", async () => {
    const teamId = await freshTeam();
    const today = kstToday(new Date());
    await namedViewer("role-team-lead", "하팀장", teamId);
    await namedViewer("role-team-lead", "가팀장", teamId);
    await namedViewer("role-division-head", "나본부장", teamId); // 업무 범위 company — 후보 아님
    await namedViewer(DEFAULT_ROLE_ID, "다피엠", teamId); // projects.status 쓰기 없음 — 후보 아님
    const pm = await makeViewer(DEFAULT_ROLE_ID);

    const candidates = await teamLeadCandidatesAtDate(SYSTEM_VIEWER, { teamId, date: today });
    expect(candidates.map((candidate) => candidate.name).sort((a, b) => a.localeCompare(b, "ko"))).toEqual([
      "가팀장",
      "하팀장",
    ]);
    expect((await projectResponsibles(pm, { teamId, pmUserId: pm.id })).teamLeadName).toBe("가팀장");
  });

  it("보관된 옛 팀장은 후보가 아니다 — 다른 팀장이 있으면 그 이름, 없으면 null", async () => {
    const teamId = await freshTeam();
    const pm = await makeViewer(DEFAULT_ROLE_ID);
    const oldLead = await namedViewer("role-team-lead", "가옛팀장", teamId);
    await db.update(users).set({ archivedAt: new Date() }).where(eq(users.id, oldLead.id));

    expect((await projectResponsibles(pm, { teamId, pmUserId: pm.id })).teamLeadName).toBeNull();

    await namedViewer("role-team-lead", "하새팀장", teamId);
    expect((await projectResponsibles(pm, { teamId, pmUserId: pm.id })).teamLeadName).toBe("하새팀장");
  });

  it("어제 다른 팀으로 옮긴 팀장은 오늘 옛 팀의 후보가 아니다", async () => {
    const teamId = await freshTeam();
    const otherTeamId = await freshTeam();
    const today = kstToday(new Date());
    const lead = await namedViewer("role-team-lead", "가옮긴팀장", teamId);
    await assignTeam(SYSTEM_VIEWER, { userId: lead.id, teamId: otherTeamId, effectiveFrom: addDays(today, -1) });

    expect(await teamLeadCandidatesAtDate(SYSTEM_VIEWER, { teamId, date: today })).toEqual([]);
    expect((await teamLeadCandidatesAtDate(SYSTEM_VIEWER, { teamId: otherTeamId, date: today })).map((c) => c.name)).toEqual([
      "가옮긴팀장",
    ]);
  });

  it("권한표에서 projects.status 쓰기를 끈 계급의 사람은 후보가 아니다", async () => {
    const teamId = await freshTeam();
    const today = kstToday(new Date());
    await namedViewer("role-team-lead", "가팀장", teamId);
    await setPermissionCell(SYSTEM_VIEWER, { roleId: "role-team-lead", menu: "projects.status", action: "write", allowed: false });

    expect(await teamLeadCandidatesAtDate(SYSTEM_VIEWER, { teamId, date: today })).toEqual([]);
  });
});
