import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createRole, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import type { PermissionAction } from "@/domain/permissions/menus";
import {
  dependentCells,
  ForbiddenError,
  permissionRequiresMap,
  readPermissionGrid,
  SelfLockoutError,
  setPermissionCell,
} from "@/domain/permissions/matrix";
import { LastAdminError } from "@/domain/permissions/last-admin";
import { findPermission, upsertPermission } from "@/repositories/permissions";
import { updateUserResignationDate } from "@/repositories/users";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { makeAdmin, makeAdminRole } from "./admin-cap-fixtures";

// 07-15(R7 · A-P1-3 · K24 · D-739 · U5): 딸린 권한 서버 규칙 — 켬은 필요 칸을 위로, 끔은 기대는 칸을 아래로 끝까지 한 트랜잭션에서.

const deps = { now: () => NOW_2026 };
type Cell = { menu: string; action: PermissionAction };

async function freshRole(): Promise<string> {
  return (await createRole(SYSTEM_VIEWER, { name: `딸림-${randomUUID()}` })).id;
}

async function cell(roleId: string, menu: string, action: PermissionAction): Promise<boolean | null> {
  return (await findPermission(SYSTEM_VIEWER, roleId, menu, action))?.allowed ?? null;
}

async function logsFor(roleId: string): Promise<{ menu: unknown; action: unknown; allowed: unknown; changes: unknown }[]> {
  const rows = await db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.actionType, "permission_change"), eq(actionLog.entity, "permission_matrix"), eq(actionLog.entityId, roleId)))
    .orderBy(actionLog.seq);
  return rows.map((row) => {
    const detail = row.detail as Record<string, unknown>;
    return { menu: detail.menu, action: detail.action, allowed: detail.allowed, changes: detail.changes };
  });
}

async function setOn(roleId: string, cells: readonly Cell[]): Promise<void> {
  for (const { menu, action } of cells) await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action, allowed: true });
}

async function refusal<E extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(type);
  return error as E;
}

describe("딸린 칸 계산(순수 — dependentCells · permissionRequiresMap)", () => {
  it("쓰기 · 승인 켬은 같은 메뉴 보기를, 보기 끔은 같은 메뉴 쓰기 · 승인을 같이 바꾼다", () => {
    expect(dependentCells("admin.people", "write", true)).toEqual([{ menu: "admin.people", action: "view" }]);
    expect(dependentCells("admin.people", "approve", true)).toEqual([{ menu: "admin.people", action: "view" }]);
    expect(dependentCells("admin.people", "view", false)).toEqual([
      { menu: "admin.people", action: "write" },
      { menu: "admin.people", action: "approve" },
    ]);
    expect(dependentCells("admin.people", "view", true)).toEqual([]);
    expect(dependentCells("admin.people", "write", false)).toEqual([]);
  });

  it("메뉴를 건너는 두 쌍은 켬은 위로 · 끔은 아래로 끝까지", () => {
    expect(dependentCells("vendors.account", "write", true)).toEqual([{ menu: "admin.vendors", action: "view" }]);
    expect(dependentCells("admin.vendors", "view", false)).toEqual([
      { menu: "admin.vendors", action: "write" },
      { menu: "vendors.account", action: "write" },
    ]);
    expect(dependentCells("evidence.intake", "write", true)).toEqual([
      { menu: "evidence.intake", action: "view" },
      { menu: "evidence", action: "view" },
    ]);
    expect(dependentCells("evidence", "view", false)).toEqual([
      { menu: "evidence", action: "write" },
      { menu: "evidence", action: "approve" },
      { menu: "evidence.intake", action: "write" },
    ]);
  });

  it("requires 지도는 열 id → 켤 때 같이 켜질 열 id(정의 밖 칸 없음)", () => {
    const map = permissionRequiresMap();
    expect(map["vendors.account::write"]).toEqual(["admin.vendors::view"]);
    expect(map["evidence.intake::write"]).toEqual(["evidence.intake::view", "evidence::view"]);
    expect(map["projects::write"]).toEqual(["projects::view"]);
    expect(map["projects::approve"]).toEqual(["projects::view"]);
    expect(map["admin.vendors::write"]).toEqual(["admin.vendors::view"]);
    expect(map["admin.vendors::approve"]).toBeUndefined();
    expect(map["projects::view"]).toBeUndefined();
  });
});

