import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { LastAdminError } from "@/domain/permissions/last-admin";
import { findPermission } from "@/repositories/permissions";
import { countActiveAdmins } from "@/repositories/users";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { holdKey, makeAdmin, makeAdminRole, waitingOnKey } from "./admin-cap-fixtures";

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
