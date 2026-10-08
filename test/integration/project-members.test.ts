import { describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, projectMembers, projects } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { assignTeam, createTeam } from "@/domain/org";
import { setResignationDate } from "@/domain/people";
import { loadProjectList } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { addProjectMembers, projectMemberRights, removeProjectMember, restoreProjectMember } from "@/domain/projects/members";
import { addProjectMembersAction, removeProjectMemberAction, restoreProjectMemberAction } from "@/app/(app)/projects/actions";
import { upsertPermission } from "@/repositories/permissions";
import { addDays, kstToday } from "@/lib/kst-date";
import { ACTION_REGISTRY } from "@/lib/actions/registry";
import { makePerson, orgUnitIdByName, teamIdByName } from "./approvals-fixtures";
import { buildViewScopeWorld, type ViewScopeWorld } from "./fixtures/view-scope";

// 06.2-05(SC-5 · D-6209~D-6213 · D-6222 · D-6223): 참여자 더하기 · 떼기 · 되돌리기 · 후보 · 목록.
// 세계는 06.2-03 view-scope에 경영관리본부의 다른 팀(재무팀) · 그 팀 사람 Y · 경영관리팀 팀장을 더한다(공용 세계 파일은 고치지 않는다).

// 액션도 같은 파일에서 부른다 — 세션만 가짜로 둔다(purchase-requests.test.ts 꼴).
const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

type MembersWorld = ViewScopeWorld & { finance: string; Y: Viewer; mgmtLead: Viewer };

async function buildMembersWorld(): Promise<MembersWorld> {
  const world = await buildViewScopeWorld();
  const finance = (await createTeam(SYSTEM_VIEWER, { orgUnitId: await orgUnitIdByName("경영관리본부"), name: "재무팀" })).id;
  const Y = await makePerson("와이", DEFAULT_ROLE_ID, "재무팀");
  const mgmtLead = await makePerson("경영팀장", TEAM_LEAD_ROLE_ID, "경영관리팀");
  return { ...world, finance, Y, mgmtLead };
}

async function memberLogs(projectId: string): Promise<Array<{ actorId: string | null; detail: unknown }>> {
  return db
    .select({ actorId: actionLog.actorId, detail: actionLog.detail })
    .from(actionLog)
    .where(and(eq(actionLog.actionType, "project_member_change"), eq(actionLog.entityId, projectId)));
}

async function memberRows(projectId: string, userId: string): Promise<Array<{ id: string; createdAt: Date; archivedAt: Date | null }>> {
  return db
    .select({ id: projectMembers.id, createdAt: projectMembers.createdAt, archivedAt: projectMembers.archivedAt })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .orderBy(asc(projectMembers.createdAt));
}

async function completeProject(projectId: string): Promise<void> {
  await db.update(projects).set({ status: "completed" }).where(eq(projects.id, projectId));
}

const LOCKED = "완료 프로젝트 · 참여자 잠김";
const NOT_PROCESSED = "처리 실패 · 다시 시도";

async function listedIds(viewer: Viewer): Promise<string[]> {
  return (await loadProjectList(viewer, {})).rows.map((row) => row.id);
}

describe("더하기 트레이서", () => {
  it("경영관리팀 팀장이 재무팀 Y를 P3 참여자로 더하면 같은 트랜잭션에 project_member_change 한 줄(added: [Y])", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await expect(addProjectMembers(w.mgmtLead, P3, [w.Y.id])).resolves.toEqual({ added: 1 });
    expect(await memberLogs(P3)).toEqual([{ actorId: w.mgmtLead.id, detail: { projectId: P3, added: [w.Y.id] } }]);
  });

  it("더한 직후 Y(team 범위)의 프로젝트 목록에 P3가 있다 — 더하기 전에는 없다", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    expect(await listedIds(w.Y)).not.toContain(P3);
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    expect(await listedIds(w.Y)).toContain(P3);
  });

  it("액션으로 해도 같다 — projects.member 쓰기로 등록돼 있다", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    session.viewer = w.mgmtLead;
    const outcome = await addProjectMembersAction({ projectId: P3, userIds: [w.Y.id] });
    expect(outcome?.serverError).toBeUndefined();
    expect(outcome?.data).toEqual({ added: 1 });
    expect(await listedIds(w.Y)).toContain(P3);
    expect(ACTION_REGISTRY.find((entry) => entry.name === "addProjectMembersAction")).toEqual({
      name: "addProjectMembersAction",
      menu: "projects.member",
      action: "write",
      dtoName: null,
    });
  });
});

