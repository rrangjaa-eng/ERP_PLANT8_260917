import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { changePersonRole, registerPerson, setHireDate, setResignationDate, ValidationError } from "@/domain/people";
import { assignTeam, cancelFutureAssignment } from "@/domain/org";
import { archive } from "@/domain/archive";
import { SeatTakenError } from "@/domain/people/seat-rules";
import { RetiredPersonEditError } from "@/domain/people/retired";
import { listMemberships } from "@/repositories/team-memberships";
import { findUserById, setUserArchived, updateUserHireDate, updateUserResignationDate } from "@/repositories/users";
import { countRows, NOW_2026 } from "./approvals-fixtures";
import { addTeam, countLogs, makeAdmin, makeOrgTeam, makeSeated, roleOf, uniqueName } from "./admin-cap-fixtures";

// 06.4-02: 한 팀 팀장 · 한 본부 책임자 한 명 — 자리 구간이 하루라도 겹치면 둘째(D-6404 · D-6415).
// 세계는 사례마다 새 본부 · 팀. 이미 있는 보유자는 리포지토리 발령(makeSeated — 가드 우회)으로 만든다.

const deps = { now: () => NOW_2026 };

async function refusal<E extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(type);
  return error as E;
}

async function nameOf(userId: string): Promise<string> {
  const row = await findUserById(SYSTEM_VIEWER, userId);
  if (!row) throw new Error(`사람이 없습니다: ${userId}`);
  return row.name;
}

describe("계급 변경 자리 중복(06.4 D-6404)", () => {
  it("팀장 Z가 있는 팀의 PM을 팀장으로 올리면 거부 · 문구에 Z 이름 · 계급 · 로그 그대로", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);
    const x = await makeSeated(uniqueName("PM X"), DEFAULT_ROLE_ID, teamId);
    const logsBefore = await countLogs("permission_change", "user", x.id);

    const error = await refusal(changePersonRole(admin, x.id, TEAM_LEAD_ROLE_ID, deps), SeatTakenError);

    expect(error.message).toBe(`팀장 있음 · ${await nameOf(z.id)}`);
    expect(await roleOf(x.id)).toBe(DEFAULT_ROLE_ID);
    expect(await countLogs("permission_change", "user", x.id)).toBe(logsBefore);
  });

  it("책임자 H가 있는 본부의 다른 팀 PM을 본부 책임자로 올리면 거부 · 문구에 H 이름", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const t2 = await addTeam(orgUnitId);
    const h = await makeSeated(uniqueName("책임자H"), DIVISION_HEAD_ROLE_ID, teamId);
    const w = await makeSeated(uniqueName("PM W"), DEFAULT_ROLE_ID, t2);

    const error = await refusal(changePersonRole(admin, w.id, DIVISION_HEAD_ROLE_ID, deps), SeatTakenError);

    expect(error.message).toBe(`본부 책임자 있음 · ${await nameOf(h.id)}`);
    expect(await roleOf(w.id)).toBe(DEFAULT_ROLE_ID);
  });

  it("팀 없는 PM은 팀장으로 올라간다(자리 없음)", async () => {
    const admin = await makeAdmin("관리자");
    const v = await makeSeated(uniqueName("PM V"), DEFAULT_ROLE_ID, null);

    await changePersonRole(admin, v.id, TEAM_LEAD_ROLE_ID, deps);

    expect(await roleOf(v.id)).toBe(TEAM_LEAD_ROLE_ID);
  });

  it("팀장 L이 퇴직 예정(12-31)이어도 오늘부터의 계급 변경은 L 구간과 겹쳐 거부", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-12-31");
    const x = await makeSeated(uniqueName("PM X"), DEFAULT_ROLE_ID, teamId);

    const error = await refusal(changePersonRole(admin, x.id, TEAM_LEAD_ROLE_ID, deps), SeatTakenError);

    expect(error.message).toBe(`팀장 있음 · ${await nameOf(l.id)}`);
  });
});

// 2026-10-02 12:00 서울 — X의 T1 구간이 끝난 다음 날.
const deps1002 = { now: () => new Date("2026-10-02T03:00:00Z") };
const register = (roleId: string, teamId?: string) => ({
  name: uniqueName("새 사람"),
  email: `${randomUUID()}@example.test`,
  roleId,
  ...(teamId ? { teamId, effectiveFrom: "2026-09-01" } : {}),
});

