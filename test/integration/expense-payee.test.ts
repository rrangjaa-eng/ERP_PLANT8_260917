import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, quoteLines, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { changeExpenseVendor, createExpenseFromLines, createTeamExpenseDraft, ExpenseNotFoundError, previewExpense, saveExpenseDraft } from "@/domain/expenses";
import { GateBlockedError } from "@/domain/rules/gate";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission } from "@/repositories/permissions";
import { setupExpenseProject, submitReadyDraft, testVendorAccount } from "./fixtures/expenses";

// 06.5 결정 맥락 15(돈 갈 곳 = 문서 지급처 칸) · D-6507(계좌 없는 지급처의 계좌이체 제출 막기, UI-SPEC V4) · D-6517(직원 지급처).

const MISSING = "지급처 계좌 없음 · 계좌 등록은 경영관리";
const MISSING_FIXABLE = "지급처 계좌 없음 · 계좌 등록";

async function expenseRow(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function vendorWith(name: string, account: "none" | "full" | "bankOnly") {
  const full = testVendorAccount();
  return insertVendor(SYSTEM_VIEWER, {
    name,
    normalizedName: `${name}-${randomUUID()}`.toLowerCase(),
    defaultEvidenceType: "tax_invoice",
    ...(account === "full" ? full : account === "bankOnly" ? { accountBank: "신한은행", accountHolder: "예금주" } : {}),
  });
}

// 제출까지 칸이 다 찬 팀 비용 문서(증빙은 submitReadyDraft가 붙인다).
async function readyTeamDraft(viewer: Viewer, vendorId: string, paymentMethod = "bank_transfer"): Promise<string> {
  const { expenseId } = await createTeamExpenseDraft(viewer, {
    idempotencyKey: randomUUID(),
    fields: {
      teamExpenseKind: "team_overhead",
      usageDate: "2026-09-26",
      content: "팀 회식",
      vendorId,
      supply: { currency: "KRW", amount: 100_000, fxRate: 1 },
      evidenceType: "tax_invoice",
      paymentMethod,
    },
  });
  return expenseId;
}

async function blockOf(viewer: Viewer, expenseId: string) {
  return (await previewExpense(viewer, { expenseId, fields: {} })).block ?? null;
}

describe("문서 지급처 · 계좌 막기 · 직원 지급처(06.5 결정 맥락 15 · D-6507 · D-6517)", () => {
  it("계좌이체 · 계좌 없는 거래처면 미리보기와 제출이 같은 문구로 막고, 계좌를 넣으면 통과한다", async () => {
    const fx = await setupExpenseProject();
    const vendor = await vendorWith("계좌없는거래처", "none");
    const expenseId = await readyTeamDraft(fx.pm, vendor.id);

    expect(await blockOf(fx.pm, expenseId)).toMatchObject({ reason: MISSING, target: "payeeAccount", href: null });
    const refused = await submitReadyDraft(fx.pm, expenseId).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(GateBlockedError);
    expect(refused).toMatchObject({ message: MISSING });
    expect((await expenseRow(expenseId)).number).toBeNull();

    await db.update(vendors).set(testVendorAccount()).where(eq(vendors.id, vendor.id));
    expect(await submitReadyDraft(fx.pm, expenseId)).toMatchObject({ kind: "submitted" });
  });

  it("은행만 있고 번호가 없으면 막는다(계좌 있음 = 은행 ∧ 번호)", async () => {
    const fx = await setupExpenseProject();
    const vendor = await vendorWith("은행만거래처", "bankOnly");
    const expenseId = await readyTeamDraft(fx.pm, vendor.id);
    expect(await blockOf(fx.pm, expenseId)).toMatchObject({ reason: MISSING });
    await expect(submitReadyDraft(fx.pm, expenseId)).rejects.toThrow(MISSING);
  });

  it("현금이면 계좌가 없어도 제출된다", async () => {
    const fx = await setupExpenseProject();
    const vendor = await vendorWith("현금거래처", "none");
    const expenseId = await readyTeamDraft(fx.pm, vendor.id, "cash");
    // 증빙은 아직 없다 — 첫 막힘이 지급처 계좌가 아니라 증빙이다.
    expect(await blockOf(fx.pm, expenseId)).toMatchObject({ target: "evidence" });
    expect(await submitReadyDraft(fx.pm, expenseId)).toMatchObject({ kind: "submitted" });
  });

  it("거래처를 고칠 수 있는 사람(admin.vendors 쓰기)에게는 `계좌 등록` 링크가 선다", async () => {
    const fx = await setupExpenseProject();
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "write", allowed: true });
    const vendor = await vendorWith("링크거래처", "none");
    const expenseId = await readyTeamDraft(fx.pm, vendor.id);
    expect(await blockOf(fx.pm, expenseId)).toMatchObject({ reason: MISSING_FIXABLE, target: "payeeAccount", href: `/admin/vendors?editId=${vendor.id}` });
  });

  it("미리보기를 통과한 뒤 계좌가 지워지면 제출이 트랜잭션 안에서 다시 막는다", async () => {
    const fx = await setupExpenseProject();
    const vendor = await vendorWith("지워질거래처", "full");
    const expenseId = await readyTeamDraft(fx.pm, vendor.id);
    expect(await blockOf(fx.pm, expenseId)).toMatchObject({ target: "evidence" });

    await db.update(vendors).set({ accountNumberEncrypted: null, accountNumberLast4: null }).where(eq(vendors.id, vendor.id));
    await expect(submitReadyDraft(fx.pm, expenseId)).rejects.toThrow(MISSING);
  });

  it("견적 줄 문서는 줄의 거래처가 바뀌어도 문서 지급처로 판정하고, 제출이 문서 칸을 덮지 않는다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const docVendor = await vendorWith("문서거래처", "none");
    const lineVendor = await vendorWith("줄거래처", "full");
    await db.update(expenses).set({ vendorId: docVendor.id }).where(eq(expenses.id, expenseId));
    await db.update(quoteLines).set({ vendorId: lineVendor.id }).where(eq(quoteLines.id, fx.lines.withVendor));

    // 줄 거래처(계좌 있음)가 아니라 문서 거래처(계좌 없음)로 막힌다.
    await expect(submitReadyDraft(fx.pm, expenseId)).rejects.toThrow(MISSING);

    await db.update(vendors).set(testVendorAccount()).where(eq(vendors.id, docVendor.id));
    expect(await submitReadyDraft(fx.pm, expenseId)).toMatchObject({ kind: "submitted" });
    expect((await expenseRow(expenseId)).vendorId).toBe(docVendor.id);
  });

  it("결재 중 문서의 지급처는 바꿀 수 없다", async () => {
    const fx = await setupExpenseProject();
    const vendor = await vendorWith("결재중거래처", "full");
    const other = await vendorWith("다른거래처", "full");
    const expenseId = await readyTeamDraft(fx.pm, vendor.id);
    await submitReadyDraft(fx.pm, expenseId);
    const { version } = await expenseRow(expenseId);

    await expect(changeExpenseVendor(fx.pm, { expenseId, vendorId: other.id, expectedVersion: version })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields: { vendorId: other.id } })).rejects.toBeInstanceOf(
      ExpenseNotFoundError,
    );
    expect((await expenseRow(expenseId)).vendorId).toBe(vendor.id);
  });
});
