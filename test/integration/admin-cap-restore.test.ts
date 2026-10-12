import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { archive, restore } from "@/domain/archive";
import { PersonNotRestorableError, PersonRestoreForbiddenError } from "@/domain/people/restore";
import { SeatTakenError } from "@/domain/people/seat-rules";
import { findUserById, updateUserResignationDate } from "@/repositories/users";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { addTeam, countLogs, makeAdmin, makeDelegatedRole, makeOrgTeam, makeSeated, uniqueName } from "./admin-cap-fixtures";

// 06.4-03: 보관함 「복원」으로 사람을 되살릴 때 사람 쓰기 · 권한 상한 · 자리를 다시 본다(D-6406 · G36).
// 거부 문구는 06.4-02 「문구 표(D3)」 복원 열 — 끝이 ` · 복원 불가`라 보관함 토스트가 이름을 자르지 않는다(N1).

const deps = { now: () => NOW_2026 };
const TAIL = " · 복원 불가";

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

async function archivedAtOf(userId: string): Promise<Date | null> {
  return (await findUserById(SYSTEM_VIEWER, userId))?.archivedAt ?? null;
}

// 보관함 쓰기만 가진 계급 K, PM 복사 + 사람 · 보관함 쓰기 위임 계급 M.
async function archiveOnlyViewer() {
  const roleK = await makeDelegatedRole({
    name: "보관함 담당",
    copyFrom: [],
    menus: [
      { menu: "admin.archive", action: "view" },
      { menu: "admin.archive", action: "write" },
    ],
  });
  return makePerson(uniqueName("보관함 담당 V"), roleK, null);
}

async function delegatedViewer() {
  const roleM = await makeDelegatedRole({
    name: "인사 위임",
    copyFrom: [DEFAULT_ROLE_ID],
    menus: [
      { menu: "admin.people", action: "view" },
      { menu: "admin.people", action: "write" },
      { menu: "admin.archive", action: "view" },
      { menu: "admin.archive", action: "write" },
    ],
  });
  return makePerson(uniqueName("위임 D"), roleM, null);
}

async function archivedPm() {
  const p = await makeSeated(uniqueName("PM P"), DEFAULT_ROLE_ID, null);
  await archive(SYSTEM_VIEWER, "user", p.id, deps);
  return p;
}

describe("사람 복원(06.4 D-6406 · G36)", () => {
  it("사람 쓰기 없이 보관함 쓰기만 있으면 거부 · 보관 · 로그 그대로", async () => {
    const v = await archiveOnlyViewer();
    const p = await archivedPm();
    const logsBefore = await countLogs("restore", "user", p.id);

    const error = await refusal(restore(v, "user", p.id, deps), PersonRestoreForbiddenError);

    expect(error.message).toBe("사람 복원 권한 없음 · 시스템 관리자 · 복원 불가");
    expect(await archivedAtOf(p.id)).not.toBeNull();
    expect(await countLogs("restore", "user", p.id)).toBe(logsBefore);
  });

  it("위임받은 사람은 보관된 시스템 관리자를 되살리지 못하고, PM은 되살린다 · SYSTEM은 관리자도 되살린다", async () => {
    const d = await delegatedViewer();
    const a = await makeAdmin(uniqueName("관리자 A"));
    await archive(SYSTEM_VIEWER, "user", a.id, deps);
    const p = await archivedPm();

    const error = await refusal(restore(d, "user", a.id, deps), RoleGrantForbiddenError);
    expect(error.message).toBe("계급 지정 권한 없음 · 시스템 관리자" + TAIL);
    expect(await archivedAtOf(a.id)).not.toBeNull();

    expect(await restore(d, "user", p.id, deps)).toEqual({ restored: true });
    expect(await archivedAtOf(p.id)).toBeNull();
    expect(await countLogs("restore", "user", p.id)).toBe(1);

    expect(await restore(SYSTEM_VIEWER, "user", a.id, deps)).toEqual({ restored: true });
    expect(await archivedAtOf(a.id)).toBeNull();
  });

  it("보관된 팀장의 팀에 그새 팀장이 있으면 거부 · 문구에 그 이름 · 못 보면 담당 · 비운 뒤엔 복원", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "user", l.id, deps);
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);

    const error = await refusal(restore(admin, "user", l.id, deps), SeatTakenError);
    expect(error.message).toBe(`팀장 있음 · ${await nameOf(z.id)}` + TAIL);
    expect(await archivedAtOf(l.id)).not.toBeNull();

    const hidden = await refusal(restore(admin, "user", l.id, { ...deps, visible: () => Promise.resolve(false) }), SeatTakenError);
    expect(hidden.message).toBe("팀장 있음 · 시스템 관리자" + TAIL);

    await archive(SYSTEM_VIEWER, "user", z.id, deps);
    expect(await restore(admin, "user", l.id, deps)).toEqual({ restored: true });
    expect(await archivedAtOf(l.id)).toBeNull();
  });

  it("보관된 본부 책임자의 본부에 그새 책임자가 있으면 거부 · 문구에 그 이름", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const t2 = await addTeam(orgUnitId);
    const h = await makeSeated(uniqueName("책임자H"), DIVISION_HEAD_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "user", h.id, deps);
    const h2 = await makeSeated(uniqueName("책임자H2"), DIVISION_HEAD_ROLE_ID, t2);

    const error = await refusal(restore(admin, "user", h.id, deps), SeatTakenError);

    expect(error.message).toBe(`본부 책임자 있음 · ${await nameOf(h2.id)}` + TAIL);
    expect(await archivedAtOf(h.id)).not.toBeNull();
  });

  it("퇴직일이 지난 팀장은 팀에 다른 팀장이 있어도 복원된다(자리 구간이 퇴직일에서 잘림)", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-09-01");
    await archive(SYSTEM_VIEWER, "user", l.id, deps);
    await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);

    expect(await restore(admin, "user", l.id, deps)).toEqual({ restored: true });
    expect(await archivedAtOf(l.id)).toBeNull();
  });

  it("SYSTEM_VIEWER도 자리 검사는 면제되지 않는다(O4 · R5)", async () => {
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "user", l.id, deps);
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);

    const error = await refusal(restore(SYSTEM_VIEWER, "user", l.id, deps), SeatTakenError);

    expect(error.message).toBe(`팀장 있음 · ${await nameOf(z.id)}` + TAIL);
    expect(await archivedAtOf(l.id)).not.toBeNull();
  });

  it("이미 활성인 사람은 { restored: false } · 로그 없음, 없는 사람은 없는 사람 · 복원 불가", async () => {
    const admin = await makeAdmin("관리자");
    const p = await makeSeated(uniqueName("PM P"), DEFAULT_ROLE_ID, null);

    expect(await restore(admin, "user", p.id, deps)).toEqual({ restored: false });
    expect(await countLogs("restore", "user", p.id)).toBe(0);

    const error = await refusal(restore(admin, "user", randomUUID(), deps), PersonNotRestorableError);
    expect(error.message).toBe("없는 사람 · 복원 불가");
  });
});
