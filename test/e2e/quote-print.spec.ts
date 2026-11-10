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
let bigRevisionId: string;

async function makeAccount(roleId: string, teamId: string, name: string): Promise<Account> {
  const email = `e2e-qp-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

async function makeProject(teamId: string, pmUserId: string, status?: string, bigAmountKrw?: number) {
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
    ...(bigAmountKrw ? [{ ...base, itemName: "큰 금액 줄", sortOrder: 3, unitPriceAmountKrw: bigAmountKrw, quoteAmountKrw: bigAmountKrw }] : []),
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
  bigRevisionId = (await makeProject(team.id, pm.userId, undefined, 345_000_000)).revisionId;
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
    // 서버 렌더 직후에는 리스너가 아직 안 붙었을 수 있다 — 붙을 때까지 다시 보낸다(5초 안 재발생은 한 행으로 합쳐진다).
    await expect
      .poll(
        async () => {
          await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
          return printRows(revisionId);
        },
        { timeout: 10_000 },
      )
      .toBe(before + 1);
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
  test("고객용 본문에는 협력사 · 실행가 · 내부 비고 · 차익이 없고 라벨 15개가 있다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.goto(printPath(revisionId));
    const sheet = page.locator("article");
    await expect(sheet.getByRole("heading", { level: 1, name: "QUOTATION" })).toBeVisible();
    const text = await sheet.innerText();
    for (const hidden of [SECRET_VENDOR, SECRET_NOTE, SECRET_EXECUTION, "7654321", "실행가", "차익"]) expect(text, hidden).not.toContain(hidden);
    for (const label of ["Bill to", "Event", "Date", "AE", "Ref.", "ITEM", "QTY", "COST/UNIT", "NO. of DAY/SET", "AMOUNT", "REMARK", "Sub Total", "Total", "Grand Total", "VAT excluded"]) {
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

// 07.2-10 Task 2 — 종이 모양(S7): 머리 값만 · 열 폭 · 묶음 머리 · 합계 순서 · 보냄 기록 실패 토스트. 폭은 화면 미디어의 th 상자로 잰다(A4 폭 166mm = 표 폭).
const mm = (px: number) => (px * 25.4) / 96;

test.describe("종이 — 머리 · 열 폭 · 합계", () => {
  test("머리에 출력 일시와 한글 회사 정보 라벨이 없다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.goto(printPath(revisionId));
    const header = page.locator("article header");
    await expect(header).toBeVisible();
    const text = await header.innerText();
    for (const gone of ["출력", "사업자번호", "대표", "전화"]) expect(text, gone).not.toContain(gone);
    await context.close();
  });

  test("열 폭 QTY 14 · COST/UNIT 26 · NO. of DAY/SET 18 · AMOUNT 36 · REMARK 30 · ITEM 42mm, 합 166mm", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(printPath(revisionId));
    await expect(page.locator("article table thead th").first()).toBeVisible();
    const widths = await page.locator("article table thead th").evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().width));
    const expected = [42, 14, 26, 18, 36, 30];
    expect(widths).toHaveLength(6);
    widths.forEach((width, index) => expect(Math.abs(mm(width) - (expected[index] ?? 0)), `열 ${index} 폭 ${mm(width).toFixed(2)}mm`).toBeLessThanOrEqual(0.5));
    expect(Math.abs(mm(widths.reduce((sum, width) => sum + width, 0)) - 166)).toBeLessThanOrEqual(0.5);
    await context.close();
  });

  test("묶음 머리 12px 700 · 계산 행 700 · Grand Total 24px 700 + 위 2px 선 · VAT excluded 11px · tfoot 0 · 라벨 개수", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.goto(printPath(revisionId));
    const table = page.locator("article table");
    await expect(table.locator("tfoot")).toHaveCount(0);
    const group = table.locator("tbody tr", { has: page.locator("td[colspan='6']") }).first();
    expect(await group.locator("td").evaluate((td) => [getComputedStyle(td).fontSize, getComputedStyle(td).fontWeight])).toEqual(["12px", "700"]);
    await expect(table.getByText("Sub Total", { exact: true })).toHaveCount(1);
    await expect(table.getByText("Total", { exact: true })).toHaveCount(1);
    const subRow = table.locator("tbody tr", { hasText: "Sub Total" });
    expect(await subRow.locator("td").first().evaluate((td) => getComputedStyle(td).fontWeight)).toBe("700");
    const order = await table.locator("tbody tr").evaluateAll((rows) => rows.map((row) => ((row as HTMLTableRowElement).cells[0]?.textContent ?? "").trim().split(/\s+/)[0]));
    expect(order.at(-1)).toBe("Grand");
    expect(order.slice(-3)).toEqual(["Total", "대행", "Grand"]);
    const amount = table.getByText("1,050,000", { exact: true });
    expect(await amount.evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).fontWeight])).toEqual(["24px", "700"]);
    expect(await table.locator("tbody tr").last().locator("td").first().evaluate((td) => getComputedStyle(td).borderTopWidth)).toBe("2px");
    expect(await table.getByText("VAT excluded", { exact: true }).evaluate((el) => getComputedStyle(el).fontSize)).toBe("11px");
    await context.close();
  });

  test("9자리 합계(345,000,000대)도 Grand Total 숫자가 한 줄이고 숫자 칸이 QTY~AMOUNT 네 칸 94mm다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(printPath(bigRevisionId));
    const row = page.locator("article table tbody tr").last();
    await expect(row.locator("td")).toHaveCount(3);
    const merged = row.locator("td").nth(1);
    await expect(merged).toBeVisible();
    expect(await merged.getAttribute("colspan")).toBe("4");
    expect(Math.abs(mm((await merged.boundingBox())?.width ?? 0) - 94)).toBeLessThanOrEqual(0.5);
    const number = merged.locator("span").first();
    await expect(number).toHaveText("346,050,000");
    const height = (await number.boundingBox())?.height ?? 0;
    expect(height).toBeLessThanOrEqual(24 * 1.3 + 1);
    await context.close();
  });
});

test.describe("보냄 기록 실패 토스트", () => {
  test("기록 요청이 실패해도 인쇄는 나가고 토스트가 알리며, 인쇄 다시로 기록된다. 인쇄 미디어에서는 숨는다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, pm);
    await page.waitForTimeout(5200);
    const before = await printRows(revisionId);
    await page.goto(printPath(revisionId));
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    await page.route("**/print/quotes/**", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await page.getByRole("button", { name: "인쇄 · PDF 저장" }).click();
    await expect.poll(() => printCalls(page)).toBe(1);
    // 라우트 안내자(next-route-announcer)도 role=alert라 글자로 좁힌다.
    const alert = page.getByRole("alert").filter({ hasText: "보냄 기록 실패" });
    await expect(alert).toHaveCount(1);
    await expect(alert.getByRole("button", { name: "인쇄 다시" })).toHaveCount(1);
    expect(await printRows(revisionId)).toBe(before);

    await page.emulateMedia({ media: "print" });
    await expect(alert).toBeHidden();
    await expect(page.locator("main[data-ready] > div").first()).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    await page.unroute("**/print/quotes/**");
    await alert.getByRole("button", { name: "인쇄 다시" }).click();
    await expect.poll(() => printRows(revisionId), { timeout: 10_000 }).toBe(before + 1);
    await expect.poll(() => printCalls(page)).toBe(2);
    await context.close();
  });
});
