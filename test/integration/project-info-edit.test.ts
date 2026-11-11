import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, projects, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { upsertPermission } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { createExpenseFromLines } from "@/domain/expenses";
import { PeriodRejectedError, saveProjectLedger } from "@/domain/projects/ledger";
import { InfoConflictError } from "@/domain/projects/info";
import { setupExpenseProject, testVendorAccount, type ExpenseFixture } from "./fixtures/expenses";
import { grantFundKeys, makeFundPerson, makeFundRole } from "./fixtures/fund-scope";
import { makePerson } from "./approvals-fixtures";

// 07.2-17(PU5 · D-7217~D-7220) — 정보 면 4칸(행사명 · 고객사 · 담당 팀 · 담당 PM)을 합성 저장(saveProjectLedger)의 잠근 tx에서 쓴다.
// 권리 = projects.info 쓰기 + (담당 PM 또는 업무 범위) · 돈 문서가 붙으면 고객사 · 팀 잠김 · PM 자격 재검증 · version 동시 수정 · 전부 저장/전부 거부.

async function row(projectId: string) {
  const [found] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!found) throw new Error("프로젝트 없음");
  return found;
}

async function changeLogs(projectId: string) {
  return db
    .select({ detail: actionLog.detail })
    .from(actionLog)
    .where(and(eq(actionLog.entity, "project"), eq(actionLog.entityId, projectId), eq(actionLog.actionType, "document_update")));
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부될 줄 알았는데 통과했다");
}

async function newClient(): Promise<string> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `새 클라이언트-${randomUUID()}`, normalizedName: `새 클라이언트-${randomUUID()}`, ...testVendorAccount() });
  return client.id;
}

async function teamIdByName(name: string): Promise<string> {
  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, name));
  if (!team) throw new Error(`팀 없음: ${name}`);
  return team.id;
}

async function save(viewer: ExpenseFixture["pm"], fx: ExpenseFixture, info: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const current = await row(fx.projectId);
  return saveProjectLedger(viewer, fx.projectId, {
    seenStatus: current.status as "in_progress",
    info: { baselineVersion: current.version, ...info },
    ...extra,
  });
}

describe("정보 4칸 저장(D-7217 · D-7218)", () => {
  it("담당 PM이 행사명 · PM(같은 팀 사람)을 바꾸면 저장 · version + 1 · 행동 로그에 바뀐 칸만", async () => {
    const fx = await setupExpenseProject();
    const before = await row(fx.projectId);

    const result = await save(fx.pm, fx, { name: "  겨울 팝업  ", pmUserId: fx.otherPm.id });

    expect(result.project.info).toMatchObject({ name: "겨울 팝업", pmUserId: fx.otherPm.id, version: before.version + 1 });
    const after = await row(fx.projectId);
    expect(after).toMatchObject({ name: "겨울 팝업", pmUserId: fx.otherPm.id, version: before.version + 1, clientId: before.clientId, teamId: before.teamId });
    const logs = await changeLogs(fx.projectId);
    expect(logs.at(-1)?.detail).toEqual({ name: { from: "가을 팝업", to: "겨울 팝업" }, pmUserId: { from: fx.pm.id, to: fx.otherPm.id } });
  });

  it("완료 프로젝트도 행사명을 고친다(D-7218)", async () => {
    const fx = await setupExpenseProject();
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const result = await saveProjectLedger(fx.lead, fx.projectId, { seenStatus: "completed", info: { baselineVersion: (await row(fx.projectId)).version, name: "완료 뒤 이름" } });
    expect(result.project.info?.name).toBe("완료 뒤 이름");
  });

  it("돈 문서 0건이면 팀장이 고객사를 바꾼다", async () => {
    const fx = await setupExpenseProject();
    const clientId = await newClient();
    await save(fx.lead, fx, { clientId });
    expect((await row(fx.projectId)).clientId).toBe(clientId);
  });
});

