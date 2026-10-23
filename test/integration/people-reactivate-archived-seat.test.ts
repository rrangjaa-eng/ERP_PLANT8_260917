import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createRole, DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { archive } from "@/domain/archive";
import { setResignationDate, ValidationError } from "@/domain/people";
import { restoreUser, PersonNotRestorableError } from "@/domain/people/restore";
import { RETIRED_EDIT_MESSAGE, RetiredPersonEditError } from "@/domain/people/retired";
import { findUserById, setUserArchived, updateUserResignationDate } from "@/repositories/users";
import { NOW_2026 } from "./approvals-fixtures";
import { makeAdmin, makeOrgTeam, makeSeated, uniqueName } from "./admin-cap-fixtures";

// 07-21 게이트(/review P3-3 · /cso P3-b) · 사용자 결정 2026-10-23 15:44 KST 「막기」: 퇴직자 복원 · 퇴직일 지우기로 활성이 되는 사람의
// 팀 · 본부 · 계급이 보관됐으면 거부 — 보관 막기(소속 사람 남은 팀 · 본부 · 계급은 보관 안 됨)와 짝. 오늘 = 2026-09-18 KST.

const deps = { now: () => NOW_2026 };

async function refusal<E extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(type);
  return error as E;
}

async function newRole(): Promise<string> {
  return (await createRole(SYSTEM_VIEWER, { name: `계급-${randomUUID()}` })).id;
}

