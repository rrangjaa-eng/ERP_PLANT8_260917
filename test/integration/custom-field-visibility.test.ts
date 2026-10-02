import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, fieldDefinitions, visibilityMatrix } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createRole, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { can } from "@/domain/permissions/can";
import { ForbiddenError, readVisibilityGrid, setVisibilityCell } from "@/domain/permissions/matrix";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { createAccount } from "@/domain/auth/accounts";
import { createFieldDefinition } from "@/domain/custom-fields/admin";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import { grantCustomFieldsToRole, isAssignableInfoItem } from "@/domain/custom-fields/visibility";
import { seedMasterData } from "@/domain/seed";
import { insertFieldDefinition, listFieldDefinitions } from "@/repositories/field-definitions";
import { insertRole, listRoles } from "@/repositories/roles";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

// 04.5-03: 커스텀 항목(cf.vendor.<key>)이 정보 노출표의 열 · 저장 허용 · 새 계급 기본 행으로 이어진다.
// 칸은 01의 createFieldDefinition으로 만든다(같은 트랜잭션에서 전 계급 보임 행 — 노출 행 없는 정의에 기대지 않는다).

async function createViewer(roleId: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `cfv-${randomUUID()}@example.test`,
    name: "통합테스트 커스텀 노출",
    roleId,
  });
  return { id: userId, roleId };
}

const input = (name: string, sortOrder = 1) => ({ name, type: "text" as const, required: false, sortOrder });

async function archiveField(id: string): Promise<void> {
  await db.update(fieldDefinitions).set({ archivedAt: new Date() }).where(eq(fieldDefinitions.id, id));
}

async function visibilityRows(roleId: string, infoItem: string) {
  return db
    .select()
    .from(visibilityMatrix)
    .where(and(eq(visibilityMatrix.roleId, roleId), eq(visibilityMatrix.infoItem, infoItem)));
}

async function countCustomRows(roleId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visibilityMatrix)
    .where(and(eq(visibilityMatrix.roleId, roleId), like(visibilityMatrix.infoItem, "cf.%")));
  return row?.count ?? 0;
}

async function countVisibilityLogs(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actionLog)
    .where(and(eq(actionLog.actionType, "permission_change"), eq(actionLog.entity, "visibility_matrix")));
  return row?.count ?? 0;
}

// 동기화 지점: 다른 연결이 advisory 잠금을 기다리는 중(granted = false)인 것이 보일 때까지 조회를 되풀이한다.
// 타이머로 쉬지 않는다 — 조회 왕복 자체가 간격이다. stop.done이 서면(상대 사건이 먼저 왔으면) 조용히 끝난다.
async function waitForAdvisoryWaiter(stop: { done: boolean }): Promise<void> {
  const started = Date.now();
  while (!stop.done) {
    const result = await db.execute(sql`select 1 from pg_locks where locktype = 'advisory' and not granted`);
    if (result.rows.length > 0) return;
    if (Date.now() - started > 5000) throw new Error("advisory 잠금 대기 행이 5초 안에 보이지 않았다");
  }
}

