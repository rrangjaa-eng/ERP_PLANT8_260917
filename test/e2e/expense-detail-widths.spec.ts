import { test, expect, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { attachEvidence } from "../integration/fixtures/expenses";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E } from "./expense-fixture";

// 07-28 폭 실측(INV-DEC:25 「폰에서도 펼침」 · SC-02 ④): 375 · 320 · 768 · 1280 폭에서 `상세` 칸이 접힌 영역(details/summary · hidden · aria-hidden) 밖에 있고,
// 칸 아래 `상세 · 입력`이 잘리지 않으며(스크롤 폭 ≤ 칸 폭, 칸 오른쪽 ≤ 화면 폭), 페이지에 가로 스크롤이 없다. DOM 값으로만 판정한다(스크린샷 육안 없음).

const WIDTHS = [
  { width: 375, height: 800 },
  { width: 320, height: 568 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

async function measure(page: Page) {
  return page.evaluate(() => {
    const note = document.getElementById("note");
    const error = document.getElementById("note-error");
    if (!note) return null;
    const rect = note.getBoundingClientRect();
    const errRect = error?.getBoundingClientRect() ?? null;
    const inCollapsed = Boolean(note.closest("details, [hidden], [aria-hidden='true'], [inert]"));
    const root = document.documentElement;
    return {
      inCollapsed,
      noteVisible: rect.width > 0 && rect.height > 0,
      noteRight: Math.round(rect.right),
      noteLeft: Math.round(rect.left),
      viewport: window.innerWidth,
      pageOverflowX: root.scrollWidth > root.clientWidth,
      errorText: error?.textContent ?? null,
      errorClipped: error ? error.scrollWidth > error.clientWidth || (errRect ? errRect.right > window.innerWidth || errRect.left < 0 : false) : null,
      errorHeight: errRect ? Math.round(errRect.height) : null,
    };
  });
}

test.describe("상세 칸 폭 실측 (07-28)", () => {
  for (const size of WIDTHS) {
    test(`${size.width}px — 상세 칸은 펼친 영역 · 오류 줄 잘림 없음 · 가로 스크롤 없음`, async ({ browser, baseURL }) => {
      const fx = await setupExpenseE2E();
      const page = await loginPage(browser, baseURL, fx.pm);
      await page.setViewportSize(size);
      const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id] });
      const id = created.created[0]?.expenseId ?? "";
      await attachEvidence(fx.pm.viewer, id);
      await page.goto(`/expenses/${id}`);
      await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));

      const field = page.locator("#note");
      await field.scrollIntoViewIfNeeded();
      const before = await measure(page);
      expect(before).not.toBeNull();
      expect(before?.inCollapsed).toBe(false);
      expect(before?.noteVisible).toBe(true);
      expect(before?.noteLeft).toBeGreaterThanOrEqual(0);
      expect(before?.noteRight).toBeLessThanOrEqual(size.width);
      expect(before?.pageOverflowX).toBe(false);

      await page.getByRole("button", { name: /^지출결의 제출/ }).click({ force: true });
      await expect(page.locator("#note-error")).toHaveText("상세 · 입력");
      const after = await measure(page);
      expect(after?.errorClipped).toBe(false);
      expect(after?.errorHeight).toBeGreaterThan(0);
      expect(after?.pageOverflowX).toBe(false);
      console.log(`DOM ${size.width}`, JSON.stringify({ before, after }));
      await page.context().close();
    });
  }
});
