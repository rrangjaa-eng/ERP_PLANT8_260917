import { describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, projectMembers, projects } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { GateBlockedError } from "@/domain/rules/gate";
import { assignTeam, createTeam } from "@/domain/org";
import { setResignationDate } from "@/domain/people";
import { createProject, loadProjectList } from "@/domain/projects";
import { changeProjectStatus, ForbiddenError } from "@/domain/projects/status";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { canOpenProject } from "@/domain/projects/visibility";
import {
  addProjectMembers,
  listMemberCandidates,
  listProjectMembers,
  projectMemberRights,
  removeProjectMember,
  restoreProjectMember,
} from "@/domain/projects/members";
import {
  addProjectMembersAction,
  listMemberCandidatesAction,
  removeProjectMemberAction,
  restoreProjectMemberAction,
} from "@/app/(app)/projects/actions";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { setUserArchived } from "@/repositories/users";
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

// 검토 반영 I-3(T-06.2-53): 트랜잭션 전 판정과 잠금 사이에 상태를 바꾸는 자리 — 실제 lockProjectForWrite 앞에서만 끼어든다(sleep 없음).
const lockHook = vi.hoisted(() => ({ before: null as null | (() => Promise<void>) }));
vi.mock("@/repositories/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/repositories/projects")>();
  return {
    ...actual,
    lockProjectForWrite: async (...args: Parameters<typeof actual.lockProjectForWrite>) => {
      const before = lockHook.before;
      lockHook.before = null;
      if (before) await before();
      return actual.lockProjectForWrite(...args);
    },
  };
});

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
    expect(((await errorOf(changeProjectStatus(w.Y, P3, { from: "bidding", to: "lost" }))) as Error).message).toBe("상태 바꾸기 권한 없음");
    const ledger = saveProjectLedger(w.Y, P3, {
      seenStatus: "bidding",
      period: { startDate: "2026-11-02", endDate: "2026-12-31", baseline: { startDate: "2026-11-01", endDate: "2026-12-31" } },
    });
    expect(((await errorOf(ledger)) as Error).message).toBe("기간 바꾸기 권한 없음");
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
    // 퇴직자는 오늘 스냅숏(후보 범위) 밖이라 이름 대신 사람 수(/cso M-1(a)).
    await expect(addProjectMembers(w.mgmtLead, P3, [R.id])).rejects.toThrow("1명 더할 수 없음 · 새로 고침");
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

