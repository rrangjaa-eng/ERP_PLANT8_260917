import { test, expect, type Page } from "@playwright/test";
import { getApprovalView, rejectDocument } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
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

  // 실측된 결함(2026-11-04): 결재 중 · 종결 버튼 없는 문서의 375 머리 줄은 제목 블록보다 16px(--s-4 줄 간격) 컸다 —
  // PcOnly로 가려진 링크 때문에 빈 `.actions` 상자가 둘째 줄로 떨어졌다. 사용자 카드 추천안으로 DetailScreen이 고쳤다(폰에서 직계 자식이
  // 모두 PcOnly인 `.actions`는 자리를 차지하지 않는다 — 07.4-01 SUMMARY 항목 A).
  test(`${width}px 머리 줄에 빈 actions 틈이 없다`, async ({ browser, baseURL }) => {
    const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
    try {
      await page.goto(`/expenses/${expenseId}`);
      await waitForDetailTitle(page);
      const heights = await headHeights(page);
      test.info().annotations.push({ type: "head-heights", description: JSON.stringify(heights) });
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

// 리뷰 지적(PR #356): 반려된 지출결의를 기안자가 재상신 폼으로 여는 갈래에도 「인쇄」 입구가 있어야 한다(D-7411).
test.describe("반려 재상신 폼의 「인쇄」 입구", () => {
  let rejectedId: string;

  test.beforeAll(async ({ browser, baseURL }) => {
    rejectedId = await submitLineExpense(browser, baseURL, fx, "retry");
    const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: rejectedId });
    if (!view) throw new Error("결재 문서를 읽지 못했다");
    await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  });

  test("1280px에서 기안자의 반려 지출결의에 「인쇄」 링크가 하나이고 인쇄 라우트를 가리킨다", async ({ browser, baseURL }) => {
    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 900 });
    try {
      await page.goto(`/expenses/${rejectedId}`);
      await waitForDetailTitle(page);
      await expect(printLink(page)).toHaveCount(1);
      await expect(printLink(page)).toHaveAttribute("href", `/print/expenses/${rejectedId}`);
    } finally {
      await page.context().close();
    }
  });

  test("375px에서는 같은 링크가 접근성 트리에 없다", async ({ browser, baseURL }) => {
    const page = await loginPage(browser, baseURL, fx.pm, { width: 375, height: 800 });
    try {
      await page.goto(`/expenses/${rejectedId}`);
      await waitForDetailTitle(page);
      await expect(printLink(page)).toHaveCount(0);
    } finally {
      await page.context().close();
    }
  });
});
