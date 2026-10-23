import { and, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { roles, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { normalizeRoleName } from "@/domain/permissions/role-name";
import { activeUserCondition } from "@/repositories/users";

export type RoleRow = InferSelectModel<typeof roles>;

export async function listRoles(
  viewer: Viewer,
  opts?: { includeArchived?: boolean },
  tx: DbOrTx = db,
): Promise<RoleRow[]> {
  void viewer;
  return tx
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

// 목록 묶음 조회(이슈 #56) — findRoleById와 같은 의미로 보관 여부로 거르지
// 않는다. ids가 비면 조회 없이 []를 돌려준다.
export async function findRolesByIds(viewer: Viewer, ids: string[]): Promise<RoleRow[]> {
  void viewer;
  if (ids.length === 0) return [];
  return db.select().from(roles).where(inArray(roles.id, ids));
}

// 같은 이름 중복은 name UNIQUE 제약이 거부한다(NFC 정규화 후 비교, D-33①).
export async function insertRole(
  viewer: Viewer,
  input: { id: string; name: string; sortOrder?: number; workScope?: string; viewScope?: string },
  tx: DbOrTx = db,
): Promise<RoleRow> {
  void viewer;
  const [row] = await tx
    .insert(roles)
    .values({
      id: input.id,
      name: normalizeRoleName(input.name),
      sortOrder: input.sortOrder ?? 0,
      workScope: input.workScope,
      viewScope: input.viewScope,
    })
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

export async function setRoleWorkScope(viewer: Viewer, id: string, workScope: string): Promise<void> {
  void viewer;
  await db.update(roles).set({ workScope, updatedAt: new Date() }).where(eq(roles.id, id));
}

export async function setRoleViewScope(viewer: Viewer, id: string, viewScope: string): Promise<void> {
  void viewer;
  await db.update(roles).set({ viewScope, updatedAt: new Date() }).where(eq(roles.id, id));
}

// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다 — archived_at이 이미
// 있으면(보관) / 없으면(복원) WHERE절이 걸러 0행이 갱신되고 원래 값이 유지된다.
export async function setRoleArchived(viewer: Viewer, id: string, value: boolean, tx: DbOrTx = db): Promise<boolean> {
  // 조건부 갱신이 실제로 바꾼 행이 있으면 참 — 범용 복원이 「이미 복원됨」 · 로그를 이 결과로 정한다(PR #149).
  const rows = value
    ? await tx
        .update(roles)
        .set({ archivedAt: new Date(), archivedBy: viewer.id })
        .where(and(eq(roles.id, id), isNull(roles.archivedAt)))
        .returning({ id: roles.id })
    : await tx
        .update(roles)
        .set({ archivedAt: null, archivedBy: null })
        .where(and(eq(roles.id, id), isNotNull(roles.archivedAt)))
        .returning({ id: roles.id });
  return rows.length > 0;
}

// 07-15(R17): 계급 보관 전 계급 행 잠금(tx 안) — 행이 없으면 null.
export async function lockRoleForUpdate(viewer: Viewer, id: string, tx: DbOrTx): Promise<RoleRow | null> {
  void viewer;
  const [row] = await tx.select().from(roles).where(eq(roles.id, id)).for("update");
  return row ?? null;
}

// 07-21(F2): 계급으로 옮기는 쓰기가 같은 tx에서 계급 행을 FOR SHARE로 다시 읽는다 — 보관(FOR UPDATE · 소속 세기)과 줄 선다.
export async function findRoleForShare(viewer: Viewer, id: string, tx: DbOrTx): Promise<RoleRow | null> {
  void viewer;
  const [row] = await tx.select().from(roles).where(eq(roles.id, id)).for("share");
  return row ?? null;
}

// 07-15(R17): 그 계급의 활성 소속 수 — 보관 안 됨 ∧ 퇴직일 안 지남(countActiveAdmins의 기본 활성 조건과 같다).
// 07-21: 활성 조건은 사람 목록 필터 · 계급별 숫자와 같은 조각(activeUserCondition).
export async function countActiveMembersOfRole(viewer: Viewer, roleId: string, asOf: string, tx: DbOrTx = db): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.roleId, roleId), activeUserCondition(viewer, asOf)));
  return row?.n ?? 0;
}

// 07-21(R17 화면): 계급별 활성 소속 수 한 번에 — 없는 계급은 0.
export async function countActiveMembersByRole(
  viewer: Viewer,
  roleIds: readonly string[],
  asOf: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const id of roleIds) counts[id] = 0;
  if (roleIds.length === 0) return counts;
  const rows = await db
    .select({ roleId: users.roleId, n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(inArray(users.roleId, [...roleIds]), activeUserCondition(viewer, asOf)))
    .groupBy(users.roleId);
  for (const row of rows) if (row.roleId !== null) counts[row.roleId] = row.n;
  return counts;
}

// 멱등 시드 전용 — 이미 있으면 건드리지 않는다(onConflictDoNothing).
export async function seedRole(
  viewer: Viewer,
  input: { id: string; name: string; isSeed: boolean; sortOrder: number; workScope: string; viewScope?: string },
): Promise<boolean> {
  void viewer;
  const inserted = await db
    .insert(roles)
    .values({
      id: input.id,
      name: input.name,
      isSeed: input.isSeed,
      sortOrder: input.sortOrder,
      workScope: input.workScope,
      viewScope: input.viewScope,
    })
    .onConflictDoNothing({ target: roles.id })
    .returning({ id: roles.id });
  return inserted.length > 0;
}
