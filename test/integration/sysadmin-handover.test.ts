import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { db } from "@/db/client";
import { ForbiddenError, handOverSysadmin, hasOtherSysadmin, ValidationError } from "@/domain/people";
import { SeatTakenError } from "@/domain/people/seat-rules";
import { RetiredPersonEditError } from "@/domain/people/retired";
import { queryActionLog } from "@/repositories/action-log";
import { countActiveAdmins, setUserArchived, updateUserHireDate, updateUserResignationDate } from "@/repositories/users";
import { ADMIN_SEAT_LOCK_KEY, listCompanySeatHolders } from "@/repositories/seats";
import { NOW_2026 } from "./approvals-fixtures";
import { holdKey, makeAdmin, makeAdminRole, makeDelegatedRole, makeOrgTeam, makeSeated, roleOf, uniqueName, waitingOnKey } from "./admin-cap-fixtures";

// 07.1 D-2(2026-10-27 17:39 KST 사용자 결정): 시스템 관리자가 한 명뿐일 때 화면에서 다른 사람에게 자리를 넘긴다 — 한 tx에서 새 사람을
// 시스템 관리자로 넣고 옛 사람을 빼서 관리자 0명인 순간이 없다. 옛 사람은 기본 계급(DEFAULT_ROLE_ID)으로.

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

async function handoverLogs(entityId: string) {
  const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "permission_change" });
  return rows.filter((row) => row.entity === "user" && row.entityId === entityId);
}

