import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { listRoles as defaultListRoles } from "@/repositories/roles";
import { MENUS, PERMISSION_ACTIONS, type PermissionAction } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { customFieldColumns } from "@/domain/custom-fields/visibility";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { buildChanges } from "@/domain/action-log/changes";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { kstToday } from "@/lib/kst-date";
import { assertAdminRoleRemains } from "@/domain/permissions/last-admin";
import { assertCanEditRole, visibilityKey } from "@/domain/permissions/grant-ceiling";
import { lockSeatKeys } from "@/repositories/seats";
import {
  findPermission,
  findVisibility,
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
  now: () => Date;
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
  if (!allowed) throw new ForbiddenError("권한표 열람 권한 없음");

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
  if (!allowed) throw new ForbiddenError("권한표 변경 권한 없음");

  // T-03-18: 자기 계급의 권한표 쓰기 칸을 스스로 끄는 사고를 막는다 — 그 칸을
  // 끄면 그 계급의 누구도 권한표를 다시 열 수 없어 DB 직접 수정 없이는
  // 복구가 불가능하다.
  if (
    viewer.roleId === input.roleId &&
    input.menu === "admin.permissions" &&
    input.action === "write" &&
    input.allowed === false
  ) {
    throw new SelfLockoutError("자기 계급 권한표 쓰기는 끌 수 없음");
  }

  await withTransaction(async (tx) => {
    // 06.4(D-6403 · D-6408): 관리자 칸 끄기만 관리자 키 잠금 뒤 재조회 — 다른 계급 칸도 포함(자기 계급은 위 SelfLockout이 먼저).
    if (input.menu === "admin.permissions" && input.action === "write" && input.allowed === false) {
      await lockSeatKeys(viewer, { admin: true }, tx);
      // 06.4 /review F5: 잠금을 기다린 사이 앞선 저장이 행위자 계급의 관리자 칸을 껐으면 거부 — 사전 판정만 믿지 않는다.
      // SYSTEM_VIEWER는 last-admin.ts와 같이 면제.
      if (viewer.id !== SYSTEM_VIEWER.id) {
        const own = viewer.roleId ? await findPermission(viewer, viewer.roleId, "admin.permissions", "write", tx) : null;
        if (own?.allowed !== true) throw new ForbiddenError("권한표 변경 권한 없음");
      }
      // 06.4 /review F7: 이미 꺼진 칸을 다시 끄는 저장은 관리자 수를 바꾸지 않으므로 마지막 관리자 판정을 건너뛴다.
      if ((await findPermission(viewer, input.roleId, "admin.permissions", "write", tx))?.allowed === true) {
        await assertAdminRoleRemains(viewer, { roleId: input.roleId, asOf: kstToday((deps?.now ?? (() => new Date()))()) }, tx);
      }
    }

    // 07-26(R5): 같은 tx에서 이전 값을 읽어 전후 값을 남긴다.
    const previous = await findPermission(viewer, input.roleId, input.menu, input.action, tx);

    await upsertPermission(viewer, {
      roleId: input.roleId,
      menu: input.menu,
      action: input.action,
      allowed: input.allowed,
      updatedBy: viewer.id,
    }, tx);

    await recordAction(
      viewer,
      {
        actionType: "permission_change",
        entity: "permission_matrix",
        entityId: input.roleId,
        detail: {
          roleId: input.roleId,
          menu: input.menu,
          action: input.action,
          allowed: input.allowed,
          changes: buildChanges({ allowed: previous?.allowed ?? null }, { allowed: input.allowed }),
        },
      },
      { tx },
    );
  });
}

// 정보 노출표 열 정본: 정보 항목(단일 단 머리글, 그룹 없음) 뒤에 활성 커스텀 항목(04.5-03, D10-13).
async function visibilityColumns(viewer: Viewer): Promise<GridColumn[]> {
  return [...INFO_ITEMS.map((item) => ({ id: item.key, label: item.label })), ...(await customFieldColumns(viewer))];
}

export async function readVisibilityGrid(viewer: Viewer, deps?: Partial<MatrixDeps>): Promise<GridDto> {
  const canFn = deps?.can ?? can;
  const listRoles = deps?.listRoles ?? defaultListRoles;
  const listVisibility = deps?.listVisibility ?? defaultListVisibility;

  const allowed = await canFn(viewer, "admin.visibility", "view");
  if (!allowed) throw new ForbiddenError("정보 노출표 열람 권한 없음");

  const [roleRows, visibilityRows, columns] = await Promise.all([
    listRoles(viewer),
    listVisibility(viewer),
    visibilityColumns(viewer),
  ]);

  const values: Record<string, boolean> = {};
  for (const row of visibilityRows) {
    values[cellKey(row.roleId, row.infoItem)] = row.visible;
  }

  return {
    roles: roleRows.map((role) => ({ id: role.id, label: role.name })),
    columns,
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
  if (!allowed) throw new ForbiddenError("정보 노출표 변경 권한 없음");

  // 06.4(O7 · T-6409): `admin.permissions` 쓰기가 없으면 바꾸기 전 · 바꾼 뒤 계급이 둘 다 내 상한 안이어야 한다 — 자기 계급에
  // 없는 칸을 켜는 자기 상향도 막힌다(비교 기준은 바꾸기 전 행위자 집합).
  await assertCanEditRole(viewer, input.roleId, (before) => {
    const keys = new Set(before.keys);
    if (input.visible) keys.add(visibilityKey(input.infoItem));
    else keys.delete(visibilityKey(input.infoItem));
    return { ...before, keys };
  });

  // 07-26(R5): 이전 값 읽기 · 저장 · 기록을 한 tx로 — 기록이 실패하면 노출 값도 그대로다.
  await withTransaction(async (tx) => {
    const previous = await findVisibility(viewer, input.roleId, input.infoItem, tx);

    await upsertVisibility(viewer, {
      roleId: input.roleId,
      infoItem: input.infoItem,
      visible: input.visible,
      updatedBy: viewer.id,
    }, tx);

    await recordAction(
      viewer,
      {
        actionType: "permission_change",
        entity: "visibility_matrix",
        entityId: input.roleId,
        detail: {
          roleId: input.roleId,
          infoItem: input.infoItem,
          visible: input.visible,
          changes: buildChanges({ visible: previous?.visible ?? null }, { visible: input.visible }),
        },
      },
      { tx },
    );
  });
}
