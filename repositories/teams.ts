import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { orgUnits, teams } from "@/db/schema";
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

// 07-21: 사람 등록 · 발령 선택지 — 활성 팀 중 본부도 활성인 팀만(서버가 보관 팀 · 보관 본부 아래 배치를 거부한다). 보관함 보기 범위와 무관하다.
export async function listTeamsOfActiveOrgUnits(viewer: Viewer, opts: { scope: Scope }): Promise<TeamRow[]> {
  if (opts.scope.rows === "none") return [];
  const rows = await db
    .select({ team: teams })
    .from(teams)
    .innerJoin(orgUnits, eq(orgUnits.id, teams.orgUnitId))
    .where(and(isNull(orgUnits.archivedAt), isNull(teams.archivedAt)))
    .orderBy(teams.sortOrder, teams.name);
  return rows.map((row) => row.team);
}

export async function findTeamById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<TeamRow | null> {
  const [row] = await tx.select().from(teams).where(eq(teams.id, id)).limit(1);
  return row ?? null;
}

// 07-21(R10): 본부 아래 팀 id 전부(보관 팀 포함) — 본부 보관이 팀 자리 키를 잡을 때.
export async function listTeamIdsOfOrgUnit(viewer: Viewer, orgUnitId: string, tx: DbOrTx = db): Promise<string[]> {
  void viewer;
  const rows = await tx.select({ id: teams.id }).from(teams).where(eq(teams.orgUnitId, orgUnitId));
  return rows.map((row) => row.id);
}

// 목록 묶음 조회(이슈 #56) — findTeamById와 같은 의미로 보관 여부로 거르지
// 않는다. ids가 비면 조회 없이 []를 돌려준다.
export async function findTeamsByIds(viewer: Viewer, ids: string[]): Promise<TeamRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(teams).where(inArray(teams.id, ids));
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

export async function setTeamArchived(viewer: Viewer, id: string, value: boolean, tx: DbOrTx = db): Promise<boolean> {
  // 조건부 갱신이 실제로 바꾼 행이 있으면 참 — 범용 복원이 「이미 복원됨」 · 로그를 이 결과로 정한다(PR #149).
  const rows = value
    ? await tx
        .update(teams)
        .set({ archivedAt: new Date(), archivedBy: viewer.id })
        .where(and(eq(teams.id, id), isNull(teams.archivedAt)))
        .returning({ id: teams.id })
    : await tx
        .update(teams)
        .set({ archivedAt: null, archivedBy: null })
        .where(and(eq(teams.id, id), isNotNull(teams.archivedAt)))
        .returning({ id: teams.id });
  return rows.length > 0;
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
