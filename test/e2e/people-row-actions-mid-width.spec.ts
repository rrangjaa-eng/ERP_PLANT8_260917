import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./people-list-helpers";

// Regression: /design-review FINDING-001(2026-09-30) — DR-7로 행 동작을 inline-flex(.rowActions)로 감싼 뒤,
// 동작 칸이 좁은 PC 폭(700~약 1050)에서 flex 항목이 줄어 「상세」가 「상/세」 두 줄로 쪼개졌다(768에서 25행 중 21행).
// SYSTEM §11 DOM 감사 폭은 1280 · 1024 · 375 + 열 접기 경계 700.
test.describe("사람 목록 「상세」는 PC 중간 폭에서도 한 줄이다 (FINDING-001)", () => {
  for (const width of [700, 768, 1024]) {
    test(`${width}px — 모든 행의 「상세」 높이가 한 줄 행간 이하다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await loginAsAdmin(page);
      await page.goto("/admin/people");
      const links = page.locator("tbody").getByRole("link", { name: "상세", exact: true });
      await expect(links.first()).toBeVisible();

      const broken = await links.evaluateAll((elements) =>
        elements
          .map((element) => ({
            height: element.getBoundingClientRect().height,
            lineHeight: parseFloat(getComputedStyle(element).lineHeight),
          }))
          .filter(({ height, lineHeight }) => height > lineHeight + 1),
      );
      expect(broken).toEqual([]);
    });
  }
});
