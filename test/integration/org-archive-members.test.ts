import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { archive, OrgHasMembersError } from "@/domain/archive";
import { assignTeam, orgMemberCounts, ForbiddenError as OrgForbiddenError } from "@/domain/org";
import { listPeoplePage, roleMemberCounts, ForbiddenError as PeopleForbiddenError } from "@/domain/people";
import { countActiveMembersOfRole } from "@/repositories/roles";
import { findTeamById } from "@/repositories/teams";
import { findOrgUnitById } from "@/repositories/org-units";
import { insertMembership } from "@/repositories/team-memberships";
import { updateUserResignationDate, setUserArchived } from "@/repositories/users";
import { NOW_2026, makePerson } from "./approvals-fixtures";
import { addTeam, countLogs, holdKey, makeAdmin, makeDelegatedRole, makeOrgTeam, makeSeated, uniqueName, waitingOnKey } from "./admin-cap-fixtures";

// 07-21(R10 · AQ-28): 사람 남은 팀 · 본부 보관 막기 — 소속 = 오늘 그 팀(본부는 그 아래 팀 전부)에 있거나 앞으로 그 팀으로 발령된
// 활성 사람(퇴직 · 보관 제외). 화면 숫자 · 사람 목록 필터 · 서버 거부가 같은 술어다. 오늘 = NOW_2026(2026-09-18 KST).

const deps = { now: () => NOW_2026 };
const TODAY = "2026-09-18";

async function refusal<E extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(type);
  return error as E;
}

async function teamArchived(teamId: string): Promise<boolean> {
  return (await findTeamById(SYSTEM_VIEWER, teamId))?.archivedAt != null;
}

async function waitFor(key: string, count: number): Promise<void> {
  for (let tries = 0; tries < 100 && (await waitingOnKey(key)) < count; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("팀 · 본부 보관 — 소속 사람이 남으면 거부(07-21 R10)", () => {
  it("활성 1명 팀 → OrgHasMembersError · 보관 안 됨 · 행동 로그 없음", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    await makeSeated(uniqueName("PM"), DEFAULT_ROLE_ID, teamId);
    const logsBefore = await countLogs("archive", "team", teamId);

    const error = await refusal(archive(admin, "team", teamId, deps), OrgHasMembersError);

    expect(error.message).toBe("소속 1명 · 먼저 옮기기");
    expect(error.count).toBe(1);
    expect(await teamArchived(teamId)).toBe(false);
    expect(await countLogs("archive", "team", teamId)).toBe(logsBefore);
  });

  it("퇴직일이 어제인 사람 · 보관된 사람만 남은 팀 → 보관 성공 · 로그 한 줄", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const retired = await makeSeated(uniqueName("퇴직"), DEFAULT_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, retired.id, "2026-09-17");
    const archivedPerson = await makeSeated(uniqueName("보관"), DEFAULT_ROLE_ID, teamId);
    await setUserArchived(SYSTEM_VIEWER, archivedPerson.id, true);

    await archive(admin, "team", teamId, deps);

    expect(await teamArchived(teamId)).toBe(true);
    expect(await countLogs("archive", "team", teamId)).toBe(1);
  });

  it("퇴직일이 오늘인 사람은 아직 소속 · 내일 그 팀으로 발령된 사람도 소속(AQ-28)", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const other = await addTeam(orgUnitId);
    const leaving = await makeSeated(uniqueName("오늘퇴직"), DEFAULT_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, leaving.id, TODAY);
    const coming = await makeSeated(uniqueName("내일발령"), DEFAULT_ROLE_ID, other);
    await insertMembership(SYSTEM_VIEWER, { userId: coming.id, teamId, effectiveFrom: "2026-09-19" });

    const error = await refusal(archive(admin, "team", teamId, deps), OrgHasMembersError);
    expect(error.count).toBe(2);
    // 내일 떠나는 사람은 오늘은 아직 other 소속이다.
    expect((await orgMemberCounts(admin, deps)).teams[other]).toBe(1);
  });

  it("오늘 다른 팀으로 옮긴 사람은 세지 않는다 → 보관 성공", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const other = await addTeam(orgUnitId);
    const moved = await makeSeated(uniqueName("옮김"), DEFAULT_ROLE_ID, teamId);
    await insertMembership(SYSTEM_VIEWER, { userId: moved.id, teamId: other, effectiveFrom: TODAY });

    await archive(admin, "team", teamId, deps);
    expect(await teamArchived(teamId)).toBe(true);
  });

  it("본부 = 그 아래 팀(보관 팀 포함) 소속 합 → 거부 · 본부 보관 안 됨", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const archivedTeam = await addTeam(orgUnitId);
    await makeSeated(uniqueName("A"), DEFAULT_ROLE_ID, teamId);
    await makeSeated(uniqueName("B"), DEFAULT_ROLE_ID, archivedTeam);
    await archive(SYSTEM_VIEWER, "team", archivedTeam, deps);

    const error = await refusal(archive(admin, "org_unit", orgUnitId, deps), OrgHasMembersError);

    expect(error.message).toBe("소속 2명 · 먼저 옮기기");
    expect((await findOrgUnitById(SYSTEM_VIEWER, orgUnitId))?.archivedAt).toBeNull();
    expect((await orgMemberCounts(admin, deps)).orgUnits[orgUnitId]).toBe(2);
  });

  it("빈 팀만 남은 본부는 보관된다(팀 수는 세지 않음 — D-P3-10)", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId } = await makeOrgTeam();
    await archive(admin, "org_unit", orgUnitId, deps);
    expect((await findOrgUnitById(SYSTEM_VIEWER, orgUnitId))?.archivedAt).not.toBeNull();
  });
});

