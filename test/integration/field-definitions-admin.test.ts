import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, fieldDefinitions, roles, visibilityMatrix } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createAccount } from "@/domain/auth/accounts";
import {
  createFieldDefinition,
  DuplicateFieldNameError,
  FIELD_DEFINITION_ADMIN_DTO_FIELDS,
  FieldDefinitionArchivedError,
  FieldDefinitionConflictError,
  FieldDefinitionNotFoundError,
  listFieldDefinitionsForAdmin,
  updateFieldDefinition,
} from "@/domain/custom-fields/admin";
import {
  createFieldDefinitionInput,
  FIELD_DEFINITION_CONFLICT_CAUSE,
  OPTIONS_ZERO_CAUSE,
} from "@/domain/custom-fields/admin-input";
import {
  FIELD_DEFINITION_ARCHIVED_CAUSE,
  FIELD_DEFINITION_NOT_FOUND_CAUSE,
  PERMISSION_DENIED_CAUSE,
} from "@/lib/actions/form-reason";
import { insertVisibilityIfAbsent } from "@/repositories/permissions";
import { insertFieldDefinition, listFieldDefinitions } from "@/repositories/field-definitions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { env } from "@/lib/env";

// 04.5-01: 화면 항목(커스텀 칸) 생성 — 칸 정의 + 전 계급 노출 행이 한 트랜잭션.
// 시스템 관리자의 admin.field-definitions view·write는 시드가 준다(04.5-09) — 권한 행을 따로 넣지 않는다.

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

  it("선택형을 만들면 options는 활성 배열 그대로이고 archived_options는 []이다 · 비선택형은 options null", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);

    const { id } = await createFieldDefinition(admin, { ...input("계약 유형 선택"), type: "select", options: ["기본", "특약"] });
    const { id: textId } = await createFieldDefinition(admin, input("계약 메모 텍스트"));

    const [row] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id));
    expect(row?.type).toBe("select");
    expect(row?.options).toEqual(["기본", "특약"]);
    expect(row?.archivedOptions).toEqual([]);
    const [textRow] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, textId));
    expect(textRow?.options).toBeNull();
  });

  it("선택형인데 선택지가 0개이거나 31개이면 domain이 거부하고 아무것도 늘지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const before = [await countFieldDefinitions(), await countVendorVisibilityRows(), await countFieldLogs()];

    await expect(createFieldDefinition(admin, { ...input("빈 선택"), type: "select", options: [] })).rejects.toThrow();
    await expect(createFieldDefinition(admin, { ...input("없는 선택"), type: "select" })).rejects.toThrow();
    const many = Array.from({ length: 31 }, (_, i) => `선택${i}`);
    await expect(createFieldDefinition(admin, { ...input("많은 선택"), type: "select", options: many })).rejects.toThrow();

    expect([await countFieldDefinitions(), await countVendorVisibilityRows(), await countFieldLogs()]).toEqual(before);
  });

  it("생성 입력은 대상(entity)을 받지 않고 선택형은 선택지가 있어야 한다", () => {
    expect(createFieldDefinitionInput.safeParse({ ...input("칸"), entity: "project" }).success).toBe(false);
    expect(createFieldDefinitionInput.safeParse({ ...input("칸"), type: "select" }).success).toBe(false);
    expect(createFieldDefinitionInput.safeParse({ ...input("칸"), type: "select", options: ["기본"] }).success).toBe(true);
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

  it("첫 키가 기존 거래처 칸 키와 부딪히면 새 키로 다시 열어 성공하고 노출 행은 새 키로만 있다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    await insertFieldDefinition(SYSTEM_VIEWER, { id: `fd-${randomUUID()}`, entity: "vendor", key: "cf_aaaaaaaa", type: "text" });
    const keys = ["cf_aaaaaaaa", "cf_bbbbbbbb"];

    const { key } = await createFieldDefinition(admin, input("충돌 뒤 칸"), { generateKey: () => keys.shift() ?? "cf_cccccccc" });

    expect(key).toBe("cf_bbbbbbbb");
    const [def] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.label, "충돌 뒤 칸"));
    expect(def?.key).toBe("cf_bbbbbbbb");
    expect(await db.select().from(visibilityMatrix).where(eq(visibilityMatrix.infoItem, "cf.vendor.cf_aaaaaaaa"))).toHaveLength(0);
    const [{ count: roleCount } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(roles);
    expect(await db.select().from(visibilityMatrix).where(eq(visibilityMatrix.infoItem, "cf.vendor.cf_bbbbbbbb"))).toHaveLength(roleCount);
  });

  it("세 번 모두 기존 키와 부딪히면 오류로 끝나고 칸 정의 · 노출 행 · 로그가 늘지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    await insertFieldDefinition(SYSTEM_VIEWER, { id: `fd-${randomUUID()}`, entity: "vendor", key: "cf_aaaaaaaa", type: "text" });
    const before = [await countFieldDefinitions(), await countVendorVisibilityRows(), await countFieldLogs()];
    let generated = 0;

    await expect(
      createFieldDefinition(admin, input("늘 충돌 칸"), {
        generateKey: () => {
          generated += 1;
          return "cf_aaaaaaaa";
        },
      }),
    ).rejects.toThrow();

    expect(generated).toBe(3);
    expect([await countFieldDefinitions(), await countVendorVisibilityRows(), await countFieldLogs()]).toEqual(before);
  });
});