// 계급 보관이 계급 행을 FOR UPDATE로 잡고(소속 0명으로 센 뒤) 아직 커밋하지 않은 상태를 만든다.
async function holdRoleArchiving(roleId: string): Promise<{ release: () => Promise<void> }> {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let held: () => void = () => {};
  const holding = new Promise<void>((resolve) => {
    held = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).for("update");
    await tx.update(roles).set({ archivedAt: new Date() }).where(eq(roles.id, roleId));
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

async function waitForRowLockWaiters(count: number): Promise<void> {
  for (let tries = 0; tries < 100; tries++) {
    const result = await db.execute<{ n: string }>(
      sql`select count(*)::text as n from pg_stat_activity where wait_event_type = 'Lock' and wait_event in ('tuple', 'transactionid')`,
    );
    if (Number(result.rows[0]?.n ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("행 잠금 대기를 보지 못함");
}

describe("퇴직자 복원 — 보관된 팀 · 본부 · 계급이면 거부(07-21 사용자 결정)", () => {
  it("보관된 팀의 사람 복원 → 「보관된 팀 · 먼저 옮기기 · 복원 불가」 · 보관 그대로", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const person = await makeSeated(uniqueName("복원"), DEFAULT_ROLE_ID, teamId);
    await setUserArchived(SYSTEM_VIEWER, person.id, true);
    await archive(SYSTEM_VIEWER, "team", teamId, deps);

    const error = await refusal(restoreUser(admin, person.id, deps), PersonNotRestorableError);

    expect(error.message).toBe("보관된 팀 · 먼저 옮기기 · 복원 불가");
    expect((await findUserById(SYSTEM_VIEWER, person.id))?.archivedAt).not.toBeNull();
  });

  it("팀은 살아 있고 본부가 보관됐으면 「보관된 본부 · 먼저 옮기기 · 복원 불가」", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const person = await makeSeated(uniqueName("복원"), DEFAULT_ROLE_ID, teamId);
    await setUserArchived(SYSTEM_VIEWER, person.id, true);
    await archive(SYSTEM_VIEWER, "org_unit", orgUnitId, deps);

    const error = await refusal(restoreUser(admin, person.id, deps), PersonNotRestorableError);

    expect(error.message).toBe("보관된 본부 · 먼저 옮기기 · 복원 불가");
    expect((await findUserById(SYSTEM_VIEWER, person.id))?.archivedAt).not.toBeNull();
  });

  it("보관된 계급의 사람 복원 → 「보관된 계급 · 먼저 바꾸기 · 복원 불가」 · 보관 그대로", async () => {
    const admin = await makeAdmin("관리자");
    const roleId = await newRole();
    const person = await makeSeated(uniqueName("복원"), roleId, null);
    await setUserArchived(SYSTEM_VIEWER, person.id, true);
    await archive(admin, "roles", roleId, deps);

    const error = await refusal(restoreUser(admin, person.id, deps), PersonNotRestorableError);

    expect(error.message).toBe("보관된 계급 · 먼저 바꾸기 · 복원 불가");
    expect((await findUserById(SYSTEM_VIEWER, person.id))?.archivedAt).not.toBeNull();
  });

  it("복원해도 퇴직 상태인 사람(퇴직일 지남)은 보관된 팀 · 계급이어도 복원된다 — 활성이 되지 않는다", async () => {
    const admin = await makeAdmin("관리자");
    const roleId = await newRole();
    const { teamId } = await makeOrgTeam();
    const person = await makeSeated(uniqueName("퇴직"), roleId, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, person.id, "2026-09-01");
    await setUserArchived(SYSTEM_VIEWER, person.id, true);
    await archive(admin, "roles", roleId, deps);
    await archive(admin, "team", teamId, deps);

    expect(await restoreUser(admin, person.id, deps)).toEqual({ restored: true });
  });
});

describe("퇴직일 지우기 — 보관된 팀 · 계급이면 거부(07-21 사용자 결정)", () => {
  it("보관된 팀의 퇴직자 퇴직일 지우기 → 「보관된 팀 · 먼저 옮기기」 · 퇴직일 그대로", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const person = await makeSeated(uniqueName("퇴직"), DEFAULT_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, person.id, "2026-09-01");
    await archive(admin, "team", teamId, deps);

    const error = await refusal(setResignationDate(admin, person.id, null, deps), ValidationError);

    expect(error.message).toBe("보관된 팀 · 먼저 옮기기");
    expect((await findUserById(SYSTEM_VIEWER, person.id))?.resignationDate).toBe("2026-09-01");
  });

  // F24 사용자 결정(카드 2026-10-23 12:34 KST) 「퇴직한 사람의 퇴직일은 비우기만 허용」이 main에 먼저 들어와, 늦추기는 보관 판정보다 앞에서 F24 거부를 받는다.
  it("보관된 계급의 퇴직자 퇴직일을 미래로 늦추기 → F24 퇴직자 거부 · 퇴직일 그대로", async () => {
    const admin = await makeAdmin("관리자");
    const roleId = await newRole();
    const person = await makeSeated(uniqueName("퇴직"), roleId, null);
    await updateUserResignationDate(SYSTEM_VIEWER, person.id, "2026-09-01");
    await archive(admin, "roles", roleId, deps);

    const error = await refusal(setResignationDate(admin, person.id, "2026-12-31", deps), RetiredPersonEditError);

    expect(error.message).toBe(RETIRED_EDIT_MESSAGE);
    expect((await findUserById(SYSTEM_VIEWER, person.id))?.resignationDate).toBe("2026-09-01");
  });

  it("퇴직자 퇴직일을 다른 지난 날로 고치기 → F24 퇴직자 거부(보관된 계급과 무관) · 퇴직일 그대로", async () => {
    const admin = await makeAdmin("관리자");
    const roleId = await newRole();
    const person = await makeSeated(uniqueName("퇴직"), roleId, null);
    await updateUserResignationDate(SYSTEM_VIEWER, person.id, "2026-09-01");
    await archive(admin, "roles", roleId, deps);

    const error = await refusal(setResignationDate(admin, person.id, "2026-08-31", deps), RetiredPersonEditError);
    expect(error.message).toBe(RETIRED_EDIT_MESSAGE);
    expect((await findUserById(SYSTEM_VIEWER, person.id))?.resignationDate).toBe("2026-09-01");
  });

  it("계급 보관이 계급 행을 잡은 동안 퇴직일 지우기는 기다렸다가 보관을 보고 거부한다(FOR SHARE)", async () => {
    const admin = await makeAdmin("관리자");
    const roleId = await newRole();
    const person = await makeSeated(uniqueName("퇴직"), roleId, null);
    await updateUserResignationDate(SYSTEM_VIEWER, person.id, "2026-09-01");

    const held = await holdRoleArchiving(roleId);
    const clearing = setResignationDate(admin, person.id, null, deps).then(
      () => null,
      (caught: unknown) => caught,
    );
    try {
      await waitForRowLockWaiters(1);
    } finally {
      await held.release();
    }

    const error = await clearing;
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toBe("보관된 계급 · 먼저 바꾸기");
    expect((await findUserById(SYSTEM_VIEWER, person.id))?.resignationDate).toBe("2026-09-01");
  });
});
