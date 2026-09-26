import { and, eq, isNull } from "drizzle-orm";
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

// 이미 있는 셀은 건드리지 않는다 — 시드가 반복 실행돼도 관리자가 권한표에서
// 이미 끈 값을 되살리지 않기 위해(onConflictDoUpdate 대신 DoNothing).
export async function insertPermissionIfAbsent(
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
    .onConflictDoNothing({
      target: [permissionMatrix.roleId, permissionMatrix.menu, permissionMatrix.action],
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

// 관리자가 손대지 않은 행(updated_by 없음)만 갱신한다 — 시드가 관리자 변경을 되돌리지 않는다.
export async function upsertVisibilityIfUnedited(
  viewer: Viewer,
  input: { roleId: string; infoItem: string; visible: boolean },
): Promise<void> {
  void viewer;
  await db
    .insert(visibilityMatrix)
    .values({ roleId: input.roleId, infoItem: input.infoItem, visible: input.visible, updatedBy: null })
    .onConflictDoUpdate({
      target: [visibilityMatrix.roleId, visibilityMatrix.infoItem],
      set: { visible: input.visible, updatedAt: new Date() },
      where: isNull(visibilityMatrix.updatedBy),
    });
}

// 04-20(ENG-D3 ③): insertPermissionIfAbsent와 같은 결 — 시드가 반복 실행돼도
// 관리자가 노출표에서 이미 끈 값을 되살리지 않는다.
export async function insertVisibilityIfAbsent(
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
    .onConflictDoNothing({
      target: [visibilityMatrix.roleId, visibilityMatrix.infoItem],
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
