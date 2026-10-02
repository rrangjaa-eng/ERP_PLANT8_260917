import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { db, pool } from "@/db/client";
import * as schema from "@/db/schema";
import { actionLog, fieldDefinitions, vendors, visibilityMatrix } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import {
  ARCHIVED_OPTION_MESSAGE,
  CustomFieldsInvalidError,
  REQUIRED_VALUE_EMPTY_MESSAGE,
  UnknownCustomFieldKeyError,
} from "@/domain/custom-fields/preserve";
import { createVendor, listVendorFieldDefinitions, listVendors, updateVendor } from "@/domain/vendors";
import { insertFieldDefinition } from "@/repositories/field-definitions";
import {
  insertVisibilityIfAbsent,
  readVendorFieldAccess,
  upsertPermission,
  upsertVisibility,
} from "@/repositories/permissions";
import { insertRole, listRoles } from "@/repositories/roles";
import { findVendorByIdForUpdate, insertVendor } from "@/repositories/vendors";

// 04.5-05(ROADMAP 04.5 기준 2·4 · T-04.5-05/17/41/44): 거래처 저장이 보는 사람이 볼 수 없는 칸의 값을 지우거나 바꾸지 않는다.
// 거래처 폼 경로는 formEdit/formCreate가 흉내 낸다 — 폼이 그리는 정의(listVendorFieldDefinitions)만으로 customFields를
// 만들고(수정은 그린 칸을 빈 값까지 모두, 기본값은 그 사람의 DTO 값), 액션이 넘기는 그대로 domain을 부른다.

type FieldOpts = {
  type?: "text" | "number" | "date" | "select";
  options?: string[];
  required?: boolean;
  sortOrder?: number;
  /** false면 노출 행을 넣지 않는다(백필 전 상태) */
  exposed?: boolean;
};

// 칸 하나 — 01의 생성과 같은 결과를 직접 만든다: 정의 + 모든 계급(보관 포함)에 cf.vendor.<key> 보임 행.
async function addField(opts: FieldOpts = {}): Promise<string> {
  const key = `cf_${randomUUID().slice(0, 8)}`;
  await insertFieldDefinition(SYSTEM_VIEWER, {
    id: randomUUID(),
    entity: "vendor",
    key,
    label: `칸${key}`,
    type: opts.type ?? "text",
    options: opts.options,
    required: opts.required ?? false,
    sortOrder: opts.sortOrder ?? 1,
  });
  if (opts.exposed !== false) {
    for (const role of await listRoles(SYSTEM_VIEWER, { includeArchived: true })) {
      await insertVisibilityIfAbsent(SYSTEM_VIEWER, { roleId: role.id, infoItem: customFieldInfoItem("vendor", key), visible: true });
    }
  }
  return key;
}

async function setFieldVisible(roleId: string, key: string, visible: boolean): Promise<void> {
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: customFieldInfoItem("vendor", key), visible });
}

async function setArchived(key: string, archived: boolean): Promise<void> {
  await db
    .update(fieldDefinitions)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(fieldDefinitions.entity, "vendor"), eq(fieldDefinitions.key, key)));
}

async function viewerOf(roleId: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `vcfs-${randomUUID()}@example.test`,
    name: "통합테스트 거래처 저장",
    roleId,
  });
  return { id: userId, roleId };
}

// 기획 PM(기본 계급)은 시드로 「거래처 정보」를 본다 — 거래처 메뉴 보기 · 쓰기만 켠다.
async function pmEditor(): Promise<Viewer> {
  await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "write", allowed: true });
  return viewerOf(DEFAULT_ROLE_ID);
}

async function seedVendor(customFields: Record<string, unknown>): Promise<{ id: string; name: string }> {
  const name = `저장보존-${randomUUID().slice(0, 8)}`;
  const row = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name, customFields });
  return { id: row.id, name };
}

async function stored(id: string): Promise<{ customFields: Record<string, unknown>; updatedAt: Date }> {
  const [row] = await db
    .select({ customFields: vendors.customFields, updatedAt: vendors.updatedAt })
    .from(vendors)
    .where(eq(vendors.id, id));
  if (!row) throw new Error("거래처 행 없음");
  return { customFields: row.customFields as Record<string, unknown>, updatedAt: row.updatedAt };
}

