import { and, eq, isNull, isNotNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { teams } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";

export type TeamRow = InferSelectModel<typeof teams>;

export async function listTeams(viewer: Viewer, opts: { scope: Scope }): Promise<TeamRow[]> {
  if (opts.scope.rows === "none") return [];
  return db
    .select()
    .from(teams)
    .where(opts.scope.includeArchived ? undefined : isNull(teams.archivedAt))
    .orderBy(teams.sortOrder, teams.name);
}

export async function findTeamById(viewer: Viewer, id: string): Promise<TeamRow | null> {
  const [row] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return row ?? null;
}

// orgUnitId 미존재는 FK 제약이 거부한다 — insert 전 별도 확인은 domain이 한다
// (원시 SQL 에러 대신 사람이 읽는 메시지를 주기 위해).
export async function insertTeam(
  viewer: Viewer,
  input: { orgUnitId: string; name: string; sortOrder?: number },
): Promise<TeamRow> {
  const [row] = await db
    .insert(teams)
    .values({ orgUnitId: input.orgUnitId, name: input.name, sortOrder: input.sortOrder ?? 0 })
    .returning();
  if (!row) throw new Error("teams insert가 행을 반환하지 않았습니다.");
  return row;
}

export async function renameTeam(viewer: Viewer, id: string, name: string): Promise<void> {
  await db.update(teams).set({ name, updatedAt: new Date() }).where(eq(teams.id, id));
}

export async function setTeamArchived(viewer: Viewer, id: string, value: boolean): Promise<void> {
  if (value) {
    await db
      .update(teams)
      .set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(and(eq(teams.id, id), isNull(teams.archivedAt)));
  } else {
    await db
      .update(teams)
      .set({ archivedAt: null, archivedBy: null })
      .where(and(eq(teams.id, id), isNotNull(teams.archivedAt)));
  }
}

// 멱등 시드 전용 — 이미 있으면 건드리지 않는다(onConflictDoNothing, 복합 unique 대상).
export async function seedTeam(
  viewer: Viewer,
  input: { orgUnitId: string; name: string; sortOrder: number },
): Promise<boolean> {
  const inserted = await db
    .insert(teams)
    .values(input)
    .onConflictDoNothing({ target: [teams.orgUnitId, teams.name] })
    .returning({ id: teams.id });
  return inserted.length > 0;
}
