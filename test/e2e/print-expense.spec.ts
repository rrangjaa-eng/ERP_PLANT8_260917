import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { createFixtureUser } from "./fixtures";
import { makeEvidenceManagerE2E, setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
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
    // 로딩 경계의 자리표시 main이 사라지고 본문(data-ready)만 남은 뒤에 읽는다.
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
    await context.close();
  });
});

// Task 2 — 지출결의서 종이(F-E1 결재 중 · F-E2 승인 완료 · F-E3 반려 · F-E4 금액 못 보는 계급).
const articleOf = (page: Page) => page.locator("article");
const numberLine = (page: Page) => page.locator("article > p").first();

async function approveAll(expenseDocId: string): Promise<void> {
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseDocId });
    if (!view) throw new Error(`결재 문서를 읽지 못했다: ${approver.name}`);
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
}

test.describe("종이 본문", () => {
  test("F-E1 결재 중: 라벨 여섯 · 명세 표 · 세금 · 합계 행이 상세 화면 계산 한 줄과 같고 합계 글자는 없다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, fx.pm);
    await page.goto(`/expenses/${expenseId}`);
    const detailLine = await page.getByTestId("expense-tax-line").first().innerText();
    const detailTotal = /지급 총액\s*([\d,]+)/.exec(detailLine)?.[1];
    expect(detailTotal, detailLine).toBeTruthy();

    await page.goto(printPath(expenseId));
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    const sheet = articleOf(page);
    await expect(sheet.locator("dl dt")).toHaveText(["프로젝트", "지급처", "증빙", "지급 방식", "지급 예정일", "상세"]);
    const head = sheet.locator("thead th");
    await expect(head.nth(1)).toHaveText("구분");
    await expect(head.nth(2)).toHaveText("내용");
    await expect(head.nth(3)).toHaveText("금액");
    await expect(sheet.locator("tbody tr").first()).toContainText("공급가액");
    await expect(sheet.locator("tbody tr").nth(1)).toContainText("부가세");
    const foot = sheet.locator("tfoot tr").first();
    await expect(foot).toContainText("지급 총액");
    expect(await foot.locator("td").last().innerText()).toBe(detailTotal);
    expect(await sheet.innerText()).not.toContain("합계");
    await expect(sheet.getByText(/^금 .+ 원정$/)).toHaveCount(1);
    await expect(sheet.locator("caption")).toHaveCount(1);
    await expect(numberLine(page)).toContainText("결재 중");
    await expect(sheet.locator("ol li")).toHaveText([/^1\. .+\.jpg$/]);

    // 독립 DOM 감사 D1: 제목 괘선 hr은 위 2px 한 줄뿐이고 좌 · 우 · 아래 테두리(브라우저 기본 inset 회색)가 없다.
    const hr = await sheet.locator("hr").first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { top: cs.borderTopWidth, right: cs.borderRightWidth, bottom: cs.borderBottomWidth, left: cs.borderLeftWidth };
    });
    expect(hr).toEqual({ top: "2px", right: "0px", bottom: "0px", left: "0px" });

    // 쪽 나눔: 자유 글 행(상세)만 이어질 수 있고 나머지 행은 쪼개지지 않는다(F6). 표 머리는 쪽마다 반복(table-header-group).
    const breakOf = (label: string) => sheet.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).evaluate((el) => getComputedStyle(el).breakInside);
    expect(await breakOf("상세")).toBe("auto");
    expect(await breakOf("프로젝트")).toBe("avoid");
    expect(await sheet.locator("thead").evaluate((el) => getComputedStyle(el).display)).toBe("table-header-group");
    await context.close();
  });

  test("화면 바는 어느 폭에서도 1차 버튼이 창 안에 있고, 인쇄 미디어에는 바가 없다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, fx.pm);
    await page.goto(printPath(expenseId));
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    const primary = page.getByRole("button", { name: "인쇄 · PDF 저장" });
    const close = page.getByRole("button", { name: "닫기" });
    for (const width of [320, 375, 700, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      const primaryBox = await primary.boundingBox();
      const closeBox = await close.boundingBox();
      if (!primaryBox || !closeBox) throw new Error(`버튼 상자 없음 ${width}`);
      expect(primaryBox.x + primaryBox.width, `1차 오른쪽 ${width}`).toBeLessThanOrEqual(clientWidth + 0.5);
      expect(closeBox.x, `닫기 왼쪽 ${width}`).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => window.scrollX), `scrollX ${width}`).toBe(0);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    const sheetWidth = await articleOf(page).evaluate((el) => el.getBoundingClientRect().width);
    expect(sheetWidth).toBeGreaterThan(793);
    expect(sheetWidth).toBeLessThan(794.5);

    await page.emulateMedia({ media: "print" });
    // 숨은 요소는 접근성 트리에서 빠지므로 역할이 아니라 위치(main의 첫 div = 화면 바)로 찾는다.
    expect(await page.locator("main > div").first().evaluate((el) => getComputedStyle(el).display)).toBe("none");
    expect((await page.pdf({ preferCSSPageSize: true })).length).toBeGreaterThan(1000);
    await context.close();
  });

  test("F-E2 승인 완료는 상태 글자가 없고 F-E3 반려는 「반려」 + 반려 사유 한 줄이다", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const approvedId = await submitLineExpense(browser, baseURL, fx, "retry");
    await approveAll(approvedId);
    const rejectedId = await submitLineExpense(browser, baseURL, fx, "phone");
    const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: rejectedId });
    if (!view) throw new Error("결재 문서를 읽지 못했다");
    await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });

    const { context, page } = await loggedIn(browser, baseURL, fx.pm);
    await page.goto(printPath(approvedId));
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    await expect(numberLine(page)).not.toContainText(/결재 중|반려|회수|작성 중|종결/);
    await expect(articleOf(page).getByText("반려 사유", { exact: true })).toHaveCount(0);

    await page.goto(printPath(rejectedId));
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    await expect(numberLine(page)).toContainText("반려");
    await expect(articleOf(page).getByText("반려 사유", { exact: true })).toHaveCount(1);
    await expect(articleOf(page).getByText("금액 다시")).toHaveCount(1);
    await context.close();
  });

  test("F-E4 금액을 못 보는 계급은 금액 열 · 세금 · 합계 · 한글 금액이 DOM에 없고 내용 칸은 남는다", async ({ browser, baseURL }) => {
    const blind = await makeEvidenceManagerE2E();
    if (!blind.viewer.roleId) throw new Error("계급 없음");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: blind.viewer.roleId, infoItem: "expense.amount", visible: false });
    const { context, page } = await loggedIn(browser, baseURL, blind);
    await page.goto(printPath(expenseId));
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    const sheet = articleOf(page);
    await expect(sheet.locator("thead th").filter({ hasText: "금액" })).toHaveCount(0);
    await expect(sheet.locator("thead th").filter({ hasText: "내용" })).toHaveCount(1);
    await expect(sheet.locator("tfoot")).toHaveCount(0);
    await expect(sheet.getByText(/지급 총액|실지급액|부가세|원천징수|계산 불가/)).toHaveCount(0);
    await expect(sheet.getByText(/^금 .+ 원정$/)).toHaveCount(0);
    await expect(sheet.locator("tbody tr").first()).toContainText("공급가액");
    await context.close();
  });
});
