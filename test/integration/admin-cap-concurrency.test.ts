import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError, setPermissionCell } from "@/domain/permissions/matrix";
import { LastAdminError } from "@/domain/permissions/last-admin";
import { changePersonRole, registerPerson, setResignationDate } from "@/domain/people";
import { archive, restore, type RestoreResult } from "@/domain/archive";
import { assignTeam } from "@/domain/org";
import { SeatTakenError } from "@/domain/people/seat-rules";
import { findPermission } from "@/repositories/permissions";
import { ADMIN_SEAT_LOCK_KEY, listSeatHolders } from "@/repositories/seats";
import { countActiveAdmins, findUserById, updateUserResignationDate } from "@/repositories/users";
import { queryActionLog } from "@/repositories/action-log";
import { createAccount } from "@/domain/auth/accounts";
import { recordAction } from "@/domain/action-log/record";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { holdKey, makeAdmin, makeAdminRole, makeOrgTeam, makeSeated, uniqueName, waitingOnKey } from "./admin-cap-fixtures";

// 06.4(D-6408 · 성공 기준 5): 두 관리자 계급의 관리자 칸을 동시에 끄면 하나만 성공한다 — seat:admin:last 잠금 뒤 같은 tx 재조회.
// 서로의 계급을 끄면 진 쪽은 앞선 저장에 강등돼 권한 없음(/review F5), 강등되지 않는 행위자면 마지막 관리자로 진다.

const deps = { now: () => NOW_2026 };
const off = (roleId: string) => ({ roleId, menu: "admin.permissions", action: "write" as const, allowed: false });

// 시스템 관리자 X(계급 A) · 커스텀 관리자 계급 B의 P만 관리자 — X와 P가 서로의 계급을 끈다.
async function mutualWorld() {
  const x = await makeAdmin("관리자 X");
  const roleB = await makeAdminRole("관리자급 B");
  const p = await makePerson("관리자 P", roleB, null);
  return { first: () => setPermissionCell(x, off(roleB), deps), second: () => setPermissionCell(p, off(SYSADMIN_ROLE_ID), deps), roleB };
}

// 위 둘(퇴직일 없음)에 더해 퇴직 예정 관리자 Q(계급 C) · R(계급 D) — 남은 쪽에 세지 않는 Q · R이 A · B를 끈다(강등 없음).
async function bystanderWorld() {
  await makeAdmin("관리자 X");
  const roleB = await makeAdminRole("관리자급 B");
  await makePerson("관리자 P", roleB, null);
  const q = await makePerson("관리자 Q", await makeAdminRole("관리자급 C"), null);
  const r = await makePerson("관리자 R", await makeAdminRole("관리자급 D"), null);
  await updateUserResignationDate(SYSTEM_VIEWER, q.id, "2026-12-31");
  await updateUserResignationDate(SYSTEM_VIEWER, r.id, "2026-12-31");
  return { first: () => setPermissionCell(q, off(SYSADMIN_ROLE_ID), deps), second: () => setPermissionCell(r, off(roleB), deps), roleB };
}

async function expectExactlyOneWins(
  results: PromiseSettledResult<unknown>[],
  roleB: string,
  loserType: typeof LastAdminError | typeof ForbiddenError,
  loserMessage: string,
): Promise<void> {
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const loser = results.find((result) => result.status === "rejected");
  const reason: unknown = loser?.status === "rejected" ? loser.reason : null;
  expect(reason).toBeInstanceOf(loserType);
  expect((reason as Error).message).toBe(loserMessage);
  const cells = [
    (await findPermission(SYSTEM_VIEWER, roleB, "admin.permissions", "write"))?.allowed,
    (await findPermission(SYSTEM_VIEWER, SYSADMIN_ROLE_ID, "admin.permissions", "write"))?.allowed,
  ];
  expect(cells.filter((allowed) => allowed === true)).toHaveLength(1);
  expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-18" })).toBeGreaterThanOrEqual(1);
}

