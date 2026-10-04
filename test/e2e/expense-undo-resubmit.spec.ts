import { test, expect, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, uniqueReceipt, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 05-09(UI-SPEC 확정 #2 · S3 「반려 · 회수 뒤」 · Copywriting 「SUCCESS — 토스트」): 제출 토스트 `되돌리기` = 확인 없는 즉시 회수 → 같은 주소가
// 고칠 수 있는 폼 → 같은 번호로 다시 제출. 토스트 4초 자동 소멸에 기대지 않는다 — `page.clock.install()`을 `goto` 전에 두고 토스트가 보이면
// 곧바로 `pauseAt`으로 멈춘 뒤 누르고 결과를 단언한 다음 `resume`(P3-12).

const UPLOAD_WAIT = 20_000;
const META = /^\d+KB · \d{2}-\d{2}$/;

async function submitFromForm(page: Page, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
  await expect(page.locator('[data-ui="attachments"] li').getByText(META)).toBeVisible({ timeout: UPLOAD_WAIT });
  await page.getByRole("button", { name: /^지출결의 제출/ }).click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1`));
  return expenseId;
}

// 토스트가 보인 바로 그때 페이지 시계를 멈춘다(자동 소멸 타이머가 돌지 않게).
async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 200);
}

test.describe("되돌리기 → 같은 번호 다시 제출 (확정 #2)", () => {
  test("제출 토스트 되돌리기 → 확인 없이 회수 · 폼(회수 읽기 행) → 공급가액 고침 · Ctrl+Enter → 같은 번호 · 다시 제출 토스트 → 팀장 승인", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.clock.install();
    const expenseId = await submitFromForm(page, fx, "tracer");
    const number = `${fx.projectNumber}-0001`;

    const toast = page.getByRole("status").filter({ hasText: `지출결의 제출 · 결재 요청됨 → ${fx.lead.name}` });
    await expect(toast).toBeVisible();
    await pauseClock(page);
    await toast.getByRole("button", { name: "되돌리기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "되돌리기 · 결재 멈춤" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}`));

    // 같은 주소가 폼 — 머리 줄 상태 `회수` · 메타 번호 · 맨 위 읽기 행 `회수 MM-DD HH:mm` · 1차 `지출결의 다시 제출`.
    const title = page.locator('[data-ui="screen-title"]');
    await expect(title).toHaveText(new RegExp(`^지출결의 — ${fx.projectName}`));
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await expect(page.locator('[data-ui="screen-title"]').locator("..").getByText("회수", { exact: true })).toBeVisible();
    const firstTerm = page.locator("dl dt").first();
    await expect(firstTerm).toHaveText("회수");
    await expect(page.locator("dl dd").first()).toHaveText(/^\d{2}-\d{2} \d{2}:\d{2}$/);
    const resubmit = page.getByRole("button", { name: /^지출결의 다시 제출/ });
    await expect(resubmit).toBeVisible();
    await page.clock.resume();

    await waitForHydration(resubmit);
    const amount = page.getByLabel("공급가액");
    await amount.fill("10,000,000");
    await amount.press("Control+Enter");
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1`));
    await expect(page.getByRole("status").filter({ hasText: `지출결의 다시 제출 · 결재 요청됨 → ${fx.lead.name}` })).toBeVisible();
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await page.context().close();

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto(`/expenses/${expenseId}`);
    const approve = lead.getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await approve.click();
    await expect(lead.getByRole("button", { name: /^승인/ })).toHaveCount(0);
    await expect(lead.getByText(number, { exact: true })).toBeVisible();
    await expect(lead.locator('[data-ui="screen-title"]').locator("..").getByText("결재 중", { exact: true })).toBeVisible();
    await lead.context().close();
  });
});