describe("후보 · 목록", () => {
  async function candidateIds(viewer: Viewer, projectId: string, query?: string): Promise<string[]> {
    return (await listMemberCandidates(viewer, projectId, query === undefined ? {} : { query })).rows.map((row) => row.userId ?? "");
  }

  it("후보 = 담당 본부 사람 + 본부 없는 대표 − 시스템 관리자 · 퇴직 · 보관 · 이미 참여 · 담당 팀 · 발령 없는 신규자 · 다른 본부 · 이름순", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const today = kstToday(new Date());
    const sysadmin = await makePerson("관리자", SYSADMIN_ROLE_ID, "재무팀");
    const retired = await makePerson("어제퇴직", DEFAULT_ROLE_ID, "재무팀");
    await setResignationDate(SYSTEM_VIEWER, retired.id, addDays(today, -1));
    const archived = await makePerson("보관된사람", DEFAULT_ROLE_ID, "재무팀");
    await setUserArchived(SYSTEM_VIEWER, archived.id, true);
    const joined = await makePerson("이미참여", DEFAULT_ROLE_ID, "재무팀");
    await addProjectMembers(w.mgmtLead, P3, [joined.id]);
    await makePerson("경영사원", DEFAULT_ROLE_ID, "경영관리팀");
    const ceoInFinance = await makePerson("가대표", CEO_ROLE_ID, "재무팀");
    const ceoInPlan = await makePerson("기획대표", CEO_ROLE_ID, "기획1팀");

    const result = await listMemberCandidates(w.mgmtLead, P3, {});
    expect(result.truncated).toBe(false);
    expect(result.rows.map((row) => row.name)).toEqual(["가대표", "대표", "와이"]);
    expect(result.rows.map((row) => row.userId)).toEqual([ceoInFinance.id, w.people.대표.id, w.Y.id]);
    expect(result.rows.find((row) => row.userId === w.Y.id)).toEqual({ userId: w.Y.id, name: "와이", teamName: "재무팀" });
    expect(result.rows.find((row) => row.userId === w.people.대표.id)).toEqual({ userId: w.people.대표.id, name: "대표", teamName: null });
    for (const out of [sysadmin, retired, archived, joined, ceoInPlan, w.people.무소속]) expect(result.rows.map((row) => row.userId)).not.toContain(out.id);
  });

  it("프로젝트 보기를 끈 계급의 V는 후보에 없고 더하기는 전체 거부(eng N9)", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const roleId = "role-test-no-project-view";
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: "프로젝트 못 보는 계급", workScope: "team", viewScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "view", allowed: false });
    const V = await makePerson("브이", roleId, "재무팀");
    expect(await candidateIds(w.mgmtLead, P3)).not.toContain(V.id);
    await expect(addProjectMembers(w.mgmtLead, P3, [w.Y.id, V.id])).rejects.toThrow("브이 더할 수 없음 · 새로 고침");
    expect(await memberRows(P3, V.id)).toEqual([]);
    expect(await memberRows(P3, w.Y.id)).toEqual([]);
  });

  it("담당 팀 밖에 발령된 담당 PM M은 후보 · hasCandidates에 없고 더하기는 전체 거부(R2-I2)", async () => {
    const w = await buildMembersWorld();
    const M = await makePerson("엠", DEFAULT_ROLE_ID, "재무팀");
    const P4 = (
      await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId: w.teams.mgmt, pmUserId: M.id, name: "범위 P4", startDate: "2026-11-01", endDate: "2026-12-31" })
    ).id;
    expect(await candidateIds(w.mgmtLead, P4)).not.toContain(M.id);
    await addProjectMembers(w.mgmtLead, P4, [w.people.대표.id, w.Y.id]);
    expect(await candidateIds(w.mgmtLead, P4)).toEqual([]);
    expect(await projectMemberRights(w.mgmtLead, P4)).toMatchObject({ canEdit: true, hasCandidates: false });
    await expect(addProjectMembers(w.mgmtLead, P4, [M.id])).rejects.toThrow("엠 더할 수 없음 · 새로 고침");
    expect(await memberRows(P4, M.id)).toEqual([]);
  });

  it("검색어는 이름 · 팀 이름 부분 일치 · 50명이면 truncated 거짓 50행, 51명이면 참 50행", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    expect(await candidateIds(w.mgmtLead, P3, "재무")).toEqual([w.Y.id]);
    expect(await candidateIds(w.mgmtLead, P3, "대")).toEqual([w.people.대표.id]);

    // 대표 · 와이 둘 + 48명 = 50.
    for (let i = 0; i < 48; i++) await makePerson(`재무사람${String(i).padStart(2, "0")}`, DEFAULT_ROLE_ID, "재무팀");
    const fifty = await listMemberCandidates(w.mgmtLead, P3, {});
    expect({ truncated: fifty.truncated, rows: fifty.rows.length }).toEqual({ truncated: false, rows: 50 });
    await makePerson("재무사람48", DEFAULT_ROLE_ID, "재무팀");
    const fiftyOne = await listMemberCandidates(w.mgmtLead, P3, {});
    expect({ truncated: fiftyOne.truncated, rows: fiftyOne.rows.length }).toEqual({ truncated: true, rows: 50 });
    // 사람 49명을 계정 함수로 만든다(비밀번호 해시) — 기본 5초를 넘는다.
  }, 60_000);

  it("퇴직일 = 오늘인 사람은 후보에 있고 어제인 사람은 없다(E6)", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const today = kstToday(new Date());
    const leavingToday = await makePerson("오늘퇴직", DEFAULT_ROLE_ID, "재무팀");
    await setResignationDate(SYSTEM_VIEWER, leavingToday.id, today);
    const leftYesterday = await makePerson("어제퇴직", DEFAULT_ROLE_ID, "재무팀");
    await setResignationDate(SYSTEM_VIEWER, leftYesterday.id, addDays(today, -1));
    const ids = await candidateIds(w.mgmtLead, P3);
    expect(ids).toContain(leavingToday.id);
    expect(ids).not.toContain(leftYesterday.id);
  });

  it("더하기는 고른 사람마다 다시 계산 — 그 사이 담당 팀으로 옮긴 사람 하나 · 둘이면 문구가 다르고 전체 거부", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const today = kstToday(new Date());
    const Z = await makePerson("제트", DEFAULT_ROLE_ID, "재무팀");
    await assignTeam(SYSTEM_VIEWER, { userId: w.Y.id, teamId: w.teams.mgmt, effectiveFrom: today });
    await expect(addProjectMembers(w.mgmtLead, P3, [w.people.대표.id, w.Y.id])).rejects.toThrow("와이 더할 수 없음 · 새로 고침");
    await assignTeam(SYSTEM_VIEWER, { userId: Z.id, teamId: w.teams.mgmt, effectiveFrom: today });
    await expect(addProjectMembers(w.mgmtLead, P3, [w.people.대표.id, Z.id, w.Y.id])).rejects.toThrow("제트 외 1명 더할 수 없음 · 새로 고침");
    expect(await memberRows(P3, w.people.대표.id)).toEqual([]);
  });

  it("listProjectMembers — 담당 PM 행은 rows 밖 · rows는 붙인 시각순 · 오늘 팀 · 퇴직(어제) · 퇴직 아님(오늘) · 보관 · 범위 밖은 null", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const today = kstToday(new Date());
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    const leftYesterday = await makePerson("어제퇴직", DEFAULT_ROLE_ID, "재무팀");
    const leavingToday = await makePerson("오늘퇴직", DEFAULT_ROLE_ID, "재무팀");
    const toArchive = await makePerson("보관될사람", DEFAULT_ROLE_ID, "재무팀");
    await addProjectMembers(w.mgmtLead, P3, [leftYesterday.id]);
    await addProjectMembers(w.mgmtLead, P3, [leavingToday.id]);
    await addProjectMembers(w.mgmtLead, P3, [toArchive.id]);
    await addProjectMembers(w.mgmtLead, P3, [w.people.대표.id]);
    await setResignationDate(SYSTEM_VIEWER, leftYesterday.id, addDays(today, -1));
    await setResignationDate(SYSTEM_VIEWER, leavingToday.id, today);
    await setUserArchived(SYSTEM_VIEWER, toArchive.id, true);

    const listed = await listProjectMembers(w.mgmtLead, P3);
    expect(listed?.pm).toEqual({ userId: w.people.X.id, name: "X", teamName: "경영관리팀", retired: false, archived: false });
    expect(listed?.rows).toEqual([
      { userId: w.people.참여자.id, name: "참여자", teamName: "기획1팀", retired: false, archived: false },
      { userId: w.Y.id, name: "와이", teamName: "재무팀", retired: false, archived: false },
      { userId: leftYesterday.id, name: "어제퇴직", teamName: "재무팀", retired: true, archived: false },
      { userId: leavingToday.id, name: "오늘퇴직", teamName: "재무팀", retired: false, archived: false },
      { userId: toArchive.id, name: "보관될사람", teamName: "재무팀", retired: false, archived: true },
      { userId: w.people.대표.id, name: "대표", teamName: null, retired: false, archived: false },
    ]);
    expect(listed).toMatchObject({ canEdit: true, locked: false });

    await setResignationDate(SYSTEM_VIEWER, w.people.X.id, addDays(today, -1));
    expect((await listProjectMembers(w.Y, P3))?.pm).toMatchObject({ userId: w.people.X.id, retired: true });
    expect(await listProjectMembers(w.people.팀PM, P3)).toBeNull();
  });

  it("hasCandidates — 권리 있는 사람은 참 · 후보를 다 더하면 거짓 · 참여자 · 완료 프로젝트는 거짓 · projectMemberRights도 같은 값", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    expect(await listProjectMembers(w.mgmtLead, P3)).toMatchObject({ canEdit: true, hasCandidates: true });
    expect(await projectMemberRights(w.mgmtLead, P3)).toMatchObject({ canEdit: true, hasCandidates: true });
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id, w.people.대표.id]);
    expect(await listProjectMembers(w.mgmtLead, P3)).toMatchObject({ canEdit: true, hasCandidates: false });
    expect(await projectMemberRights(w.mgmtLead, P3)).toMatchObject({ canEdit: true, hasCandidates: false });
    expect(await listProjectMembers(w.Y, P3)).toMatchObject({ canEdit: false, hasCandidates: false });
    expect(await projectMemberRights(w.Y, P3)).toMatchObject({ canEdit: false, hasCandidates: false });

    await removeProjectMember(w.mgmtLead, P3, w.Y.id);
    await completeProject(P3);
    expect(await listProjectMembers(w.mgmtLead, P3)).toMatchObject({ canEdit: false, locked: true, hasCandidates: false });
    expect(await projectMemberRights(w.mgmtLead, P3)).toMatchObject({ canEdit: false, locked: true, hasCandidates: false });
    expect((await listMemberCandidates(w.mgmtLead, P3, {})).rows).toEqual([]);
  });
});

