import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { loginAsSysadmin } from "./row-actions-helpers";

// 04.6 PR #158 /review P2 — 옆 패널 폼의 동기 이중 제출 잠금은 `PanelForm.handleSubmit` 한 곳이 가진다.
// 폼마다 따로 두던 잠금이 없는 폼(계급 · 본부)도 빠른 Ctrl+Enter 연타나 더블클릭에 서버 액션이 한 번만 돈다.

const PANEL = 'dialog[data-ui="side-panel"]';

// 서버 액션은 현재 경로로 POST된다 — 느리게 만들어 두 번째 제출이 첫 응답 전에 들어가게 하고 POST 수를 센다.
async function countPosts(page: Page, pathname: string): Promise<{ readonly count: number }> {
  const counter = { count: 0 };
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      if (route.request().method() === "POST") {
        counter.count += 1;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await route.continue();
    },
  );
  return counter;
}

// 첫 POST가 나가고 응답까지 끝나 네트워크가 가라앉을 때까지 — 늦게 나가는 두 번째 POST도 센 뒤에 판정한다.
async function settle(page: Page, posts: { readonly count: number }): Promise<void> {
  await expect.poll(() => posts.count).toBeGreaterThan(0);
  await page.waitForLoadState("networkidle");
}

// 두 번째 제출이 첫 제출의 다음 렌더(`pending`)보다 먼저 들어오는 가장 빠른 타이밍 — 한 태스크 안에서 1차를 두 번 누른다.
async function submitTwiceInOneTask(button: Locator): Promise<void> {
  await button.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
}

test.describe("옆 패널 폼 이중 제출 잠금", () => {
  test("계급 추가 — 1차를 연달아 눌러도 액션이 한 번만 돈다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/people/roles?new=1");
    const dialog = page.locator(PANEL);
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("이름").fill(`연타계급-${randomUUID().slice(0, 6)}`);
    const posts = await countPosts(page, "/admin/people/roles");
    await submitTwiceInOneTask(dialog.getByRole("button", { name: /계급 추가/ }));
    await settle(page, posts);
    expect(posts.count).toBe(1);
    await expect(dialog.getByRole("status")).toHaveText("계급 추가됨");
  });

  test("본부 추가 — 1차를 연달아 눌러도 액션이 한 번만 돈다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/people/org?new=org");
    const dialog = page.locator(PANEL);
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("이름").fill(`연타본부-${randomUUID().slice(0, 6)}`);
    const posts = await countPosts(page, "/admin/people/org");
    await submitTwiceInOneTask(dialog.getByRole("button", { name: /본부 추가/ }));
    await settle(page, posts);
    expect(posts.count).toBe(1);
    await expect(dialog.getByRole("status")).toHaveText("본부 추가됨");
  });
});
