import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, projects, purchaseRequests } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { loadProjectProfit } from "@/domain/projects";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { formatKrw } from "@/lib/format-number";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createCorpCard } from "@/domain/corp-cards";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { changeProjectStatus } from "@/domain/projects/status";
import { completePurchaseRequest, createPurchaseRequest, precheckPurchaseCompletion, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { saveRevenue } from "@/domain/revenue";
import { submitSettlement } from "@/domain/settlements";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { insertVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { placeInFundDivision } from "@/test/integration/fixtures/fund-scope";
import { submitReadyDraft, testVendorAccount } from "../integration/fixtures/expenses";
import { makePerson, setupLeaveOrg, type LeaveOrg, type Person } from "./leave-org";
import { E2E_ONLINE_VENDOR_NAME, enableOnlineVendorSetting } from "./online-vendor";
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

async function tempViewer(prefix: string, menus: readonly { menu: string; action: string }[], hidden: readonly string[] = []): Promise<Person> {
  const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E정산서${prefix}-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  for (const { menu, action } of menus) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action, allowed: true });
  for (const item of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: item.key, visible: !hidden.includes(item.key) });
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

// Task 2 — 두 목록. 진행 중 프로젝트에 지출결의(4단 결재 통과 · 증빙은 메모리 저장소로 붙인다)와 구매 요청을 도메인 함수로 만든 뒤
// 자동 정산 · 정산 결재 올리기를 지난다(완료 전 점검이 막지 않게 줄마다 연결 + 발행 줄). 0행 사례는 위 fx(지출결의 · 구매 요청 없음)다.
type DocsWorld = { projectId: string; expenseCount: number; purchases: { number: string; estimateKrw: number }[]; usage: { usedOn: string; totalKrw: number } };

