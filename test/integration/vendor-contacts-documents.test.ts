import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { files, vendorContacts, vendorDocuments } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createVendor, updateVendor, VendorVersionConflictError } from "@/domain/vendors";
import { listVendorContacts, VendorContactsError } from "@/domain/vendors/contacts";
import { listVendorDocuments, VENDOR_DOCUMENT_KIND } from "@/domain/vendors/documents";
import { requestVendorDocumentUpload } from "@/domain/vendors/document-upload";
import { completeEvidenceUpload, createEvidenceViewUrl } from "@/domain/evidence";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { makePerson } from "./approvals-fixtures";
import { createMemoryStorage } from "./fakes/memory-storage";

// 07-23 Task 2(V7 · V8 · AQ-34): 거래처 담당자(최대 5명 · 거래처 저장과 같은 트랜잭션 · 같은 version) · 서류 두 자리(교체형 · vendors.account 쓰기만).

// 거래처 관리(admin.vendors 보기 · 쓰기) — account면 계좌 · 서류(vendors.account 쓰기)까지.
async function makeVendorWriter(opts: { account: boolean }): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `거래처-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.vendors", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.vendors", action: "write", allowed: true });
  if (opts.account) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "vendors.account", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: true });
  return makePerson(opts.account ? "경영관리" : "거래처담당", role.id, null);
}

async function liveContacts(vendorId: string) {
  return db
    .select()
    .from(vendorContacts)
    .where(and(eq(vendorContacts.vendorId, vendorId), isNull(vendorContacts.archivedAt)))
    .orderBy(asc(vendorContacts.sortOrder));
}

const contact = (n: number) => ({ name: `담당${n}`, phone: `010-0000-000${n}`, email: `p${n}@example.test` });

describe("거래처 담당자 (V7)", () => {
  it("여섯째 담당자는 거부 — 행이 하나도 생기지 않는다", async () => {
    const writer = await makeVendorWriter({ account: false });
    const { vendor } = await createVendor(writer, { name: `담당자-${randomUUID()}`, kind: "supplier" });

    await expect(
      updateVendor(writer, vendor.id, { name: vendor.name, expectedVersion: vendor.version, contacts: [1, 2, 3, 4, 5, 6].map(contact) }),
    ).rejects.toThrow("담당자 최대 5명");
    await expect(updateVendor(writer, vendor.id, { name: vendor.name, contacts: [1, 2, 3, 4, 5, 6].map(contact) })).rejects.toBeInstanceOf(VendorContactsError);
    expect(await liveContacts(vendor.id)).toHaveLength(0);
  });

  it("넷 저장 → 하나 지우고 저장 → 셋(지운 줄은 보관 · 순서 유지) — 목록은 순서대로", async () => {
    const writer = await makeVendorWriter({ account: false });
    const { vendor } = await createVendor(writer, { name: `담당자-${randomUUID()}`, kind: "supplier" });

    const saved = await updateVendor(writer, vendor.id, { name: vendor.name, expectedVersion: vendor.version, contacts: [1, 2, 3, 4].map(contact) });
    const four = await listVendorContacts(writer, vendor.id);
    expect(four.map((row) => row.name)).toEqual(["담당1", "담당2", "담당3", "담당4"]);
    expect(four[0]).toMatchObject({ phone: "010-0000-0001", email: "p1@example.test" });

    // 담당2를 지우고 담당3의 이메일을 고친다 — 남은 줄은 같은 행(id 유지).
    const kept = four.filter((row) => row.name !== "담당2").map((row) => ({ id: row.id, name: row.name ?? "", phone: row.phone ?? null, email: row.name === "담당3" ? "new3@example.test" : (row.email ?? null) }));
    await updateVendor(writer, vendor.id, { name: vendor.name, expectedVersion: saved?.version, contacts: kept });

    const three = await liveContacts(vendor.id);
    expect(three.map((row) => row.name)).toEqual(["담당1", "담당3", "담당4"]);
    expect(three.map((row) => row.id)).toEqual(kept.map((row) => row.id));
    expect(three.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
    expect(three[1]?.email).toBe("new3@example.test");
    const archived = await db.select().from(vendorContacts).where(and(eq(vendorContacts.vendorId, vendor.id), eq(vendorContacts.name, "담당2")));
    expect(archived).toHaveLength(1);
    expect(archived[0]?.archivedAt).not.toBeNull();
    expect(archived[0]?.archivedBy).toBe(writer.id);
  });

  it("이름 빈 줄 · 이메일 형식 틀림은 거부", async () => {
    const writer = await makeVendorWriter({ account: false });
    const { vendor } = await createVendor(writer, { name: `담당자-${randomUUID()}`, kind: "supplier" });
    await expect(updateVendor(writer, vendor.id, { name: vendor.name, contacts: [{ name: "  ", phone: null, email: null }] })).rejects.toBeInstanceOf(VendorContactsError);
    await expect(updateVendor(writer, vendor.id, { name: vendor.name, contacts: [{ name: "김", phone: null, email: "not-mail" }] })).rejects.toBeInstanceOf(VendorContactsError);
    expect(await liveContacts(vendor.id)).toHaveLength(0);
  });

  it("거래처 version 충돌이면 담당자도 저장되지 않는다", async () => {
    const writer = await makeVendorWriter({ account: false });
    const { vendor } = await createVendor(writer, { name: `담당자-${randomUUID()}`, kind: "supplier" });
    await updateVendor(writer, vendor.id, { name: `${vendor.name}-다른 사람`, expectedVersion: vendor.version });

    await expect(updateVendor(writer, vendor.id, { name: vendor.name, expectedVersion: vendor.version, contacts: [contact(1)] })).rejects.toBeInstanceOf(VendorVersionConflictError);
    expect(await liveContacts(vendor.id)).toHaveLength(0);
  });

  it("contacts를 보내지 않은 저장은 담당자를 건드리지 않는다 · 등록에서도 담당자를 받는다", async () => {
    const writer = await makeVendorWriter({ account: false });
    const { vendor } = await createVendor(writer, { name: `담당자-${randomUUID()}`, kind: "supplier", contacts: [contact(1), contact(2)] });
    expect((await liveContacts(vendor.id)).map((row) => row.name)).toEqual(["담당1", "담당2"]);

    await updateVendor(writer, vendor.id, { name: `${vendor.name}-이름만` });
    expect((await liveContacts(vendor.id)).map((row) => row.name)).toEqual(["담당1", "담당2"]);
  });
});

async function attach(viewer: Viewer, vendorId: string, kind: "registration" | "bankbook", name: string) {
  const storage = createMemoryStorage();
  const declared = { size: 120_000, contentType: "application/pdf", sha256: randomBytes(32).toString("hex"), name };
  const intent = await requestVendorDocumentUpload(viewer, { vendorId, kind, ...declared }, { storage });
  storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
  return completeEvidenceUpload(viewer, { intentId: intent.intentId }, { storage });
}

async function liveFilesOfVendor(vendorId: string) {
  return db
    .select({ fileId: files.id, kind: vendorDocuments.kind, name: files.originalName })
    .from(files)
    .innerJoin(vendorDocuments, eq(vendorDocuments.id, files.ownerId))
    .where(and(eq(files.ownerKind, VENDOR_DOCUMENT_KIND), eq(vendorDocuments.vendorId, vendorId), isNull(files.removedAt)));
}

describe("거래처 서류 (V8 · AQ-34)", () => {
  it("계좌 · 서류 권한자: 사업자등록증 붙이기 → 한 자리, 다시 붙이기 → 이전 서류 · 파일이 함께 떨어지고 살아 있는 하나, 통장 사본은 따로", async () => {
    const manager = await makeVendorWriter({ account: true });
    const { vendor } = await createVendor(manager, { name: `서류-${randomUUID()}`, kind: "supplier" });

    const first = await attach(manager, vendor.id, "registration", "등록증1.pdf");
    let list = await listVendorDocuments(manager, vendor.id);
    expect(list?.canWrite).toBe(true);
    if (!list?.canWrite) throw new Error("권한자 목록이 아님");
    expect(list.slots.map((slot) => [slot.kind, slot.file?.name ?? null])).toEqual([
      ["registration", "등록증1.pdf"],
      ["bankbook", null],
    ]);

    const second = await attach(manager, vendor.id, "registration", "등록증2.pdf");
    await attach(manager, vendor.id, "bankbook", "통장.pdf");

    const live = await liveFilesOfVendor(vendor.id);
    expect(live.map((row) => [row.kind, row.name]).sort()).toEqual([
      ["bankbook", "통장.pdf"],
      ["registration", "등록증2.pdf"],
    ]);
    const [firstFile] = await db.select({ removedAt: files.removedAt }).from(files).where(eq(files.id, first.id ?? ""));
    expect(firstFile?.removedAt).not.toBeNull();
    const liveDocs = await db
      .select()
      .from(vendorDocuments)
      .where(and(eq(vendorDocuments.vendorId, vendor.id), eq(vendorDocuments.kind, "registration"), isNull(vendorDocuments.removedAt)));
    expect(liveDocs).toHaveLength(1);

    list = await listVendorDocuments(manager, vendor.id);
    if (!list?.canWrite) throw new Error("권한자 목록이 아님");
    expect(list.slots.map((slot) => slot.file?.fileId ?? null)).toEqual([second.id, expect.any(String)]);
  });

  it("계좌 권한 없는 거래처 쓰기 보유자: 붙이기 · 파일 보기 거부, 목록은 개수만", async () => {
    const manager = await makeVendorWriter({ account: true });
    const writer = await makeVendorWriter({ account: false });
    const { vendor } = await createVendor(manager, { name: `서류-${randomUUID()}`, kind: "supplier" });
    const file = await attach(manager, vendor.id, "registration", "등록증.pdf");
    await attach(manager, vendor.id, "bankbook", "통장.pdf");

    const before = (await db.select().from(vendorDocuments).where(eq(vendorDocuments.vendorId, vendor.id))).length;
    await expect(attach(writer, vendor.id, "bankbook", "몰래.pdf")).rejects.toThrow();
    expect((await db.select().from(vendorDocuments).where(eq(vendorDocuments.vendorId, vendor.id))).length).toBe(before);

    expect(await createEvidenceViewUrl(writer, { fileId: file.id ?? "" }, { storage: createMemoryStorage() }).catch(() => null)).toBeNull();
    expect(await listVendorDocuments(writer, vendor.id)).toEqual({ canWrite: false, count: 2 });
  });
});
