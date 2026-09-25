import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, notInArray } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, codeItems, projects, quoteLines, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject, findProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { GateBlockedError } from "@/domain/rules/gate";
import { PROJECT_STATUSES } from "@/domain/projects/status-transitions";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import {
  changeProjectStatus,
  lastStatusChangeOn,
  listProjectStatusCatalog,
  loadStatusChangeFacts,
} from "@/domain/projects/status";
import { recordAction } from "@/domain/action-log/record";
import { findLatestActionFor } from "@/repositories/action-log";
import { kstDateOf } from "@/lib/kst-date";
import { setPermissionCell, setVisibilityCell } from "@/domain/permissions/matrix";
import { seedMasterData } from "@/domain/seed";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { findPermission, findVisibility } from "@/repositories/permissions";
import { withTransaction } from "@/lib/db-transaction";
import { deferred, waitForLockWaiter } from "./lock-race";

// 04-06(D-75) — 프로젝트 상태 다섯 값. 04-20·04-21이 같은 파일에 전환
// describe를 더한다. 이 목록은 db/migrations/0012_project_status_five_values.sql
// (test/integration/migration-upgrade.test.ts가 재시드 없이 같은 목록을 단언)과
// domain/seed/index.ts가 글자 그대로 같아야 하는 값이다.
const FIVE_STATUS_CODES = [
  { value: "bidding", label: "수주중", sortOrder: 0, description: "제안·PT 단계 · 쌓인 비용은 진행 뒤 프로젝트 비용" },
  { value: "in_progress", label: "진행", sortOrder: 1, description: "수주 확정 · 종료일 다음 날 자동으로 정산" },
  { value: "settling", label: "정산", sortOrder: 2, description: "행사 종료 · 발행 요청과 증빙 첨부를 마치는 단계" },
  { value: "completed", label: "완료", sortOrder: 3, description: "정산 마감 · 견적 줄이 잠기고 되돌리기 없음" },
  { value: "lost", label: "미수주", sortOrder: 4, description: "수주 실패 · 쌓인 비용은 팀 미수주 비용" },
];

async function setupProjectWithLine(status: string) {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "상태 테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db
    .select()
    .from(codeItems)
    .where(eq(codeItems.tableKey, "quote_subcategory"))
    .limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");

  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: `프로젝트-${randomUUID()}`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("createProject가 1차 차수를 만들지 않았습니다");

  await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
    {
      id: randomUUID(), isNew: true, subcategory: subcategory.value,
      itemName: "상태 바꾸기 전 줄",
      unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
      execution: { currency: "KRW", amount: 50_000, fxRate: 1 },
    },
  ] });
  await db.update(projects).set({ status }).where(eq(projects.id, project.id));

  return { project, revision, subcategoryValue: subcategory.value };
}

