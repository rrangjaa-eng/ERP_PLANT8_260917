import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, fieldDefinitions, roles, visibilityMatrix } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createAccount } from "@/domain/auth/accounts";
import { createFieldDefinition } from "@/domain/custom-fields/admin";
import { createFieldDefinitionInput } from "@/domain/custom-fields/admin-input";
import { insertVisibilityIfAbsent, upsertPermission } from "@/repositories/permissions";
import { insertFieldDefinition, listFieldDefinitions } from "@/repositories/field-definitions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { env } from "@/lib/env";

// 04.5-01: 화면 항목(커스텀 칸) 생성 — 칸 정의 + 전 계급 노출 행이 한 트랜잭션.
const MENU = "admin.field-definitions";

async function createViewer(roleId: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `fd-${randomUUID()}@example.test`,
    name: "통합테스트 화면 항목",
    roleId,
  });
  return { id: userId, roleId };
}

async function countFieldLogs(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actionLog)
    .where(eq(actionLog.entity, "field_definitions"));
  return row?.count ?? 0;
}

async function countVendorVisibilityRows(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visibilityMatrix)
    .where(like(visibilityMatrix.infoItem, "cf.vendor.%"));
  return row?.count ?? 0;
}

async function countFieldDefinitions(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(fieldDefinitions);
  return row?.count ?? 0;
}

const input = (name: string) => ({ name, type: "text" as const, required: false, sortOrder: 1 });

