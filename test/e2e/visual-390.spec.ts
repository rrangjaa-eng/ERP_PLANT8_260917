import { test, expect } from "@playwright/test";
import { VISUAL_SCREENS, VISUAL_SCREENSHOT_OPTIONS, loginForVisual, openForVisual } from "./visual-fixtures";

// 04.6-13(SC 4 · R2) — 화면 사진 비교 · 폭 390. 기준 사진은 CI의 Playwright Chromium에서만 유효하다(공통 §9 0단계가 만든다).
// 로컬은 건너뛴다 — 로컬 결정성 확인만 VISUAL_LOCAL=1(기준 사진이 아니라 같은 조건 두 번의 일치만 본다).
test.skip(
  process.env.GITHUB_ACTIONS !== "true" && process.env.VISUAL_LOCAL !== "1",
  "기준 사진은 GitHub Actions의 CI Chromium(Playwright 1.63 번들)에서만 유효 — 로컬 결정성 확인만 VISUAL_LOCAL=1",
);

test.use({ viewport: { width: 390, height: 844 } });

for (const screen of VISUAL_SCREENS) {
  test(`화면 사진 — ${screen.name} 390`, async ({ page }) => {
    const fixtures = await loginForVisual(page);
    await openForVisual(page, screen.url(fixtures), screen.ready);
    await expect(page).toHaveScreenshot(`${screen.name}-390.png`, {
      ...VISUAL_SCREENSHOT_OPTIONS,
      mask: screen.mask?.(page) ?? [],
    });
  });
}
