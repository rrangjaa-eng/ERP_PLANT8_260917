import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// 04.6-26 후보 8(열림 모션) 범위 — 폰(700 미만)의 확인 창은 시트라 PC 열림 모션이 없다(UQ-4 답: 모달 · 토스트 · 메뉴, 옆 패널 · 시트 제외).

async function login(page: Page): Promise<void> {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("폰 확인 창(시트)에는 PC 열림 모션이 없다", async ({ page }) => {
  await login(page);
  await page.goto("/dev/components");
  await page.getByRole("button", { name: "모달 열기" }).click();
  const dialog = page.locator("dialog:modal");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("폰 토스트는 그대로 같은 열림 모션이다(토스트는 폭과 무관)", async ({ page }) => {
  await login(page);
  await page.goto("/dev/components");
  await page.getByRole("button", { name: "토스트 띄우기" }).click();
  const toast = page.getByRole("status").filter({ hasText: "저장됨" });
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((el) => getComputedStyle(el).animationName)).toContain("toast-in");
});
