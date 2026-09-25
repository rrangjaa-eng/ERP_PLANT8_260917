import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, quoteLines } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";

// 04-22(S19 · DR-6 · D-68) — 저장 흐름. 화면이 본 상태와 서버 상태가 다르면 저장 전체가 거부되고, 화면이
// 새 상태로 다시 그려지며, 편집은 브라우저 보관본에서 복원 줄로 돌아온다. 04-30이 저장 중 잠금 케이스를
// 더한다. 계급 권한·정보 노출을 손으로 켜지 않는다(ENG-D2) — 시드만 쓴다.
//
// 편집하는 사람은 담당 PM이다: 사용자 결정 2026-09-25 「기간만 수정」으로 팀장은 projects 쓰기가 없어
// 견적 줄 셀을 고칠 수 없다. 동료 팀장은 다른 브라우저 컨텍스트에서 같은 프로젝트를 미수주로 닫는다.
const TODAY = kstToday(new Date());

type Account = { userId: string; email: string; password: string };

async function makeAccount(roleId: string, teamId: string): Promise<Account> {
  const email = `e2e-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E Employee", roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("저장 흐름 (04-22, S19)", () => {
  test("상태가 바뀐 뒤의 저장은 전부 거부 → 태그가 새 상태로 다시 그려지고 → 복원 줄로 편집이 돌아온다", async ({ page, browser }) => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E저장흐름-${randomUUID()}`, normalizedName: `e2e저장흐름-${randomUUID()}` });
    const name = `E2E저장흐름-${randomUUID().slice(0, 8)}`;
    const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: pm.userId, name });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("시드된 소분류가 없습니다");
    const firstItem = `첫 줄-${randomUUID().slice(0, 6)}`;
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategory.value, itemName: firstItem, quantity: 1, unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
      { id: randomUUID(), isNew: true, subcategory: subcategory.value, itemName: `둘째 줄-${randomUUID().slice(0, 6)}`, quantity: 1, unitPrice: { currency: "KRW", amount: 2_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 900_000, fxRate: 1 } },
    ] });

    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("수주중", { exact: true }).filter({ visible: true })).toBeVisible();

    const firstRow = page.locator("tbody tr").filter({ hasText: firstItem });
    const executionCell = firstRow.getByRole("gridcell").nth(7);
    await executionCell.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("777000");
    await page.keyboard.press("Enter");
    await expect(executionCell).toHaveText("777,000");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    // 동료 팀장이 다른 브라우저 컨텍스트에서 같은 프로젝트를 미수주로 닫는다.
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await login(other, lead);
    await other.goto(`/projects/${project.id}`);
    await other.getByRole("button", { name: "상태 바꾸기" }).click();
    await other.getByRole("dialog", { name: "상태 바꾸기" }).getByRole("button", { name: /^미수주/ }).click();
    await other.getByRole("dialog", { name: "미수주로 닫기" }).getByRole("button", { name: /^미수주로 닫기/ }).click();
    await expect(other.getByText(`미수주로 닫기 · ${project.number}`, { exact: true })).toBeVisible();
    await otherContext.close();

    await executionCell.focus();
    await page.keyboard.press("Control+s");

    await expect(page.locator("tfoot").getByText("상태가 미수주로 바뀜 · 전부 거부")).toBeVisible();
    await expect(page.getByText("미수주", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("저장 안 한 편집 1칸")).toBeVisible();
    await expect(executionCell).toHaveText("500,000");

    await page.getByRole("button", { name: "복원" }).click();
    await expect(executionCell).toHaveText("777,000");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const [saved] = await db.select().from(quoteLines).where(eq(quoteLines.itemName, firstItem));
    expect(Number(saved?.executionAmountKrw)).toBe(500_000);
  });
});

