import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createTeamExpenseDraft } from "@/domain/expenses";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E } from "./expense-fixture";

// 05-13 게이트 감사 D2: 미리보기가 서버 오류(금액 상한 초과)를 받으면 공급가액 칸 오류 줄로 보이고, 계산 한 줄은 이전 값을 두지 않고
// `계산 불가`다. 다음 정상 미리보기가 오면 둘 다 걷힌다. 1280(PC) · 375(폰) 둘 다.

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 375, height: 800 },
] as const;

test("미리보기 서버 오류 — 공급가액 칸 오류 + 계산 불가, 정상 값으로 돌아오면 걷힌다", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const { expenseId } = await createTeamExpenseDraft(fx.pm.viewer, {
    idempotencyKey: randomUUID(),
    fields: {
      teamExpenseKind: "team_overhead",
      content: "해외 경품 구매",
      evidenceType: "tax_invoice",
      supply: { currency: "USD", amount: 740_740_740, fxRate: 1_350 },
    },
  });

  for (const viewport of VIEWPORTS) {
    const page = await loginPage(browser, baseURL, fx.pm, viewport);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    const amount = page.locator("#supplyAmount");
    const line = page.getByTestId("expense-tax-line");
    await expect(line).toContainText("지급 총액");
    await expect(amount).not.toHaveAttribute("aria-invalid", "true");

    // 7,407,407,407 USD × 1,350 = 금액 상한(999,999,999,999원) 초과.
    await amount.fill("7407407407");
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    const error = page.locator("#supplyAmount-error");
    await expect(error).toContainText("금액 상한 초과");
    await expect(amount).toHaveAttribute("aria-describedby", /supplyAmount-error/);
    await expect(line).toHaveText("계산 불가");
    await expect(line).toHaveCSS("color", await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--text-faint)";
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }));

    await amount.fill("740740740");
    await expect(error).toHaveCount(0);
    await expect(amount).not.toHaveAttribute("aria-invalid", "true");
    await expect(line).toContainText("지급 총액");
    await page.context().close();
  }
});
