import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// defect 2(wave 5 DOM 감사): 계급 이름을 바꾸는 인라인 입력이 <label>도
// aria-label도 없었다. roles-client.tsx의 RoleRow가
// aria-label={`${role.name} 이름`}을 달게 고쳤다.

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("계급 이름 변경 입력의 접근 가능한 이름 (defect 2)", () => {
  test("각 계급 이름 입력이 <계급 이름> 이름으로 된 고유한 접근 가능한 이름을 가진다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles?new=1");

    const roleName = `E2E계급-${Date.now()}`;
    await page.locator("#role-form").getByLabel("이름").fill(roleName);
    await page.locator("#role-form button[type=submit]").click();

    const renameInput = page.getByLabel(`${roleName} 이름`);
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveValue(roleName);
  });

  test("서로 다른 두 계급의 이름 입력은 서로 다른 접근 가능한 이름을 가진다(행 구분 가능)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles?new=1");

    const roleA = `E2E계급A-${Date.now()}`;
    const roleB = `E2E계급B-${Date.now()}`;
    await page.locator("#role-form").getByLabel("이름").fill(roleA);
    await page.locator("#role-form button[type=submit]").click();
    await expect(page.getByLabel(`${roleA} 이름`)).toBeVisible();

    await page.locator("#role-form").getByLabel("이름").fill(roleB);
    await page.locator("#role-form button[type=submit]").click();
    await expect(page.getByLabel(`${roleB} 이름`)).toBeVisible();

    await expect(page.getByLabel(`${roleA} 이름`)).toHaveCount(1);
    await expect(page.getByLabel(`${roleB} 이름`)).toHaveCount(1);
  });
});
