import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { listSeatDuplicates } from "@/domain/people/seat-rules";
import { setUserArchived, updateUserResignationDate } from "@/repositories/users";
import { insertMembership } from "@/repositories/team-memberships";
import { NOW_2026 } from "./approvals-fixtures";
import { addTeam, makeAdmin, makeDelegatedRole, makeOrgTeam, makeSeated, uniqueName } from "./admin-cap-fixtures";

// 06.4-04(D-6405 · D-6413 · D-6415): 조직 화면 중복 보유자 — 자리 구간이 다른 보유자와 겹치는 사람만, 이름 오름차순.
// 다른 시드 · 사례의 키는 보지 않고 이 사례가 만든 id만 단언한다(공유 erp_test).

const deps = { now: () => NOW_2026 };

async function duplicatesFor(viewer: Parameters<typeof listSeatDuplicates>[0]) {
  const result = await listSeatDuplicates(viewer, deps);
  if (result === null) throw new Error("관리자에게 null");
  return result;
}

describe("조직 화면 중복 보유자(06.4 D-6405 · D-6413)", () => {
  it("팀장 둘인 팀 · 책임자 둘인 본부는 보유자를 이름 오름차순으로 · 한 명인 팀은 키 없음", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId: t1 } = await makeOrgTeam();
    const t2 = await addTeam(orgUnitId);
    const late = await makeSeated(uniqueName("하"), TEAM_LEAD_ROLE_ID, t1);
    const early = await makeSeated(uniqueName("가"), TEAM_LEAD_ROLE_ID, t1);
    await makeSeated(uniqueName("나"), TEAM_LEAD_ROLE_ID, t2);
    const headB = await makeSeated(uniqueName("바"), DIVISION_HEAD_ROLE_ID, t1);
    const headA = await makeSeated(uniqueName("다"), DIVISION_HEAD_ROLE_ID, t2);

    const result = await duplicatesFor(admin);

    expect(result.teams[t1]?.map((holder) => holder.userId)).toEqual([early.id, late.id]);
    expect(result.teams[t1]?.[0]?.name.startsWith("가-")).toBe(true);
    expect(result.orgUnits[orgUnitId]?.map((holder) => holder.userId)).toEqual([headA.id, headB.id]);
    expect(result.teams[t2]).toBeUndefined();
  });

  it("팀장 하나를 보관하면 그 팀 키가 사라진다", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const one = await makeSeated(uniqueName("팀장"), TEAM_LEAD_ROLE_ID, teamId);
    await makeSeated(uniqueName("팀장"), TEAM_LEAD_ROLE_ID, teamId);
    expect((await duplicatesFor(admin)).teams[teamId]).toHaveLength(2);

    await setUserArchived(SYSTEM_VIEWER, one.id, true);

    expect((await duplicatesFor(admin)).teams[teamId]).toBeUndefined();
  });

  it("퇴직일이 지난 팀장은 세지 않는다", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const gone = await makeSeated(uniqueName("팀장"), TEAM_LEAD_ROLE_ID, teamId);
    await makeSeated(uniqueName("팀장"), TEAM_LEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, gone.id, "2026-09-01");

    expect((await duplicatesFor(admin)).teams[teamId]).toBeUndefined();
  });

  it("(D-6415) 퇴직 예정 팀장과 다음 날부터의 후임은 중복이 아니다 · 겹치는 셋째가 오면 각자 누군가와 겹치는 사람 전원", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const leaving = await makeSeated(uniqueName("라"), TEAM_LEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, leaving.id, "2026-12-31");
    const successor = await makeSeated(uniqueName("마"), TEAM_LEAD_ROLE_ID, teamId, "2027-01-01");

    expect((await duplicatesFor(admin)).teams[teamId]).toBeUndefined();

    const third = await makeSeated(uniqueName("사"), TEAM_LEAD_ROLE_ID, teamId);

    expect((await duplicatesFor(admin)).teams[teamId]?.map((holder) => holder.userId)).toEqual([
      leaving.id,
      successor.id,
      third.id,
    ]);
  });

  it("(D-6415) 남는 것은 다른 보유자와 겹치는 사람만 — 겹치지 않는 후임 예약은 빠진다", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const elsewhere = await addTeam(orgUnitId);
    const leaving = await makeSeated(uniqueName("라"), TEAM_LEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, leaving.id, "2026-12-31");
    const successor = await makeSeated(uniqueName("마"), TEAM_LEAD_ROLE_ID, teamId, "2027-01-01");
    // 사: 이 팀 구간이 2026-11-29에 끝난다(11-30부터 다른 팀) — 라와만 겹치고 마와는 겹치지 않는다.
    const brief = await makeSeated(uniqueName("사"), TEAM_LEAD_ROLE_ID, teamId);
    await insertMembership(SYSTEM_VIEWER, { userId: brief.id, teamId: elsewhere, effectiveFrom: "2026-11-30" });

    const holders = (await duplicatesFor(admin)).teams[teamId]?.map((holder) => holder.userId);

    expect(holders).toEqual([leaving.id, brief.id]);
    expect(holders).not.toContain(successor.id);
  });
});

describe("조직 화면 중복 노출 게이트(06.4 D-6405)", () => {
  it("person.value를 보지 않는 뷰어 → null", async () => {
    const roleId = await makeDelegatedRole({
      copyFrom: [],
      menus: [{ menu: "admin.people", action: "view" }],
      infoItems: ["team.value"],
    });
    const viewer = await makeSeated(uniqueName("위임"), roleId, null);
    expect(await listSeatDuplicates(viewer, deps)).toBeNull();
  });

  it("team.value를 보지 않는 뷰어 → null", async () => {
    const roleId = await makeDelegatedRole({
      copyFrom: [],
      menus: [{ menu: "admin.people", action: "view" }],
      infoItems: ["person.value"],
    });
    const viewer = await makeSeated(uniqueName("위임"), roleId, null);
    expect(await listSeatDuplicates(viewer, deps)).toBeNull();
  });

  it("admin.people 보기가 없는 뷰어 → null", async () => {
    const roleId = await makeDelegatedRole({
      copyFrom: [],
      menus: [],
      infoItems: ["person.value", "team.value"],
    });
    const viewer = await makeSeated(uniqueName("위임"), roleId, null);
    expect(await listSeatDuplicates(viewer, deps)).toBeNull();
  });

  it("셋 다 있으면 계산한다(게이트 통과 대조)", async () => {
    const roleId = await makeDelegatedRole({
      copyFrom: [],
      menus: [{ menu: "admin.people", action: "view" }],
      infoItems: ["person.value", "team.value"],
    });
    const viewer = await makeSeated(uniqueName("위임"), roleId, null);
    expect(await listSeatDuplicates(viewer, deps)).not.toBeNull();
  });
});
