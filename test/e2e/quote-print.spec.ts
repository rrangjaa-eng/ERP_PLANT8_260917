import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, projects, quoteLines, quoteRevisions } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { kstToday } from "@/lib/kst-date";

// 07.2-10 PU3 · PU4 — 고객 견적서 인쇄 `/print/quotes/[id]`(차수 id). 열기만으로는 인쇄도 기록도 없고,
// `인쇄 · PDF 저장` 클릭 · beforeprint가 보냄 기록이다. 본문에는 협력사 · 실행가 · 내부 비고가 없다.
// 기록은 응답을 기다리지 않으므로 행 수 단언은 expect.poll이다.

test.describe.configure({ mode: "serial" });

const TODAY = kstToday(new Date());
const SECRET_VENDOR = "비밀협력사상호";
const SECRET_NOTE = "내부비고비밀글자";
const SECRET_EXECUTION = "7,654,321";

type Account = { userId: string; email: string; password: string };

let pm: Account;
let projectId: string;
let projectName: string;
let projectNumber: string;
let revisionId: string;
let clientName: string;
let completedRevisionId: string;

async function makeAccount(roleId: string, teamId: string, name: string): Promise<Account> {
  const email = `e2e-qp-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

async function makeProject(teamId: string, pmUserId: string, status?: string) {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E고객사-${randomUUID().slice(0, 8)}`, normalizedName: `e2e-${randomUUID()}` });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: SECRET_VENDOR, normalizedName: `vendor-${randomUUID()}` });
  const name = `E2E견적서-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId, name });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const base = { revisionId: revision.id, subcategory: "기타", vendorId: vendor.id, note: SECRET_NOTE, executionAmountKrw: 7_654_321, profitKrw: 1_000 } as const;
  await db.insert(quoteLines).values([
    { ...base, itemName: "무대 설치", sortOrder: 0, quantity: "2.00", days: "3.00", unitPriceAmountKrw: 100_000, quoteAmountKrw: 600_000, clientRemark: "고객 비고 글자" },
    { ...base, itemName: "조명 임차", sortOrder: 1, unitPriceAmountKrw: 400_000, quoteAmountKrw: 400_000 },
    { ...base, itemName: "대행 수수료", sortOrder: 2, lineKind: "commission", unitPriceAmountKrw: 50_000, quoteAmountKrw: 50_000 },
  ]);
  if (status) await db.update(projects).set({ status }).where(eq(projects.id, created.id));
  return { id: created.id, number: created.number, name, revisionId: revision.id, clientName: client.name };
}

test.beforeAll(async () => {
  const unit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: unit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  pm = await makeAccount(DEFAULT_ROLE_ID, team.id, "E2E 견적서 PM");
  const project = await makeProject(team.id, pm.userId);
  projectId = project.id;
  projectName = project.name;
  projectNumber = project.number;
  revisionId = project.revisionId;
  clientName = project.clientName;
  completedRevisionId = (await makeProject(team.id, pm.userId, "completed")).revisionId;
});

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

async function loggedIn(browser: Browser, baseURL: string | undefined, person: { email: string; password: string }) {
  const context = await printSpyContext(browser, baseURL);
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(person.email);
  await page.getByLabel("비밀번호").fill(person.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return { context, page };
}

async function printRows(documentId: string): Promise<number> {
  const rows = await db.select().from(actionLog).where(and(eq(actionLog.actionType, "document_print"), eq(actionLog.documentId, documentId)));
  return rows.length;
}

async function printedAt(id: string): Promise<Date | null> {
  const [row] = await db.select().from(quoteRevisions).where(eq(quoteRevisions.id, id));
  return row?.printedAt ?? null;
}

const printPath = (id: string) => `/print/quotes/${id}`;

test.describe("열기만 · 클릭 · beforeprint", () => {
  test("인쇄 화면을 열기만 하면 window.print 호출 0 · document_print 0행 · printed_at null이다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.goto(printPath(revisionId));
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    await page.waitForTimeout(1500);
    expect(await printCalls(page)).toBe(0);
    expect(await printRows(revisionId)).toBe(0);
    expect(await printedAt(revisionId)).toBeNull();
    await context.close();
  });

  test("`인쇄 · PDF 저장` 클릭은 인쇄 1회 + 기록 1행 + printed_at이고, 5초 안 beforeprint는 합쳐 1행이다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.goto(printPath(revisionId));
    await page.getByRole("button", { name: "인쇄 · PDF 저장" }).click();
    await expect.poll(() => printCalls(page)).toBe(1);
    await expect.poll(() => printRows(revisionId), { timeout: 10_000 }).toBe(1);
    await expect.poll(() => printedAt(revisionId)).not.toBeNull();
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await page.waitForTimeout(1000);
    expect(await printRows(revisionId)).toBe(1);
    await context.close();
  });

  test("클릭 없이 beforeprint만 와도 기록 1행이다(Ctrl+P · 브라우저 메뉴)", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.waitForTimeout(5200);
    const before = await printRows(revisionId);
    await page.goto(printPath(revisionId));
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await expect.poll(() => printRows(revisionId), { timeout: 10_000 }).toBe(before + 1);
    await context.close();
  });

  test("`닫기`는 창이 닫히지 않으면 프로젝트 화면으로 간다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.goto(printPath(revisionId));
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
    await context.close();
  });
});

test.describe("본문 · 권리", () => {
  test("고객용 본문에는 협력사 · 실행가 · 내부 비고 · 차익이 없고 라벨 12개가 있다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.goto(printPath(revisionId));
    const sheet = page.locator("article");
    await expect(sheet.getByRole("heading", { level: 1, name: "QUOTATION" })).toBeVisible();
    const text = await sheet.innerText();
    for (const hidden of [SECRET_VENDOR, SECRET_NOTE, SECRET_EXECUTION, "7654321", "실행가", "차익"]) expect(text, hidden).not.toContain(hidden);
    for (const label of ["Bill to", "Event", "Date", "AE", "Ref.", "ITEM", "QTY", "COST/UNIT", "NO. of DAY/SET", "AMOUNT", "REMARK", "Grand Total"]) {
      await expect(sheet.getByText(label, { exact: true }), label).toHaveCount(1);
    }
    await expect(sheet.getByText(clientName)).toBeVisible();
    await expect(sheet.getByText(projectName)).toBeVisible();
    await expect(sheet.getByText(`${projectNumber}-1`)).toBeVisible();
    await expect(sheet.getByText("고객 비고 글자")).toBeVisible();
    await expect(sheet.getByText("1,050,000")).toBeVisible();
    await context.close();
  });

  test("권리 없는 계정(다른 팀 사원)이 주소로 열면 공용 404 변종이다", async ({ browser, baseURL }) => {
    const unit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    const otherTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: unit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
    const stranger = await makeAccount(DEFAULT_ROLE_ID, otherTeam.id, "E2E 남의 팀");
    const { context, page } = await loggedIn(browser, baseURL, stranger);
    const response = await page.goto(printPath(revisionId));
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
    await context.close();
  });

  test("완료 프로젝트의 차수 인쇄 주소는 공용 404 변종이다(결정 j)", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    const response = await page.goto(printPath(completedRevisionId));
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
    await context.close();
  });
});