// 거래처 폼 수정 제출 — 그린 칸(폼 정의)을 빈 값까지 모두 보낸다. 기본값은 그 사람이 받은 DTO 값이다.
async function formEdit(
  viewer: Viewer,
  vendor: { id: string; name: string },
  changes: Record<string, string> = {},
  extra: Record<string, unknown> = {},
) {
  const defs = await listVendorFieldDefinitions(viewer);
  const dto = (await listVendors(viewer, { includeHidden: true })).find((row) => row.id === vendor.id);
  const current = dto?.customFields ?? {};
  const customFields: Record<string, unknown> = Object.fromEntries(
    defs.map((def) => [def.key, changes[def.key] ?? (current[def.key] === undefined ? "" : String(current[def.key]))]),
  );
  Object.assign(customFields, extra);
  return updateVendor(viewer, vendor.id, {
    name: vendor.name,
    customFields: Object.keys(customFields).length === 0 ? undefined : customFields,
  });
}

// 거래처 폼 등록 제출 — 빈 필수 아님 칸은 뺀다(서버가 키 없음 = 빈칸으로 판정).
async function formCreate(viewer: Viewer, name: string, values: Record<string, string> = {}) {
  const defs = await listVendorFieldDefinitions(viewer);
  const customFields: Record<string, unknown> = {};
  for (const def of defs) {
    const raw = values[def.key] ?? "";
    if (raw === "" && !def.required) continue;
    customFields[def.key] = raw;
  }
  return createVendor(viewer, { name, customFields: Object.keys(customFields).length > 0 ? customFields : undefined });
}

// 다른 연결 하나로 트랜잭션을 열어 work를 하고 커밋하지 않은 채 잡아 둔다.
async function holdTransaction(work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let ready!: () => void;
  const readyP = new Promise<void>((resolve) => (ready = resolve));
  const done = db.transaction(async (tx) => {
    await work(tx);
    ready();
    await gate;
  });
  await Promise.race([readyP, done]);
  return {
    commit: async () => {
      release();
      await done;
    },
  };
}

