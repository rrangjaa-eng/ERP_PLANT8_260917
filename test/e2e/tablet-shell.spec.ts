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

test.describe("태블릿 700–1023 뷰포트는 PC 셸을 유지한다 (§6-0 폰 경계)", () => {
  for (const width of [700, 900, 1023]) {
    test(`${width}px: 상단 바 주 메뉴가 보이고 하단 탭이 없으며 가로 스크롤이 없다`, async ({ page }) => {
      await loginAsEmployee(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");

      const mainMenu = page.getByRole("navigation", { name: "주 메뉴" });
      await expect(mainMenu).toBeVisible();
      await expect(mainMenu.locator("a")).toHaveCount(5);
      await expect(page.getByRole("navigation", { name: "하단 탭" })).toBeHidden();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }

  test("699px로 줄이면 하단 탭 4개로 전환되고 주 메뉴가 사라진다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.setViewportSize({ width: 699, height: 900 });
    await page.goto("/");

    const tabs = page.getByRole("navigation", { name: "하단 탭" });
    await expect(tabs).toBeVisible();
    await expect(tabs.locator("a, button")).toHaveCount(4);
    await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeHidden();
  });
});
