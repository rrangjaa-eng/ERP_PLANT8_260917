import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { LEAVE_DOCUMENT_KIND, submitLeave } from "@/domain/leave";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";
import { makePerson, setupLeaveOrg, type LeaveOrg, type Person } from "./leave-org";

// 07.4-02 — 연차 신청서 인쇄 라우트 `/print/leaves/[id]`와 연차 상세 「인쇄」 입구. 인쇄 시작 갈래는 07.4-01 PrintBar가 정했다(A — 열면 자동 1회).
// 이 스펙이 만드는 연차는 week 24 · 26 · 28(다른 스펙이 리터럴로 쓰지 않는 주)이다. 기록은 응답을 기다리지 않으므로 행 수 단언은 expect.poll이다.
// document_print는 같은 사람 · 같은 서류를 5초 안에 한 행으로 합친다 — 같은 서류를 두 번 여는 시험은 5.2초를 기다린다.

test.describe.configure({ mode: "serial" });

let org: LeaveOrg;
let inProgressId: string;
let approvedId: string;
let remoteId: string;
let quarterId: string;
const FULL_DAY = { kind: "full_day", half: "" } as const;

test.beforeAll(async () => {
  const today = seoulToday();
  org = await setupLeaveOrg(today);
  const first = leaveWeekdayRange(today, { week: 24, weekdays: 3 });
  inProgressId = (await submitLeave(org.drafter.viewer, { ...FULL_DAY, ...first })).leaveId;
  const second = leaveWeekdayRange(today, { week: 26, weekdays: 2 });
  const approved = await submitLeave(org.drafter.viewer, { ...FULL_DAY, ...second });
  approvedId = approved.leaveId;
  for (const approver of [org.teamLead, org.divisionHead, org.mgmt, org.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: approvedId });
    if (!view) throw new Error(`결재 문서를 읽지 못했다: ${approver.name}`);
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
  const third = leaveWeekdayRange(today, { week: 28, weekdays: 1 });
  remoteId = (await submitLeave(org.drafter.viewer, { kind: "remote", half: "", ...third })).leaveId;
  const fourth = leaveWeekdayRange(today, { week: 29, weekdays: 1 });
  quarterId = (await submitLeave(org.drafter.viewer, { kind: "quarter_day", half: "", startTime: "14:00", ...fourth })).leaveId;
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

async function printRows(documentId: string): Promise<number> {
  const rows = await db.select().from(actionLog).where(and(eq(actionLog.actionType, "document_print"), eq(actionLog.documentId, documentId)));
  return rows.length;
}

const printPath = (id: string) => `/print/leaves/${id}`;
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const articleOf = (page: Page) => page.locator("article");
const numberLine = (page: Page) => page.locator("article > p").first();
const valueOf = (page: Page, label: string) => articleOf(page).locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd");

// 로딩 경계의 자리표시 main이 사라지고 본문(data-ready) 하나만 남은 뒤에 읽는다.
async function waitForPaper(page: Page): Promise<void> {
  await expect(page.locator("main[data-ready]")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(articleOf(page).getByRole("heading", { level: 1, name: "연차 신청서" })).toBeVisible();
}

async function screenValue(page: Page, id: string, label: string): Promise<string> {
  await page.goto(`/leave/${id}`);
  const dd = page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");
  await expect(dd).toHaveCount(1);
  return normalize(await dd.innerText());
}

test.describe("입구 · 종이 · 기록", () => {
  test("상세 「인쇄」 링크 하나가 새 탭으로 종이를 열고 일곱 행 · 상신일 · 화면과 같은 잔고 · 상태 글자가 있고 document_print 1행이 남는다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, org.teamLead);
    const screenBalance = await screenValue(page, inProgressId, "잔고");
    const link = page.getByRole("link", { name: "인쇄", exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", printPath(inProgressId));
    await expect(link).toHaveAttribute("rel", /noopener/);

    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState();
    await waitForPaper(popup);
    await expect(popup).toHaveTitle(/^연차 신청서 \S+/);
    const sheet = articleOf(popup);
    await expect(sheet.locator("dl dt")).toHaveText(["신청인", "소속", "종류", "기간", "일수", "비고", "잔고"]);
    await expect(sheet.getByText("입사일")).toHaveCount(0);
    await expect(sheet.getByText(/^상신일 \d{4}-\d{2}-\d{2}$/)).toHaveCount(1);
    await expect(numberLine(popup)).toContainText(/결재 중$/);
    await expect(sheet.locator('[data-state="submitted"]').first()).toContainText("기안");

    // 일수 값은 「일」이 한 번이다(eng 검토 B1).
    const days = normalize(await valueOf(popup, "일수").innerText());
    expect(days).toMatch(/^\d+(\.\d+)?일$/);
    expect(days).not.toContain("일일");

    // 잔고 글자는 같은 viewer가 연 상세 화면 잔고 값과 같고, 부여 · 적립 · 사용 · 소멸 글자가 없다(카드 E2).
    const paperBalance = normalize(await valueOf(popup, "잔고").innerText());
    expect(paperBalance).toBe(screenBalance);
    expect(paperBalance).toContain("연차 남음 ");
    expect(paperBalance).toContain("이번 신청 ");
    expect(paperBalance).not.toMatch(/부여|적립|사용 |소멸/);

    await expect.poll(() => printCalls(popup)).toBe(1);
    await expect.poll(() => printRows(inProgressId), { timeout: 10_000 }).toBe(1);
    await context.close();
  });

  test("승인 완료 연차는 상태 글자가 없고 잔고 「—」이며 일수는 상세 화면 일수 행과 같다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, org.teamLead);
    const screenDays = await screenValue(page, approvedId, "일수");
    expect(await page.locator("dt", { hasText: /^잔고$/ }).count()).toBe(0);
    await page.goto(printPath(approvedId));
    await waitForPaper(page);
    await expect(numberLine(page)).not.toContainText(/결재 중|반려|회수|작성 중/);
    expect(normalize(await valueOf(page, "잔고").innerText())).toBe("—");
    expect(normalize(await valueOf(page, "일수").innerText())).toBe(screenDays);
    await context.close();
  });

  test("재택 연차는 잔고 「—」이다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, org.teamLead);
    await page.goto(printPath(remoteId));
    await waitForPaper(page);
    await expect(page.locator("article dl dt")).toHaveCount(7);
    expect(normalize(await valueOf(page, "잔고").innerText())).toBe("—");
    await context.close();
  });

  test("반반차 연차는 종류 행이 상세 화면과 같은 `반반차 14:00`이다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, org.teamLead);
    const screenKind = await screenValue(page, quarterId, "종류");
    expect(screenKind).toBe("반반차 14:00");
    await page.goto(printPath(quarterId));
    await waitForPaper(page);
    expect(normalize(await valueOf(page, "종류").innerText())).toBe("반반차 14:00");
    await context.close();
  });

  test("없는 id · 형식 아닌 id · 남의 연차는 응답 전 404이고 제목이 서류 제목이 아니다", async ({ browser, baseURL }) => {
    const stranger = await makePerson("무관", "role-pm", org.teamId, `${seoulToday().slice(0, 4)}-01-01`);
    const { context, page } = await loggedIn(browser, baseURL, stranger);
    const before = await printRows(inProgressId);
    for (const id of ["00000000-0000-4000-8000-000000000000", "abc", inProgressId]) {
      const response = await page.goto(printPath(id));
      expect(response?.status(), id).toBe(404);
      await expect(page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
      expect(await page.title(), id).not.toMatch(/^연차 신청서/);
    }
    expect(await printRows(inProgressId)).toBe(before);
    await context.close();
  });

  test("세션 없이 열면 로그인으로 가고 서류 제목 · 기록이 남지 않는다", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const before = await printRows(inProgressId);
    await page.goto(printPath(inProgressId));
    await expect(page).toHaveURL(/\/login/);
    expect(await page.title()).not.toMatch(/^연차 신청서/);
    expect(await printRows(inProgressId)).toBe(before);
    await context.close();
  });

  test("종이 쪽 나눔: 비고 행만 이어질 수 있고 나머지 행은 쪼개지지 않는다", async ({ browser, baseURL }) => {
    const { context, page } = await loggedIn(browser, baseURL, org.teamLead);
    await page.goto(printPath(inProgressId));
    await waitForPaper(page);
    const breakOf = (label: string) => articleOf(page).locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).evaluate((el) => getComputedStyle(el).breakInside);
    expect(await breakOf("비고")).toBe("auto");
    expect(await breakOf("신청인")).toBe("avoid");
    expect(await breakOf("잔고")).toBe("avoid");
    await context.close();
  });
});
