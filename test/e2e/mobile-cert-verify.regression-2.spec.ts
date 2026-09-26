import { test, expect, type Page, type Route } from "@playwright/test";
import { createCertEvent } from "./helpers/cert";

test.use({ viewport: { width: 375, height: 800 } });

// 04.3 머지 전 게이트 — /qa 독립 DOM 감사 · /design-review 회귀.
// 크기 · 속성은 계산 스타일과 DOM으로만 판정한다.

function last4Field(page: Page) {
  return page.getByLabel("전화번호 뒤 4자리");
}

function confirmButton(page: Page) {
  return page.getByRole("button", { name: /^전화번호 확인/ });
}

async function oneWinner(name: string) {
  return createCertEvent({ name, winners: [{ name: "김하늘", phone: "010-4821-7730" }] });
}

test("외부 1차 버튼 아래 이유 줄은 15px(§6-5 ①-k)", async ({ page }) => {
  const ev = await oneWinner("E2E게이트이유");
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(page.getByText("뒤 4자리 숫자를 적으면 확인할 수 있습니다", { exact: true })).toHaveCSS("font-size", "15px");
});

test("E6-c 링크 없음의 탭 제목은 「링크 없음」", async ({ page }) => {
  await page.goto("/c/this-token-does-not-exist-anywhere-00000001");
  await expect(page).toHaveTitle("링크 없음 · 기타소득 지급 확인");
});

test("E2 행 누름 대기 중 누른 행은 aria-disabled로 포커스를 지킨다(§7-1)", async ({ page }) => {
  const ev = await oneWinner("E2E게이트행");
  await page.goto(ev.link);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let held = false;
  await page.route(ev.link, async (route: Route) => {
    if (!held && route.request().method() === "POST") {
      held = true;
      await gate;
    }
    await route.continue();
  });
  const row = page.getByRole("button", { name: /^김\*늘/ });
  await row.click();
  await expect(row).toHaveAttribute("aria-disabled", "true");
  expect(await row.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(false);
  await expect(row).toBeFocused();
  release();
  await expect(last4Field(page)).toBeVisible();
});

test("E3 결과 불명 줄은 aria-live polite 영역 안에 있다", async ({ page }) => {
  const ev = await oneWinner("E2E게이트불명");
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  let aborted = false;
  await page.route(ev.link, async (route: Route) => {
    if (!aborted && route.request().method() === "POST" && (route.request().postData() ?? "").includes('"last4"')) {
      aborted = true;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await last4Field(page).fill("0000");
  await confirmButton(page).click();
  const line = page.getByText("확인 결과를 받지 못했습니다 · 다시 눌러 주세요", { exact: true });
  await expect(line).toBeVisible();
  expect(await line.evaluate((el) => el.closest('[aria-live="polite"]') !== null)).toBe(true);
});
