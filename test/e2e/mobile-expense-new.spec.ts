import { test, expect, type Page } from "@playwright/test";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E } from "./expense-fixture";

// 05-07 Task 1(R6-04 · UI-SPEC S14 · SYSTEM §7-8) — 폰 골라내기 시트: 계산된 `max-height`가 토큰 `--sheet-max-h`(뷰포트 높이 × 0.88, 동적 뷰포트 단위) 값이고
// 행동 줄 버튼 높이가 `--touch-min` 이상이다. 파일 이름이 `mobile-*`라 mobile-375 프로젝트가 잡는다. 기대 값은 계산된 토큰 값과 비교한다(px 리터럴 없음).

const PHONE = { width: 375, height: 800 };

async function tokenPx(page: Page, name: string): Promise<number> {
  return page.evaluate((token) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;height:var(${token})`;
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  }, name);
}

test.describe("폰 골라내기 시트 (R6-04)", () => {
  test("거래처 고르기 시트의 최대 높이는 --sheet-max-h이고 아래에 붙으며 행동 줄 버튼은 --touch-min 이상이다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm, PHONE);
    await page.goto("/expenses/new");
    const trigger = page.getByRole("button", { name: "거래처 고르기" });
    await waitForHydration(trigger);
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "거래처 고르기" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("option").first()).toBeVisible();

    const sheetMax = await tokenPx(page, "--sheet-max-h");
    expect(sheetMax).toBeCloseTo(PHONE.height * 0.88, 0);
    const measured = await sheet.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return { maxHeight: parseFloat(style.maxHeight), bottom: box.bottom, height: box.height, innerHeight: window.innerHeight };
    });
    expect(measured.maxHeight).toBeCloseTo(sheetMax, 0);
    expect(measured.height).toBeLessThanOrEqual(sheetMax + 1);
    expect(measured.bottom).toBeCloseTo(measured.innerHeight, 0);

    const touchMin = await tokenPx(page, "--touch-min");
    const cancel = await sheet.getByRole("button", { name: /^취소/ }).boundingBox();
    const primary = await sheet.getByRole("button", { name: /^이 거래처로/ }).boundingBox();
    expect(cancel?.height ?? 0).toBeGreaterThanOrEqual(touchMin - 0.5);
    expect(primary?.height ?? 0).toBeGreaterThanOrEqual(touchMin - 0.5);
    // 1차가 2차의 두 배 폭(§7-8 시트 행동 줄).
    expect((primary?.width ?? 0) / (cancel?.width ?? 1)).toBeGreaterThan(1.8);

    // 닫기 x(폰만)도 터치 영역을 지킨다.
    const close = await sheet.getByRole("button", { name: "닫기" }).boundingBox();
    expect(close?.height ?? 0).toBeGreaterThanOrEqual(touchMin - 0.5);
    expect(close?.width ?? 0).toBeGreaterThanOrEqual(touchMin - 0.5);
    await sheet.getByRole("button", { name: "닫기" }).click();
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("웨이브 9 D3 · D4 — 시트 높이는 고정이고 시트와 증빙 올리기에 kbd를 그리지 않는다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm, PHONE);
    await page.goto("/expenses/new");
    const trigger = page.getByRole("button", { name: "거래처 고르기" });
    await waitForHydration(trigger);
    await expect(page.getByRole("button", { name: /^증빙 올리기/ }).locator("kbd:visible")).toHaveCount(0);
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "거래처 고르기" });
    await expect(sheet.getByRole("option").first()).toBeVisible();
    await expect(sheet.locator("kbd:visible")).toHaveCount(0);
    const full = (await sheet.boundingBox())?.height ?? 0;
    await sheet.getByRole("textbox", { name: "거래처 이름 검색" }).fill("없는거래처-zzzz");
    await expect(sheet.getByText("조건에 맞는 거래처가 없습니다 ·")).toBeVisible();
    expect((await sheet.boundingBox())?.height ?? 0).toBeCloseTo(full, 0);
  });
});
