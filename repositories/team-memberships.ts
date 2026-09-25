import { and, eq, inArray, isNull, lte, desc } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { permissionMatrix, roles, teamMemberships, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type TeamMembershipRow = InferSelectModel<typeof teamMemberships>;

// MAST-02: 발령일이 조회 날짜 이하인 행 중 가장 늦은 한 행(경계 포함) —
// domain/org/index.ts의 teamAtDate가 그대로 쓰는 시점 소속 조회.
export async function findMembershipAtDate(
  viewer: Viewer,
  userId: string,
  date: string,
): Promise<TeamMembershipRow | null> {
  const [row] = await db
    .select()
    .from(teamMemberships)
    .where(and(eq(teamMemberships.userId, userId), lte(teamMemberships.effectiveFrom, date)))
    .orderBy(desc(teamMemberships.effectiveFrom))
    .limit(1);
  return row ?? null;
}

// 사람별로 발령일 ≤ date 중 가장 늦은 한 행을 한 번에 가져온다(목록 N+1
// 제거, 이슈 #56). unique(userId, effectiveFrom)이라 결정적이다.
export async function findMembershipsAtDate(
  viewer: Viewer,
  userIds: string[],
  date: string,
): Promise<TeamMembershipRow[]> {
  if (userIds.length === 0) return [];
  return db
    .selectDistinctOn([teamMemberships.userId])
    .from(teamMemberships)
    .where(and(inArray(teamMemberships.userId, userIds), lte(teamMemberships.effectiveFrom, date)))
    .orderBy(teamMemberships.userId, desc(teamMemberships.effectiveFrom));
}

// 발령일 내림차순 — 두 번 조회에서 순서가 같다(정렬 키가 결정적).
export async function listMemberships(viewer: Viewer, userId: string): Promise<TeamMembershipRow[]> {
  return db
    .select()
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, userId))
    .orderBy(desc(teamMemberships.effectiveFrom));
}

// 같은 (userId, effectiveFrom) 중복은 복합 UNIQUE가 거부한다(도메인은 사전
// 검증 뒤 이 함수를 부르므로 정상 경로에서 이 제약에 걸릴 일이 없다 —
// 사람 등록의 보상 조치가 다루는 것은 이 제약이 아니라 인프라 오류다).
export async function insertMembership(
  viewer: Viewer,
  input: { userId: string; teamId: string; effectiveFrom: string; createdBy?: string | null },
): Promise<TeamMembershipRow> {
  const [row] = await db
    .insert(teamMemberships)
    .values({
      userId: input.userId,
      teamId: input.teamId,
      effectiveFrom: input.effectiveFrom,
      createdBy: input.createdBy ?? viewer.id,
    })
    .returning();
  if (!row) throw new Error("team_memberships insert가 행을 반환하지 않았습니다.");
  return row;
}

// 미래로 예정된 발령만 삭제한다 — "미래"의 판정은 domain(cancelFutureAssignment)이
// 하고, 이 함수는 (userId, effectiveFrom) 좌표의 행을 지우기만 한다(append-only
// 원칙: 과거·오늘 발령을 지우는 경로는 domain에 없다).
export async function deleteMembership(viewer: Viewer, userId: string, effectiveFrom: string): Promise<number> {
  const deleted = await db
    .delete(teamMemberships)
    .where(and(eq(teamMemberships.userId, userId), eq(teamMemberships.effectiveFrom, effectiveFrom)))
    .returning({ id: teamMemberships.id });
  return deleted.length;
}

// 04-11(사용자 D20 · 엔지 리뷰 A §1 P2): 팀장 후보 — date에 그 팀에 발령된 사람(사람마다 가장
// 늦은 발령, findMembershipsAtDate와 같은 조건) 중 보관되지 않았고, 계급의 업무 범위가 team이며
// 권한표에서 projects.status 쓰기가 허용된 사람. 한 문장이다(사람 × 발령 × 권한 N+1 없음).
// 계급 이름·id를 박지 않는다. 이름순은 호출자가 JS로 정한다(DB 정렬 규칙이 환경마다 다르다).
// 04-22(리뷰 S4): 기간 앞당기기 문구는 menu "projects.period"로 기간 쓰기 보유자에서 찾는다.
export async function teamLeadCandidatesAtDate(
  viewer: Viewer,
  input: { teamId: string; date: string; menu?: "projects.status" | "projects.period" },
  tx?: DbOrTx,
): Promise<{ userId: string; name: string }[]> {
  void viewer;
  const latest = db
    .selectDistinctOn([teamMemberships.userId], { userId: teamMemberships.userId, teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(lte(teamMemberships.effectiveFrom, input.date))
    .orderBy(teamMemberships.userId, desc(teamMemberships.effectiveFrom))
    .as("latest_memberships");
  return (tx ?? db)
    .select({ userId: users.id, name: users.name })
    .from(latest)
    .innerJoin(users, eq(users.id, latest.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .innerJoin(
      permissionMatrix,
      and(
        eq(permissionMatrix.roleId, roles.id),
        eq(permissionMatrix.menu, input.menu ?? "projects.status"),
        eq(permissionMatrix.action, "write"),
        eq(permissionMatrix.allowed, true),
      ),
    )
    .where(and(eq(latest.teamId, input.teamId), isNull(users.archivedAt), eq(roles.workScope, "team")));
}