// 04.5-08: 이름 예약 · domain 재판정 · 관리 목록(검토된 DTO).
describe("화면 항목 이름 예약 · 관리 목록 (04.5-08)", () => {
  const uniqueName = (prefix: string) => `${prefix}${randomUUID().slice(0, 6)}`;

  async function insertArchivedVendorField(label: string): Promise<string> {
    const id = `fd-${randomUUID()}`;
    await insertFieldDefinition(SYSTEM_VIEWER, { id, entity: "vendor", key: `cf_${randomUUID().slice(0, 8)}`, label, type: "text" });
    await db.update(fieldDefinitions).set({ archivedAt: new Date() }).where(eq(fieldDefinitions.id, id));
    return id;
  }

  async function countByLabel(label: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fieldDefinitions)
      .where(eq(fieldDefinitions.label, label));
    return row?.count ?? 0;
  }

  it("기획 PM의 거부 메시지는 폼이 비교하는 PERMISSION_DENIED_CAUSE와 같다", async () => {
    const pm = await createViewer(DEFAULT_ROLE_ID);
    await expect(createFieldDefinition(pm, input(uniqueName("권한")))).rejects.toThrow(
      new ForbiddenError(PERMISSION_DENIED_CAUSE).message,
    );
  });

  it("이름 앞뒤 공백을 잘라 활성 칸과 같은 이름이면 활성 충돌로 거부하고 아무것도 늘지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const name = uniqueName("활성칸");
    await createFieldDefinition(admin, input(name));
    const before = [await countFieldDefinitions(), await countVendorVisibilityRows(), await countFieldLogs()];

    const attempt = createFieldDefinition(admin, input(`  ${name}  `));

    await expect(attempt).rejects.toBeInstanceOf(DuplicateFieldNameError);
    await expect(attempt).rejects.toMatchObject({ archived: false });
    expect([await countFieldDefinitions(), await countVendorVisibilityRows(), await countFieldLogs()]).toEqual(before);
  });

  it("보관된 칸과 같은 이름이면 보관 충돌로 거부하고 아무것도 늘지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const name = uniqueName("보관칸");
    await insertArchivedVendorField(name);
    const before = [await countFieldDefinitions(), await countVendorVisibilityRows(), await countFieldLogs()];

    const attempt = createFieldDefinition(admin, input(name));

    await expect(attempt).rejects.toBeInstanceOf(DuplicateFieldNameError);
    await expect(attempt).rejects.toMatchObject({ archived: true });
    expect([await countFieldDefinitions(), await countVendorVisibilityRows(), await countFieldLogs()]).toEqual(before);
  });

  it("이름 조회와 쓰기 사이 경합으로 unique 위반이 나면 같은 DuplicateFieldNameError로 바뀐다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const name = uniqueName("경합칸");
    await createFieldDefinition(admin, input(name));

    const attempt = createFieldDefinition(admin, input(name), { findNameConflict: () => Promise.resolve(null) });

    await expect(attempt).rejects.toBeInstanceOf(DuplicateFieldNameError);
    await expect(attempt).rejects.toMatchObject({ archived: false });
    expect(await countByLabel(name)).toBe(1);
  });

  it("액션을 거치지 않고 21자 이름이나 정렬 1000을 주면 domain이 거부한다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const before = await countFieldDefinitions();

    await expect(createFieldDefinition(admin, input("가".repeat(21)))).rejects.toThrow();
    await expect(createFieldDefinition(admin, { ...input(uniqueName("범위")), sortOrder: 1000 })).rejects.toThrow();
    await expect(createFieldDefinition(admin, input("   "))).rejects.toThrow();

    expect(await countFieldDefinitions()).toBe(before);
  });

  it("관리 목록은 시스템 관리자에게 거래처 정의 전부(보관 포함)를 sortOrder · key 순으로 돌려준다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const activeName = uniqueName("목록활성");
    const archivedName = uniqueName("목록보관");
    await createFieldDefinition(admin, { ...input(activeName), sortOrder: 7 });
    await insertArchivedVendorField(archivedName);
    await insertFieldDefinition(SYSTEM_VIEWER, { id: `fd-${randomUUID()}`, entity: "project", key: `cf_pj${randomUUID().slice(0, 6)}`, type: "text" });

    const list = await listFieldDefinitionsForAdmin(admin);

    expect(list.find((dto) => dto.label === activeName)?.archived).toBe(false);
    expect(list.find((dto) => dto.label === archivedName)?.archived).toBe(true);
    const sortKeys = list.map((dto) => [dto.sortOrder, dto.key] as const);
    expect(sortKeys).toEqual([...sortKeys].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])));
    const expected = await listFieldDefinitions(admin, "vendor");
    expect(list.map((dto) => dto.id)).toEqual(expected.map((row) => row.id));
    for (const dto of list) {
      expect(Object.keys(dto).sort()).toEqual([...FIELD_DEFINITION_ADMIN_DTO_FIELDS].sort());
    }
  });

  it("관리 목록은 쓰기·보기 권한이 없는 기획 PM에게 ForbiddenError다", async () => {
    const pm = await createViewer(DEFAULT_ROLE_ID);
    await expect(listFieldDefinitionsForAdmin(pm)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// 04.5-02: 칸 수정 — 버전 조건부 갱신 · 보관 먼저 판정 · 타입 불변 · 이름 예약(자기 제외).
describe("화면 항목 수정 (04.5-02)", () => {
  const uniqueName = (prefix: string) => `${prefix}${randomUUID().slice(0, 6)}`;

  async function readRow(id: string) {
    const [row] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id));
    if (!row) throw new Error("행이 없다");
    return row;
  }

  async function countUpdateLogs(id: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(actionLog)
      .where(and(eq(actionLog.entity, "field_definitions"), eq(actionLog.entityId, id), eq(actionLog.actionType, "document_update")));
    return row?.count ?? 0;
  }

  const edit = (id: string, version: number, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    version,
    name,
    required: false,
    sortOrder: 1,
    ...extra,
  });

  it("이름을 바꾸면 key · type · 노출 행이 그대로이고 label만 바뀌며 version이 1 오르고 로그가 한 줄 남는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { id, key } = await createFieldDefinition(admin, input(uniqueName("수정전")));
    const visibilityBefore = await db.select().from(visibilityMatrix).where(eq(visibilityMatrix.infoItem, `cf.vendor.${key}`));
    const newName = uniqueName("수정후");

    await updateFieldDefinition(admin, edit(id, 1, `  ${newName}  `, { required: true, sortOrder: 7 }));

    const row = await readRow(id);
    expect(row.label).toBe(newName);
    expect(row.key).toBe(key);
    expect(row.type).toBe("text");
    expect(row.required).toBe(true);
    expect(row.sortOrder).toBe(7);
    expect(row.version).toBe(2);
    const visibilityAfter = await db.select().from(visibilityMatrix).where(eq(visibilityMatrix.infoItem, `cf.vendor.${key}`));
    expect(visibilityAfter).toHaveLength(visibilityBefore.length);
    expect(await countUpdateLogs(id)).toBe(1);
  });

  it("같은 version으로 두 번 저장하면 두 번째가 충돌로 거부되고 행은 첫 저장 그대로이며, 새 version으로는 통과한다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { id } = await createFieldDefinition(admin, input(uniqueName("충돌")));
    const first = uniqueName("첫저장");
    await updateFieldDefinition(admin, edit(id, 1, first));

    const second = updateFieldDefinition(admin, edit(id, 1, uniqueName("둘째저장")));

    await expect(second).rejects.toBeInstanceOf(FieldDefinitionConflictError);
    await expect(second).rejects.toThrow(FIELD_DEFINITION_CONFLICT_CAUSE);
    const row = await readRow(id);
    expect(row.label).toBe(first);
    expect(row.version).toBe(2);
    expect(await countUpdateLogs(id)).toBe(1);

    const third = uniqueName("셋째저장");
    await updateFieldDefinition(admin, edit(id, 2, third));
    expect((await readRow(id)).label).toBe(third);
    expect((await readRow(id)).version).toBe(3);
  });

  it("폼을 연 뒤 보관되면(version도 오른다) 옛 version 저장은 버전 문구가 아니라 보관 문구로 거부된다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { id } = await createFieldDefinition(admin, input(uniqueName("보관먼저")));
    await db
      .update(fieldDefinitions)
      .set({ archivedAt: new Date(), version: sql`${fieldDefinitions.version} + 1` })
      .where(eq(fieldDefinitions.id, id));

    const attempt = updateFieldDefinition(admin, edit(id, 1, uniqueName("보관뒤")));

    await expect(attempt).rejects.toBeInstanceOf(FieldDefinitionArchivedError);
    await expect(attempt).rejects.toThrow(FIELD_DEFINITION_ARCHIVED_CAUSE);
    expect((await readRow(id)).version).toBe(2);
  });

  it("이름 중복 판정은 자기 자신을 빼고 본다 — 같은 이름 그대로 저장 가능, 다른 활성 칸 이름이면 활성 문구, 보관 칸 이름이면 보관 문구", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const mine = uniqueName("내칸");
    const { id } = await createFieldDefinition(admin, input(mine));
    const other = uniqueName("남칸");
    await createFieldDefinition(admin, input(other));
    const archivedName = uniqueName("보관칸");
    const archivedId = `fd-${randomUUID()}`;
    await insertFieldDefinition(SYSTEM_VIEWER, { id: archivedId, entity: "vendor", key: `cf_${randomUUID().slice(0, 8)}`, label: archivedName, type: "text" });
    await db.update(fieldDefinitions).set({ archivedAt: new Date() }).where(eq(fieldDefinitions.id, archivedId));

    await updateFieldDefinition(admin, edit(id, 1, mine, { required: true }));
    expect((await readRow(id)).version).toBe(2);

    const toActive = updateFieldDefinition(admin, edit(id, 2, other));
    await expect(toActive).rejects.toBeInstanceOf(DuplicateFieldNameError);
    await expect(toActive).rejects.toMatchObject({ archived: false });
    const toArchived = updateFieldDefinition(admin, edit(id, 2, archivedName));
    await expect(toArchived).rejects.toMatchObject({ archived: true });
    expect((await readRow(id)).label).toBe(mine);
  });

  it("선택형 칸을 options [] 로, 그리고 options를 빼고 저장하면 둘 다 선택지 0개로 거부되고 아무것도 바뀌지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { id } = await createFieldDefinition(admin, { ...input(uniqueName("선택수정")), type: "select", options: ["기본", "특약"] });
    const before = await readRow(id);
    const logsBefore = await countFieldLogs();

    await expect(updateFieldDefinition(admin, edit(id, 1, uniqueName("새이름"), { options: [] }))).rejects.toThrow(OPTIONS_ZERO_CAUSE);
    await expect(updateFieldDefinition(admin, edit(id, 1, uniqueName("새이름")))).rejects.toThrow(OPTIONS_ZERO_CAUSE);

    expect(await readRow(id)).toEqual(before);
    expect(await countFieldLogs()).toBe(logsBefore);
  });

  it("선택형이 아닌 칸에 선택지를 실으면 거부한다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { id } = await createFieldDefinition(admin, input(uniqueName("텍스트수정")));
    const before = await readRow(id);

    await expect(updateFieldDefinition(admin, edit(id, 1, uniqueName("새이름"), { options: ["기본"] }))).rejects.toThrow();

    expect(await readRow(id)).toEqual(before);
  });

  it("없는 id와 대상 상수 밖(프로젝트) 정의의 수정은 「화면 항목 없음」으로 거부되고 행이 바뀌지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const projectId = `fd-${randomUUID()}`;
    await insertFieldDefinition(SYSTEM_VIEWER, { id: projectId, entity: "project", key: `cf_pj${randomUUID().slice(0, 6)}`, label: uniqueName("프로젝트칸"), type: "text" });
    const before = await readRow(projectId);

    await expect(updateFieldDefinition(admin, edit(`fd-없음-${randomUUID()}`, 1, uniqueName("없음")))).rejects.toBeInstanceOf(FieldDefinitionNotFoundError);
    const attempt = updateFieldDefinition(admin, edit(projectId, 1, uniqueName("프로젝트수정")));
    await expect(attempt).rejects.toBeInstanceOf(FieldDefinitionNotFoundError);
    await expect(attempt).rejects.toThrow(FIELD_DEFINITION_NOT_FOUND_CAUSE);

    expect(await readRow(projectId)).toEqual(before);
  });

  // 04.5-02 Task 3: 선택지 삭제 = 보관 — archived_options는 서버가 버전 확인을 통과한 저장값에서 파생한다.
  it("저장된 선택지를 빼고 제출하면 archived_options로 가고, 다시 제출하면 활성으로 돌아온다(중복 없음)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { id } = await createFieldDefinition(admin, { ...input(uniqueName("선택보관")), type: "select", options: ["기본", "특약"] });

    await updateFieldDefinition(admin, edit(id, 1, uniqueName("선택보관이름"), { options: ["기본", "MOU"] }));
    const archived = await readRow(id);
    expect(archived.options).toEqual(["기본", "MOU"]);
    expect(archived.archivedOptions).toEqual(["특약"]);

    await updateFieldDefinition(admin, edit(id, 2, archived.label, { options: ["기본", "MOU", "특약"] }));
    const restored = await readRow(id);
    expect(restored.options).toEqual(["기본", "MOU", "특약"]);
    expect(restored.archivedOptions).toEqual([]);
  });

  it("오래 열린 폼: A가 선택지 c를 보관해 저장한 뒤 같은 version의 B 저장은 충돌로 거부되고 c는 보관된 채다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const name = uniqueName("오래열린");
    const { id } = await createFieldDefinition(admin, { ...input(name), type: "select", options: ["a", "b", "c"] });

    await updateFieldDefinition(admin, edit(id, 1, name, { options: ["a", "b"] }));
    const attempt = updateFieldDefinition(admin, edit(id, 1, name, { options: ["a", "b", "c", "d"] }));

    await expect(attempt).rejects.toBeInstanceOf(FieldDefinitionConflictError);
    const row = await readRow(id);
    expect(row.options).toEqual(["a", "b"]);
    expect(row.archivedOptions).toEqual(["c"]);
  });

  it("보관 선택지가 이미 있는 칸을 저장해도 저장된 선택지 문자열이 어느 쪽에서도 사라지지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const name = uniqueName("유실없음");
    const { id } = await createFieldDefinition(admin, { ...input(name), type: "select", options: ["a", "b", "c"] });
    await updateFieldDefinition(admin, edit(id, 1, name, { options: ["a", "b"] }));

    await updateFieldDefinition(admin, edit(id, 2, name, { options: ["b", "z"] }));

    const row = await readRow(id);
    expect(row.options).toEqual(["b", "z"]);
    expect([...row.archivedOptions].sort()).toEqual(["a", "c"]);
  });

  it("선택형이 아닌 칸의 수정은 선택지 열을 건드리지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { id } = await createFieldDefinition(admin, input(uniqueName("텍스트열")));

    await updateFieldDefinition(admin, edit(id, 1, uniqueName("텍스트열수정")));

    const row = await readRow(id);
    expect(row.options).toBeNull();
    expect(row.archivedOptions).toEqual([]);
  });

  it("쓰기 권한이 없는 기획 PM의 수정은 ForbiddenError이고 행 · 로그가 그대로다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const pm = await createViewer(DEFAULT_ROLE_ID);
    const { id } = await createFieldDefinition(admin, input(uniqueName("권한수정")));
    const before = await readRow(id);
    const logsBefore = await countFieldLogs();

    await expect(updateFieldDefinition(pm, edit(id, 1, uniqueName("PM수정")))).rejects.toBeInstanceOf(ForbiddenError);

    expect(await readRow(id)).toEqual(before);
    expect(await countFieldLogs()).toBe(logsBefore);
  });
});

