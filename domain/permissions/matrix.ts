import type { Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { listRoles as defaultListRoles } from "@/repositories/roles";
import { MENUS, PERMISSION_ACTIONS, type PermissionAction } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import {
  listPermissions as defaultListPermissions,
  upsertPermission as defaultUpsertPermission,
  listVisibility as defaultListVisibility,
  upsertVisibility as defaultUpsertVisibility,
} from "@/repositories/permissions";

// ADMN-01·ADMN-02·D-40: 권한표·정보 노출표 격자 화면의 유일한 domain
// 진입점. 격자를 그리는 두 화면(app/(app)/admin/permissions,
// app/(app)/admin/visibility)이 이 파일만 호출한다 — 리포지토리 행 객체를
// 그대로 돌려주지 않는다(plant8/no-row-type-escape가 그것을 빌드 실패로
// 만든다).
export class ForbiddenError extends UserFacingError {}
export class SelfLockoutError extends UserFacingError {}

export type GridRole = { id: string; label: string };
export type GridColumn = { id: string; label: string; group?: string };
export type GridDto = {
  roles: GridRole[];
  columns: GridColumn[];
  // key = `${roleId}::${columnId}` — ui/permission-grid의 buildCellKey와
  // 같은 형식이다.
  values: Record<string, boolean>;
};

export type MatrixDeps = {
  can: typeof can;
  visible: typeof visible;
  listRoles: typeof defaultListRoles;
  listPermissions: typeof defaultListPermissions;
  upsertPermission: typeof defaultUpsertPermission;
  listVisibility: typeof defaultListVisibility;
  upsertVisibility: typeof defaultUpsertVisibility;
  recordAction: typeof defaultRecordAction;
};

function cellKey(roleId: string, columnId: string): string {
  return `${roleId}::${columnId}`;
}

// 권한표 열 정본: 메뉴 × 동작(보기/쓰기/승인) — 메뉴별로 열을 연속해서
// 모아 2단 머리글이 그룹을 정확히 나누게 한다.
function permissionColumns(): GridColumn[] {
  return MENUS.flatMap((menu) =>
    PERMISSION_ACTIONS.map((action) => ({
      id: `${menu.key}::${action}`,
      label: actionLabel(action),
      group: menu.label,
    })),
  );
}

function actionLabel(action: PermissionAction): string {
  if (action === "view") return "보기";
  if (action === "write") return "쓰기";
  return "승인";
}

export async function readPermissionGrid(viewer: Viewer, deps?: Partial<MatrixDeps>): Promise<GridDto> {
  const canFn = deps?.can ?? can;
  const listRoles = deps?.listRoles ?? defaultListRoles;
  const listPermissions = deps?.listPermissions ?? defaultListPermissions;

  const allowed = await canFn(viewer, "admin.permissions", "view");
  if (!allowed) throw new ForbiddenError("권한표를 볼 권한이 없습니다.");

  const [roleRows, permissionRows] = await Promise.all([listRoles(viewer), listPermissions(viewer)]);

  const values: Record<string, boolean> = {};
  for (const row of permissionRows) {
    values[cellKey(row.roleId, `${row.menu}::${row.action}`)] = row.allowed;
  }

  return {
    roles: roleRows.map((role) => ({ id: role.id, label: role.name })),
    columns: permissionColumns(),
    values,
  };
}

export async function setPermissionCell(
  viewer: Viewer,
  input: { roleId: string; menu: string; action: PermissionAction; allowed: boolean },
  deps?: Partial<MatrixDeps>,
): Promise<void> {
  const canFn = deps?.can ?? can;
  const upsertPermission = deps?.upsertPermission ?? defaultUpsertPermission;
  const recordAction = deps?.recordAction ?? defaultRecordAction;

  const allowed = await canFn(viewer, "admin.permissions", "write");
  if (!allowed) throw new ForbiddenError("권한표를 바꿀 권한이 없습니다.");

  // T-03-18: 자기 계급의 권한표 쓰기 칸을 스스로 끄는 사고를 막는다 — 그 칸을
  // 끄면 그 계급의 누구도 권한표를 다시 열 수 없어 DB 직접 수정 없이는
  // 복구가 불가능하다.
  if (
    viewer.roleId === input.roleId &&
    input.menu === "admin.permissions" &&
    input.action === "write" &&
    input.allowed === false
  ) {
    throw new SelfLockoutError("자기 계급의 권한표 쓰기 권한은 끌 수 없습니다.");
  }

  await upsertPermission(viewer, {
    roleId: input.roleId,
    menu: input.menu,
    action: input.action,
    allowed: input.allowed,
    updatedBy: viewer.id,
  });

  await recordAction(viewer, {
    actionType: "permission_change",
    entity: "permission_matrix",
    entityId: input.roleId,
    detail: { roleId: input.roleId, menu: input.menu, action: input.action, allowed: input.allowed },
  });
}

// 정보 노출표 열 정본: 정보 항목(단일 단 머리글, 그룹 없음).
function visibilityColumns(): GridColumn[] {
  return INFO_ITEMS.map((item) => ({ id: item.key, label: item.label }));
}

export async function readVisibilityGrid(viewer: Viewer, deps?: Partial<MatrixDeps>): Promise<GridDto> {
  const canFn = deps?.can ?? can;
  const listRoles = deps?.listRoles ?? defaultListRoles;
  const listVisibility = deps?.listVisibility ?? defaultListVisibility;

  const allowed = await canFn(viewer, "admin.visibility", "view");
  if (!allowed) throw new ForbiddenError("정보 노출표를 볼 권한이 없습니다.");

  const [roleRows, visibilityRows] = await Promise.all([listRoles(viewer), listVisibility(viewer)]);

  const values: Record<string, boolean> = {};
  for (const row of visibilityRows) {
    values[cellKey(row.roleId, row.infoItem)] = row.visible;
  }

  return {
    roles: roleRows.map((role) => ({ id: role.id, label: role.name })),
    columns: visibilityColumns(),
    values,
  };
}

export async function setVisibilityCell(
  viewer: Viewer,
  input: { roleId: string; infoItem: string; visible: boolean },
  deps?: Partial<MatrixDeps>,
): Promise<void> {
  const canFn = deps?.can ?? can;
  const upsertVisibility = deps?.upsertVisibility ?? defaultUpsertVisibility;
  const recordAction = deps?.recordAction ?? defaultRecordAction;

  const allowed = await canFn(viewer, "admin.visibility", "write");
  if (!allowed) throw new ForbiddenError("정보 노출표를 바꿀 권한이 없습니다.");

  await upsertVisibility(viewer, {
    roleId: input.roleId,
    infoItem: input.infoItem,
    visible: input.visible,
    updatedBy: viewer.id,
  });

  await recordAction(viewer, {
    actionType: "permission_change",
    entity: "visibility_matrix",
    entityId: input.roleId,
    detail: { roleId: input.roleId, infoItem: input.infoItem, visible: input.visible },
  });
}
