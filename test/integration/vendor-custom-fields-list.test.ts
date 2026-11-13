import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { countVendors, listVendors } from "@/domain/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { seedCustomFieldDefinition } from "../support/custom-fields";

// 07.5-01 D-7522 · D-7510 · T-07.5-01-01/02: 검색 · 선택 칸 거르개는 이 사람에게 보이는 활성 칸 집합 하나로만 돈다.
// 계급마다 별도 임시 계급을 만든다 — 시드 계급에 노출 행을 만들지 않아 다른 시험의 거래처 목록을 흔들지 않는다.

async function makeViewer(opts: { vendorValue?: boolean } = {}): Promise<Viewer> {
  const roleId = `role-vcfl-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `목록${roleId.slice(-8)}`, sortOrder: 99 });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "admin.vendors", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "vendor.value", visible: opts.vendorValue ?? true });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `vcfl-${randomUUID()}@example.test`, name: "통합 거래처 목록", roleId });
  return { id: userId, roleId };
}

function tag(): string {
  return `목록${randomUUID().slice(0, 8)}`;
}

async function seedVendor(name: string, customFields: Record<string, unknown>): Promise<string> {
  const row = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.normalize("NFC").toLowerCase(), customFields });
  return row.id;
}

async function setArchived(key: string, archived: boolean): Promise<void> {
  await db
    .update(fieldDefinitions)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(fieldDefinitions.entity, "vendor"), eq(fieldDefinitions.key, key)));
}

async function ids(viewer: Viewer, opts: Parameters<typeof listVendors>[1]): Promise<string[]> {
  return (await listVendors(viewer, opts)).map((vendor) => vendor.id).sort();
}

describe("거래처 검색 — 추가 칸 텍스트 값 (D-7522)", () => {
  it("보이는 계급은 칸 값으로 찾고, 끈 계급 · 바깥 문 꺼진 계급 · 보관 칸은 0건이며 복원하면 다시 찾는다", async () => {
    const a = await makeViewer();
    const b = await makeViewer();
    const c = await makeViewer();
    const field = await seedCustomFieldDefinition("vendor", { label: `칸${tag()}`, type: "text" }, { visibleRoleIds: [a.roleId ?? "", b.roleId ?? ""] });
    const value = `장소${tag()}`;
    const id = await seedVendor(`이름${tag()}`, { [field.key]: value });

    expect(await ids(a, { q: value })).toEqual([id]);
    expect(await ids(c, { q: value })).toEqual([]);

    await upsertVisibility(SYSTEM_VIEWER, { roleId: b.roleId ?? "", infoItem: "vendor.value", visible: false });
    expect(await ids(b, { q: value })).toEqual([]);

    await setArchived(field.key, true);
    expect(await ids(a, { q: value })).toEqual([]);
    await setArchived(field.key, false);
    expect(await ids(a, { q: value })).toEqual([id]);
  });

  it("`%`는 글자 그대로 찾는다 — 「50%」로 찾으면 「50%」가 든 행만", async () => {
    const a = await makeViewer();
    const field = await seedCustomFieldDefinition("vendor", { label: `칸${tag()}`, type: "text" }, { visibleRoleIds: [a.roleId ?? ""] });
    const t = tag();
    const pct = await seedVendor(`이름${tag()}`, { [field.key]: `${t}50%할인` });
    await seedVendor(`이름${tag()}`, { [field.key]: `${t}500할인` });
    expect(await ids(a, { q: `${t}50%` })).toEqual([pct]);
  });

  it("숫자 · 선택 칸 값은 검색에 걸리지 않고, 추가 칸 0개 계급의 결과는 이름으로 찾은 결과와 같다", async () => {
    const a = await makeViewer();
    const none = await makeViewer();
    const number = await seedCustomFieldDefinition("vendor", { label: `칸${tag()}`, type: "number" }, { visibleRoleIds: [a.roleId ?? ""] });
    const text = await seedCustomFieldDefinition("vendor", { label: `칸${tag()}`, type: "text" }, { visibleRoleIds: [a.roleId ?? ""] });
    const t = tag();
    const byName = await seedVendor(`${t}-이름`, { [text.key]: "다른값" });
    await seedVendor(`이름${tag()}`, { [text.key]: `${t}-값`, [number.key]: 98765 });
    expect(await ids(none, { q: t })).toEqual([byName]);
    expect(await ids(a, { q: "98765" })).toEqual([]);
    expect(await ids(a, { q: t })).toHaveLength(2);
  });
});

describe("거래처 선택 칸 거르개 (D-7510)", () => {
  async function selectField(roleIds: string[]) {
    const field = await seedCustomFieldDefinition("vendor", { label: `칸${tag()}`, type: "select", options: ["서울", "부산", "대구"] }, { visibleRoleIds: roleIds });
    // 대구는 보관 선택지 — 활성 선택지에서 빼고 보관 목록으로
    await db
      .update(fieldDefinitions)
      .set({ options: ["서울", "부산"], archivedOptions: ["대구"] })
      .where(and(eq(fieldDefinitions.entity, "vendor"), eq(fieldDefinitions.key, field.key)));
    return field;
  }

  it("활성 선택지 값만 거르고, 보관 선택지 · 모르는 키 · 안 보이는 칸 파라미터는 무시(전체)하며 count도 같다", async () => {
    const a = await makeViewer();
    const c = await makeViewer();
    const field = await selectField([a.roleId ?? ""]);
    const t = tag();
    const seoul = await seedVendor(`${t}-서울`, { [field.key]: "서울" });
    const busan = await seedVendor(`${t}-부산`, { [field.key]: "부산" });
    const daegu = await seedVendor(`${t}-대구`, { [field.key]: "대구" });
    const all = [seoul, busan, daegu].sort();

    expect(await ids(a, { q: t, custom: { [field.key]: "서울" } })).toEqual([seoul]);
    expect(await countVendors(a, { q: t, custom: { [field.key]: "서울" } })).toBe(1);
    expect(await ids(a, { q: t, custom: { [field.key]: "대구" } })).toEqual(all);
    expect(await ids(a, { q: t, custom: { cf_unknown00: "서울" } })).toEqual(all);
    // 안 보이는 계급이 같은 파라미터를 보내도 빈 결과로 존재를 알리지 않는다
    expect(await ids(c, { q: t, custom: { [field.key]: "서울" } })).toEqual(all);
    expect(await countVendors(c, { q: t, custom: { [field.key]: "서울" } })).toBe(3);
  });

  it("보관한 칸의 거르개 파라미터는 무시하고 복원하면 다시 건다", async () => {
    const a = await makeViewer();
    const field = await selectField([a.roleId ?? ""]);
    const t = tag();
    const seoul = await seedVendor(`${t}-서울`, { [field.key]: "서울" });
    const busan = await seedVendor(`${t}-부산`, { [field.key]: "부산" });
    await setArchived(field.key, true);
    expect(await ids(a, { q: t, custom: { [field.key]: "서울" } })).toEqual([seoul, busan].sort());
    await setArchived(field.key, false);
    expect(await ids(a, { q: t, custom: { [field.key]: "서울" } })).toEqual([seoul]);
  });

  it("거르개 상한은 정렬 순서 앞 2개 — 셋째 선택 칸 파라미터는 무시", async () => {
    const a = await makeViewer();
    const first = await seedCustomFieldDefinition("vendor", { label: `칸${tag()}`, type: "select", options: ["가"], sortOrder: 1 }, { visibleRoleIds: [a.roleId ?? ""] });
    await seedCustomFieldDefinition("vendor", { label: `칸${tag()}`, type: "select", options: ["가"], sortOrder: 2 }, { visibleRoleIds: [a.roleId ?? ""] });
    const third = await seedCustomFieldDefinition("vendor", { label: `칸${tag()}`, type: "select", options: ["가"], sortOrder: 3 }, { visibleRoleIds: [a.roleId ?? ""] });
    const t = tag();
    const hit = await seedVendor(`${t}-가`, { [third.key]: "가" });
    const miss = await seedVendor(`${t}-나`, { [first.key]: "가" });
    expect(await ids(a, { q: t, custom: { [third.key]: "가" } })).toEqual([hit, miss].sort());
  });
});