// 50ms 간격으로 조건을 다시 본다 — 5초 넘으면 실패.
async function waitUntil(check: () => Promise<boolean>, what: string): Promise<void> {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > 5000) throw new Error(`5초 안에 ${what} 없음`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const lockWaiterInThisDb = async () =>
  (
    await db.execute(
      sql`select 1 from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`,
    )
  ).rows.length > 0;
// 다른 DB(병렬 실행 · 개발 DB)의 대기 잠금을 이 테스트의 대기로 오인하지 않게 이 DB 세션만 본다(05 독립 검토 M3).
// 행 잠금 대기는 transactionid 잠금이라 pg_locks.database가 비어 있다 — pg_stat_activity.datname으로 거른다.
const ungrantedLock = async () =>
  (
    await db.execute(
      sql`select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid where not l.granted and a.datname = current_database()`,
    )
  ).rows.length > 0;

describe("보이지 않는 칸의 저장값 보존 (04.5-05)", () => {
  it("칸 A를 끈 계급이 폼으로 수정 저장해도 DB의 A 값은 그대로이고 그 사람의 DTO에는 A가 없다", async () => {
    const a = await addField({ sortOrder: 1 });
    const e = await addField({ sortOrder: 2 });
    const pm = await pmEditor();
    const vendor = await seedVendor({ [a]: "숨은값", [e]: "옛값" });
    await setFieldVisible(DEFAULT_ROLE_ID, a, false);

    const dto = await formEdit(pm, vendor, { [e]: "새값" });

    expect((await stored(vendor.id)).customFields).toEqual({ [a]: "숨은값", [e]: "새값" });
    expect(dto?.customFields).toEqual({ [e]: "새값" });
  });

  it("보관된 칸 B의 값은 수정 저장으로 지워지지 않고, 복원하면 DTO에 다시 보인다", async () => {
    const a = await addField({ sortOrder: 1 });
    const b = await addField({ sortOrder: 2 });
    const admin = await viewerOf(SYSADMIN_ROLE_ID);
    const vendor = await seedVendor({ [a]: "에이", [b]: "보관될값" });
    await setArchived(b, true);

    await formEdit(admin, vendor, { [a]: "에이2" });
    expect((await stored(vendor.id)).customFields).toEqual({ [a]: "에이2", [b]: "보관될값" });

    await setArchived(b, false);
    const dto = (await listVendors(admin)).find((row) => row.id === vendor.id);
    expect(dto?.customFields).toEqual({ [a]: "에이2", [b]: "보관될값" });
  });

  it("보관된 필수 칸은 등록도 수정도 막지 않고 그 저장값은 남는다(04 독립 검토 추가)", async () => {
    const a = await addField({ sortOrder: 1 });
    const req = await addField({ sortOrder: 2, required: true });
    const admin = await viewerOf(SYSADMIN_ROLE_ID);
    const vendor = await seedVendor({ [req]: "필수값" });
    await setArchived(req, true);

    const { vendor: created } = await formCreate(admin, `보관필수-${randomUUID().slice(0, 8)}`, { [a]: "에이" });
    expect((await stored(created.id)).customFields).toEqual({ [a]: "에이" });

    await formEdit(admin, vendor, { [a]: "에이" });
    expect((await stored(vendor.id)).customFields).toEqual({ [a]: "에이", [req]: "필수값" });
  });

  it("「거래처 정보」를 끈 계급은 폼 칸이 0개이고, 그 저장은 커스텀 값을 그대로 둔다(정의 있는 키를 보내도)", async () => {
    const a = await addField();
    const pm = await pmEditor();
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "vendor.value", visible: false });
    const vendor = await seedVendor({ [a]: "그대로" });

    expect(await listVendorFieldDefinitions(pm)).toEqual([]);

    await updateVendor(pm, vendor.id, { name: `${vendor.name}-1` });
    expect((await stored(vendor.id)).customFields).toEqual({ [a]: "그대로" });

    await updateVendor(pm, vendor.id, { name: `${vendor.name}-2`, customFields: { [a]: "위조값" } });
    expect((await stored(vendor.id)).customFields).toEqual({ [a]: "그대로" });
    const [row] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vendor.id));
    expect(row?.name).toBe(`${vendor.name}-2`);
  });

  it("숨은 필수 칸은 그 계급의 등록을 막지 않는다", async () => {
    const hiddenRequired = await addField({ required: true });
    const pm = await pmEditor();
    await setFieldVisible(DEFAULT_ROLE_ID, hiddenRequired, false);

    const { vendor } = await formCreate(pm, `숨은필수-${randomUUID().slice(0, 8)}`);
    expect((await stored(vendor.id)).customFields).toEqual({});
  });
});

describe("입력 밖 존재 키 · 없는 키 (T-04.5-05)", () => {
  it("끈 칸 A 키를 새 값과 함께 보내며 E를 고치면 저장은 성공하고 A는 그대로, E는 보낸 값", async () => {
    const a = await addField({ sortOrder: 1 });
    const e = await addField({ sortOrder: 2 });
    const pm = await pmEditor();
    const vendor = await seedVendor({ [a]: "숨은값", [e]: "옛값" });
    await setFieldVisible(DEFAULT_ROLE_ID, a, false);

    await formEdit(pm, vendor, { [e]: "새값" }, { [a]: "위조값" });
    expect((await stored(vendor.id)).customFields).toEqual({ [a]: "숨은값", [e]: "새값" });
  });

  it("시스템 관리자가 보관된 B 키를 새 값과 함께 보내도 저장은 성공하고 B는 그대로", async () => {
    const b = await addField();
    const admin = await viewerOf(SYSADMIN_ROLE_ID);
    const vendor = await seedVendor({ [b]: "보관값" });
    await setArchived(b, true);

    await updateVendor(admin, vendor.id, { name: vendor.name, customFields: { [b]: "새값" } });
    expect((await stored(vendor.id)).customFields).toEqual({ [b]: "보관값" });
  });

  it("노출 행이 하나도 없는 정의는 시스템 관리자에게도 입력 칸이 아니다 — 보낸 값은 버리고 저장값은 남는다", async () => {
    const bare = await addField({ exposed: false });
    const admin = await viewerOf(SYSADMIN_ROLE_ID);
    const vendor = await seedVendor({ [bare]: "백필전값" });

    await updateVendor(admin, vendor.id, { name: vendor.name, customFields: { [bare]: "새값" } });
    expect((await stored(vendor.id)).customFields).toEqual({ [bare]: "백필전값" });
  });

  it("어떤 거래처 정의에도 없는 키는 빈 값이어도, 다른 칸 수정과 함께여도 거부되고 DB는 그대로다", async () => {
    const e = await addField();
    const admin = await viewerOf(SYSADMIN_ROLE_ID);
    const vendor = await seedVendor({ [e]: "옛값" });
    const before = await stored(vendor.id);

    await expect(
      updateVendor(admin, vendor.id, { name: `${vendor.name}-x`, customFields: { [e]: "새값", nope: "" } }),
    ).rejects.toBeInstanceOf(UnknownCustomFieldKeyError);

    const after = await stored(vendor.id);
    expect(after.customFields).toEqual(before.customFields);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    const logs = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entity, "vendor"), eq(actionLog.entityId, vendor.id)));
    expect(logs).toHaveLength(0);
  });
});