describe("등록 · 발령 · 발령 취소 자리 중복(06.4 D-6404 · D-6415)", () => {
  it("팀장 Z가 있는 팀으로 팀장을 등록하면 계정을 만들기 전에 거부, 팀 없이 · 빈 팀으로는 등록", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);
    const spy = vi.fn(createAccount);

    const error = await refusal(
      registerPerson(admin, register(TEAM_LEAD_ROLE_ID, teamId), { ...deps, createAccount: spy }),
      SeatTakenError,
    );

    expect(error.message).toBe(`팀장 있음 · ${await nameOf(z.id)}`);
    expect(spy).not.toHaveBeenCalled();
    await registerPerson(admin, register(TEAM_LEAD_ROLE_ID), deps);
    await registerPerson(admin, register(TEAM_LEAD_ROLE_ID, await addTeam(orgUnitId)), deps);
  });

  it("검사와 계정 생성 사이에 같은 팀 팀장이 끼어들면 발령 재검사가 자리 문구 그대로 거부하고 새 계정은 보관", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    let interloper: Viewer | null = null;
    let created: string | null = null;
    const createThenInterlope: typeof createAccount = async (viewer, input) => {
      const result = await createAccount(viewer, input);
      created = result.userId;
      interloper = await makeSeated(uniqueName("끼어든팀장"), TEAM_LEAD_ROLE_ID, teamId);
      return result;
    };

    const error = await refusal(
      registerPerson(admin, register(TEAM_LEAD_ROLE_ID, teamId), { ...deps, createAccount: createThenInterlope }),
      SeatTakenError,
    );

    expect(interloper).not.toBeNull();
    expect(error.message).toBe(`팀장 있음 · ${await nameOf((interloper as unknown as Viewer).id)}`);
    expect(created).not.toBeNull();
    expect((await findUserById(SYSTEM_VIEWER, created as unknown as string))?.archivedAt).not.toBeNull();
  });

  it("책임자 H가 있는 본부의 다른 팀으로 본부 책임자를 등록하면 거부, 다른 본부 팀으로는 등록(R5)", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const t2 = await addTeam(orgUnitId);
    const h = await makeSeated(uniqueName("책임자H"), DIVISION_HEAD_ROLE_ID, teamId);
    const spy = vi.fn(createAccount);

    const error = await refusal(
      registerPerson(admin, register(DIVISION_HEAD_ROLE_ID, t2), { ...deps, createAccount: spy }),
      SeatTakenError,
    );

    expect(error.message).toBe(`본부 책임자 있음 · ${await nameOf(h.id)}`);
    expect(spy).not.toHaveBeenCalled();
    const other = await makeOrgTeam();
    await registerPerson(admin, register(DIVISION_HEAD_ROLE_ID, other.teamId), deps);
  });

  it("팀 없는 팀장을 팀장 있는 팀으로 발령하면 거부 · 발령 · 로그 그대로, 빈 팀 · PM 발령은 통과", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);
    const x = await makeSeated(uniqueName("팀장X"), TEAM_LEAD_ROLE_ID, null);
    const membershipsBefore = await countRows("team_memberships");
    const logsBefore = await countLogs("document_create", "team_membership");

    const error = await refusal(
      assignTeam(admin, { userId: x.id, teamId, effectiveFrom: "2026-09-01" }, deps),
      SeatTakenError,
    );

    expect(error.message).toBe(`팀장 있음 · ${await nameOf(z.id)}`);
    expect(await countRows("team_memberships")).toBe(membershipsBefore);
    expect(await countLogs("document_create", "team_membership")).toBe(logsBefore);
    await assignTeam(admin, { userId: x.id, teamId: await addTeam(orgUnitId), effectiveFrom: "2026-09-01" }, deps);
    const pm = await makeSeated(uniqueName("PM"), DEFAULT_ROLE_ID, null);
    await assignTeam(admin, { userId: pm.id, teamId, effectiveFrom: "2026-09-01" }, deps);
  });

  it("다른 본부의 본부 책임자를 책임자 있는 본부의 팀으로 발령하면 거부(R5)", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const t2 = await addTeam(orgUnitId);
    const h = await makeSeated(uniqueName("책임자H"), DIVISION_HEAD_ROLE_ID, teamId);
    const other = await makeOrgTeam();
    const h2 = await makeSeated(uniqueName("책임자H2"), DIVISION_HEAD_ROLE_ID, other.teamId);

    const error = await refusal(
      assignTeam(admin, { userId: h2.id, teamId: t2, effectiveFrom: "2026-09-01" }, deps),
      SeatTakenError,
    );

    expect(error.message).toBe(`본부 책임자 있음 · ${await nameOf(h.id)}`);
  });

  it("소급 발령 — 늦은 과거(오늘 팀이 바뀜)는 새 자리라 거부, 이른 과거(오늘 전에 끝남)는 통과(R5)", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);
    const t1 = (await makeOrgTeam()).teamId;
    const x = await makeSeated(uniqueName("팀장X"), TEAM_LEAD_ROLE_ID, t1, "2026-05-01");

    const error = await refusal(
      assignTeam(admin, { userId: x.id, teamId, effectiveFrom: "2026-08-01" }, deps),
      SeatTakenError,
    );
    expect(error.message).toBe(`팀장 있음 · ${await nameOf(z.id)}`);

    await assignTeam(admin, { userId: x.id, teamId, effectiveFrom: "2026-03-01" }, deps);
  });

  // 팀장 X: T1(2026-01-01) + T2 미래(2026-10-02). T1 · T2에 PM Y · Y2.
  async function futureWorld() {
    const admin = await makeAdmin("관리자");
    const t1 = (await makeOrgTeam()).teamId;
    const t2 = (await makeOrgTeam()).teamId;
    const x = await makeSeated(uniqueName("팀장X"), TEAM_LEAD_ROLE_ID, t1);
    await assignTeam(admin, { userId: x.id, teamId: t2, effectiveFrom: "2026-10-02" }, deps);
    const y = await makeSeated(uniqueName("PM Y"), DEFAULT_ROLE_ID, t1);
    const y2 = await makeSeated(uniqueName("PM Y2"), DEFAULT_ROLE_ID, t2);
    return { admin, x, y, y2 };
  }

  it("미래 발령이 있는 팀장은 지금 팀과 미래 팀 둘 다 점유, 지금 팀 구간이 끝난 날부터는 지금 팀이 빈다", async () => {
    const { admin, x, y, y2 } = await futureWorld();
    const xName = await nameOf(x.id);

    expect((await refusal(changePersonRole(admin, y.id, TEAM_LEAD_ROLE_ID, deps), SeatTakenError)).message).toBe(
      `팀장 있음 · ${xName}`,
    );
    expect((await refusal(changePersonRole(admin, y2.id, TEAM_LEAD_ROLE_ID, deps), SeatTakenError)).message).toBe(
      `팀장 있음 · ${xName}`,
    );

    await changePersonRole(admin, y.id, TEAM_LEAD_ROLE_ID, deps1002);
    expect(await roleOf(y.id)).toBe(TEAM_LEAD_ROLE_ID);
  });

  it("미래 발령을 취소하면 그 팀 자리가 비고 지금 팀은 그대로 점유", async () => {
    const { admin, x, y, y2 } = await futureWorld();

    await cancelFutureAssignment(admin, { userId: x.id, effectiveFrom: "2026-10-02" }, deps);

    await changePersonRole(admin, y2.id, TEAM_LEAD_ROLE_ID, deps);
    expect(await roleOf(y2.id)).toBe(TEAM_LEAD_ROLE_ID);
    expect((await refusal(changePersonRole(admin, y.id, TEAM_LEAD_ROLE_ID, deps), SeatTakenError)).message).toBe(
      `팀장 있음 · ${await nameOf(x.id)}`,
    );
  });

  it("이미 있던 중복(팀장 둘)은 강등 · 같은 팀 재발령 · 빈 팀 이동이 통과", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const z1 = await makeSeated(uniqueName("팀장Z1"), TEAM_LEAD_ROLE_ID, teamId);
    const z2 = await makeSeated(uniqueName("팀장Z2"), TEAM_LEAD_ROLE_ID, teamId);

    await assignTeam(admin, { userId: z2.id, teamId, effectiveFrom: "2026-06-01" }, deps);
    await assignTeam(admin, { userId: z2.id, teamId: await addTeam(orgUnitId), effectiveFrom: "2026-07-01" }, deps);
    await changePersonRole(admin, z1.id, DEFAULT_ROLE_ID, deps);

    expect(await roleOf(z1.id)).toBe(DEFAULT_ROLE_ID);
    expect(await listMemberships(SYSTEM_VIEWER, z2.id)).toHaveLength(3);
  });

  it.each([
    { state: "보관", archive: true, resignation: null, rejected: false },
    { state: "퇴직일 2026-09-01(지남)", archive: false, resignation: "2026-09-01", rejected: false },
    { state: "퇴직일 2026-09-18(오늘)", archive: false, resignation: "2026-09-18", rejected: true },
  ])("팀장 Z가 $state이면 같은 팀 PM의 팀장 승격 거부=$rejected", async ({ archive, resignation, rejected }) => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);
    if (archive) await setUserArchived(SYSTEM_VIEWER, z.id, true);
    if (resignation) await updateUserResignationDate(SYSTEM_VIEWER, z.id, resignation);
    const x = await makeSeated(uniqueName("PM X"), DEFAULT_ROLE_ID, teamId);

    if (rejected) {
      await refusal(changePersonRole(admin, x.id, TEAM_LEAD_ROLE_ID, deps), SeatTakenError);
      expect(await roleOf(x.id)).toBe(DEFAULT_ROLE_ID);
    } else {
      await changePersonRole(admin, x.id, TEAM_LEAD_ROLE_ID, deps);
      expect(await roleOf(x.id)).toBe(TEAM_LEAD_ROLE_ID);
    }
  });

  it("퇴직일 뒤에 시작하는 보유자 발령은 구간이 없어 그 팀 발령을 막지 않는다(뒤집힌 구간)", async () => {
    const admin = await makeAdmin("관리자");
    const t0 = (await makeOrgTeam()).teamId;
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, t0);
    await assignTeam(admin, { userId: l.id, teamId, effectiveFrom: "2027-02-01" }, deps);
    await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-12-31");
    const x = await makeSeated(uniqueName("팀장X"), TEAM_LEAD_ROLE_ID, null);

    await assignTeam(admin, { userId: x.id, teamId, effectiveFrom: "2026-12-01" }, deps);

    expect(await listMemberships(SYSTEM_VIEWER, x.id)).toHaveLength(1);
  });

  it("이름을 못 보는 뷰어에게는 이름 대신 담당 시스템 관리자(D3)", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);
    const x = await makeSeated(uniqueName("팀장X"), TEAM_LEAD_ROLE_ID, null);

    const error = await refusal(
      assignTeam(admin, { userId: x.id, teamId, effectiveFrom: "2026-09-01" }, { ...deps, visible: () => Promise.resolve(false) }),
      SeatTakenError,
    );

    expect(error.message).toBe("팀장 있음 · 시스템 관리자");
  });

  it("SYSTEM_VIEWER도 자리 검사를 지난다(O4)", async () => {
    const { teamId } = await makeOrgTeam();
    await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);
    const x = await makeSeated(uniqueName("팀장X"), TEAM_LEAD_ROLE_ID, null);

    await refusal(assignTeam(SYSTEM_VIEWER, { userId: x.id, teamId, effectiveFrom: "2026-09-01" }, deps), SeatTakenError);
  });
});

