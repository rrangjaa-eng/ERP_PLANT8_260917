import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenseEvidenceReviews, expenses, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, uniqueReceipt, type ExpenseE2E } from "./expense-fixture";

// 06-11(EVID-02 · EVID-04 · C4 · B-1 · U-4) — 증빙 수명 주기: 승인 뒤 기안자가 증빙을 하나 더 붙이면 확인된 문서가 `확인 전`으로 돌아오고,
// 완료 프로젝트의 승인 문서에는 기안자에게 「하나 더」 대신 잠김 한 줄이 선다. 문서는 05 폼 · 04.1 승인 · 06-06 확인 도메인 함수로 만든다.

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];
const EVIDENCE_AMOUNT = 12_400_000;
const EVIDENCE_COMPLETED_PROJECT_LINE = "완료 프로젝트 · 증빙은 경영관리";

// 테스트 계급 「경영관리」 — 전사 업무 범위 · 지출결의 보기 + 지급 처리 쓰기 (+ 선택으로 증빙 붙이기). 결재선 밖 전용 본부 · 팀에 발령한다.
async function makeManagerE2E(options: { attach?: boolean } = {}): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E수명-${suffix}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  if (options.attach) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.evidence_attach", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E수명본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E수명팀-${suffix}` });
  return makePerson("경영관리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

// 결재선 넷 승인(approved).
async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
    if (approver === fx.ceo && result.status !== "approved") throw new Error(`결재 통과 안 됨: ${result.status}`);
  }
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

test.describe("증빙 수명 주기 (06-11)", () => {
  test("경영관리가 확인한 문서에 승인 뒤 기안자가 파일을 하나 더 붙이면 확인 전으로 돌아오고 1차 `증빙 확인`이 선다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    await approveAll(fx, expenseId);
    // 테스트 준비 전용 — 기안자 증빙 금액 입력(06-10)을 거치지 않고 금액을 적은 뒤 경영관리가 확인한다.
    await db.update(expenses).set({ evidenceAmount: EVIDENCE_AMOUNT, evidenceDate: seoulToday() }).where(eq(expenses.id, expenseId));
    const manager = await makeManagerE2E();
    await confirmEvidence(manager.viewer, { expenseId, version: await versionOf(expenseId) });

    const payerPage = await loginPage(browser, baseURL, manager);
    await payerPage.goto(`/expenses/${expenseId}`);
    const evidence = payerPage.getByTestId("evidence-review");
    await waitForHydration(payerPage.getByRole("button", { name: /^지급 완료/ }));
    await expect(evidence.getByText("확인됨", { exact: true })).toBeVisible();

    // 기안자 세션 — 승인 뒤 문서 화면의 「하나 더」로 파일을 더한다.
    const drafterPage = await loginPage(browser, baseURL, fx.pm);
    await drafterPage.goto(`/expenses/${expenseId}`);
    await expect(drafterPage.getByText("하나 더", { exact: false }).first()).toBeVisible();
    await drafterPage.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(drafterPage));
    // 완료 통보까지 끝난 행만 `크기 · 날짜`를 그린다(올리는 중인 행은 진행 바).
    await expect(drafterPage.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toHaveCount(2, { timeout: 20_000 });
    await drafterPage.context().close();

    // 경영관리 세션 — 새로 고침 뒤 확인 줄이 `확인 전`, 1차 `증빙 확인`.
    await payerPage.reload();
    await expect(payerPage.getByTestId("evidence-review").getByText("확인 전", { exact: true })).toBeVisible();
    await expect(payerPage.getByRole("button", { name: /^증빙 확인/ })).toBeVisible();
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId))).toHaveLength(0);
    await payerPage.context().close();
  });

  test("완료 프로젝트의 승인 문서 — 기안자 화면에는 「하나 더」 없이 잠김 한 줄, 붙이기 권한자 화면에는 「하나 더」", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "hold");
    await approveAll(fx, expenseId);
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const manager = await makeManagerE2E({ attach: true });

    const drafterPage = await loginPage(browser, baseURL, fx.pm);
    await drafterPage.goto(`/expenses/${expenseId}`);
    const drafterArea = drafterPage.locator('[data-ui="attachments"]');
    await expect(drafterArea).toBeVisible();
    await expect(drafterArea.getByText(EVIDENCE_COMPLETED_PROJECT_LINE, { exact: true })).toBeVisible();
    await expect(drafterArea.getByText("하나 더", { exact: false })).toHaveCount(0);
    await expect(drafterPage.getByTestId("attachments-input")).toHaveCount(0);
    await drafterPage.context().close();

    const managerPage = await loginPage(browser, baseURL, manager);
    await managerPage.goto(`/expenses/${expenseId}`);
    const managerArea = managerPage.locator('[data-ui="attachments"]');
    await expect(managerArea.getByText("하나 더", { exact: false }).first()).toBeVisible();
    await expect(managerArea.getByText(EVIDENCE_COMPLETED_PROJECT_LINE, { exact: true })).toHaveCount(0);
    await managerPage.context().close();
  });
});
