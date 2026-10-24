import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { withTransaction } from "@/lib/db-transaction";
import {
  businessNoProblem,
  createVendor,
  DuplicateBusinessNoError,
  ForbiddenError,
  markVendorConfirmed,
  pickExistingVendorFromWork,
  registerVendorFromWork,
  unmarkVendorConfirmed,
} from "@/domain/vendors";
import { AccountFieldsError } from "@/domain/vendors/account-fields";
import { ensureVendorsForLines } from "@/domain/evidence-import/vendor-autocreate";
import { EVIDENCE_FORMATS } from "@/domain/evidence-import/registry";
import { insertRole } from "@/repositories/roles";
import { insertVendor, setVendorArchived, setVendorHidden } from "@/repositories/vendors";
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

// 검증합을 맞춘 사업자번호(숫자 10자리).
function validBusinessNo(): string {
  const digits = `${Math.floor(Math.random() * 9e9) + 1e9}`;
  const valid = Array.from({ length: 10 }, (_, d) => `${digits.slice(0, 9)}${d}`).find((candidate) => businessNoProblem(candidate) === null);
  if (!valid) throw new Error("검증합 번호 없음");
  return valid;
}

// 지출결의 쓰기만 가진 직원(거래처 화면 권한 없음) · 지출결의 쓰기도 없는 사람.
// 07-23 R-1: 계좌 세 칸을 실으려면 `vendors.account` 쓰기도 있어야 한다(account).
async function makeExpenseWriter(opts: { expenses: boolean; account?: boolean }): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `일자리-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  if (opts.expenses) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: true });
  if (opts.account) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "vendors.account", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: true });
  return makePerson(opts.expenses ? "기획사원" : "구경꾼", role.id, null);
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

describe("일하는 자리 등록 (SC-18 · D-745 · K20)", () => {
  it("지출결의 쓰기 + 계좌 쓰기 보유자 → 저장 · 확인 전 · 갈래 없으면 협력사 · 계좌 세 칸 · 행동 로그(거래처 화면 권한 없이)", async () => {
    const staff = await makeExpenseWriter({ expenses: true, account: true });
    const vendor = await registerVendorFromWork(staff, { name: `일자리-${randomUUID()}`, accountBank: "국민", accountHolder: "주식회사 일자리", accountNumber: "123-456-789012" });
    const row = await vendorRow(vendor.id);
    expect(row.confirmedAt).toBeNull();
    expect(row.confirmedBy).toBeNull();
    expect(row.kind).toBe("supplier");
    expect(row.accountBank).toBe("국민");
    expect(row.accountHolder).toBe("주식회사 일자리");
    expect(row.accountNumberLast4).toBe("9012");
    const logs = await db.select().from(actionLog).where(and(eq(actionLog.entityId, vendor.id), eq(actionLog.actorId, staff.id)));
    expect(logs.map((log) => [log.actionType, (log.detail as { source?: string } | null)?.source])).toEqual([["document_create", "workplace"]]);
  });

  // 사용자 결정(10/24 「지금처럼 받기」): 업무 중 등록은 계좌를 그대로 받는다 — 계좌 쓰기가 없어도 실은 칸이 저장된다(10/23 거부 규칙을 이 경로에서만 되돌림).
  it("지출결의 쓰기만(계좌 쓰기 없음) + 계좌 세 칸 → 저장 · 계좌 실림", async () => {
    const staff = await makeExpenseWriter({ expenses: true });
    const vendor = await registerVendorFromWork(staff, { name: `계좌받음-${randomUUID()}`, accountBank: "국민", accountHolder: "주식회사 일자리", accountNumber: "123-456-789012" });
    const row = await vendorRow(vendor.id);
    expect([row.accountBank, row.accountHolder, row.accountNumberLast4]).toEqual(["국민", "주식회사 일자리", "9012"]);
  });

  it("지출결의 쓰기만(계좌 쓰기 없음) + 계좌 칸 없음 → 저장(계좌 비움)", async () => {
    const staff = await makeExpenseWriter({ expenses: true });
    const vendor = await registerVendorFromWork(staff, { name: `계좌없이-${randomUUID()}`, accountBank: " ", accountHolder: "" });
    const row = await vendorRow(vendor.id);
    expect([row.accountBank, row.accountHolder, row.accountNumberLast4]).toEqual([null, null, null]);
  });

  it("지출결의 쓰기 없음 → 거부 · 행 없음", async () => {
    const outsider = await makeExpenseWriter({ expenses: false });
    const name = `거부-${randomUUID()}`;
    await expect(registerVendorFromWork(outsider, { name })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(vendors).where(eq(vendors.name, name))).toHaveLength(0);
  });

  it("예금주 없이 은행 · 번호만 → 칸 오류(기존 계좌 판정) · 클라이언트 갈래 → 거부", async () => {
    const staff = await makeExpenseWriter({ expenses: true, account: true });
    await expect(registerVendorFromWork(staff, { name: `예금주-${randomUUID()}`, accountBank: "국민", accountNumber: "123456789012" })).rejects.toBeInstanceOf(AccountFieldsError);
    await expect(registerVendorFromWork(staff, { name: `고객-${randomUUID()}`, kind: "client" })).rejects.toThrow("갈래 선택");
  });

  it("같은 사업자 번호 → 오류에 그 거래처 id · 이름(숨김 · 보관 아님 = 고를 수 있음)", async () => {
    const staff = await makeExpenseWriter({ expenses: true });
    const businessNo = validBusinessNo();
    const existing = await insertVendor(SYSTEM_VIEWER, { name: "이미있음", normalizedName: "이미있음", businessNo, kind: "supplier" });
    const error = await registerVendorFromWork(staff, { name: "새이름", businessNo }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DuplicateBusinessNoError);
    expect((error as DuplicateBusinessNoError).existing).toMatchObject({ id: existing.id, name: "이미있음", hidden: false, archived: false });
    expect((error as DuplicateBusinessNoError).message).toBe("이미 등록됨 · 이미있음");
  });

  it("이미 있는 거래처 고르기 — 협력사 · 둘 다는 그대로, 클라이언트 전용은 둘 다로 올리고 행동 로그, 숨김 · 보관은 고를 수 없음", async () => {
    const staff = await makeExpenseWriter({ expenses: true });
    const supplier = await insertVendor(SYSTEM_VIEWER, { name: "협력", normalizedName: "협력", kind: "supplier" });
    const client = await insertVendor(SYSTEM_VIEWER, { name: "고객만", normalizedName: "고객만", kind: "client" });
    const hidden = await insertVendor(SYSTEM_VIEWER, { name: "숨김", normalizedName: "숨김", kind: "supplier" });
    await setVendorHidden(SYSTEM_VIEWER, hidden.id, true);
    const archived = await insertVendor(SYSTEM_VIEWER, { name: "보관", normalizedName: "보관", kind: "supplier" });
    await setVendorArchived(SYSTEM_VIEWER, archived.id, true);

    expect(await pickExistingVendorFromWork(staff, { id: supplier.id })).toMatchObject({ id: supplier.id, name: "협력" });
    expect((await vendorRow(supplier.id)).version).toBe(supplier.version);

    await pickExistingVendorFromWork(staff, { id: client.id });
    expect((await vendorRow(client.id)).kind).toBe("both");
    const logs = await db.select().from(actionLog).where(eq(actionLog.entityId, client.id));
    expect(logs.map((log) => [log.actionType, log.detail])).toEqual([["document_update", { source: "workplace", kind: { from: "client", to: "both" } }]]);

    await expect(pickExistingVendorFromWork(staff, { id: hidden.id })).rejects.toThrow("고를 수 없는 거래처");
    await expect(pickExistingVendorFromWork(staff, { id: archived.id })).rejects.toThrow("고를 수 없는 거래처");
    const outsider = await makeExpenseWriter({ expenses: false });
    await expect(pickExistingVendorFromWork(outsider, { id: supplier.id })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
