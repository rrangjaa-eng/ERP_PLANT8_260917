import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, roles } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import {
  assignableRoleIds,
  createRole,
  DEFAULT_ROLE_ID,
  listAssignableRoles,
  listRoles,
  setRoleViewScope,
  setRoleWorkScope,
  SYSADMIN_ROLE_ID,
} from "@/domain/permissions/roles";
import { can } from "@/domain/permissions/can";
import { archive } from "@/domain/archive";
import { assertCanGrantRoles, RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { ForbiddenError, setPermissionCell, setVisibilityCell, SelfLockoutError } from "@/domain/permissions/matrix";
import { assertNotLastAdmin, LastAdminError } from "@/domain/permissions/last-admin";
import { findPermission, findVisibility, listRoleGrantRows, upsertVisibility } from "@/repositories/permissions";
import { setRoleViewScope as repoSetRoleViewScope } from "@/repositories/roles";
import { countActiveAdmins, updateUserResignationDate } from "@/repositories/users";
import { withTransaction } from "@/lib/db-transaction";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { makeAdmin, makeAdminRole, makeDelegatedRole } from "./admin-cap-fixtures";

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
    expect(logs.at(-1)?.detail).toEqual({
      roleId: roleB,
      menu: "admin.permissions",
      action: "write",
      allowed: false,
      changes: { allowed: [true, false] },
    });
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

describe("권한 상한 판정(06.4 D-6401 · D-6402)", () => {
  it("위임 계급 M(PM 복사 + 사람 관리)의 D는 PM · M을 지정할 수 있고 시스템 관리자는 못 한다 — 목록도 같은 집합", async () => {
    const roleM = await makeDelegatedRole({ name: "인사 위임" });
    const d = await makePerson("위임자 D", roleM, null);

    const ids = await assignableRoleIds(d);
    expect(ids.has(DEFAULT_ROLE_ID)).toBe(true);
    expect(ids.has(roleM)).toBe(true);
    expect(ids.has(SYSADMIN_ROLE_ID)).toBe(false);

    const listed = await listAssignableRoles(d);
    expect(new Set(listed.map((role) => role.id))).toEqual(new Set(ids));
    expect(listed.every((role) => role.archivedAt === null)).toBe(true);
  });

  it("assertCanGrantRoles — 상한 밖 계급은 거부, null · 상한 안 계급 · 시스템 관리자 사람 · SYSTEM_VIEWER는 통과(O4)", async () => {
    const roleM = await makeDelegatedRole({ name: "인사 위임" });
    const d = await makePerson("위임자 D", roleM, null);
    const x = await makeAdmin("관리자 X");

    const error = await refusal(assertCanGrantRoles(d, [SYSADMIN_ROLE_ID]), RoleGrantForbiddenError);
    expect(error.message).toBe("계급 지정 권한 없음 · 시스템 관리자");

    await expect(assertCanGrantRoles(d, [DEFAULT_ROLE_ID, null])).resolves.toBeUndefined();
    await expect(assertCanGrantRoles(x, [SYSADMIN_ROLE_ID])).resolves.toBeUndefined();
    await expect(assertCanGrantRoles(SYSTEM_VIEWER, [SYSADMIN_ROLE_ID])).resolves.toBeUndefined();
  });

  it("listRoleGrantRows — 없는 계급은 행 없음, 빈 입력은 빈 배열", async () => {
    const rows = await listRoleGrantRows(SYSTEM_VIEWER, [DEFAULT_ROLE_ID, "role-missing"]);
    expect(rows.map((row) => row.roleId)).toEqual([DEFAULT_ROLE_ID]);
    expect(await listRoleGrantRows(SYSTEM_VIEWER, [])).toEqual([]);
  });
});

async function roleScopes(roleId: string): Promise<{ viewScope: string; workScope: string } | undefined> {
  const [row] = await db.select({ viewScope: roles.viewScope, workScope: roles.workScope }).from(roles).where(eq(roles.id, roleId));
  return row;
}

async function roleLogCount(roleId: string): Promise<number> {
  const rows = await db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.entity, "roles"), eq(actionLog.entityId, roleId), eq(actionLog.actionType, "permission_change")));
  return rows.length;
}

async function visibleOf(roleId: string, infoItem: string): Promise<boolean | undefined> {
  return (await findVisibility(SYSTEM_VIEWER, roleId, infoItem))?.visible;
}

// 위임 계급 M(PM 복사 + 사람 관리 + 노출표 쓰기, 범위 team/team)의 D.
async function delegatedWorld(): Promise<{ d: Viewer; roleM: string }> {
  const roleM = await makeDelegatedRole({
    name: "인사 · 노출 위임",
    menus: [
      { menu: "admin.people", action: "view" },
      { menu: "admin.people", action: "write" },
      { menu: "admin.visibility", action: "view" },
      { menu: "admin.visibility", action: "write" },
    ],
    viewScope: "team",
    workScope: "team",
  });
  const d = await makePerson("위임자 D", roleM, null);
  return { d, roleM };
}