// 답이 「지금대로(오늘 재직 기준)」로 바뀌면 이 describe의 기대만 뒤집는다(D-6415).
describe("후임 예약 · 맞바꾸기(06.4 D-6415 · K-R4)", () => {
  it("퇴직일 12-31 팀장의 후임은 2027-01-01자 발령이 통과, 12-31자 둘째 후임은 거부, 예약을 지우면 1-1자 통과", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("가-팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-12-31");
    const z = await makeSeated(uniqueName("하-팀장Z"), TEAM_LEAD_ROLE_ID, null);
    const z2 = await makeSeated(uniqueName("하-팀장Z2"), TEAM_LEAD_ROLE_ID, null);

    await assignTeam(admin, { userId: z.id, teamId, effectiveFrom: "2027-01-01" }, deps);
    const error = await refusal(assignTeam(admin, { userId: z2.id, teamId, effectiveFrom: "2026-12-31" }, deps), SeatTakenError);
    expect(error.message).toBe(`팀장 있음 · ${await nameOf(l.id)}`);

    await cancelFutureAssignment(admin, { userId: z.id, effectiveFrom: "2027-01-01" }, deps);
    await assignTeam(admin, { userId: z2.id, teamId, effectiveFrom: "2027-01-01" }, deps);
  });

  it("미래 이동을 취소하면 앞 팀 구간이 다시 열려 그 사이 예약된 후임과 겹쳐 거부 · 미래 발령 그대로", async () => {
    const admin = await makeAdmin("관리자");
    const t1 = (await makeOrgTeam()).teamId;
    const t2 = (await makeOrgTeam()).teamId;
    const x = await makeSeated(uniqueName("팀장X"), TEAM_LEAD_ROLE_ID, t1);
    await assignTeam(admin, { userId: x.id, teamId: t2, effectiveFrom: "2026-11-01" }, deps);
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, null);
    await assignTeam(admin, { userId: z.id, teamId: t1, effectiveFrom: "2026-11-01" }, deps);

    const error = await refusal(
      cancelFutureAssignment(admin, { userId: x.id, effectiveFrom: "2026-11-01" }, deps),
      SeatTakenError,
    );

    expect(error.message).toBe(`팀장 있음 · ${await nameOf(z.id)}`);
    expect(await listMemberships(SYSTEM_VIEWER, x.id)).toHaveLength(2);
  });

  it("같은 날 맞바꾸는 두 팀장 예약은 어느 쪽을 먼저 저장해도 상대의 열린 구간과 겹쳐 첫 예약이 거부(한계)", async () => {
    const admin = await makeAdmin("관리자");
    const t1 = (await makeOrgTeam()).teamId;
    const t2 = (await makeOrgTeam()).teamId;
    const x = await makeSeated(uniqueName("팀장X"), TEAM_LEAD_ROLE_ID, t1);
    const y = await makeSeated(uniqueName("팀장Y"), TEAM_LEAD_ROLE_ID, t2);

    const xFirst = await refusal(assignTeam(admin, { userId: x.id, teamId: t2, effectiveFrom: "2026-11-01" }, deps), SeatTakenError);
    const yFirst = await refusal(assignTeam(admin, { userId: y.id, teamId: t1, effectiveFrom: "2026-11-01" }, deps), SeatTakenError);

    expect(xFirst.message).toBe(`팀장 있음 · ${await nameOf(y.id)}`);
    expect(yFirst.message).toBe(`팀장 있음 · ${await nameOf(x.id)}`);
  });
});