describe("관리자 키 경합(06.4 D-6408 · 성공 기준 5)", () => {
  it("관리자 키를 쥔 동안 관리자 칸 끄기 두 저장이 그 키에서 둘 다 기다리고, 풀면 하나만 성공 · 하나는 마지막 관리자", async () => {
    const { first, second, roleB } = await bystanderWorld();
    const holder = await holdKey(ADMIN_SEAT_LOCK_KEY);

    const both = Promise.allSettled([first(), second()]);
    let waiting = 0;
    for (let tries = 0; tries < 60 && waiting < 2; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waiting = await waitingOnKey(ADMIN_SEAT_LOCK_KEY);
    }
    await holder.release();
    const results = await both;

    expect(waiting).toBe(2);
    await expectExactlyOneWins(results, roleB, LastAdminError, "마지막 관리자 · 관리자 먼저 지정");
  });

  it("서로의 계급 관리자 칸을 동시에 끄면 하나만 성공 · 진 쪽은 강등돼 권한 없음(/review F5)", async () => {
    const { first, second, roleB } = await mutualWorld();

    const results = await Promise.allSettled([first(), second()]);

    await expectExactlyOneWins(results, roleB, ForbiddenError, "권한표 변경 권한 없음");
  });
});

// 06.4-02(D-6408 · 성공 기준 5): (a) 같은 팀 두 팀장 발령 (b) 두 관리자가 서로를 강등 (c) 계급 변경(X → 팀장) ∥ 발령(X → 팀장 있는
// 팀). 결정적 사례는 만나는 키를 홀더가 쥔 동안 두 저장이 그 키에서 기다림(pg_locks 2)을 확인한 뒤 푼다.