describe("범위 넓히기 우회 막기(06.4 O7 · T-6409 · E3)", () => {
  it("위임자는 남의 계급 범위를 자기 범위 위로 넓히지 못하고(값 · 로그 그대로), 자기 범위가 넓으면 넓힐 수 있다", async () => {
    const { d, roleM } = await delegatedWorld();
    const logsBefore = await roleLogCount(DEFAULT_ROLE_ID);

    const viewError = await refusal(setRoleViewScope(d, DEFAULT_ROLE_ID, "company"), RoleGrantForbiddenError);
    expect(viewError.message).toBe("계급 지정 권한 없음 · 시스템 관리자");
    await refusal(setRoleWorkScope(d, DEFAULT_ROLE_ID, "company"), RoleGrantForbiddenError);
    expect(await roleScopes(DEFAULT_ROLE_ID)).toEqual({ viewScope: "team", workScope: "team" });
    expect(await roleLogCount(DEFAULT_ROLE_ID)).toBe(logsBefore);

    await repoSetRoleViewScope(SYSTEM_VIEWER, roleM, "company");
    await setRoleViewScope(d, DEFAULT_ROLE_ID, "company");
    expect((await roleScopes(DEFAULT_ROLE_ID))?.viewScope).toBe("company");
  });

  it("노출표 칸 — 자기에게 없는 칸 켜기 · 자기 계급 상향 · 상한 밖 계급 건드리기는 거부, 자기에게 있는 칸은 켤 수 있다", async () => {
    const { d, roleM } = await delegatedWorld();

    await refusal(setVisibilityCell(d, { roleId: DEFAULT_ROLE_ID, infoItem: "pnl.amount", visible: true }), RoleGrantForbiddenError);
    await refusal(setVisibilityCell(d, { roleId: roleM, infoItem: "pnl.amount", visible: true }), RoleGrantForbiddenError);
    await refusal(
      setVisibilityCell(d, { roleId: SYSADMIN_ROLE_ID, infoItem: "person.value", visible: false }),
      RoleGrantForbiddenError,
    );
    expect(await visibleOf(DEFAULT_ROLE_ID, "pnl.amount")).not.toBe(true);
    expect(await visibleOf(roleM, "pnl.amount")).not.toBe(true);
    expect(await visibleOf(SYSADMIN_ROLE_ID, "person.value")).toBe(true);

    await upsertVisibility(SYSTEM_VIEWER, { roleId: roleM, infoItem: "team.cost", visible: true });
    await setVisibilityCell(d, { roleId: DEFAULT_ROLE_ID, infoItem: "team.cost", visible: true });
    expect(await visibleOf(DEFAULT_ROLE_ID, "team.cost")).toBe(true);
  });

  it("위임자는 자기보다 넓은 범위의 새 계급을 만들지 못하고(계급 수 그대로), 상한 안 범위로는 만든다(E3)", async () => {
    const roleM = await makeDelegatedRole({ name: "인사 위임", viewScope: "team", workScope: "team" });
    const d = await makePerson("위임자 D", roleM, null);
    const before = (await listRoles(SYSTEM_VIEWER, { includeArchived: true })).length;

    const error = await refusal(createRole(d, { name: `전사-${randomUUID()}`, workScope: "company" }), RoleGrantForbiddenError);
    expect(error.message).toBe("계급 지정 권한 없음 · 시스템 관리자");
    expect((await listRoles(SYSTEM_VIEWER, { includeArchived: true })).length).toBe(before);

    await createRole(d, { name: `팀-${randomUUID()}` });
    expect((await listRoles(SYSTEM_VIEWER, { includeArchived: true })).length).toBe(before + 1);
  });

  it("시스템 관리자 사람은 위 거부 사례가 전부 성공하고, 위임자는 권한표 칸을 아예 못 바꾼다", async () => {
    const { d, roleM } = await delegatedWorld();
    const x = await makeAdmin("관리자 X");

    await setRoleViewScope(x, DEFAULT_ROLE_ID, "company");
    await setRoleWorkScope(x, DEFAULT_ROLE_ID, "company");
    await setVisibilityCell(x, { roleId: DEFAULT_ROLE_ID, infoItem: "pnl.amount", visible: true });
    await setVisibilityCell(x, { roleId: roleM, infoItem: "pnl.amount", visible: true });
    await setVisibilityCell(x, { roleId: SYSADMIN_ROLE_ID, infoItem: "person.value", visible: false });
    await createRole(x, { name: `전사-${randomUUID()}`, workScope: "company" });
    expect(await roleScopes(DEFAULT_ROLE_ID)).toEqual({ viewScope: "company", workScope: "company" });
    expect(await visibleOf(roleM, "pnl.amount")).toBe(true);

    await refusal(
      setPermissionCell(d, { roleId: DEFAULT_ROLE_ID, menu: "projects", action: "view", allowed: true }, deps),
      ForbiddenError,
    );
  });
});

