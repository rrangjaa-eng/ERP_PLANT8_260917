import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, projects } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { changeExpenseLine, createExpenseFromLines, ExpenseNotFoundError, listLineDoors } from "@/domain/expenses";
import { searchLinesForPick } from "@/domain/expenses/pick";
import { removeProjectMember } from "@/domain/projects/members";
import { changeProjectStatus } from "@/domain/projects/status";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { createProject } from "@/domain/projects";
import { insertVendor } from "@/repositories/vendors";
import { reviveOrInsertMembers } from "@/repositories/project-members";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { setupApprovedProject, setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";

// 06.2-10(D-6214 — 사용자 답 대기, 추천 「올리기 허용」으로 진행): 프로젝트의 살아 있는 참여자는 담당 PM · 업무 범위가 덮는 사람과
// 똑같이 그 프로젝트 견적 줄에서 지출결의를 쓴다(260907 `O: server/src/expenses.ts:1823-1836`). 보임이 먼저 — 참여자 아닌 사람은 없는 줄.
// 세계: 기획1팀 P1(PM 박서연 · setupExpenseProject) · 경영관리팀 P3(PM 타팀PM, 진행 · 고객 승인 · 거래처 있는 줄) · P3 참여자(기획1팀).

type World = ExpenseFixture & {
  otherTeamPm: Viewer;
  member: Viewer;
  p3: { id: string; name: string; lineId: string };
};

async function setup(): Promise<World> {
  const fx = await setupExpenseProject();
  const otherTeamPm = await makePerson("타팀PM", DEFAULT_ROLE_ID, "경영관리팀");
  const member = await makePerson("참여자", DEFAULT_ROLE_ID, "기획1팀");
  const p3Name = `경영 행사 ${randomUUID().slice(0, 8)}`;
  const p3 = { ...(await setupApprovedProject(p3Name, await teamIdByName("경영관리팀"), otherTeamPm, fx.stageOneId)), name: p3Name };
  // 픽스처라 참여자 후보 규칙(addProjectMembers)을 거치지 않고 리포지토리로 붙인다 — 이 파일이 재는 것은 지출결의 게이트다.
  await reviveOrInsertMembers(SYSTEM_VIEWER, { projectId: p3.id, userIds: [member.id], addedBy: otherTeamPm.id });
  return { ...fx, otherTeamPm, member, p3 };
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

// 참여자 자기 팀(기획1팀) P1 줄의 작성 중 문서 — 줄 바꾸기 판정은 새 줄의 프로젝트(P3)로 한다.
async function teamDraft(w: World): Promise<string> {
  const created = await createExpenseFromLines(w.member, { lineIds: [w.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서를 만들지 못했다: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

describe("참여자 지출결의 쓰기 — 만들기 (06.2-10 D-6214)", () => {
  it("다른 팀 참여자는 그 프로젝트 견적 줄로 작성 중 지출결의를 만든다 — 기안자 참여자 · 프로젝트 P3", async () => {
    const w = await setup();
    const result = await createExpenseFromLines(w.member, { lineIds: [w.p3.lineId] });
    expect(result.blocked).toEqual([]);
    expect(result.created).toHaveLength(1);
    const [row] = await db
      .select({ drafterId: expenses.drafterId, projectId: expenses.projectId, number: expenses.number })
      .from(expenses)
      .where(eq(expenses.id, result.created[0]?.expenseId ?? ""));
    expect(row).toEqual({ drafterId: w.member.id, projectId: w.p3.id, number: null });
  });

  it("같은 계급 · 같은 팀의 참여자 아닌 사람에게 그 줄은 없는 줄이다(권한 문구가 아니다 — 보임이 먼저)", async () => {
    const w = await setup();
    const missing = await createExpenseFromLines(w.otherPm, { lineIds: [randomUUID()] });
    const outside = await createExpenseFromLines(w.otherPm, { lineIds: [w.p3.lineId] });
    expect(outside.created).toEqual([]);
    expect(outside.blocked).toEqual([{ lineId: w.p3.lineId, reason: missing.blocked[0]?.reason }]);
  });
});

describe("참여자 지출결의 쓰기 — 나머지 입구 · 떼기 (06.2-10 D-6214)", () => {
  it("참여자는 자기 작성 중 문서의 줄을 참여 프로젝트 줄로 바꾼다", async () => {
    const w = await setup();
    const expenseId = await teamDraft(w);
    const moved = await changeExpenseLine(w.member, { expenseId, lineId: w.p3.lineId, expectedVersion: await versionOf(expenseId) });
    expect(moved).toHaveProperty("version");
    const [row] = await db.select({ projectId: expenses.projectId, quoteLineId: expenses.quoteLineId }).from(expenses).where(eq(expenses.id, expenseId));
    expect(row).toEqual({ projectId: w.p3.id, quoteLineId: w.p3.lineId });
  });

  it("listLineDoors — 참여자에게 참여 프로젝트의 지출결의 열이 서고 줄 셀이 있다", async () => {
    const w = await setup();
    const doors = await listLineDoors(w.member, { projectId: w.p3.id });
    expect(doors.showColumn).toBe(true);
    expect(doors.cells[w.p3.lineId]).toBeDefined();
  });

  it("searchLinesForPick(pick) — 참여 프로젝트는 이름으로 찾으면 줄이 있고, 검색어 없는 기본 목록은 지금처럼 담당 PM 프로젝트만이다", async () => {
    const w = await setup();
    const found = await searchLinesForPick(w.member, { mode: "pick", query: w.p3.name });
    expect(found.groups.some((group) => group.projectId === w.p3.id)).toBe(true);
    expect(found.rows.some((row) => row.projectId === w.p3.id && row.id === w.p3.lineId)).toBe(true);
    const defaults = await searchLinesForPick(w.member, { mode: "pick" });
    expect(defaults.groups.some((group) => group.projectId === w.p3.id)).toBe(false);
  });

  it("참여자를 떼면 네 입구가 모두 없는 것과 같다 — 만들기 · 줄 바꾸기 · 지출결의 열 · 줄 고르기", async () => {
    const w = await setup();
    const expenseId = await teamDraft(w);
    await removeProjectMember(w.otherTeamPm, w.p3.id, w.member.id);

    const missing = await createExpenseFromLines(w.member, { lineIds: [randomUUID()] });
    const created = await createExpenseFromLines(w.member, { lineIds: [w.p3.lineId] });
    expect(created.created).toEqual([]);
    expect(created.blocked).toEqual([{ lineId: w.p3.lineId, reason: missing.blocked[0]?.reason }]);
    await expect(changeExpenseLine(w.member, { expenseId, lineId: w.p3.lineId, expectedVersion: await versionOf(expenseId) })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    expect(await listLineDoors(w.member, { projectId: w.p3.id })).toEqual({ showColumn: false, tableGateReason: null, cells: {} });
    const picked = await searchLinesForPick(w.member, { mode: "pick", query: w.p3.name });
    expect(picked.groups.some((group) => group.projectId === w.p3.id)).toBe(false);
    expect(picked.rows.some((row) => row.projectId === w.p3.id)).toBe(false);
  });

  it("참여는 프로젝트 쓰기 권리가 아니다 — 상태 전환 · 원장 저장은 여전히 거부(D-6213)", async () => {
    const w = await setup();
    // 원장은 칸마다 권리를 본다 — 빈 저장은 쓰는 것이 없어 기간 칸으로 잰다.
    const period = { startDate: "2026-09-01", endDate: "2026-12-31" };
    await expect(saveProjectLedger(w.member, w.p3.id, { seenStatus: "in_progress", period: { ...period, endDate: "2027-01-31", baseline: period } })).rejects.toThrow();
    const [after] = await db.select({ endDate: projects.endDate }).from(projects).where(eq(projects.id, w.p3.id));
    expect(after?.endDate).toBe(period.endDate);
    // 진행 중 P3에는 수동 전환이 없어 입찰 프로젝트를 하나 더 둔다(입찰 → 실주는 사람 전환).
    const bidding = await createProject(SYSTEM_VIEWER, {
      clientId: (await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` })).id,
      teamId: await teamIdByName("경영관리팀"),
      pmUserId: w.otherTeamPm.id,
      name: `경영 입찰 ${randomUUID().slice(0, 8)}`,
      startDate: "2026-11-01",
      endDate: "2026-12-31",
    });
    await reviveOrInsertMembers(SYSTEM_VIEWER, { projectId: bidding.id, userIds: [w.member.id], addedBy: w.otherTeamPm.id });
    await expect(changeProjectStatus(w.member, bidding.id, { from: "bidding", to: "lost" })).rejects.toThrow("상태 바꾸기 권한 없음");
  });
});
