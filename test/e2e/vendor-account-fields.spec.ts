import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createVendor } from "@/domain/vendors";
import { createFixtureUser } from "./fixtures";

// 06.5-04(UI-SPEC V2 a11y · V3): 거래처 계좌 칸 — 번호 보기 결과 `aria-live`, 계좌번호 칸 숫자 자판(`inputmode`).
// vendor-edit.spec.ts는 같은 웨이브 06.5-02가 고치므로 이 플랜의 거래처 계좌 단언은 이 파일에 둔다.

async function login(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(creds.email);
  await page.getByLabel("비밀번호").fill(creds.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

const panel = (page: Page) => page.locator('dialog[data-ui="side-panel"]');

test.describe("거래처 계좌 칸(06.5-04)", () => {
  test("목록 번호 보기 결과가 aria-live로 들리고, 등록 · 수정 패널 계좌번호 칸은 숫자 자판", async ({ page }) => {
    await login(page, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
    const name = `E2E계좌칸-${randomUUID().slice(0, 8)}`;
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name,
      accountBank: "신한",
      accountHolder: "홍길동",
      accountNumber: "110-222-335566",
    });

    await page.goto("/admin/vendors");
    const row = page.locator("tr", { hasText: name });
    await row.getByRole("button", { name: "번호 보기" }).click();
    const number = row.locator('[aria-live="polite"]');
    await expect(number).toHaveText("110-222-335566");
    await row.getByRole("button", { name: "가리기" }).click();
    await expect(number).toHaveText("****-**-5566");

    await page.goto(`/admin/vendors?editId=${vendor.id}`);
    await expect(panel(page).getByLabel("새 계좌번호")).toHaveAttribute("inputmode", "numeric");
    await page.goto("/admin/vendors?new=1");
    await expect(panel(page).getByLabel("계좌번호", { exact: true })).toHaveAttribute("inputmode", "numeric");
  });
});
