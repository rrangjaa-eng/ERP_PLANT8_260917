import { randomUUID } from "node:crypto";
import { isNull, eq, and } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { db } from "@/db/client";
import { users, actionLog, teams } from "@/db/schema";
import { listRoles, insertRole, renameRole, findRoleById } from "@/repositories/roles";
import { upsertPermission } from "@/repositories/permissions";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { archive, ProtectedRowError } from "@/domain/archive";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seedMasterData } from "@/domain/seed";
import {
  SEED_ROLES,
  SYSADMIN_ROLE_ID,
  DEFAULT_ROLE_ID,
  ROLE_WORK_SCOPES,
  ForbiddenError,
  SelfRoleScopeChangeError,
  createRole,
  setRoleWorkScope,
  setRoleViewScope,
  listRoles as listRoleDtos,
  type RoleViewScope,
  type RoleWorkScope,
} from "@/domain/permissions/roles";
import { rowScopeFor } from "@/domain/permissions/scope-for";

describe("roles (ADMN-08, 실제 Postgres)", () => {
  it("시드 5종이 존재한다", async () => {
    const roles = await listRoles(SYSTEM_VIEWER);
    const ids = roles.map((r) => r.id).sort();
    expect(ids).toEqual([...SEED_ROLES.map((r) => r.id)].sort());
  });

  it("계급을 추가하고 이름을 바꿀 수 있다", async () => {
    const id = `role-test-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id, name: "임시 계급" });
    await renameRole(SYSTEM_VIEWER, id, "바뀐 이름");
    const roles = await listRoles(SYSTEM_VIEWER);
    const row = roles.find((r) => r.id === id);
    expect(row?.name).toBe("바뀐 이름");
  });

  it("같은 이름으로 계급을 두 번 추가하면 두 번째가 거부된다", async () => {
    const name = `중복이름-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: `role-a-${randomUUID()}`, name });
    await expect(insertRole(SYSTEM_VIEWER, { id: `role-b-${randomUUID()}`, name })).rejects.toThrow();
  });

  it("NFD로 적은 같은 한글 이름도 NFC 정규화 후 비교되어 거부된다", async () => {
    const nfc = `한글이름-${randomUUID()}`.normalize("NFC");
    const nfd = nfc.normalize("NFD");
    await insertRole(SYSTEM_VIEWER, { id: `role-nfc-${randomUUID()}`, name: nfc });
    await expect(
      insertRole(SYSTEM_VIEWER, { id: `role-nfd-${randomUUID()}`, name: nfd }),
    ).rejects.toThrow();
  });

  it("시드 계급을 보관하면 거부된다 — 계급이 0개가 되는 상태를 만들 수 없다", async () => {
    await expect(archive(SYSTEM_VIEWER, "roles", "role-pm")).rejects.toBeInstanceOf(ProtectedRowError);
    const roles = await listRoles(SYSTEM_VIEWER);
    expect(roles.some((r) => r.id === "role-pm")).toBe(true);
  });

  // 마이그레이션 0003의 백필 UPDATE 두 문장(Task 1 결정 ④)을 재현해, 계급이
  // 비어 있는 사용자 행이 backfill 뒤 0개가 됨을 증명한다 — 실제 마이그레이션은
  // 이 두 문장을 그대로 쓴다(대상만 role_id IS NULL인 행이라 재실행이 안전하다).
  it("마이그레이션 적용 뒤 계급이 비어 있는 사용자 행이 0개다(백필 규칙 재현)", async () => {
    const insertedAdmin = await db
      .insert(users)
      .values({ id: `legacy-admin-${randomUUID()}`, name: "레거시 관리자", email: `${randomUUID()}@test.local`, isAdmin: true })
      .returning();
    const insertedStaff = await db
      .insert(users)
      .values({ id: `legacy-staff-${randomUUID()}`, name: "레거시 직원", email: `${randomUUID()}@test.local`, isAdmin: false })
      .returning();
    const adminLegacy = insertedAdmin[0];
    const staffLegacy = insertedStaff[0];
    if (!adminLegacy || !staffLegacy) throw new Error("픽스처 insert가 행을 반환하지 않았습니다.");

    expect(adminLegacy.roleId).toBeNull();
    expect(staffLegacy.roleId).toBeNull();

    await db
      .update(users)
      .set({ roleId: SYSADMIN_ROLE_ID })
      .where(and(eq(users.isAdmin, true), isNull(users.roleId)));
    await db
      .update(users)
      .set({ roleId: DEFAULT_ROLE_ID })
      .where(and(eq(users.isAdmin, false), isNull(users.roleId)));

    const emptyRoleCount = await db.select().from(users).where(isNull(users.roleId));
    expect(emptyRoleCount.length).toBe(0);

    const [refreshedAdmin] = await db.select().from(users).where(eq(users.id, adminLegacy.id));
    const [refreshedStaff] = await db.select().from(users).where(eq(users.id, staffLegacy.id));
    expect(refreshedAdmin?.roleId).toBe(SYSADMIN_ROLE_ID);
    expect(refreshedStaff?.roleId).toBe(DEFAULT_ROLE_ID);
  });
});

