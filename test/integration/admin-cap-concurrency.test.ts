import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { LastAdminError } from "@/domain/permissions/last-admin";
import { changePersonRole } from "@/domain/people";
import { assignTeam } from "@/domain/org";
import { SeatTakenError } from "@/domain/people/seat-rules";
import { findPermission } from "@/repositories/permissions";
import { listSeatHolders } from "@/repositories/seats";
import { countActiveAdmins } from "@/repositories/users";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { holdKey, makeAdmin, makeAdminRole, makeOrgTeam, makeSeated, uniqueName, waitingOnKey } from "./admin-cap-fixtures";

// 06.4(D-6408 · 성공 기준 5): 다른 관리자 계급의 두 관리자가 서로의 계급 관리자 칸을 동시에 끄면 하나만 성공한다 —
// seat:admin:last 잠금 뒤 같은 tx 재조회.

const ADMIN_KEY = "seat:admin:last";
const deps = { now: () => NOW_2026 };
const off = (roleId: string) => ({ roleId, menu: "admin.permissions", action: "write" as const, allowed: false });

// 시스템 관리자 X(계급 A) · 커스텀 관리자 계급 B의 P만 관리자.
async function world() {
  const x = await makeAdmin("관리자 X");
  const roleB = await makeAdminRole("관리자급 B");
  const p = await makePerson("관리자 P", roleB, null);
  return { x, p, roleB };
}

async function expectExactlyOneWins(results: PromiseSettledResult<void>[], roleB: string): Promise<void> {
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const loser = results.find((result) => result.status === "rejected");
  const reason: unknown = loser?.status === "rejected" ? loser.reason : null;
  expect(reason).toBeInstanceOf(LastAdminError);
  expect((reason as LastAdminError).message).toBe("마지막 관리자 · 관리자 먼저 지정");
  const cells = [
    (await findPermission(SYSTEM_VIEWER, roleB, "admin.permissions", "write"))?.allowed,
    (await findPermission(SYSTEM_VIEWER, SYSADMIN_ROLE_ID, "admin.permissions", "write"))?.allowed,
  ];
  expect(cells.filter((allowed) => allowed === true)).toHaveLength(1);
  expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-18" })).toBeGreaterThanOrEqual(1);
}

describe("관리자 키 경합(06.4 D-6408 · 성공 기준 5)", () => {
  it("관리자 키를 쥔 동안 서로의 관리자 칸 끄기 두 저장이 그 키에서 둘 다 기다리고, 풀면 하나만 성공 · 하나는 마지막 관리자", async () => {
    const { x, p, roleB } = await world();
    const holder = await holdKey(ADMIN_KEY);

    const both = Promise.allSettled([
      setPermissionCell(x, off(roleB), deps),
      setPermissionCell(p, off(SYSADMIN_ROLE_ID), deps),
    ]);
    let waiting = 0;
    for (let tries = 0; tries < 60 && waiting < 2; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waiting = await waitingOnKey(ADMIN_KEY);
    }
    await holder.release();
    const results = await both;

    expect(waiting).toBe(2);
    await expectExactlyOneWins(results, roleB);
  });

  it("홀더 없이 같은 두 저장도 하나만 성공 · 하나는 마지막 관리자(스모크)", async () => {
    const { x, p, roleB } = await world();

    const results = await Promise.allSettled([
      setPermissionCell(x, off(roleB), deps),
      setPermissionCell(p, off(SYSADMIN_ROLE_ID), deps),
    ]);

    await expectExactlyOneWins(results, roleB);
  });
});

// 06.4-02(D-6408 · 성공 기준 5): (a) 같은 팀 두 팀장 발령 (b) 두 관리자가 서로를 강등 (c) 계급 변경(X → 팀장) ∥ 발령(X → 팀장 있는
// 팀). 결정적 사례는 만나는 키를 홀더가 쥔 동안 두 저장이 그 키에서 기다림(pg_locks 2)을 확인한 뒤 푼다.

async function heldRace(key: string, race: () => Promise<PromiseSettledResult<void>[]>) {
  const holder = await holdKey(key);
  const both = race();
  let waiting = 0;
  for (let tries = 0; tries < 60 && waiting < 2; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    waiting = await waitingOnKey(key);
  }
  await holder.release();
  return { waiting, results: await both };
}

function loserOf(results: PromiseSettledResult<void>[]): unknown {
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const loser = results.find((result) => result.status === "rejected");
  return loser?.status === "rejected" ? loser.reason : null;
}

async function teamLeadsOf(teamId: string): Promise<string[]> {
  const holders = await listSeatHolders(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, today: "2026-09-18", teamIds: [teamId] }, db);
  return holders.map((holder) => holder.userId);
}

