import { test, expect, type Page } from "@playwright/test";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { loginPage, waitForHydration } from "./leave-org";
import { makeEvidenceManagerE2E, setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";

// 05-09 웨이브 11 화면 검토 수정(폰 375 × 667 — 검토 실측과 같은 창):
// D1 확인 시트 행동 줄에 kbd(Esc · Ctrl+Enter)를 그리지 않는다(UI-SPEC :313).
// D2 무효 처리 시트 — 사유 첫 글자에 막힘 줄이 사라져도 시트 · 사유 칸이 움직이지 않는다.
// D3 고정 행동 줄이 있는 화면의 토스트는 그 줄 위에 뜬다(행동 줄 버튼을 가리지 않는다).
const PHONE = { width: 375, height: 667 };

async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  for (const person of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(person.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    await approveDocument(person.viewer, { instanceId: view?.instanceId ?? "", expectedVersion: view?.version ?? 0 });
  }
}

async function boxOf(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { y: rect.y, height: rect.height };
  });
}

test.describe("05-09 웨이브 11 검토 수정 · 폰", () => {
  test("D1 · D2 — 무효 처리 시트: kbd 없음 · 사유 첫 글자에 시트 · 사유 칸이 그대로", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const manager = await makeEvidenceManagerE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "phone");
    await approveAll(fx, expenseId);

    const page = await loginPage(browser, baseURL, manager, PHONE);
    await page.goto(`/expenses/${expenseId}`);
    const voidButton = page.locator('[data-ui="attachments"] li').getByRole("button", { name: "무효 처리" });
    await waitForHydration(voidButton);
    await voidButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("사유 없음 · 사유 적기").first()).toBeVisible();

    await expect(dialog.locator("kbd:visible")).toHaveCount(0);

    const sheetBefore = await boxOf(page, "dialog[open]");
    const fieldBefore = await boxOf(page, "dialog[open] textarea");
    await dialog.getByLabel("사유").pressSequentially("다");
    await expect(dialog.getByText("사유 없음 · 사유 적기")).toHaveCount(0);
    expect(await boxOf(page, "dialog[open]")).toEqual(sheetBefore);
    expect(await boxOf(page, "dialog[open] textarea")).toEqual(fieldBefore);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.context().close();
  });

  test("D3 — 제출 토스트는 고정 행동 줄 위: `회수` 버튼을 가리지 않는다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "phone");

    const page = await loginPage(browser, baseURL, fx.pm, PHONE);
    await page.clock.install();
    await page.goto(`/expenses/${expenseId}?submitted=1`);
    const toast = page.getByRole("status").filter({ hasText: /^지출결의 제출/ });
    await expect(toast).toBeVisible();
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 200);
    const withdraw = page.getByRole("button", { name: /^회수/ });
    await waitForHydration(withdraw);

    const toastBox = await toast.boundingBox();
    const withdrawBox = await withdraw.boundingBox();
    if (!toastBox || !withdrawBox) throw new Error("토스트 · 회수 버튼이 없다");
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(withdrawBox.y);
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest("button")?.textContent ?? "",
      [withdrawBox.x + withdrawBox.width / 2, withdrawBox.y + withdrawBox.height / 2],
    );
    expect(hit).toMatch(/^회수/);
    await page.context().close();
  });
});
