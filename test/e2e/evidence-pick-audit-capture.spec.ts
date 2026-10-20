import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { createIntakeManager, insertRecordFixture, setRecordVisibilityFixture } from "@/test/integration/fixtures/evidence";
import { setupExpenseE2E } from "./expense-fixture";
import { loginPage, waitForHydration } from "./leave-org";
import { clearEvidence } from "./helpers/evidence";

// 06.1-15 Task 2 ④ 캡처 쌍(BASE 9d411f2 · 이 가지) — 같은 시드 · 같은 흐름을 375 · 320 · 768 · 1280에서 찍는다. BASE에도 있는 API만 쓴다.
// 상태 셋: 붙이기 전 · 붙인 직후 · 붙은 채 연 문서에서 뗀 직후. 사진은 비교 기록용이고 판정은 evidence-pick-audit.spec.ts의 DOM 실측으로만 한다.
// CAPTURE_DIR · CAPTURE_TAG(적용전 | 적용후)가 없으면 건너뛴다.

const DIR = process.env.CAPTURE_DIR ?? "";
const TAG = process.env.CAPTURE_TAG ?? "";
const WIDTHS = [375, 320, 768, 1280] as const;

test.use({ actionTimeout: 15_000 });

async function state(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const submit = document.getElementById("expense-submit");
    const ids = (submit?.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), h: Math.round(r.height), display: getComputedStyle(el).display, visibility: getComputedStyle(el).visibility };
    };
    return {
      ariaDisabled: submit?.getAttribute("aria-disabled") ?? null,
      reason: ids.map((id) => (document.getElementById(id)?.innerText ?? "").replace(/\s+/g, " ").trim()).join(" / "),
      primary: document.querySelectorAll('[data-ui="primary-button"]').length,
      scroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
      approvalLine: rect(document.querySelector("#expense-form dl")),
      scheduledPaymentDate: rect(document.getElementById("scheduledPaymentDate")),
      formBar: rect(document.querySelector('[class*="formBar"]')),
      formBarPosition: document.querySelector('[class*="formBar"]') ? getComputedStyle(document.querySelector('[class*="formBar"]') as Element).position : null,
    };
  });
}

test("06.1-15 캡처 쌍 — 붙이기 전 · 붙인 직후 · 뗀 직후 × 375 · 320 · 768 · 1280", async ({ browser, baseURL }) => {
  test.skip(!DIR || !TAG, "CAPTURE_DIR · CAPTURE_TAG 없음");
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  const out = `${DIR}/measure-${TAG}.jsonl`;
  writeFileSync(out, "");
  for (const width of WIDTHS) {
    await clearEvidence();
    const fx = await setupExpenseE2E();
    const manager = await createIntakeManager();
    const recordId = await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
    await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: fx.teamId });
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.setViewportSize({ width, height: width < 700 ? 700 : 900 });
    const shot = async (name: string) => {
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await page.screenshot({ path: `${DIR}/${name}-${width}-${TAG}.png`, fullPage: true });
      appendFileSync(out, `${JSON.stringify({ name, width, tag: TAG, ...(await state(page) as object) })}\n`);
    };

    await page.goto(`/expenses/${expenseId}`);
    const trigger = page.getByRole("button", { name: "증빙 고르기 1" });
    await waitForHydration(trigger);
    await shot("붙이기전");

    await trigger.click();
    const picker = page.getByRole("dialog", { name: "증빙 고르기" });
    await expect(picker.locator("[aria-busy]")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(picker).toBeHidden();
    await expect(page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible").filter({ hasText: "고름" })).toHaveCount(1);
    await page.waitForTimeout(1500);
    await shot("붙인직후");

    await page.reload();
    const detach = page.getByRole("button", { name: "떼기" });
    await waitForHydration(detach);
    await detach.click();
    const dialog = page.getByRole("dialog", { name: "증빙 떼기" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("사유").fill("잘못 고름");
    await dialog.getByRole("button", { name: /^증빙 떼기/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("table", { name: "붙은 증빙" })).toHaveCount(0);
    await page.waitForTimeout(1500);
    await shot("뗀직후");
    await page.context().close();
  }
});