describe("필수 판정 · 보관 선택지 (UI-SPEC 화면 3)", () => {
  it("거래처를 만든 뒤 생긴 필수 칸 C — 다른 칸만 고치면 성공, C를 채운 뒤 지우면 막힘", async () => {
    const e = await addField({ sortOrder: 1 });
    const admin = await viewerOf(SYSADMIN_ROLE_ID);
    const vendor = await seedVendor({ [e]: "옛값" });
    const c = await addField({ sortOrder: 2, required: true });

    await formEdit(admin, vendor, { [e]: "새값" });
    expect((await stored(vendor.id)).customFields).toEqual({ [e]: "새값" });

    await formEdit(admin, vendor, { [c]: "채움" });
    expect((await stored(vendor.id)).customFields).toEqual({ [e]: "새값", [c]: "채움" });

    const error = await formEdit(admin, vendor, { [c]: "" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CustomFieldsInvalidError);
    expect((error as CustomFieldsInvalidError).fieldErrors).toEqual({ [c]: REQUIRED_VALUE_EMPTY_MESSAGE });
    expect((await stored(vendor.id)).customFields).toEqual({ [e]: "새값", [c]: "채움" });
  });

  it("필수 칸 C가 빈 등록은 막히고 거래처 행이 생기지 않는다", async () => {
    const c = await addField({ required: true });
    const admin = await viewerOf(SYSADMIN_ROLE_ID);
    const name = `필수빈등록-${randomUUID().slice(0, 8)}`;

    const error = await formCreate(admin, name).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CustomFieldsInvalidError);
    expect((error as CustomFieldsInvalidError).fieldErrors).toEqual({ [c]: REQUIRED_VALUE_EMPTY_MESSAGE });
    expect(await db.select().from(vendors).where(eq(vendors.name, name))).toHaveLength(0);
  });

  it("보관된 선택지가 저장값이면 그대로 저장하면 유지, 다른 보관 선택지로 바꾸면 그 칸에 보관 선택지 문구", async () => {
    const d = await addField({ type: "select", options: ["상", "구형", "폐기"] });
    const admin = await viewerOf(SYSADMIN_ROLE_ID);
    const vendor = await seedVendor({ [d]: "구형" });
    await db
      .update(fieldDefinitions)
      .set({ options: ["상"], archivedOptions: ["구형", "폐기"] })
      .where(eq(fieldDefinitions.key, d));

    await formEdit(admin, vendor, { [d]: "구형" });
    expect((await stored(vendor.id)).customFields).toEqual({ [d]: "구형" });

    const error = await formEdit(admin, vendor, { [d]: "폐기" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CustomFieldsInvalidError);
    expect((error as CustomFieldsInvalidError).fieldErrors).toEqual({ [d]: ARCHIVED_OPTION_MESSAGE });
    expect((await stored(vendor.id)).customFields).toEqual({ [d]: "구형" });
  });

  it("활성 · 보관 어디에도 없는 옛 저장값(0023 이전 삭제)은 이름만 고친 수정 저장을 막지 않고, 다른 거래처에는 고를 수 없다", async () => {
    const d = await addField({ type: "select", options: ["상", "옛값"] });
    const admin = await viewerOf(SYSADMIN_ROLE_ID);
    const vendor = await seedVendor({ [d]: "옛값" });
    const other = await seedVendor({ [d]: "상" });
    await db.update(fieldDefinitions).set({ options: ["상"], archivedOptions: [] }).where(eq(fieldDefinitions.key, d));

    const renamed = { id: vendor.id, name: `${vendor.name}-새이름` };
    await formEdit(admin, renamed);
    const row = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vendor.id));
    expect(row[0]?.name).toBe(renamed.name);
    expect((await stored(vendor.id)).customFields).toEqual({ [d]: "옛값" });

    const error = await formEdit(admin, other, { [d]: "옛값" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CustomFieldsInvalidError);
    expect((await stored(other.id)).customFields).toEqual({ [d]: "상" });
  });
});