// ── 06.2-05 독립 검토 반영(I-1 · I-2 · I-3 · M-1, 사용자 결정 2026-10-08 「막기」 · 「10분 안만」) ──────────────────
async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("거부되지 않았다");
}

async function makeRole(id: string, workScope: "team" | "company", viewScope: "team" | "org_unit"): Promise<void> {
  await insertRole(SYSTEM_VIEWER, { id, name: id, workScope, viewScope });
  await upsertPermission(SYSTEM_VIEWER, { roleId: id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: id, menu: "projects.member", action: "write", allowed: true });
}

async function archiveProjectRow(projectId: string): Promise<void> {
  await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, projectId));
}

const MINUTE = 60_000;

describe("검토 반영 I-2 — 참여로만 보이는 프로젝트에서 업무 범위 갈래는 권리가 아니다", () => {
  it("업무 범위 전사 · 보는 범위 team 계급 H가 참여자로만 P3를 보면 canEdit 거짓 · 더하기 · 떼기 ForbiddenError", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await makeRole("role-test-company-work-team-view", "company", "team");
    const H = await makePerson("에이치", "role-test-company-work-team-view", "재무팀");
    expect(await canOpenProject(H, P3)).toBe(false);
    await addProjectMembers(w.mgmtLead, P3, [H.id]);
    expect(await canOpenProject(H, P3)).toBe(true);

    expect(await projectMemberRights(H, P3)).toMatchObject({ canEdit: false, locked: false, hasCandidates: false });
    const add = await errorOf(addProjectMembers(H, P3, [w.Y.id]));
    expect(add).toBeInstanceOf(ForbiddenError);
    // 새 계급은 노출표 줄이 없어 사람 정보를 못 본다 — 이름 없는 문구(M-1).
    expect((add as Error).message).toBe("참여자 더하기 권한 없음");
    expect(await errorOf(removeProjectMember(H, P3, w.people.참여자.id))).toBeInstanceOf(ForbiddenError);
    expect(await memberRows(P3, w.Y.id)).toEqual([]);
    expect((await listMemberCandidates(H, P3, {})).rows).toEqual([]);
  });

  it("같은 업무 범위 전사라도 보는 범위 org_unit이라 참여 없이 P3가 보이면 권리 있음 — 더하기 성공", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await makeRole("role-test-company-work-division-view", "company", "org_unit");
    const H2 = await makePerson("에이치투", "role-test-company-work-division-view", "재무팀");
    expect(await projectMemberRights(H2, P3)).toMatchObject({ canEdit: true, locked: false });
    await expect(addProjectMembers(H2, P3, [w.Y.id])).resolves.toEqual({ added: 1 });
  });

  it("담당 PM 갈래 — 담당 팀 밖에 발령된 PM M(업무 범위 team)은 자기 프로젝트에 더할 수 있다", async () => {
    const w = await buildMembersWorld();
    const M = await makePerson("엠", DEFAULT_ROLE_ID, "재무팀");
    const P4 = (
      await createProject(SYSTEM_VIEWER, { clientId: w.clientId, teamId: w.teams.mgmt, pmUserId: M.id, name: "범위 P4", startDate: "2026-11-01", endDate: "2026-12-31" })
    ).id;
    expect(await projectMemberRights(M, P4)).toMatchObject({ canEdit: true, locked: false });
    await expect(addProjectMembers(M, P4, [w.Y.id])).resolves.toEqual({ added: 1 });
  });

  it("전사 갈래 — 대표(업무 · 보는 범위 전사)는 담당 팀 밖 프로젝트에 더할 수 있다", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    expect(await projectMemberRights(w.people.대표, P3)).toMatchObject({ canEdit: true });
    await expect(addProjectMembers(w.people.대표, P3, [w.Y.id])).resolves.toEqual({ added: 1 });
  });

  it("참여자인 재무팀장(projects.status · period 키 있음, 업무 범위 team)도 P3 상태 전환 · 원장 저장은 ForbiddenError · 값 그대로(D-6213)", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const finLead = await makePerson("재무팀장", TEAM_LEAD_ROLE_ID, "재무팀");
    await addProjectMembers(w.mgmtLead, P3, [finLead.id]);
    expect(await listedIds(finLead)).toContain(P3);
    const status = await errorOf(changeProjectStatus(finLead, P3, { from: "bidding", to: "lost" }));
    expect(status).toBeInstanceOf(UserFacingError);
    expect((status as Error).message).toBe("다른 팀 프로젝트 · 상태 바꾸기 권한 없음");
    const ledger = await errorOf(
      saveProjectLedger(finLead, P3, {
        seenStatus: "bidding",
        period: { startDate: "2026-11-02", endDate: "2026-12-31", baseline: { startDate: "2026-11-01", endDate: "2026-12-31" } },
      }),
    );
    expect(ledger).toBeInstanceOf(UserFacingError);
    expect((ledger as Error).message).toBe("기간 바꾸기 권한 없음");
    const [row] = await db.select({ status: projects.status, startDate: projects.startDate }).from(projects).where(eq(projects.id, P3));
    expect(row).toEqual({ status: "bidding", startDate: "2026-11-01" });
  });
});

