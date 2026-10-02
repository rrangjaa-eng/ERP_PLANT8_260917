import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
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
import {
  grantCustomFieldsToRole,
  isAssignableInfoItem,
  pickVisibleCustomFields,
} from "@/domain/custom-fields/visibility";
import {
  createVendor,
  listVendorFieldDefinitions,
  listVendors,
  searchVendors,
  setVendorHidden,
  updateVendor,
} from "@/domain/vendors";
import { insertVisibilityIfAbsent, upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seedMasterData } from "@/domain/seed";
import { insertFieldDefinition, listFieldDefinitions } from "@/repositories/field-definitions";
import { insertRole, listRoles } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { env } from "@/lib/env";

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

  it("기본 행 부여가 실패하면 계급 생성도 실패하고 계급 · 커스텀 행이 남지 않는다(같은 트랜잭션)", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    await createFieldDefinition(admin, input("실패 칸"));
    const name = `실패 계급-${randomUUID()}`;
    let grantedRoleId: string | undefined;

    await expect(
      createRole(
        SYSTEM_VIEWER,
        { name },
        {
          grantCustomFieldsToRole: async (viewer, roleId, deps, tx) => {
            await grantCustomFieldsToRole(viewer, roleId, deps, tx);
            grantedRoleId = roleId;
            throw new Error("injected");
          },
        },
      ),
    ).rejects.toThrow("injected");

    const roleRows = await listRoles(SYSTEM_VIEWER, { includeArchived: true });
    expect(roleRows.some((row) => row.name === name)).toBe(false);
    expect(grantedRoleId).toBeDefined();
    expect(await countCustomRows(grantedRoleId!)).toBe(0);
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

describe("거래처 DTO 칸별 판정 (04.5-03)", () => {
  it("pickVisibleCustomFields: 집합 안 키만 남기고, 값 객체가 없으면 그대로 없다", () => {
    expect(pickVisibleCustomFields({ a: 1, b: 2 }, new Set(["a"]))).toEqual({ a: 1 });
    expect(pickVisibleCustomFields(undefined, new Set(["a"]))).toBeUndefined();
  });

  // 기획 PM(기본 계급)은 시드로 「거래처 정보」(vendor.value)를 본다 — 거래처 메뉴 보기·쓰기만 테스트에서 켠다.
  async function pmWithVendorMenu(): Promise<Viewer> {
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "write", allowed: true });
    return createViewer(DEFAULT_ROLE_ID);
  }

  it("칸 B를 끈 계급은 목록 · 검색 · 수정 · 숨김 반환 DTO 모두에서 A 값만 받고, 폼 정의도 A만 받는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const a = await createFieldDefinition(admin, input("칸 에이"));
    const b = await createFieldDefinition(admin, input("칸 비"));
    const pm = await pmWithVendorMenu();
    const name = `칸별거래처-${randomUUID()}`;
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name,
      customFields: { [a.key]: "에이값", [b.key]: "비값" },
    });
    await upsertVisibility(SYSTEM_VIEWER, {
      roleId: DEFAULT_ROLE_ID,
      infoItem: customFieldInfoItem("vendor", b.key),
      visible: false,
    });
    const onlyA = { [a.key]: "에이값" };

    const listed = (await listVendors(pm)).find((row) => row.id === vendor.id);
    expect(listed?.customFields).toEqual(onlyA);
    const searched = (await searchVendors(pm, name)).find((row) => row.id === vendor.id);
    expect(searched?.customFields).toEqual(onlyA);
    const updated = await updateVendor(pm, vendor.id, { name });
    expect(updated?.customFields).toEqual(onlyA);
    const hidden = await setVendorHidden(pm, vendor.id, true);
    expect(hidden?.customFields).toEqual(onlyA);
    expect(JSON.stringify([listed, searched, updated, hidden])).not.toContain("비값");

    expect((await listVendorFieldDefinitions(pm)).map((def) => def.key)).toEqual([a.key]);
    // 시스템 관리자는 둘 다 본다.
    const forAdmin = (await listVendors(SYSTEM_VIEWER, { includeHidden: true })).find((row) => row.id === vendor.id);
    expect(forAdmin?.customFields).toEqual({ [a.key]: "에이값", [b.key]: "비값" });
  });

  it("생성 반환 DTO도 끈 칸 값을 싣지 않는다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const a = await createFieldDefinition(admin, input("생성 에이"));
    const b = await createFieldDefinition(admin, input("생성 비"));
    const pm = await pmWithVendorMenu();
    await upsertVisibility(SYSTEM_VIEWER, {
      roleId: DEFAULT_ROLE_ID,
      infoItem: customFieldInfoItem("vendor", b.key),
      visible: false,
    });

    const { vendor } = await createVendor(pm, {
      name: `생성거래처-${randomUUID()}`,
      customFields: { [a.key]: "에이", [b.key]: "비숨김" },
    });

    expect(vendor.customFields).toEqual({ [a.key]: "에이" });
  });

  it("보관된 칸의 값은 시스템 관리자 DTO에도 없다", async () => {
    const admin = await createViewer(SYSADMIN_ROLE_ID);
    const a = await createFieldDefinition(admin, input("보관 전 에이"));
    const b = await createFieldDefinition(admin, input("보관 될 비"));
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name: `보관칸거래처-${randomUUID()}`,
      customFields: { [a.key]: "남는값", [b.key]: "보관값" },
    });
    await archiveField(b.id);

    const row = (await listVendors(SYSTEM_VIEWER)).find((candidate) => candidate.id === vendor.id);
    expect(row?.customFields).toEqual({ [a.key]: "남는값" });
    expect((await listVendorFieldDefinitions(SYSTEM_VIEWER)).map((def) => def.key)).toEqual([a.key]);
  });

  it("노출 행이 하나도 없는 거래처 정의의 값은 시스템 관리자에게도 숨고, 행을 넣으면 보인다(백필이 선행 조건인 이유)", async () => {
    await insertFieldDefinition(SYSTEM_VIEWER, {
      id: `fd-${randomUUID()}`,
      entity: "vendor",
      key: "legacyNote",
      type: "text",
    });
    // 04.5-05: 노출 행 없는 정의는 입력 칸이 아니라 저장 경로가 값을 받지 않는다 — 백필 전에 이미 있던 값을 직접 넣는다.
    const legacyName = `백필전거래처-${randomUUID()}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: legacyName,
      normalizedName: legacyName,
      customFields: { legacyNote: "옛값" },
    });

    const before = (await listVendors(SYSTEM_VIEWER)).find((row) => row.id === vendor.id);
    expect(before?.customFields).toEqual({});

    await insertVisibilityIfAbsent(SYSTEM_VIEWER, {
      roleId: SYSADMIN_ROLE_ID,
      infoItem: customFieldInfoItem("vendor", "legacyNote"),
      visible: true,
    });
    const after = (await listVendors(SYSTEM_VIEWER)).find((row) => row.id === vendor.id);
    expect(after?.customFields).toEqual({ legacyNote: "옛값" });
  });
});
