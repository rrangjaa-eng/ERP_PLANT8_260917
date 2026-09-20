import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 02-08 갭 클로저 — 폰 375 계산값. 파일명 접두어 "mobile-"이 mobile-375 프로젝트
// 에서만 돌게 한다(playwright.config.ts MOBILE_SPEC_PATTERN).

async function loginAs(page: Page, roleId: string): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ roleId });
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
    await loginAs(page, SYSADMIN_ROLE_ID);

    await page.goto("/admin/system-status");
    const firstDt = page.locator("main dt").first();
    const box = await firstDt.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(83);
    expect(box!.width).toBeLessThanOrEqual(85);
  });
});

test.describe("폰 375 하단 탭 현재 표시 (02-08 Task 3, WR-01)", () => {
  test("/에서 하단 탭 현재가 하나이고 계산값이 현재 표시다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/");

    const current = page.locator('nav[aria-label="하단 탭"] [aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText("내 차례");
    await expect(current).toHaveCSS("color", "rgb(0, 84, 70)");
    const boxShadow = await current.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(boxShadow).toContain("inset");
  });

  test("/projects에서 현재 탭 텍스트가 프로젝트다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/projects");

    const current = page.locator('nav[aria-label="하단 탭"] [aria-current="page"]');
    await expect(current).toHaveText("프로젝트");
  });

  test("/account에서는 하단 탭 현재가 없다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/account");

    const current = page.locator('nav[aria-label="하단 탭"] [aria-current="page"]');
    await expect(current).toHaveCount(0);
  });
});