describe("검토 반영 I-3 — 잠금 재판정 · 보관 프로젝트", () => {
  it("트랜잭션 전 판정 뒤 · 잠금 전에 완료로 바뀌면 잠긴 행이 막는다 — 잠김 문구 · 줄 0 · 로그 0", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    lockHook.before = () => completeProject(P3);
    const error = await errorOf(addProjectMembers(w.mgmtLead, P3, [w.Y.id]));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe(LOCKED);
    expect(await memberRows(P3, w.Y.id)).toEqual([]);
    expect(await memberLogs(P3)).toEqual([]);
  });

  it("판정 뒤 · 잠금 전에 보관되면 일반 문구 · 줄 0 · 로그 0", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    lockHook.before = () => archiveProjectRow(P3);
    await expect(addProjectMembers(w.mgmtLead, P3, [w.Y.id])).rejects.toThrow(NOT_PROCESSED);
    expect(await memberRows(P3, w.Y.id)).toEqual([]);
    expect(await memberLogs(P3)).toEqual([]);
  });

  it("보관 프로젝트 — 팀장은 범위 밖과 같은 일반 문구 · 보관함을 보는 시스템 관리자도 canEdit 거짓 · 더하기 일반 문구", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const sysadmin = await makePerson("관리자", SYSADMIN_ROLE_ID, "재무팀");
    await archiveProjectRow(P3);
    expect(await projectMemberRights(w.mgmtLead, P3)).toEqual({ canEdit: false, locked: false, pmName: null, hasCandidates: false });
    await expect(addProjectMembers(w.mgmtLead, P3, [w.Y.id])).rejects.toThrow(NOT_PROCESSED);
    expect(await projectMemberRights(sysadmin, P3)).toMatchObject({ canEdit: false, locked: false, hasCandidates: false });
    await expect(addProjectMembers(sysadmin, P3, [w.Y.id])).rejects.toThrow(NOT_PROCESSED);
    expect(await memberRows(P3, w.Y.id)).toEqual([]);
    expect(await memberLogs(P3)).toEqual([]);
  });

  it("listMemberCandidatesAction — 권리자는 후보 · 참여자 Y와 범위 밖 팀PM은 빈 목록", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    session.viewer = w.mgmtLead;
    expect((await listMemberCandidatesAction({ projectId: P3 }))?.data?.rows.map((row) => row.userId)).toEqual([w.people.대표.id]);
    session.viewer = w.Y;
    expect((await listMemberCandidatesAction({ projectId: P3 }))?.data).toEqual({ rows: [], truncated: false });
    session.viewer = w.people.팀PM;
    expect((await listMemberCandidatesAction({ projectId: P3 }))?.data).toEqual({ rows: [], truncated: false });
    expect(ACTION_REGISTRY.find((entry) => entry.name === "listMemberCandidatesAction")).toMatchObject({ menu: "projects.member" });
  });
});

