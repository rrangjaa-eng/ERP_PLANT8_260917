import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";

test.describe("코드표 관리 화면 (MAST-04, ADMN-01, D-36 계약: 화면 코드에 계급 이름 분기 없음)", () => {
  test("시스템 관리자 계급은 코드표 항목을 추가하고 목록에서 확인한다", async ({ page }) => {
    const admin = await createFixtureUser({ isAdmin: true, roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/code-tables");
    expect(response?.status()).toBe(200);

    const value = `e2e-${Date.now()}`;
    await page.getByLabel("값").fill(value);
    await page.getByLabel("이름").fill("E2E 코드");
    await page.getByRole("button", { name: "코드 추가" }).click();

    await expect(page.getByText(value)).toBeVisible();
  });

  test("기획 PM 계급은 코드표 관리 화면에서 404를 받는다 — 권한표가 이 계급에 메뉴를 주지 않았기 때문이다", async ({
    page,
  }) => {
    const pm = await createFixtureUser({ isAdmin: false, roleId: "role-pm" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/code-tables");
    expect(response?.status()).toBe(404);
  });
});
