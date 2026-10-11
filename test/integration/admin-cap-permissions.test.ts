import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell, SelfLockoutError } from "@/domain/permissions/matrix";
import { assertNotLastAdmin, LastAdminError } from "@/domain/permissions/last-admin";
import { findPermission } from "@/repositories/permissions";
import { updateUserResignationDate } from "@/repositories/users";
import { withTransaction } from "@/lib/db-transaction";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { makeAdmin, makeAdminRole } from "./admin-cap-fixtures";

// 06.4-01: 관리자 상한 판정 — 서비스 직접 호출. 행위자는 실제 users 행(SYSTEM_VIEWER 사례만 예외).

const deps = { now: () => NOW_2026 };
const ADMIN_WRITE_OFF = (roleId: string) => ({ roleId, menu: "admin.permissions", action: "write" as const, allowed: false });

async function permissionLogCount(roleId: string): Promise<number> {
  const rows = await db
    .select()
    .from(actionLog)
    .where(
      and(
        eq(actionLog.actionType, "permission_change"),
        eq(actionLog.entity, "permission_matrix"),
        eq(actionLog.entityId, roleId),
      ),
    );
  return rows.length;
}

async function adminCellAllowed(roleId: string): Promise<boolean | undefined> {
  return (await findPermission(SYSTEM_VIEWER, roleId, "admin.permissions", "write"))?.allowed;
}

async function refusal<E extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(type);
  return error as E;
}

// 시스템 관리자 X(퇴직일 resignation) · 커스텀 관리자 계급 B의 P.
async function adminWorld(resignation: string | null): Promise<{ x: Viewer; p: Viewer; roleB: string }> {
  const x = await makeAdmin("관리자 X");
  if (resignation) await updateUserResignationDate(SYSTEM_VIEWER, x.id, resignation);
  const roleB = await makeAdminRole("관리자급 B");
  const p = await makePerson("관리자 P", roleB, null);
  return { x, p, roleB };
}

describe("권한표 칸 끄기 마지막 관리자(06.4 D-6403 · D-6412)", () => {
  it("퇴직일이 지난 관리자가 남은 관리자 계급의 관리자 칸을 끄면 마지막 관리자로 거부 · 칸 · 로그 그대로", async () => {
    const { x, roleB } = await adminWorld("2026-09-01");
    const logsBefore = await permissionLogCount(roleB);

    const error = await refusal(setPermissionCell(x, ADMIN_WRITE_OFF(roleB), deps), LastAdminError);

    expect(error.message).toBe("마지막 관리자 · 관리자 먼저 지정");
    expect(await adminCellAllowed(roleB)).toBe(true);
    expect(await permissionLogCount(roleB)).toBe(logsBefore);
  });

  it("행위자가 재직 관리자(퇴직일 없음)면 같은 저장이 성공하고 로그 한 줄", async () => {
    const { x, roleB } = await adminWorld(null);
    const logsBefore = await permissionLogCount(roleB);

    await setPermissionCell(x, ADMIN_WRITE_OFF(roleB), deps);

    expect(await adminCellAllowed(roleB)).toBe(false);
    const logs = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entity, "permission_matrix"), eq(actionLog.entityId, roleB)));
    expect(logs).toHaveLength(logsBefore + 1);
    expect(logs.at(-1)?.detail).toEqual({ roleId: roleB, menu: "admin.permissions", action: "write", allowed: false });
  });

  it("행위자의 퇴직일이 미래(퇴직 예정)면 남은 관리자로 세지 않아 거부 · 칸 · 로그 그대로(D-6412)", async () => {
    const { x, roleB } = await adminWorld("2026-12-31");
    const logsBefore = await permissionLogCount(roleB);

    const error = await refusal(setPermissionCell(x, ADMIN_WRITE_OFF(roleB), deps), LastAdminError);

    expect(error.message).toBe("마지막 관리자 · 관리자 먼저 지정");
    expect(await adminCellAllowed(roleB)).toBe(true);
    expect(await permissionLogCount(roleB)).toBe(logsBefore);
  });

  it("assertNotLastAdmin — 지킬 대상이 재직 관리자이고 남은 쪽이 퇴직 예정뿐이면 거부, 퇴직일을 지우면 통과(D-6412)", async () => {
    const x = await makeAdmin("관리자 X");
    const y = await makeAdmin("관리자 Y");
    await updateUserResignationDate(SYSTEM_VIEWER, y.id, "2026-12-31");

    const error = await refusal(
      withTransaction((tx) => assertNotLastAdmin(x, { userId: x.id, asOf: "2026-09-18" }, tx)),
      LastAdminError,
    );
    expect(error.message).toBe("마지막 관리자 · 관리자 먼저 지정");

    await updateUserResignationDate(SYSTEM_VIEWER, y.id, null);
    await expect(withTransaction((tx) => assertNotLastAdmin(x, { userId: x.id, asOf: "2026-09-18" }, tx))).resolves.toBeUndefined();
  });

  it("SYSTEM_VIEWER는 마지막 관리자 판정에서 면제 — 사람이 P(계급 B)뿐이어도 B 관리자 칸 끄기 성공(O4)", async () => {
    const roleB = await makeAdminRole("관리자급 B");
    await makePerson("관리자 P", roleB, null);

    await setPermissionCell(SYSTEM_VIEWER, ADMIN_WRITE_OFF(roleB), deps);

    expect(await adminCellAllowed(roleB)).toBe(false);
  });

  it("자기 계급 관리자 칸 끄기는 기존 자기 잠금이 먼저", async () => {
    const { x } = await adminWorld("2026-09-01");

    const error = await refusal(setPermissionCell(x, ADMIN_WRITE_OFF(SYSADMIN_ROLE_ID), deps), SelfLockoutError);

    expect(error.message).toBe("자기 계급 권한표 쓰기는 끌 수 없음");
    expect(await adminCellAllowed(SYSADMIN_ROLE_ID)).toBe(true);
  });

  it("관리자 칸이 아닌 칸 끄기는 잠금 · 판정 없이 성공(퇴직한 행위자라도)", async () => {
    const { x, roleB } = await adminWorld("2026-09-01");

    await setPermissionCell(x, { roleId: roleB, menu: "admin.people", action: "write", allowed: false }, deps);

    expect((await findPermission(SYSTEM_VIEWER, roleB, "admin.people", "write"))?.allowed).toBe(false);
  });
});