// 04.5-01 Task 2: 이 페이즈 전에 만든 거래처 칸 정의의 노출 행 채움 — 마이그레이션의 손 편집 문장을
// 그대로 읽어 실행한다(문장이 사라지면 이 테스트가 먼저 빨개진다).
const BACKFILL_MARKER = "-- 04.5: 기존 거래처 칸 노출 행 채움";

function backfillStatement(): string {
  const dir = path.resolve(process.cwd(), "db/migrations");
  const files = readdirSync(dir).filter((name) => name.endsWith("_custom_field_admin.sql"));
  expect(files).toHaveLength(1);
  const source = readFileSync(path.join(dir, files[0] ?? ""), "utf8");
  const at = source.indexOf(BACKFILL_MARKER);
  expect(at, "표시 주석이 없다").toBeGreaterThanOrEqual(0);
  const rest = source.slice(at + BACKFILL_MARKER.length);
  const statement = rest.slice(0, rest.indexOf(";") + 1).trim();
  expect(statement).toMatch(/^INSERT INTO "visibility_matrix"/);
  return statement;
}

describe("기존 거래처 칸 노출 행 채움 (04.5-01 마이그레이션)", () => {
  it("전 계급(보관 포함)에 한 줄씩 채우고 꺼진 행은 그대로 · 프로젝트 칸 제외 · 두 번 돌려도 같다", async () => {
    const statement = backfillStatement();
    await insertFieldDefinition(SYSTEM_VIEWER, { id: `fd-${randomUUID()}`, entity: "vendor", key: "legacyVendorNote", type: "text" });
    await insertFieldDefinition(SYSTEM_VIEWER, { id: `fd-${randomUUID()}`, entity: "project", key: "legacyProjectNote", type: "text" });
    const archivedRoleId = `role-fd-backfill-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: archivedRoleId, name: `채움 보관 계급 ${archivedRoleId.slice(-8)}`, sortOrder: 91 });
    await setRoleArchived(SYSTEM_VIEWER, archivedRoleId, true);
    await insertVisibilityIfAbsent(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "cf.vendor.legacyVendorNote", visible: false });

    const snapshot = async () =>
      (
        await db
          .select({ roleId: visibilityMatrix.roleId, infoItem: visibilityMatrix.infoItem, visible: visibilityMatrix.visible })
          .from(visibilityMatrix)
          .where(like(visibilityMatrix.infoItem, "cf.%"))
      ).sort((a, b) => a.roleId.localeCompare(b.roleId));

    await db.execute(sql.raw(statement));
    const first = await snapshot();

    const allRoles = (await db.select({ id: roles.id }).from(roles)).map((role) => role.id).sort();
    expect(first.filter((row) => row.infoItem === "cf.vendor.legacyVendorNote").map((row) => row.roleId)).toEqual(allRoles);
    expect(first.map((row) => row.roleId)).toContain(archivedRoleId);
    expect(first.find((row) => row.roleId === DEFAULT_ROLE_ID)?.visible).toBe(false);
    expect(first.filter((row) => row.roleId !== DEFAULT_ROLE_ID).every((row) => row.visible)).toBe(true);
    expect(first.some((row) => row.infoItem.startsWith("cf.project."))).toBe(false);

    await db.execute(sql.raw(statement));
    expect(await snapshot()).toEqual(first);
  });
});
