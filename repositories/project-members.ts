import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { projectMembers, teamMemberships, teams, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06.2-05(D-6209): 프로젝트 참여자 줄 — 붙이기는 되살림-또는-삽입, 떼기는 archived_at(A9).
// 줄을 지우는 함수는 두지 않는다(06.2-04 구조 테스트 ⓔ) — 뗀 기록은 project_member_change 행동 로그가 남긴다.
// 같은 (프로젝트, 사람)에 살아 있는 줄은 하나 — 경쟁은 부분 유니크 project_members_live_uniq가 막는다.

export async function findLiveMemberUserIds(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<Set<string>> {
  void viewer;
  const rows = await tx
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), isNull(projectMembers.archivedAt)));
  return new Set(rows.map((row) => row.userId));
}

// 06.2-10(D-6214): 그 사람이 살아 있는 참여 줄을 가진 프로젝트 — 지출결의 쓰기 게이트용(보임 판정 뒤에 읽는다). 빈 목록이면 질의하지 않는다.
export async function listLiveMemberProjectIds(viewer: Viewer, userId: string, projectIds: string[], tx: DbOrTx = db): Promise<Set<string>> {
  void viewer;
  if (projectIds.length === 0) return new Set();
  const rows = await tx
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, projectIds), isNull(projectMembers.archivedAt)));
  return new Set(rows.map((row) => row.projectId));
}

// 사람마다 가장 최근 보관 줄을 되살리고(created_at 그대로 — 「되돌리면 같은 자리」) 보관 줄이 없는 사람만 새로 넣는다
// (260907 `O: server/src/projects.ts:3994-4007` UPDATE 뒤 INSERT와 같은 순서). 되살리거나 넣은 줄 수를 돌려준다.
export async function reviveOrInsertMembers(
  viewer: Viewer,
  input: { projectId: string; userIds: string[]; addedBy: string },
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  if (input.userIds.length === 0) return 0;
  // 하위 질의는 문장 안에 박혀 tx로 돈다(listOrgSnapshot 꼴 — 트랜잭션 객체에는 selectDistinctOn이 없다).
  const latestArchived = db
    .selectDistinctOn([projectMembers.userId], { id: projectMembers.id })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, input.projectId),
        inArray(projectMembers.userId, input.userIds),
        isNotNull(projectMembers.archivedAt),
      ),
    )
    .orderBy(projectMembers.userId, desc(projectMembers.archivedAt), desc(projectMembers.createdAt));
  const revived = await tx
    .update(projectMembers)
    .set({ archivedAt: null, addedBy: input.addedBy })
    .where(inArray(projectMembers.id, latestArchived))
    .returning({ userId: projectMembers.userId });
  const revivedIds = new Set(revived.map((row) => row.userId));
  const fresh = input.userIds.filter((userId) => !revivedIds.has(userId));
  if (fresh.length > 0) {
    await tx.insert(projectMembers).values(fresh.map((userId) => ({ projectId: input.projectId, userId, addedBy: input.addedBy })));
  }
  return revived.length + fresh.length;
}

// 떼기 — 살아 있는 줄의 archived_at만 채운다(사람 상태를 보지 않는다 — 퇴직 · 보관된 참여자도 뗀다, D-6222). 바뀐 줄이 있으면 참.
export async function archiveLiveMember(viewer: Viewer, input: { projectId: string; userId: string }, tx: DbOrTx = db): Promise<boolean> {
  void viewer;
  const rows = await tx
    .update(projectMembers)
    .set({ archivedAt: new Date() })
    .where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId), isNull(projectMembers.archivedAt)))
    .returning({ id: projectMembers.id });
  return rows.length > 0;
}

// 후보 검사 없는 보관 해제 — 되돌리기 전용, 새 줄을 만들지 않는다(restoreHolidayById 꼴). 살아 있는 줄이 없을 때만
// 그 사람의 가장 최근 보관 줄 하나를 되살린다(created_at 그대로 — 「되돌리면 같은 자리」). 바뀐 줄이 있으면 참.
export async function restoreArchivedMember(
  viewer: Viewer,
  input: { projectId: string; userId: string; restoredBy: string },
  tx: DbOrTx = db,
): Promise<boolean> {
  void viewer;
  const latestArchived = db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, input.projectId),
        eq(projectMembers.userId, input.userId),
        isNotNull(projectMembers.archivedAt),
        sql`not exists (select 1 from ${projectMembers} live where live.project_id = ${input.projectId} and live.user_id = ${input.userId} and live.archived_at is null)`,
      ),
    )
    .orderBy(desc(projectMembers.archivedAt), desc(projectMembers.createdAt))
    .limit(1);
  const rows = await tx
    .update(projectMembers)
    .set({ archivedAt: null, addedBy: input.restoredBy })
    .where(inArray(projectMembers.id, latestArchived))
    .returning({ id: projectMembers.id });
  return rows.length > 0;
}

// 참여자 표 한 행의 재료 — 이름 · 퇴직일 · 사람 보관 · asOf 이하 최신 발령의 보관 안 된 팀 이름(없으면 null).
// 퇴직 · 보관된 사람도 빠지지 않는다(D-6222 — users 쪽 거름 없음). 퇴직 판정(퇴직일 < 오늘)은 domain이 한다.
export type MemberPersonRow = {
  userId: string;
  name: string;
  resignationDate: string | null;
  userArchivedAt: Date | null;
  teamName: string | null;
};

// listOrgSnapshot의 latest 하위 질의 꼴 — 사람마다 asOf 이하 가장 늦은 발령 한 줄.
function latestMemberships(asOf: string) {
  return db
    .selectDistinctOn([teamMemberships.userId], { userId: teamMemberships.userId, teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(lte(teamMemberships.effectiveFrom, asOf))
    .orderBy(teamMemberships.userId, desc(teamMemberships.effectiveFrom))
    .as("latest_memberships");
}

export async function listLiveMembersWithPeople(viewer: Viewer, projectId: string, asOf: string, tx: DbOrTx = db): Promise<MemberPersonRow[]> {
  void viewer;
  const latest = latestMemberships(asOf);
  return tx
    .select({
      userId: users.id,
      name: users.name,
      resignationDate: users.resignationDate,
      userArchivedAt: users.archivedAt,
      teamName: teams.name,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .leftJoin(latest, eq(latest.userId, users.id))
    .leftJoin(teams, and(eq(teams.id, latest.teamId), isNull(teams.archivedAt)))
    .where(and(eq(projectMembers.projectId, projectId), isNull(projectMembers.archivedAt)))
    .orderBy(asc(projectMembers.createdAt), asc(projectMembers.id));
}

// 같은 투영으로 한 사람 — 참여자 섹션 첫 행(담당 PM)용. PM은 참여자 줄이 아니다.
export async function findPersonRow(viewer: Viewer, userId: string, asOf: string, tx: DbOrTx = db): Promise<MemberPersonRow | null> {
  void viewer;
  const latest = latestMemberships(asOf);
  const [row] = await tx
    .select({
      userId: users.id,
      name: users.name,
      resignationDate: users.resignationDate,
      userArchivedAt: users.archivedAt,
      teamName: teams.name,
    })
    .from(users)
    .leftJoin(latest, eq(latest.userId, users.id))
    .leftJoin(teams, and(eq(teams.id, latest.teamId), isNull(teams.archivedAt)))
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}
