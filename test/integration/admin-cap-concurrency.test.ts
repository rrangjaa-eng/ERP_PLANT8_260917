import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError, setPermissionCell } from "@/domain/permissions/matrix";
import { LastAdminError } from "@/domain/permissions/last-admin";
import { findPermission } from "@/repositories/permissions";
import { ADMIN_SEAT_LOCK_KEY } from "@/repositories/seats";
import { countActiveAdmins, updateUserResignationDate } from "@/repositories/users";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { holdKey, makeAdmin, makeAdminRole, waitingOnKey } from "./admin-cap-fixtures";

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
  results: PromiseSettledResult<void>[],
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