describe("한 문 조회 readVendorFieldAccess (T-04.5-44)", () => {
  async function fixture() {
    const a = await addField({ sortOrder: 1 });
    const b = await addField({ sortOrder: 2 });
    const c = await addField({ sortOrder: 3, exposed: false });
    await setArchived(c, true);
    await setFieldVisible(DEFAULT_ROLE_ID, b, false);
    return { a, b, c };
  }

  it("정의 셋(정렬 순서 · 보관 포함) · 거래처 정보 보임 · 보이는 칸 키 {A}를 돌려준다", async () => {
    const { a, b, c } = await fixture();
    const access = await readVendorFieldAccess(SYSTEM_VIEWER, DEFAULT_ROLE_ID);
    expect(access.definitions.map((def) => def.key)).toEqual([a, b, c]);
    expect(access.vendorValueVisible).toBe(true);
    expect([...access.visibleFieldKeys]).toEqual([a]);
  });

  it("「거래처 정보」 행이 없는 계급은 거짓, roleId가 null이면 두 보임 모두 거짓이고 정의는 셋 그대로", async () => {
    const { a, b, c } = await fixture();
    const bareRole = `role-vcfs-${randomUUID().slice(0, 8)}`;
    await insertRole(SYSTEM_VIEWER, { id: bareRole, name: `E2E${bareRole}`, sortOrder: 99 });
    expect(
      await db.select().from(visibilityMatrix).where(and(eq(visibilityMatrix.roleId, bareRole), eq(visibilityMatrix.infoItem, "vendor.value"))),
    ).toHaveLength(0);
    expect((await readVendorFieldAccess(SYSTEM_VIEWER, bareRole)).vendorValueVisible).toBe(false);

    const none = await readVendorFieldAccess(SYSTEM_VIEWER, null);
    expect(none.definitions.map((def) => def.key)).toEqual([a, b, c]);
    expect(none.vendorValueVisible).toBe(false);
    expect(none.visibleFieldKeys.size).toBe(0);
  });

  it("실제로 실행된 SQL은 정확히 1개 — select로 시작하고 left join이 2번이다", async () => {
    await fixture();
    const queries: string[] = [];
    const logged = drizzle(pool, { schema, logger: { logQuery: (query) => queries.push(query) } });
    await readVendorFieldAccess(SYSTEM_VIEWER, DEFAULT_ROLE_ID, logged);
    expect(queries).toHaveLength(1);
    const statement = (queries[0] ?? "").toLowerCase();
    expect(statement.startsWith("select")).toBe(true);
    expect(statement.match(/left join/g)).toHaveLength(2);
  });
});

