import { test, expect, type Page } from "@playwright/test";
import { loginPage } from "./leave-org";
import { loginAsAdmin } from "./people-list-helpers";
import { setupExpenseE2E, archiveTempRoles } from "./expense-fixture";
import { makeTeamPayer, payCalendar, pushedDoc, targetsGrid } from "./pay-schedule-e2e";

// 07.1-18 Task 1 (W1 머리글 · S3) — 머리글 높이는 글자가 정한다. 선택 열(체크박스 머리글)이 있어도 없어도 같다.
// 한 줄 머리글 표(지급 대상 보기 · 목록 보기)는 `thead tr` ≤ 47(1280 · 1024 · 768 · 700), 머리글이 줄바꿈하는 표(/admin/people 768)는
// 가장 높은 th 글자 상자 + 그 th 위아래 padding · 테두리 + 1px 이하다(머리글 글자 크기 · 칸 폭을 줄여 맞추지 않는다).

test.afterAll(archiveTempRoles);

const WIDTHS = [1280, 1024, 768, 700] as const;

async function headerHeight(page: Page, table: string): Promise<{ trHeight: number; selectLabelMinHeight: string | null; lineCounts: number[] }> {
  return page.locator(table).first().evaluate((node) => {
    const tr = node.querySelector("thead tr") as HTMLElement;
    const label = node.querySelector("thead label");
    const lines = [...tr.querySelectorAll("th")]
      .filter((th) => getComputedStyle(th).display !== "none")
      .map((th) => {
        const range = document.createRange();
        range.selectNodeContents(th);
        return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size;
      });
    return {
      trHeight: tr.getBoundingClientRect().height,
      selectLabelMinHeight: label ? getComputedStyle(label).minHeight : null,
      lineCounts: lines,
    };
  });
}

test("지급 대상 보기(선택 열 있음)와 승인 보기(선택 열 없음)의 머리글 높이가 ≤ 47이고 서로 ±1이다", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const cal = await payCalendar();
  const fx = await setupExpenseE2E();
  const payer = await makeTeamPayer(fx);
  await pushedDoc(fx, "tracer", payer, cal);
  const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/expenses");
    await expect(page.getByLabel("상태")).toHaveValue("지급 대상");
    await expect(targetsGrid(page).or(page.getByRole("table", { name: "지급 대상" }))).toBeVisible();
    const withSelect = await headerHeight(page, "table");
    // 선택 열(체크박스 머리글)은 편집 가능 폭(≥1024)에서만 있다 — 그 아래는 높이가 같은지만 본다.
    if (width >= 1024) expect(await page.locator("table").first().locator("thead input[type=checkbox]").count(), `${width} 선택 열`).toBeGreaterThan(0);
    await page.goto("/expenses?status=" + encodeURIComponent("승인"));
    await expect(page.locator("table").first()).toBeVisible();
    const without = await headerHeight(page, "table");
    expect(await page.locator("table").first().locator("thead input[type=checkbox]").count(), `${width} 선택 열 없음`).toBe(0);
    // 머리글 글자가 한 줄인 표만 47 상한을 건다.
    expect(withSelect.lineCounts.every((n) => n <= 1), `${width} 지급 대상 머리글 한 줄 ${withSelect.lineCounts.join(",")}`).toBe(true);
    expect(without.lineCounts.every((n) => n <= 1), `${width} 승인 머리글 한 줄 ${without.lineCounts.join(",")}`).toBe(true);
    expect(withSelect.trHeight, `${width} 선택 열 있는 머리글`).toBeLessThanOrEqual(47);
    expect(without.trHeight, `${width} 선택 열 없는 머리글`).toBeLessThanOrEqual(47);
    expect(Math.abs(withSelect.trHeight - without.trHeight), `${width} 선택 열 유무 차이`).toBeLessThanOrEqual(1);
    if (width >= 1024) expect(withSelect.selectLabelMinHeight, `${width} 머리글 선택 라벨 min-height`).toBe("0px");
  }
  await page.context().close();
});

test("/admin/people 768 — 머리글이 줄바꿈해도 thead tr 높이는 가장 높은 th 글자 + padding · 테두리 + 1 이하다(강제 축소 금지)", async ({ page }) => {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/admin/people");
  const measured = await page.locator("table").first().evaluate((table) => {
    const tr = table.querySelector("thead tr") as HTMLElement;
    const ths = [...tr.querySelectorAll("th")].filter((th) => getComputedStyle(th).display !== "none") as HTMLElement[];
    const perTh = ths.map((th) => {
      const style = getComputedStyle(th);
      // 글자 상자 = 글자 줄 수 × 계산된 줄 높이(줄 상자 높이 — 글리프 상자는 줄 높이보다 낮아 상한이 불가능하게 낮아진다).
      const range = document.createRange();
      range.selectNodeContents(th);
      const tops = new Set([...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height < 40).map((rect) => Math.round(rect.top / 4)));
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6;
      const textBox = tops.size * lineHeight;
      return {
        textBox,
        padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
        border: parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
        fontSize: style.fontSize,
        width: th.getBoundingClientRect().width,
      };
    });
    const tallest = perTh.reduce((a, b) => (b.textBox + b.padding + b.border > a.textBox + a.padding + a.border ? b : a));
    return { trHeight: tr.getBoundingClientRect().height, bound: tallest.textBox + tallest.padding + tallest.border + 1, fontSizes: perTh.map((th) => th.fontSize), detail: JSON.stringify(perTh) };
  });
  expect(measured.trHeight, measured.detail).toBeLessThanOrEqual(measured.bound);
  // 글자 크기를 줄여 맞추지 않는다 — 머리글 글자 크기는 모두 같은 하나다.
  expect(new Set(measured.fontSizes).size).toBe(1);
});
