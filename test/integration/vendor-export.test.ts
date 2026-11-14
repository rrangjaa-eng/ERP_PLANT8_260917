import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID, DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { fieldDefinitions } from "@/db/schema";
import { and } from "drizzle-orm";
import { seedCustomFieldDefinition } from "../support/custom-fields";
import { queryActionLog } from "@/repositories/action-log";
import { EXPORT_REGISTRY } from "@/lib/actions/registry";
import { createVendor, listVendors, ForbiddenError, type VendorDto } from "@/domain/vendors";
import { exportVendorsCsv, VendorExportTooManyError } from "@/domain/vendors/export";

// 07-20 V1 · V2 · D-736: 거래처 검색(`q`) · 파일 받기(CSV — 뒤 4자리 · 수식 방어 · 상한 5,000 · excel_export 기록).

async function makeUser(roleId: string): Promise<Viewer> {
  const id = `vendor-export-${randomUUID()}`;
  await db.insert(users).values({ id, name: "거래처 내려받기", email: `${randomUUID()}@test.local`, roleId });
  return { id, roleId };
}

function tag(): string {
  return `검색-${randomUUID().slice(0, 8)}`;
}

// 실행마다 다른 「2」로 시작하는 유효 사업자 번호(xxx-xx-xxxxx) — 같은 DB를 다시 써도 중복 막기에 안 걸린다.
function uniqueBizNoWith2(): string {
  const nine = `2${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((acc, w, i) => acc + Number(nine[i]) * w, 0) + Math.floor((Number(nine[8]) * 5) / 10);
  const digits = `${nine}${(10 - (sum % 10)) % 10}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

describe("거래처 검색 q (07-20 V2)", () => {
  it("이름 포함 · 사업자 번호 숫자 포함 · 갈래 필터와 함께", async () => {
    const t = tag();
    const { vendor: a } = await createVendor(SYSTEM_VIEWER, { name: `${t}-플랜에이트`, kind: "supplier", businessNo: "214-86-10232" });
    const { vendor: b } = await createVendor(SYSTEM_VIEWER, { name: `${t}-다른곳`, kind: "client" });
    const byName = await listVendors(SYSTEM_VIEWER, { q: `${t}-플랜` });
    expect(byName.map((v) => v.id)).toEqual([a.id]);
    const byNo = await listVendors(SYSTEM_VIEWER, { q: "214-86" });
    expect(byNo.map((v) => v.id)).toContain(a.id);
    expect(byNo.map((v) => v.id)).not.toContain(b.id);
    expect((await listVendors(SYSTEM_VIEWER, { q: t, kind: "client" })).map((v) => v.id)).toEqual([b.id]);
    expect((await listVendors(SYSTEM_VIEWER, { q: t })).map((v) => v.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("글자와 숫자가 섞인 검색어(`제2공장`)는 이름으로만 찾는다 — 사업자 번호 숫자를 끌어오지 않는다(게이트 P2)", async () => {
    const t = tag();
    const bizNo = uniqueBizNoWith2();
    const { vendor: plant } = await createVendor(SYSTEM_VIEWER, { name: `${t}-제2공장` });
    const { vendor: other } = await createVendor(SYSTEM_VIEWER, { name: `${t}-무관`, businessNo: bizNo });
    const ids = (await listVendors(SYSTEM_VIEWER, { q: "제2공장" })).map((v) => v.id);
    expect(ids).toContain(plant.id);
    expect(ids).not.toContain(other.id);
  });

  it("사업자 번호는 숫자 · 하이픈만인 검색어로 앞부분 일치만 — 가운데 숫자로는 안 걸린다", async () => {
    const t = tag();
    const bizNo = uniqueBizNoWith2();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `${t}-번호`, businessNo: bizNo });
    expect((await listVendors(SYSTEM_VIEWER, { q: bizNo.slice(0, 6) })).map((v) => v.id)).toContain(vendor.id);
    expect((await listVendors(SYSTEM_VIEWER, { q: bizNo.replace(/-/g, "").slice(0, 5) })).map((v) => v.id)).toContain(vendor.id);
    expect((await listVendors(SYSTEM_VIEWER, { q: bizNo.replace(/-/g, "").slice(3, 9) })).map((v) => v.id)).not.toContain(vendor.id);
  });

  it("`%` · `_`는 와일드카드가 아니다", async () => {
    const t = tag();
    const { vendor: pct } = await createVendor(SYSTEM_VIEWER, { name: `${t}-100%할인` });
    await createVendor(SYSTEM_VIEWER, { name: `${t}-100X할인` });
    const { vendor: under } = await createVendor(SYSTEM_VIEWER, { name: `${t}-a_b` });
    await createVendor(SYSTEM_VIEWER, { name: `${t}-axb` });
    expect((await listVendors(SYSTEM_VIEWER, { q: `${t}-100%` })).map((v) => v.id)).toEqual([pct.id]);
    expect((await listVendors(SYSTEM_VIEWER, { q: `${t}-a_b` })).map((v) => v.id)).toEqual([under.id]);
  });
});

describe("거래처 파일 받기 (07-20 V1 · D-736)", () => {
  it("머리글 9칸 · 계좌번호 뒤 4자리(해제 권한이 있어도) · 수식 방어 · excel_export 한 줄", async () => {
    const admin = await makeUser(SYSADMIN_ROLE_ID);
    await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: "vendor.account_number_unmasked", visible: true });
    const t = tag();
    await createVendor(SYSTEM_VIEWER, {
      name: `${t}-정상`,
      kind: "supplier",
      paymentTermDays: 30,
      accountBank: "신한",
      accountHolder: "홍길동",
      accountNumber: "110-222-341234",
    });
    await createVendor(SYSTEM_VIEWER, { name: `=cmd|' /C calc'!A0 ${t}`, kind: "client" });

    const file = await exportVendorsCsv(admin, { q: t, includeHidden: false, kind: null });
    expect(file.contentType).toBe("text/csv; charset=utf-8");
    const lines = file.body.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("이름,갈래,사업자 번호,지급 기한,계좌 은행,예금주,계좌번호,기본 증빙 종류,숨김");
    expect(lines).toHaveLength(3);
    const normal = lines.find((line) => line.startsWith(`${t}-정상`));
    expect(normal).toBe(`${t}-정상,협력사,,30,신한,홍길동,····1234,,`);
    expect(file.body).not.toContain("110222341234");
    expect(file.body).not.toContain("110-222-341234");
    expect(lines.some((line) => line.startsWith("'=cmd"))).toBe(true);

    const logs = (await queryActionLog(SYSTEM_VIEWER, { actorId: admin.id, actionType: "excel_export" })).filter((row) => row.entity === "vendor");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toMatchObject({ filter: { q: t, includeHidden: false, kind: null }, count: 2 });
  });

  it("5,001곳이면 VendorExportTooManyError(D-736) — 기록 없음", async () => {
    const admin = await makeUser(SYSADMIN_ROLE_ID);
    await expect(
      exportVendorsCsv(admin, { q: "", includeHidden: false, kind: null }, { countVendors: () => Promise.resolve(5001) }),
    ).rejects.toBeInstanceOf(VendorExportTooManyError);
    expect(await queryActionLog(SYSTEM_VIEWER, { actorId: admin.id, actionType: "excel_export" })).toHaveLength(0);
  });

  it("센 뒤 읽은 행이 5,001곳이면(사이에 늘어남) VendorExportTooManyError — 기록 없음", async () => {
    const admin = await makeUser(SYSADMIN_ROLE_ID);
    const many = Array.from({ length: 5001 }, () => ({}) as VendorDto);
    await expect(
      exportVendorsCsv(admin, { q: "", includeHidden: false, kind: null }, { countVendors: () => Promise.resolve(1), listVendors: () => Promise.resolve(many) }),
    ).rejects.toBeInstanceOf(VendorExportTooManyError);
    expect(await queryActionLog(SYSTEM_VIEWER, { actorId: admin.id, actionType: "excel_export" })).toHaveLength(0);
  });

  it("거래처 보기 권한이 없으면 ForbiddenError", async () => {
    const plain = await makeUser(DEFAULT_ROLE_ID);
    await expect(exportVendorsCsv(plain, { q: "", includeHidden: false, kind: null })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("숨김 거래처는 includeHidden일 때만 · 숨김 칸 `숨김`", async () => {
    const admin = await makeUser(SYSADMIN_ROLE_ID);
    const t = tag();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `${t}-숨김` });
    await db.update(vendors).set({ hidden: true }).where(eq(vendors.id, vendor.id));
    expect((await exportVendorsCsv(admin, { q: t, includeHidden: false, kind: null })).body).not.toContain(`${t}-숨김`);
    const body = (await exportVendorsCsv(admin, { q: t, includeHidden: true, kind: null })).body;
    expect(body).toContain(`${t}-숨김,둘 다,,,,,,,숨김`);
  });

  it("EXPORT_REGISTRY에 vendors.export(메뉴 admin.vendors · VendorDto)가 있다", () => {
    expect(EXPORT_REGISTRY).toContainEqual({ name: "vendors.export", menu: "admin.vendors", dtoName: "VendorDto" });
  });
});

// 07.5-01 D-7511 · T-07.5-01-03/05/06: 파일 받기 CSV는 9칸 뒤에 보이는 활성 추가 칸 전부(상한 없음)를 정렬 순서로 싣는다.
const BASE_HEADER = "이름,갈래,사업자 번호,지급 기한,계좌 은행,예금주,계좌번호,기본 증빙 종류,숨김";

async function exporter(opts: { vendorValue?: boolean } = {}): Promise<Viewer> {
  const roleId = `role-vexp-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `내려받기${roleId.slice(-8)}`, sortOrder: 99 });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "admin.vendors", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "vendor.value", visible: opts.vendorValue ?? true });
  const id = `vendor-export-${randomUUID()}`;
  await db.insert(users).values({ id, name: "거래처 내려받기 추가 칸", email: `${randomUUID()}@test.local`, roleId });
  return { id, roleId };
}

async function seedPlainVendor(name: string, customFields: Record<string, unknown>): Promise<string> {
  const row = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), customFields });
  return row.id;
}

describe("거래처 파일 받기 — 추가 칸 열 (07.5-01 D-7511)", () => {
  it("보이는 칸 전부(4개 이상도)를 정렬 순서로 · 숫자는 쉼표 · 반올림 없이 · 날짜는 앞 10자 · 수식은 이스케이프 · 값 없음은 빈 칸", async () => {
    const a = await exporter();
    const roleIds = [a.roleId ?? ""];
    const text = await seedCustomFieldDefinition("vendor", { label: "CSV텍스트", type: "text", sortOrder: 1 }, { visibleRoleIds: roleIds });
    const num = await seedCustomFieldDefinition("vendor", { label: "CSV숫자", type: "number", sortOrder: 2 }, { visibleRoleIds: roleIds });
    const date = await seedCustomFieldDefinition("vendor", { label: "CSV날짜", type: "date", sortOrder: 3 }, { visibleRoleIds: roleIds });
    const pick = await seedCustomFieldDefinition("vendor", { label: "CSV선택", type: "select", options: ["서울", "부산"], sortOrder: 4 }, { visibleRoleIds: roleIds });
    const t = tag();
    await seedPlainVendor(`${t}-정상`, {
      [text.key]: "=SUM(A1)",
      [num.key]: 1234.5,
      [date.key]: "2026-11-04T00:00:00.000Z",
      [pick.key]: "서울",
    });
    await seedPlainVendor(`${t}-없음`, {});
    // 숫자가 아닌 옛 값(07.5 밖 쓰기 경로) — 이스케이프를 건너뛰지 않는다
    await seedPlainVendor(`${t}-옛값`, { [num.key]: "=1+1" });

    const file = await exportVendorsCsv(a, { q: t, includeHidden: false, kind: null });
    const lines = file.body.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(`${BASE_HEADER},CSV텍스트,CSV숫자,CSV날짜,CSV선택`);
    expect(lines.find((line) => line.startsWith(`${t}-정상`))).toBe(`${t}-정상,둘 다,,,,,,,,'=SUM(A1),1234.5,2026-11-04,서울`);
    expect(lines.find((line) => line.startsWith(`${t}-없음`))).toBe(`${t}-없음,둘 다,,,,,,,,,,,`);
    expect(lines.find((line) => line.startsWith(`${t}-옛값`))).toContain(",'=1+1,");
  });

  it("끈 계급 · 바깥 문 꺼진 계급 · 보관 칸 — 머리글도 값도 없다", async () => {
    const a = await exporter();
    const hiddenRole = await exporter();
    const noOuter = await exporter({ vendorValue: false });
    const field = await seedCustomFieldDefinition("vendor", { label: "CSV비밀", type: "text" }, { visibleRoleIds: [a.roleId ?? "", noOuter.roleId ?? ""] });
    const t = tag();
    await seedPlainVendor(`${t}-비밀`, { [field.key]: "숨은값XYZ" });

    expect((await exportVendorsCsv(a, { q: t, includeHidden: false, kind: null })).body).toContain("숨은값XYZ");
    for (const viewer of [hiddenRole, noOuter]) {
      const body = (await exportVendorsCsv(viewer, { q: t, includeHidden: false, kind: null })).body;
      expect(body).not.toContain("CSV비밀");
      expect(body).not.toContain("숨은값XYZ");
    }
    await db.update(fieldDefinitions).set({ archivedAt: new Date() }).where(and(eq(fieldDefinitions.entity, "vendor"), eq(fieldDefinitions.key, field.key)));
    const archived = (await exportVendorsCsv(a, { q: t, includeHidden: false, kind: null })).body;
    expect(archived).not.toContain("CSV비밀");
    expect(archived).not.toContain("숨은값XYZ");
  });

  it("칸 0개면 머리글 9칸 그대로", async () => {
    const none = await exporter();
    const t = tag();
    await seedPlainVendor(`${t}-빈`, {});
    const lines = (await exportVendorsCsv(none, { q: t, includeHidden: false, kind: null })).body.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(BASE_HEADER);
  });

  it("거르개(custom)는 목록과 같은 행 수 — excel_export 기록에는 거르개만 싣고 행 값은 싣지 않는다", async () => {
    const a = await exporter();
    const field = await seedCustomFieldDefinition("vendor", { label: "CSV지역", type: "select", options: ["서울", "부산"] }, { visibleRoleIds: [a.roleId ?? ""] });
    const t = tag();
    await seedPlainVendor(`${t}-서울`, { [field.key]: "서울" });
    await seedPlainVendor(`${t}-부산`, { [field.key]: "부산" });
    const filter = { q: t, includeHidden: false, kind: null, custom: { [field.key]: "서울" } };
    const file = await exportVendorsCsv(a, filter);
    const lines = file.body.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines).toHaveLength(1 + (await listVendors(a, filter)).length);

    const logs = (await queryActionLog(SYSTEM_VIEWER, { actorId: a.id, actionType: "excel_export" })).filter((row) => row.entity === "vendor");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toMatchObject({ filter: { custom: { [field.key]: "서울" } }, count: 1 });
    expect(JSON.stringify(logs[0]?.detail)).not.toContain(`${t}-서울`);
  });
  it("excel_export 기록에는 적용된 거르개만 — 모르는 키 · 선택지 밖 값은 싣지 않는다", async () => {
    const a = await exporter();
    const field = await seedCustomFieldDefinition("vendor", { label: "로그지역", type: "select", options: ["서울", "부산"] }, { visibleRoleIds: [a.roleId ?? ""] });
    const t = tag();
    await seedPlainVendor(`${t}-서울`, { [field.key]: "서울" });
    await exportVendorsCsv(a, { q: t, includeHidden: false, kind: null, custom: { [field.key]: "없는선택지", cf_unknown00: "서울" } });
    const logs = (await queryActionLog(SYSTEM_VIEWER, { actorId: a.id, actionType: "excel_export" })).filter((row) => row.entity === "vendor");
    expect(logs).toHaveLength(1);
    const text = JSON.stringify(logs[0]?.detail);
    expect(text).not.toContain("cf_unknown00");
    expect(text).not.toContain("없는선택지");
    expect(text).not.toContain(field.key);
  });
});