// 06.4-03(E2 · Codex B1 · D-6415): 퇴직일 지우기 · 늦추기로 자리 구간이 늘어나면 260907 재개(`O: server/src/people-rules.ts:68-78`)와
// 같은 자리 검사 — 늘어난 날짜가 다른 보유자 구간과 하루라도 겹치면 거부, 겹치는 보유자가 없을 때만 지우기 성공.

async function resignationOf(userId: string): Promise<string | null> {
  return (await findUserById(SYSTEM_VIEWER, userId))?.resignationDate ?? null;
}

describe("퇴직일 해제 · 늦추기 자리 중복(06.4 D-6404 · E2)", () => {
  it("지난 팀장 L의 퇴직일을 지우면 새 팀장 Z와 겹쳐 거부 · 퇴직일 · 로그 그대로, 다른 날짜로 옮기기는 퇴직자 거부(F24)", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-09-01");
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);
    const logsBefore = await countLogs("document_update", "user", l.id);

    const cleared = await refusal(setResignationDate(admin, l.id, null, deps), SeatTakenError);
    expect(cleared.message).toBe(`팀장 있음 · ${await nameOf(z.id)}`);
    expect(await resignationOf(l.id)).toBe("2026-09-01");
    expect(await countLogs("document_update", "user", l.id)).toBe(logsBefore);

    const hidden = await refusal(setResignationDate(admin, l.id, null, { ...deps, visible: () => Promise.resolve(false) }), SeatTakenError);
    expect(hidden.message).toBe("팀장 있음 · 시스템 관리자");

    // 사용자 결정(카드 2026-10-23 12:34 KST) 「퇴직한 사람의 퇴직일은 비우기만 허용」: 늦추기 · 지난 날짜끼리 옮기기는 자리 검사 전에 거부.
    // 재직 중 늦추기의 자리 검사는 아래 「퇴직일 늦추기와 예약된 후임」이 잰다.
    await refusal(setResignationDate(admin, l.id, "2026-12-31", deps), RetiredPersonEditError);
    await refusal(setResignationDate(admin, l.id, "2026-09-10", deps), RetiredPersonEditError);
    expect(await resignationOf(l.id)).toBe("2026-09-01");
  });

  it("새 팀장 Z를 보관하면 L의 퇴직일 지우기가 통과(겹치는 보유자가 없을 때만)", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-09-01");
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "user", z.id, deps);

    await setResignationDate(admin, l.id, null, deps);

    expect(await resignationOf(l.id)).toBeNull();
  });

  it("지난 본부 책임자 H의 퇴직일을 지우면 같은 본부 새 책임자와 겹쳐 거부 · 문구에 그 이름", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const t2 = await addTeam(orgUnitId);
    const h = await makeSeated(uniqueName("책임자H"), DIVISION_HEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, h.id, "2026-09-01");
    const h2 = await makeSeated(uniqueName("책임자H2"), DIVISION_HEAD_ROLE_ID, t2);

    const error = await refusal(setResignationDate(admin, h.id, null, deps), SeatTakenError);

    expect(error.message).toBe(`본부 책임자 있음 · ${await nameOf(h2.id)}`);
    expect(await resignationOf(h.id)).toBe("2026-09-01");
  });
});