async function heldRace(key: string, race: () => Promise<PromiseSettledResult<unknown>[]>) {
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

function loserOf(results: PromiseSettledResult<unknown>[]): unknown {
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

    const { waiting, results } = await heldRace(ADMIN_SEAT_LOCK_KEY, race);

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

// 06.4-03(D-6408 · 성공 기준 5): (d) 사람 보관 ∥ 권한표 관리자 칸 끄기 — 관리자 키 (e) 퇴직일 지우기 ∥ 같은 팀 새 팀장 — 서로 다른
// 사람 키 뒤 관리자 키(퇴직일 분기는 값과 무관하게 관리자 키를 잡는다) (f) 사람 복원 ∥ 발령 — 관리자 키 없이 팀 키. 새 코드 없이
// 06.4-03 Task 1 · 2 배선의 증명이다.

// (d) 관리자는 A(시스템 관리자 계급) · P(커스텀 관리자 계급 B)뿐 — 행위자 X는 퇴직일이 지나 수에 안 든다.
async function archiveVsCellWorld() {
  const x = await makeAdmin("관리자 X");
  await updateUserResignationDate(SYSTEM_VIEWER, x.id, "2026-09-01");
  const a = await makeAdmin("관리자 A");
  const roleB = await makeAdminRole("관리자급 B");
  await makePerson("관리자 P", roleB, null);
  const race = () =>
    Promise.allSettled([archive(x, "user", a.id, deps), setPermissionCell(x, off(roleB), deps)]);
  return { race };
}

// (e) T의 지난 팀장 L(퇴직일 2026-09-01) · T 소속 PM X.
async function clearVsPromoteWorld() {
  const admin = await makeAdmin("관리자");
  const { teamId } = await makeOrgTeam();
  const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
  await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-09-01");
  const x = await makeSeated(uniqueName("PM X"), DEFAULT_ROLE_ID, teamId);
  const race = () =>
    Promise.allSettled([setResignationDate(admin, l.id, null, deps), changePersonRole(admin, x.id, TEAM_LEAD_ROLE_ID, deps)]);
  return { teamId, race };
}

// (f) T의 보관된 팀장 L · 팀 없는 팀장 Z.
async function restoreVsAssignWorld() {
  const admin = await makeAdmin("관리자");
  const { teamId } = await makeOrgTeam();
  const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
  await archive(SYSTEM_VIEWER, "user", l.id, deps);
  const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, null);
  const race = async (): Promise<PromiseSettledResult<unknown>[]> => {
    const [restored, assigned] = await Promise.allSettled([
      restore(admin, "user", l.id, deps),
      assignTeam(admin, { userId: z.id, teamId, effectiveFrom: "2026-09-01" }, deps),
    ]);
    const restoredVoid: PromiseSettledResult<void> =
      restored.status === "fulfilled" ? { status: "fulfilled", value: undefined } : restored;
    return [restoredVoid, assigned];
  };
  return { teamId, race };
}

describe("보관 · 퇴직일 · 복원 경합 · 풀 5(06.4 D-6408 · 성공 기준 5)", () => {
  it("(d) 관리자 키를 쥔 동안 사람 보관(A) ∥ 관리자 칸 끄기(B)가 둘 다 기다리고, 풀면 하나만 · 패자는 마지막 관리자", async () => {
    const { race } = await archiveVsCellWorld();

    const { waiting, results } = await heldRace(ADMIN_SEAT_LOCK_KEY, race);

    expect(waiting).toBe(2);
    expect(loserOf(results)).toBeInstanceOf(LastAdminError);
    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-18" })).toBe(1);
  });

  it("(d) 스모크 — 홀더 없이 보관 ∥ 칸 끄기도 하나만", async () => {
    const { race } = await archiveVsCellWorld();

    expect(loserOf(await race())).toBeInstanceOf(LastAdminError);
    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-18" })).toBe(1);
  });

  it("(e) 관리자 키를 쥔 동안 퇴직일 지우기(L) ∥ 새 팀장(X)이 둘 다 기다리고, 풀면 하나만 · T 팀장 하나", async () => {
    const { teamId, race } = await clearVsPromoteWorld();

    const { waiting, results } = await heldRace(ADMIN_SEAT_LOCK_KEY, race);

    expect(waiting).toBe(2);
    expect(loserOf(results)).toBeInstanceOf(SeatTakenError);
    expect(await teamLeadsOf(teamId)).toHaveLength(1);
  });

  it("(e) 스모크 — 홀더 없이 퇴직일 지우기 ∥ 새 팀장도 하나만", async () => {
    const { teamId, race } = await clearVsPromoteWorld();

    expect(loserOf(await race())).toBeInstanceOf(SeatTakenError);
    expect(await teamLeadsOf(teamId)).toHaveLength(1);
  });

  it("(f) 팀 키를 쥔 동안 사람 복원(L) ∥ 발령(Z → T)이 둘 다 기다리고, 풀면 하나만 · T 팀장 하나(관리자 키 없는 경로)", async () => {
    const { teamId, race } = await restoreVsAssignWorld();

    const { waiting, results } = await heldRace("seat:team:" + teamId, race);

    expect(waiting).toBe(2);
    expect(loserOf(results)).toBeInstanceOf(SeatTakenError);
    expect(await teamLeadsOf(teamId)).toHaveLength(1);
  });

  it("(f) 스모크 — 홀더 없이 복원 ∥ 발령도 하나만", async () => {
    const { teamId, race } = await restoreVsAssignWorld();

    expect(loserOf(await race())).toBeInstanceOf(SeatTakenError);
    expect(await teamLeadsOf(teamId)).toHaveLength(1);
  });

  it("풀 5에서 보관 · 계급 변경 · 발령 · 퇴직일 각 둘(동시 8건)이 교착 · 시간 초과 없이 끝난다", { timeout: 15_000 }, async () => {
    expect(pool.options.max).toBe(5);
    const admin = await makeAdmin("관리자");
    const pm = () => makeSeated(uniqueName("PM"), DEFAULT_ROLE_ID, null);
    const [p1, p2, r1, r2] = [await pm(), await pm(), await pm(), await pm()];
    const t1 = (await makeOrgTeam()).teamId;
    const t2 = (await makeOrgTeam()).teamId;
    const t3 = (await makeOrgTeam()).teamId;
    const t4 = (await makeOrgTeam()).teamId;
    const x1 = await makeSeated(uniqueName("PM X1"), DEFAULT_ROLE_ID, t1);
    const x2 = await makeSeated(uniqueName("PM X2"), DEFAULT_ROLE_ID, t2);
    const z1 = await makeSeated(uniqueName("팀장Z1"), TEAM_LEAD_ROLE_ID, null);
    const z2 = await makeSeated(uniqueName("팀장Z2"), TEAM_LEAD_ROLE_ID, null);

    const results = await Promise.allSettled([
      archive(admin, "user", p1.id, deps),
      archive(admin, "user", p2.id, deps),
      changePersonRole(admin, x1.id, TEAM_LEAD_ROLE_ID, deps),
      changePersonRole(admin, x2.id, TEAM_LEAD_ROLE_ID, deps),
      assignTeam(admin, { userId: z1.id, teamId: t3, effectiveFrom: "2026-09-01" }, deps),
      assignTeam(admin, { userId: z2.id, teamId: t4, effectiveFrom: "2026-09-01" }, deps),
      setResignationDate(admin, r1.id, "2026-12-31", deps),
      setResignationDate(admin, r2.id, "2026-12-31", deps),
    ]);

    expect(results.map((result) => result.status)).toEqual(Array<string>(8).fill("fulfilled"));
  });
});

// /cso: 보관된 팀 T(팀장 A) 복원 ∥ T 소속 B의 계급 변경(→ 팀장) — 쓰기가 보관 팀의 팀 키를 잡지 않으면 둘이 줄 서지 않는다.
// 결정적 끼워 넣기: B 사람 행을 홀더가 FOR UPDATE로 쥐어 계급 변경이 점유를 읽은 뒤 UPDATE에서 멈추게 하고, 그동안 복원을
// 보낸다. 쓰기가 T 키를 쥐었으면 복원은 그 키에서 기다리고, 아니면 B를 못 본 채 끝낸다. 그 뒤 홀더를 푼다.
async function holdUserRow(userId: string): Promise<{ release: () => Promise<void> }> {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let held: () => void = () => {};
  const holding = new Promise<void>((resolve) => {
    held = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.execute(sql`select id from users where id = ${userId} for update`);
    held();
    await gate;
  });
  await holding;
  return {
    release: async () => {
      open();
      await holder;
    },
  };
}

// 행 잠금에서 멈춘 쓰기 수 — 계급 변경은 B의 users UPDATE, 발령은 행위자의 action_log INSERT 외래키 확인(FOR KEY SHARE)에서 멈춘다.
async function waitingOnRow(queryPrefix: string): Promise<number> {
  const result = await db.execute<{ n: string }>(sql`
    select count(*)::text as n from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock' and query ilike ${queryPrefix + "%"}`);
  return Number(result.rows[0]?.n ?? 0);
}

// 홀더가 사람 행을 쥔 동안 쓰기를 보내 행 잠금에서 멈추게 한 뒤 T 복원을 보내고, 복원이 끝나거나 T 키에서 기다리면 홀더를 푼다.
async function restoreDuringRowHold(input: {
  admin: Viewer;
  teamId: string;
  userId: string;
  queryPrefix: string;
  write: () => Promise<void>;
}): Promise<{ restored: PromiseSettledResult<RestoreResult>; written: PromiseSettledResult<void> }> {
  const row = await holdUserRow(input.userId);
  const writing = input.write();
  for (let tries = 0; tries < 60 && (await waitingOnRow(input.queryPrefix)) < 1; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  let restoreSettled = false;
  const restoring = restore(input.admin, "team", input.teamId, deps).finally(() => {
    restoreSettled = true;
  });
  for (let tries = 0; tries < 60 && !restoreSettled && (await waitingOnKey("seat:team:" + input.teamId)) < 1; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await row.release();
  const [restored, written] = await Promise.allSettled([restoring, writing]);
  return { restored, written };
}

function expectOneWinner(restored: PromiseSettledResult<RestoreResult>, written: PromiseSettledResult<void>): void {
  const wins = [restored.status === "fulfilled" && restored.value.restored, written.status === "fulfilled"];
  expect(wins.filter(Boolean)).toHaveLength(1);
  const loser = [restored, written].find((result) => result.status === "rejected");
  expect(loser?.status === "rejected" ? loser.reason : null).toBeInstanceOf(SeatTakenError);
}

describe("보관 팀 복원 ∥ 그 팀 사람의 자리 쓰기(06.4 /cso)", () => {
  it("(g) 보관 팀 T 복원 ∥ T 소속 B → 팀장이 끼어들어도 하나만 성공 · T 팀장 하나 이하", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    await makeSeated(uniqueName("팀장A"), TEAM_LEAD_ROLE_ID, teamId);
    const b = await makeSeated(uniqueName("PM B"), DEFAULT_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "team", teamId, deps);

    const { restored, written } = await restoreDuringRowHold({
      admin,
      teamId,
      userId: b.id,
      queryPrefix: 'update "users"',
      write: () => changePersonRole(admin, b.id, TEAM_LEAD_ROLE_ID, deps),
    });

    expectOneWinner(restored, written);
    expect((await teamLeadsOf(teamId)).length).toBeLessThanOrEqual(1);
  });

  it("(h) 보관 팀 T 복원 ∥ 팀장 Z → T 발령이 끼어들어도 하나만 성공 · T 팀장 하나 이하", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    await makeSeated(uniqueName("팀장A"), TEAM_LEAD_ROLE_ID, teamId);
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, null);
    await archive(SYSTEM_VIEWER, "team", teamId, deps);
    const writer = await makeAdmin("발령 관리자");
    // 07-21(R10): 발령은 잠금 뒤 보관된 팀을 거부한다 — 보관 중 T로의 발령은 경합 없이 거부되므로, 복원이 먼저 T 키를 잡고
    // 발령이 그 뒤에 줄 서는 순서로 잰다(복원이 커밋한 활성 T에서 둘째 팀장 → 자리 거부).
    const key = "seat:team:" + teamId;
    const held = await holdKey(key);
    const restoring = restore(admin, "team", teamId, deps);
    for (let tries = 0; tries < 60 && (await waitingOnKey(key)) < 1; tries++) await new Promise((resolve) => setTimeout(resolve, 50));
    const writing = assignTeam(writer, { userId: z.id, teamId, effectiveFrom: "2026-09-01" }, deps);
    for (let tries = 0; tries < 60 && (await waitingOnKey(key)) < 2; tries++) await new Promise((resolve) => setTimeout(resolve, 50));
    await held.release();
    const [restored, written] = await Promise.allSettled([restoring, writing]);

    expectOneWinner(restored, written);
    expect((await teamLeadsOf(teamId)).length).toBeLessThanOrEqual(1);
  });
});

