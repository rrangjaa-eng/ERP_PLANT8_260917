import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, expensePayments, expenses, files, users, vendorAccountChanges, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { recordAction } from "@/domain/action-log/record";
import { createVendor, updateVendor, VendorVersionConflictError } from "@/domain/vendors";
import { accountChangedSinceLastPayment, listAccountChanges } from "@/domain/vendors/account-changes";
import { cancelExpensePayment, getPaymentView, previewPayable } from "@/domain/payments";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { listPaymentTargets } from "@/domain/payments/targets";
import { approveDocument } from "@/domain/approvals";
import { voidEvidence } from "@/domain/evidence";
import { changeExpensePayeeUser, createExpenseFromLines } from "@/domain/expenses";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";
import { addApprovedRevision, makeEvidenceManager, setupExpenseProject, submitReadyDraft, testVendorAccount, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 07-23 Task 1(V9 · AQ-35 · AQ-36 · N2): 거래처 계좌 변경 기록(같은 트랜잭션 · 뒤 4자리만) · 지급 뒤 해제 · 지급 대상 DTO 두 칸.

beforeEach(async () => {
  await setEvidenceRequired(false);
});

// 거래처 관리 + 계좌 수정(vendors.account) + 거래처 정보 보임 — 경영관리 몫.
async function makeVendorManager(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `거래처-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  for (const menu of ["admin.vendors", "vendors.account"]) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action: "write", allowed: true });
  }
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: true });
  return makePerson("거래처관리", role.id, null);
}

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager();
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount", "vendor.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function versionOfVendor(id: string): Promise<number> {
  const [row] = await db.select({ version: vendors.version }).from(vendors).where(eq(vendors.id, id));
  if (!row) throw new Error("거래처 없음");
  return row.version;
}

async function changesOf(vendorId: string) {
  return db.select().from(vendorAccountChanges).where(eq(vendorAccountChanges.vendorId, vendorId));
}

async function accountVendor(manager: Viewer) {
  const { vendor } = await createVendor(manager, {
    name: `계좌거래처-${randomUUID()}`,
    kind: "supplier",
    accountBank: "신한은행",
    accountHolder: "홍길동",
    accountNumber: "110123451234",
  });
  return vendor;
}

describe("계좌 변경 기록 (V9 · AQ-35)", () => {
  it("계좌번호를 바꾸면 같은 저장에서 뒤 4자리 전후 · 바꾼 사람 · source admin 한 줄 — 원값은 기록 · 행동 로그 어디에도 없다", async () => {
    const manager = await makeVendorManager();
    const vendor = await accountVendor(manager);

    await updateVendor(manager, vendor.id, { name: vendor.name, accountNumber: "220987655678", expectedVersion: vendor.version });

    const rows = await changesOf(vendor.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ beforeLast4: "1234", afterLast4: "5678", changedBy: manager.id, source: "admin" });
    const logs = await db.select().from(actionLog).where(and(eq(actionLog.actionType, "vendor_account_change"), eq(actionLog.entityId, vendor.id)));
    expect(logs).toHaveLength(1);
    const dump = JSON.stringify({ rows, logs });
    expect(dump).not.toContain("110123451234");
    expect(dump).not.toContain("220987655678");

    const history = await listAccountChanges(manager, vendor.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ beforeLast4: "1234", afterLast4: "5678", changedByName: "거래처관리" });
  });

  it("이름만 바꿈 → 기록 없음 / 처음 계좌 입력(전 값 없음) → 기록 없음", async () => {
    const manager = await makeVendorManager();
    const vendor = await accountVendor(manager);
    await updateVendor(manager, vendor.id, { name: `${vendor.name}-새이름`, expectedVersion: vendor.version });
    expect(await changesOf(vendor.id)).toHaveLength(0);

    const { vendor: bare } = await createVendor(manager, { name: `빈계좌-${randomUUID()}`, kind: "supplier" });
    await updateVendor(manager, bare.id, { name: bare.name, accountBank: "신한은행", accountHolder: "홍길동", accountNumber: "110123451234", expectedVersion: bare.version });
    expect(await changesOf(bare.id)).toHaveLength(0);
  });

  it("예금주만 바꿔도 한 줄 — 뒤 4자리는 같다(AQ-35)", async () => {
    const manager = await makeVendorManager();
    const vendor = await accountVendor(manager);
    await updateVendor(manager, vendor.id, { name: vendor.name, accountHolder: "김철수", expectedVersion: vendor.version });
    const rows = await changesOf(vendor.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ beforeLast4: "1234", afterLast4: "1234" });
  });

  it("같은 트랜잭션 — 기록 다음 쓰기가 실패하면 계좌 · 기록 둘 다 남지 않는다 / version 충돌이면 기록 없음", async () => {
    const manager = await makeVendorManager();
    const vendor = await accountVendor(manager);

    await expect(
      updateVendor(
        manager,
        vendor.id,
        { name: vendor.name, accountNumber: "220987655678", expectedVersion: vendor.version },
        {
          recordAction: async (viewer, entry, deps) => {
            if (entry.actionType === "vendor_account_change") throw new Error("기록 실패");
            await recordAction(viewer, entry, deps);
          },
        },
      ),
    ).rejects.toThrow("기록 실패");
    expect(await changesOf(vendor.id)).toHaveLength(0);
    const [stored] = await db.select({ last4: vendors.accountNumberLast4, version: vendors.version }).from(vendors).where(eq(vendors.id, vendor.id));
    expect(stored).toEqual({ last4: "1234", version: vendor.version });

    await expect(updateVendor(manager, vendor.id, { name: vendor.name, accountNumber: "220987655678", expectedVersion: vendor.version - 1 })).rejects.toBeInstanceOf(
      VendorVersionConflictError,
    );
    expect(await changesOf(vendor.id)).toHaveLength(0);
  });
});

async function payNow(payer: Viewer, doc: ApprovedExpense) {
  const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
  const result = await completePaymentsBatch(payer, {
    payDate: seoulToday(),
    rows: [{ expenseId: doc.expenseId, expenseVersion: doc.version, expectedPayableKrw: preview.payableKrw ?? 0 }],
  });
  expect(result.processed).toBe(1);
}

async function changeStageOneAccount(manager: Viewer, fx: ExpenseFixture, number = "220987655678") {
  await updateVendor(manager, fx.stageOneId, { name: "스테이지원", accountNumber: number, expectedVersion: await versionOfVendor(fx.stageOneId) });
}

describe("accountChangedSinceLastPayment (AQ-36)", () => {
  it("변경 뒤 지급 없음 → 참 · 그 거래처로 지급 처리 → 거짓 · 그 지급 취소 → 다시 참", async () => {
    const manager = await makeVendorManager();
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);

    expect([...(await accountChangedSinceLastPayment(payer, [fx.stageOneId]))]).toEqual([]);
    await changeStageOneAccount(manager, fx);
    expect([...(await accountChangedSinceLastPayment(payer, [fx.stageOneId]))]).toEqual([fx.stageOneId]);

    await payNow(payer, doc);
    expect([...(await accountChangedSinceLastPayment(payer, [fx.stageOneId]))]).toEqual([]);

    const [payment] = await db.select().from(expensePayments).where(and(eq(expensePayments.expenseId, doc.expenseId), isNull(expensePayments.cancelledAt)));
    if (!payment) throw new Error("지급 기록 없음");
    const view = await getPaymentView(payer, doc.expenseId);
    await cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "다른 계좌로 다시", version: view?.version ?? 0 });
    expect([...(await accountChangedSinceLastPayment(payer, [fx.stageOneId]))]).toEqual([fx.stageOneId]);
  }, 60_000);
});

// 직원 지급처 문서(줄 거래처는 스테이지원이지만 지급처는 사람) — 거래처 표지 두 칸은 해당 없음.
async function employeePayeeDoc(fx: ExpenseFixture): Promise<ApprovedExpense> {
  const person = await makePerson("직원지급처", DEFAULT_ROLE_ID, "기획1팀");
  await db.update(users).set(testVendorAccount()).where(eq(users.id, person.id));
  const itemName = `직원 줄-${randomUUID().slice(0, 4)}`;
  const { lineIds } = await addApprovedRevision(fx, [{ itemName, vendorId: fx.stageOneId, execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 } }]);
  const lineId = lineIds.get(itemName);
  if (!lineId) throw new Error("줄 없음");
  const expenseId = (await createExpenseFromLines(fx.pm, { lineIds: [lineId] })).created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const [draft] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  await changeExpensePayeeUser(fx.pm, { expenseId, userId: person.id, expectedVersion: draft?.version ?? 0 });
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
  await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
  const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
  const alive = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  for (const file of alive) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
  const [approved] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  return { expenseId, instanceId: submitted.instanceId, number: submitted.number, version: approved?.version ?? 0 };
}

function rowsOf(list: Awaited<ReturnType<typeof listPaymentTargets>>) {
  return list.groups.flatMap((group) => group.rows);
}

describe("지급 대상 DTO vendorConfirmed · accountChanged (N2 · B-P2-5)", () => {
  it("확인 전 거래처 → vendorConfirmed false · 확인됨 + 바뀐 계좌 → true · accountChanged true · 직원 지급처 → 해당 없음 · 표지가 있어도 지급 처리", async () => {
    const manager = await makeVendorManager();
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const staffDoc = await employeePayeeDoc(fx);

    let rows = rowsOf(await listPaymentTargets(payer, {}));
    expect(rows.find((row) => row.id === doc.expenseId)).toMatchObject({ vendorConfirmed: false, accountChanged: false });
    expect(rows.find((row) => row.id === staffDoc.expenseId)).toMatchObject({ vendorConfirmed: true, accountChanged: false });

    await db.update(vendors).set({ confirmedAt: new Date(), confirmedBy: manager.id }).where(eq(vendors.id, fx.stageOneId));
    await changeStageOneAccount(manager, fx);
    rows = rowsOf(await listPaymentTargets(payer, {}));
    const target = rows.find((row) => row.id === doc.expenseId);
    expect(target).toMatchObject({ vendorConfirmed: true, accountChanged: true, selectable: true });
    expect(rows.find((row) => row.id === staffDoc.expenseId)).toMatchObject({ vendorConfirmed: true, accountChanged: false });

    await payNow(payer, doc);
  }, 60_000);
});
