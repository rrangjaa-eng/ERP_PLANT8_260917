import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { loadProjectProfit } from "@/domain/projects";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { formatKrw } from "@/lib/format-number";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import type { Person } from "./leave-org";
import { expandProjectInfo, projectInfo } from "./project-info-helpers";
import { setupSettlementE2E, submitSettlementE2E, type SettlementE2E } from "./settlement-fixture";
import { insertTempRole } from "./temp-roles";

// 07.4-03 — 프로젝트 정산서 인쇄 라우트 `/print/settlements/[id]`(id = 프로젝트 id)와 정산 결재 화면 「인쇄」 입구.
// 열람자는 전사 범위 임시 계급 둘 — pnl 보기가 있는 계급(F-S1)과 없는 계급(F-S2). 기본 계급에는 pnl 보기가 없다(domain/seed/role-defaults.ts).
// 기록은 응답을 기다리지 않으므로 행 수 단언은 expect.poll이다.

test.describe.configure({ mode: "serial" });

let fx: SettlementE2E;
let pnlViewer: Person;
let plainViewer: Person;

const PROJECT_MENUS = [
  { menu: "projects", action: "view" },
  { menu: "expenses", action: "view" },
] as const;

async function tempViewer(prefix: string, menus: readonly { menu: string; action: string }[]): Promise<Person> {
  const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E정산서${prefix}-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  for (const { menu, action } of menus) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action, allowed: true });
  for (const item of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: item.key, visible: true });
  const name = `${prefix}${randomUUID().slice(0, 4)}`;
  const email = `e2e-print-settlement-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId: role.id });
  return { name, email, password: tempPassword, viewer: { id: userId, roleId: role.id } };
}

test.beforeAll(async () => {
  fx = await setupSettlementE2E();
  await submitSettlementE2E(fx);
  pnlViewer = await tempViewer("손익", [...PROJECT_MENUS, { menu: "pnl", action: "view" }]);
  plainViewer = await tempViewer("금액", PROJECT_MENUS);
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

async function loggedIn(browser: Browser, baseURL: string | undefined, person: Person) {
  const context = await printSpyContext(browser, baseURL);
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(person.email);
  await page.getByLabel("비밀번호").fill(person.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return { context, page };
}

async function printRows(documentId: string) {
  return db.select().from(actionLog).where(and(eq(actionLog.actionType, "document_print"), eq(actionLog.documentId, documentId)));
}

const printPath = (id: string) => `/print/settlements/${id}`;
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const articleOf = (page: Page) => page.locator("article");
const numberLine = (page: Page) => page.locator("article > p").first();
const metricValue = (page: Page, label: string) => articleOf(page).locator("div", { has: page.getByText(label, { exact: true }) }).last().locator("span").last();

// 로딩 경계의 자리표시 main이 사라지고 본문(data-ready) 하나만 남은 뒤에 읽는다.
async function waitForPaper(page: Page): Promise<void> {
  await expect(page.locator("main[data-ready]")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(articleOf(page).getByRole("heading", { level: 1, name: "프로젝트 정산서" })).toBeVisible();
}

async function profitOf(viewer: Viewer) {
  const profit = await loadProjectProfit(viewer, fx.projectId);
  if (profit?.kind !== "ok") throw new Error(`손익이 계산되지 않았다: ${JSON.stringify(profit)}`);
  return profit;
}

test.describe("입구 · 종이 · 손익 · 기록", () => {
  test("F-S1: 정산 결재 화면 「인쇄」 하나가 새 탭 정산서를 열고 머리 · 두 합 · 손익 네 칸 · 상태 글자 · 기안 칸이 있고 document_print 1행이 남는다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pnlViewer);
    await page.goto(`/projects/${fx.projectId}/settlement`);
    await expect(page.locator('h1[data-ui="screen-title"]')).toHaveCount(1, { timeout: 20_000 });
    const link = page.getByRole("link", { name: "인쇄", exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", printPath(fx.projectId));
    await expect(link).toHaveAttribute("rel", /noopener/);

    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState();
    await waitForPaper(popup);
    await expect(popup).toHaveTitle(`프로젝트 정산서 ${fx.projectNumber}`);
    const sheet = articleOf(popup);
    for (const label of ["프로젝트", "기간", "PM", "견적가 합", "실행가 합"]) await expect(sheet.locator("dt", { hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
    await expect(sheet.getByRole("heading", { level: 2, name: "손익", exact: true })).toHaveCount(1);
    for (const label of ["매출 기준", "확정 실행가", "수익금", "수익률"]) await expect(sheet.getByText(label, { exact: true })).toHaveCount(1);
    await expect(numberLine(popup)).toContainText(/ 결재 중$/);
    await expect(numberLine(popup).locator("span").last()).toHaveText(/^\S+ 결재 중$/);
    await expect(sheet.locator('[data-state="submitted"]').first()).toContainText("기안");

    // 종이 안 셈: 매출 기준 − 확정 실행가 = 수익금(다시 세지 않은 값이 맞는지).
    const profit = await profitOf(pnlViewer.viewer);
    expect(normalize(await metricValue(popup, "매출 기준").innerText())).toBe(formatKrw(profit.basisKrw));
    expect(normalize(await metricValue(popup, "수익금").innerText())).toBe(formatKrw(profit.profitKrw));

    await expect.poll(() => printCalls(popup)).toBe(1);
    await expect.poll(async () => (await printRows(fx.projectId)).length, { timeout: 10_000 }).toBe(1);
    const [row] = await printRows(fx.projectId);
    expect(row?.detail).toMatchObject({ kind: "settlement", number: fx.projectNumber });
    await context.close();
  });

  test("F-S1: 종이 수익금 · 수익률 = 같은 열람자의 프로젝트 화면 손익 「수익」 값", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pnlViewer);
    await page.goto(`/projects/${fx.projectId}`);
    await expandProjectInfo(page);
    const group = projectInfo(page).getByRole("group", { name: "손익" });
    await expect(group).toHaveCount(1);
    const screen = normalize(await group.getByText("수익", { exact: true }).locator("xpath=following-sibling::span[1]").innerText());
    const [screenProfit, screenRate] = screen.split(" · ");

    await page.goto(printPath(fx.projectId));
    await waitForPaper(page);
    expect(normalize(await metricValue(page, "수익금").innerText())).toBe(screenProfit);
    expect(normalize(await metricValue(page, "수익률").innerText())).toBe(screenRate);
    await context.close();
  });

  test("F-S2: pnl 보기가 없는 계급은 손익 절 글자가 DOM에 없고 응답 원문에도 수익금 숫자가 없다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, plainViewer);
    const profit = await profitOf(pnlViewer.viewer);
    const response = await page.goto(printPath(fx.projectId));
    expect(response?.status()).toBe(200);
    const body = (await response?.text()) ?? "";
    await waitForPaper(page);
    const sheet = articleOf(page);
    for (const word of ["손익", "매출 기준", "확정 실행가", "수익금", "수익률"]) await expect(sheet.getByText(word)).toHaveCount(0);
    // 금액은 본다 — 두 합은 남는다.
    await expect(sheet.locator("dt", { hasText: /^견적가 합$/ })).toHaveCount(1);
    expect(body).not.toContain(formatKrw(profit.profitKrw));
    await context.close();
  });

  test("없는 id · 형식 아닌 id · 정산 문서 없는 프로젝트 · 볼 수 없는 프로젝트는 응답 전 404이고 제목이 서류 제목이 아니다", async ({ browser, baseURL }) => {
    const unsubmitted = await setupSettlementE2E();
    // 팀 없는 사원 — 기안자 · 결재 관련자가 아니고 프로젝트 행 범위 밖이다.
    const email = `e2e-print-settlement-${randomUUID()}@example.test`;
    const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "무관", roleId: "role-pm" });
    const stranger: Person = { name: "무관", email, password: tempPassword, viewer: { id: userId, roleId: "role-pm" } };

    const asPnl = await loggedIn(browser, baseURL, pnlViewer);
    for (const id of ["00000000-0000-4000-8000-000000000000", "abc", unsubmitted.projectId]) {
      const response = await asPnl.page.goto(printPath(id));
      expect(response?.status(), id).toBe(404);
      await expect(asPnl.page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
      expect(await asPnl.page.title(), id).not.toMatch(/^프로젝트 정산서/);
    }
    await asPnl.context.close();

    const before = (await printRows(fx.projectId)).length;
    const asStranger = await loggedIn(browser, baseURL, stranger);
    const response = await asStranger.page.goto(printPath(fx.projectId));
    expect(response?.status()).toBe(404);
    expect(await asStranger.page.title()).not.toMatch(/^프로젝트 정산서/);
    expect((await printRows(fx.projectId)).length).toBe(before);
    await asStranger.context.close();
  });
});
