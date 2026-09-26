import { test, expect } from "@playwright/test";
import { createCertEvent } from "./helpers/cert";

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

// Regression: ISSUE-001 — 「다른 이름 고르기」로 E2에 돌아오면 목록 전체가 비활성으로 남았다
// Found by /qa on 2026-09-26
// Report: .gstack/qa-reports/qa-report-localhost-2026-09-26.md
test("다른 이름 고르기로 돌아온 E2 목록은 다시 고를 수 있다", async ({ page }) => {
  const { link } = await createCertEvent({
    name: "QA회귀행사",
    winners: [
      { name: "김하늘", phone: "010-4821-7730" },
      { name: "이도윤", phone: "010-2231-0045", delivery: "parcel" },
    ],
  });

  await page.goto(link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(page.getByLabel("전화번호 뒤 4자리")).toBeVisible();

  await page.getByRole("button", { name: "다른 이름 고르기" }).click();
  const rows = page.getByRole("listitem").getByRole("button");
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all()) await expect(row).toBeEnabled();
  await expect(page.getByRole("listitem").getByText("…")).toHaveCount(0);

  await page.getByRole("button", { name: "이*윤" }).click();
  await expect(page.getByText("이*윤")).toBeVisible();
  await expect(page.getByLabel("전화번호 뒤 4자리")).toBeVisible();
});