describe("시스템 관리자 넘기기(07.1 D-2)", () => {
  it("유일 시스템 관리자 A가 재직 PM B에게 넘기면 B는 시스템 관리자 · A는 기본 계급 · 관리자 1명 · 로그 둘", async () => {
    const a = await makeAdmin(uniqueName("관리자A"));
    const b = await makeSeated(uniqueName("PM B"), DEFAULT_ROLE_ID, null);
    await updateUserHireDate(SYSTEM_VIEWER, b.id, TODAY);

    await handOverSysadmin(a, b.id, deps);

    expect(await roleOf(b.id)).toBe(SYSADMIN_ROLE_ID);
    expect(await roleOf(a.id)).toBe(DEFAULT_ROLE_ID);
    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: TODAY })).toBe(1);
    const [toLog] = await handoverLogs(b.id);
    const [fromLog] = await handoverLogs(a.id);
    expect(toLog?.detail).toMatchObject({ reason: "sysadmin_handover", changes: { roleId: [DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID] } });
    expect(fromLog?.detail).toMatchObject({ reason: "sysadmin_handover", changes: { roleId: [SYSADMIN_ROLE_ID, DEFAULT_ROLE_ID] } });
  });

  it("팀장 B에게 넘기면 B의 팀장 자리는 비고 시스템 관리자가 된다", async () => {
    const a = await makeAdmin(uniqueName("관리자A"));
    const { teamId } = await makeOrgTeam();
    const b = await makeSeated(uniqueName("팀장B"), TEAM_LEAD_ROLE_ID, teamId);

    await handOverSysadmin(a, b.id, deps);

    expect(await roleOf(b.id)).toBe(SYSADMIN_ROLE_ID);
    expect(await roleOf(a.id)).toBe(DEFAULT_ROLE_ID);
  });

  it("대상이 보관 · 퇴직 · 입사일 내일 · 본인이면 거부 · 계급 · 로그 그대로(D-1과 같은 규칙)", async () => {
    const a = await makeAdmin(uniqueName("관리자A"));
    const archived = await makeSeated(uniqueName("보관"), DEFAULT_ROLE_ID, null);
    await setUserArchived(SYSTEM_VIEWER, archived.id, true);
    const retired = await makeSeated(uniqueName("퇴직"), DEFAULT_ROLE_ID, null);
    await updateUserResignationDate(SYSTEM_VIEWER, retired.id, "2026-09-17");
    const future = await makeSeated(uniqueName("내일 입사"), DEFAULT_ROLE_ID, null);
    await updateUserHireDate(SYSTEM_VIEWER, future.id, "2026-09-19");

    expect((await refusal(handOverSysadmin(a, archived.id, deps), ValidationError)).message).toBe("보관된 사람 · 먼저 복원");
    await refusal(handOverSysadmin(a, retired.id, deps), RetiredPersonEditError);
    expect((await refusal(handOverSysadmin(a, future.id, deps), ValidationError)).message).toBe("시스템 관리자 · 입사일부터 등록");
    expect((await refusal(handOverSysadmin(a, a.id, deps), ValidationError)).message).toBe("본인에게 넘기기 불가");
    expect(await roleOf(a.id)).toBe(SYSADMIN_ROLE_ID);
    for (const person of [archived, retired, future]) expect(await roleOf(person.id)).toBe(DEFAULT_ROLE_ID);
    expect(await handoverLogs(a.id)).toHaveLength(0);
  });

  it("퇴직 예정인 사람에게 넘기면 다른 관리자급이 있어도 전용 문구로 거부(화면과 같은 판정)", async () => {
    const a = await makeAdmin(uniqueName("관리자A"));
    // 관리자급 계급을 가진 재직자가 따로 있으면 마지막 관리자 판정은 통과한다 — 퇴직 예정 거부는 그와 무관해야 한다.
    await makeSeated(uniqueName("관리자급"), await makeAdminRole("관리자급"), null);
    const b = await makeSeated(uniqueName("PM B"), DEFAULT_ROLE_ID, null);
    await updateUserResignationDate(SYSTEM_VIEWER, b.id, "2026-12-31");

    const error = await refusal(handOverSysadmin(a, b.id, deps), ValidationError);

    expect(error.message).toBe("퇴직 예정자에게 넘기기 불가");
    expect(await roleOf(a.id)).toBe(SYSADMIN_ROLE_ID);
    expect(await roleOf(b.id)).toBe(DEFAULT_ROLE_ID);
    expect(await handoverLogs(a.id)).toHaveLength(0);
  });

  it("재직 대표에게는 넘기지 못한다 · 계급 그대로 · 재직 대표 수 그대로(사용자 결정 2026-10-27 20:45 KST)", async () => {
    const a = await makeAdmin(uniqueName("관리자A"));
    const ceo = await makeSeated(uniqueName("대표"), CEO_ROLE_ID, null);
    const ceosBefore = await listCompanySeatHolders(SYSTEM_VIEWER, { roleId: CEO_ROLE_ID, today: TODAY }, db);

    const error = await refusal(handOverSysadmin(a, ceo.id, deps), ValidationError);

    expect(error.message).toBe("대표에게 넘기기 불가");
    expect(await roleOf(ceo.id)).toBe(CEO_ROLE_ID);
    expect(await roleOf(a.id)).toBe(SYSADMIN_ROLE_ID);
    expect(await listCompanySeatHolders(SYSTEM_VIEWER, { roleId: CEO_ROLE_ID, today: TODAY }, db)).toHaveLength(ceosBefore.length);
    expect(ceosBefore.some((row) => row.userId === ceo.id)).toBe(true);
    expect(await handoverLogs(a.id)).toHaveLength(0);
  });

  it("시스템 관리자가 이미 둘이면(#304 이전 데이터) 회사 자리 검사가 거부 · 둘 다 그대로 · 화면 판정도 「다른 시스템 관리자 있음」", async () => {
    const a = await makeAdmin(uniqueName("관리자A"));
    expect(await hasOtherSysadmin(a, TODAY)).toBe(false);
    const a2 = await makeAdmin(uniqueName("관리자A2"));
    const b = await makeSeated(uniqueName("PM B"), DEFAULT_ROLE_ID, null);

    expect(await hasOtherSysadmin(a, TODAY)).toBe(true);
    await refusal(handOverSysadmin(a, b.id, deps), SeatTakenError);

    expect(await roleOf(a.id)).toBe(SYSADMIN_ROLE_ID);
    expect(await roleOf(a2.id)).toBe(SYSADMIN_ROLE_ID);
    expect(await roleOf(b.id)).toBe(DEFAULT_ROLE_ID);
  });

  it("시스템 관리자가 아닌 행위자는 잠금을 잡기 전에 거부 — 관리자 키를 누가 쥐고 있어도 기다리지 않는다", async () => {
    await makeAdmin(uniqueName("관리자A"));
    const delegate = await makeSeated(uniqueName("위임"), await makeDelegatedRole({}), null);
    const b = await makeSeated(uniqueName("PM B"), DEFAULT_ROLE_ID, null);
    const held = await holdKey(ADMIN_SEAT_LOCK_KEY);
    try {
      const error = await refusal(handOverSysadmin(delegate, b.id, deps), ForbiddenError);
      expect(error.message).toBe("시스템 관리자만 넘기기");
    } finally {
      await held.release();
    }
  });

  it("시스템 관리자가 아닌 사람 쓰기 권한 보유자는 넘기지 못한다", async () => {
    await makeAdmin(uniqueName("관리자A"));
    const delegate = await makeSeated(uniqueName("위임"), await makeDelegatedRole({}), null);
    const b = await makeSeated(uniqueName("PM B"), DEFAULT_ROLE_ID, null);

    const error = await refusal(handOverSysadmin(delegate, b.id, deps), ForbiddenError);

    expect(error.message).toBe("시스템 관리자만 넘기기");
    expect(await roleOf(b.id)).toBe(DEFAULT_ROLE_ID);
  });

  it("세션 계급이 낡았어도(이미 넘긴 A) 잠금 뒤 DB 계급으로 판정해 거부", async () => {
    const a = await makeAdmin(uniqueName("관리자A"));
    const b = await makeSeated(uniqueName("PM B"), DEFAULT_ROLE_ID, null);
    const c = await makeSeated(uniqueName("PM C"), DEFAULT_ROLE_ID, null);
    await handOverSysadmin(a, b.id, deps);

    const error = await refusal(handOverSysadmin(a, c.id, { ...deps, can: () => Promise.resolve(true) }), ForbiddenError);

    expect(error.message).toBe("시스템 관리자만 넘기기");
    expect(await roleOf(c.id)).toBe(DEFAULT_ROLE_ID);
  });
});

