import { test, expect, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E, type LineKey } from "./expense-fixture";
import { addDays, payCalendar } from "./pay-schedule-e2e";

// 07.2-07 X3 — 사유 코드표(반려 · 선결제 · 희망 지급일)에 활성 항목이 0건이면 고르개 DOM 0 · 글 칸 1.
// 세 표는 전역 코드표라 desktop의 다른 워커가 항목을 등록해 둔 동안에는 0건이 아니다(reason-options.ts) —
// 그래서 이 스펙은 desktop-settings(워커 1, desktop 전체가 끝난 뒤)에서만 돈다.

async function openDraft(page: Page, fx: ExpenseE2E, key: LineKey): Promise<void> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
}

test.describe("사유 항목 0건 (07.2-07 X3 · 직렬)", () => {
  test("반려 창 — 등록한 사유가 0건이면 select 없이 사유 칸만 있다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const line = fx.lines.retry;
    await submitLineExpense(browser, baseURL, fx, "retry");

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto("/approvals");
    const row = lead.getByRole("row").filter({ hasText: `지출결의 · ${fx.projectName} · ${line.itemName}` });
    const reject = row.getByRole("button", { name: "반려" });
    await waitForHydration(reject);
    await reject.click();

    const dialog = lead.getByRole("dialog");
    await expect(dialog.locator("select")).toHaveCount(0);
    await expect(dialog.locator("textarea")).toHaveCount(1);
    await lead.context().close();
  });

  test("희망 지급일 사유 항목이 0건이면 고르개 DOM 0 · 글 칸 1 · 기존 오류 문구는 그대로", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "retry");
    await page.getByLabel("희망 지급일").fill(addDays(cal.today, 7));
    await expect(page.locator("#requestedPaymentReason-pick")).toHaveCount(0);
    await expect(page.locator("textarea#requestedPaymentReason")).toHaveCount(1);
    await page.context().close();
  });

  test("선결제 사유 항목이 0건이면 지금과 같은 자유 입력 — 고르개 DOM 0 · 글 칸 1", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "retry");
    await page.getByLabel("선결제", { exact: true }).check();
    await expect(page.locator("#prepaidReason-pick")).toHaveCount(0);
    await expect(page.locator("textarea#prepaidReason")).toHaveCount(1);
    await page.context().close();
  });
});
