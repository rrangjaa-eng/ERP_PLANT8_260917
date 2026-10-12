import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { LastAdminError } from "@/domain/permissions/last-admin";
import { RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { archivePerson, changePersonRole, setHireDate, setResignationDate, UserNotFoundError } from "@/domain/people";
import { archive, ArchivableRowNotFoundError, SelfArchiveError } from "@/domain/archive";
import { findUserById, updateUserResignationDate } from "@/repositories/users";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { countLogs, makeAdmin, makeAdminRole, makeDelegatedRole, makeSeated, roleOf, uniqueName } from "./admin-cap-fixtures";

// 06.4-02: 계급 변경으로 마지막 관리자가 사라지지 않는다 — 남은 관리자는 퇴직일 NULL만 센다(D-6412).

const deps = { now: () => NOW_2026 };
const LAST_ADMIN = "마지막 관리자 · 관리자 먼저 지정";

async function refusal<E extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(type);
  return error as E;
}

// 재직 관리자는 Y 한 명 — 행위자 X는 시스템 관리자지만 퇴직일 2026-09-01(지남).
async function oneAdminWorld() {
  const x = await makeAdmin("관리자 X");
  await updateUserResignationDate(SYSTEM_VIEWER, x.id, "2026-09-01");
  const y = await makeAdmin("관리자 Y");
  return { x, y };
}

describe("계급 변경 마지막 관리자(06.4 D-6403)", () => {
  it("마지막 재직 관리자를 PM으로 내리면 거부 · 계급 · 로그 그대로", async () => {
    const { x, y } = await oneAdminWorld();
    const logsBefore = await countLogs("permission_change", "user", y.id);

    const error = await refusal(changePersonRole(x, y.id, DEFAULT_ROLE_ID, deps), LastAdminError);

    expect(error.message).toBe(LAST_ADMIN);
    expect(await roleOf(y.id)).toBe(SYSADMIN_ROLE_ID);
    expect(await countLogs("permission_change", "user", y.id)).toBe(logsBefore);
  });

  it("마지막 관리자를 다른 관리자급 계급으로 바꾸면 통과", async () => {
    const { x, y } = await oneAdminWorld();
    const roleB = await makeAdminRole("관리자급 B");

    await changePersonRole(x, y.id, roleB, deps);

    expect(await roleOf(y.id)).toBe(roleB);
  });

  it("SYSTEM_VIEWER는 마지막 관리자도 내릴 수 있다(O4)", async () => {
    const { y } = await oneAdminWorld();

    await changePersonRole(SYSTEM_VIEWER, y.id, DEFAULT_ROLE_ID, deps);

    expect(await roleOf(y.id)).toBe(DEFAULT_ROLE_ID);
  });

  it("남은 관리자가 퇴직 예정(12-31)뿐이면 거부, 퇴직일 없는 관리자가 더 있으면 통과(D-6412 · R5)", async () => {
    const a = await makeAdmin("관리자 A");
    await updateUserResignationDate(SYSTEM_VIEWER, a.id, "2026-12-31");
    const b = await makeAdmin("관리자 B");

    const error = await refusal(changePersonRole(a, b.id, DEFAULT_ROLE_ID, deps), LastAdminError);
    expect(error.message).toBe(LAST_ADMIN);
    expect(await roleOf(b.id)).toBe(SYSADMIN_ROLE_ID);

    await makeAdmin("관리자 C");
    await changePersonRole(a, b.id, DEFAULT_ROLE_ID, deps);
    expect(await roleOf(b.id)).toBe(DEFAULT_ROLE_ID);
  });

  it("없는 사람의 계급 변경은 사람 찾을 수 없음", async () => {
    const admin = await makeAdmin("관리자");

    await refusal(changePersonRole(admin, randomUUID(), DEFAULT_ROLE_ID, deps), UserNotFoundError);
  });
});

// 06.4-03: 사람 보관 두 경로(`archivePerson` · 범용 `archive(…, "user", …)`)와 퇴직일 — 한 보관기 · 퇴직일 분기에서
// 본인 보관(D-6416) → 대상 계급 상한(D-6411) → 마지막 관리자(D-6412 · O3) 순으로 막는다.

async function archivedAtOf(userId: string): Promise<Date | null> {
  return (await findUserById(SYSTEM_VIEWER, userId))?.archivedAt ?? null;
}

async function resignationOf(userId: string): Promise<string | null> {
  return (await findUserById(SYSTEM_VIEWER, userId))?.resignationDate ?? null;
}