describe("시스템 관리자 넘기기 동시 실행(07.1 D-2)", () => {
  it("A가 B · C에게 동시에 넘기면 하나만 성공 · 시스템 관리자는 1명", async () => {
    const a = await makeAdmin(uniqueName("관리자A"));
    const b = await makeSeated(uniqueName("PM B"), DEFAULT_ROLE_ID, null);
    const c = await makeSeated(uniqueName("PM C"), DEFAULT_ROLE_ID, null);

    const results = await Promise.allSettled([
      handOverSysadmin(a, b.id, { ...deps, can: () => Promise.resolve(true) }),
      handOverSysadmin(a, c.id, { ...deps, can: () => Promise.resolve(true) }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((result) => result.status === "rejected");
    expect(loser?.status === "rejected" ? loser.reason : null).toBeInstanceOf(ForbiddenError);
    const roles = [await roleOf(b.id), await roleOf(c.id)];
    expect(roles.filter((roleId) => roleId === SYSADMIN_ROLE_ID)).toHaveLength(1);
    expect(await roleOf(a.id)).toBe(DEFAULT_ROLE_ID);
    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: TODAY })).toBe(1);
  });

  it("회사 자리 키(seat:company:role-sysadmin)를 쥔 다른 쓰기가 있으면 기다렸다가 진행", async () => {
    const a = await makeAdmin(uniqueName("관리자A"));
    const b = await makeSeated(uniqueName("PM B"), DEFAULT_ROLE_ID, null);
    const key = `seat:company:${SYSADMIN_ROLE_ID}`;
    const held = await holdKey(key);
    let pending: Promise<void> = Promise.resolve();
    try {
      pending = handOverSysadmin(a, b.id, deps);
      await expect.poll(() => waitingOnKey(key)).toBe(1);
      expect(await roleOf(b.id)).toBe(DEFAULT_ROLE_ID);
    } finally {
      await held.release();
    }
    await pending;

    expect(await roleOf(b.id)).toBe(SYSADMIN_ROLE_ID);
  });
});