describe("프로젝트 상태 다섯 값 (04-06, D-75)", () => {
  it("(f) 코드표 project_status가 정확히 다섯 값이고 projects.status에 다섯 값 밖의 값이 없다", async () => {
    const rows = await db
      .select({
        value: codeItems.value,
        label: codeItems.label,
        sortOrder: codeItems.sortOrder,
        description: codeItems.description,
      })
      .from(codeItems)
      .where(eq(codeItems.tableKey, "project_status"))
      .orderBy(asc(codeItems.sortOrder));
    expect(rows).toEqual(FIVE_STATUS_CODES);
    expect(rows.map((row) => row.value).sort()).toEqual([...PROJECT_STATUSES].sort());

    await setupProjectWithLine("completed");
    await setupProjectWithLine("lost");
    const stray = await db
      .select({ status: projects.status })
      .from(projects)
      .where(notInArray(projects.status, [...PROJECT_STATUSES]));
    expect(stray).toEqual([]);
  });

  it("(g) 미수주 프로젝트의 견적 줄 저장은 통과하고 완료 프로젝트의 저장은 「완료 · 견적 줄 잠김」으로 거부된다", async () => {
    const lost = await setupProjectWithLine("lost");
    const saved = await saveQuoteLines(SYSTEM_VIEWER, lost.revision.id, { rows: [
      {
        id: randomUUID(), isNew: true, subcategory: lost.subcategoryValue,
        itemName: "미수주 뒤 도착한 PT 제작비",
        unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
        execution: { currency: "KRW", amount: 300_000, fxRate: 1 },
      },
    ] });
    expect(saved.lines.map((line) => line.itemName)).toContain("미수주 뒤 도착한 PT 제작비");
    const lostLines = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, lost.revision.id));
    expect(lostLines.map((line) => line.itemName).sort()).toEqual(["미수주 뒤 도착한 PT 제작비", "상태 바꾸기 전 줄"].sort());

    const completed = await setupProjectWithLine("completed");
    const before = await db
      .select()
      .from(quoteLines)
      .where(eq(quoteLines.revisionId, completed.revision.id))
      .orderBy(asc(quoteLines.id));

    const attempt = saveQuoteLines(SYSTEM_VIEWER, completed.revision.id, { rows: [
      {
        id: randomUUID(), isNew: true, subcategory: completed.subcategoryValue,
        itemName: "완료 뒤 시도",
        unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ] });
    await expect(attempt).rejects.toBeInstanceOf(GateBlockedError);
    await expect(attempt).rejects.toThrow("완료 · 견적 줄 잠김");

    const after = await db
      .select()
      .from(quoteLines)
      .where(eq(quoteLines.revisionId, completed.revision.id))
      .orderBy(asc(quoteLines.id));
    expect(after).toEqual(before);
    expect(after.map((line) => line.itemName)).toEqual(["상태 바꾸기 전 줄"]);
  });
});

// 04-20 — 사람의 전환. 발령일은 늘 과거인 고정 날짜로 둔다(자정 경계에서
// 테스트가 흔들리지 않게 — 오늘(KST) 발령 이력 판정은 그 날짜 이후 전부 같다).
const PAST_ASSIGNMENT_DATE = "2020-01-01";

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
  return team.id;
}

async function makeActor(roleId: string, teamId?: string, effectiveFrom = PAST_ASSIGNMENT_DATE): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `actor-${randomUUID()}@example.test`,
    name: "상태 전환 테스트 사람",
    roleId,
  });
  if (teamId) await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom });
  return { id: userId, roleId };
}

async function makeStatusProject(input: {
  teamId: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const pm = await makeActor(DEFAULT_ROLE_ID, input.teamId);
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: input.teamId,
    pmUserId: pm.id,
    name: `전환-${randomUUID()}`,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
  });
  await db.update(projects).set({ status: input.status }).where(eq(projects.id, created.id));
  return { projectId: created.id, pm };
}

async function reloadProject(projectId: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!row) throw new Error("프로젝트 행이 없습니다");
  return row;
}

async function statusLogs(projectId: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.entityId, projectId), eq(actionLog.actionType, "status_change")));
}

describe("사람의 상태 전환 트레이서 — 시드만 있는 DB (04-20, ENG-D2)", () => {
  // 이 describe는 권한·노출을 손으로 켜지 않는다 — 시드(setup.ts의 seedMasterData)가
  // 만든 권한표·노출표만으로 돈다.
  it("자기 팀 팀장이 시작일만 있는 수주중 프로젝트를 진행으로 바꾸면 상태·종료일·로그 한 줄이 남고 상세를 본다", async () => {
    const teamA = await makeTeam();
    const lead = await makeActor("role-team-lead", teamA);
    const { projectId } = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });

    await changeProjectStatus(lead, projectId, { from: "bidding", to: "in_progress" });

    const row = await reloadProject(projectId);
    expect(row.status).toBe("in_progress");
    expect(row.endDate).toBe("2026-10-01");
    const logs = await statusLogs(projectId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe(lead.id);
    expect(logs[0]?.detail).toEqual({ from: "bidding", to: "in_progress", trigger: "manual" });

    const detail = await findProject(lead, projectId);
    expect(detail?.number).toBe(row.number);
    expect(detail?.name).toBe(row.name);
  });

  it("담당 PM이 changeProjectStatus를 직접 불러도 권한 거부이고 상태·로그가 그대로다", async () => {
    const teamA = await makeTeam();
    const { projectId, pm } = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });
    const before = await reloadProject(projectId);

    const attempt = changeProjectStatus(pm, projectId, { from: "bidding", to: "in_progress" });
    await expect(attempt).rejects.toBeInstanceOf(GateBlockedError);
    await expect(attempt).rejects.toThrow("상태 바꾸기 권한 없음");

    expect(await reloadProject(projectId)).toEqual(before);
    expect(await statusLogs(projectId)).toEqual([]);
  });
});

