import { test, expect } from "@playwright/test";
import { loginPage } from "./leave-org";
import { setupExpenseE2E, archiveTempRoles } from "./expense-fixture";
import { makeTeamPayer, payCalendar, pushedDoc, targetsGrid } from "./pay-schedule-e2e";

// 07-16 Task 1(K5): 폰 375 — 밀린 건의 `마감 지나 밀림`은 그 행 P2 접힌 줄의 첫 요소이고 행은 두 줄(주 행 + 접힌 줄)이다.
// PC의 제목 아래 2행은 폰에서 숨는다(같은 말을 두 번 보이지 않는다 — SYSTEM §7-3 폰 전략).

test.afterAll(archiveTempRoles);

test("폰 375 — `마감 지나 밀림`이 P2 접힌 줄 맨 앞 · 행 두 줄 · 가로 넘침 없음", async ({ browser, baseURL }) => {
  const cal = await payCalendar();
  const fx = await setupExpenseE2E();
  const payer = await makeTeamPayer(fx);
  await pushedDoc(fx, "tracer", payer, cal);
  const itemName = fx.lines.tracer.itemName;

  const page = await loginPage(browser, baseURL, payer, { width: 375, height: 812 });
  await page.goto("/expenses");
  await expect(page.getByLabel("상태")).toHaveValue("지급 대상");
  const table = targetsGrid(page).or(page.getByRole("table", { name: "지급 대상" }));
  await expect(table).toBeVisible();
  const rowGroup = table.locator("tbody").filter({ has: page.getByRole("link", { name: itemName }) });
  await expect(rowGroup).toHaveCount(1);
  const shape = await rowGroup.evaluate((tbody) => {
    const visible = [...tbody.querySelectorAll(":scope > tr")].filter((tr) => tr instanceof HTMLElement && tr.offsetParent !== null);
    const collapsed = visible.at(-1)?.querySelector("td");
    const first = collapsed?.querySelector(":scope > span");
    const lineHeight = (cell: Element | null | undefined) => (cell ? parseFloat(getComputedStyle(cell).lineHeight) : 0);
    const textHeight = (cell: HTMLElement | null | undefined) => {
      if (!cell) return 0;
      const style = getComputedStyle(cell);
      return cell.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    };
    const titleCell = visible[0]?.querySelector("a[data-row-link]")?.closest("td") as HTMLElement | null;
    return {
      rows: visible.length,
      firstText: (first?.textContent ?? "").trim(),
      collapsedLines: Math.round(textHeight(collapsed) / lineHeight(collapsed)),
      titleLines: Math.round(textHeight(titleCell) / lineHeight(titleCell)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(shape.rows).toBe(2);
  expect(shape.firstText.startsWith("마감 지나 밀림")).toBe(true);
  expect(shape.collapsedLines).toBe(1);
  expect(shape.titleLines).toBe(1);
  expect(shape.overflow).toBeLessThanOrEqual(0);
  await page.context().close();
});
