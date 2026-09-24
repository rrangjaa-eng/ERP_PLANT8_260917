import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// /design-review 2026-09-24 FINDING-001 + 사용자 결정 2026-09-24 「워드마크 = 홈 링크」 —
// 폰(375)에서도 같은 TopBar가 그리므로 워드마크가 링크가 된다. 폰 §10 44×44 터치
// 목표와 폰 바 높이 44 불변을 함께 고정한다. 이 파일은 playwright.config.ts의
// "mobile-*.spec.ts" 규칙으로 mobile-375 프로젝트에서만 돈다.

const WORDMARK = "PLANT8 내 차례";

async function login(page: Page): Promise<void> {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("폰 375 상단 바 워드마크 = 「내 차례」 홈 링크 (/design-review FINDING-001)", () => {
  test("바 높이 44 불변 · 워드마크 44×44 이상 · 바를 넘치지 않는다 · 누르면 / 로 간다", async ({ page }) => {
    await login(page);
    await page.goto("/projects");

    const header = page.getByRole("banner");
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(headerBox!.height).toBeCloseTo(44, 0);

    const wordmark = header.getByRole("link", { name: WORDMARK, exact: true });
    const box = await wordmark.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y).toBeGreaterThanOrEqual(headerBox!.y);
    expect(box!.y + box!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height);

    await wordmark.click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { name: "내 차례", exact: true })).toBeVisible();
  });
});
