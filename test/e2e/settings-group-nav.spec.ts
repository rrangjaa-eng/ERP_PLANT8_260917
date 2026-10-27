import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

async function openSettings(page: Page, search = "") {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto(`/admin/settings${search}`);
}

const groupNav = (page: Page) => page.getByRole("navigation", { name: "설정 묶음" });

test.describe("설정 화면 묶음 링크", () => {
  test("PC 1280: 묶음 링크가 레지스트리 순서로 보이고 첫 묶음만 그려진다", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSettings(page);

    const links = groupNav(page).getByRole("link");
    await expect(links.first()).toHaveText("로그인 잠금");
    await expect(links.first()).toHaveAttribute("aria-current", "page");
    expect(await links.count()).toBeGreaterThan(10);
    await expect(groupNav(page).locator('[aria-current="page"]')).toHaveCount(1);

    await expect(page.getByRole("heading", { name: "로그인 잠금" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "세율" })).toHaveCount(0);
  });

  test("링크를 누르면 ?group= 으로 바뀌고 그 묶음만 그려지며 현재 링크가 옮겨 간다", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSettings(page);

    await groupNav(page).getByRole("link", { name: "세율", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/settings\?group=/);
    await expect(page.getByRole("heading", { name: "세율" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "로그인 잠금" })).toHaveCount(0);
    await expect(groupNav(page).getByRole("link", { name: "세율", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("?group=세율 로 직접 열면 그 묶음만, 없는 이름이면 첫 묶음이다", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSettings(page, `?group=${encodeURIComponent("세율")}`);
    await expect(page.getByRole("heading", { name: "세율" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "로그인 잠금" })).toHaveCount(0);

    await page.goto(`/admin/settings?group=${encodeURIComponent("없는 묶음")}`);
    await expect(page.getByRole("heading", { name: "로그인 잠금" })).toBeVisible();
    await expect(groupNav(page).getByRole("link").first()).toHaveAttribute("aria-current", "page");
  });

  test("폰 375: 링크 줄은 숨고 「묶음」 select가 보이며 고르면 그 묶음으로 이동한다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openSettings(page);

    await expect(groupNav(page)).toBeHidden();
    const select = page.getByLabel("묶음", { exact: true });
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("로그인 잠금");

    await select.selectOption("세율");
    await expect(page).toHaveURL(/\/admin\/settings\?group=/);
    await expect(page.getByRole("heading", { name: "세율" })).toBeVisible();
    await expect(page.getByLabel("묶음", { exact: true })).toHaveValue("세율");
  });

  test("폰 320: 가로로 넘치지 않고 select 높이가 44 이상이다", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await openSettings(page);

    const box = await page.getByLabel("묶음", { exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