describe("검토 반영 I-1 — 되돌리기는 그 사람의 마지막 기록이 떼기이고 10분 안일 때만", () => {
  it("뗀 지 9분이면 되돌린다 · 11분이면 일반 문구 · 줄은 보관 그대로 · restored 로그 없음", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    await removeProjectMember(w.mgmtLead, P3, w.Y.id);
    const late = new Date(Date.now() + 11 * MINUTE);
    await expect(restoreProjectMember(w.mgmtLead, P3, w.Y.id, { now: () => late })).rejects.toThrow(NOT_PROCESSED);
    expect((await memberRows(P3, w.Y.id)).map((row) => row.archivedAt !== null)).toEqual([true]);
    expect((await memberLogs(P3)).filter((log) => (log.detail as { restored?: string }).restored)).toEqual([]);

    const soon = new Date(Date.now() + 9 * MINUTE);
    await restoreProjectMember(w.mgmtLead, P3, w.Y.id, { now: () => soon });
    expect(await memberRows(P3, w.Y.id)).toEqual([expect.objectContaining({ archivedAt: null })]);
  });

  it("앱 시계가 떼기 기록보다 11분 앞서도(시각이 미래로 읽힘 — DB 세션 시간대 어긋남) 일반 문구 · 줄은 보관 그대로(/review R-1)", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    await removeProjectMember(w.mgmtLead, P3, w.Y.id);
    const behind = new Date(Date.now() - 11 * MINUTE);
    await expect(restoreProjectMember(w.mgmtLead, P3, w.Y.id, { now: () => behind })).rejects.toThrow(NOT_PROCESSED);
    expect((await memberRows(P3, w.Y.id)).map((row) => row.archivedAt !== null)).toEqual([true]);
  });

  it("그 사람 기준이다 — 뒤에 다른 사람을 떼도 Y는 되돌린다 · 떼기 기록 없이 보관된 줄은 되돌리지 않는다", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    await removeProjectMember(w.mgmtLead, P3, w.Y.id);
    await removeProjectMember(w.mgmtLead, P3, w.people.참여자.id);
    await restoreProjectMember(w.mgmtLead, P3, w.Y.id);
    expect(await memberRows(P3, w.Y.id)).toEqual([expect.objectContaining({ archivedAt: null })]);

    // 마지막 기록이 added인 채로 보관된 줄(앱 밖 보관) — 떼기 기록이 아니다.
    await db.update(projectMembers).set({ archivedAt: new Date() }).where(and(eq(projectMembers.projectId, P3), eq(projectMembers.userId, w.Y.id)));
    await addProjectMembers(w.mgmtLead, P3, [w.people.대표.id]);
    await db.update(projectMembers).set({ archivedAt: new Date() }).where(and(eq(projectMembers.projectId, P3), eq(projectMembers.userId, w.people.대표.id)));
    await expect(restoreProjectMember(w.mgmtLead, P3, w.people.대표.id)).rejects.toThrow(NOT_PROCESSED);
    expect((await memberRows(P3, w.people.대표.id)).map((row) => row.archivedAt !== null)).toEqual([true]);
  });

  it("지금 담당 PM은 10분 안이어도 되살리지 않는다(M-5)", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    await removeProjectMember(w.mgmtLead, P3, w.Y.id);
    await db.update(projects).set({ pmUserId: w.Y.id }).where(eq(projects.id, P3));
    await expect(restoreProjectMember(w.mgmtLead, P3, w.Y.id)).rejects.toThrow(NOT_PROCESSED);
    expect((await memberRows(P3, w.Y.id)).map((row) => row.archivedAt !== null)).toEqual([true]);
  });
});