function sessionSpy() {
  return vi.fn(() => Promise.resolve());
}

describe("사람 보관 두 경로 마지막 관리자(06.4 D-6403 · D-6412)", () => {
  it("마지막 재직 관리자는 archivePerson · 직접 archive 모두 거부 · 보관 · 세션 만료 없음", async () => {
    const { x, y } = await oneAdminWorld();
    const revokeAllSessions = sessionSpy();

    const viaPerson = await refusal(archivePerson(x, y.id, { revokeAllSessions }), LastAdminError);
    expect(viaPerson.message).toBe(LAST_ADMIN);
    expect(revokeAllSessions).not.toHaveBeenCalled();

    const direct = await refusal(archive(x, "user", y.id, deps), LastAdminError);
    expect(direct.message).toBe(LAST_ADMIN);
    expect(await archivedAtOf(y.id)).toBeNull();
  });

  it("퇴직일 없는 재직 관리자가 더 있으면 두 경로 모두 통과", async () => {
    const { x, y } = await oneAdminWorld();
    const y2 = await makeAdmin("관리자 Y2");
    await makeAdmin("관리자 Y3");
    const revokeAllSessions = sessionSpy();

    await archive(x, "user", y.id, deps);
    await archivePerson(x, y2.id, { revokeAllSessions });

    expect(await archivedAtOf(y.id)).not.toBeNull();
    expect(await archivedAtOf(y2.id)).not.toBeNull();
    expect(revokeAllSessions).toHaveBeenCalledTimes(1);
  });

  it("SYSTEM_VIEWER는 마지막 관리자도 보관한다(O4)", async () => {
    const { y } = await oneAdminWorld();

    await archive(SYSTEM_VIEWER, "user", y.id, deps);

    expect(await archivedAtOf(y.id)).not.toBeNull();
  });

  it("남은 관리자가 퇴직 예정(12-31)뿐이면 보관 거부 · 로그 그대로(D-6412)", async () => {
    const y = await makeAdmin("관리자 Y");
    const y2 = await makeAdmin("관리자 Y2");
    await updateUserResignationDate(SYSTEM_VIEWER, y2.id, "2026-12-31");
    const logsBefore = await countLogs("archive", "user", y.id);

    await refusal(archive(y2, "user", y.id, deps), LastAdminError);

    expect(await archivedAtOf(y.id)).toBeNull();
    expect(await countLogs("archive", "user", y.id)).toBe(logsBefore);
  });

  it("본인 보관은 두 경로 모두 거부 · 다른 관리자는 보관한다(D-6416 · R1)", async () => {
    const a = await makeAdmin("관리자 A");
    const b = await makeAdmin("관리자 B");
    const logsBefore = await countLogs("archive", "user", a.id);
    const revokeAllSessions = sessionSpy();

    const direct = await refusal(archive(a, "user", a.id, deps), SelfArchiveError);
    expect(direct.message).toBe("본인 보관 불가 · 다른 관리자에게 요청");
    const viaPerson = await refusal(archivePerson(a, a.id, { revokeAllSessions }), SelfArchiveError);
    expect(viaPerson.message).toBe("본인 보관 불가 · 다른 관리자에게 요청");
    expect(revokeAllSessions).not.toHaveBeenCalled();
    expect(await archivedAtOf(a.id)).toBeNull();
    expect(await countLogs("archive", "user", a.id)).toBe(logsBefore);

    await archive(b, "user", a.id, deps);
    expect(await archivedAtOf(a.id)).not.toBeNull();
  });

  it("이미 보관된 사람 다시 보관은 오류 · 로그 없이 끝나고, 없는 사람은 대상 찾을 수 없음", async () => {
    const { x, y } = await oneAdminWorld();
    await archive(SYSTEM_VIEWER, "user", y.id, deps);
    const logsBefore = await countLogs("archive", "user", y.id);

    await archive(x, "user", y.id, deps);

    expect(await countLogs("archive", "user", y.id)).toBe(logsBefore);
    await refusal(archive(x, "user", randomUUID(), deps), ArchivableRowNotFoundError);
  });
});

