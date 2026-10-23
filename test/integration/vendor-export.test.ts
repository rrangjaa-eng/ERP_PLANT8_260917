import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID, DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { upsertVisibility } from "@/repositories/permissions";
import { queryActionLog } from "@/repositories/action-log";
import { EXPORT_REGISTRY } from "@/lib/actions/registry";
import { createVendor, listVendors, ForbiddenError } from "@/domain/vendors";
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
