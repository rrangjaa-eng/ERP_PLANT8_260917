import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";

// 02-08 갭 클로저 — 폰 375 계산값. 파일명 접두어 "mobile-"이 mobile-375 프로젝트
// 에서만 돌게 한다(playwright.config.ts MOBILE_SPEC_PATTERN).

async function loginAs(page: Page, isAdmin: boolean): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ isAdmin });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return user;
}

test.describe("폰 375 페이지 층 (02-08 Task 1)", () => {
  test("/login body가 폰 1단계 위 크기다", async ({ page }) => {
    await page.goto("/login");
    const body = page.locator("body");

    await expect(body).toHaveCSS("font-size", "15px");
    const lineHeight = await body.evaluate((el) => getComputedStyle(el).lineHeight);
    expect(Number.parseFloat(lineHeight)).toBeCloseTo(24, 0);
  });
});

test.describe("폰 375 시스템 상태 목록 (02-08 Task 1)", () => {
  test("dt 라벨 폭이 84px다", async ({ page }) => {
    await loginAs(page, true);

    await page.goto("/admin/system-status");
    const firstDt = page.locator("main dt").first();
    const box = await firstDt.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(83);
    expect(box!.width).toBeLessThanOrEqual(85);
  });
});
