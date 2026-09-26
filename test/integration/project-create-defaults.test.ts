import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { loadCreatorDefaults } from "@/domain/projects/references";

// 결정 2(사용자 결정 2026-09-26) — 새 프로젝트 등록의 담당 PM은 등록하는 사람, 팀은 그 사람의
// 오늘(KST) 소속 팀(가장 최근 발령)으로 미리 채운다.
async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
  return team.id;
}

async function makePerson(): Promise<{ id: string; roleId: string }> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `defaults-${randomUUID()}@example.test`,
    name: "등록 기본값 테스트 사람",
    roleId: "role-pm",
  });
  return { id: userId, roleId: "role-pm" };
}

describe("loadCreatorDefaults (결정 2)", () => {
  it("담당 PM은 등록하는 사람, 팀은 오늘 기준 가장 최근 발령 팀이다(미래 발령은 아직 아니다)", async () => {
    const [oldTeam, currentTeam, futureTeam] = [await makeTeam(), await makeTeam(), await makeTeam()];
    const viewer = await makePerson();
    await assignTeam(SYSTEM_VIEWER, { userId: viewer.id, teamId: oldTeam, effectiveFrom: "2020-01-01" });
    await assignTeam(SYSTEM_VIEWER, { userId: viewer.id, teamId: currentTeam, effectiveFrom: "2026-01-01" });
    await assignTeam(SYSTEM_VIEWER, { userId: viewer.id, teamId: futureTeam, effectiveFrom: "2026-12-01" });

    expect(await loadCreatorDefaults(viewer, { todayKst: "2026-09-26" })).toEqual({
      pmUserId: viewer.id,
      teamId: currentTeam,
    });
  });

  it("발령이 없으면 팀은 null(임의의 팀으로 떨어지지 않는다)", async () => {
    const viewer = await makePerson();
    expect(await loadCreatorDefaults(viewer, { todayKst: "2026-09-26" })).toEqual({ pmUserId: viewer.id, teamId: null });
  });
});