describe("동시 저장 — 행 잠금 한 트랜잭션 (T-04.5-41 · T-04.5-44)", () => {
  it("관리자가 숨은 칸 A를 고치는 중에 시작한 좁은 계급의 저장이 A를 옛 값으로 되돌리지 않는다", async () => {
    const a = await addField({ sortOrder: 1 });
    const e = await addField({ sortOrder: 2 });
    const pm = await pmEditor();
    const vendor = await seedVendor({ [a]: "옛숨은값", [e]: "옛값" });
    await setFieldVisible(DEFAULT_ROLE_ID, a, false);

    const adminTx = await holdTransaction(async (tx) => {
      await tx.update(vendors).set({ customFields: { [a]: "관리자가바꾼값", [e]: "옛값" } }).where(eq(vendors.id, vendor.id));
    });
    let saving: Promise<unknown> | undefined;
    try {
      saving = updateVendor(pm, vendor.id, { name: vendor.name, customFields: { [e]: "사용자값" } }).then(
        () => null,
        (error: unknown) => error,
      );
      await waitUntil(lockWaiterInThisDb, "잠금 대기 세션");
    } finally {
      await adminTx.commit();
    }
    expect(await saving).toBeNull();
    expect((await stored(vendor.id)).customFields).toEqual({ [a]: "관리자가바꾼값", [e]: "사용자값" });
  });

  it("숨김 후 저장 — 전제: 칸 A 숨김과 거래처 값 변경이 관리자의 한 트랜잭션 — 그 뒤에 끝나는 저장은 A에 사용자 제출값을 쓰지 않는다", async () => {
    const a = await addField();
    const pm = await pmEditor();
    const vendor = await seedVendor({ [a]: "옛값" });

    const adminTx = await holdTransaction(async (tx) => {
      await tx
        .update(visibilityMatrix)
        .set({ visible: false })
        .where(and(eq(visibilityMatrix.roleId, DEFAULT_ROLE_ID), eq(visibilityMatrix.infoItem, customFieldInfoItem("vendor", a))));
      await tx.update(vendors).set({ customFields: { [a]: "관리자가바꾼값" } }).where(eq(vendors.id, vendor.id));
    });
    let saving: Promise<unknown> | undefined;
    try {
      saving = updateVendor(pm, vendor.id, { name: vendor.name, customFields: { [a]: "사용자값" } }).then(
        () => null,
        (error: unknown) => error,
      );
      await waitUntil(ungrantedLock, "기다리는 잠금(granted = false)");
    } finally {
      await adminTx.commit();
    }
    expect(await saving).toBeNull();
    expect((await stored(vendor.id)).customFields).toEqual({ [a]: "관리자가바꾼값" });
  });

  it("거래처 정보 끔 + 칸 켬 — 전제: 두 보임 변경이 거래처 행 갱신과 한 트랜잭션 — 모두 반영된 스냅숏으로 판정해 A에 사용자 제출값을 쓰지 않는다", async () => {
    const a = await addField();
    const pm = await pmEditor();
    await setFieldVisible(DEFAULT_ROLE_ID, a, false);
    const vendor = await seedVendor({ [a]: "옛값" });

    const adminTx = await holdTransaction(async (tx) => {
      await tx.update(vendors).set({ customFields: { [a]: "관리자가바꾼값" } }).where(eq(vendors.id, vendor.id));
      await tx
        .update(visibilityMatrix)
        .set({ visible: false })
        .where(and(eq(visibilityMatrix.roleId, DEFAULT_ROLE_ID), eq(visibilityMatrix.infoItem, "vendor.value")));
      await tx
        .update(visibilityMatrix)
        .set({ visible: true })
        .where(and(eq(visibilityMatrix.roleId, DEFAULT_ROLE_ID), eq(visibilityMatrix.infoItem, customFieldInfoItem("vendor", a))));
    });
    let saving: Promise<unknown> | undefined;
    try {
      saving = updateVendor(pm, vendor.id, { name: vendor.name, customFields: { [a]: "사용자값" } }).then(
        () => null,
        (error: unknown) => error,
      );
      await waitUntil(ungrantedLock, "기다리는 잠금(granted = false)");
    } finally {
      await adminTx.commit();
    }
    expect(await saving).toBeNull();
    expect((await stored(vendor.id)).customFields).toEqual({ [a]: "관리자가바꾼값" });
  });

  it("저장의 행 잠금은 이 거래처를 가리키는 FK 참조 잠금(KEY SHARE)을 막지 않는다 — FOR NO KEY UPDATE", async () => {
    const vendor = await seedVendor({});
    const held = await holdTransaction(async (tx) => {
      await findVendorByIdForUpdate(SYSTEM_VIEWER, vendor.id, tx);
    });
    try {
      const rows = await db.execute(sql`select id from vendors where id = ${vendor.id} for key share nowait`);
      expect(rows.rows).toHaveLength(1);
    } finally {
      await held.commit();
    }
  });
});
