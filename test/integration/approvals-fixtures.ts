import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { teams, orgUnits } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertMembership } from "@/repositories/team-memberships";

// 04.1 결재·연차 통합 테스트 공용 픽스처 — 사람·발령은 도메인·리포지토리
// 함수로만 만든다(SQL 직접 삽입 없음). 발령일은 주입 시계보다 앞선 고정 날짜다.
export const MEMBERSHIP_FROM = "2026-01-01";
// 트레이서 시계 — 2026-09-18 12:00 서울.
export const NOW_2026 = new Date("2026-09-18T03:00:00Z");

export async function teamIdByName(name: string): Promise<string> {
  const [team] = await db.select().from(teams).where(eq(teams.name, name)).limit(1);
  if (!team) throw new Error(`시드된 팀이 없습니다: ${name}`);
  return team.id;
}

export async function orgUnitIdByName(name: string): Promise<string> {
  const [unit] = await db.select().from(orgUnits).where(eq(orgUnits.name, name)).limit(1);
  if (!unit) throw new Error(`시드된 본부가 없습니다: ${name}`);
  return unit.id;
}

export async function makePerson(name: string, roleId: string, teamName: string | null): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `${randomUUID()}@example.test`,
    name,
    roleId,
  });
  if (teamName) {
    await insertMembership(SYSTEM_VIEWER, { userId, teamId: await teamIdByName(teamName), effectiveFrom: MEMBERSHIP_FROM });
  }
  return { id: userId, roleId };
}

export async function countRows(table: string): Promise<number> {
  const result = await db.execute<{ n: string }>(sql.raw(`SELECT count(*)::text AS n FROM "${table}"`));
  return Number(result.rows[0]?.n ?? 0);
}
