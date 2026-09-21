import { and, eq, isNull, isNotNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { orgUnits } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";

export type OrgUnitRow = InferSelectModel<typeof orgUnits>;

export async function listOrgUnits(viewer: Viewer, opts: { scope: Scope }): Promise<OrgUnitRow[]> {
  if (opts.scope.rows === "none") return [];
  return db
    .select()
    .from(orgUnits)
    .where(opts.scope.includeArchived ? undefined : isNull(orgUnits.archivedAt))
    .orderBy(orgUnits.sortOrder, orgUnits.name);
}

export async function findOrgUnitById(viewer: Viewer, id: string): Promise<OrgUnitRow | null> {
  const [row] = await db.select().from(orgUnits).where(eq(orgUnits.id, id)).limit(1);
  return row ?? null;
}

// 멱등 시드가 "이미 있으면 그 id를 알아야" 팀을 그 본부에 연결할 수 있어
// 이름으로 찾는다(name UNIQUE 제약과 짝).
export async function findOrgUnitByName(viewer: Viewer, name: string): Promise<OrgUnitRow | null> {
  const [row] = await db.select().from(orgUnits).where(eq(orgUnits.name, name)).limit(1);
  return row ?? null;
}

export async function insertOrgUnit(
  viewer: Viewer,
  input: { name: string; sortOrder?: number },
): Promise<OrgUnitRow> {
  const [row] = await db
    .insert(orgUnits)
    .values({ name: input.name, sortOrder: input.sortOrder ?? 0 })
    .returning();
  if (!row) throw new Error("org_units insert가 행을 반환하지 않았습니다.");
  return row;
}

export async function renameOrgUnit(viewer: Viewer, id: string, name: string): Promise<void> {
  await db.update(orgUnits).set({ name, updatedAt: new Date() }).where(eq(orgUnits.id, id));
}

// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다(repositories/roles.ts와 같은 패턴).
export async function setOrgUnitArchived(viewer: Viewer, id: string, value: boolean): Promise<void> {
  if (value) {
    await db
      .update(orgUnits)
      .set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(and(eq(orgUnits.id, id), isNull(orgUnits.archivedAt)));
  } else {
    await db
      .update(orgUnits)
      .set({ archivedAt: null, archivedBy: null })
      .where(and(eq(orgUnits.id, id), isNotNull(orgUnits.archivedAt)));
  }
}

// 멱등 시드 전용 — 이미 있으면 건드리지 않는다(onConflictDoNothing).
export async function seedOrgUnit(
  viewer: Viewer,
  input: { name: string; sortOrder: number },
): Promise<boolean> {
  const inserted = await db
    .insert(orgUnits)
    .values(input)
    .onConflictDoNothing({ target: orgUnits.name })
    .returning({ id: orgUnits.id });
  return inserted.length > 0;
}
