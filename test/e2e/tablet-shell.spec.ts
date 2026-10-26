import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// 02-VERIFICATION 사람 판정 2 해소: SYSTEM.md §6-0의 폰 경계(<700px)는 미디어 쿼리
// 존재만 확인됐고 700–1023 뷰포트를 실제로 렌더한 테스트가 없었다. Playwright
// 프로젝트가 desktop·mobile-375 둘뿐이라 여기서는 뷰포트를 테스트 안에서 바꾼다
// (desktop 프로젝트 · 파일명이 mobile-* 패턴이 아니므로 폰 프로젝트에 중복 등록되지
// 않는다).

async function loginAsEmployee(page: Page): Promise<void> {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("태블릿 700–1279 뷰포트는 48px 바 + 가림 레일 셸이다 (§6-0)", () => {
  for (const width of [700, 900, 1279]) {
    test(`${width}px: 주 메뉴는 ≡ 뒤에 있고 하단 탭이 없으며 가로 스크롤이 없다`, async ({ page }) => {
      await loginAsEmployee(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");

      const mainMenu = page.getByRole("navigation", { name: "주 메뉴" });
      await expect(mainMenu).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "하단 탭" })).toBeHidden();
      await expect(page.getByRole("banner")).toHaveCSS("height", "48px");

      await page.getByRole("button", { name: "메뉴" }).click();
      await expect(mainMenu).toBeVisible();
      await expect(mainMenu.locator("a")).toHaveCount(5);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }

  test("≡로 열고 Esc로 닫으면 포커스가 ≡로 돌아오고, 항목을 누르면 이동하며 닫힌다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "메뉴" });
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "메뉴" });
    await expect(sheet).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await sheet.getByRole("link", { name: "프로젝트", exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("dialog", { name: "메뉴" })).toBeHidden();
  });

  test("가림 레일이 열린 채 1280으로 넓히면 닫히고 고정 레일이 주 메뉴 한 벌로 선다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/");

    await page.getByRole("button", { name: "메뉴" }).click();
    await expect(page.getByRole("dialog", { name: "메뉴" })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole("dialog", { name: "메뉴" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "주 메뉴" })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
    await expect(page.getByRole("banner")).toHaveCSS("width", "176px");
  });
  test("699px로 줄이면 하단 탭 4개로 전환되고 주 메뉴가 사라진다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.setViewportSize({ width: 699, height: 900 });
    await page.goto("/");

    const tabs = page.getByRole("navigation", { name: "하단 탭" });
    await expect(tabs).toBeVisible();
    await expect(tabs.locator("a, button")).toHaveCount(4);
    await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeHidden();
  });

  test("가림 레일이 닫힌 채 1200에서 포커스를 두고 1440으로 넓혀도 포커스가 그대로다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto("/");

    const home = page.getByRole("link", { name: "PLANT8 내 차례" });
    await home.focus();
    await expect(home).toBeFocused();

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole("banner")).toHaveCSS("width", "176px");
    await expect(home).toBeFocused();
  });

  test("가림 레일이 열린 채 900에서 650으로 줄이면 닫히고 포커스가 본문으로 간다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/");

    await page.getByRole("button", { name: "메뉴" }).click();
    await expect(page.getByRole("dialog", { name: "메뉴" })).toBeVisible();

    await page.setViewportSize({ width: 650, height: 900 });
    await expect(page.getByRole("dialog", { name: "메뉴" })).toBeHidden();
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("650에서 연 사용자 메뉴는 700 이상으로 넓히면 닫힌다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.setViewportSize({ width: 650, height: 900 });
    await page.goto("/");

    await page.getByRole("button", { name: "E2E Employee" }).click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
});