// 04-49(DR-3 · 계약 3) — 저장 요청 동안 화면의 편집기는 보이되 편집에 들어가지 않는다. 응답이 표를 서버 목록으로
// 다시 그리므로 그 사이 입력은 사라진다 — 입력 자체를 막는다. 서버 액션 요청을 붙잡아 「요청 중」을 만든다.
test.describe("저장 중 잠금(DR-3)", () => {
  test("요청 중에는 셀·기간 칸이 편집에 들어가지 않고 이동만 되며, 연타 Ctrl+S는 요청 하나, 응답 뒤 다시 편집된다", async ({ page }) => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E저장잠금-${randomUUID()}`, normalizedName: `e2e저장잠금-${randomUUID()}` });
    const name = `E2E저장잠금-${randomUUID().slice(0, 8)}`;
    const project = await createProject(SYSTEM_VIEWER, {
      clientId: vendor.id,
      teamId: team.id,
      pmUserId: pm.userId,
      name,
      startDate: addDays(TODAY, -10),
      endDate: addDays(TODAY, 10),
    });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("시드된 소분류가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategory.value, itemName: "잠금 첫 줄", quantity: 1, unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
      { id: randomUUID(), isNew: true, subcategory: subcategory.value, itemName: "잠금 둘째 줄", quantity: 1, unitPrice: { currency: "KRW", amount: 2_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 900_000, fxRate: 1 } },
    ] });
    await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));

    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    const grid = page.getByRole("grid", { name: "견적 줄" });
    const dataRows = grid.locator('tbody tr:has(> td[role="gridcell"])');
    const firstExecution = dataRows.nth(0).getByRole("gridcell").nth(7);
    const secondExecution = dataRows.nth(1).getByRole("gridcell").nth(7);

    await firstExecution.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "실행가" }).fill("777000");
    await page.keyboard.press("Enter");
    await expect(firstExecution).toHaveText("777,000");

    // 기간 칸을 열어 둔다(표 밖 칸도 잠긴다).
    await page.locator("#period-open").click();
    await page.locator("#period-end").fill(addDays(TODAY, 12));
    await expect(page.getByRole("button", { name: /일괄 저장 2/ })).toBeVisible();

    // 서버 액션 요청을 풀어 줄 때까지 붙잡는다.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let saveRequestCount = 0;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
        saveRequestCount += 1;
        await held;
      }
      await route.continue();
    });

    await firstExecution.focus();
    await page.keyboard.press("Control+s");
    const primary = page.getByRole("button", { name: /일괄 저장/ });
    await expect(primary).toContainText("…");
    await expect(grid).toHaveAttribute("aria-busy", "true");
    await expect(grid).toHaveAttribute("role", "grid");
    await expect.poll(() => saveRequestCount).toBe(1);

    // 편집 진입 없음 — Enter · 글자 · 클릭.
    await secondExecution.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("9");
    await expect(page.getByRole("textbox", { name: "실행가" })).toHaveCount(0);
    await secondExecution.click();
    await expect(page.getByRole("textbox", { name: "실행가" })).toHaveCount(0);
    await expect(secondExecution).toHaveText("900,000");
    // 이동은 된다.
    await page.keyboard.press("ArrowUp");
    await expect(firstExecution).toBeFocused();
    // 기간 칸은 값을 보인 채 읽기 전용.
    await expect(page.locator("#period-end")).toHaveAttribute("readonly", "");
    await expect(page.locator("#period-end")).toHaveValue(addDays(TODAY, 12));
    // 연타 Ctrl+S는 두 번째 요청을 만들지 않는다.
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(300);
    expect(saveRequestCount).toBe(1);

    release();
    await expect(page.locator("tfoot").getByText(/저장됨/).first()).toBeVisible();
    expect(saveRequestCount).toBe(1);
    await expect(grid).not.toHaveAttribute("aria-busy", "true");
    await secondExecution.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "실행가" })).toBeVisible();
  });
});

// 04-49 리뷰 S-2 · S-6 — 잠금 케이스 보강용 준비: 진행 두 줄 프로젝트를 PM으로 열고, 서버 액션 요청을 붙잡는 스위치를 준다.
async function openLockProject(page: Page) {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E잠금보강-${randomUUID()}`, normalizedName: `e2e잠금보강-${randomUUID()}` });
  const name = `E2E잠금보강-${randomUUID().slice(0, 8)}`;
  const project = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: team.id,
    pmUserId: pm.userId,
    name,
    startDate: addDays(TODAY, -10),
    endDate: addDays(TODAY, 10),
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("차수가 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 소분류가 없습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
    { id: randomUUID(), isNew: true, subcategory: subcategory.value, itemName: "보강 첫 줄", quantity: 1, unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
    { id: randomUUID(), isNew: true, subcategory: subcategory.value, itemName: "보강 둘째 줄", quantity: 1, unitPrice: { currency: "KRW", amount: 2_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 900_000, fxRate: 1 } },
  ] });
  await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));

  await login(page, pm);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const grid = page.getByRole("grid", { name: "견적 줄" });
  const dataRows = grid.locator('tbody tr:has(> td[role="gridcell"])');
  const execution = (row: number) => dataRows.nth(row).getByRole("gridcell").nth(7);

  // 붙잡은 요청은 release(응답 그대로) 또는 fail(500)로 푼다.
  let settle: (mode: "continue" | "fail") => void = () => {};
  const held = new Promise<"continue" | "fail">((resolve) => {
    settle = resolve;
  });
  const saves = { count: 0 };
  async function holdSaves() {
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
        saves.count += 1;
        if ((await held) === "fail") {
          await route.fulfill({ status: 500, body: "" });
          return;
        }
      }
      await route.continue();
    });
  }
  return { grid, dataRows, execution, holdSaves, saves, release: () => settle("continue"), fail: () => settle("fail") };
}

