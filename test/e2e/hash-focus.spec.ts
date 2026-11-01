import { test, expect, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";

// 07.1-19 Task 1(PC4 · C-07 · SP-71-5): 화면 사이 해시 링크(`/expenses/{id}#evidence`)로 도착하면 포커스가 도착 섹션 제목(tabindex -1)에 서고
// 제목이 고정 바에 가리지 않는다. 도착 시점은 클라이언트 이동이라 주소 갱신이 커밋 뒤일 수 있다 — 포커스 단언은 한 번 읽기가 아니라 폴링(toBeFocused).
// 화면 사이 이동은 앱 라우터 push(`window.next.router.push` — leave-approval.spec.ts와 같은 길)로 건다: 링크를 눌러도 같은 클라이언트 이동이다.

const WIDTHS = [1280, 768, 375, 320] as const;

type Router = { push(url: string): void };

async function clientPush(page: Page, url: string): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { next?: { router?: Router } }).next?.router));
  await page.evaluate((target) => (window as unknown as { next: { router: Router } }).next.router.push(target), url);
}

// 고정 상단 바가 비켜야 하는 높이 — 토큰 `--shell-top`을 그대로 풀어 잰다(≥1280은 0).
function shellTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "height:var(--shell-top);position:absolute;visibility:hidden;width:1px";
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
}

async function activeIsBody(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement === document.body || document.activeElement === null);
}

async function expectArrivedAtHeading(page: Page): Promise<void> {
  const target = page.locator("#evidence");
  await expect(target).toHaveCount(1);
  await expect(target).toBeFocused();
  const top = (await target.boundingBox())?.y ?? Number.NEGATIVE_INFINITY;
  expect(top).toBeGreaterThanOrEqual((await shellTop(page)) - 0.5);
}

async function submittedExpense(browser: Parameters<typeof loginPage>[0], baseURL: string | undefined, fx: ExpenseE2E): Promise<string> {
  return submitLineExpense(browser, baseURL, fx, "tracer");
}

test.describe("해시 도착 포커스 — 증빙 섹션(PC4 · SP-71-5)", () => {
  for (const width of WIDTHS) {
    test(`${width} — 제출한 지출결의 문서: 다른 화면에서 #evidence로 도착하면 포커스 = 증빙 섹션 제목(h2#evidence) · 바에 안 가림 · Tab = 섹션 안 첫 컨트롤`, async ({ browser, baseURL }) => {
      const fx = await setupExpenseE2E();
      const expenseId = await submittedExpense(browser, baseURL, fx);
      const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
      await clientPush(page, `/expenses/${expenseId}#evidence`);

      await expect(page.locator("#evidence")).toHaveCount(1);
      await expect(page.locator("#evidence")).toHaveJSProperty("tagName", "H2");
      await expect(page.locator("#evidence")).toHaveText("증빙");
      await expectArrivedAtHeading(page);

      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const heading = document.getElementById("evidence");
        const active = document.activeElement;
        const section = heading?.closest("section");
        return Boolean(section && active && active !== heading && section.contains(active));
      });
      expect(inside).toBe(true);
      await page.context().close();
    });
  }

  test("1280 — 같은 화면에서 주소 해시만 바꾸는 이동(hashchange)도 같은 제목으로 포커스", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submittedExpense(browser, baseURL, fx);
    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 800 });
    await page.goto(`/expenses/${expenseId}`);
    await expect(page.locator("#evidence")).toHaveCount(1);
    expect(await activeIsBody(page)).toBe(true);
    await page.evaluate(() => {
      window.location.hash = "#evidence";
    });
    await expect(page.locator("#evidence")).toBeFocused();
    await page.context().close();
  });

  test("1280 — 해시가 없거나 대상 id가 없는 해시(#nope)는 포커스를 옮기지 않는다(BODY 그대로)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submittedExpense(browser, baseURL, fx);
    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 800 });
    await page.goto(`/expenses/${expenseId}`);
    await expect(page.locator("#evidence")).toHaveCount(1);
    expect(await activeIsBody(page)).toBe(true);
    await clientPush(page, `/expenses/${expenseId}#nope`);
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}#nope$`));
    await page.waitForTimeout(300);
    expect(await activeIsBody(page)).toBe(true);
    await page.context().close();
  });

  for (const width of [1280, 768] as const) {
    test(`${width} — 작성 중 폼 지출결의: #evidence는 하나, tabindex -1인 증빙 고르기 자리이고 #evidence로 도착하면 포커스가 거기로 선다`, async ({ browser, baseURL }) => {
      const fx = await setupExpenseE2E();
      const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id], fields: { note: "행사 운영비" } });
      const expenseId = created.created[0]?.expenseId;
      if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
      const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
      await clientPush(page, `/expenses/${expenseId}#evidence`);
      await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
      await expect(page.locator("#evidence")).toHaveCount(1);
      await expect(page.locator("#evidence")).toHaveAttribute("tabindex", "-1");
      await expectArrivedAtHeading(page);
      await page.context().close();
    });
  }
});