describe("떼기 · 되돌리기 · 잠금 · 권리", () => {
  it("떼면 목록에서 사라지고 로그 removed — 다시 더하면 같은 줄이 되살아나고 붙인 시각 그대로 · 살아 있는 줄은 하나", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    const [first] = await memberRows(P3, w.Y.id);
    await removeProjectMember(w.mgmtLead, P3, w.Y.id);
    expect(await listedIds(w.Y)).not.toContain(P3);
    expect(await memberLogs(P3)).toContainEqual({ actorId: w.mgmtLead.id, detail: { projectId: P3, removed: w.Y.id } });

    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    const rows = await memberRows(P3, w.Y.id);
    expect(rows).toEqual([{ id: first?.id, createdAt: first?.createdAt, archivedAt: null }]);
    expect(await listedIds(w.Y)).toContain(P3);
  });

  it("완료 프로젝트에서는 더하기 · 떼기 · 되돌리기가 잠김 — 권리는 { canEdit: false, locked: true }", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    await removeProjectMember(w.mgmtLead, P3, w.Y.id);
    await completeProject(P3);
    await expect(addProjectMembers(w.mgmtLead, P3, [w.Y.id])).rejects.toThrow(LOCKED);
    await expect(removeProjectMember(w.mgmtLead, P3, w.people.참여자.id)).rejects.toThrow(LOCKED);
    await expect(restoreProjectMember(w.mgmtLead, P3, w.Y.id)).rejects.toThrow(LOCKED);
    expect(await projectMemberRights(w.mgmtLead, P3)).toMatchObject({ canEdit: false, locked: true });
  });

  it("참여자 Y(projects.member 키 있음)는 권리 없음 — 상태 전환 · 원장 저장 · 참여자 더하기도 못 한다(D-6213)", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    expect(await projectMemberRights(w.Y, P3)).toMatchObject({ canEdit: false, locked: false });
    await expect(changeProjectStatus(w.Y, P3, { from: "bidding", to: "lost" })).rejects.toThrow();
    const ledger = saveProjectLedger(w.Y, P3, {
      seenStatus: "bidding",
      period: { startDate: "2026-11-02", endDate: "2026-12-31", baseline: { startDate: "2026-11-01", endDate: "2026-12-31" } },
    });
    await expect(ledger).rejects.toThrow();
    const [row] = await db.select({ status: projects.status, startDate: projects.startDate }).from(projects).where(eq(projects.id, P3));
    expect(row).toEqual({ status: "bidding", startDate: "2026-11-01" });
    await expect(addProjectMembers(w.Y, P3, [w.people.대표.id])).rejects.toThrow("참여자 더하기 권한 없음 · 담당 PM X");
  });

  it("키를 끈 팀장은 권리 없음 · 범위 밖 프로젝트 id를 액션으로 부르면 일반 문구", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu: "projects.member", action: "write", allowed: false });
    expect(await projectMemberRights(w.mgmtLead, P3)).toMatchObject({ canEdit: false, locked: false });
    await expect(addProjectMembers(w.mgmtLead, P3, [w.Y.id])).rejects.toThrow("참여자 더하기 권한 없음 · 담당 PM X");

    session.viewer = w.people.팀PM;
    expect((await addProjectMembersAction({ projectId: P3, userIds: [w.Y.id] }))?.serverError).toBe(NOT_PROCESSED);
    expect((await removeProjectMemberAction({ projectId: P3, userId: w.people.참여자.id }))?.serverError).toBe(NOT_PROCESSED);
    expect((await restoreProjectMemberAction({ projectId: P3, userId: w.people.참여자.id }))?.serverError).toBe(NOT_PROCESSED);
    expect(await memberRows(P3, w.Y.id)).toEqual([]);
  });

  it("둘을 더하는데 하나가 담당 팀 사람이면 전체 거부 · 아무 줄도 생기지 않는다", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const mgmtPerson = await makePerson("경영사원", DEFAULT_ROLE_ID, "경영관리팀");
    await expect(addProjectMembers(w.mgmtLead, P3, [w.Y.id, mgmtPerson.id])).rejects.toThrow("경영사원 더할 수 없음 · 새로 고침");
    expect(await memberRows(P3, w.Y.id)).toEqual([]);
    expect(await memberRows(P3, mgmtPerson.id)).toEqual([]);
    expect(await memberLogs(P3)).toEqual([]);
  });

  it("Y를 다른 팀으로 발령하거나 퇴직 처리해도 참여자 줄은 살아 있다(D-6222)", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    const today = kstToday(new Date());
    await assignTeam(SYSTEM_VIEWER, { userId: w.Y.id, teamId: w.teams.plan1, effectiveFrom: today });
    await setResignationDate(SYSTEM_VIEWER, w.Y.id, addDays(today, -1));
    expect(await memberRows(P3, w.Y.id)).toEqual([expect.objectContaining({ archivedAt: null })]);
  });

  it("퇴직한 참여자 R을 떼고 되돌리면 같은 줄 · 붙인 시각 그대로 · 로그 restored — 더하기로 다시 붙이면 후보 검사로 거부", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const R = await makePerson("퇴직자", DEFAULT_ROLE_ID, "재무팀");
    await addProjectMembers(w.mgmtLead, P3, [R.id]);
    const [first] = await memberRows(P3, R.id);
    await setResignationDate(SYSTEM_VIEWER, R.id, addDays(kstToday(new Date()), -1));
    await removeProjectMember(w.mgmtLead, P3, R.id);
    await restoreProjectMember(w.mgmtLead, P3, R.id);
    expect(await memberRows(P3, R.id)).toEqual([{ id: first?.id, createdAt: first?.createdAt, archivedAt: null }]);
    expect(await memberLogs(P3)).toContainEqual({ actorId: w.mgmtLead.id, detail: { projectId: P3, restored: R.id } });

    await removeProjectMember(w.mgmtLead, P3, R.id);
    await expect(addProjectMembers(w.mgmtLead, P3, [R.id])).rejects.toThrow("퇴직자 더할 수 없음 · 새로 고침");
  });

  it("뗀 뒤 그 사람을 담당 팀으로 발령해도 되돌리기는 성공한다(후보 검사 없음)", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    await removeProjectMember(w.mgmtLead, P3, w.Y.id);
    await assignTeam(SYSTEM_VIEWER, { userId: w.Y.id, teamId: await teamIdByName("경영관리팀"), effectiveFrom: kstToday(new Date()) });
    await restoreProjectMember(w.mgmtLead, P3, w.Y.id);
    expect(await memberRows(P3, w.Y.id)).toEqual([expect.objectContaining({ archivedAt: null })]);
  });

  it("되돌리기 거부 — 참여자 Y는 권리 없음 · 범위 밖은 일반 문구 · 살아 있는 줄이 있거나 보관 줄이 없으면 일반 문구", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    await removeProjectMember(w.mgmtLead, P3, w.people.참여자.id);
    await expect(restoreProjectMember(w.Y, P3, w.people.참여자.id)).rejects.toThrow("참여자 변경 권한 없음 · 담당 PM X");
    await expect(restoreProjectMember(w.people.팀PM, P3, w.people.참여자.id)).rejects.toThrow(NOT_PROCESSED);
    await expect(restoreProjectMember(w.mgmtLead, P3, w.Y.id)).rejects.toThrow(NOT_PROCESSED);
    await expect(restoreProjectMember(w.mgmtLead, P3, w.people.대표.id)).rejects.toThrow(NOT_PROCESSED);
    const rows = await memberRows(P3, w.people.참여자.id);
    expect(rows.map((row) => row.archivedAt !== null)).toEqual([true]);
  });
});
