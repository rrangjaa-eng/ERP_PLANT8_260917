import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, projects } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createTeam } from "@/domain/org";
import { changeExpenseLine, createExpenseFromLines, ExpenseNotFoundError, listLineDoors } from "@/domain/expenses";
import { searchLinesForPick } from "@/domain/expenses/pick";
import { upsertPermission } from "@/repositories/permissions";
import { makePerson, orgUnitIdByName, teamIdByName } from "./approvals-fixtures";
import { setupApprovedProject, setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { insertLiveMember } from "./fixtures/view-scope";

// 06.2-08 Task 3(RESEARCH M10 · T-06.2-82): 지출결의 쪽 프로젝트 확인 — 견적 줄에서 만들기 · 줄 바꾸기 · 줄 문 · 줄 고르기가
// 쓰기 게이트(담당 PM ∨ 업무 범위 — 그대로, D-6202) 와 함께 프로젝트 보임을 요구한다.
// 본부 책임자(업무 범위 전사 · 보는 범위 본부)는 쓰기 게이트를 늘 통과하므로 보임이 경계다. 시드 본부 책임자에는 `projects` 쓰기가 없어
// (지출결의 줄 입구가 막혀 있다) 관리자가 켠 상태를 흉내 낸다.
// 세계: 기획1팀 P1(PM 박서연 · setupExpenseProject) · 기획2팀 P2(같은 본부, PM 타팀PM) · 경영관리팀 P3(다른 본부, PM 타팀PM, 참여자 붙음).

type World = ExpenseFixture & {
  head: Viewer;
  otherTeamPm: Viewer;
  member: Viewer;
  p2: { id: string; name: string; lineId: string };
  p3: { id: string; name: string; lineId: string };
};

async function setup(): Promise<World> {
  const fx = await setupExpenseProject();
  const plan2 = (await createTeam(SYSTEM_VIEWER, { orgUnitId: await orgUnitIdByName("기획본부"), name: "기획2팀" })).id;
  const mgmt = await teamIdByName("경영관리팀");
  await upsertPermission(SYSTEM_VIEWER, { roleId: DIVISION_HEAD_ROLE_ID, menu: "projects", action: "write", allowed: true });
  const head = await makePerson("본부책임", DIVISION_HEAD_ROLE_ID, "기획1팀");
  const otherTeamPm = await makePerson("타팀PM", DEFAULT_ROLE_ID, "경영관리팀");
  const member = await makePerson("참여자", DEFAULT_ROLE_ID, "기획1팀");
  const p2Name = `기획2 행사 ${randomUUID().slice(0, 8)}`;
  const p3Name = `경영 행사 ${randomUUID().slice(0, 8)}`;
  const p2 = { ...(await setupApprovedProject(p2Name, plan2, otherTeamPm, fx.stageOneId)), name: p2Name };
  const p3 = { ...(await setupApprovedProject(p3Name, mgmt, otherTeamPm, fx.stageOneId)), name: p3Name };
  await insertLiveMember(p3.id, member.id, fx.ceo.id);
  return { ...fx, head, otherTeamPm, member, p2, p3 };
}

async function draftOn(viewer: Viewer, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서를 만들지 못했다: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

describe("지출결의 쪽 프로젝트 확인 — 쓰기 게이트 + 보임 (06.2 M10)", () => {
  it("본부 책임자는 다른 본부 프로젝트 줄로 지출결의를 만들지 못하고(없는 줄과 같은 답) 같은 본부 프로젝트 줄은 지금처럼 만든다", async () => {
    const w = await setup();
    const missing = await createExpenseFromLines(w.head, { lineIds: [randomUUID()] });
    const outside = await createExpenseFromLines(w.head, { lineIds: [w.p3.lineId] });
    expect(outside.created).toEqual([]);
    expect(outside.blocked).toEqual([{ lineId: w.p3.lineId, reason: missing.blocked[0]?.reason }]);
    const inside = await createExpenseFromLines(w.head, { lineIds: [w.p2.lineId] });
    expect(inside.created).toHaveLength(1);
  });

  it("본부 책임자는 자기 작성 중 문서의 줄을 다른 본부 프로젝트 줄로 바꾸지 못하고(없는 문서) 같은 본부 줄로는 바꾼다", async () => {
    const w = await setup();
    const expenseId = await draftOn(w.head, w.p2.lineId);
    await expect(changeExpenseLine(w.head, { expenseId, lineId: w.p3.lineId, expectedVersion: await versionOf(expenseId) })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    const moved = await changeExpenseLine(w.head, { expenseId, lineId: w.lines.withVendor, expectedVersion: await versionOf(expenseId) });
    expect(moved).toHaveProperty("version");
  });

  it("listLineDoors — 본부 책임자에게 다른 본부 프로젝트는 열이 숨고 같은 본부 프로젝트는 선다", async () => {
    const w = await setup();
    expect((await listLineDoors(w.head, { projectId: w.p3.id })).showColumn).toBe(false);
    expect((await listLineDoors(w.head, { projectId: w.p2.id })).showColumn).toBe(true);
  });

  it("searchLinesForPick(pick) — 다른 본부 프로젝트 이름으로 찾아도 그 프로젝트 줄이 없고 같은 본부 프로젝트는 있다", async () => {
    const w = await setup();
    const outside = await searchLinesForPick(w.head, { mode: "pick", query: w.p3.name });
    expect(outside.rows.some((row) => row.projectId === w.p3.id)).toBe(false);
    expect(outside.groups.some((group) => group.projectId === w.p3.id)).toBe(false);
    const inside = await searchLinesForPick(w.head, { mode: "pick", query: w.p2.name });
    expect(inside.rows.some((row) => row.projectId === w.p2.id)).toBe(true);
  });

  it("searchLinesForPick(change) — 문서 프로젝트가 보는 범위 밖이 되면 없는 문서다", async () => {
    const w = await setup();
    const expenseId = await draftOn(w.head, w.p2.lineId);
    expect((await searchLinesForPick(w.head, { mode: "change", expenseId })).rows.length).toBeGreaterThan(0);
    // 프로젝트 팀을 바꾸는 도메인 경로가 없어 행을 직접 고친다(expense-visibility 05-08 검토 #6 선례) — P2를 다른 본부로.
    await db.update(projects).set({ teamId: await teamIdByName("경영관리팀") }).where(eq(projects.id, w.p2.id));
    await expect(searchLinesForPick(w.head, { mode: "change", expenseId })).rejects.toBeInstanceOf(ExpenseNotFoundError);
  });

  it("담당 PM(다른 팀 PM 지정)은 자기 프로젝트 줄로 지금처럼 만든다 (D-6218 보임 + PM 쓰기 게이트)", async () => {
    const w = await setup();
    expect((await createExpenseFromLines(w.otherTeamPm, { lineIds: [w.p2.lineId] })).created).toHaveLength(1);
  });

  it("참여자는 이 플랜에서 아직 쓰지 못한다 — 쓰기 게이트 그대로(D-6214는 06.2-10)", async () => {
    const w = await setup();
    await expect(createExpenseFromLines(w.member, { lineIds: [w.p3.lineId] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
