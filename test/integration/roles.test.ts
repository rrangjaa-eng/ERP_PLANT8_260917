import { randomUUID } from "node:crypto";
import { isNull, eq, and } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { db } from "@/db/client";
import { users, actionLog } from "@/db/schema";
import { listRoles, insertRole, renameRole, findRoleById } from "@/repositories/roles";
import { archive, ProtectedRowError } from "@/domain/archive";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seedMasterData } from "@/domain/seed";
import {
  SEED_ROLES,
  SYSADMIN_ROLE_ID,
  DEFAULT_ROLE_ID,
  ROLE_WORK_SCOPES,
  ForbiddenError,
  createRole,
  setRoleWorkScope,
  listRoles as listRoleDtos,
  type RoleWorkScope,
} from "@/domain/permissions/roles";

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

  it("없는 계급의 업무 범위를 바꾸면 찾을 수 없다고 거부한다", async () => {
    await expect(setRoleWorkScope(SYSTEM_VIEWER, `role-missing-${randomUUID()}`, "company")).rejects.toThrow(
      "계급 찾을 수 없음",
    );
  });
});
