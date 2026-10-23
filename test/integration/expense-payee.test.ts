import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, quoteLines, users, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import {
  changeExpenseLine,
  changeExpensePayeeUser,
  changeExpenseVendor,
  createExpenseFromLines,
  createTeamExpenseDraft,
  ExpenseNotFoundError,
  previewExpense,
  saveExpenseDraft,
} from "@/domain/expenses";
import { searchPayeeUsersForPick } from "@/domain/expenses/pick";
import { GateBlockedError } from "@/domain/rules/gate";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { makePerson } from "./approvals-fixtures";
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
      note: "팀 운영비",
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

// ── 직원 지급처(D-6517 · 결정 맥락 16 · EP1-9) ─────────────────────────────

// KST 자정 경계 — 10/14 23:59:59 KST와 10/15 00:00 KST.
const BEFORE_MIDNIGHT = new Date("2026-10-14T14:59:59Z");
const AFTER_MIDNIGHT = new Date("2026-10-14T15:00:00Z");

async function employee(name: string, set: Partial<typeof users.$inferInsert> = {}): Promise<string> {
  const person = await makePerson(name, DEFAULT_ROLE_ID, "기획1팀");
  if (Object.keys(set).length > 0) await db.update(users).set(set).where(eq(users.id, person.id));
  return person.id;
}

async function emptyTeamDraft(viewer: Viewer): Promise<string> {
  return (await createTeamExpenseDraft(viewer, { idempotencyKey: randomUUID(), fields: { usageDate: "2026-09-26" } })).expenseId;
}