describe("권한표 열 · requires(K24 · D-739)", () => {
  it("readPermissionGrid 열에 정의 밖 칸이 없고 requires가 실린다", async () => {
    const grid = await readPermissionGrid(SYSTEM_VIEWER);
    const ids = grid.columns.map((column) => column.id);
    expect(ids).not.toContain("vendors.account::view");
    expect(ids).not.toContain("vendors.account::approve");
    expect(ids).not.toContain("admin.vendors::approve");
    expect(ids).toContain("vendors.account::write");
    expect(grid.requires?.["vendors.account::write"]).toEqual(["admin.vendors::view"]);
    expect(grid.requires?.["evidence.intake::write"]).toEqual(["evidence.intake::view", "evidence::view"]);
    expect(grid.requires?.["projects::write"]).toEqual(["projects::view"]);
  });
});

describe("딸린 칸 저장(R7)", () => {
  it("보기 꺼진 줄에서 쓰기 켬 → 쓰기 · 보기 둘 다 켬 · 로그 두 줄 · changed 두 칸", async () => {
    const roleId = await freshRole();

    const result = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "write", allowed: true }, deps);

    expect(result.changed).toEqual([
      { menu: "admin.people", action: "write", allowed: true },
      { menu: "admin.people", action: "view", allowed: true },
    ]);
    expect(await cell(roleId, "admin.people", "write")).toBe(true);
    expect(await cell(roleId, "admin.people", "view")).toBe(true);
    expect(await logsFor(roleId)).toEqual([
      { menu: "admin.people", action: "write", allowed: true, changes: { allowed: [null, true] } },
      { menu: "admin.people", action: "view", allowed: true, changes: { allowed: [null, true] } },
    ]);
  });

  it("쓰기 · 승인 켜진 줄에서 보기 끔 → 셋 다 끔 · 세 줄 · changed 세 칸", async () => {
    const roleId = await freshRole();
    await setOn(roleId, [
      { menu: "admin.people", action: "view" },
      { menu: "admin.people", action: "write" },
      { menu: "admin.people", action: "approve" },
    ]);

    const result = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "view", allowed: false }, deps);

    expect(result.changed).toEqual([
      { menu: "admin.people", action: "view", allowed: false },
      { menu: "admin.people", action: "write", allowed: false },
      { menu: "admin.people", action: "approve", allowed: false },
    ]);
    for (const action of ["view", "write", "approve"] as const) expect(await cell(roleId, "admin.people", action)).toBe(false);
    expect((await logsFor(roleId)).map((log) => [log.action, log.changes])).toEqual([
      ["view", { allowed: [true, false] }],
      ["write", { allowed: [true, false] }],
      ["approve", { allowed: [true, false] }],
    ]);
  });

  it("이미 같은 값인 딸린 칸은 changed · 로그에 없다(보기 켜진 줄에서 쓰기 켬 → 한 칸 · 한 줄)", async () => {
    const roleId = await freshRole();
    await setOn(roleId, [{ menu: "admin.people", action: "view" }]);

    const result = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "write", allowed: true }, deps);

    expect(result.changed).toEqual([{ menu: "admin.people", action: "write", allowed: true }]);
    expect(await logsFor(roleId)).toHaveLength(1);
  });

  it("다른 관리자가 이미 켠 딸린 칸은 changed에 없어도 resulting에 결과 값으로 실린다(07-21 Codex P2)", async () => {
    const roleId = await freshRole();
    // 화면은 보기가 꺼진 줄로 알고 있다 — 그사이 다른 관리자가 보기를 켰다.
    await setOn(roleId, [{ menu: "admin.people", action: "view" }]);

    const result = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "write", allowed: true }, deps);

    expect(result.changed).toEqual([{ menu: "admin.people", action: "write", allowed: true }]);
    expect(result.resulting).toEqual([
      { menu: "admin.people", action: "write", allowed: true },
      { menu: "admin.people", action: "view", allowed: true },
    ]);
  });

  it("보기만 있는 메뉴(정의상 쓰기 · 승인 행 없음)의 보기 끔 → 그 칸 하나만", async () => {
    const roleId = await freshRole();
    await setOn(roleId, [{ menu: "admin.system-status", action: "view" }]);

    const result = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.system-status", action: "view", allowed: false }, deps);

    expect(result.changed).toEqual([{ menu: "admin.system-status", action: "view", allowed: false }]);
    expect(await logsFor(roleId)).toHaveLength(1);
  });
});

