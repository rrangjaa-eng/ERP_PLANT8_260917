import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { permissionMatrix, visibilityMatrix } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type PermissionMatrixRow = InferSelectModel<typeof permissionMatrix>;
export type VisibilityMatrixRow = InferSelectModel<typeof visibilityMatrix>;

export async function findPermission(
  viewer: Viewer,
  roleId: string,
  menu: string,
  action: string,
): Promise<PermissionMatrixRow | null> {
  void viewer;
  const [row] = await db
    .select()
    .from(permissionMatrix)
    .where(
      and(
        eq(permissionMatrix.roleId, roleId),
        eq(permissionMatrix.menu, menu),
        eq(permissionMatrix.action, action),
      ),
    )
    .limit(1);
  return row ?? null;
}

// 복합 UNIQUE(permission_matrix_role_menu_action_key)를 onConflictDoUpdate
// 대상으로 써서 같은 셀을 두 번 켜도 행이 하나이고 동시 토글은 마지막 쓰기가
// 이긴다.
export async function upsertPermission(
  viewer: Viewer,
  input: { roleId: string; menu: string; action: string; allowed: boolean; updatedBy?: string | null },
): Promise<void> {
  void viewer;
  await db
    .insert(permissionMatrix)
    .values({
      roleId: input.roleId,
      menu: input.menu,
      action: input.action,
      allowed: input.allowed,
      updatedBy: input.updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: [permissionMatrix.roleId, permissionMatrix.menu, permissionMatrix.action],
      set: { allowed: input.allowed, updatedAt: new Date(), updatedBy: input.updatedBy ?? null },
    });
}

export async function listPermissions(
  viewer: Viewer,
  opts?: { roleId?: string },
): Promise<PermissionMatrixRow[]> {
  void viewer;
  return db
    .select()
    .from(permissionMatrix)
    .where(opts?.roleId ? eq(permissionMatrix.roleId, opts.roleId) : undefined);
}

export async function findVisibility(
  viewer: Viewer,
  roleId: string,
  infoItem: string,
): Promise<VisibilityMatrixRow | null> {
  void viewer;
  const [row] = await db
    .select()
    .from(visibilityMatrix)
    .where(and(eq(visibilityMatrix.roleId, roleId), eq(visibilityMatrix.infoItem, infoItem)))
    .limit(1);
  return row ?? null;
}

export async function upsertVisibility(
  viewer: Viewer,
  input: { roleId: string; infoItem: string; visible: boolean; updatedBy?: string | null },
): Promise<void> {
  void viewer;
  await db
    .insert(visibilityMatrix)
    .values({
      roleId: input.roleId,
      infoItem: input.infoItem,
      visible: input.visible,
      updatedBy: input.updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: [visibilityMatrix.roleId, visibilityMatrix.infoItem],
      set: { visible: input.visible, updatedAt: new Date(), updatedBy: input.updatedBy ?? null },
    });
}

export async function listVisibility(
  viewer: Viewer,
  opts?: { roleId?: string },
): Promise<VisibilityMatrixRow[]> {
  void viewer;
  return db
    .select()
    .from(visibilityMatrix)
    .where(opts?.roleId ? eq(visibilityMatrix.roleId, opts.roleId) : undefined);
}
