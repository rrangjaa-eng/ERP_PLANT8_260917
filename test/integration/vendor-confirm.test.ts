import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { withTransaction } from "@/lib/db-transaction";
import { businessNoProblem, createVendor, ForbiddenError, markVendorConfirmed, unmarkVendorConfirmed } from "@/domain/vendors";
import { ensureVendorsForLines } from "@/domain/evidence-import/vendor-autocreate";
import { EVIDENCE_FORMATS } from "@/domain/evidence-import/registry";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { makePerson } from "./approvals-fixtures";

// 07-23 Task 2(V4 · N4 · AQ-34): 확인 표시 — 자동 등록은 확인 전, 관리 화면 등록은 확인됨, `확인됨으로 표시` · `되돌리기`는 vendors.account 쓰기만.

async function makeVendorWriter(opts: { account: boolean }): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `확인-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.vendors", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.vendors", action: "write", allowed: true });
  if (opts.account) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "vendors.account", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: true });
  return makePerson(opts.account ? "경영관리" : "거래처담당", role.id, null);
}

async function vendorRow(id: string) {
  const [row] = await db.select().from(vendors).where(eq(vendors.id, id));
  if (!row) throw new Error("거래처 없음");
  return row;
}

// 06.1 증빙 등록이 쓰는 자동 등록 경로 그대로(사업자번호 있는 줄 → 없으면 협력사로 만든다).
async function autocreatedVendorId(): Promise<string> {
  const format = EVIDENCE_FORMATS.find((rule) => rule.createsVendor);
  if (!format) throw new Error("거래처를 만드는 형식 없음");
  const digits = `${Math.floor(Math.random() * 9e9) + 1e9}`;
  // 검증합을 맞춘 번호가 필요하다 — 맞을 때까지 마지막 자리를 고른다.
  const valid = Array.from({ length: 10 }, (_, d) => `${digits.slice(0, 9)}${d}`).find((candidate) => businessNoProblem(candidate) === null);
  if (!valid) throw new Error("검증합 번호 없음");
  const result = await withTransaction((tx) =>
    ensureVendorsForLines(SYSTEM_VIEWER, [{ businessNoDigits: valid, nameOnDocument: `자동-${randomUUID().slice(0, 8)}`, evidenceType: format.evidenceType, needsCheck: null }], format, randomUUID(), tx),
  );
  const id = result.lines[0]?.vendorId;
  if (!id) throw new Error("자동 등록 안 됨");
  return id;
}

describe("확인 표시 (V4)", () => {
  it("자동 등록(06.1) 거래처는 확인 전 — 관리 화면 등록 거래처는 확인됨(시각 · 사람)", async () => {
    const manager = await makeVendorWriter({ account: false });
    const autoId = await autocreatedVendorId();
    expect((await vendorRow(autoId)).confirmedAt).toBeNull();

    const { vendor } = await createVendor(manager, { name: `관리등록-${randomUUID()}`, kind: "supplier" });
    const row = await vendorRow(vendor.id);
    expect(row.confirmedAt).not.toBeNull();
    expect(row.confirmedBy).toBe(manager.id);
  });

  it("markVendorConfirmed → 시각 · 사람 · 행동 로그 · version + 1, 되돌리기 → NULL · 행동 로그 · version + 1", async () => {
    const manager = await makeVendorWriter({ account: true });
    const autoId = await autocreatedVendorId();
    const before = await vendorRow(autoId);

    const marked = await markVendorConfirmed(manager, { id: autoId });
    const after = await vendorRow(autoId);
    expect(after.confirmedAt).not.toBeNull();
    expect(after.confirmedBy).toBe(manager.id);
    expect(after.version).toBe(before.version + 1);
    expect(marked).toEqual({ confirmed: true, version: after.version });

    // 이미 확인됨 — 같은 요청을 다시 보내도(연타) 바뀌지 않는다.
    await markVendorConfirmed(manager, { id: autoId });
    expect((await vendorRow(autoId)).version).toBe(after.version);

    const undone = await unmarkVendorConfirmed(manager, { id: autoId });
    const reverted = await vendorRow(autoId);
    expect(reverted.confirmedAt).toBeNull();
    expect(reverted.confirmedBy).toBeNull();
    expect(reverted.version).toBe(after.version + 1);
    expect(undone).toEqual({ confirmed: false, version: reverted.version });

    const logs = await db.select().from(actionLog).where(and(eq(actionLog.actionType, "vendor_confirm"), eq(actionLog.entityId, autoId)));
    expect(logs.map((log) => (log.detail as { confirmed?: boolean } | null)?.confirmed)).toEqual([true, false]);
    expect(logs.every((log) => log.actorId === manager.id)).toBe(true);
  });

  it("계좌 · 서류 권한(vendors.account 쓰기)이 없으면 거부 — 행 · 로그 없음", async () => {
    const writer = await makeVendorWriter({ account: false });
    const autoId = await autocreatedVendorId();
    const before = await vendorRow(autoId);

    await expect(markVendorConfirmed(writer, { id: autoId })).rejects.toBeInstanceOf(ForbiddenError);
    const row = await vendorRow(autoId);
    expect(row.confirmedAt).toBeNull();
    expect(row.version).toBe(before.version);
    expect(await db.select().from(actionLog).where(and(eq(actionLog.actionType, "vendor_confirm"), eq(actionLog.entityId, autoId)))).toHaveLength(0);
  });
});
