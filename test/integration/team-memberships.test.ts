import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import {
  createOrgUnit,
  createTeam,
  assignTeam,
  cancelFutureAssignment,
  listAssignments,
  teamAtDate,
  PastAssignmentCancelError,
  NotFoundError,
  ValidationError,
} from "@/domain/org";
import { queryActionLog } from "@/repositories/action-log";
import { listMemberships } from "@/repositories/team-memberships";

async function makeTestUser(): Promise<string> {
  const id = `test-user-${randomUUID()}`;
  await db.insert(users).values({
    id,
    name: "테스트 사람",
    email: `${randomUUID()}@test.local`,
    roleId: DEFAULT_ROLE_ID,
  });
  return id;
}

async function makeTestTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
  return team.id;
}

describe("team-memberships (MAST-02, 실제 Postgres) — 발령 이력·시점 소속", () => {
  it("같은 사람·같은 발령일로 두 번 등록하면 두 번째가 거부된다(복합 UNIQUE)", async () => {
    const userId = await makeTestUser();
    const teamId = await makeTestTeam();
    await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: "2026-01-01" });
    await expect(assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: "2026-01-01" })).rejects.toThrow();
  });

  it("발령 이력 목록이 발령일 내림차순이고 두 번 조회에서 순서가 같다", async () => {
    const userId = await makeTestUser();
    const teamA = await makeTestTeam();
    const teamB = await makeTestTeam();
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: teamA, effectiveFrom: "2026-01-01" });
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: teamB, effectiveFrom: "2026-03-01" });

    const first = await listAssignments(SYSTEM_VIEWER, userId);
    const second = await listAssignments(SYSTEM_VIEWER, userId);
    expect(first.map((a) => a.effectiveFrom)).toEqual(["2026-03-01", "2026-01-01"]);
    expect(second.map((a) => a.effectiveFrom)).toEqual(first.map((a) => a.effectiveFrom));
  });

  it("시점 조회가 실제 DB 라운드트립으로 경계 포함·가장 늦은 발령을 고른다", async () => {
    const userId = await makeTestUser();
    const teamA = await makeTestTeam();
    const teamB = await makeTestTeam();
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: teamA, effectiveFrom: "2026-01-01" });
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: teamB, effectiveFrom: "2026-02-01" });

    const onBoundary = await teamAtDate(SYSTEM_VIEWER, userId, "2026-02-01");
    expect(onBoundary?.id).toBe(teamB);

    const beforeSecond = await teamAtDate(SYSTEM_VIEWER, userId, "2026-01-15");
    expect(beforeSecond?.id).toBe(teamA);

    const beforeAny = await teamAtDate(SYSTEM_VIEWER, userId, "2025-12-31");
    expect(beforeAny).toBeNull();
  });

  it("이력이 없는 사람의 시점 소속은 null이다", async () => {
    const userId = await makeTestUser();
    const result = await teamAtDate(SYSTEM_VIEWER, userId, "2026-01-01");
    expect(result).toBeNull();
  });

  it("미래로 예정된 발령은 취소할 수 있고 과거·오늘 발령은 취소가 거부된다", async () => {
    const userId = await makeTestUser();
    const teamId = await makeTestTeam();
    const today = new Date().toISOString().slice(0, 10);
    const future = "2999-01-01";

    await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: today });
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: await makeTestTeam(), effectiveFrom: future });

    await expect(cancelFutureAssignment(SYSTEM_VIEWER, { userId, effectiveFrom: today })).rejects.toBeInstanceOf(
      PastAssignmentCancelError,
    );

    await cancelFutureAssignment(SYSTEM_VIEWER, { userId, effectiveFrom: future });
    const remaining = await listAssignments(SYSTEM_VIEWER, userId);
    expect(remaining.some((a) => a.effectiveFrom === future)).toBe(false);
    expect(remaining.some((a) => a.effectiveFrom === today)).toBe(true);
  });

  it("오늘 판정은 서울 날짜 기준이다 — KST 01:30(UTC 전날)에 오늘 발령은 취소가 거부된다", async () => {
    const userId = await makeTestUser();
    const teamId = await makeTestTeam();
    const now = () => new Date("2026-10-01T16:30:00Z"); // = 2026-10-02 01:30 KST

    await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: "2026-10-02" });

    await expect(
      cancelFutureAssignment(SYSTEM_VIEWER, { userId, effectiveFrom: "2026-10-02" }, { now }),
    ).rejects.toBeInstanceOf(PastAssignmentCancelError);
    const remaining = await listAssignments(SYSTEM_VIEWER, userId);
    expect(remaining.some((a) => a.effectiveFrom === "2026-10-02")).toBe(true);
  });

  it("YYYY-MM-DD가 아닌 발령일로는 취소할 수 없다 — 문자열 비교를 우회해 과거 발령을 지우지 못한다", async () => {
    const userId = await makeTestUser();
    const teamId = await makeTestTeam();
    const now = () => new Date("2026-10-01T03:00:00Z"); // = 2026-10-01 12:00 KST

    await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: "2026-09-30" });

    await expect(
      cancelFutureAssignment(SYSTEM_VIEWER, { userId, effectiveFrom: "2026-9-30" }, { now }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      cancelFutureAssignment(SYSTEM_VIEWER, { userId, effectiveFrom: "2027-02-30" }, { now }),
    ).rejects.toBeInstanceOf(ValidationError);
    const remaining = await listAssignments(SYSTEM_VIEWER, userId);
    expect(remaining.some((a) => a.effectiveFrom === "2026-09-30")).toBe(true);
  });

  it("같은 사람에게 두 발령이 동시에 들어와도 둘 다 남고 시점 조회는 발령일 기준으로 하나를 고른다", async () => {
    const userId = await makeTestUser();
    const teamA = await makeTestTeam();
    const teamB = await makeTestTeam();

    await Promise.all([
      assignTeam(SYSTEM_VIEWER, { userId, teamId: teamA, effectiveFrom: "2026-04-01" }),
      assignTeam(SYSTEM_VIEWER, { userId, teamId: teamB, effectiveFrom: "2026-05-01" }),
    ]);

    const all = await listAssignments(SYSTEM_VIEWER, userId);
    expect(all.length).toBe(2);

    const atApril = await teamAtDate(SYSTEM_VIEWER, userId, "2026-04-15");
    expect(atApril?.id).toBe(teamA);
    const atMay = await teamAtDate(SYSTEM_VIEWER, userId, "2026-05-15");
    expect(atMay?.id).toBe(teamB);
  });

  it("존재하지 않는 팀으로 발령을 만들면 거부된다", async () => {
    const userId = await makeTestUser();
    await expect(
      assignTeam(SYSTEM_VIEWER, { userId, teamId: randomUUID(), effectiveFrom: "2026-01-01" }),
    ).rejects.toThrow();
  });

  it("발령 기록이 행동 로그에 남는다", async () => {
    const userId = await makeTestUser();
    const teamId = await makeTestTeam();
    await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: "2026-06-01" });

    const log = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    expect(log.some((entry) => entry.entity === "team_membership")).toBe(true);
  });

  // quick 261001-85g — 미래 발령 취소(물리 삭제)도 같은 트랜잭션에서 행동 로그에 남는다.
  async function futureAssignment(): Promise<{ userId: string; membershipId: string }> {
    const userId = await makeTestUser();
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: await makeTestTeam(), effectiveFrom: "2999-01-01" });
    const [row] = await listMemberships(SYSTEM_VIEWER, userId);
    if (!row) throw new Error("발령 행이 없습니다.");
    return { userId, membershipId: row.id };
  }

  async function deleteLogsFor(userId: string) {
    const log = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_delete" });
    return log.filter((entry) => entry.entity === "team_membership" && (entry.detail as { userId?: string }).userId === userId);
  }

  it("미래 발령을 취소하면 document_delete 기록이 지운 발령 행 id로 한 건 남는다", async () => {
    const { userId, membershipId } = await futureAssignment();
    await cancelFutureAssignment(SYSTEM_VIEWER, { userId, effectiveFrom: "2999-01-01" });

    const logs = await deleteLogsFor(userId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.entityId).toBe(membershipId);
    expect(logs[0]?.detail).toEqual({ userId, effectiveFrom: "2999-01-01" });
  });

  it("취소 기록이 실패하면 발령도 지워지지 않는다(같은 트랜잭션)", async () => {
    const { userId } = await futureAssignment();
    const failure = new Error("action log down");
    await expect(
      cancelFutureAssignment(SYSTEM_VIEWER, { userId, effectiveFrom: "2999-01-01" }, { recordAction: () => Promise.reject(failure) }),
    ).rejects.toBe(failure);

    const remaining = await listAssignments(SYSTEM_VIEWER, userId);
    expect(remaining.some((a) => a.effectiveFrom === "2999-01-01")).toBe(true);
  });

  it("없는 발령 취소는 NotFoundError이고 기록을 남기지 않는다", async () => {
    const userId = await makeTestUser();
    await expect(cancelFutureAssignment(SYSTEM_VIEWER, { userId, effectiveFrom: "2999-01-01" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await deleteLogsFor(userId)).toEqual([]);
  });
});