async function approveExpense(org: LeaveOrg, expenseId: string): Promise<void> {
  for (const approver of [org.teamLead, org.divisionHead, org.mgmt, org.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    if (!view) throw new Error(`결재 문서를 읽지 못했다: ${approver.name}`);
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
}

async function purchaser(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E정산서구매-${suffix}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E정산서구매본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E정산서구매팀-${suffix}` });
  const person = await makePerson("구매", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  await placeInFundDivision(person.viewer.id);
  return person;
}

async function settlementWithDocs(expenseCount: number, purchaseCount: number): Promise<DocsWorld> {
  const today = seoulToday();
  const lastYear = Number(today.slice(0, 4)) - 1;
  const suffix = randomUUID().slice(0, 6);
  const org = await setupLeaveOrg(today);
  await enableOnlineVendorSetting();
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E정산서무대-${suffix}`, normalizedName: `e2e정산서무대-${suffix}`, defaultEvidenceType: "tax_invoice", ...testVendorAccount(), confirmedAt: new Date() });
  const online = await insertVendor(SYSTEM_VIEWER, { name: E2E_ONLINE_VENDOR_NAME, normalizedName: E2E_ONLINE_VENDOR_NAME.toLowerCase(), defaultEvidenceType: "tax_invoice", ...testVendorAccount() });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E정산서클라이언트-${suffix}`, normalizedName: `e2e정산서클라이언트-${suffix}`, ...testVendorAccount() });
  const period = { startDate: `${lastYear}-11-01`, endDate: `${lastYear}-12-31` };
  const project = await createProject(org.drafter.viewer, { clientId: client.id, teamId: org.teamId, pmUserId: org.drafter.viewer.id, name: `E2E정산서목록-${suffix}`, ...period });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const row = (itemName: string, vendorId: string, executionKrw: number) => ({
    id: randomUUID(),
    isNew: true as const,
    subcategory,
    itemName,
    vendorId,
    unitPrice: { currency: "KRW" as const, amount: executionKrw + 500_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: executionKrw, fxRate: 1 },
  });
  const expenseRows = Array.from({ length: expenseCount }, (_, index) => row(`무대 제작 ${index + 1}-${suffix}`, vendor.id, 1_000_000 + index * 10_000));
  const onlineRow = row(`현장 소모품-${suffix}`, online.id, 5_000_000);
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [...expenseRows, onlineRow] });
  await changeProjectStatus(org.teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(org.drafter.viewer, revision.id, { approvalBasis: "verbal", approvedOn: period.endDate, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });

  for (const line of expenseRows) {
    const created = await createExpenseFromLines(org.drafter.viewer, { lineIds: [line.id], fields: { note: "행사 운영비" } });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
    const submitted = await submitReadyDraft(org.drafter.viewer, expenseId);
    if (submitted.kind !== "submitted") throw new Error(`제출되지 않음: ${JSON.stringify(submitted)}`);
    await approveExpense(org, expenseId);
  }

  const purchases: DocsWorld["purchases"] = [];
  for (let index = 0; index < purchaseCount; index += 1) {
    const estimateKrw = 110_000 + index * 1_000;
    const input = { linkKind: "quote_line" as const, lineId: onlineRow.id, itemName: `현수막 ${index + 1}장-${suffix}`, linkUrl: null, estimate: { currency: "KRW" as const, amount: estimateKrw, fxRate: 1 }, memo: null };
    const created = await createPurchaseRequest(org.drafter.viewer, input, await precheckPurchaseRequest(org.drafter.viewer, input));
    purchases.push({ number: created.number, estimateKrw });
  }
  // 첫 요청만 구매 완료(카드 결제 합계는 예상 금액과 다른 값).
  const usage = { usedOn: today, totalKrw: 99_000 };
  const first = purchases[0];
  if (first) {
    const buyer = await purchaser();
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `E2E정산서카드사-${suffix}`, numberLast4: String(1000 + Math.floor(Math.random() * 9000)), label: `E2E정산서카드-${suffix}`, kind: "shared" });
    const [requested] = await db.select({ id: purchaseRequests.id, version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.number, first.number));
    if (!requested || !card.id) throw new Error("요청 · 카드 없음");
    const input = { requestId: requested.id, version: requested.version, corpCardId: card.id, usedOn: usage.usedOn, merchantVendorId: null, total: { currency: "KRW" as const, amount: usage.totalKrw, fxRate: 1 }, evidenceTypeCode: "invoice", memo: null };
    await completePurchaseRequest(buyer.viewer, input, await precheckPurchaseCompletion(buyer.viewer, input));
  }

  await saveRevenue(SYSTEM_VIEWER, project.id, { issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: period.endDate, amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }] });
  // 종료일이 지난 진행 프로젝트는 앞선 쓰기(잠금 안 재판정)에서 이미 정산이 됐을 수 있다 — 상태로 확인한다.
  await applyAutoSettlement({ projectIds: [project.id] });
  const [status] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, project.id));
  if (status?.status !== "settling") throw new Error(`자동 정산이 되지 않았습니다: ${status?.status}`);
  const result = await submitSettlement(org.drafter.viewer, { projectId: project.id });
  if (result.kind !== "submitted") throw new Error(`정산 결재가 올라가지 않았습니다: ${JSON.stringify(result)}`);
  return { projectId: project.id, expenseCount, purchases, usage };
}

const tableOf = (page: Page, caption: string) => articleOf(page).locator("table", { has: page.locator("caption", { hasText: new RegExp(`^${caption}$`) }) });
const headsOf = async (page: Page, caption: string) => (await tableOf(page, caption).locator("thead th").allInnerTexts()).map(normalize);

test.describe("두 목록 · 0행 · 여러 쪽 · 금액 열", () => {
  let rich: DocsWorld;
  let many: DocsWorld;
  let noAmountViewer: Person;

  test.beforeAll(async () => {
    test.setTimeout(600_000);
    rich = await settlementWithDocs(3, 2);
    many = await settlementWithDocs(45, 12);
    noAmountViewer = await tempViewer("무금액", [...PROJECT_MENUS, { menu: "pnl", action: "view" }], ["expense.amount", "purchase_request.amount"]);
  });

  test("F-S1: 지출결의 3행 · 구매 요청 2행 — 표 머리 · 예상 금액 · 카드 사용 보조 줄 · caption 1 · 합계 행 없음", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pnlViewer);
    await page.goto(printPath(rich.projectId));
    await waitForPaper(page);
    const sheet = articleOf(page);
    for (const name of ["지출결의", "구매 요청"]) await expect(sheet.getByRole("heading", { level: 2, name, exact: true })).toHaveCount(1);

    expect(await headsOf(page, "지출결의")).toEqual(["번호", "항목", "지급처", "공급가", "상태"]);
    await expect(tableOf(page, "지출결의").locator("tbody tr")).toHaveCount(3);
    expect(await headsOf(page, "구매 요청")).toEqual(["번호", "요청일", "품목", "요청자", "예상 금액", "상태"]);
    await expect(sheet.locator("th", { hasText: /^금액$/ })).toHaveCount(0);
    const purchaseRows = tableOf(page, "구매 요청").locator("tbody tr");
    await expect(purchaseRows).toHaveCount(2);
    for (const [index, purchase] of rich.purchases.entries()) {
      const cells = purchaseRows.nth(index).locator("td");
      await expect(cells.nth(0)).toHaveText(purchase.number);
      await expect(cells.nth(4)).toHaveText(formatKrw(purchase.estimateKrw));
    }
    await expect(purchaseRows.nth(0).locator("td").nth(5).locator("span", { hasText: /^카드 사용/ })).toHaveText(`카드 사용 ${rich.usage.usedOn.slice(5)} · ${formatKrw(rich.usage.totalKrw)}`);
    await expect(purchaseRows.nth(1).getByText(/카드 사용/)).toHaveCount(0);

    // 감사 D1 · D2(print 미디어): 두 표 본문은 12px(UI-SPEC 「행 12px」), 보조 줄의 사용일 MM-DD는 한 줄 상자다(22mm 칸에서 하이픈으로 끊기지 않는다).
    await page.emulateMedia({ media: "print" });
    const usageDate = purchaseRows.nth(0).locator("td").nth(5).locator("span", { hasText: /^카드 사용/ }).locator("span", { hasText: new RegExp(`^${rich.usage.usedOn.slice(5)}$`) });
    await expect(usageDate).toHaveCount(1);
    expect(await usageDate.evaluate((element) => element.getClientRects().length)).toBe(1);
    const tdSizes = await sheet.locator("table td").evaluateAll((cells) => [...new Set(cells.map((cell) => getComputedStyle(cell).fontSize))]);
    expect(tdSizes).toEqual(["12px"]);
    await page.emulateMedia({ media: "screen" });

    await expect(sheet.locator("tfoot")).toHaveCount(0);
    await expect(sheet.locator("td", { hasText: /합계/ })).toHaveCount(0);
    for (const caption of ["지출결의", "구매 요청"]) {
      await expect(tableOf(page, caption).locator("caption")).toHaveCount(1);
      const box = await tableOf(page, caption).locator("caption").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, clip: getComputedStyle(element).clip };
      });
      expect(box.width <= 1 || box.clip !== "auto", JSON.stringify(box)).toBe(true);
      expect(box.height <= 1 || box.clip !== "auto", JSON.stringify(box)).toBe(true);
    }
    await context.close();
  });

  test("0행: 지출결의 · 구매 요청이 없는 정산은 두 절 제목 아래 「—」이고 table이 없다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pnlViewer);
    await page.goto(printPath(fx.projectId));
    await waitForPaper(page);
    const sheet = articleOf(page);
    for (const name of ["지출결의", "구매 요청"]) await expect(sheet.locator(`h2:text-is("${name}") + p`)).toHaveText("—");
    await expect(sheet.locator("table")).toHaveCount(0);
    await context.close();
  });

  test("F-S3: 지출 45 · 구매 12는 print 미디어에서 2쪽 이상 · thead 반복 · 행과 결재란은 쪼개지지 않는다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pnlViewer);
    await page.goto(printPath(many.projectId));
    await waitForPaper(page);
    await expect(tableOf(page, "지출결의").locator("tbody tr")).toHaveCount(many.expenseCount);
    await expect(tableOf(page, "구매 요청").locator("tbody tr")).toHaveCount(many.purchases.length);
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(2);
    const styles = await articleOf(page).evaluate((article) => {
      const approval = [...article.querySelectorAll("section")].find((section) => section.querySelector("h2")?.textContent === "결재");
      return {
        thead: [...article.querySelectorAll("thead")].map((element) => getComputedStyle(element).display),
        rows: [...new Set([...article.querySelectorAll("tbody tr")].map((element) => getComputedStyle(element).breakInside))],
        approval: approval ? getComputedStyle(approval).breakInside : null,
      };
    });
    expect(styles.thead).toEqual(["table-header-group", "table-header-group"]);
    expect(styles.rows).toEqual(["avoid"]);
    expect(styles.approval).toBe("avoid");
    await context.close();
  });

  test("금액 못 보는 계급: 공급가 · 예상 금액 머리가 없고 항목 · 지급처 · 상태 머리는 있다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, noAmountViewer);
    await page.goto(printPath(rich.projectId));
    await waitForPaper(page);
    expect(await headsOf(page, "지출결의")).toEqual(["번호", "항목", "지급처", "상태"]);
    expect(await headsOf(page, "구매 요청")).toEqual(["번호", "요청일", "품목", "요청자", "상태"]);
    await expect(articleOf(page).locator("th", { hasText: /금액|공급가/ })).toHaveCount(0);
    await context.close();
  });
});
