import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, fieldDefinitions, projects, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { PeriodRejectedError, saveProjectLedger } from "@/domain/projects/ledger";
import { InfoConflictError } from "@/domain/projects/info";
import { ARCHIVED_OPTION_MESSAGE, REQUIRED_VALUE_EMPTY_MESSAGE } from "@/domain/custom-fields/preserve";
import { seedCustomFieldDefinition } from "@/test/support/custom-fields";

// 07.5-02(D-7506 · D-7507 · D-7516 · D-7520 · eng P1-2 · r2 N3) — 정보 면 「고치기」의 추가 칸은 07.2-17 정보 저장(잠근 tx ·
// projects.version) 안에서 update 모드로 저장된다. 숨은 · 보관 칸 저장값은 남고, 응답에는 이 사람의 입력 칸 값만 실린다.

type Menu = { menu: string; action: "view" | "write" };
const EDITOR_MENUS: Menu[] = [
  { menu: "projects", action: "view" },
  { menu: "projects", action: "write" },
  { menu: "projects.info", action: "write" },
  { menu: "projects.period", action: "write" },
];

async function makeViewer(menus: Menu[] = EDITOR_MENUS, infoItems: string[] = ["project.value"]): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `정보 추가 칸-${randomUUID()}`, workScope: "company", viewScope: "company" });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `picf-${randomUUID()}@example.test`, name: "정보 추가 칸 사람", roleId: role.id });
  for (const entry of menus) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: entry.menu, action: entry.action, allowed: true });
  for (const infoItem of infoItems) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return { id: userId, roleId: role.id };
}

function roleOf(viewer: Viewer): string {
  if (!viewer.roleId) throw new Error("계급 없음");
  return viewer.roleId;
}

async function row(projectId: string) {
  const [found] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!found) throw new Error("프로젝트 없음");
  return found;
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부될 줄 알았는데 통과했다");
}

async function save(viewer: Viewer, projectId: string, info: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const current = await row(projectId);
  return saveProjectLedger(viewer, projectId, {
    seenStatus: current.status as "bidding",
    info: { baselineVersion: current.version, ...info },
    ...extra,
  });
}