describe("사람의 전환 넷 · 팀 범위 · 완료 주체 · 코드표 목록 (04-20 Task 2)", () => {
  it("(a)(b) 네 전환이 실제 DB에서 상태를 바꾸고 status_change 로그가 한 줄씩, 진행 전환은 빈 종료일을 시작일로 채운다", async () => {
    const teamA = await makeTeam();
    const lead = await makeActor("role-team-lead", teamA);
    const ceo = await makeActor("role-ceo");

    const cases = [
      { actor: lead, status: "bidding", to: "in_progress", start: "2026-10-01", end: null, expectEnd: "2026-10-01" },
      { actor: lead, status: "bidding", to: "lost", start: "2026-10-01", end: null, expectEnd: null },
      { actor: lead, status: "lost", to: "in_progress", start: "2026-11-02", end: null, expectEnd: "2026-11-02" },
      { actor: ceo, status: "settling", to: "completed", start: "2026-10-01", end: "2026-10-05", expectEnd: "2026-10-05" },
    ] as const;

    for (const c of cases) {
      const { projectId } = await makeStatusProject({ teamId: teamA, status: c.status, startDate: c.start, endDate: c.end });
      const before = await reloadProject(projectId);
      await changeProjectStatus(c.actor, projectId, { from: c.status, to: c.to });

      const after = await reloadProject(projectId);
      expect(after.status).toBe(c.to);
      expect(after.endDate).toBe(c.expectEnd);
      expect(after.version).toBe(before.version + 1);
      expect(after.number).toBe(before.number);
      const logs = await statusLogs(projectId);
      expect(logs).toHaveLength(1);
      expect(logs[0]?.detail).toEqual({ from: c.status, to: c.to, trigger: "manual" });
    }
  });

  it("(b) 미수주 → 진행은 번호·견적 줄이 그대로다", async () => {
    const lost = await setupProjectWithLine("lost");
    await db.update(projects).set({ startDate: "2026-10-01" }).where(eq(projects.id, lost.project.id));
    const linesBefore = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, lost.revision.id));

    await changeProjectStatus(SYSTEM_VIEWER, lost.project.id, { from: "lost", to: "in_progress" });

    const after = await reloadProject(lost.project.id);
    expect(after.status).toBe("in_progress");
    expect(after.number).toBe(lost.project.number);
    expect(after.endDate).toBe("2026-10-01");
    const linesAfter = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, lost.revision.id));
    expect(linesAfter).toEqual(linesBefore);
  });

  it("(c) 거부된 전환(목록 밖 · 시작일 없음 · 권한 없음)은 상태·로그가 그대로다", async () => {
    const teamA = await makeTeam();
    const lead = await makeActor("role-team-lead", teamA);

    const outOfTable = await makeStatusProject({ teamId: teamA, status: "in_progress", startDate: "2026-10-01" });
    const noStart = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: null });
    const settling = await makeStatusProject({ teamId: teamA, status: "settling", startDate: "2026-10-01" });

    const attempts = [
      { projectId: outOfTable.projectId, from: "in_progress", to: "lost", reason: "갈 수 없는 상태 · 새로 고침" },
      { projectId: outOfTable.projectId, from: "in_progress", to: "settling", reason: "갈 수 없는 상태 · 새로 고침" },
      { projectId: noStart.projectId, from: "bidding", to: "in_progress", reason: "시작일 없음 · 기간 적기" },
      { projectId: settling.projectId, from: "settling", to: "completed", reason: "상태 바꾸기 권한 없음" },
    ] as const;

    for (const a of attempts) {
      const before = await reloadProject(a.projectId);
      const attempt = changeProjectStatus(lead, a.projectId, { from: a.from, to: a.to });
      await expect(attempt).rejects.toBeInstanceOf(GateBlockedError);
      await expect(attempt).rejects.toThrow(a.reason);
      expect(await reloadProject(a.projectId)).toEqual(before);
      expect(await statusLogs(a.projectId)).toEqual([]);
    }
  });

  it("(d) 담당 PM은 네 전환 어느 것도 직접 부를 수 없다", async () => {
    const teamA = await makeTeam();
    const pairs = [
      ["bidding", "in_progress"],
      ["bidding", "lost"],
      ["lost", "in_progress"],
      ["settling", "completed"],
    ] as const;
    for (const [from, to] of pairs) {
      const { projectId, pm } = await makeStatusProject({ teamId: teamA, status: from, startDate: "2026-10-01" });
      await expect(changeProjectStatus(pm, projectId, { from, to })).rejects.toThrow("상태 바꾸기 권한 없음");
      expect((await reloadProject(projectId)).status).toBe(from);
      expect(await statusLogs(projectId)).toEqual([]);
    }
  });

  it("(h) D-79 — 정산 → 완료는 대표와 시스템 관리자만, 팀장·담당 PM은 거부되고 정산 그대로다", async () => {
    const teamA = await makeTeam();
    const ceo = await makeActor("role-ceo");
    const sysadmin = await makeActor("role-sysadmin");
    const lead = await makeActor("role-team-lead", teamA);

    const forCeo = await makeStatusProject({ teamId: teamA, status: "settling", startDate: "2026-10-01" });
    const forSysadmin = await makeStatusProject({ teamId: teamA, status: "settling", startDate: "2026-10-01" });
    await changeProjectStatus(ceo, forCeo.projectId, { from: "settling", to: "completed" });
    await changeProjectStatus(sysadmin, forSysadmin.projectId, { from: "settling", to: "completed" });
    expect((await reloadProject(forCeo.projectId)).status).toBe("completed");
    expect((await reloadProject(forSysadmin.projectId)).status).toBe("completed");

    const denied = await makeStatusProject({ teamId: teamA, status: "settling", startDate: "2026-10-01" });
    await expect(changeProjectStatus(lead, denied.projectId, { from: "settling", to: "completed" })).rejects.toThrow(
      "상태 바꾸기 권한 없음",
    );
    await expect(changeProjectStatus(denied.pm, denied.projectId, { from: "settling", to: "completed" })).rejects.toThrow(
      "상태 바꾸기 권한 없음",
    );
    expect((await reloadProject(denied.projectId)).status).toBe("settling");
    expect(await statusLogs(denied.projectId)).toEqual([]);
  });

  it("(j) D11 — 다른 팀 팀장은 거부, 본부 책임자(전사)는 통과, 어제 팀을 옮긴 팀장은 오늘 옛 팀 프로젝트를 못 바꾼다", async () => {
    const teamA = await makeTeam();
    const teamB = await makeTeam();
    const otherLead = await makeActor("role-team-lead", teamB);
    const divisionHead = await makeActor("role-division-head");

    const project = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });
    await expect(changeProjectStatus(otherLead, project.projectId, { from: "bidding", to: "lost" })).rejects.toThrow(
      "다른 팀 프로젝트 · 상태 바꾸기 권한 없음",
    );
    expect((await reloadProject(project.projectId)).status).toBe("bidding");
    expect(await statusLogs(project.projectId)).toEqual([]);

    await changeProjectStatus(divisionHead, project.projectId, { from: "bidding", to: "lost" });
    expect((await reloadProject(project.projectId)).status).toBe("lost");

    // 2026-06-10에 팀 A → 팀 B 발령. 「오늘」을 2026-06-11(KST)로 주입한다.
    const movedLead = await makeActor("role-team-lead", teamA, "2026-01-01");
    await assignTeam(SYSTEM_VIEWER, { userId: movedLead.id, teamId: teamB, effectiveFrom: "2026-06-10" });
    const now = () => new Date("2026-06-11T03:00:00Z");
    const oldTeamProject = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });
    await expect(
      changeProjectStatus(movedLead, oldTeamProject.projectId, { from: "bidding", to: "lost" }, { now }),
    ).rejects.toThrow("다른 팀 프로젝트 · 상태 바꾸기 권한 없음");
    // 발령 전날(2026-06-09)이면 아직 팀 A — 같은 사람이 바꿀 수 있다(판정이 발령 이력의 그날 값이다).
    await changeProjectStatus(movedLead, oldTeamProject.projectId, { from: "bidding", to: "lost" }, {
      now: () => new Date("2026-06-09T03:00:00Z"),
    });
    expect((await reloadProject(oldTeamProject.projectId)).status).toBe("lost");
  });

  it("(k) A-10 — 팀장에게도 코드표 다섯 값, 정산을 비활성으로 돌려도 라벨 「정산」", async () => {
    const teamA = await makeTeam();
    const lead = await makeActor("role-team-lead", teamA);

    const catalog = await listProjectStatusCatalog(lead);
    expect(catalog.map((entry) => entry.value)).toEqual(["bidding", "in_progress", "settling", "completed", "lost"]);
    expect(catalog.find((entry) => entry.value === "settling")?.label).toBe("정산");

    await db
      .update(codeItems)
      .set({ active: false })
      .where(and(eq(codeItems.tableKey, "project_status"), eq(codeItems.value, "settling")));
    const afterDeactivate = await listProjectStatusCatalog(lead);
    expect(afterDeactivate.find((entry) => entry.value === "settling")?.label).toBe("정산");
    expect(afterDeactivate).toHaveLength(5);
  });

  it("(l) ENG-D2 — 관리자가 팀장의 「팀 정보」 노출을 꺼도 같은 팀 팀장의 전환은 통과한다", async () => {
    await setVisibilityCell(SYSTEM_VIEWER, { roleId: "role-team-lead", infoItem: "team.value", visible: false });
    const teamA = await makeTeam();
    const lead = await makeActor("role-team-lead", teamA);
    const { projectId } = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });

    await changeProjectStatus(lead, projectId, { from: "bidding", to: "lost" });
    expect((await reloadProject(projectId)).status).toBe("lost");
  });
});

