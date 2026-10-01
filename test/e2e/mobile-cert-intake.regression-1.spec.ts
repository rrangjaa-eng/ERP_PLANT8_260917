import { test, expect } from "@playwright/test";
import { createCertEvent } from "./helpers/cert";

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

// Regression: ISSUE-001 — 「다른 이름 고르기」로 E2에 돌아오면 목록 전체가 비활성으로 남았다
// Found by /qa on 2026-09-26
// Report: .gstack/qa-reports/qa-report-localhost-2026-09-26.md
// 04.3-15 — 명단이 없어져 같은 회귀를 「다른 경품 고르기」로 돌아온 E′2에서 본다.
test("다른 경품 고르기로 돌아온 E′2 목록은 다시 고를 수 있다 · 포커스 = 방금 고른 행", async ({ page }) => {
  const { link } = await createCertEvent({
    name: "QA회귀행사",
    prizes: [
      { name: "갤럭시 탭 S10", delivery: "onsite" },
      { name: "다이슨 에어랩", unitValueKrw: 599_000, delivery: "parcel" },
    ],
  });
  if (!link) throw new Error("링크 없음");

  await page.goto(link);
  await page.getByRole("button", { name: /^갤럭시 탭 S10/ }).click();
  await expect(page.getByText("갤럭시 탭 S10 1개", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "다른 경품 고르기" }).click();
  const rows = page.getByRole("listitem").getByRole("button");
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all()) await expect(row).toBeEnabled();
  await expect(page.getByRole("button", { name: /^갤럭시 탭 S10/ })).toBeFocused();

  await page.getByRole("button", { name: /^다이슨 에어랩/ }).click();
  await expect(page.getByText("다이슨 에어랩 1개", { exact: true })).toBeVisible();
  await expect(page.locator("#address")).toBeVisible();
});
