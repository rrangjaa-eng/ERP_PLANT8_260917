import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// /design-review 2026-09-24 FINDING-001 + 사용자 결정 2026-09-24 「워드마크 = 홈 링크」 —
// PC 사용자가 지금 URL을 직접 치지 않으면 「내 차례」(/) 로 돌아갈 길이 없던 문제의 회귀 방지.

const WORDMARK = "PLANT8 내 차례";

async function login(page: Page): Promise<void> {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("PC 상단 바 워드마크 = 「내 차례」 홈 링크 (/design-review FINDING-001)", () => {
  test("워드마크가 보이고 href가 / 다", async ({ page }) => {
    await login(page);
    const wordmark = page.getByRole("banner").getByRole("link", { name: WORDMARK, exact: true });
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toHaveAttribute("href", "/");
  });

  test("/projects에서 워드마크를 마우스로 누르면 / 로 이동해 「내 차례」 제목이 보인다", async ({ page }) => {
    await login(page);
    await page.goto("/projects");

    const wordmark = page.getByRole("banner").getByRole("link", { name: WORDMARK, exact: true });
    await wordmark.click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { name: "내 차례", exact: true })).toBeVisible();
  });

  test("Tab 두 번(스킵 링크 다음)으로 워드마크에 닿고, 링이 --bar-fg이며 Enter로 / 에 도착한다", async ({
    page,
  }) => {
    await login(page);

    const barFg = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--bar-fg)";
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    });

    const wordmark = page.getByRole("banner").getByRole("link", { name: WORDMARK, exact: true });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "본문으로 건너뛰기" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(wordmark).toBeFocused();
    await expect(wordmark).toHaveCSS("outline-style", "solid");
    await expect(wordmark).toHaveCSS("outline-color", barFg);

    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { name: "내 차례", exact: true })).toBeVisible();
  });

  test("워드마크 hover 시 밑줄이 생기고, 히트 영역이 32px 이상이며 바를 넘치지 않는다(§10 PC 하한)", async ({
    page,
  }) => {
    await login(page);

    const wordmark = page.getByRole("banner").getByRole("link", { name: WORDMARK, exact: true });
    await wordmark.hover();
    await expect(wordmark).toHaveCSS("text-decoration-line", "underline");

    const box = await wordmark.boundingBox();
    const header = await page.getByRole("banner").boundingBox();
    expect(box).not.toBeNull();
    expect(header).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(32);
    expect(box!.y).toBeGreaterThanOrEqual(header!.y);
    expect(box!.y + box!.height).toBeLessThanOrEqual(header!.y + header!.height);
  });
});