describe("되돌리기 재료(U5) — 보통 저장 호출의 순서로 처음 상태", () => {
  it("모두 끔에서 쓰기 켬 뒤 [쓰기 끔, 보기 끔] → 처음 상태 · 각 호출 changed 한 칸", async () => {
    const roleId = await freshRole();
    await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "write", allowed: true }, deps);

    const first = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "write", allowed: false }, deps);
    const second = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "view", allowed: false }, deps);

    expect(first.changed).toEqual([{ menu: "admin.people", action: "write", allowed: false }]);
    expect(second.changed).toEqual([{ menu: "admin.people", action: "view", allowed: false }]);
    for (const action of ["view", "write", "approve"] as const) expect(await cell(roleId, "admin.people", action) ?? false).toBe(false);
  });

  it("보기 끔(쓰기만 켜져 있던 줄) 뒤 [보기 켬, 쓰기 켬] → 처음 상태(원래 켜져 있던 칸만)", async () => {
    const roleId = await freshRole();
    await setOn(roleId, [
      { menu: "admin.people", action: "view" },
      { menu: "admin.people", action: "write" },
    ]);
    const off = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "view", allowed: false }, deps);
    expect(off.changed.map((c) => c.action)).toEqual(["view", "write"]);

    for (const { action } of off.changed) {
      await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action, allowed: true }, deps);
    }

    expect(await cell(roleId, "admin.people", "view")).toBe(true);
    expect(await cell(roleId, "admin.people", "write")).toBe(true);
    expect(await cell(roleId, "admin.people", "approve")).toBeNull();
  });

  it("같은 칸을 바로 다시 저장하면 그 칸의 보통 켬/끔이다(숨은 되돌림 없음)", async () => {
    const roleId = await freshRole();
    await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "write", allowed: true }, deps);

    const again = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "write", allowed: true }, deps);

    expect(again.changed).toEqual([]);
    expect(await cell(roleId, "admin.people", "write")).toBe(true);
    expect(await cell(roleId, "admin.people", "view")).toBe(true);
  });
});

