import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, roles } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createRole, DEFAULT_ROLE_ID, renameRole } from "@/domain/permissions/roles";
import { setPermissionCell, setVisibilityCell } from "@/domain/permissions/matrix";
import { findPermission, findVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";

// 07-26(D-726 · R5): 권한표 · 정보 노출표 · 계급 변경이 끌 수 없는 permission_change에 전후 값(detail.changes)을 싣는다.

async function logsFor(entity: string, entityId: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.actionType, "permission_change"), eq(actionLog.entity, entity), eq(actionLog.entityId, entityId)));
}

async function makeBareRole(): Promise<string> {
  const id = `role-test-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id, name: `임시 계급 ${id.slice(-6)}` });
  return id;
}

const failingRecord = { recordAction: () => Promise.reject(new Error("로그 쓰기 실패 흉내")) };

describe("권한표 칸 — permission_change 전후 값 (Task 1)", () => {
  it("켜진 칸을 끄면 한 행에 기존 detail 네 칸과 changes {allowed:[true,false]}", async () => {
    await setPermissionCell(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "projects", action: "write", allowed: false });

    const logs = await logsFor("permission_matrix", DEFAULT_ROLE_ID);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({
      roleId: DEFAULT_ROLE_ID,
      menu: "projects",
      action: "write",
      allowed: false,
      changes: { allowed: [true, false] },
    });
  });

  it("행이 없던 보기 칸을 켜면 한 행에 changes {allowed:[null,true]}", async () => {
    const roleId = await makeBareRole();

    await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.code-tables", action: "view", allowed: true });

    const logs = await logsFor("permission_matrix", roleId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({
      roleId,
      menu: "admin.code-tables",
      action: "view",
      allowed: true,
      changes: { allowed: [null, true] },
    });
  });

  it("기록 단계가 실패하면 칸 값도 그대로다(같은 트랜잭션)", async () => {
    await expect(
      setPermissionCell(
        SYSTEM_VIEWER,
        { roleId: DEFAULT_ROLE_ID, menu: "projects", action: "write", allowed: false },
        failingRecord,
      ),
    ).rejects.toThrow("로그 쓰기 실패 흉내");

    expect((await findPermission(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "projects", "write"))?.allowed).toBe(true);
    expect(await logsFor("permission_matrix", DEFAULT_ROLE_ID)).toHaveLength(0);
  });
});

describe("정보 노출표 칸 — permission_change 전후 값 · 한 트랜잭션 (Task 2)", () => {
  it("숨김 칸을 켜면 한 행에 기존 detail 세 칸과 changes {visible:[false,true]}", async () => {
    await setVisibilityCell(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "pnl.amount", visible: true });

    const logs = await logsFor("visibility_matrix", DEFAULT_ROLE_ID);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({
      roleId: DEFAULT_ROLE_ID,
      infoItem: "pnl.amount",
      visible: true,
      changes: { visible: [false, true] },
    });
  });

  it("행이 없던 칸을 켜면 changes {visible:[null,true]}", async () => {
    const roleId = await makeBareRole();

    await setVisibilityCell(SYSTEM_VIEWER, { roleId, infoItem: "pnl.amount", visible: true });

    const logs = await logsFor("visibility_matrix", roleId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({ roleId, infoItem: "pnl.amount", visible: true, changes: { visible: [null, true] } });
  });

  it("기록 단계가 실패하면 노출 값도 그대로다(같은 트랜잭션)", async () => {
    await expect(
      setVisibilityCell(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "pnl.amount", visible: true }, failingRecord),
    ).rejects.toThrow("로그 쓰기 실패 흉내");

    expect((await findVisibility(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "pnl.amount"))?.visible).toBe(false);
    expect(await logsFor("visibility_matrix", DEFAULT_ROLE_ID)).toHaveLength(0);
  });
});

describe("계급 만들기 · 이름 바꾸기 — permission_change 전후 값 (Task 2)", () => {
  it("계급을 만들면 changes {name:[null,이름]}", async () => {
    const role = await createRole(SYSTEM_VIEWER, { name: "  행사 지원  " });

    const logs = await logsFor("roles", role.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({ changes: { name: [null, "행사 지원"] } });
  });

  it("이름을 바꾸면 changes {name:[이전,이후]}", async () => {
    const roleId = await makeBareRole();
    const [before] = await db.select().from(roles).where(eq(roles.id, roleId));

    await renameRole(SYSTEM_VIEWER, roleId, "바뀐 이름");

    const logs = await logsFor("roles", roleId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({ changes: { name: [before?.name, "바뀐 이름"] } });
  });

  it("같은 이름으로 바꾸면 changes가 빈 객체이고 행은 남는다", async () => {
    const roleId = await makeBareRole();
    const [before] = await db.select().from(roles).where(eq(roles.id, roleId));

    await renameRole(SYSTEM_VIEWER, roleId, before?.name ?? "");

    const logs = await logsFor("roles", roleId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({ changes: {} });
  });
});