describe("정보 노출표 커스텀 열 (04.5-03)", () => {
  const infoItemColumns = INFO_ITEMS.map((item) => ({ id: item.key, label: item.label }));

  it("칸이 0개면 열은 INFO_ITEMS 그대로다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const grid = await readVisibilityGrid(admin);
    expect(grid.columns).toEqual(infoItemColumns);
  });

  it("INFO_ITEMS 뒤에 활성 거래처 칸이 정렬 순서대로 붙고, 보관한 칸은 열이 빠진다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const second = await createFieldDefinition(admin, input("둘째 칸", 2));
    const first = await createFieldDefinition(admin, input("첫째 칸", 1));

    const grid = await readVisibilityGrid(admin);
    expect(grid.columns).toEqual([
      ...infoItemColumns,
      { id: customFieldInfoItem("vendor", first.key), label: "첫째 칸" },
      { id: customFieldInfoItem("vendor", second.key), label: "둘째 칸" },
    ]);
    expect(grid.values[`${DEFAULT_ROLE_ID}::${customFieldInfoItem("vendor", first.key)}`]).toBe(true);

    await archiveField(second.id);
    const after = await readVisibilityGrid(admin);
    expect(after.columns).toEqual([...infoItemColumns, { id: customFieldInfoItem("vendor", first.key), label: "첫째 칸" }]);
  });

  it("저장 허용: 활성 칸 키와 INFO_ITEMS 키만 참이다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const active = await createFieldDefinition(admin, input("활성 칸"));
    const archived = await createFieldDefinition(admin, input("보관 칸"));
    await archiveField(archived.id);
    await insertFieldDefinition(SYSTEM_VIEWER, {
      id: `fd-${randomUUID()}`,
      entity: "project",
      key: "cf_project1",
      type: "text",
    });

    expect(await isAssignableInfoItem(customFieldInfoItem("vendor", active.key))).toBe(true);
    expect(await isAssignableInfoItem(INFO_ITEMS[0]!.key)).toBe(true);
    expect(await isAssignableInfoItem("cf.vendor.cf_nothere")).toBe(false);
    expect(await isAssignableInfoItem(customFieldInfoItem("vendor", archived.key))).toBe(false);
    expect(await isAssignableInfoItem("cf.project.cf_project1")).toBe(false);
    expect(await isAssignableInfoItem("cf.vendor")).toBe(false);
    expect(await isAssignableInfoItem("vendor.nope")).toBe(false);
  });

  it("admin.visibility 쓰기가 없는 계급은 커스텀 항목 셀을 바꿀 수 없다(ForbiddenError · 행 · 로그 그대로)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const pmViewer = await createViewer(DEFAULT_ROLE_ID);
    expect(await can(pmViewer, "admin.visibility", "write")).toBe(false);
    const { key } = await createFieldDefinition(admin, input("거부 칸"));
    const item = customFieldInfoItem("vendor", key);
    const logsBefore = await countVisibilityLogs();

    await expect(
      setVisibilityCell(pmViewer, { roleId: DEFAULT_ROLE_ID, infoItem: item, visible: false }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const rows = await visibilityRows(DEFAULT_ROLE_ID, item);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.visible).toBe(true);
    expect(await countVisibilityLogs()).toBe(logsBefore);
  });

  it("기획 PM에게서 끈 커스텀 항목은 시드를 다시 돌려도 꺼져 있다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { key } = await createFieldDefinition(admin, input("시드 칸"));
    const item = customFieldInfoItem("vendor", key);
    await setVisibilityCell(admin, { roleId: DEFAULT_ROLE_ID, infoItem: item, visible: false });

    await seedMasterData(SYSTEM_VIEWER);

    const rows = await visibilityRows(DEFAULT_ROLE_ID, item);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.visible).toBe(false);
  });

  it("칸을 보관해도 그 칸의 노출 행 수가 줄지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { id, key } = await createFieldDefinition(admin, input("보관 행 칸"));
    const count = async () =>
      (await db.select().from(visibilityMatrix).where(eq(visibilityMatrix.infoItem, customFieldInfoItem("vendor", key))))
        .length;
    const before = await count();
    expect(before).toBeGreaterThan(0);

    await archiveField(id);

    expect(await count()).toBe(before);
  });
});