describe("검토 반영 M-1 — 이름은 person.value 투영을 지난다", () => {
  it("사람 정보를 못 보는 계급에게 pmName은 null · 권한 문구에 담당 PM 이름이 없다", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    expect(await projectMemberRights(w.Y, P3)).toMatchObject({ pmName: "X" });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "person.value", visible: false });
    expect(await projectMemberRights(w.Y, P3)).toMatchObject({ pmName: null });
    const error = await errorOf(addProjectMembers(w.Y, P3, [w.people.대표.id]));
    expect((error as Error).message).toBe("참여자 더하기 권한 없음");
  });

  it("사람 정보를 못 보는 권리자의 거부 문구는 이름 대신 사람 수", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const mgmtPerson = await makePerson("경영사원", DEFAULT_ROLE_ID, "경영관리팀");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "person.value", visible: false });
    const error = await errorOf(addProjectMembers(w.mgmtLead, P3, [w.Y.id, mgmtPerson.id]));
    expect((error as Error).message).toBe("1명 더할 수 없음 · 새로 고침");
  });

  it("사람 정보를 못 보는 권리자에게 hasCandidates는 거짓 — 후보 행이 투영에서 다 비어 고를 사람이 없다(PR #189 Codex P2)", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    expect(await projectMemberRights(w.mgmtLead, P3)).toMatchObject({ canEdit: true, hasCandidates: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "person.value", visible: false });
    expect((await listMemberCandidates(w.mgmtLead, P3, {})).rows.every((row) => row.userId === undefined && row.name === undefined)).toBe(true);
    expect(await projectMemberRights(w.mgmtLead, P3)).toMatchObject({ canEdit: true, hasCandidates: false });
    expect(await listProjectMembers(w.mgmtLead, P3)).toMatchObject({ canEdit: true, hasCandidates: false });
  });

  it("/cso M-1(a): 후보 범위(담당 본부 · 대표) 밖 사람 id를 넣으면 이름 대신 사람 수 — 없는 id와 같은 문구", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const elsewhere = await makePerson("다른본부사람", DEFAULT_ROLE_ID, "기획1팀");
    const outside = await errorOf(addProjectMembers(w.mgmtLead, P3, [elsewhere.id]));
    const missing = await errorOf(addProjectMembers(w.mgmtLead, P3, ["00000000-0000-4000-8000-000000000000"]));
    expect((outside as Error).message).toBe("1명 더할 수 없음 · 새로 고침");
    expect((missing as Error).message).toBe("1명 더할 수 없음 · 새로 고침");
  });
});