describe("퇴직일 마지막 관리자(06.4 O3 · D-6412)", () => {
  it("마지막 재직 관리자에게는 미래 · 과거 어떤 날짜의 퇴직일도 거부 · 지우기는 통과", async () => {
    const { x, y } = await oneAdminWorld();

    const future = await refusal(setResignationDate(x, y.id, "2026-12-31", deps), LastAdminError);
    expect(future.message).toBe(LAST_ADMIN);
    await refusal(setResignationDate(x, y.id, "2026-09-01", deps), LastAdminError);
    expect(await resignationOf(y.id)).toBeNull();

    await setResignationDate(x, y.id, null, deps);
    expect(await resignationOf(y.id)).toBeNull();
  });

  it("관리자가 아닌 사람 · 다른 퇴직일 없는 관리자가 있을 때 · 입사일은 통과", async () => {
    const { x, y } = await oneAdminWorld();
    const p = await makeSeated(uniqueName("PM P"), DEFAULT_ROLE_ID, null);

    await setResignationDate(x, p.id, "2026-12-31", deps);
    expect(await resignationOf(p.id)).toBe("2026-12-31");

    await setHireDate(x, y.id, "2020-01-01", deps);

    await makeAdmin("관리자 Y2");
    await setResignationDate(x, y.id, "2026-12-31", deps);
    expect(await resignationOf(y.id)).toBe("2026-12-31");
  });

  it("두 번 저장으로 관리자 0명이 되지 않는다 — A가 B에 미래 퇴직일 뒤 B가 A에 넣으면 거부(K-B3 · Codex B3)", async () => {
    const a = await makeAdmin("관리자 A");
    const b = await makeAdmin("관리자 B");

    await setResignationDate(a, b.id, "2026-12-31", deps);
    expect(await resignationOf(b.id)).toBe("2026-12-31");

    const error = await refusal(setResignationDate(b, a.id, "2026-12-31", deps), LastAdminError);
    expect(error.message).toBe(LAST_ADMIN);
    expect(await resignationOf(a.id)).toBeNull();
  });
});

// D-6411(K-R1) 사용자 확정(2026-10-11 카드 「막기」) — 이 describe 하나가 C 상한 사례 전부다.
describe("사람 보관 · 퇴직일 대상 계급 상한(06.4 D-6411 · K-R1)", () => {
  const GRANT_FORBIDDEN = "계급 지정 권한 없음 · 시스템 관리자";

  async function delegatedWorld() {
    const x = await makeAdmin("관리자 X");
    const y = await makeAdmin("관리자 Y");
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
    const d = await makePerson(uniqueName("위임 D"), roleM, null);
    const p = await makeSeated(uniqueName("PM P"), DEFAULT_ROLE_ID, null);
    return { x, y, d, p };
  }

  it("위임받은 사람은 관리자를 두 경로 모두 보관하지 못하고(남은 관리자가 있어도), PM은 보관한다", async () => {
    const { x, y, d, p } = await delegatedWorld();
    const logsBefore = await countLogs("archive", "user", x.id);
    const revokeAllSessions = sessionSpy();

    const direct = await refusal(archive(d, "user", x.id, deps), RoleGrantForbiddenError);
    expect(direct.message).toBe(GRANT_FORBIDDEN);
    const viaPerson = await refusal(archivePerson(d, x.id, { revokeAllSessions }), RoleGrantForbiddenError);
    expect(viaPerson.message).toBe(GRANT_FORBIDDEN);
    expect(revokeAllSessions).not.toHaveBeenCalled();
    expect(await archivedAtOf(x.id)).toBeNull();
    expect(await countLogs("archive", "user", x.id)).toBe(logsBefore);

    await archive(d, "user", p.id, deps);
    expect(await archivedAtOf(p.id)).not.toBeNull();

    await archive(y, "user", x.id, deps);
    expect(await archivedAtOf(x.id)).not.toBeNull();

    const y2 = await makeAdmin("관리자 Y2");
    await archive(SYSTEM_VIEWER, "user", y2.id, deps);
    expect(await archivedAtOf(y2.id)).not.toBeNull();
  });

  it("위임받은 사람은 관리자의 퇴직일을 넣지도 지우지도 못하고, PM의 퇴직일은 넣는다", async () => {
    const { x, d, p } = await delegatedWorld();
    const logsBefore = await countLogs("document_update", "user", x.id);

    const put = await refusal(setResignationDate(d, x.id, "2026-12-31", deps), RoleGrantForbiddenError);
    expect(put.message).toBe(GRANT_FORBIDDEN);
    await refusal(setResignationDate(d, x.id, null, deps), RoleGrantForbiddenError);
    expect(await resignationOf(x.id)).toBeNull();
    expect(await countLogs("document_update", "user", x.id)).toBe(logsBefore);

    await setResignationDate(d, p.id, "2026-12-31", deps);
    expect(await resignationOf(p.id)).toBe("2026-12-31");
  });
});
