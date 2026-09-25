import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, asc, eq, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
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
import { changeProjectStatus } from "@/domain/projects/status";

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

  await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
    {
      subcategory: subcategory.value,
      itemName: "상태 바꾸기 전 줄",
      unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
      execution: { currency: "KRW", amount: 50_000, fxRate: 1 },
    },
  ]);
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
    const saved = await saveQuoteLines(SYSTEM_VIEWER, lost.revision.id, [
      {
        subcategory: lost.subcategoryValue,
        itemName: "미수주 뒤 도착한 PT 제작비",
        unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
        execution: { currency: "KRW", amount: 300_000, fxRate: 1 },
      },
    ]);
    expect(saved.lines.map((line) => line.itemName)).toContain("미수주 뒤 도착한 PT 제작비");
    const lostLines = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, lost.revision.id));
    expect(lostLines.map((line) => line.itemName).sort()).toEqual(["미수주 뒤 도착한 PT 제작비", "상태 바꾸기 전 줄"].sort());

    const completed = await setupProjectWithLine("completed");
    const before = await db
      .select()
      .from(quoteLines)
      .where(eq(quoteLines.revisionId, completed.revision.id))
      .orderBy(asc(quoteLines.id));

    const attempt = saveQuoteLines(SYSTEM_VIEWER, completed.revision.id, [
      {
        subcategory: completed.subcategoryValue,
        itemName: "완료 뒤 시도",
        unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ]);
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
