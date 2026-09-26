import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { certEvents } from "@/db/schema";
import { createCertEvent } from "./helpers/cert";

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

// Regression: ISSUE-002 — 외부 수령자 화면에 UI-SPEC E1 상단 바(워드마크 PLANT8 +
// 「기타소득 지급 확인」)가 어느 상태에도 없었다
// Found by /qa on 2026-09-26
// Report: .gstack/qa-reports/qa-report-localhost-2026-09-26.md
async function expectTopBar(page: Page) {
  const banner = page.getByRole("banner");
  await expect(banner).toHaveCount(1);
  await expect(banner).toHaveText("PLANT8기타소득 지급 확인");
  await expect(page.getByRole("main")).toHaveCount(1);
}

test("열린 링크 · 닫힌 링크 · 없는 링크 모두 상단 바가 선다", async ({ page }) => {
  const open = await createCertEvent({ name: "QA상단바", winners: [{ name: "김하늘", phone: "010-4821-7730" }] });
  await page.goto(open.link);
  await expectTopBar(page);

  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(page.getByLabel("전화번호 뒤 4자리")).toBeVisible();
  await expectTopBar(page);

  const closed = await createCertEvent({ name: "QA상단바닫힘", winners: [{ name: "이도윤", phone: "010-2231-0045" }] });
  await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, closed.eventId));
  await page.goto(closed.link);
  await expect(page.getByText("이 링크는 닫혔습니다")).toBeVisible();
  await expectTopBar(page);

  const missing = await page.goto("/c/qa-no-such-token");
  expect(missing?.status()).toBe(404);
  await expect(page.getByText("링크를 찾을 수 없습니다")).toBeVisible();
  await expectTopBar(page);
});
