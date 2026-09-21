import { and, eq, isNull, isNotNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { normalizeRoleName } from "@/domain/permissions/role-name";

export type RoleRow = InferSelectModel<typeof roles>;

export async function listRoles(viewer: Viewer, opts?: { includeArchived?: boolean }): Promise<RoleRow[]> {
  void viewer;
  return db
    .select()
    .from(roles)
    .where(opts?.includeArchived ? undefined : isNull(roles.archivedAt))
    .orderBy(roles.sortOrder, roles.name);
}

export async function findRoleById(viewer: Viewer, id: string): Promise<RoleRow | null> {
  void viewer;
  const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  return row ?? null;
}

// 같은 이름 중복은 name UNIQUE 제약이 거부한다(NFC 정규화 후 비교, D-33①).
export async function insertRole(
  viewer: Viewer,
  input: { id: string; name: string; sortOrder?: number },
): Promise<RoleRow> {
  void viewer;
  const [row] = await db
    .insert(roles)
    .values({ id: input.id, name: normalizeRoleName(input.name), sortOrder: input.sortOrder ?? 0 })
    .returning();
  if (!row) throw new Error("roles insert가 행을 반환하지 않았습니다.");
  return row;
}

export async function renameRole(viewer: Viewer, id: string, name: string): Promise<void> {
  void viewer;
  await db
    .update(roles)
    .set({ name: normalizeRoleName(name), updatedAt: new Date() })
    .where(eq(roles.id, id));
}

// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다 — archived_at이 이미
// 있으면(보관) / 없으면(복원) WHERE절이 걸러 0행이 갱신되고 원래 값이 유지된다.
export async function setRoleArchived(viewer: Viewer, id: string, value: boolean): Promise<void> {
  if (value) {
    await db
      .update(roles)
      .set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(and(eq(roles.id, id), isNull(roles.archivedAt)));
  } else {
    await db
      .update(roles)
      .set({ archivedAt: null, archivedBy: null })
      .where(and(eq(roles.id, id), isNotNull(roles.archivedAt)));
  }
}

// 멱등 시드 전용 — 이미 있으면 건드리지 않는다(onConflictDoNothing).
export async function seedRole(
  viewer: Viewer,
  input: { id: string; name: string; isSeed: boolean; sortOrder: number },
): Promise<boolean> {
  void viewer;
  const inserted = await db
    .insert(roles)
    .values({ id: input.id, name: input.name, isSeed: input.isSeed, sortOrder: input.sortOrder })
    .onConflictDoNothing({ target: roles.id })
    .returning({ id: roles.id });
  return inserted.length > 0;
}