// A = 담당 PM(X · Y · Z · R · W 보임), B = Y · R · W만 보임, 칸 정의: X 텍스트 · Y 선택(보관 선택지 「옛」 · 「옛2」) · Z 보관 칸 ·
// R 필수(값 있음) · W 필수(값 없음). 저장값은 DB에 직접 둔다.
async function setup() {
  const a = await makeViewer();
  const b = await makeViewer();
  const both = [roleOf(a), roleOf(b)];
  const x = await seedCustomFieldDefinition("project", { label: "엑스 칸", type: "text", sortOrder: 1 }, { visibleRoleIds: [roleOf(a)] });
  const y = await seedCustomFieldDefinition("project", { label: "와이 칸", type: "select", options: ["가", "나"], sortOrder: 2 }, { visibleRoleIds: both });
  const z = await seedCustomFieldDefinition("project", { label: "제트 칸", type: "text", sortOrder: 3 }, { visibleRoleIds: both });
  const r = await seedCustomFieldDefinition("project", { label: "필수 값 있음", type: "text", required: true, sortOrder: 4 }, { visibleRoleIds: both });
  const w = await seedCustomFieldDefinition("project", { label: "필수 값 없음", type: "text", required: true, sortOrder: 5 }, { visibleRoleIds: both });
  await db.update(fieldDefinitions).set({ archivedOptions: ["옛", "옛2"] }).where(and(eq(fieldDefinitions.entity, "project"), eq(fieldDefinitions.key, y.key)));
  await db.update(fieldDefinitions).set({ archivedAt: new Date() }).where(and(eq(fieldDefinitions.entity, "project"), eq(fieldDefinitions.key, z.key)));

  const client = await insertVendor(SYSTEM_VIEWER, { name: `고객사-${randomUUID()}`, normalizedName: `고객사-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: a.id, name: `정보 추가 칸-${randomUUID()}` });
  await db
    .update(projects)
    .set({ customFields: { [x.key]: "엑스 저장값", [y.key]: "옛", [z.key]: "제트 저장값", [r.key]: "필수 저장값" } })
    .where(eq(projects.id, created.id));
  return { a, b, projectId: created.id, keys: { x: x.key, y: y.key, z: z.key, r: r.key, w: w.key } };
}

describe("정보 면 추가 칸 저장(D-7506 · D-7507 · D-7520)", () => {
  it("담당 PM이 X를 고치면 저장 · version + 1 · 응답에 새 값", async () => {
    const fx = await setup();
    const before = await row(fx.projectId);

    const result = await save(fx.a, fx.projectId, { customFields: { [fx.keys.x]: "엑스 새 값" } });

    const after = await row(fx.projectId);
    expect(after.version).toBe(before.version + 1);
    expect(after.customFields).toMatchObject({ [fx.keys.x]: "엑스 새 값", [fx.keys.y]: "옛", [fx.keys.z]: "제트 저장값" });
    expect(result.project.info?.version).toBe(before.version + 1);
    expect(result.project.info?.customFields?.[fx.keys.x]).toBe("엑스 새 값");
  });

  it("X가 안 보이는 B가 Y만 고치면 X · 보관 칸 Z 저장값이 그대로이고 응답에는 X · Z 값이 없다(eng P1-2)", async () => {
    const fx = await setup();

    const result = await save(fx.b, fx.projectId, { customFields: { [fx.keys.y]: "가" } });

    expect((await row(fx.projectId)).customFields).toMatchObject({ [fx.keys.x]: "엑스 저장값", [fx.keys.y]: "가", [fx.keys.z]: "제트 저장값" });
    const json = JSON.stringify(result);
    expect(json).not.toContain("엑스 저장값");
    expect(json).not.toContain("제트 저장값");
    expect(result.project.info?.customFields?.[fx.keys.y]).toBe("가");
    expect(Object.keys(result.project.info?.customFields ?? {})).not.toContain(fx.keys.x);
  });

  it("저장값이 보관 선택지면 같은 값은 통과, 다른 보관 선택지는 「보관된 선택지 · 다른 선택지 고르기」", async () => {
    const fx = await setup();
    await save(fx.b, fx.projectId, { customFields: { [fx.keys.y]: "옛" } });
    expect((await row(fx.projectId)).customFields).toMatchObject({ [fx.keys.y]: "옛" });

    const error = await rejection(save(fx.b, fx.projectId, { customFields: { [fx.keys.y]: "옛2" } }));
    expect(error).toBeInstanceOf(PeriodRejectedError);
    expect((error as PeriodRejectedError).infoErrors).toEqual([{ field: `customFields.${fx.keys.y}`, reason: ARCHIVED_OPTION_MESSAGE }]);
  });

  it("값이 있던 필수 칸을 지우면 칸 오류 · 저장값이 빈 필수 칸은 안 보내면 통과(D-7507)", async () => {
    const fx = await setup();
    const error = await rejection(save(fx.b, fx.projectId, { customFields: { [fx.keys.r]: "" } }));
    expect((error as PeriodRejectedError).infoErrors).toEqual([{ field: `customFields.${fx.keys.r}`, reason: REQUIRED_VALUE_EMPTY_MESSAGE }]);

    await save(fx.b, fx.projectId, { customFields: { [fx.keys.y]: "나" } });
    expect((await row(fx.projectId)).customFields).toMatchObject({ [fx.keys.y]: "나", [fx.keys.r]: "필수 저장값" });
  });

  it("추가 칸 오류는 같은 저장의 기간 변경까지 전부 되돌린다", async () => {
    const fx = await setup();
    const before = await row(fx.projectId);
    const error = await rejection(
      save(fx.a, fx.projectId, { customFields: { [fx.keys.r]: "  " } }, { period: { startDate: "2027-01-01", endDate: "2027-01-31", baseline: { startDate: before.startDate, endDate: before.endDate } } }),
    );
    expect(error).toBeInstanceOf(PeriodRejectedError);
    const after = await row(fx.projectId);
    expect({ startDate: after.startDate, endDate: after.endDate, version: after.version }).toEqual({ startDate: before.startDate, endDate: before.endDate, version: before.version });
  });

  it("화면이 읽은 version과 다르면 동시 수정 거부 · 덮어쓰지 않는다(D-7520)", async () => {
    const fx = await setup();
    const stale = (await row(fx.projectId)).version;
    await save(fx.a, fx.projectId, { customFields: { [fx.keys.x]: "먼저" } });

    const error = await rejection(
      saveProjectLedger(fx.a, fx.projectId, { seenStatus: "bidding", info: { baselineVersion: stale, customFields: { [fx.keys.x]: "늦게" } } }),
    );
    expect(error).toBeInstanceOf(InfoConflictError);
    expect((await row(fx.projectId)).customFields).toMatchObject({ [fx.keys.x]: "먼저" });
  });

  it("projects.info 쓰기가 없는 사람은 추가 칸을 쓰지 못한다(D-7516)", async () => {
    const fx = await setup();
    const staff = await makeViewer([
      { menu: "projects", action: "view" },
      { menu: "projects", action: "write" },
    ]);
    await rejection(save(staff, fx.projectId, { customFields: { [fx.keys.y]: "가" } }));
    expect((await row(fx.projectId)).customFields).toMatchObject({ [fx.keys.y]: "옛" });
  });

  it("행동 로그 changed에 바뀐 추가 칸 키는 있고 값 글자는 없다", async () => {
    const fx = await setup();
    await save(fx.a, fx.projectId, { customFields: { [fx.keys.x]: "로그에 없을 값" } });
    const logs = await db
      .select({ detail: actionLog.detail })
      .from(actionLog)
      .where(and(eq(actionLog.entity, "project"), eq(actionLog.entityId, fx.projectId), eq(actionLog.actionType, "document_update")));
    const json = JSON.stringify(logs.at(-1)?.detail);
    expect(json).toContain(fx.keys.x);
    expect(json).not.toContain("로그에 없을 값");
  });

  it("project.value가 꺼진 계급이 추가 칸을 실어 보내면 저장값 그대로 · 응답 추가 칸 키 0(eng r2 N3)", async () => {
    const fx = await setup();
    const off = await makeViewer(EDITOR_MENUS, []);
    await upsertVisibility(SYSTEM_VIEWER, { roleId: roleOf(off), infoItem: `cf.project.${fx.keys.y}`, visible: true });

    const result = await save(off, fx.projectId, { customFields: { [fx.keys.y]: "가" } });

    expect((await row(fx.projectId)).customFields).toMatchObject({ [fx.keys.y]: "옛" });
    expect(Object.keys(result.project.info?.customFields ?? {})).toHaveLength(0);
    const json = JSON.stringify(result);
    for (const stored of ["엑스 저장값", "제트 저장값", "필수 저장값"]) expect(json).not.toContain(stored);
  });
});
