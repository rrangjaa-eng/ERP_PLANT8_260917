import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { changePersonRole } from "@/domain/people";
import { SeatTakenError } from "@/domain/people/seat-rules";
import { findUserById, updateUserResignationDate } from "@/repositories/users";
import { NOW_2026 } from "./approvals-fixtures";
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
