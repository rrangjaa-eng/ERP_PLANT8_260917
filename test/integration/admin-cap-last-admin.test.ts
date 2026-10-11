import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { LastAdminError } from "@/domain/permissions/last-admin";
import { changePersonRole, UserNotFoundError } from "@/domain/people";
import { updateUserResignationDate } from "@/repositories/users";
import { NOW_2026 } from "./approvals-fixtures";
import { countLogs, makeAdmin, makeAdminRole, roleOf } from "./admin-cap-fixtures";

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
