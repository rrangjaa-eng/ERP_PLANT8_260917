import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";

// 06-13(S14 · EXP-06 · SP-2): 견적 줄 표의 상태 열 · 금액 셀 읽기 전용 이유 · 행 행동 막힘이 서버 값 하나로 같은 사실을 말한다.
// 문서는 05 폼(증빙 붙여 제출) · 04.1 승인 · 06-06 확인 · 06-03 지급 도메인 함수로 만든다.

const DESKTOP = { width: 1280, height: 800 };
// Phase 4 표 열 순서 그대로(실행가 = 7).
const EXECUTION_COLUMN = 7;
const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

async function makePayerE2E(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E지급-${suffix}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E지급본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E지급팀-${suffix}` });
  return makePerson("경영관리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
}

// 증빙 확인(06-06) 뒤 지급 완료(06-03).
async function payExpense(payer: Person, expenseId: string): Promise<void> {
  const [row] = await db.select({ version: expenses.version, supply: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  await db.update(expenses).set({ evidenceAmount: row.supply }).where(eq(expenses.id, expenseId));
  const confirmed = await confirmEvidence(payer.viewer, { expenseId, version: row.version });
  const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
  if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");
  await completeExpensePayment(payer.viewer, { expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
}

function rowOf(page: Page, itemName: string) {
  return page.getByRole("row").filter({ hasText: itemName });
}

test.describe("견적 줄 상태 (06-13)", () => {
  test("지급 완료 줄 — 상태 `지급 완료` · 금액 셀 이유 `지급 완료` 꼴 · 행 행동 자리에 `지급 완료 {번호} · 새 지출결의 없음`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "closed");
    await approveAll(fx, expenseId);
    await payExpense(await makePayerE2E(), expenseId);
    const number = `${fx.projectNumber}-0001`;

    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const row = rowOf(page, fx.lines.closed.itemName);
    await expect(row.getByRole("gridcell").filter({ hasText: /^지급 완료$/ })).toHaveCount(1);
    await expect(row.getByText(`지급 완료 ${number} · 새 지출결의 없음`, { exact: true })).toBeVisible();

    const amount = row.getByRole("gridcell").nth(EXECUTION_COLUMN);
    await waitForHydration(amount);
    await expect(async () => {
      await amount.focus();
      await page.keyboard.press("Enter");
      await expect(amount.getByText(`지출결의 ${number} 지급 완료 · 고치려면 새 차수`, { exact: true })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect(amount.locator("input, select")).toHaveCount(0);
  });
});