describe("검토 반영 M-2 · M-3 — 잠근 트랜잭션 안에서 다시 본다", () => {
  it("M-2: 판정 뒤 · 잠금 전에 다른 탭이 같은 사람을 더하면 뒤 요청은 거부 문구 · 줄 하나 · 로그 하나", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    lockHook.before = async () => {
      await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    };
    const error = await errorOf(addProjectMembers(w.mgmtLead, P3, [w.Y.id]));
    expect(error).toBeInstanceOf(UserFacingError);
    expect((error as Error).message).toBe("와이 더할 수 없음 · 새로 고침");
    expect(await memberRows(P3, w.Y.id)).toHaveLength(1);
    expect(await memberLogs(P3)).toHaveLength(1);
  });

  it("M-3: 판정 뒤 · 잠금 전에 담당 팀이 바뀌면 더하기는 일반 문구 · 줄 0 · 로그 0", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    lockHook.before = async () => {
      await db.update(projects).set({ teamId: w.finance }).where(eq(projects.id, P3));
    };
    await expect(addProjectMembers(w.mgmtLead, P3, [w.Y.id])).rejects.toThrow(NOT_PROCESSED);
    expect(await memberRows(P3, w.Y.id)).toEqual([]);
    expect(await memberLogs(P3)).toEqual([]);
  });

  it("M-3: 판정 뒤 · 잠금 전에 담당 PM이 바뀌면 떼기 · 되돌리기도 일반 문구 · 줄 그대로", async () => {
    const w = await buildMembersWorld();
    const P3 = w.projects.P3.id;
    const changePm = (pmUserId: string) => async () => {
      await db.update(projects).set({ pmUserId }).where(eq(projects.id, P3));
    };
    await addProjectMembers(w.mgmtLead, P3, [w.Y.id]);
    lockHook.before = changePm(w.people.대표.id);
    await expect(removeProjectMember(w.mgmtLead, P3, w.Y.id)).rejects.toThrow(NOT_PROCESSED);
    expect((await memberRows(P3, w.Y.id))[0]?.archivedAt).toBeNull();

    await removeProjectMember(w.mgmtLead, P3, w.Y.id);
    lockHook.before = changePm(w.people.X.id);
    await expect(restoreProjectMember(w.mgmtLead, P3, w.Y.id)).rejects.toThrow(NOT_PROCESSED);
    expect((await memberRows(P3, w.Y.id))[0]?.archivedAt).not.toBeNull();
  });
});
