import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { expenses, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { markVendorConfirmed, unmarkVendorConfirmed } from "@/domain/vendors";
import { completeExpensePayment, getPaymentView, previewPayable } from "@/domain/payments";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { exportBankTransferFile } from "@/domain/payments/bank-transfer";
import { listPaymentTargets } from "@/domain/payments/targets";
import { VENDOR_UNCONFIRMED } from "@/domain/payments/action-row";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";
import { setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 2026-10-24 사용자 결정(G13 일부 변경): 지급처 거래처가 「확인 전」(confirmed_at NULL)이면 지급을 서버에서 막는다 —
// 지급 대상 선택 · 이체 파일 · 지급 완료(단건 · 일괄) 모두. 확인하면 통과, 확인을 되돌리면 다시 막힌다.

beforeEach(async () => {
  await setEvidenceRequired(false);
});

async function makeVendorManager(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `거래처-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  for (const menu of ["admin.vendors", "vendors.account"]) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action: "write", allowed: true });
  }
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: true });
  return makePerson("거래처관리", role.id, null);
}

// 지급 처리 + 이체 파일(계좌 해제 항목) 권한자.
async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager();
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount", "vendor.value", "vendor.account_number_unmasked"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  }
  return payer;
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function snapshotOf(payer: Viewer, doc: ApprovedExpense) {
  const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
  if (typeof preview.payableKrw !== "number") throw new Error("지급 총액 없음");
  return { expenseId: doc.expenseId, expenseVersion: await versionOf(doc.expenseId), expectedPayableKrw: preview.payableKrw };
}

// 픽스처 거래처를 확인 전으로 둔다(픽스처 기본값과 무관하게 이 시험의 전제를 세운다).
async function setUnconfirmed(fx: ExpenseFixture): Promise<void> {
  await db.update(vendors).set({ confirmedAt: null, confirmedBy: null }).where(eq(vendors.id, fx.stageOneId));
}

async function unconfirmedDoc(): Promise<{ fx: ExpenseFixture; doc: ApprovedExpense }> {
  const fx = await setupExpenseProject();
  const doc = await approvedExpenseWithoutEvidence(fx);
  await setUnconfirmed(fx);
  return { fx, doc };
}

describe("확인 전 거래처 지급 막음 (2026-10-24 사용자 결정 · G13 일부 변경)", () => {
  it("지급 대상 목록 — 확인 전 거래처 행은 고를 수 없고 이유는 VENDOR_UNCONFIRMED · 확인하면 고를 수 있다", async () => {
    const manager = await makeVendorManager();
    const payer = await makePayer();
    const { fx, doc } = await unconfirmedDoc();

    let row = (await listPaymentTargets(payer, {})).groups.flatMap((group) => group.rows).find((item) => item.id === doc.expenseId);
    expect(row).toMatchObject({ selectable: false, reason: VENDOR_UNCONFIRMED, vendorConfirmed: false });

    await markVendorConfirmed(manager, { id: fx.stageOneId });
    row = (await listPaymentTargets(payer, {})).groups.flatMap((group) => group.rows).find((item) => item.id === doc.expenseId);
    expect(row).toMatchObject({ selectable: true, reason: null, vendorConfirmed: true });
  }, 60_000);

  it("이체 파일 — 확인 전이면 그 건만 막힘(VENDOR_UNCONFIRMED) · 확인 뒤 담김 · 확인 되돌리면 다시 막힘", async () => {
    const manager = await makeVendorManager();
    const payer = await makePayer();
    const { fx, doc } = await unconfirmedDoc();

    const blocked = await exportBankTransferFile(payer, { rows: [await snapshotOf(payer, doc)] });
    expect(blocked).toMatchObject({ lineCount: 0, docCount: 0, blocked: [{ expenseId: doc.expenseId, text: VENDOR_UNCONFIRMED }] });

    await markVendorConfirmed(manager, { id: fx.stageOneId });
    const passed = await exportBankTransferFile(payer, { rows: [await snapshotOf(payer, doc)] });
    expect(passed).toMatchObject({ lineCount: 1, docCount: 1, blocked: [] });

    await unmarkVendorConfirmed(manager, { id: fx.stageOneId });
    const again = await exportBankTransferFile(payer, { rows: [await snapshotOf(payer, doc)] });
    expect(again).toMatchObject({ lineCount: 0, blocked: [{ expenseId: doc.expenseId, text: VENDOR_UNCONFIRMED }] });
  }, 60_000);

  it("지급 완료(단건) — 확인 전이면 거부 · 확인 되돌린 뒤에도 거부 · 확인되면 지급된다", async () => {
    const manager = await makeVendorManager();
    const payer = await makePayer();
    const { fx, doc } = await unconfirmedDoc();
    const pay = async () => {
      const snap = await snapshotOf(payer, doc);
      return completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: snap.expectedPayableKrw, version: snap.expenseVersion });
    };

    await expect(pay()).rejects.toThrow(VENDOR_UNCONFIRMED);
    await markVendorConfirmed(manager, { id: fx.stageOneId });
    await unmarkVendorConfirmed(manager, { id: fx.stageOneId });
    await expect(pay()).rejects.toThrow(VENDOR_UNCONFIRMED);

    await markVendorConfirmed(manager, { id: fx.stageOneId });
    await expect(pay()).resolves.toMatchObject({ payDate: seoulToday() });
  }, 60_000);

  it("지급 완료 — 문서 잠금 뒤 확인이 풀리면(경합) 같은 트랜잭션 안의 판정이 거부한다", async () => {
    const manager = await makeVendorManager();
    const payer = await makePayer();
    const { fx, doc } = await unconfirmedDoc();
    await markVendorConfirmed(manager, { id: fx.stageOneId });
    const snap = await snapshotOf(payer, doc);

    await expect(
      completeExpensePayment(
        payer,
        { expenseId: doc.expenseId, expectedPayableKrw: snap.expectedPayableKrw, version: snap.expenseVersion },
        { afterLock: async () => void (await unmarkVendorConfirmed(manager, { id: fx.stageOneId })) },
      ),
    ).rejects.toThrow(VENDOR_UNCONFIRMED);
  }, 60_000);

  it("일괄 지급 — 확인 전 건은 그 건만 막힘(다른 사유와 같은 건별 결과) · 처리 0", async () => {
    const payer = await makePayer();
    const { doc } = await unconfirmedDoc();

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows: [await snapshotOf(payer, doc)] });
    expect(result.processed).toBe(0);
    expect(result.blocked).toMatchObject([{ expenseId: doc.expenseId, reason: VENDOR_UNCONFIRMED, selectable: false, selectableReason: VENDOR_UNCONFIRMED }]);
  }, 60_000);

  it("상세 지급 막대 — 확인 전 거래처면 blockReason이 VENDOR_UNCONFIRMED · 확인 뒤 null", async () => {
    const manager = await makeVendorManager();
    const payer = await makePayer();
    const { fx, doc } = await unconfirmedDoc();

    let view = await getPaymentView(payer, doc.expenseId);
    expect(view?.row).toMatchObject({ primary: "pay", blockReason: VENDOR_UNCONFIRMED });

    await markVendorConfirmed(manager, { id: fx.stageOneId });
    view = await getPaymentView(payer, doc.expenseId);
    expect(view?.row).toMatchObject({ primary: "pay", blockReason: null });
  }, 60_000);

  it("상세 지급 막대 — 직원 지급(payeeUserId)이면 거래처 확인 여부와 무관하게 막지 않는다", async () => {
    const payer = await makePayer();
    const { doc } = await unconfirmedDoc();
    await db.update(expenses).set({ vendorId: null, payeeUserId: payer.id }).where(eq(expenses.id, doc.expenseId));

    const view = await getPaymentView(payer, doc.expenseId);
    expect(view?.row).toMatchObject({ primary: "pay", blockReason: null });
  }, 60_000);
});