describe("원자성·경합·시드 보존(A-01·A-11·OV-3·A-05·ENG-D3 ③·A-23)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("A-01 — 로그 쓰기가 실패하면 상태·version·로그가 전부 그대로다", async () => {
    const teamA = await makeTeam();
    const lead = await makeActor("role-team-lead", teamA);
    const { projectId } = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });
    const before = await reloadProject(projectId);

    await expect(
      changeProjectStatus(
        lead,
        projectId,
        { from: "bidding", to: "in_progress" },
        { recordAction: () => Promise.reject(new Error("로그 쓰기 실패")) },
      ),
    ).rejects.toThrow("로그 쓰기 실패");

    const after = await reloadProject(projectId);
    expect(after.status).toBe("bidding");
    expect(after.version).toBe(before.version);
    expect(after.endDate).toBeNull();
    expect(await statusLogs(projectId)).toEqual([]);
  });

  it("A-11 — 동료가 미수주로 닫은 뒤 오래된 화면의 수주중 → 진행은 「상태가 미수주로 바뀜 · 새로 고침」이고 되살아나지 않는다", async () => {
    const teamA = await makeTeam();
    const lead = await makeActor("role-team-lead", teamA);
    const colleague = await makeActor("role-team-lead", teamA);
    const { projectId } = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });

    await changeProjectStatus(colleague, projectId, { from: "bidding", to: "lost" });
    await expect(changeProjectStatus(lead, projectId, { from: "bidding", to: "in_progress" })).rejects.toThrow(
      "상태가 미수주로 바뀜 · 새로 고침",
    );

    expect((await reloadProject(projectId)).status).toBe("lost");
    expect(await statusLogs(projectId)).toHaveLength(1);
  });

  it("M1 — 전환 권한이 없는 담당 PM·다른 팀 팀장이 틀린 from을 보내도 권한 거부이고 문구에 지금 상태가 없다", async () => {
    const teamA = await makeTeam();
    const teamB = await makeTeam();
    const otherLead = await makeActor("role-team-lead", teamB);
    const { projectId, pm } = await makeStatusProject({ teamId: teamA, status: "lost", startDate: "2026-10-01" });

    for (const [actor, reason] of [
      [pm, "상태 바꾸기 권한 없음"],
      [otherLead, "다른 팀 프로젝트 · 상태 바꾸기 권한 없음"],
    ] as const) {
      const attempt = changeProjectStatus(actor, projectId, { from: "bidding", to: "in_progress" });
      await expect(attempt).rejects.toBeInstanceOf(GateBlockedError);
      await expect(attempt).rejects.toThrow(reason);
      await expect(attempt).rejects.not.toThrow("미수주");
    }

    expect((await reloadProject(projectId)).status).toBe("lost");
    expect(await statusLogs(projectId)).toEqual([]);
  });

  it("OV-3 — A가 잠금을 쥔 동안 B는 잠금을 기다리고, A를 풀면 A만 커밋되고 B는 from 불일치로 거부된다", async () => {
    const teamA = await makeTeam();
    const leadA = await makeActor("role-team-lead", teamA);
    const leadB = await makeActor("role-team-lead", teamA);
    const { projectId } = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });

    const locked = deferred();
    const release = deferred();
    const first = changeProjectStatus(
      leadA,
      projectId,
      { from: "bidding", to: "in_progress" },
      {
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      },
    );
    await locked.promise;

    const second = changeProjectStatus(leadB, projectId, { from: "bidding", to: "lost" });
    try {
      await waitForLockWaiter(pool);
    } finally {
      // 대기 확인이 실패해도 A를 풀어 잠금을 쥔 연결이 뒤 테스트를 막지 않게 한다.
      release.resolve();
    }

    const [a, b] = await Promise.allSettled([first, second]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");
    if (b.status === "rejected") expect(String(b.reason)).toContain("상태가 진행으로 바뀜 · 새로 고침");

    expect((await reloadProject(projectId)).status).toBe("in_progress");
    const logs = await statusLogs(projectId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe(leadA.id);
  });

  it("A-05 — 빈 DB의 첫 시드가 전환 권한을 켜고, 관리자가 끈 팀장 projects.status는 재시드 뒤에도 꺼져 있다", async () => {
    for (const roleId of ["role-team-lead", "role-division-head", "role-ceo"]) {
      expect((await findPermission(SYSTEM_VIEWER, roleId, "projects", "view"))?.allowed).toBe(true);
      expect((await findPermission(SYSTEM_VIEWER, roleId, "projects.status", "write"))?.allowed).toBe(true);
    }
    expect((await findPermission(SYSTEM_VIEWER, "role-ceo", "projects.complete", "write"))?.allowed).toBe(true);
    expect(await findPermission(SYSTEM_VIEWER, "role-team-lead", "projects.complete", "write")).toBeNull();

    await setPermissionCell(SYSTEM_VIEWER, {
      roleId: "role-team-lead",
      menu: "projects.status",
      action: "write",
      allowed: false,
    });
    await seedMasterData(SYSTEM_VIEWER);

    expect((await findPermission(SYSTEM_VIEWER, "role-team-lead", "projects.status", "write"))?.allowed).toBe(false);
  });

  it("ENG-D3 ③ — 첫 시드의 노출 기본값, 관리자가 끈 기획 PM quote.amount·대표 revenue.issued_amount는 재시드 뒤에도 꺼져 있고 시스템 관리자 항목은 재시드가 켠다", async () => {
    for (const item of INFO_ITEMS) {
      for (const roleId of ["role-team-lead", "role-division-head"]) {
        expect((await findVisibility(SYSTEM_VIEWER, roleId, item.key))?.visible).toBe(item.staffDefault);
      }
      expect((await findVisibility(SYSTEM_VIEWER, "role-ceo", item.key))?.visible).toBe(
        item.staffDefault || item.key.startsWith("revenue."),
      );
    }

    await setVisibilityCell(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "quote.amount", visible: false });
    await setVisibilityCell(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.issued_amount", visible: false });
    await setVisibilityCell(SYSTEM_VIEWER, { roleId: "role-sysadmin", infoItem: "archive.value", visible: false });
    await seedMasterData(SYSTEM_VIEWER);

    expect((await findVisibility(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "quote.amount"))?.visible).toBe(false);
    expect((await findVisibility(SYSTEM_VIEWER, "role-ceo", "revenue.issued_amount"))?.visible).toBe(false);
    expect((await findVisibility(SYSTEM_VIEWER, "role-sysadmin", "archive.value"))?.visible).toBe(true);
  });

  it("거부 운영 로그 — 권한 없는 전환 한 번에 write.denied 한 줄(규칙·프로젝트 id·from·to, 이유 문자열·금액 키 없음)", async () => {
    const teamA = await makeTeam();
    const { projectId, pm } = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });

    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });
    await expect(changeProjectStatus(pm, projectId, { from: "bidding", to: "in_progress" })).rejects.toThrow(
      "상태 바꾸기 권한 없음",
    );
    vi.restoreAllMocks();

    const denied = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry.event === "write.denied");
    expect(denied).toHaveLength(1);
    const { severity, message, time, event, ...fields } = denied[0] ?? {};
    void severity;
    void message;
    void time;
    void event;
    expect(fields).toEqual({
      viewerId: pm.id,
      rule: "project.transition",
      errorName: "GateBlockedError",
      projectId,
      from: "bidding",
      to: "in_progress",
    });
    expect(JSON.stringify(denied[0])).not.toContain("권한 없음");
  });

  it("A-23 — 바깥 트랜잭션을 넘기고 그 트랜잭션을 되돌리면 상태·로그가 둘 다 없다", async () => {
    const teamA = await makeTeam();
    const lead = await makeActor("role-team-lead", teamA);
    const { projectId } = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });
    const facts = await loadStatusChangeFacts(lead);

    await expect(
      withTransaction(async (tx) => {
        await changeProjectStatus(lead, projectId, { from: "bidding", to: "in_progress" }, { tx, facts });
        throw new Error("결재 되돌림");
      }),
    ).rejects.toThrow("결재 되돌림");

    expect((await reloadProject(projectId)).status).toBe("bidding");
    expect(await statusLogs(projectId)).toEqual([]);
  });
});