describe("직원 지급처 — 네 쓰기 경로의 지급처 하나(D-6517 · 결정 맥락 16)", () => {
  it("팀 비용: 직원으로 바꾸면 거래처 칸이 비고 증빙 종류는 그대로, 다시 거래처로 바꾸면 직원 칸이 빈다", async () => {
    const fx = await setupExpenseProject();
    const vendor = await vendorWith("팀비용거래처", "full");
    const expenseId = await readyTeamDraft(fx.pm, vendor.id);
    const before = await expenseRow(expenseId);
    const userId = await employee("김지급");

    expect(await changeExpensePayeeUser(fx.pm, { expenseId, userId, expectedVersion: before.version })).toEqual({ version: before.version + 1 });
    expect(await expenseRow(expenseId)).toMatchObject({ payeeUserId: userId, vendorId: null, evidenceType: before.evidenceType, version: before.version + 1 });

    await changeExpenseVendor(fx.pm, { expenseId, vendorId: vendor.id, expectedVersion: before.version + 1 });
    expect(await expenseRow(expenseId)).toMatchObject({ vendorId: vendor.id, payeeUserId: null });
  });

  it("프로젝트 비용: 직원 · 다른 거래처로 바꿀 수 있고, 줄을 옮기면 새 줄 거래처가 지급처가 된다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const userId = await employee("김프로");
    const other = await vendorWith("프로젝트다른거래처", "full");

    const afterUser = await changeExpensePayeeUser(fx.pm, { expenseId, userId, expectedVersion: (await expenseRow(expenseId)).version });
    expect(await expenseRow(expenseId)).toMatchObject({ payeeUserId: userId, vendorId: null });
    const afterVendor = await changeExpenseVendor(fx.pm, { expenseId, vendorId: other.id, expectedVersion: afterUser.version });
    expect(await expenseRow(expenseId)).toMatchObject({ vendorId: other.id, payeeUserId: null });

    await changeExpensePayeeUser(fx.pm, { expenseId, userId, expectedVersion: afterVendor.version });
    await changeExpenseLine(fx.pm, { expenseId, lineId: fx.lines.split, expectedVersion: (await expenseRow(expenseId)).version });
    expect(await expenseRow(expenseId)).toMatchObject({ quoteLineId: fx.lines.split, vendorId: fx.stageOneId, payeeUserId: null });
  });

  it("첫 저장 · 칸 저장: 직원 칸만이면 직원 지급처, 둘 다면 거절, 한쪽을 저장하면 다른 쪽이 빈다(23514 없음)", async () => {
    const fx = await setupExpenseProject();
    const userId = await employee("김첫저장");
    const vendor = await vendorWith("첫저장거래처", "full");

    const { expenseId } = await createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { usageDate: "2026-09-26", payeeUserId: userId } });
    expect(await expenseRow(expenseId)).toMatchObject({ payeeUserId: userId, vendorId: null });
    await expect(
      createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { usageDate: "2026-09-26", payeeUserId: userId, vendorId: vendor.id } }),
    ).rejects.toBeInstanceOf(ExpenseNotFoundError);

    const v1 = (await expenseRow(expenseId)).version;
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: v1, fields: { vendorId: vendor.id } });
    expect(await expenseRow(expenseId)).toMatchObject({ vendorId: vendor.id, payeeUserId: null });
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: v1 + 1, fields: { payeeUserId: userId } });
    expect(await expenseRow(expenseId)).toMatchObject({ vendorId: null, payeeUserId: userId });
    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: v1 + 2, fields: { payeeUserId: userId, vendorId: vendor.id } })).rejects.toBeInstanceOf(
      ExpenseNotFoundError,
    );
  });

  it("견적 줄 문서는 칸 저장으로 직원 지급처를 싣지 못한다(바꾸기 경로만)", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const userId = await employee("김줄문서");
    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: (await expenseRow(expenseId)).version, fields: { payeeUserId: userId } })).rejects.toBeInstanceOf(
      ExpenseNotFoundError,
    );
  });

  it("보관 · 퇴사일이 어제 · 오늘(KST)인 사람 · 없는 id는 바꾸기 · 첫 저장 · 칸 저장 모두 거절한다", async () => {
    const fx = await setupExpenseProject();
    const rejected = [
      await employee("김보관", { archivedAt: new Date("2026-10-01T00:00:00Z") }),
      await employee("김어제", { resignationDate: "2026-10-13" }),
      await employee("김오늘", { resignationDate: "2026-10-14" }),
      `missing-${randomUUID()}`,
    ];
    const now = new Date("2026-10-14T03:00:00Z");
    for (const userId of rejected) {
      const expenseId = await emptyTeamDraft(fx.pm);
      await expect(changeExpensePayeeUser(fx.pm, { expenseId, userId, expectedVersion: 1 }, { now })).rejects.toBeInstanceOf(ExpenseNotFoundError);
      await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { payeeUserId: userId } }, { now })).rejects.toBeInstanceOf(ExpenseNotFoundError);
      await expect(
        createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { usageDate: "2026-09-26", payeeUserId: userId } }, { now }),
      ).rejects.toBeInstanceOf(ExpenseNotFoundError);
      expect(await expenseRow(expenseId)).toMatchObject({ payeeUserId: null, version: 1 });
    }
  });

  it("퇴사일이 내일(KST)인 퇴사 예정자 · 퇴사일 없는 사람은 고를 수 있다 — KST 자정 경계", async () => {
    const fx = await setupExpenseProject();
    const leaving = await employee("김내일", { resignationDate: "2026-10-15" });
    const staying = await employee("김계속");

    const a = await emptyTeamDraft(fx.pm);
    expect(await changeExpensePayeeUser(fx.pm, { expenseId: a, userId: leaving, expectedVersion: 1 }, { now: BEFORE_MIDNIGHT })).toEqual({ version: 2 });
    const b = await emptyTeamDraft(fx.pm);
    await expect(changeExpensePayeeUser(fx.pm, { expenseId: b, userId: leaving, expectedVersion: 1 }, { now: AFTER_MIDNIGHT })).rejects.toBeInstanceOf(
      ExpenseNotFoundError,
    );
    expect(await changeExpensePayeeUser(fx.pm, { expenseId: b, userId: staying, expectedVersion: 1 }, { now: AFTER_MIDNIGHT })).toEqual({ version: 2 });
  });

  it("남의 문서 · 결재 중 문서의 지급처는 직원으로도 바꿀 수 없다", async () => {
    const fx = await setupExpenseProject();
    const userId = await employee("김남의");
    const mine = await emptyTeamDraft(fx.pm);
    await expect(changeExpensePayeeUser(fx.otherPm, { expenseId: mine, userId, expectedVersion: 1 })).rejects.toBeInstanceOf(ExpenseNotFoundError);

    const vendor = await vendorWith("결재중직원거래처", "full");
    const expenseId = await readyTeamDraft(fx.pm, vendor.id);
    await submitReadyDraft(fx.pm, expenseId);
    const { version } = await expenseRow(expenseId);
    await expect(changeExpensePayeeUser(fx.pm, { expenseId, userId, expectedVersion: version })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    expect(await expenseRow(expenseId)).toMatchObject({ vendorId: vendor.id, payeeUserId: null });
  });

  it("직원 지급처 + 계좌이체 + 직원 계좌 없음 → 제출 거절, 계좌를 채우면 통과(⑤ 지급처 없음으로 막히지 않는다)", async () => {
    const fx = await setupExpenseProject();
    const userId = await employee("김계좌");
    const { expenseId } = await createTeamExpenseDraft(fx.pm, {
      idempotencyKey: randomUUID(),
      fields: {
        teamExpenseKind: "team_overhead",
        usageDate: "2026-09-26",
        content: "팀 회식",
        payeeUserId: userId,
        supply: { currency: "KRW", amount: 100_000, fxRate: 1 },
        evidenceType: "tax_invoice",
        paymentMethod: "bank_transfer",
        note: "팀 운영비",
      },
    });
    expect(await blockOf(fx.pm, expenseId)).toMatchObject({ reason: MISSING, target: "payeeAccount" });
    await expect(submitReadyDraft(fx.pm, expenseId)).rejects.toThrow(MISSING);

    await db.update(users).set(testVendorAccount()).where(eq(users.id, userId));
    expect(await submitReadyDraft(fx.pm, expenseId)).toMatchObject({ kind: "submitted" });
  });
});