describe("메뉴를 건너는 딸림 · 정의 밖 칸(K24 · D-739 · R18)", () => {
  it("vendors.account 쓰기 켬(거래처 보기 꺼짐) → admin.vendors 보기도 켬 · 두 줄", async () => {
    const roleId = await freshRole();

    const result = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "vendors.account", action: "write", allowed: true }, deps);

    expect(result.changed).toEqual([
      { menu: "vendors.account", action: "write", allowed: true },
      { menu: "admin.vendors", action: "view", allowed: true },
    ]);
    expect(await logsFor(roleId)).toHaveLength(2);
  });

  it("admin.vendors 보기 끔(쓰기 · 계좌 쓰기 켜짐) → admin.vendors 쓰기 · vendors.account 쓰기까지 끔 · 세 줄", async () => {
    const roleId = await freshRole();
    await setOn(roleId, [
      { menu: "admin.vendors", action: "view" },
      { menu: "admin.vendors", action: "write" },
      { menu: "vendors.account", action: "write" },
    ]);

    const result = await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.vendors", action: "view", allowed: false }, deps);

    expect(result.changed).toEqual([
      { menu: "admin.vendors", action: "view", allowed: false },
      { menu: "admin.vendors", action: "write", allowed: false },
      { menu: "vendors.account", action: "write", allowed: false },
    ]);
    expect(await cell(roleId, "vendors.account", "write")).toBe(false);
    expect(await logsFor(roleId)).toHaveLength(3);
  });

  it("evidence.intake 쓰기 켬 → evidence.intake 보기 · evidence 보기도 켬", async () => {
    const roleId = await freshRole();

    await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true }, deps);

    expect(await cell(roleId, "evidence.intake", "view")).toBe(true);
    expect(await cell(roleId, "evidence", "view")).toBe(true);
  });

  it("vendors.account 보기 · admin.vendors 승인 · 없는 메뉴 저장 → 「알 수 없는 칸」 거부 · 행 · 로그 없음", async () => {
    const roleId = await freshRole();
    for (const input of [
      { menu: "vendors.account", action: "view" as const },
      { menu: "admin.vendors", action: "approve" as const },
      { menu: "no.such-menu", action: "view" as const },
    ]) {
      const error = await refusal(setPermissionCell(SYSTEM_VIEWER, { roleId, ...input, allowed: true }, deps), ForbiddenError);
      expect(error.message).toBe("알 수 없는 칸");
      expect(await cell(roleId, input.menu, input.action)).toBeNull();
    }
    expect(await logsFor(roleId)).toEqual([]);
  });
});

describe("바뀌는 칸 전체 가드(A-P1-3)", () => {
  it("다른 계급 B가 마지막 관리자 계급일 때 B의 admin.permissions 보기 끔 → LastAdminError · 보기 · 쓰기 그대로 · 0줄", async () => {
    // 행위자 X(시스템 관리자)는 퇴직일이 지나 남은 관리자로 세지 않는다 — B의 P가 마지막 재직 관리자.
    const x = await makeAdmin("관리자 X");
    await updateUserResignationDate(SYSTEM_VIEWER, x.id, "2026-09-01");
    const roleB = await makeAdminRole("관리자급 B");
    await makePerson("관리자 P", roleB, null);

    await refusal(setPermissionCell(x, { roleId: roleB, menu: "admin.permissions", action: "view", allowed: false }, deps), LastAdminError);

    expect(await cell(roleB, "admin.permissions", "view")).toBe(true);
    expect(await cell(roleB, "admin.permissions", "write")).toBe(true);
    expect(await logsFor(roleB)).toEqual([]);
  });

  it("행위자 자기 계급의 admin.permissions 보기 끔 → SelfLockoutError · 아무 칸도 안 바뀜 · 0줄", async () => {
    const x = await makeAdmin("관리자 X");
    const before = await logsFor(SYSADMIN_ROLE_ID);

    const error = await refusal(
      setPermissionCell(x, { roleId: SYSADMIN_ROLE_ID, menu: "admin.permissions", action: "view", allowed: false }, deps),
      SelfLockoutError,
    );

    expect(error.message).toBe("자기 계급 권한표 쓰기는 끌 수 없음");
    expect(await cell(SYSADMIN_ROLE_ID, "admin.permissions", "view")).toBe(true);
    expect(await cell(SYSADMIN_ROLE_ID, "admin.permissions", "write")).toBe(true);
    expect(await logsFor(SYSADMIN_ROLE_ID)).toEqual(before);
  });

  it("관리자 계급이 둘 이상이면 B의 admin.permissions 보기 끔 → 보기 · 쓰기 · 승인 끔 성공", async () => {
    const x = await makeAdmin("관리자 X");
    const roleB = await makeAdminRole("관리자급 B");
    await upsertPermission(SYSTEM_VIEWER, { roleId: roleB, menu: "admin.permissions", action: "approve", allowed: true });
    await makePerson("관리자 P", roleB, null);

    const result = await setPermissionCell(x, { roleId: roleB, menu: "admin.permissions", action: "view", allowed: false }, deps);

    expect(result.changed.map((c) => c.action)).toEqual(["view", "write", "approve"]);
    for (const action of ["view", "write", "approve"] as const) expect(await cell(roleB, "admin.permissions", action)).toBe(false);
  });
});