// CSO-1(사용자 결정 2026-10-08 「막기」): admin.people 쓰기를 가진 사람도 자기 계급의 범위는 바꿀 수 없다 —
// changePersonRole의 자기 가드와 같은 줄. 다른 계급은 그대로 바꿀 수 있어야 한다.
async function makePeopleAdmin(): Promise<Viewer> {
  const role = await createRole(SYSTEM_VIEWER, { name: `인사담당-${randomUUID()}` });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.people", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.people", action: "write", allowed: true });
  return makePerson("인사 담당", role.id, null);
}

async function roleLogCount(roleId: string): Promise<number> {
  const logs = await db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.entity, "roles"), eq(actionLog.entityId, roleId), eq(actionLog.actionType, "permission_change")));
  return logs.length;
}

// 04-27(D11·D20): 계급 업무 범위는 데이터다 — 상태 전환·기간 수정 게이트(04-20·
// 04-21·04-22)가 읽는 입력일 뿐 보기 권한이 아니다.
describe("계급 업무 범위(D11·D20)", () => {
  const PM_VIEWER: Viewer = { id: "pm-viewer", roleId: DEFAULT_ROLE_ID };

  async function workScopeOf(id: string): Promise<string | undefined> {
    return (await findRoleById(SYSTEM_VIEWER, id))?.workScope;
  }

  it("빈 DB에 시드를 돌리면 팀장·기획 PM은 team, 본부 책임자·대표·시스템 관리자는 company다", async () => {
    const dtos = await listRoleDtos(SYSTEM_VIEWER);
    const scopes = Object.fromEntries(dtos.map((role) => [role.id, role.workScope]));
    expect(scopes).toEqual({
      "role-team-lead": "team",
      "role-pm": "team",
      "role-division-head": "company",
      "role-ceo": "company",
      "role-sysadmin": "company",
    });
  });

  it("시스템 관리자가 팀장을 company로 바꾸면 DB 값이 바뀌고 permission_change 로그 한 줄이 from·to를 남긴다", async () => {
    await setRoleWorkScope(SYSTEM_VIEWER, "role-team-lead", "company");

    expect(await workScopeOf("role-team-lead")).toBe("company");
    const logs = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entity, "roles"), eq(actionLog.entityId, "role-team-lead")));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actionType).toBe("permission_change");
    expect(logs[0]?.detail).toEqual({ workScope: { from: "team", to: "company" } });
  });

  it("admin.people 쓰기가 없는 기획 PM의 변경은 거부되고 DB 값이 그대로다", async () => {
    await expect(setRoleWorkScope(PM_VIEWER, "role-team-lead", "company")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await workScopeOf("role-team-lead")).toBe("team");
  });

  it("관리자가 바꾼 뒤 시드를 다시 돌려도 바꾼 값이 덮이지 않는다", async () => {
    await setRoleWorkScope(SYSTEM_VIEWER, "role-team-lead", "company");
    await seedMasterData(SYSTEM_VIEWER);
    expect(await workScopeOf("role-team-lead")).toBe("company");
  });

  it("createRole로 만든 새 계급의 업무 범위는 team이다", async () => {
    const role = await createRole(SYSTEM_VIEWER, { name: `새 계급-${randomUUID()}` });
    expect(role.workScope).toBe("team");
    expect(await workScopeOf(role.id)).toBe("team");
  });

  it("두 값 밖의 값(all)은 액션 스키마가 거부하고, domain 직접 호출은 DB CHECK가 거부한다", async () => {
    expect(z.enum(ROLE_WORK_SCOPES).safeParse("all").success).toBe(false);

    const outOfRange: string = "all";
    await expect(
      setRoleWorkScope(SYSTEM_VIEWER, "role-team-lead", outOfRange as RoleWorkScope),
    ).rejects.toThrow();
    expect(await workScopeOf("role-team-lead")).toBe("team");
  });

  it("자기 계급의 업무 범위는 바꿀 수 없고(값·로그 그대로), 다른 계급은 바꿀 수 있다(CSO-1)", async () => {
    const hr = await makePeopleAdmin();
    const ownRole = hr.roleId ?? "";
    const logsBefore = await roleLogCount(ownRole);

    await expect(setRoleWorkScope(hr, ownRole, "company")).rejects.toBeInstanceOf(SelfRoleScopeChangeError);
    expect(await workScopeOf(ownRole)).toBe("team");
    expect(await roleLogCount(ownRole)).toBe(logsBefore);

    await setRoleWorkScope(hr, "role-team-lead", "company");
    expect(await workScopeOf("role-team-lead")).toBe("company");
  });

  it("없는 계급의 업무 범위를 바꾸면 찾을 수 없다고 거부한다", async () => {
    await expect(setRoleWorkScope(SYSTEM_VIEWER, `role-missing-${randomUUID()}`, "company")).rejects.toThrow(
      "계급 찾을 수 없음",
    );
  });
});