describe("직원 후보 searchPayeeUsersForPick(V12 후보)", () => {
  it("보관 · 퇴사일이 오늘(KST) 이하인 사람은 빠지고 퇴사 예정자는 남는다 — 행 칸은 id · 이름 · 팀 · 계좌 없음뿐", async () => {
    const fx = await setupExpenseProject();
    const tag = `직${randomUUID().slice(0, 8)}`;
    const now = new Date("2026-10-14T03:00:00Z");
    const plain = await employee(`김${tag}가`);
    const leaving = await employee(`김${tag}나`, { resignationDate: "2026-10-15" });
    await employee(`김${tag}다`, { resignationDate: "2026-10-14" });
    await employee(`김${tag}라`, { archivedAt: new Date("2026-10-01T00:00:00Z") });
    await db.update(users).set(testVendorAccount()).where(eq(users.id, plain));

    const found = await searchPayeeUsersForPick(fx.pm, { query: ` ${tag} ` }, { now });
    expect(found.truncated).toBe(false);
    expect(found.rows.map((row) => row.id)).toEqual([plain, leaving]);
    expect(found.rows[0]).toEqual({ id: plain, name: `김${tag}가`, teamName: "기획1팀", accountMissing: false });
    expect(found.rows[1]).toEqual({ id: leaving, name: `김${tag}나`, teamName: "기획1팀", accountMissing: true });
    expect((await searchPayeeUsersForPick(fx.pm, { query: `${tag}나` }, { now })).rows.map((row) => row.id)).toEqual([leaving]);
  });

  it("51명이 걸리면 50행 · truncated", async () => {
    const fx = await setupExpenseProject();
    const tag = `많${randomUUID().slice(0, 8)}`;
    await db.insert(users).values(
      Array.from({ length: 51 }, (_, i) => ({ id: randomUUID(), name: `${tag}-${String(i).padStart(2, "0")}`, email: `${randomUUID()}@example.test`, roleId: DEFAULT_ROLE_ID })),
    );
    const found = await searchPayeeUsersForPick(fx.pm, { query: tag });
    expect(found.rows).toHaveLength(50);
    expect(found.truncated).toBe(true);
    expect(found.rows[0]).toMatchObject({ name: `${tag}-00`, teamName: null });
  });

  it("person.value가 꺼진 계급에는 직원 이름이 실리지 않는다(투영)", async () => {
    const tag = `가림${randomUUID().slice(0, 8)}`;
    await employee(`김${tag}`);
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `지급처 가림 계급-${randomUUID()}`, workScope: "company" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "person.value", visible: false });
    const viewer = await makePerson("가림 사람", role.id, "기획1팀");
    const found = await searchPayeeUsersForPick(viewer, { query: tag });
    expect(found.rows.filter((row) => row.name !== undefined)).toEqual([]);
  });
});
