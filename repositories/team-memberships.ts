import { and, eq, lte, desc } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { teamMemberships } from "@/db/schema";
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
