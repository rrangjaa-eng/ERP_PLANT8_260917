import { test, expect } from "@playwright/test";
import { loginAsSysadmin, tokenNumber } from "./row-actions-helpers";

// 04.6-26 N-1(웨이브 5 재검사 reviews/04.6-W5-fix-recheck.md) — 폰에서 첫·끝 열이 숨으면 보이는 첫·끝 칸(머리글 · 주 행)에도
// 표 면 안쪽 여백 --s-4가 걸려 접힌 줄(--s-4)과 어긋나지 않는다. 공휴일 · 코드표 2종 × 375 · 320.
const PATHS = ["/admin/holidays?year=2026", "/admin/code-tables?tableKey=project_status", "/admin/code-tables?tableKey=evidence_type"];

for (const width of [375, 320]) {
  test.describe(`폰 ${width}`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const path of PATHS) {
      test(`${path} 보이는 첫 칸 왼쪽 여백이 --s-4다 (${width})`, async ({ page }) => {
        await loginAsSysadmin(page);
        await page.goto(path);
        await expect(page.locator("table").first()).toBeVisible();
        const s4 = await tokenNumber(page, "--s-4");
        const pads = await page.evaluate(() => {
          const firstVisible = (row: Element | null): HTMLElement | null => {
            if (!row) return null;
            for (const cell of Array.from(row.children) as HTMLElement[]) {
              if (getComputedStyle(cell).display !== "none") return cell;
            }
            return null;
          };
          const table = document.querySelector("table");
          const head = firstVisible(table?.querySelector("thead tr") ?? null);
          const body = firstVisible(table?.querySelector("tbody tr:not(:has(td[colspan]))") ?? null);
          const folded = table?.querySelector("tbody td[colspan]") ?? null;
          const lastVisible = (row: Element | null): HTMLElement | null => {
            if (!row) return null;
            for (const cell of (Array.from(row.children) as HTMLElement[]).reverse()) {
              if (getComputedStyle(cell).display !== "none") return cell;
            }
            return null;
          };
          const left = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).paddingLeft) : null);
          const right = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).paddingRight) : null);
          return {
            head: left(head),
            body: left(body),
            folded: left(folded),
            headRight: right(lastVisible(table?.querySelector("thead tr") ?? null)),
            bodyRight: right(lastVisible(table?.querySelector("tbody tr:not(:has(td[colspan]))") ?? null)),
            foldedRight: right(folded),
            headIsFirstChild: head ? head === head.parentElement?.firstElementChild : null,
          };
        });
        expect(pads.head, `${path} 머리글 첫 보이는 칸`).toBe(s4);
        if (pads.body !== null) expect(pads.body, `${path} 주 행 첫 보이는 칸`).toBe(s4);
        if (pads.folded !== null) expect(pads.folded, `${path} 접힌 줄`).toBe(s4);
        expect(pads.headRight, `${path} 머리글 마지막 보이는 칸 오른쪽`).toBe(s4);
        if (pads.bodyRight !== null) expect(pads.bodyRight, `${path} 주 행 마지막 보이는 칸 오른쪽`).toBe(s4);
        if (pads.foldedRight !== null) expect(pads.foldedRight, `${path} 접힌 줄 오른쪽`).toBe(s4);
        // 공허 방지: 이 화면들은 첫 열이 폰에서 숨는다(그래서 :first-child 규칙이 닿지 않던 곳이다).
        expect(pads.headIsFirstChild, `${path} 첫 열이 숨는다`).toBe(false);
      });
    }
  });
}
