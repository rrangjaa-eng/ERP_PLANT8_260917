import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";

// WR-02·WR-03(02-REVIEW.md) — 사용자 메뉴가 role="menu"/"menuitem"으로 노출되는데
// 키보드·해제 동작이 그 약속을 지키지 않는다.
//   WR-02: WAI-ARIA menu 패턴은 ArrowDown/ArrowUp(+Home/End)으로 항목을 옮긴다.
//          지금은 Escape만 처리해서 화살표가 아무것도 안 한다(axe는 구조만 보고
//          동작은 못 봐서 잡히지 않는다).
//   WR-03: Tab으로 빠져나가거나 바깥을 클릭해도 메뉴가 열린 채 남아
//          aria-expanded="true"가 실제 상태와 어긋난다.
const USER_NAME = "E2E Admin"; // 관리자여야 시스템 상태까지 3항목이 된다

async function loginAndOpenMenu(page: Page): Promise<void> {
  const user = await createFixtureUser({ isAdmin: true });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("button", { name: USER_NAME }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

function focusedText(page: Page): Promise<string> {
  return page.evaluate(() => (document.activeElement?.textContent ?? "").trim());
}

test.describe("PC 사용자 메뉴 키보드·해제 (WR-02·WR-03)", () => {
  test("WR-02: ArrowDown이 다음 항목으로, ArrowUp이 이전 항목으로 옮긴다", async ({ page }) => {
    await loginAndOpenMenu(page);
    const items = await page.getByRole("menuitem").allTextContents();
    expect(items.length).toBeGreaterThanOrEqual(3);

    // 열면 첫 항목에 포커스가 있다(기존 동작).
    expect(await focusedText(page)).toBe(items[0]?.trim());

    await page.keyboard.press("ArrowDown");
    expect(await focusedText(page)).toBe(items[1]?.trim());

    await page.keyboard.press("ArrowDown");
    expect(await focusedText(page)).toBe(items[2]?.trim());

    await page.keyboard.press("ArrowUp");
    expect(await focusedText(page)).toBe(items[1]?.trim());
  });

  test("WR-02: 끝에서 한 바퀴 돈다 — 마지막에서 ArrowDown이면 첫 항목", async ({ page }) => {
    await loginAndOpenMenu(page);
    const items = await page.getByRole("menuitem").allTextContents();

    await page.keyboard.press("End");
    expect(await focusedText(page)).toBe(items[items.length - 1]?.trim());

    await page.keyboard.press("ArrowDown");
    expect(await focusedText(page)).toBe(items[0]?.trim());

    await page.keyboard.press("ArrowUp");
    expect(await focusedText(page)).toBe(items[items.length - 1]?.trim());

    await page.keyboard.press("Home");
    expect(await focusedText(page)).toBe(items[0]?.trim());
  });

  test("WR-03: 바깥을 클릭하면 닫힌다", async ({ page }) => {
    await loginAndOpenMenu(page);
    const trigger = page.getByRole("button", { name: USER_NAME });
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("main").click({ position: { x: 5, y: 5 } });

    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("WR-03: 마지막 항목에서 Tab으로 빠져나가면 닫힌다 — 포커스는 뺏지 않는다", async ({ page }) => {
    await loginAndOpenMenu(page);
    const trigger = page.getByRole("button", { name: USER_NAME });

    await page.keyboard.press("End");
    await page.keyboard.press("Tab");

    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    // Esc와 달리 Tab은 사용자가 의도적으로 나간 것이므로 트리거로 되돌리지 않는다.
    await expect(trigger).not.toBeFocused();
  });

  test("Esc는 그대로 닫고 트리거로 포커스를 되돌린다(기존 계약, 회귀 방지)", async ({ page }) => {
    await loginAndOpenMenu(page);
    const trigger = page.getByRole("button", { name: USER_NAME });

    await page.keyboard.press("Escape");

    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