// 06.2(D-6201 · 성공 기준 4): 계급 보는 범위 바꾸기 — 다음 요청(새 viewer 객체)의 rowScopeFor가 새 값을 쓴다.
describe("계급 보는 범위(06.2 D-6201)", () => {
  const PM_VIEWER: Viewer = { id: "pm-viewer", roleId: DEFAULT_ROLE_ID };

  async function viewScopeOf(id: string): Promise<string | undefined> {
    return (await findRoleById(SYSTEM_VIEWER, id))?.viewScope;
  }

  it("관리자가 기획 PM을 company로 바꾸면 그 계급 사람의 새 viewer가 전 행을, 다시 own으로 바꾸면 본인만 본다", async () => {
    await setRoleViewScope(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "company");
    expect((await rowScopeFor({ id: "pm-person", roleId: DEFAULT_ROLE_ID }, "project")).rows).toBe("all");

    await setRoleViewScope(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "own");
    expect(await rowScopeFor({ id: "pm-person", roleId: DEFAULT_ROLE_ID }, "project")).toMatchObject({
      rows: "limited",
      by: { kind: "own" },
    });
  });

  it("admin.people 쓰기가 없으면 ForbiddenError, 없는 계급 · 네 값 밖은 거부되고 DB 값이 그대로다", async () => {
    await expect(setRoleViewScope(PM_VIEWER, "role-team-lead", "company")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setRoleViewScope(SYSTEM_VIEWER, `role-missing-${randomUUID()}`, "company")).rejects.toThrow(
      "계급 찾을 수 없음",
    );
    const outOfRange: string = "step";
    await expect(setRoleViewScope(SYSTEM_VIEWER, "role-team-lead", outOfRange as RoleViewScope)).rejects.toThrow(
      "보는 범위 값 없음",
    );
    expect(await viewScopeOf("role-team-lead")).toBe("team");
  });

  it("바꾸면 permission_change 로그 한 줄이 detail { viewScope: { from, to } }를 남긴다", async () => {
    await setRoleViewScope(SYSTEM_VIEWER, "role-team-lead", "company");

    expect(await viewScopeOf("role-team-lead")).toBe("company");
    const logs = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entity, "roles"), eq(actionLog.entityId, "role-team-lead")));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actionType).toBe("permission_change");
    expect(logs[0]?.detail).toEqual({ viewScope: { from: "team", to: "company" } });
  });

  it("자기 계급의 보는 범위는 바꿀 수 없고(값·로그 그대로), 다른 계급은 바꿀 수 있다(CSO-1)", async () => {
    const hr = await makePeopleAdmin();
    const ownRole = hr.roleId ?? "";
    const logsBefore = await roleLogCount(ownRole);

    await expect(setRoleViewScope(hr, ownRole, "company")).rejects.toBeInstanceOf(SelfRoleScopeChangeError);
    expect(await viewScopeOf(ownRole)).toBe("team");
    expect(await roleLogCount(ownRole)).toBe(logsBefore);

    await setRoleViewScope(hr, "role-team-lead", "company");
    expect(await viewScopeOf("role-team-lead")).toBe("company");
  });

  it("새로 만든 계급의 보는 범위는 업무 범위를 복사한다(K1)", async () => {
    const company = await createRole(SYSTEM_VIEWER, { name: `전사계급-${randomUUID()}`, workScope: "company" });
    expect(await viewScopeOf(company.id)).toBe("company");
    const team = await createRole(SYSTEM_VIEWER, { name: `팀계급-${randomUUID()}` });
    expect(await viewScopeOf(team.id)).toBe("team");
  });

  it("팀 발령 있는 사람은 team이면 그 팀 id로, org_unit으로 바꾸면 그 팀의 본부 id로 limited다", async () => {
    const role = await createRole(SYSTEM_VIEWER, { name: `행범위-${randomUUID()}` });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    const person = await makePerson("행범위 확인", role.id, "기획1팀");
    const teamId = await teamIdByName("기획1팀");
    const [team] = await db.select({ orgUnitId: teams.orgUnitId }).from(teams).where(eq(teams.id, teamId));
    expect(team?.orgUnitId).toBeTruthy();

    expect(await rowScopeFor({ ...person }, "project")).toMatchObject({
      rows: "limited",
      viewerId: person.id,
      by: { kind: "team", teamId },
    });

    await setRoleViewScope(SYSTEM_VIEWER, role.id, "org_unit");
    expect(await rowScopeFor({ ...person }, "project")).toMatchObject({
      rows: "limited",
      viewerId: person.id,
      by: { kind: "org_unit", orgUnitId: team?.orgUnitId },
    });
  });
});