// 07.1(D-7128 · E-P1-06): 회사 자리 경합 — 계정 생성(다른 연결)은 판정 tx 잠금 밖이라, 등록은 생성 뒤 같은 회사 키를 다시 잡고
// 재조회해 겹치면 그 tx 안에서 방금 만든 계정을 보상 보관한다. 정확히 하나만 대표로 남는다.
const ceoKey = `seat:company:${CEO_ROLE_ID}`;
const newCeo = () => ({ name: uniqueName("새 대표"), email: `${randomUUID()}@example.test`, roleId: CEO_ROLE_ID });

async function archivedOf(userId: string): Promise<boolean> {
  return ((await findUserById(SYSTEM_VIEWER, userId))?.archivedAt ?? null) !== null;
}

async function rollbackLogs(userId: string): Promise<number> {
  const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "archive" });
  return rows.filter(
    (row) => row.entity === "user" && row.entityId === userId && (row.detail as { reason?: string } | null)?.reason === "register_person_rollback",
  ).length;
}

describe("회사 자리 경합(07.1 D-7128 · E-P1-06)", () => {
  it("ⓐ 대표 등록 둘이 모두 사전 판정을 지나 계정을 만든 뒤 사후 판정에 들어가면 하나만 성공 · 진 쪽 계정은 보관 · 보상 로그 1행", async () => {
    const admin = await makeAdmin("관리자");
    const created: string[] = [];
    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const barrier: typeof createAccount = async (viewer, input) => {
      const result = await createAccount(viewer, input);
      created.push(result.userId);
      if (created.length === 2) open();
      await gate;
      return result;
    };

    const results = await Promise.allSettled([
      registerPerson(admin, newCeo(), { ...deps, createAccount: barrier }),
      registerPerson(admin, newCeo(), { ...deps, createAccount: barrier }),
    ]);

    expect(created).toHaveLength(2);
    expect(loserOf(results)).toBeInstanceOf(SeatTakenError);
    const winner = results.find((result) => result.status === "fulfilled");
    const winnerId = winner?.status === "fulfilled" ? winner.value.userId : "";
    const loserId = created.find((id) => id !== winnerId) ?? "";
    expect((loserOf(results) as Error).message).toBe(`대표 있음 · ${(await findUserById(SYSTEM_VIEWER, winnerId))?.name}`);
    expect(await archivedOf(winnerId)).toBe(false);
    expect(await archivedOf(loserId)).toBe(true);
    expect(await rollbackLogs(loserId)).toBe(1);
  });

  it("ⓑ 대표 등록의 사전 판정과 계정 생성 사이에 다른 사람을 대표로 바꾸면 등록이 지고 새 계정은 보관 · 대표는 바꾼 사람 하나", async () => {
    const admin = await makeAdmin("관리자");
    const x = await makeSeated(uniqueName("PM X"), DEFAULT_ROLE_ID, null);
    let createdId = "";
    const interlope: typeof createAccount = async (viewer, input) => {
      await changePersonRole(admin, x.id, CEO_ROLE_ID, deps);
      const result = await createAccount(viewer, input);
      createdId = result.userId;
      return result;
    };

    const error = await registerPerson(admin, newCeo(), { ...deps, createAccount: interlope }).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(SeatTakenError);
    expect((error as Error).message).toBe(`대표 있음 · ${(await findUserById(SYSTEM_VIEWER, x.id))?.name}`);
    expect((await findUserById(SYSTEM_VIEWER, x.id))?.roleId).toBe(CEO_ROLE_ID);
    expect(await archivedOf(createdId)).toBe(true);
    expect(await rollbackLogs(createdId)).toBe(1);
  });

  // 계급 변경은 사람 → 관리자 → 회사 순이라, 회사 키를 쥐면 앞 저장은 회사 키에서 · 뒤 저장은 앞 저장이 쥔 관리자 키에서 기다린다.
  it("ⓒ 회사 키를 쥔 동안 두 PM을 대표로 바꾸면 둘 다 기다리고(회사 키 1 · 관리자 키 1), 풀면 하나만 · 패자는 대표 있음", async () => {
    const admin = await makeAdmin("관리자");
    const a = await makeSeated(uniqueName("PM A"), DEFAULT_ROLE_ID, null);
    const b = await makeSeated(uniqueName("PM B"), DEFAULT_ROLE_ID, null);
    const holder = await holdKey(ceoKey);

    const both = Promise.allSettled([changePersonRole(admin, a.id, CEO_ROLE_ID, deps), changePersonRole(admin, b.id, CEO_ROLE_ID, deps)]);
    let waiting = [0, 0];
    for (let tries = 0; tries < 60 && waiting.join() !== "1,1"; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waiting = [await waitingOnKey(ceoKey), await waitingOnKey(ADMIN_SEAT_LOCK_KEY)];
    }
    await holder.release();
    const results = await both;

    expect(waiting).toEqual([1, 1]);
    expect(loserOf(results)).toBeInstanceOf(SeatTakenError);
    const roles = [(await findUserById(SYSTEM_VIEWER, a.id))?.roleId, (await findUserById(SYSTEM_VIEWER, b.id))?.roleId];
    expect(roles.filter((roleId) => roleId === CEO_ROLE_ID)).toHaveLength(1);
  });

  // 07.1 [검토] P1-1: 사후 판정 tx가 자리 충돌이 아닌 오류로 실패하면 tx 안의 보상 보관도 함께 되돌아간다 — 재판정 안 된
  // 둘째 대표가 활성으로 남지 않도록 tx 밖에서 따로 보상 보관하고 원래 오류를 던진다.
  it(
    "ⓓ 사후 판정이 회사 키 대기 lock_timeout으로 실패하면 원래 오류를 던지고 · 새 계정은 보관 · 보상 로그 1행",
    async () => {
      const admin = await makeAdmin("관리자");
      let createdId = "";
      let holder: { release: () => Promise<void> } | null = null;
      const holdAfterCreate: typeof createAccount = async (viewer, input) => {
        const result = await createAccount(viewer, input);
        createdId = result.userId;
        holder = await holdKey(ceoKey);
        return result;
      };

      const error = await registerPerson(admin, newCeo(), { ...deps, createAccount: holdAfterCreate })
        .then(
          () => null,
          (caught: unknown) => caught,
        )
        .finally(() => holder?.release());

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(SeatTakenError);
      expect(await archivedOf(createdId)).toBe(true);
      expect(await rollbackLogs(createdId)).toBe(1);
    },
    30_000,
  );

  it("ⓔ 사후 판정이 충돌을 본 뒤 보상 로그 쓰기에서 실패하면 그 오류를 던지고 · 새 계정은 tx 밖에서 보관 · 보상 로그 1행", async () => {
    const admin = await makeAdmin("관리자");
    const x = await makeSeated(uniqueName("PM X"), DEFAULT_ROLE_ID, null);
    let createdId = "";
    const interlope: typeof createAccount = async (viewer, input) => {
      await changePersonRole(admin, x.id, CEO_ROLE_ID, deps);
      const result = await createAccount(viewer, input);
      createdId = result.userId;
      return result;
    };
    const boom = new Error("로그 쓰기 실패");
    let failed = false;
    const failOnce: typeof recordAction = async (viewer, entry, options) => {
      if (!failed && (entry.detail as { reason?: string } | undefined)?.reason === "register_person_rollback") {
        failed = true;
        throw boom;
      }
      return recordAction(viewer, entry, options);
    };

    const error = await registerPerson(admin, newCeo(), { ...deps, createAccount: interlope, recordAction: failOnce }).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(failed).toBe(true);
    expect(error).toBe(boom);
    expect(await archivedOf(createdId)).toBe(true);
    expect(await rollbackLogs(createdId)).toBe(1);
  });
});