async function editExecution(page: Page, target: ReturnType<Page["locator"]>, value: string) {
  await target.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "실행가" }).fill(value);
  await page.keyboard.press("Enter");
}

test.describe("저장 중 잠금 — 복원 줄·표 밖 칸 여는 버튼(리뷰 S-6)", () => {
  test("요청 중 「버림」·「복원」·기간 바꾸기·총 매출 예상가 바꾸기는 무동작이다", async ({ page }) => {
    const { grid, execution, holdSaves, release } = await openLockProject(page);
    await editExecution(page, execution(0), "777000");
    await expect(execution(0)).toHaveText("777,000");
    await page.reload();
    const restoreLine = page.locator("p").getByText("저장 안 한 편집 1칸");
    await expect(restoreLine).toBeVisible();

    await editExecution(page, execution(1), "888000");
    await holdSaves();
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await expect(grid).toHaveAttribute("aria-busy", "true");

    await page.getByRole("button", { name: "버림", exact: true }).click();
    await expect(restoreLine).toBeVisible();
    await page.getByRole("button", { name: "복원", exact: true }).click();
    await expect(restoreLine).toBeVisible();
    await expect(execution(0)).toHaveText("500,000");
    await page.getByRole("button", { name: "기간 바꾸기" }).click();
    await expect(page.locator("#period-end")).toHaveCount(0);
    await page.getByRole("button", { name: "총 매출 예상가 바꾸기" }).click();
    await expect(page.getByRole("button", { name: "총 매출 예상가 바꾸기" })).toBeVisible();

    release();
    await expect(page.locator("tfoot").getByText(/저장됨/).first()).toBeVisible();
  });
});

test.describe("저장 중 잠금 — 구조 키·붙여넣기·실패 뒤 해제(리뷰 S-2)", () => {
  test("요청 중 Delete·Ctrl+Enter·Ctrl+D·Alt+↓·붙여넣기는 줄과 값을 바꾸지 않고, 실패 응답 뒤 잠금이 풀린다", async ({ page }) => {
    const { grid, dataRows, execution, holdSaves, saves, fail } = await openLockProject(page);
    const itemNames = () => dataRows.locator("td:nth-child(3)").allTextContents();
    await editExecution(page, execution(0), "777000");
    const before = await itemNames();

    await holdSaves();
    await execution(0).focus();
    await page.keyboard.press("Control+s");
    await expect(grid).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => saves.count).toBe(1);

    await execution(1).focus();
    await page.keyboard.press("Delete");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("Control+Enter");
    await page.keyboard.press("Control+d");
    await page.keyboard.press("Alt+ArrowUp");
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "123456");
      document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
    expect(await itemNames()).toEqual(before);
    await expect(execution(1)).toHaveText("900,000");

    fail();
    await expect(grid).not.toHaveAttribute("aria-busy", "true");
    await execution(1).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "실행가" })).toBeVisible();
  });
});

// 04-49(04-22 이월 · 04-30 DOM 감사 12b) — 저장 안 한 편집을 남긴 채 새로 고치면 복원 줄이 서버 HTML과 첫 클라이언트
// 렌더에서 같아야 한다(React #418 수화 불일치 없음). 프로덕션 빌드에서는 `Minified React error #418`로 나온다.
test.describe("복원 줄 수화(#418)", () => {
  test("저장 안 한 편집을 남기고 새로 고치면 복원 줄이 보이고 수화 오류가 없다", async ({ page }) => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E수화-${randomUUID()}`, normalizedName: `e2e수화-${randomUUID()}` });
    const name = `E2E수화-${randomUUID().slice(0, 8)}`;
    const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: pm.userId, name });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("시드된 소분류가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategory.value, itemName: "수화 줄", quantity: 1, unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
    ] });

    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const executionCell = page.locator("tbody tr").filter({ hasText: "수화 줄" }).getByRole("gridcell").nth(7);
    await executionCell.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "실행가" }).fill("777000");
    await page.keyboard.press("Enter");
    await expect(executionCell).toHaveText("777,000");

    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.reload();
    await expect(page.locator("p").getByText("저장 안 한 편집 1칸")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(errors.filter((text) => /#418|Hydration|hydrat/i.test(text))).toEqual([]);
  });
});