describe("정보 4칸 거부(D-7219 · D-7220 · T-07.2-17-01 · 05)", () => {
  it("지출결의가 붙은 프로젝트의 고객사 변경은 같은 저장의 기간 변경까지 전부 거부 · 칸 오류 `고객사 · 담당 팀 잠김 · 돈 문서 연결`", async () => {
    const fx = await setupExpenseProject();
    expect((await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] })).created).toHaveLength(1);
    const before = await row(fx.projectId);
    const clientId = await newClient();

    const error = await rejection(
      save(fx.lead, fx, { clientId, name: "바뀐 이름" }, { period: { startDate: "2026-09-02", endDate: "2026-12-31", baseline: { startDate: before.startDate, endDate: before.endDate } } }),
    );

    expect(error).toBeInstanceOf(PeriodRejectedError);
    expect((error as PeriodRejectedError).infoErrors).toEqual([{ field: "client", reason: "고객사 · 담당 팀 잠김 · 돈 문서 연결" }]);
    expect(await row(fx.projectId)).toMatchObject({ clientId: before.clientId, name: before.name, startDate: before.startDate, version: before.version });
  });

  it("화면이 읽은 version과 다르면 `다른 사람이 HH:mm에 바꿈 · 새로 고침`(잠근 행 updated_at KST) · 덮어쓰지 않는다", async () => {
    const fx = await setupExpenseProject();
    const stale = (await row(fx.projectId)).version;
    await save(fx.lead, fx, { name: "먼저 저장" });

    const error = await rejection(saveProjectLedger(fx.pm, fx.projectId, { seenStatus: "in_progress", info: { baselineVersion: stale, name: "늦은 저장" } }));

    expect(error).toBeInstanceOf(InfoConflictError);
    expect(error.message).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
    expect((await row(fx.projectId)).name).toBe("먼저 저장");
  });

  it("팀장이 범위 밖 팀으로 옮기면 팀 칸 오류 · 팀만 바꿔 PM이 자격을 잃으면 PM 칸 오류", async () => {
    const fx = await setupExpenseProject();
    const mgmt = await teamIdByName("경영관리팀");
    const outOfScope = await rejection(save(fx.lead, fx, { teamId: mgmt }));
    expect((outOfScope as PeriodRejectedError).infoErrors.map((error) => error.field)).toEqual(["pm", "team"]);

    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    const pmLost = await rejection(save(admin, fx, { teamId: mgmt }));
    expect((pmLost as PeriodRejectedError).infoErrors).toEqual([{ field: "pm", reason: "담당 PM 소속 아님 · PM 다시 고르기" }]);
    expect((await row(fx.projectId)).teamId).not.toBe(mgmt);
  });

  // 같은 팀 사원(업무 범위 = 팀)은 projects.member처럼 권리가 있다(D-7219 「담당 PM + 업무 범위」) — 다른 팀 사원 · 키 없는 계급만 거부.
  it("담당 PM도 업무 범위도 아닌 다른 팀 사원 · projects.info 없는 계급은 거부", async () => {
    const fx = await setupExpenseProject();
    const outsider = await makePerson("다른팀 사원", DEFAULT_ROLE_ID, "경영관리팀");
    expect((await rejection(save(outsider, fx, { name: "남이 바꿈" }))).message).toBe("존재하지 않는 프로젝트");
    await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu: "projects.info", action: "write", allowed: false });
    await rejection(save(fx.lead, fx, { name: "키 없음" }));
    expect((await row(fx.projectId)).name).toBe("가을 팝업");
  });

  it("자금 키로 보기만 넓어진 비팀장(projects.info 켬)은 원래 쓰기 범위 밖 프로젝트 정보를 못 쓴다(`존재하지 않는 프로젝트`)", async () => {
    const fx = await setupExpenseProject();
    const roleId = await makeFundRole("team");
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "write", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects.info", action: "write", allowed: true });
    await grantFundKeys(roleId, ["projects.revenue", "projects.adjustment"], "write");
    const fund = await makeFundPerson("경영관리 사원", roleId, "경영관리팀");
    expect((await rejection(save(fund, fx, { name: "자금 키" }))).message).toBe("존재하지 않는 프로젝트");
    expect((await row(fx.projectId)).name).toBe("가을 팝업");
  });
});