describe("팀 보관 ∥ 그 팀 발령(07-21 T-07-21-02)", () => {
  async function race(first: "assign" | "archive"): Promise<{ admin: Viewer; teamId: string; userId: string; results: PromiseSettledResult<void>[] }> {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const elsewhere = await addTeam(orgUnitId);
    const person = await makeSeated(uniqueName("발령"), DEFAULT_ROLE_ID, elsewhere);
    const key = `seat:team:${teamId}`;
    const held = await holdKey(key);
    const assign = () => assignTeam(admin, { userId: person.id, teamId, effectiveFrom: "2026-09-01" }, deps);
    const archiveTeam = () => archive(admin, "team", teamId, deps);
    const one = first === "assign" ? assign() : archiveTeam();
    await waitFor(key, 1);
    const two = first === "assign" ? archiveTeam() : assign();
    await waitFor(key, 2);
    await held.release();
    const results = await Promise.allSettled([one, two]);
    return { admin, teamId, userId: person.id, results };
  }

  it("발령이 먼저 키를 잡으면 보관이 소속 1명으로 거부", async () => {
    const { teamId, results } = await race("assign");
    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]?.status === "rejected" ? results[1].reason : null).toBeInstanceOf(OrgHasMembersError);
    expect(await teamArchived(teamId)).toBe(false);
  });

  it("보관이 먼저 키를 잡으면 발령이 보관된 팀이라 거부 · 보관된 팀에 소속 사람 없음", async () => {
    const { admin, teamId, results } = await race("archive");
    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]?.status).toBe("rejected");
    expect(await teamArchived(teamId)).toBe(true);
    expect((await orgMemberCounts(admin, deps)).teams[teamId] ?? 0).toBe(0);
  });
});

describe("소속 숫자 = 서버 거부 숫자 = 사람 목록 필터 행 수(07-21)", () => {
  it("팀 · 본부 · 계급 숫자가 listPeoplePage 필터 total과 같다", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const second = await addTeam(orgUnitId);
    const roleId = await makeDelegatedRole({ name: "소속계급", copyFrom: [], menus: [] });
    await makeSeated(uniqueName("가"), roleId, teamId);
    await makeSeated(uniqueName("나"), roleId, teamId);
    const gone = await makeSeated(uniqueName("다"), roleId, second);
    await updateUserResignationDate(SYSTEM_VIEWER, gone.id, "2026-09-01");
    await makeSeated(uniqueName("라"), DEFAULT_ROLE_ID, second);

    const counts = await orgMemberCounts(admin, deps);
    expect(counts.teams[teamId]).toBe(2);
    expect(counts.teams[second]).toBe(1);
    expect(counts.orgUnits[orgUnitId]).toBe(3);
    expect((await listPeoplePage(admin, { teamId }, deps)).total).toBe(2);
    expect((await listPeoplePage(admin, { teamId: second }, deps)).total).toBe(1);
    expect((await listPeoplePage(admin, { orgUnitId }, deps)).total).toBe(3);

    const roleCounts = await roleMemberCounts(admin, [roleId], deps);
    expect(roleCounts[roleId]).toBe(2);
    expect(await countActiveMembersOfRole(admin, roleId, TODAY)).toBe(2);
    expect((await listPeoplePage(admin, { roleId }, deps)).total).toBe(2);
    const error = await refusal(archive(admin, "team", teamId, deps), OrgHasMembersError);
    expect(error.count).toBe(counts.teams[teamId]);
  });

  it("admin.people 보기가 없으면 숫자를 주지 않는다", async () => {
    const roleId = await makeDelegatedRole({ name: "보기없음", copyFrom: [], menus: [] });
    const nobody = await makePerson("보기없음", roleId, null);
    await refusal(orgMemberCounts(nobody, deps), OrgForbiddenError);
    await refusal(roleMemberCounts(nobody, [roleId], deps), PeopleForbiddenError);
  });
});
