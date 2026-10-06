import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { loginAsSysadmin } from "./row-actions-helpers";
import { setupExpenseE2E } from "./expense-fixture";
import { loginPage, waitForHydration } from "./leave-org";

// 06-02 MAST-05(C16) — 지급 방식 코드표는 05 시드 셋(계좌이체 · 법인카드 · 현금)이 이 페이즈의 값이고, 시스템 관리자가 화면에서 값을 더하고
// 라벨을 고치고 비활성화하면 지출결의 폼 「지급 방식」 고르기와 설정 화면 짝 격자 행이 그대로 따라간다. 값은 테스트 안에서 고유하게 만들고 끝에 비활성화로 정리한다.
const PANEL = 'dialog[data-ui="side-panel"]';

async function addPaymentMethod(page: Page, value: string, label: string): Promise<void> {
  await page.goto("/admin/code-tables?tableKey=payment_method&new=1");
  const dialog = page.locator(PANEL);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("값", { exact: true }).fill(value);
  await dialog.getByLabel("이름", { exact: true }).fill(label);
  await dialog.getByRole("button", { name: "코드 추가" }).click();
  await expect(dialog.getByRole("status")).toHaveText("코드 추가됨");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}

test.describe("MAST-05 지급 방식 코드표 (06-02)", () => {
  test("시드 셋을 보고 값을 추가 · 라벨 수정 · 비활성화하면 지출결의 폼 고르기와 짝 격자 행에 반영된다", async ({ browser, baseURL, page }) => {
    const stamp = randomUUID().slice(0, 8);
    const value = `giftcard-${stamp}`;
    const firstLabel = `상품권-${stamp}`;
    const finalLabel = `상품권 지급-${stamp}`;

    try {
      await loginAsSysadmin(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/admin/code-tables?tableKey=payment_method");
      for (const seeded of ["계좌이체", "법인카드", "현금"]) {
        await expect(page.getByLabel(`${seeded} 이름`)).toBeVisible();
      }

      await addPaymentMethod(page, value, firstLabel);
      await expect(page.getByLabel(`${firstLabel} 이름`)).toBeVisible();

      const renameInput = page.getByLabel(`${firstLabel} 이름`);
      await renameInput.fill(finalLabel);
      await renameInput.blur();
      await expect(async () => {
        await page.reload();
        await expect(page.getByLabel(`${finalLabel} 이름`)).toBeVisible();
      }).toPass();

      // 지출결의 폼 「지급 방식」 고르기에 수정된 라벨이 있다.
      const fx = await setupExpenseE2E();
      const pmPage = await loginPage(browser, baseURL, fx.pm);
      const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id] });
      const expenseId = created.created[0]?.expenseId;
      if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
      await pmPage.goto(`/expenses/${expenseId}`);
      await waitForHydration(pmPage.getByRole("button", { name: /^임시 저장/ }));
      const methodOptions = pmPage.getByLabel("지급 방식").locator("option");
      await expect(methodOptions.filter({ hasText: finalLabel })).toHaveCount(1);

      // 설정 화면 짝 격자 행에도 있다.
      await page.goto("/admin/settings");
      const grid = page.getByRole("table", { name: "지급 방식 · 증빙 종류 짝" });
      await expect(grid.getByRole("rowheader", { name: new RegExp(finalLabel) })).toBeVisible();

      // 비활성화 — 둘 다에서 사라진다.
      await page.goto("/admin/code-tables?tableKey=payment_method");
      await page.locator("tr", { hasText: value }).getByRole("button", { name: "비활성화" }).click();
      await expect(page.locator("tr", { hasText: value })).toHaveCount(0);

      await pmPage.reload();
      await waitForHydration(pmPage.getByRole("button", { name: /^임시 저장/ }));
      await expect(pmPage.getByLabel("지급 방식").locator("option").filter({ hasText: finalLabel })).toHaveCount(0);

      await page.goto("/admin/settings");
      await expect(page.getByRole("table", { name: "지급 방식 · 증빙 종류 짝" }).getByRole("rowheader", { name: new RegExp(finalLabel) })).toHaveCount(0);
      await pmPage.context().close();
    } finally {
      await db.update(codeItems).set({ active: false }).where(eq(codeItems.value, value));
    }
  });
});
