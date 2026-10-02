import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, fieldDefinitions, vendors, visibilityMatrix } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import {
  archive,
  ArchivableRowNotFoundError,
  ForbiddenError,
  listArchive,
  restore,
} from "@/domain/archive";
import {
  createFieldDefinition,
  DuplicateFieldNameError,
  FieldDefinitionArchivedError,
  FieldDefinitionConflictError,
  updateFieldDefinition,
} from "@/domain/custom-fields/admin";
import { customFieldColumns } from "@/domain/custom-fields/visibility";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import { createVendor, listVendorFieldDefinitions, listVendors } from "@/domain/vendors";
import { insertFieldDefinition } from "@/repositories/field-definitions";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";

// 04.5-04: 칸 정의의 보관 · 복원은 공용 보관함 경로(domain/archive)를 탄다. 보관함 등록부의 칸 정의 항목에만
// 추가 권한 조건(admin.field-definitions)이 있어 보관함 쓰기와 칸 관리 쓰기가 둘 다 있어야 한다(UI-SPEC O21).

const ENTITY = "field_definitions";

async function createViewer(roleId: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `fda-${randomUUID()}@example.test`,
    name: "통합테스트 칸 보관",
    roleId,
  });
  return { id: userId, roleId };
}

// 시드 계급의 권한을 건드리지 않게 이 테스트만 쓰는 계급을 만든다. archive.value는 보관함 목록 투영용.
async function viewerWith(grants: Array<[menu: string, action: "view" | "write"]>): Promise<Viewer> {
  const roleId = `role-fda-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `칸보관 ${roleId.slice(-8)}`, sortOrder: 80 });
  for (const [menu, action] of grants) {
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action, allowed: true });
  }
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "archive.value", visible: true });
  return { id: `fda-viewer-${randomUUID()}`, roleId };
}

const textInput = (name: string, sortOrder = 1) => ({ name, type: "text" as const, required: false, sortOrder });

async function readRow(id: string) {
  const [row] = await db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id));
  if (!row) throw new Error("행이 없다");
  return row;
}

async function countLogs(id: string, actionType: "archive" | "restore"): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actionLog)
    .where(and(eq(actionLog.entity, ENTITY), eq(actionLog.entityId, id), eq(actionLog.actionType, actionType)));
  return row?.count ?? 0;
}

async function activeLabelCount(label: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.label, label), sql`${fieldDefinitions.archivedAt} is null`));
  return row?.count ?? 0;
}

describe("칸 보관 · 복원 권한 (04.5-04)", () => {
  it("(a) 보관함 쓰기만 있고 칸 관리 권한이 없으면 보관 · 복원이 ForbiddenError이고 행 · 버전 · 로그가 그대로다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const limited = await viewerWith([
      ["admin.archive", "view"],
      ["admin.archive", "write"],
    ]);
    const field = await createFieldDefinition(admin, textInput("권한 칸 에이"));

    await expect(archive(limited, ENTITY, field.id)).rejects.toBeInstanceOf(ForbiddenError);
    const afterArchive = await readRow(field.id);
    expect(afterArchive.archivedAt).toBeNull();
    expect(afterArchive.version).toBe(1);
    expect(await countLogs(field.id, "archive")).toBe(0);

    await archive(admin, ENTITY, field.id);
    const archived = await readRow(field.id);
    await expect(restore(limited, ENTITY, field.id)).rejects.toBeInstanceOf(ForbiddenError);
    const afterRestore = await readRow(field.id);
    expect(afterRestore.archivedAt).toEqual(archived.archivedAt);
    expect(afterRestore.version).toBe(archived.version);
    expect(await countLogs(field.id, "restore")).toBe(0);
  });

  it("(c) 칸 관리 보기 권한이 없으면 보관함 목록에 칸 정의 행이 없고, 거래처 행은 그대로 나온다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const limited = await viewerWith([
      ["admin.archive", "view"],
      ["admin.archive", "write"],
    ]);
    const field = await createFieldDefinition(admin, textInput("목록 칸 비"));
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `보관함거래처-${randomUUID()}` });
    await archive(admin, ENTITY, field.id);
    await archive(admin, "vendor", vendor.id);

    const limitedList = await listArchive(limited);
    expect(limitedList.filter((item) => item.entity === ENTITY)).toEqual([]);
    expect(limitedList.some((item) => item.entity === "vendor" && item.id === vendor.id)).toBe(true);

    const adminList = await listArchive(admin);
    expect(adminList.find((item) => item.entity === ENTITY && item.id === field.id)).toMatchObject({
      label: "화면 항목",
      name: "목록 칸 비",
      restorable: true,
    });
  });

  it("(d) 칸 관리 쓰기만 있고 보관함 쓰기가 없으면 보관 · 복원이 거부된다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const fieldWriter = await viewerWith([
      ["admin.field-definitions", "view"],
      ["admin.field-definitions", "write"],
      ["admin.archive", "view"],
    ]);
    const field = await createFieldDefinition(admin, textInput("권한 칸 디"));

    await expect(archive(fieldWriter, ENTITY, field.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await readRow(field.id)).archivedAt).toBeNull();

    await archive(admin, ENTITY, field.id);
    await expect(restore(fieldWriter, ENTITY, field.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await readRow(field.id)).archivedAt).not.toBeNull();
  });

  it("(e) 두 권한이 다 있으면 보관이 시각 · 사람을 채우고 version + 1 · 로그, 다시 보관은 버전 그대로, 복원은 비우고 version + 1 · 로그", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const field = await createFieldDefinition(admin, textInput("권한 칸 이"));

    await archive(admin, ENTITY, field.id);
    const archived = await readRow(field.id);
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.archivedBy).toBe(admin.id);
    expect(archived.version).toBe(2);
    expect(await countLogs(field.id, "archive")).toBe(1);

    await archive(admin, ENTITY, field.id);
    const again = await readRow(field.id);
    expect(again.version).toBe(2);
    expect(again.archivedAt).toEqual(archived.archivedAt);
    // 다시 보관은 바뀐 행이 없어 로그도 없다(복원의 「이미 복원됨」과 같은 꼴 — 04 독립 검토).
    expect(await countLogs(field.id, "archive")).toBe(1);
    // 보관된 칸은 수정 폼 저장이 막힌다.
    await expect(
      updateFieldDefinition(admin, { id: field.id, version: 2, name: "권한 칸 이", required: false, sortOrder: 1 }),
    ).rejects.toBeInstanceOf(FieldDefinitionArchivedError);

    expect(await restore(admin, ENTITY, field.id)).toEqual({ restored: true });
    const restored = await readRow(field.id);
    expect(restored.archivedAt).toBeNull();
    expect(restored.archivedBy).toBeNull();
    expect(restored.version).toBe(3);
    expect(await countLogs(field.id, "restore")).toBe(1);

    expect(await restore(admin, ENTITY, field.id)).toEqual({ restored: false });
    expect((await readRow(field.id)).version).toBe(3);
  });

  it("대상 밖(프로젝트) 정의는 보관 · 복원이 ArchivableRowNotFoundError이고 보관함 목록에 없다", async () => {
    const id = `fd-project-${randomUUID()}`;
    await insertFieldDefinition(SYSTEM_VIEWER, { id, entity: "project", key: `p_${randomUUID().slice(0, 8)}`, type: "text" });

    await expect(archive(SYSTEM_VIEWER, ENTITY, id)).rejects.toBeInstanceOf(ArchivableRowNotFoundError);
    expect((await readRow(id)).archivedAt).toBeNull();

    await db.update(fieldDefinitions).set({ archivedAt: new Date() }).where(eq(fieldDefinitions.id, id));
    await expect(restore(SYSTEM_VIEWER, ENTITY, id)).rejects.toBeInstanceOf(ArchivableRowNotFoundError);
    expect((await readRow(id)).archivedAt).not.toBeNull();
    expect((await listArchive(SYSTEM_VIEWER)).some((item) => item.id === id)).toBe(false);
  });
});

describe("칸 보관 · 복원의 값 · 노출 설정 보존 (04.5-04)", () => {
  it("보관하면 노출표 열 · 폼 정의 · 거래처 DTO에서 빠지고 값 · 노출 행은 남으며, 복원하면 끈 계급은 끈 채 돌아온다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const field = await createFieldDefinition(admin, {
      name: "보존 칸",
      type: "select",
      required: false,
      sortOrder: 1,
      options: ["가", "나"],
    });
    // 선택지 「나」를 보관해 둔다 — 칸 보관 · 복원이 선택지 상태를 바꾸지 않는다.
    await updateFieldDefinition(admin, { id: field.id, version: 1, name: "보존 칸", required: false, sortOrder: 1, options: ["가"] });
    const infoItem = customFieldInfoItem("vendor", field.key);
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem, visible: false });
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `보존거래처-${randomUUID()}`, customFields: { [field.key]: "가" } });
    const visibilityBefore = await db.select().from(visibilityMatrix).where(eq(visibilityMatrix.infoItem, infoItem));

    await archive(admin, ENTITY, field.id);

    expect((await customFieldColumns(admin)).map((column) => column.id)).not.toContain(infoItem);
    expect((await listVendorFieldDefinitions(SYSTEM_VIEWER)).map((def) => def.key)).not.toContain(field.key);
    expect((await listVendors(SYSTEM_VIEWER)).find((row) => row.id === vendor.id)?.customFields).toEqual({});
    const [stored] = await db.select({ customFields: vendors.customFields }).from(vendors).where(eq(vendors.id, vendor.id));
    expect(stored?.customFields).toEqual({ [field.key]: "가" });
    const visibilityArchived = await db.select().from(visibilityMatrix).where(eq(visibilityMatrix.infoItem, infoItem));
    expect(visibilityArchived).toHaveLength(visibilityBefore.length);

    await restore(admin, ENTITY, field.id);

    expect((await customFieldColumns(admin)).map((column) => column.id)).toContain(infoItem);
    expect((await listVendorFieldDefinitions(SYSTEM_VIEWER)).map((def) => def.key)).toContain(field.key);
    expect((await listVendors(SYSTEM_VIEWER)).find((row) => row.id === vendor.id)?.customFields).toEqual({ [field.key]: "가" });
    const [pmRow] = await db
      .select()
      .from(visibilityMatrix)
      .where(and(eq(visibilityMatrix.roleId, DEFAULT_ROLE_ID), eq(visibilityMatrix.infoItem, infoItem)));
    expect(pmRow?.visible).toBe(false);
    const restored = await readRow(field.id);
    expect(restored.options).toEqual(["가"]);
    expect(restored.archivedOptions).toEqual(["나"]);
  });

  it("보관 · 복원 전에 연 수정 폼의 버전으로 저장하면 충돌로 거부된다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const field = await createFieldDefinition(admin, textInput("버전 칸"));
    const opened = (await readRow(field.id)).version;

    await archive(admin, ENTITY, field.id);
    await restore(admin, ENTITY, field.id);

    await expect(
      updateFieldDefinition(admin, { id: field.id, version: opened, name: "버전 칸 새이름", required: false, sortOrder: 1 }),
    ).rejects.toBeInstanceOf(FieldDefinitionConflictError);
    expect((await readRow(field.id)).label).toBe("버전 칸");
  });
});

describe("이름 예약과 복원 (04.5-04 · UI-SPEC O22)", () => {
  it("보관한 「계약 유형」의 이름은 새 칸 · 이름 바꾸기 모두 거부되고, 옛 칸 복원 뒤 활성 「계약 유형」은 하나다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const old = await createFieldDefinition(admin, textInput("계약 유형"));
    const other = await createFieldDefinition(admin, textInput("다른 칸", 2));
    await archive(admin, ENTITY, old.id);

    const created = createFieldDefinition(admin, textInput("계약 유형", 3));
    await expect(created).rejects.toBeInstanceOf(DuplicateFieldNameError);
    await expect(created).rejects.toMatchObject({ archived: true });

    const renamed = updateFieldDefinition(admin, { id: other.id, version: 1, name: "계약 유형", required: false, sortOrder: 2 });
    await expect(renamed).rejects.toBeInstanceOf(DuplicateFieldNameError);
    await expect(renamed).rejects.toMatchObject({ archived: true });

    expect(await restore(admin, ENTITY, old.id)).toEqual({ restored: true });
    expect(await activeLabelCount("계약 유형")).toBe(1);
  });

  it("옛 칸 이름을 바꾸고 보관하면 같은 이름의 선택형 새 칸을 추가할 수 있다(타입 변경 경로)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const old = await createFieldDefinition(admin, textInput("계약 유형"));
    await updateFieldDefinition(admin, { id: old.id, version: 1, name: "계약 유형(옛)", required: false, sortOrder: 1 });
    await archive(admin, ENTITY, old.id);

    const fresh = await createFieldDefinition(admin, {
      name: "계약 유형",
      type: "select",
      required: false,
      sortOrder: 2,
      options: ["단기", "장기"],
    });
    expect((await readRow(fresh.id)).type).toBe("select");
    expect(await activeLabelCount("계약 유형")).toBe(1);
  });
});