describe("계급 보관과 관리자 수(06.4 O2)", () => {
  it("커스텀 관리자 계급을 보관해도 재직 관리자 수와 그 계급 사람의 관리자 권한이 그대로다", async () => {
    const roleK = await makeAdminRole("관리자급 K");
    const q = await makePerson("관리자 Q", roleK, null);
    await makeAdmin("관리자 X");
    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-18" })).toBe(2);

    await archive(SYSTEM_VIEWER, "roles", roleK);

    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-18" })).toBe(2);
    expect(await can({ id: q.id, roleId: roleK }, "admin.permissions", "write")).toBe(true);
  });
});

// /review F4 · F5 · F7: 판정 경계 사례.
describe("관리자 판정 경계(06.4 /review)", () => {
  it("assertNotLastAdmin — 마지막 관리자 X를 다른 관리자 계급으로 바꾸면 통과, 관리자 아닌 계급으로 바꾸면 거부", async () => {
    const x = await makeAdmin("관리자 X");
    const roleB = await makeAdminRole("관리자급 B");

    await expect(
      withTransaction((tx) => assertNotLastAdmin(x, { userId: x.id, asOf: "2026-09-18", nextRoleId: roleB }, tx)),
    ).resolves.toBeUndefined();
    const error = await refusal(
      withTransaction((tx) => assertNotLastAdmin(x, { userId: x.id, asOf: "2026-09-18", nextRoleId: DEFAULT_ROLE_ID }, tx)),
      LastAdminError,
    );
    expect(error.message).toBe("마지막 관리자 · 관리자 먼저 지정");
  });

  it("assertNotLastAdmin — 관리자 아닌 대상은 관리자가 하나뿐이어도 통과", async () => {
    const x = await makeAdmin("관리자 X");
    const pm = await makePerson("PM", DEFAULT_ROLE_ID, null);

    await expect(withTransaction((tx) => assertNotLastAdmin(x, { userId: pm.id, asOf: "2026-09-18" }, tx))).resolves.toBeUndefined();
  });

  it("assertCanGrantRoles — 없는 계급은 위임자에게 거부(fail-closed)", async () => {
    const roleM = await makeDelegatedRole({ name: "인사 위임" });
    const d = await makePerson("위임자 D", roleM, null);

    const error = await refusal(assertCanGrantRoles(d, ["role-missing"]), RoleGrantForbiddenError);
    expect(error.message).toBe("계급 지정 권한 없음 · 시스템 관리자");
  });

  it("countActiveAdmins — 퇴직일 당일은 세고 다음 날은 세지 않으며, unscheduledOnly는 퇴직일이 있으면 세지 않는다", async () => {
    const x = await makeAdmin("관리자 X");
    await updateUserResignationDate(SYSTEM_VIEWER, x.id, "2026-09-18");

    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-18" })).toBe(1);
    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-19" })).toBe(0);
    expect(await countActiveAdmins(SYSTEM_VIEWER, { asOf: "2026-09-18", unscheduledOnly: true })).toBe(0);
  });

  it("로그 기록이 실패하면 칸 저장도 되돌려진다 — 호출 거부 · 칸 그대로", async () => {
    const { x, roleB } = await adminWorld(null);
    const recordAction = (): Promise<never> => Promise.reject(new Error("기록 실패"));

    await expect(setPermissionCell(x, ADMIN_WRITE_OFF(roleB), { ...deps, recordAction })).rejects.toThrow("기록 실패");

    expect(await adminCellAllowed(roleB)).toBe(true);
  });

  it("잠금 뒤 재확인 — 앞선 저장으로 행위자 계급의 관리자 칸이 꺼졌으면(사전 판정은 지났어도) 권한 없음 · 칸 그대로(F5)", async () => {
    await makeAdmin("관리자 X");
    const roleB = await makeAdminRole("관리자급 B");
    const p = await makePerson("관리자 P", roleB, null);
    const roleC = await makeAdminRole("관리자급 C");
    await makePerson("관리자 Q", roleC, null);
    await setPermissionCell(SYSTEM_VIEWER, ADMIN_WRITE_OFF(roleB), deps);
    // 사전 판정(can)이 강등 전에 지나간 경합을 재현한다.
    const staleCan = (): Promise<boolean> => Promise.resolve(true);

    const error = await refusal(setPermissionCell(p, ADMIN_WRITE_OFF(roleC), { ...deps, can: staleCan }), ForbiddenError);

    expect(error.message).toBe("권한표 변경 권한 없음");
    expect(await adminCellAllowed(roleC)).toBe(true);
  });

  it("이미 꺼진 관리자 칸을 다시 끄는 저장은 남은 관리자가 퇴직 예정뿐이어도 거부하지 않는다(F7)", async () => {
    const x = await makeAdmin("관리자 X");
    await updateUserResignationDate(SYSTEM_VIEWER, x.id, "2026-12-31");
    const roleC = await makeAdminRole("관리자급 C");
    await setPermissionCell(SYSTEM_VIEWER, ADMIN_WRITE_OFF(roleC), deps);

    await setPermissionCell(x, ADMIN_WRITE_OFF(roleC), deps);

    expect(await adminCellAllowed(roleC)).toBe(false);
  });
});
