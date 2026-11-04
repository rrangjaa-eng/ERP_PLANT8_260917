import { test, expect, type Page } from "@playwright/test";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { loginPage } from "./leave-org";

// 07.4-01 D-7409 E1 — 지출결의 상세의 「인쇄」 입구는 폰(<700)에서 접근성 트리에 없고 700부터 하나다. 폰에서 숨은 링크 때문에 빈 actions 상자가
// DetailScreen 머리 줄에 둘째 줄 틈을 만들면 안 된다(머리 줄 높이 = 제목 블록 높이). 07.4-02 · 03이 같은 파일에 연차 · 정산 사례를 더한다.

test.describe.configure({ mode: "serial" });

let fx: ExpenseE2E;
let expenseId: string;

test.beforeAll(async ({ browser, baseURL }) => {
  fx = await setupExpenseE2E();
  expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
});

const printLink = (page: Page) => page.getByRole("link", { name: "인쇄", exact: true });

// 상세 화면은 로딩 경계(제목만 있는 자리표시)가 먼저 오고 본문이 스트리밍으로 바뀐다 — 제목이 하나로 줄 때까지 기다린 뒤 잰다.
async function waitForDetailTitle(page: Page): Promise<void> {
  await expect(page.locator('h1[data-ui="screen-title"]')).toHaveCount(1, { timeout: 20_000 });
}

async function headHeights(page: Page): Promise<{ head: number; heading: number; actions: number }> {
  // DetailScreen 머리: h1(제목) → 제목 블록(.heading) → 머리 줄(.head). actions 상자는 머리 줄의 둘째 자식이다.
  return page.locator('h1[data-ui="screen-title"]').evaluate((title) => {
    const heading = title.parentElement as HTMLElement;
    const head = heading.parentElement as HTMLElement;
    const actions = head.children[1] as HTMLElement | undefined;
    return { head: head.getBoundingClientRect().height, heading: heading.getBoundingClientRect().height, actions: actions ? actions.getBoundingClientRect().height : 0 };
  });
}

for (const width of [375, 320]) {
  test(`${width}px 폰에서는 「인쇄」 링크가 접근성 트리에 없다`, async ({ browser, baseURL }) => {
    const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
    try {
      await page.goto(`/expenses/${expenseId}`);
      await waitForDetailTitle(page);
      await expect(printLink(page)).toHaveCount(0);
    } finally {
      await page.context().close();
    }
  });

  // 실측된 결함(2026-11-04): 결재 중 · 종결 버튼 없는 문서의 375 머리 줄은 제목 블록 86.6px보다 16px(--s-4 줄 간격) 크다 —
  // PcOnly로 가려진 링크 때문에 빈 `.actions` 상자가 둘째 줄로 떨어진다. ui/detail-screen 수정이 필요해 이 플랜(ui/ 변경 금지)이 고치지 않고
  // 사용자 결정으로 올렸다(07.4-01 SUMMARY). 결정이 나면 이 fixme를 풀고 그대로 단언한다.
  test(`${width}px 머리 줄에 빈 actions 틈이 없다`, async ({ browser, baseURL }) => {
    test.fixme(true, "빈 .actions 상자가 만드는 --s-4 틈 — ui/detail-screen 변경 결정 대기(07.4-01)");
    const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
    try {
      await page.goto(`/expenses/${expenseId}`);
      await waitForDetailTitle(page);
      const heights = await headHeights(page);
      expect(heights.head, `머리 줄 ${JSON.stringify(heights)}`).toBeLessThanOrEqual(heights.heading + 1);
    } finally {
      await page.context().close();
    }
  });
}

test("700px부터 「인쇄」 링크가 하나다", async ({ browser, baseURL }) => {
  const page = await loginPage(browser, baseURL, fx.pm, { width: 700, height: 800 });
  try {
    await page.goto(`/expenses/${expenseId}`);
    await waitForDetailTitle(page);
    await expect(printLink(page)).toHaveCount(1);
  } finally {
    await page.context().close();
  }
});