describe("부제의 마지막 변경일 (04-21, D-50 · CEO A-30 · 엔지 리뷰 A 공백 6)", () => {
  it("(i) 전환 뒤에는 최신 status_change 로그의 KST 날짜, 전환 없는 프로젝트는 등록일, 최신 로그가 정리 표시여도 그 날짜", async () => {
    const teamA = await makeTeam();
    const lead = await makeActor("role-team-lead", teamA);

    const untouched = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });
    const untouchedDto = await findProject(lead, untouched.projectId);
    if (!untouchedDto) throw new Error("팀장이 상세를 보지 못했습니다");
    const untouchedRow = await reloadProject(untouched.projectId);
    expect(await lastStatusChangeOn(lead, untouchedDto)).toBe(kstDateOf(untouchedRow.createdAt));

    const { projectId } = await makeStatusProject({ teamId: teamA, status: "bidding", startDate: "2026-10-01" });
    await changeProjectStatus(lead, projectId, { from: "bidding", to: "in_progress" });
    const [log] = await statusLogs(projectId);
    if (!log) throw new Error("status_change 로그가 없습니다");
    // 등록일(오늘)과 다른 날로 옮겨 두 갈래를 구분한다 — 2026-08-31T20:00Z = KST 2026-09-01.
    await db.update(actionLog).set({ occurredAt: new Date("2026-08-31T20:00:00Z") }).where(eq(actionLog.seq, log.seq));
    const dto = await findProject(lead, projectId);
    if (!dto) throw new Error("팀장이 상세를 보지 못했습니다");
    expect(await lastStatusChangeOn(lead, dto)).toBe("2026-09-01");

    await db
      .update(actionLog)
      .set({ prunedAt: new Date(), prunedBy: SYSTEM_VIEWER.id })
      .where(eq(actionLog.seq, log.seq));
    expect(await lastStatusChangeOn(lead, dto)).toBe("2026-09-01");
  });

  it("(i2) 한 트랜잭션의 두 status_change(시스템 자동 정산 → 사람 전환)는 occurred_at이 같고 seq가 큰 사람 줄이 최신이다", async () => {
    const teamA = await makeTeam();
    const lead = await makeActor("role-team-lead", teamA);
    const { projectId } = await makeStatusProject({ teamId: teamA, status: "in_progress", startDate: "2026-09-01" });

    await withTransaction(async (tx) => {
      await recordAction(
        SYSTEM_VIEWER,
        {
          actionType: "status_change",
          entity: "project",
          entityId: projectId,
          detail: { from: "in_progress", to: "settling", trigger: "auto", effectiveOn: "2026-09-17" },
        },
        { tx },
      );
      await recordAction(
        lead,
        {
          actionType: "status_change",
          entity: "project",
          entityId: projectId,
          detail: { from: "settling", to: "in_progress", trigger: "manual" },
        },
        { tx },
      );
    });

    const logs = await statusLogs(projectId);
    expect(logs).toHaveLength(2);
    expect(logs[0]?.occurredAt.getTime()).toBe(logs[1]?.occurredAt.getTime());

    const latest = await findLatestActionFor(lead, { entity: "project", entityId: projectId, actionType: "status_change" });
    expect(latest?.actorId).toBe(lead.id);
    expect(latest?.detail).toEqual({ from: "settling", to: "in_progress", trigger: "manual" });

    const dto = await findProject(lead, projectId);
    if (!dto || !latest) throw new Error("준비 실패");
    expect(await lastStatusChangeOn(lead, dto)).toBe(kstDateOf(latest.occurredAt));

    // 삽입 순서와 seq가 어긋나도 seq가 큰 줄이다 — 위 경우는 인덱스 역순 스캔이 우연히 나중 삽입을
    // 먼저 돌려줘 seq 정렬이 빠져도 통과한다(변이로 확인). 큰 seq를 먼저 넣어 그 우연을 없앤다.
    const adversarial = await makeStatusProject({ teamId: teamA, status: "in_progress", startDate: "2026-09-01" });
    const bigSeq = Number.MAX_SAFE_INTEGER - Math.floor(Math.random() * 1_000_000);
    await withTransaction(async (tx) => {
      await tx.insert(actionLog).values({
        seq: bigSeq,
        actorId: lead.id,
        actorRoleId: lead.roleId,
        actionType: "status_change",
        entity: "project",
        entityId: adversarial.projectId,
        documentId: null,
        detail: { from: "settling", to: "in_progress", trigger: "manual" },
      });
      await recordAction(
        SYSTEM_VIEWER,
        {
          actionType: "status_change",
          entity: "project",
          entityId: adversarial.projectId,
          detail: { from: "in_progress", to: "settling", trigger: "auto", effectiveOn: "2026-09-17" },
        },
        { tx },
      );
    });
    const adversarialLatest = await findLatestActionFor(lead, {
      entity: "project",
      entityId: adversarial.projectId,
      actionType: "status_change",
    });
    expect(adversarialLatest?.seq).toBe(bigSeq);
  });
});
