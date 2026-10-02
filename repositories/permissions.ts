import { and, asc, eq, exists, isNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { fieldDefinitions, permissionMatrix, users, visibilityMatrix } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { customFieldInfoItem, type FieldDefinitionTarget } from "@/domain/custom-fields/targets";

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
  tx: DbOrTx = db,
): Promise<void> {
  void viewer;
  await tx
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

// 04.3-10(eng-review newflow E11) — 사건 알림의 받는 사람: 계급 권한표에서 요건(메뉴 · 동작)을 **전부** 허용받고
// 노출표에서 정보 항목(visibleItems)이 **전부** 보이는 보관 안 된 사람의 id — 행동할 수 있는 사람만(W5 a · 5928674957).
// 권한 판정(can · visible)이 아니라 받는 사람 조회다 — 공개 제출 경로(intake.ts)도 부른다.
export async function listActiveUserIdsAllowed(
  viewer: Viewer,
  requirements: ReadonlyArray<{ menu: string; action: string }>,
  tx: DbOrTx = db,
  visibleItems: ReadonlyArray<string> = [],
): Promise<string[]> {
  void viewer;
  if (requirements.length === 0) return [];
  const shown = visibleItems.map((infoItem) =>
    exists(
      tx
        .select({ one: visibilityMatrix.roleId })
        .from(visibilityMatrix)
        .where(
          and(
            eq(visibilityMatrix.roleId, users.roleId),
            eq(visibilityMatrix.infoItem, infoItem),
            eq(visibilityMatrix.visible, true),
          ),
        ),
    ),
  );
  const allowed = requirements.map((requirement) =>
    exists(
      tx
        .select({ one: permissionMatrix.roleId })
        .from(permissionMatrix)
        .where(
          and(
            eq(permissionMatrix.roleId, users.roleId),
            eq(permissionMatrix.menu, requirement.menu),
            eq(permissionMatrix.action, requirement.action),
            eq(permissionMatrix.allowed, true),
          ),
        ),
    ),
  );
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(isNull(users.archivedAt), ...allowed, ...shown))
    .orderBy(asc(users.createdAt), asc(users.id));
  return rows.map((row) => row.id);
}

export type VendorFieldAccess = {
  /** 거래처 정의 전체(보관 포함) — listFieldDefinitions와 같은 조건 · 정렬(sortOrder, key) */
  definitions: InferSelectModel<typeof fieldDefinitions>[];
  vendorValueVisible: boolean;
  /** 그 계급에 cf.vendor.<key> 보임 행이 있는 정의 키(보관 여부와 무관 — 판정은 domain) */
  visibleFieldKeys: Set<string>;
};

const VENDOR_TARGET: FieldDefinitionTarget = "vendor";

// 04.5-05(T-04.5-44): 거래처 입력 칸 판정 재료를 SQL 한 문(READ COMMITTED에서 한 스냅숏)으로 읽는다 — 정의에 노출표를
// 두 번 LEFT JOIN(칸별 cf.vendor.<key> · 「거래처 정보」 vendor.value). (role_id, info_item)이 유일이라 행이 늘지 않는다.
// 행 없음 · roleId 없음은 거짓(기본 숨김). 정의가 0개면 vendorValueVisible은 거짓이다(입력 칸도 0개라 쓰이지 않는다).
export async function readVendorFieldAccess(
  viewer: Viewer,
  roleId: string | null,
  tx: DbOrTx = db,
): Promise<VendorFieldAccess> {
  void viewer;
  const fieldRow = alias(visibilityMatrix, "cf_visibility");
  const valueRow = alias(visibilityMatrix, "vendor_value_visibility");
  const rows = await tx
    .select({ definition: fieldDefinitions, fieldVisible: fieldRow.visible, valueVisible: valueRow.visible })
    .from(fieldDefinitions)
    .leftJoin(
      fieldRow,
      roleId === null
        ? sql`false`
        : and(eq(fieldRow.roleId, roleId), eq(fieldRow.infoItem, sql`${customFieldInfoItem(VENDOR_TARGET, "")}::text || ${fieldDefinitions.key}`)),
    )
    .leftJoin(
      valueRow,
      roleId === null ? sql`false` : and(eq(valueRow.roleId, roleId), eq(valueRow.infoItem, "vendor.value")),
    )
    .where(eq(fieldDefinitions.entity, VENDOR_TARGET))
    .orderBy(fieldDefinitions.sortOrder, fieldDefinitions.key);
  return {
    definitions: rows.map((row) => row.definition),
    vendorValueVisible: rows.some((row) => row.valueVisible === true),
    visibleFieldKeys: new Set(rows.filter((row) => row.fieldVisible === true).map((row) => row.definition.key)),
  };
}