describe("퇴직일 늦추기와 예약된 후임(06.4 D-6415 · K-R4)", () => {
  it("퇴직 다음 날부터 후임이 예약된 팀장 L의 퇴직일을 늦추거나 지우면 거부, 당기면 통과", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-12-31");
    const z = await makeSeated(uniqueName("후임Z"), TEAM_LEAD_ROLE_ID, null);
    await assignTeam(admin, { userId: z.id, teamId, effectiveFrom: "2027-01-01" }, deps);

    const later = await refusal(setResignationDate(admin, l.id, "2027-01-05", deps), SeatTakenError);
    expect(later.message).toBe(`팀장 있음 · ${await nameOf(z.id)}`);
    await refusal(setResignationDate(admin, l.id, null, deps), SeatTakenError);
    expect(await resignationOf(l.id)).toBe("2026-12-31");

    await setResignationDate(admin, l.id, "2026-12-20", deps);
    expect(await resignationOf(l.id)).toBe("2026-12-20");
  });
});

// 07.1(D-7108 · D-7128 · D-E5): 대표 · 시스템 관리자는 회사에 한 명 — 팀장과 같은 기간 규칙. 자리 구간 = [입사일(없으면 열린 시작),
// 퇴사일(없으면 열림)], 보관이면 없음. 오늘(09-18) 이전에 끝난 보유자는 자리가 없다. 이미 있는 보유자는 createAccount(가드 우회)로.
describe("회사 자리 — 대표 · 시스템 관리자 한 명(07.1 D-7108 · D-7128)", () => {
  it("대표 K가 있으면 팀 없이 대표를 등록해도 계정을 만들기 전에 거부 · 문구에 K 이름 · 못 보면 담당", async () => {
    const admin = await makeAdmin("관리자");
    const k = await makeSeated(uniqueName("대표K"), CEO_ROLE_ID, null);
    const usersBefore = await countRows("users");
    const spy = vi.fn(createAccount);

    const error = await refusal(registerPerson(admin, register(CEO_ROLE_ID), { ...deps, createAccount: spy }), SeatTakenError);

    expect(error.message).toBe(`대표 있음 · ${await nameOf(k.id)}`);
    expect(spy).not.toHaveBeenCalled();
    expect(await countRows("users")).toBe(usersBefore);
    const hidden = await refusal(registerPerson(admin, register(CEO_ROLE_ID), { ...deps, visible: () => Promise.resolve(false) }), SeatTakenError);
    expect(hidden.message).toBe("대표 있음 · 시스템 관리자");
  });

  it("대표 K 퇴사일 09-21이면 입사일 오늘(09-18 · 겹침) · 입사일 없음 등록은 거부(D-E5)", async () => {
    const admin = await makeAdmin("관리자");
    const k = await makeSeated(uniqueName("대표K"), CEO_ROLE_ID, null);
    await updateUserResignationDate(SYSTEM_VIEWER, k.id, "2026-09-21");

    const overlap = await refusal(registerPerson(admin, { ...register(CEO_ROLE_ID), hireDate: "2026-09-18" }, deps), SeatTakenError);
    expect(overlap.message).toBe(`대표 있음 · ${await nameOf(k.id)}`);
    await refusal(registerPerson(admin, register(CEO_ROLE_ID), deps), SeatTakenError);
  });

  // 07.1 D-1(2026-10-27 사용자 결정): 입사일 전에 후임이 대표 · 시스템 관리자 권한을 쥐지 않게 — 입사일이 오늘(서울) 뒤면 등록 거부.
  it("대표 · 시스템 관리자는 입사일이 내일이면 계정을 만들기 전에 등록 거부, 오늘이면 등록(D-1)", async () => {
    const admin = await makeAdmin("관리자");
    const k = await makeSeated(uniqueName("대표K"), CEO_ROLE_ID, null);
    await updateUserResignationDate(SYSTEM_VIEWER, k.id, "2026-09-17");
    const usersBefore = await countRows("users");
    const spy = vi.fn(createAccount);

    const ceo = await refusal(registerPerson(admin, { ...register(CEO_ROLE_ID), hireDate: "2026-09-19" }, { ...deps, createAccount: spy }), ValidationError);
    const sysadmin = await refusal(registerPerson(admin, { ...register(SYSADMIN_ROLE_ID), hireDate: "2026-09-19" }, { ...deps, createAccount: spy }), ValidationError);

    expect(ceo.message).toBe("대표 · 입사일부터 등록");
    expect(sysadmin.message).toBe("시스템 관리자 · 입사일부터 등록");
    expect(spy).not.toHaveBeenCalled();
    expect(await countRows("users")).toBe(usersBefore);
    const { userId } = await registerPerson(admin, { ...register(CEO_ROLE_ID), hireDate: "2026-09-18" }, deps);
    expect(await roleOf(userId)).toBe(CEO_ROLE_ID);
  });

  it("다른 계급은 입사일이 내일이어도 등록한다(D-1 범위)", async () => {
    const admin = await makeAdmin("관리자");

    const { userId } = await registerPerson(admin, { ...register(DEFAULT_ROLE_ID), hireDate: "2026-09-19" }, deps);

    expect(await roleOf(userId)).toBe(DEFAULT_ROLE_ID);
  });

  it("대표 K가 어제 퇴사했거나 보관됐으면 새 대표를 등록한다", async () => {
    const admin = await makeAdmin("관리자");
    const k = await makeSeated(uniqueName("대표K"), CEO_ROLE_ID, null);
    await updateUserResignationDate(SYSTEM_VIEWER, k.id, "2026-09-17");
    const first = await registerPerson(admin, register(CEO_ROLE_ID), deps);
    await archive(SYSTEM_VIEWER, "user", first.userId, deps);

    const second = await registerPerson(admin, register(CEO_ROLE_ID), deps);

    expect(await roleOf(second.userId)).toBe(CEO_ROLE_ID);
  });

  it("PM을 대표로 바꾸면 거부 · 계급 · 로그 그대로, 대표를 PM으로 바꾸면(자리 비우기) 통과 · 그 뒤 대표로 바꾸기 통과", async () => {
    const admin = await makeAdmin("관리자");
    const k = await makeSeated(uniqueName("대표K"), CEO_ROLE_ID, null);
    const x = await makeSeated(uniqueName("PM X"), DEFAULT_ROLE_ID, null);
    const logsBefore = await countLogs("permission_change", "user", x.id);

    const error = await refusal(changePersonRole(admin, x.id, CEO_ROLE_ID, deps), SeatTakenError);

    expect(error.message).toBe(`대표 있음 · ${await nameOf(k.id)}`);
    expect(await roleOf(x.id)).toBe(DEFAULT_ROLE_ID);
    expect(await countLogs("permission_change", "user", x.id)).toBe(logsBefore);
    await changePersonRole(admin, k.id, DEFAULT_ROLE_ID, deps);
    await changePersonRole(admin, x.id, CEO_ROLE_ID, deps);
    expect(await roleOf(x.id)).toBe(CEO_ROLE_ID);
  });

  it("지난 대표 L의 퇴사일을 지우면(재입사) 대표 K와 겹쳐 거부 · 퇴사일 그대로", async () => {
    const admin = await makeAdmin("관리자");
    const l = await makeSeated(uniqueName("대표L"), CEO_ROLE_ID, null);
    await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-09-01");
    const k = await makeSeated(uniqueName("대표K"), CEO_ROLE_ID, null);

    const error = await refusal(setResignationDate(admin, l.id, null, deps), SeatTakenError);

    expect(error.message).toBe(`대표 있음 · ${await nameOf(k.id)}`);
    expect((await findUserById(SYSTEM_VIEWER, l.id))?.resignationDate).toBe("2026-09-01");
  });

  it("데이터에 이미 있는 후임 S의 입사일을 현 대표 재직 중(오늘)으로 당기면 자리 거부(D-E5)", async () => {
    const admin = await makeAdmin("관리자");
    const k = await makeSeated(uniqueName("대표K"), CEO_ROLE_ID, null);
    await updateUserResignationDate(SYSTEM_VIEWER, k.id, "2026-09-21");
    // D-1 뒤로 입사일이 미래인 대표는 등록 · 변경으로 못 만든다 — 리포지토리로 미리 둔다(데이터에 이미 있는 후임).
    const { id: s } = await makeSeated(uniqueName("후임S"), CEO_ROLE_ID, null);
    await updateUserHireDate(SYSTEM_VIEWER, s, "2026-09-22");

    const error = await refusal(setHireDate(admin, s, "2026-09-18", deps), SeatTakenError);

    expect(error.message).toBe(`대표 있음 · ${await nameOf(k.id)}`);
    expect((await findUserById(SYSTEM_VIEWER, s))?.hireDate).toBe("2026-09-22");
  });

  // 07.1 D-1(2026-10-27 사용자 결정): 등록 말고 남은 두 길 — 입사일을 오늘 뒤로 옮기기 · 입사일이 오늘 뒤인 사람을 회사 자리로 바꾸기.
  it("대표 · 시스템 관리자의 입사일을 내일로 옮기면 거부 · 입사일 그대로, 오늘로는 통과(D-1)", async () => {
    const admin = await makeAdmin("관리자");
    const k = await makeSeated(uniqueName("대표K"), CEO_ROLE_ID, null);
    const l = await makeSeated(uniqueName("관리자L"), SYSADMIN_ROLE_ID, null);
    await updateUserHireDate(SYSTEM_VIEWER, k.id, "2026-01-01");

    const ceo = await refusal(setHireDate(admin, k.id, "2026-09-19", deps), ValidationError);
    const sysadmin = await refusal(setHireDate(admin, l.id, "2026-09-19", deps), ValidationError);

    expect(ceo.message).toBe("대표 · 입사일부터 등록");
    expect(sysadmin.message).toBe("시스템 관리자 · 입사일부터 등록");
    expect((await findUserById(SYSTEM_VIEWER, k.id))?.hireDate).toBe("2026-01-01");
    expect((await findUserById(SYSTEM_VIEWER, l.id))?.hireDate).toBeNull();
    await setHireDate(admin, k.id, "2026-09-18", deps);
    expect((await findUserById(SYSTEM_VIEWER, k.id))?.hireDate).toBe("2026-09-18");
  });

  it("입사일이 내일인 PM을 대표 · 시스템 관리자로 바꾸면 거부 · 계급 · 로그 그대로, 오늘 입사면 통과(D-1)", async () => {
    const admin = await makeAdmin("관리자");
    const x = await makeSeated(uniqueName("PM X"), DEFAULT_ROLE_ID, null);
    await updateUserHireDate(SYSTEM_VIEWER, x.id, "2026-09-19");
    const logsBefore = await countLogs("permission_change", "user", x.id);

    const ceo = await refusal(changePersonRole(admin, x.id, CEO_ROLE_ID, deps), ValidationError);
    const sysadmin = await refusal(changePersonRole(admin, x.id, SYSADMIN_ROLE_ID, deps), ValidationError);

    expect(ceo.message).toBe("대표 · 입사일부터 등록");
    expect(sysadmin.message).toBe("시스템 관리자 · 입사일부터 등록");
    expect(await roleOf(x.id)).toBe(DEFAULT_ROLE_ID);
    expect(await countLogs("permission_change", "user", x.id)).toBe(logsBefore);
    await updateUserHireDate(SYSTEM_VIEWER, x.id, "2026-09-18");
    await changePersonRole(admin, x.id, CEO_ROLE_ID, deps);
    expect(await roleOf(x.id)).toBe(CEO_ROLE_ID);
  });

  it("시스템 관리자도 같다 — 등록 · 계급 바꾸기 · 퇴사일 지우기가 `시스템 관리자 있음 · 이름`으로 거부", async () => {
    const admin = await makeAdmin(uniqueName("관리자A"));
    const x = await makeSeated(uniqueName("PM X"), DEFAULT_ROLE_ID, null);
    const l = await makeSeated(uniqueName("관리자L"), SYSADMIN_ROLE_ID, null);
    await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-09-01");
    const want = `시스템 관리자 있음 · ${await nameOf(admin.id)}`;

    expect((await refusal(registerPerson(admin, register(SYSADMIN_ROLE_ID), deps), SeatTakenError)).message).toBe(want);
    expect((await refusal(changePersonRole(admin, x.id, SYSADMIN_ROLE_ID, deps), SeatTakenError)).message).toBe(want);
    expect((await refusal(setResignationDate(admin, l.id, null, deps), SeatTakenError)).message).toBe(want);
    expect(await roleOf(x.id)).toBe(DEFAULT_ROLE_ID);
  });

  it("SYSTEM_VIEWER도 회사 자리 검사를 지난다(O4)", async () => {
    const k = await makeSeated(uniqueName("대표K"), CEO_ROLE_ID, null);

    const error = await refusal(registerPerson(SYSTEM_VIEWER, register(CEO_ROLE_ID), deps), SeatTakenError);

    expect(error.message).toBe(`대표 있음 · ${await nameOf(k.id)}`);
  });

  it("이미 대표가 둘인 데이터는 새 자리를 더하지 않는 저장(입사일 늦추기 · 같은 계급)을 막지 않는다", async () => {
    const admin = await makeAdmin("관리자");
    const k1 = await makeSeated(uniqueName("대표K1"), CEO_ROLE_ID, null);
    await makeSeated(uniqueName("대표K2"), CEO_ROLE_ID, null);
    await updateUserHireDate(SYSTEM_VIEWER, k1.id, "2026-01-01");

    await setHireDate(admin, k1.id, "2026-02-01", deps);
    await changePersonRole(admin, k1.id, CEO_ROLE_ID, deps);

    expect((await findUserById(SYSTEM_VIEWER, k1.id))?.hireDate).toBe("2026-02-01");
  });
});
