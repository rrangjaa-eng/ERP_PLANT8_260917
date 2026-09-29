import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { orgUnits, roles, teamMemberships, teams, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 04.1(EXP-04): 결재선 해석용 조직 스냅숏 — 보관되지 않은 사람마다 id · 이름 ·
// 계급 · asOf 이하 최신 발령의 팀 id · 그 팀의 본부 id를 쿼리 한 번으로 읽는다
// (사람마다 따로 조회하지 않는다). 발령이 없거나 그 팀 · 본부가 보관됐으면 null이다.
export type OrgSnapshotRow = {
  id: string;
  name: string;
  roleId: string | null;
  teamId: string | null;
  orgUnitId: string | null;
};

export async function listOrgSnapshot(viewer: Viewer, asOf: string, tx: DbOrTx = db): Promise<OrgSnapshotRow[]> {
  void viewer;
  const latest = db
    .selectDistinctOn([teamMemberships.userId], { userId: teamMemberships.userId, teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(lte(teamMemberships.effectiveFrom, asOf))
    .orderBy(teamMemberships.userId, desc(teamMemberships.effectiveFrom))
    .as("latest_memberships");

  return tx
    .select({
      id: users.id,
      name: users.name,
      roleId: users.roleId,
      teamId: teams.id,
      orgUnitId: orgUnits.id,
    })
    .from(users)
    .leftJoin(latest, eq(latest.userId, users.id))
    // 살아 있는 조직만 — 보관된 팀이면 팀 · 본부가 null, 보관된 본부면 본부가 null(설정 화면의 「부서 없음 · 빈 자리」
    // 경고와 같은 판정 — Codex P2). 그 단계는 빈 자리가 되어 건너뛰거나 대표 폴백을 탄다.
    .leftJoin(teams, and(eq(teams.id, latest.teamId), isNull(teams.archivedAt)))
    .leftJoin(orgUnits, and(eq(orgUnits.id, teams.orgUnitId), isNull(orgUnits.archivedAt)))
    // 04.1-03(계획 가정 5): 퇴직일 당일까지는 후보, 퇴직일 < asOf면 빠진다(담당 소멸).
    .where(and(isNull(users.archivedAt), or(isNull(users.resignationDate), gte(users.resignationDate, asOf))))
    .orderBy(asc(users.name), asc(users.id));
}

// 결재 단계 이름(계급 이름 · 부서 이름)의 재료 — 트랜잭션 전에 한 번 읽는다.
export async function listRouteLabelNames(
  viewer: Viewer,
): Promise<{ roles: { id: string; name: string }[]; orgUnits: { id: string; name: string }[]; teams: { id: string; name: string }[] }> {
  void viewer;
  const roleRows = await db.select({ id: roles.id, name: roles.name }).from(roles);
  const orgUnitRows = await db.select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits);
  const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams);
  return { roles: roleRows, orgUnits: orgUnitRows, teams: teamRows };
}