describe("나중에 만든 계급의 커스텀 항목 기본 행 (04.5-03)", () => {
  it("createRole로 만든 계급은 기존 칸(보관 포함) 전부의 보임 행을 받는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const active = await createFieldDefinition(admin, input("새 계급 활성"));
    const archived = await createFieldDefinition(admin, input("새 계급 보관"));
    await archiveField(archived.id);

    const role = await createRole(SYSTEM_VIEWER, { name: `새 계급-${randomUUID()}` });

    for (const key of [active.key, archived.key]) {
      const rows = await visibilityRows(role.id, customFieldInfoItem("vendor", key));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.visible).toBe(true);
    }
  });

  it("이미 꺼 둔 행은 다시 부여해도 덮지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { key } = await createFieldDefinition(admin, input("덮지 않음 칸"));
    const item = customFieldInfoItem("vendor", key);
    await setVisibilityCell(admin, { roleId: DEFAULT_ROLE_ID, infoItem: item, visible: false });

    await grantCustomFieldsToRole(SYSTEM_VIEWER, DEFAULT_ROLE_ID);

    const rows = await visibilityRows(DEFAULT_ROLE_ID, item);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.visible).toBe(false);
  });

  it("기본 행 쓰기가 한 번 실패하면 다시 시도해 행이 생기고 경고 로그는 없다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { key } = await createFieldDefinition(admin, input("재시도 칸"));
    const warn = vi.spyOn(log, "warn");
    let calls = 0;
    try {
      const role = await createRole(
        SYSTEM_VIEWER,
        { name: `재시도 계급-${randomUUID()}` },
        {
          grantCustomFieldsToRole: async (...args) => {
            calls += 1;
            if (calls === 1) throw new Error("injected");
            return grantCustomFieldsToRole(...args);
          },
        },
      );

      const rows = await visibilityRows(role.id, customFieldInfoItem("vendor", key));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.visible).toBe(true);
      expect(calls).toBe(2);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("두 번 다 실패하면 계급은 남고 경고 로그 한 줄 · 커스텀 행 0개(숨김 쪽 실패)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    await createFieldDefinition(admin, input("실패 칸"));
    const warn = vi.spyOn(log, "warn");
    let calls = 0;
    try {
      const role = await createRole(
        SYSTEM_VIEWER,
        { name: `실패 계급-${randomUUID()}` },
        {
          grantCustomFieldsToRole: () => {
            calls += 1;
            return Promise.reject(new Error("injected"));
          },
        },
      );

      const roleRows = await listRoles(SYSTEM_VIEWER, { includeArchived: true });
      expect(roleRows.some((row) => row.id === role.id)).toBe(true);
      expect(calls).toBe(2);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        "role.custom_field_grant_failed",
        expect.objectContaining({ roleId: role.id }),
      );
      expect(await countCustomRows(role.id)).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

  it("칸 생성과 계급 생성이 겹쳐도 새 계급이 새 칸의 행을 받는다(같은 잠금 · 잠금 뒤 같은 연결로 읽기)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const roleId = `role-race-${randomUUID()}`;
    // 부여의 결과(성공 null · 실패 오류)를 바로 받아 둔다 — 칸 생성이 끝나기 전에 거부돼도 처리되지 않은 거부가 되지 않게.
    let grantOutcome: Promise<unknown> = Promise.resolve(null);

    const created = await createFieldDefinition(admin, input("경합 칸"), {
      listRoles: async (viewer, opts, tx) => {
        // ① 칸 트랜잭션이 잠금 뒤 계급 목록을 읽는다(R이 아직 없다).
        const rows = await listRoles(SYSTEM_VIEWER, { includeArchived: true }, tx);
        // ② R을 넣는다(따로 커밋된다).
        await insertRole(SYSTEM_VIEWER, { id: roleId, name: `경합 계급 ${roleId.slice(-8)}` });
        // ③ R의 부여를 기다리지 않고 띄운다 — 정의를 읽으면 defsRead가 풀린다.
        let markDefsRead!: () => void;
        const defsRead = new Promise<void>((resolve) => {
          markDefsRead = resolve;
        });
        grantOutcome = grantCustomFieldsToRole(SYSTEM_VIEWER, roleId, {
          listFieldDefinitions: async (...args) => {
            const defs = await listFieldDefinitions(...args);
            markDefsRead();
            return defs;
          },
        }).then(
          () => null,
          (error: unknown) => error,
        );
        // ④ 부여가 정의를 읽었거나(잠금 없음) 잠금을 기다리는 중(잠금 있음) — 먼저 오는 사건까지(부여가 실패로 끝나도 멈춘다).
        const stop = { done: false };
        try {
          await Promise.race([defsRead, waitForAdvisoryWaiter(stop), grantOutcome]);
        } finally {
          stop.done = true;
        }
        // ⑤ R이 빠진 목록을 돌려준다.
        return rows;
      },
    });
    expect(await grantOutcome).toBeNull();

    const rows = await visibilityRows(roleId, customFieldInfoItem("vendor", created.key));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.visible).toBe(true);
  });

  // 01과 같은 이유로 풀 크기의 두 배 — 풀 크기와 같은 수면 앞 보유자가 돌려준 연결이 늘 한 칸 비어 교착이
  // 경합에 달린다(01 실측). 두 배면 돌려준 연결을 대기 중 BEGIN이 바로 가져가 보유자 차례마다 풀이 찬다.
  it("풀 크기의 두 배 계급에 동시에 부여해도 전부 끝나고 계급마다 행이 하나다(잠금 보유자가 두 번째 연결을 요구하지 않는다)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const { key } = await createFieldDefinition(admin, input("풀 칸"));
    const roleIds: string[] = [];
    for (let i = 0; i < env.DB_POOL_MAX * 2; i += 1) {
      const id = `role-pool-${randomUUID()}`;
      await insertRole(SYSTEM_VIEWER, { id, name: `풀 계급 ${id.slice(-12)}` });
      roleIds.push(id);
    }

    await Promise.all(roleIds.map((id) => grantCustomFieldsToRole(SYSTEM_VIEWER, id)));

    for (const id of roleIds) {
      const rows = await visibilityRows(id, customFieldInfoItem("vendor", key));
      expect(rows).toHaveLength(1);
    }
  });
});
