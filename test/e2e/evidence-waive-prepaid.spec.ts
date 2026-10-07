import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06-10(EXP-13 · EVID-03 · D-603 · D-611 · UI-SPEC S6 · S4 empty): 기안자가 폼에서 `선결제`를 켜고 사유를 적어 증빙 없이 제출 → 결재 통과 →
// 증빙 필수 on에서도 지급 완료가 통과하고 증빙 섹션에 `선결제` + 2행 `증빙 기한` · `선결제 사유`가 선다. 문서는 05 폼 · 04.1 승인 도메인 함수로 만든다.

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];
const PREPAID_REASON = "행사 장소 선결제 요구로 증빙을 지급 뒤에 받기로 함";

// 테스트 계급 「경영관리」 — 전사 업무 범위 · 지출결의 보기 + 지급 처리 쓰기. 결재선 밖 전용 본부 · 팀에 발령한다.
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

// 줄 하나의 작성 중 문서를 만들어 기안자 폼을 연다(증빙은 붙이지 않는다).
async function openDraftForm(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, key: LineKey): Promise<{ page: Page; expenseId: string }> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return { page, expenseId };
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe("선결제 (06-10)", () => {
  test("선결제 사유가 비면 제출이 막히고, 사유를 적으면 증빙 없이 제출 → 지급 → 증빙 섹션에 선결제 · 기한 · 사유", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const { page, expenseId } = await openDraftForm(browser, baseURL, fx, "tracer");

    // 선결제 켜기 — 사유 칸과 기한 힌트가 서고, 사유가 비면 1차 옆 이유가 `선결제 사유 없음`이다.
    await expect(page.getByLabel("선결제 사유")).toHaveCount(0);
    await page.getByLabel("선결제", { exact: true }).check();
    const reason = page.getByLabel("선결제 사유");
    await expect(reason).toBeVisible();
    await expect(page.getByText("증빙 기한 지급일부터 14일")).toBeVisible();
    await expect(page.locator("#expense-blocked")).toContainText("선결제 사유 없음 · 사유 적기");
    await expect(page.getByRole("button", { name: /^지출결의 제출/ })).toBeDisabled();

    // 사유를 적으면 증빙 0이어도 제출이 풀린다.
    await reason.fill(PREPAID_REASON);
    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
    // 제출 뒤 문서 화면 — 읽기 줄 `선결제 사유` 원문, 선결제를 켜고 끄는 칸은 없다(O-4).
    await expect(page.getByTestId("prepaid-reason")).toHaveText(PREPAID_REASON);
    await expect(page.getByLabel("선결제", { exact: true })).toHaveCount(0);
    await page.context().close();

    await approveAll(fx, expenseId);
    const payer = await makePayerE2E();
    const payerPage = await loginPage(browser, baseURL, payer);
    await payerPage.goto(`/expenses/${expenseId}`);
    const pay = payerPage.getByRole("button", { name: /^지급 완료/ });
    await waitForHydration(pay);
    await pay.click();
    await expect(payerPage.getByTestId("payment-result")).toHaveText(/^지급 완료 → /);

    // 지급 뒤 다시 읽는다 — `선결제` + 2행 `증빙 기한 {지급일 + 14일}` · `선결제 사유` 원문.
    await payerPage.reload();
    const evidence = payerPage.getByTestId("evidence-review");
    await expect(evidence.getByText("선결제", { exact: true })).toBeVisible();
    await expect(payerPage.getByTestId("evidence-prepaid-due")).toHaveText(`증빙 기한 ${addDays(seoulToday(), 14).slice(5)}`);
    await expect(payerPage.getByTestId("prepaid-reason")).toHaveText(PREPAID_REASON);
    await payerPage.context().close();
  });
});
