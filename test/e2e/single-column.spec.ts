import { test, expect, type Page, type Locator } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// F-02(260922-o2b) — SYSTEM.md §3 「단일 기둥 최대 폭」의 DOM 회귀. desktop
// 프로젝트 전용(1280 뷰포트 기본값). 태스크 2가 관리자 화면·폼 케이스를 더한다.

async function loginAs(page: Page, roleId: string): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ roleId });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return user;
}

// 뷰포트 폭 1280 전제로 폭 ≤ 720(그리고 > 0), x가 main h1의 x와 1px 안에서
// 같음(왼쪽 정렬)을 확인한다. 태스크 2가 관리자 화면·폼 케이스에 재사용한다.
async function expectSingleColumn(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.width).toBeLessThanOrEqual(720);

  const h1Box = await page.locator("main h1").first().boundingBox();
  expect(h1Box).not.toBeNull();
  expect(Math.abs(box!.x - h1Box!.x)).toBeLessThanOrEqual(1);
}

test.describe("단일 기둥 최대 폭 — /account (F-02 트레이서)", () => {
  test("1280에서 비밀번호 변경 폼이 720px 이하로 main h1과 같은 x에서 시작한다", async ({ page }) => {
    expect(page.viewportSize()?.width).toBe(1280);

    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/account");

    const currentPasswordInput = page.getByLabel("현재 비밀번호");
    const form = page.locator("form", { has: currentPasswordInput });

    await expectSingleColumn(page, form);

    const inputBox = await currentPasswordInput.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(inputBox!.width).toBeLessThanOrEqual(720);
  });
});
