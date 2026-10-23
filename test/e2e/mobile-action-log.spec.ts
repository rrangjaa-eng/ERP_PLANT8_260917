import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { recordAction } from "@/domain/action-log/record";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loginAsSysadmin } from "./row-actions-helpers";
import { insertKstMidnightRow } from "./action-log-kst-fixture";

// 07-25 K16 · SC-08 · U9 — 폰(375 · 320)에서 행동 로그 행은 두 줄(P1 발생 시각 + 행동 종류 / 접힌 줄 첫 요소 = 상세 첫 줄)이고,
// 행을 탭하면 시트에 바뀐 칸 전체가 보인다. 시트를 닫으면 포커스는 그 행 트리거로 돌아간다.
// mobile-*.spec.ts 접두어라 playwright.config.ts의 mobile-375 프로젝트에서만 돈다.
async function recordFourChangeRow(token: string): Promise<void> {
  await recordAction(SYSTEM_VIEWER, {
    actionType: "settings_change",
    entity: "e2e_settings",
    entityId: token,
    detail: {
      scope: "import",
      changes: {
        "tax.vat.rate": [0.1, 0.12],
        "auth.lockout.threshold": [5, 10],
        accountNumber: ["110123451234", "220987655678"],
        password: ["x-old-secret", "y-new-secret"],
      },
    },
  });
}

test.describe("행동 로그 폰 행 탭 시트 (07-25 K16)", () => {
  test("행 두 줄 — 접힌 줄 첫 요소가 상세 첫 줄 · 탭하면 시트에 네 줄 전부 · 닫으면 포커스가 그 행으로", async ({ page }) => {
    const token = `e2e-phone-${randomUUID().slice(0, 8)}`;
    await recordFourChangeRow(token);
    await loginAsSysadmin(page);
    await page.goto("/admin/action-log?actionType=settings_change");

    const folded = page.locator('td[role="button"]', { hasText: token }).first();
    await expect(folded).toBeVisible();
    // 접힌 줄의 첫 요소 = 상세 첫 줄(행위자 · 대상보다 앞 — U9).
    const firstText = (await folded.locator("span").first().innerText()).trim();
    expect(firstText).toMatch(/ · .+ → .+/);
    const foldedText = await folded.innerText();
    expect(foldedText.indexOf(firstText)).toBe(0);
    expect(foldedText.indexOf(token)).toBeGreaterThan(firstText.length);
    // 접힌 줄에는 첫 줄만 — 넷째 칸 줄은 시트에서 본다.
    expect(foldedText).not.toContain("잠금 횟수");

    await folded.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const labels = await sheet.locator("dt").allInnerTexts();
    for (const label of ["부가세율", "계좌번호", "비밀번호"]) expect(labels).toContain(label);
    // 상세 네 줄 + 행위자 · 계급 · 대상 · 문서
    const values = await sheet.locator("dd").allInnerTexts();
    expect(values).toEqual(expect.arrayContaining(["0.1 → 0.12", "····1234 → ····5678", "바뀜 → 바뀜"]));
    expect(labels.filter((label) => ["부가세율", "계좌번호", "비밀번호"].includes(label))).toHaveLength(3);
    expect(labels).toHaveLength(8);
    expect(await sheet.innerText()).not.toMatch(/\{"|secret|110123451234/);
    // 시트 첫 상세 줄이 접힌 줄의 첫 요소와 같다.
    const lineTexts = await Promise.all(
      (await sheet.locator("dt").all()).map(async (dt, index) => `${await dt.innerText()} · ${await sheet.locator("dd").nth(index).innerText()}`),
    );
    expect(lineTexts).toContain(firstText);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(folded).toBeFocused();
  });

  // DOM 감사 P1: Tab만으로 필터 줄을 지나 행 트리거까지 가고, 그 사이 페이지가 다시 불러지지 않는다.
  test("Tab만으로 필터 줄을 지나 행 트리거까지 가고 페이지가 다시 불러지지 않는다", async ({ page }) => {
    const token = `e2e-phone-tab-${randomUUID().slice(0, 8)}`;
    await insertKstMidnightRow(token);
    await loginAsSysadmin(page);
    await page.goto(`/admin/action-log?documentId=${token}`);
    const folded = page.locator('td[role="button"]', { hasText: token }).first();
    await expect(folded).toBeVisible();
    await page.evaluate(() => document.body.setAttribute("data-tab-marker", "1"));

    let reachedRow = false;
    for (let step = 0; step < 80 && !reachedRow; step += 1) {
      await page.keyboard.press("Tab");
      reachedRow = await page.evaluate(() => document.activeElement?.matches('td[role="button"]') ?? false);
    }
    expect(reachedRow).toBe(true);
    expect(await page.evaluate(() => document.body.getAttribute("data-tab-marker"))).toBe("1");
    await expect(folded).toBeFocused();
  });

  test("320 폭에서도 가로 넘침이 없고 상세가 말줄임 없이 줄바꿈된다", async ({ page }) => {
    const token = `e2e-phone320-${randomUUID().slice(0, 8)}`;
    await recordFourChangeRow(token);
    await loginAsSysadmin(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/admin/action-log?actionType=settings_change");
    const folded = page.locator('td[role="button"]', { hasText: token }).first();
    await expect(folded).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const clipped = await folded.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(clipped).toBe(false);
  });
});
