import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// 04.6-06 — /dev/components 뼈대: 로그인 필요 · DetailScreen 틀 · 버튼 3위계 구역 · actions 순서(D4).
// 운영(prod) 404는 서버 게이트라 단위 테스트(dev-tools.test.ts)가 판정하고, E2E 서버는 APP_ENV=local이다.

test("로그인 없이 /dev/components를 열면 /login으로 간다", async ({ page }) => {
  await page.goto("/dev/components");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("로그인한 뒤", () => {
  test.beforeEach(async ({ page }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/dev/components");
  });

  test("제목은 DetailScreen h1이고 섹션 제목은 h2다", async ({ page }) => {
    await expect(page.locator('h1[data-ui="screen-title"]')).toHaveText("컴포넌트 모음");
    expect(await page.locator("main h2").count()).toBeGreaterThanOrEqual(3);
  });

  test("버튼 1차 · 2차 · 3차가 보이고 비활성은 aria-disabled다", async ({ page }) => {
    const main = page.locator("main");
    for (const name of ["1차 기본", "2차 기본", "3차 기본"]) {
      await expect(main.getByRole("button", { name })).toBeVisible();
    }
    const disabled = main.getByRole("button", { name: /^(1차|2차|3차) 비활성/ });
    await expect(disabled).toHaveCount(3);
    for (const b of await disabled.all()) {
      await expect(b).toHaveAttribute("aria-disabled", "true");
      expect(await b.getAttribute("disabled")).toBeNull();
    }
  });

  test("머리 행동 묶음 — DOM · x 좌표 · Tab 순서가 2차 → 1차이고 1차가 오른쪽 끝이다 (D4)", async ({ page }) => {
    const head = page.locator('[data-ui="screen-title"]').locator("xpath=ancestor::div[2]");
    const secondary = head.getByRole("button", { name: "표본 2차" });
    const primary = head.getByRole("button", { name: "표본 1차" });
    await expect(secondary).toBeVisible();
    await expect(primary).toBeVisible();

    const order = await head.locator("button").evaluateAll((els) => els.map((e) => e.textContent?.trim()));
    expect(order).toEqual(["표본 2차", "표본 1차"]);

    const s = await secondary.boundingBox();
    const p = await primary.boundingBox();
    if (!s || !p) throw new Error("버튼 상자를 잴 수 없다");
    expect(p.x).toBeGreaterThan(s.x);
    const headBox = await head.boundingBox();
    if (!headBox) throw new Error("머리 상자를 잴 수 없다");
    expect(Math.abs(p.x + p.width - (headBox.x + headBox.width))).toBeLessThanOrEqual(1);

    await secondary.focus();
    await page.keyboard.press("Tab");
    await expect(primary).toBeFocused();
  });
});
