import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createFixtureUser } from "./fixtures";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import type { Person } from "./leave-org";

// 07.4-01 — 지출결의서 인쇄 라우트 `/print/expenses/[id]`와 상세 화면 「인쇄」 입구. 인쇄 시작 갈래는 A(열면 자동 인쇄 1회 — origin/main SYSTEM §6-6 :636).
// 기록은 응답을 기다리지 않으므로 행 수 단언은 모두 expect.poll이다.

test.describe.configure({ mode: "serial" });

let fx: ExpenseE2E;
let expenseId: string;

test.beforeAll(async ({ browser, baseURL }) => {
  fx = await setupExpenseE2E();
  expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
});

// 「인쇄」가 새 탭을 여므로 탭이 생기기 전에 컨텍스트에 건다(page.addInitScript는 새 탭에 닿지 않는다).
async function printSpyContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => {
    const target = window as unknown as { __printCalls: number };
    target.__printCalls = 0;
    window.print = () => {
      target.__printCalls += 1;
    };
  });
  return context;
}

const printCalls = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls);

async function login(page: Page, person: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(person.email);
  await page.getByLabel("비밀번호").fill(person.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loggedIn(browser: Browser, baseURL: string | undefined, person: Person | { email: string; password: string }, install?: (context: BrowserContext) => Promise<void>) {
  const context = await printSpyContext(browser, baseURL);
  if (install) await install(context);
  const page = await context.newPage();
  await login(page, person);
  return { context, page };
}

async function printRows(documentId: string): Promise<number> {
  const rows = await db.select().from(actionLog).where(and(eq(actionLog.actionType, "document_print"), eq(actionLog.documentId, documentId)));
  return rows.length;
}

const printPath = (id: string) => `/print/expenses/${id}`;
const notFoundHeading = (page: Page) => page.getByRole("heading", { name: "페이지 찾을 수 없음" });

test.describe("입구 · 종이 · 기록", () => {
  test("상세 화면 「인쇄」 링크 하나가 새 탭으로 인쇄물을 열고 자동 인쇄 1회 + document_print 1행이 남는다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, fx.pm);
    await page.goto(`/expenses/${expenseId}`);
    const link = page.getByRole("link", { name: "인쇄", exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", printPath(expenseId));
    await expect(link).toHaveAttribute("rel", /noopener/);

    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState();
    await expect(popup.locator("main[data-ready]")).toHaveCount(1);
    await expect(popup).toHaveTitle(/^지출결의서 \S+/);
    const sheet = popup.locator("article");
    await expect(sheet.getByRole("heading", { level: 1, name: "지출결의서" })).toBeVisible();
    await expect(sheet.getByText("출력 ", { exact: false }).first()).toBeVisible();
    await expect(sheet.locator('[data-state="submitted"]').first()).toContainText("기안");

    await expect.poll(() => printCalls(popup)).toBe(1);
    await expect.poll(() => printRows(expenseId), { timeout: 10_000 }).toBe(1);
    expect((await context.request.get(printPath(expenseId))).status()).toBe(200);
    await context.close();
  });

  test("5초 안의 재클릭 · beforeprint는 1행으로 합치고 5초 뒤 클릭은 한 행을 더한다. 기록 실패는 화면에 아무것도 띄우지 않는다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, fx.pm, (ctx) => ctx.clock.install());
    const before = await printRows(expenseId);
    await page.goto(printPath(expenseId));
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    await expect.poll(() => printRows(expenseId), { timeout: 10_000 }).toBe(before + 1);

    const button = page.getByRole("button", { name: "인쇄 · PDF 저장" });
    await button.click();
    await button.click();
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await page.waitForTimeout(1000);
    expect(await printRows(expenseId)).toBe(before + 1);

    await page.clock.fastForward(6000);
    await button.click();
    await expect.poll(() => printRows(expenseId), { timeout: 10_000 }).toBe(before + 2);

    // 서버 액션 POST가 500이어도 화면에는 아무것도 뜨지 않는다.
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        await route.fulfill({ status: 500, body: "boom" });
        return;
      }
      await route.continue();
    });
    await page.clock.fastForward(6000);
    const bodyBefore = await page.locator("main").innerText();
    await button.click();
    await page.waitForTimeout(1000);
    // Next의 경로 안내 요소(role=alert, 글자 없음)는 늘 있다 — 글자가 있는 알림 · 상태만 센다.
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(0);
    expect(await page.locator("main").innerText()).toBe(bodyBefore);
    await context.close();
  });

  test("없는 id · 형식 아닌 id · 남의 서류는 응답 전 404이고 제목이 서류 제목이 아니다", async ({ browser, baseURL }) => {
    const stranger = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    const { context, page } = await loggedIn(browser, baseURL, stranger);
    const before = await printRows(expenseId);
    for (const id of ["00000000-0000-4000-8000-000000000000", "abc", expenseId]) {
      const response = await page.goto(printPath(id));
      expect(response?.status(), id).toBe(404);
      await expect(notFoundHeading(page)).toBeVisible();
      expect(await page.title(), id).not.toMatch(/^지출결의서/);
    }
    expect(await printRows(expenseId)).toBe(before);
    await context.close();
  });

  test("작성 중(번호 없음) 지출결의는 상세에 「인쇄」 링크가 없고 직접 연 인쇄물 제목은 「지출결의서」다", async ({ browser, baseURL }) => {
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id], fields: { note: "행사 운영비" } });
    const draftId = created.created[0]?.expenseId ?? "";
    expect(draftId).not.toBe("");
    const { context, page } = await loggedIn(browser, baseURL, fx.pm);
    await page.goto(`/expenses/${draftId}`);
    await expect(page.getByRole("link", { name: "인쇄", exact: true })).toHaveCount(0);

    const response = await page.goto(printPath(draftId));
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("지출결의서");
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
    await context.close();
  });
});
