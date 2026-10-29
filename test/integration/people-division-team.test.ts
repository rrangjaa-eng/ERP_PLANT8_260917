import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teamMemberships, users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { assignTeam, createOrgUnit, teamAtDate } from "@/domain/org";
import { setPersonDivision } from "@/domain/people";
import { queryActionLog } from "@/repositories/action-log";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { makePerson } from "./approvals-fixtures";
import { holdKey, makeOrgTeam, waitingOnKey } from "./admin-cap-fixtures";

// 07.1-14(D-E2 · E-P2-43 · CG-05 · E-P2-42): 팀 발령이 같은 tx에서 사람 본부 칸을 비우고, 본부 저장과 팀 발령이 같은 사람 키에서
// 줄 서서 「오늘 팀 + 본부 칸」이 남지 않는다.

async function newDivision(): Promise<{ id: string; name: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `발령본부-${randomUUID().slice(0, 8)}` });
  return { id: orgUnit.id, name: orgUnit.name };
}

async function divisionOf(userId: string): Promise<string | null> {
  const [row] = await db.select({ divisionId: users.divisionId }).from(users).where(eq(users.id, userId));
  return row?.divisionId ?? null;
}

async function divisionLogs(userId: string): Promise<unknown[]> {
  const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "permission_change" });
  return rows
    .filter((row) => row.entity === "user" && row.entityId === userId)
    .map((row) => (row.detail as { changes?: Record<string, unknown> } | null)?.changes?.division)
    .filter((value) => value !== undefined);
}

async function assignmentLogs(userId: string): Promise<number> {
  const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
  const memberships = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(eq(teamMemberships.userId, userId));
  const ids = new Set(memberships.map((row) => row.id));
  return rows.filter((row) => row.entity === "team_membership" && ids.has(row.entityId ?? "")).length;
}

describe("팀 발령이 본부 칸을 비운다(D-E2 · E-P2-43)", () => {
  it("본부 B가 있는 팀 없는 P에게 오늘 팀 발령 → 칸 null · 본부 로그 [B 이름, null] 한 행 · 발령 로그 그대로", async () => {
    const division = await newDivision();
    const { teamId } = await makeOrgTeam();
    const p = await makePerson("발령본부P", DEFAULT_ROLE_ID, null);
    await setPersonDivision(SYSTEM_VIEWER, p.id, division.id);

    await assignTeam(SYSTEM_VIEWER, { userId: p.id, teamId, effectiveFrom: seoulToday() });

    expect(await divisionOf(p.id)).toBeNull();
    expect(await divisionLogs(p.id)).toEqual([[null, division.name], [division.name, null]]);
    expect(await assignmentLogs(p.id)).toBe(1);
  });

  it("미래 발령도 칸을 비우고 · 시작일 전 본부 재입력은 거부 「팀 발령 있음 · 본부는 팀에서」(N-P2-B)", async () => {
    const division = await newDivision();
    const other = await newDivision();
    const { teamId } = await makeOrgTeam();
    const p = await makePerson("발령본부미래", DEFAULT_ROLE_ID, null);
    await setPersonDivision(SYSTEM_VIEWER, p.id, division.id);

    await assignTeam(SYSTEM_VIEWER, { userId: p.id, teamId, effectiveFrom: addDays(seoulToday(), 7) });

    expect(await divisionOf(p.id)).toBeNull();
    expect(await divisionLogs(p.id)).toEqual([[null, division.name], [division.name, null]]);
    await expect(setPersonDivision(SYSTEM_VIEWER, p.id, other.id)).rejects.toThrow("팀 발령 있음 · 본부는 팀에서");
    expect(await divisionOf(p.id)).toBeNull();
  });

  it("본부 칸이 비어 있던 사람의 발령은 본부 로그를 남기지 않는다(발령 로그만)", async () => {
    const { teamId } = await makeOrgTeam();
    const p = await makePerson("발령본부없음", DEFAULT_ROLE_ID, null);

    await assignTeam(SYSTEM_VIEWER, { userId: p.id, teamId, effectiveFrom: seoulToday() });

    expect(await divisionLogs(p.id)).toEqual([]);
    expect(await assignmentLogs(p.id)).toBe(1);
  });
});

describe("본부 저장 ∥ 팀 발령(CG-05 · E-P2-42)", () => {
  it("같은 사람 키에서 둘이 기다린 뒤 풀면 어느 차례든 칸 null · 오늘 팀 T · 진 본부 저장은 「팀 있음 · 본부는 팀에서」", async () => {
    const division = await newDivision();
    const { teamId } = await makeOrgTeam();
    const p = await makePerson("경합본부P", DEFAULT_ROLE_ID, null);
    const today = seoulToday();
    const key = `seat:person:${p.id}`;

    const holder = await holdKey(key);
    const both = Promise.allSettled([
      setPersonDivision(SYSTEM_VIEWER, p.id, division.id),
      assignTeam(SYSTEM_VIEWER, { userId: p.id, teamId, effectiveFrom: today }),
    ]);
    let waiting = 0;
    for (let tries = 0; tries < 60 && waiting < 2; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waiting = await waitingOnKey(key);
    }
    await holder.release();
    const [division_, assignment] = await both;

    expect(waiting).toBe(2);
    expect(assignment.status).toBe("fulfilled");
    if (division_.status === "rejected") {
      expect((division_.reason as Error).message).toBe("팀 있음 · 본부는 팀에서");
    }
    expect(await divisionOf(p.id)).toBeNull();
    expect((await teamAtDate(SYSTEM_VIEWER, p.id, today))?.id).toBe(teamId);
  });
});
