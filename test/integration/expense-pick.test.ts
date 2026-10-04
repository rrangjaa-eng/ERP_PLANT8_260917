import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { createTeamExpenseDraft, ExpenseConflictError, ExpenseNotFoundError, changeExpenseVendor, createExpenseFromLines } from "@/domain/expenses";
import { searchVendorsForPick } from "@/domain/expenses/pick";
import { insertVendor, setVendorHidden } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { makePerson } from "./approvals-fixtures";
import { setupExpenseProject } from "./fixtures/expenses";

// 05-07 골라내기 · 서버 판정 — 거래처(Task 1) · 견적 줄(Task 2). 행은 투영 DTO(PickVendorOptionDto · PickLineOptionDto)다.

async function viewerWithoutVendorValue(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `골라내기 계급-${randomUUID()}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: false });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `pick-${randomUUID()}@example.test`, name: `골라내기 사람-${randomUUID()}`, roleId: role.id });
  return { id: userId, roleId: role.id };
}

async function vendorNamed(name: string, defaultEvidenceType: string | null = null) {
  return insertVendor(SYSTEM_VIEWER, { name, normalizedName: `${name}-${randomUUID()}`.toLowerCase(), defaultEvidenceType });
}

describe("거래처 골라내기 searchVendorsForPick", () => {
  it("이름 부분 일치로 좁히고 행은 이름 · 기본 증빙 종류 · 이름 라벨이며 숨김 거래처는 없다", async () => {
    const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const tag = `핍${randomUUID().slice(0, 8)}`;
    const withDefault = await vendorNamed(`${tag}-스테이지`, "tax_invoice");
    const plain = await vendorNamed(`${tag}-음향`);
    const hidden = await vendorNamed(`${tag}-숨김`);
    await setVendorHidden(SYSTEM_VIEWER, hidden.id, true);

    const found = await searchVendorsForPick(pm, { query: tag });
    expect(found.truncated).toBe(false);
    expect(found.rows.map((row) => row.id).sort()).toEqual([withDefault.id, plain.id].sort());
    expect(found.rows.find((row) => row.id === withDefault.id)).toMatchObject({
      name: `${tag}-스테이지`,
      defaultEvidenceType: "tax_invoice",
      defaultEvidenceName: "세금계산서",
    });
    expect(found.rows.find((row) => row.id === plain.id)).toMatchObject({ name: `${tag}-음향`, defaultEvidenceType: null, defaultEvidenceName: null });

    const narrowed = await searchVendorsForPick(pm, { query: `${tag}-음` });
    expect(narrowed.rows.map((row) => row.id)).toEqual([plain.id]);
    expect((await searchVendorsForPick(pm, { query: `${tag}-없음` })).rows).toEqual([]);
  });

  it("50행까지만 돌려주고 넘으면 truncated", async () => {
    const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const tag = `상한${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < 51; i += 1) await vendorNamed(`${tag}-${String(i).padStart(2, "0")}`);
    const found = await searchVendorsForPick(pm, { query: tag });
    expect(found.rows).toHaveLength(50);
    expect(found.truncated).toBe(true);
  });

  it("vendor.value를 끈 계급의 결과 행에는 이름 · 기본 증빙이 없다", async () => {
    const tag = `가림${randomUUID().slice(0, 8)}`;
    await vendorNamed(`${tag}-스테이지`, "tax_invoice");
    const viewer = await viewerWithoutVendorValue();
    const found = await searchVendorsForPick(viewer, { query: tag });
    expect(JSON.stringify(found)).not.toContain(tag);
    expect(JSON.stringify(found)).not.toContain("tax_invoice");
    expect(found.rows).toEqual([]);
  });
});

describe("거래처 바꾸기 changeExpenseVendor", () => {
  async function teamDraft(pm: Viewer) {
    return (await createTeamExpenseDraft(pm, { idempotencyKey: randomUUID(), fields: { usageDate: "2026-09-26" } }, { now: new Date("2026-09-26T03:00:00Z") })).expenseId;
  }

  it("거래처를 바꾸면 증빙 종류가 그 거래처 기본값이 되고, 기본값이 없으면 증빙 종류는 그대로다", async () => {
    const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const expenseId = await teamDraft(pm);
    const withDefault = await vendorNamed("기본증빙집", "other_income");
    const plain = await vendorNamed("기본없는집");

    const first = await changeExpenseVendor(pm, { expenseId, vendorId: withDefault.id, expectedVersion: 1 });
    expect(first).toMatchObject({ version: 2, evidenceType: "other_income" });
    const [afterFirst] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
    expect(afterFirst).toMatchObject({ vendorId: withDefault.id, evidenceType: "other_income", version: 2 });

    const second = await changeExpenseVendor(pm, { expenseId, vendorId: plain.id, expectedVersion: 2 });
    expect(second).toMatchObject({ version: 3, evidenceType: "other_income" });
    const [afterSecond] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
    expect(afterSecond).toMatchObject({ vendorId: plain.id, evidenceType: "other_income" });
  });

  it("버전이 낡으면 충돌, 남의 문서 · 없는 거래처는 없는 문서, 견적 줄 문서의 거래처는 줄이 정한다", async () => {
    const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const other = await makePerson("남", DEFAULT_ROLE_ID, "기획1팀");
    const expenseId = await teamDraft(pm);
    const vendor = await vendorNamed("충돌집");
    await changeExpenseVendor(pm, { expenseId, vendorId: vendor.id, expectedVersion: 1 });
    await expect(changeExpenseVendor(pm, { expenseId, vendorId: vendor.id, expectedVersion: 1 })).rejects.toBeInstanceOf(ExpenseConflictError);
    await expect(changeExpenseVendor(other, { expenseId, vendorId: vendor.id, expectedVersion: 2 })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    await expect(changeExpenseVendor(pm, { expenseId, vendorId: randomUUID(), expectedVersion: 2 })).rejects.toBeInstanceOf(ExpenseNotFoundError);

    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const lineDoc = created.created[0]?.expenseId ?? "";
    await expect(changeExpenseVendor(fx.pm, { expenseId: lineDoc, vendorId: vendor.id, expectedVersion: 1 })).rejects.toBeInstanceOf(ExpenseNotFoundError);
  });
});