// (a) 팀 없는 팀장 A · B, 빈 팀 T.
async function sameTeamWorld() {
  const admin = await makeAdmin("관리자");
  const { teamId } = await makeOrgTeam();
  const a = await makeSeated(uniqueName("팀장A"), TEAM_LEAD_ROLE_ID, null);
  const b = await makeSeated(uniqueName("팀장B"), TEAM_LEAD_ROLE_ID, null);
  const race = () =>
    Promise.allSettled([
      assignTeam(admin, { userId: a.id, teamId, effectiveFrom: "2026-09-01" }, deps),
      assignTeam(admin, { userId: b.id, teamId, effectiveFrom: "2026-09-01" }, deps),
    ]);
  return { teamId, race };
}

// (b) 재직 관리자는 시스템 관리자 X · Y 둘뿐.
async function mutualDemoteWorld() {
  const x = await makeAdmin("관리자 X");
  const y = await makeAdmin("관리자 Y");
  const race = () =>
    Promise.allSettled([
      changePersonRole(x, y.id, DEFAULT_ROLE_ID, deps),
      changePersonRole(y, x.id, DEFAULT_ROLE_ID, deps),
    ]);
  return { race };
}

// (c) PM X는 팀장 없는 T1 소속, T3에는 팀장 Z.
async function roleVsAssignWorld() {
  const admin = await makeAdmin("관리자");
  const t1 = (await makeOrgTeam()).teamId;
  const t3 = (await makeOrgTeam()).teamId;
  const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, t3);
  const x = await makeSeated(uniqueName("PM X"), DEFAULT_ROLE_ID, t1);
  const race = () =>
    Promise.allSettled([
      changePersonRole(admin, x.id, TEAM_LEAD_ROLE_ID, deps),
      assignTeam(admin, { userId: x.id, teamId: t3, effectiveFrom: "2026-09-01" }, deps),
    ]);
  return { x, z, t3, race };
}

describe("자리 · 관리자 경합(06.4 D-6408 · 성공 기준 5)", () => {
  it("(a) 팀 키를 쥔 동안 같은 팀 두 팀장 발령이 그 키에서 둘 다 기다리고, 풀면 하나만 · 패자는 자리 거부", async () => {
    const { teamId, race } = await sameTeamWorld();

    const { waiting, results } = await heldRace("seat:team:" + teamId, race);

    expect(waiting).toBe(2);
    expect(loserOf(results)).toBeInstanceOf(SeatTakenError);
    expect(await teamLeadsOf(teamId)).toHaveLength(1);
  });

  it("(b) 관리자 키를 쥔 동안 두 관리자가 서로를 강등하면 둘 다 기다리고, 풀면 하나만 · 패자는 마지막 관리자", async () => {
    const { race } = await mutualDemoteWorld();

    const { waiting, results } = await heldRace(ADMIN_KEY, race);

    expect(waiting).toBe(2);
    expect(loserOf(results)).toBeInstanceOf(LastAdminError);
    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-18" })).toBe(1);
  });

  it("(c) 사람 키를 쥔 동안 계급 변경(X → 팀장) ∥ 발령(X → 팀장 있는 팀)이 둘 다 기다리고, 풀면 하나만 · T3 팀장은 Z 하나", async () => {
    const { x, z, t3, race } = await roleVsAssignWorld();

    const { waiting, results } = await heldRace("seat:person:" + x.id, race);

    expect(waiting).toBe(2);
    expect(loserOf(results)).toBeInstanceOf(SeatTakenError);
    expect(await teamLeadsOf(t3)).toEqual([z.id]);
  });

  it("(a) 스모크 — 홀더 없이 같은 팀 두 팀장 발령도 하나만", async () => {
    const { teamId, race } = await sameTeamWorld();

    expect(loserOf(await race())).toBeInstanceOf(SeatTakenError);
    expect(await teamLeadsOf(teamId)).toHaveLength(1);
  });

  it("(b) 스모크 — 홀더 없이 서로 강등도 하나만", async () => {
    const { race } = await mutualDemoteWorld();

    expect(loserOf(await race())).toBeInstanceOf(LastAdminError);
    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-18" })).toBe(1);
  });

  it("(c) 스모크 — 홀더 없이 계급 변경 ∥ 발령도 하나만", async () => {
    const { z, t3, race } = await roleVsAssignWorld();

    expect(loserOf(await race())).toBeInstanceOf(SeatTakenError);
    expect(await teamLeadsOf(t3)).toEqual([z.id]);
  });
});