describe("화면 항목 생성 (04.5-01)", () => {
  beforeEach(async () => {
    // 09가 MENUS에 키를 등록하기 전까지 시드가 이 행을 주지 않는다 — 테스트가 명시로 넣는다.
    await upsertPermission(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, menu: MENU, action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, menu: MENU, action: "write", allowed: true });
  });

  it("시스템 관리자가 거래처 칸을 만든다 — 자동 키 · 자른 이름 · version 1 · 보관 안 됨", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);

    const { id, key } = await createFieldDefinition(admin, input("  계약 메모  "));

    const [row] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id));
    expect(row?.entity).toBe("vendor");
    expect(key).toMatch(/^cf_[0-9a-f]{8}$/);
    expect(row?.key).toBe(key);
    expect(row?.label).toBe("계약 메모");
    expect(row?.version).toBe(1);
    expect(row?.archivedAt).toBeNull();
  });

  it("보관 계급을 포함한 전 계급에 보임 노출 행이 하나씩 생기고 로그가 한 줄 남는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const archivedRoleId = `role-fd-archived-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: archivedRoleId, name: `보관 계급 ${archivedRoleId.slice(-8)}`, sortOrder: 90 });
    await setRoleArchived(SYSTEM_VIEWER, archivedRoleId, true);

    const { id, key } = await createFieldDefinition(admin, input("담당 부서"));

    const allRoles = await db.select({ id: roles.id }).from(roles);
    const rows = await db
      .select()
      .from(visibilityMatrix)
      .where(eq(visibilityMatrix.infoItem, `cf.vendor.${key}`));
    expect(rows.map((row) => row.roleId).sort()).toEqual(allRoles.map((role) => role.id).sort());
    expect(rows.every((row) => row.visible)).toBe(true);
    expect(rows.map((row) => row.roleId)).toContain(archivedRoleId);

    const logs = await db.select().from(actionLog).where(eq(actionLog.entity, "field_definitions"));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actionType).toBe("document_create");
    expect(logs[0]?.entityId).toBe(id);
    expect(logs[0]?.detail).toEqual({ key, entity: "vendor" });
  });

  it("세 번째 노출 행 쓰기가 실패하면 칸 정의도 앞의 두 노출 행도 남지 않는다(한 트랜잭션)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const logsBefore = await countFieldLogs();
    let calls = 0;

    await expect(
      createFieldDefinition(admin, input("롤백 칸"), {
        generateKey: () => "cf_0badf00d",
        insertVisibility: async (viewer, row, tx) => {
          calls += 1;
          if (calls === 3) throw new Error("주입한 노출 행 실패");
          await insertVisibilityIfAbsent(viewer, row, tx);
        },
      }),
    ).rejects.toThrow("주입한 노출 행 실패");

    expect(calls).toBe(3);
    const defs = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.label, "롤백 칸"));
    expect(defs).toHaveLength(0);
    const visRows = await db
      .select()
      .from(visibilityMatrix)
      .where(eq(visibilityMatrix.infoItem, "cf.vendor.cf_0badf00d"));
    expect(visRows).toHaveLength(0);
    expect(await countFieldLogs()).toBe(logsBefore);
  });

  it("쓰기 권한이 없는 기획 PM은 「권한 없음」으로 끝나고 아무것도 늘지 않는다", async () => {
    const pm = await createViewer(DEFAULT_ROLE_ID);
    const before = [await countFieldDefinitions(), await countVendorVisibilityRows(), await countFieldLogs()];

    const attempt = createFieldDefinition(pm, input("권한 없는 칸"));
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createFieldDefinition(pm, input("권한 없는 칸"))).rejects.toThrow("권한 없음");

    expect([await countFieldDefinitions(), await countVendorVisibilityRows(), await countFieldLogs()]).toEqual(before);
  });

  it("생성 입력은 대상(entity)과 선택형을 받지 않는다", () => {
    expect(createFieldDefinitionInput.safeParse({ ...input("칸"), entity: "project" }).success).toBe(false);
    expect(createFieldDefinitionInput.safeParse({ ...input("칸"), type: "select" }).success).toBe(false);
    for (const type of ["text", "number", "date"] as const) {
      expect(createFieldDefinitionInput.safeParse({ ...input("칸"), type }).success).toBe(true);
    }
  });

  it("label 없이 insertFieldDefinition을 부르면 label은 key이고, 두 인자 listFieldDefinitions의 정렬은 그대로다", async () => {
    await insertFieldDefinition(SYSTEM_VIEWER, { id: `fd-${randomUUID()}`, entity: "project", key: "zeta", type: "text", sortOrder: 2 });
    await insertFieldDefinition(SYSTEM_VIEWER, { id: `fd-${randomUUID()}`, entity: "project", key: "beta", type: "text", sortOrder: 1 });
    await insertFieldDefinition(SYSTEM_VIEWER, { id: `fd-${randomUUID()}`, entity: "project", key: "alpha", type: "text", sortOrder: 2 });

    const defs = await listFieldDefinitions(SYSTEM_VIEWER, "project");

    expect(defs.map((def) => def.key)).toEqual(["beta", "alpha", "zeta"]);
    expect(defs.map((def) => def.label)).toEqual(["beta", "alpha", "zeta"]);
  });

  // 풀 크기와 같은 수로는 교착이 경합에 달려 있다(첫 보유자가 빠르면 뒤 보유자들 때는 늘 한 칸이
  // 비어 있다 — 실측 67ms 통과). 풀의 두 배를 겹치면 앞 트랜잭션이 돌려준 연결을 대기 중인 BEGIN이
  // 바로 가져가 보유자 차례마다 풀이 찬다 — 계급 목록을 전역 db로 읽으면 매번 교착(실측 5초 뒤 실패).
  it(
    "풀 크기의 두 배를 동시에 만들어도 전부 성공하고 칸마다 전 계급 노출 행이 있다(잠금 보유자가 두 번째 연결을 요구하지 않는다)",
    async () => {
      const admin = await createViewer(SYSADMIN_ROLE_ID);
      const concurrent = env.DB_POOL_MAX * 2;
      const names = Array.from({ length: concurrent }, (_, i) => `동시 칸 ${i}`);

      const created = await Promise.all(names.map((name) => createFieldDefinition(admin, input(name))));

      const [{ count: roleCount } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(roles);
      expect(created).toHaveLength(concurrent);
      expect(await countVendorVisibilityRows()).toBe(concurrent * roleCount);
      for (const { key } of created) {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(visibilityMatrix)
          .where(and(eq(visibilityMatrix.infoItem, `cf.vendor.${key}`), eq(visibilityMatrix.visible, true)));
        expect(row?.count).toBe(roleCount);
      }
    },
    30_000,
  );
});
