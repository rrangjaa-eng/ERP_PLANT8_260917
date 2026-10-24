import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projectBudgetEntries, projects, quoteLines, settingsSimple } from "@/db/schema";
import { createFixtureUser } from "./fixtures";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { PROJECT_COST_RATE_PCT } from "@/domain/settings/keys";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { findSimpleValue, upsertSimpleValue } from "@/repositories/settings";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";

// 07-24(SC-21 · W5 · K8 · K9 · K11 · D-734): 예산 현황 — 경영관리(시드 계급이 아니다 — 07-05 · D-729)는 임시 계급에 `projects.budget` 보기 · 쓰기와
// 정보 항목 `budget.amount`를 픽스처에서 직접 켠 계정이다. 행 범위는 팀으로 좁혀 공유 erp_test의 다른 프로젝트가 표에 섞이지 않게 한다.
// 원가율은 전역 설정이라 이 파일은 desktop-settings(워커 1)에서 돈다 — 끝에 원래 값으로 되돌린다.

test.describe.configure({ mode: "serial" });

const KEY = PROJECT_COST_RATE_PCT.key;
let original: Awaited<ReturnType<typeof findSimpleValue>> = null;

test.beforeAll(async () => {
  original = await findSimpleValue(SYSTEM_VIEWER, KEY);
});

test.afterAll(async () => {
  if (original) await upsertSimpleValue(SYSTEM_VIEWER, KEY, original.value, original.updatedBy);
  else await db.delete(settingsSimple).where(eq(settingsSimple.key, KEY));
});

async function setCostRate(value: number | null): Promise<void> {
  await upsertSimpleValue(SYSTEM_VIEWER, KEY, value, null);
}

type Team = { teamId: string; lead: Viewer; pmId: string };

async function makeTeam(): Promise<Team> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E예산본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E예산-${randomUUID().slice(0, 8)}` });
  const lead = await createAccount(SYSTEM_VIEWER, { email: `e2e-budget-lead-${randomUUID()}@example.test`, name: "E2E 예산 팀장", roleId: TEAM_LEAD_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId: lead.userId, teamId: team.id, effectiveFrom: "2020-01-01" });
  const pm = await createAccount(SYSTEM_VIEWER, { email: `e2e-budget-pm-${randomUUID()}@example.test`, name: "E2E 예산 PM", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId: pm.userId, teamId: team.id, effectiveFrom: "2020-01-01" });
  return { teamId: team.id, lead: { id: lead.userId, roleId: TEAM_LEAD_ROLE_ID }, pmId: pm.userId };
}

// 팀 범위 경영관리 계정 — write가 거짓이면 보기만(「예산 바꾸기」 없음 — 배포 직후 쓰기 칸이 꺼진 상태와 같다).
// settings가 참이면 시스템 설정 보기 · 쓰기도(원가율 잠김 줄의 3차 · 첫 저장 결과 줄 시험). budget이 거짓이면 예산 현황 메뉴 없이 설정만.
async function budgetUser(teamId: string, opts: { write?: boolean; settings?: boolean; budget?: boolean } = {}) {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E경영관리-${randomUUID().slice(0, 8)}`, viewScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  if (opts.budget !== false) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.budget", action: "view", allowed: true });
  if (opts.budget !== false && opts.write !== false) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.budget", action: "write", allowed: true });
  if (opts.settings) {
    for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.settings", action, allowed: true });
  }
  for (const infoItem of ["budget.amount", "quote.amount", "project.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return createFixtureUser({ roleId: role.id, teamId });
}

async function makeProject(team: Team, name: string, poKrw: number | null): Promise<string> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E예산거래처-${randomUUID()}`, normalizedName: `e2e예산거래처-${randomUUID()}` });
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.teamId, pmUserId: team.pmId, name });
  if (poKrw !== null) {
    await saveProjectLedger(team.lead, created.id, { seenStatus: "bidding", preEstimate: { currency: "KRW", amount: poKrw, fxRate: 1, fxRateTouched: false } });
  }
  await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, created.id));
  return created.id;
}

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function openAs(browser: Browser, user: { email: string; password: string }, url: string, width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await login(page, user);
  const response = await page.goto(url);
  return { page, context, response };
}

// 사용액 = 현재 차수 견적 줄 실행가 합(D-733) — 줄 하나를 직접 넣는다.
async function addExecution(projectId: string, executionKrw: number): Promise<void> {
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, projectId);
  if (!revision) throw new Error("1차 차수가 없습니다");
  await db.insert(quoteLines).values({
    revisionId: revision.id,
    subcategory: "기타",
    itemName: `E2E실행-${randomUUID()}`,
    unitPriceAmountKrw: executionKrw,
    executionAmountKrw: executionKrw,
    quoteAmountKrw: executionKrw,
    profitKrw: 0,
  });
}

function budgetTable(page: Page) {
  return page.locator("table", { has: page.locator("caption", { hasText: /^예산 현황$/ }) });
}

test.describe("예산 현황 — 트레이서 (07-24 Task 1)", () => {
  test("PO 1,000만 · 원가율 70 → 예산 7,000,000 한 행 · 표 위 합계 줄 · ₩ 없음 · 상태 진행 / 다른 계급 404", async ({ browser }) => {
    await setCostRate(70);
    const team = await makeTeam();
    const name = `E2E예산-${randomUUID().slice(0, 8)}`;
    await makeProject(team, name, 10_000_000);
    const user = await budgetUser(team.teamId);

    const { page, context } = await openAs(browser, user, "/projects/budget");
    const table = budgetTable(page);
    const row = table.locator("tbody tr", { hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("7,000,000");
    await expect(row.getByText("진행", { exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("₩");

    // K8: 합계 줄은 표 위(문서 순서상 표보다 앞).
    const totals = page.getByRole("region", { name: "합계" });
    await expect(totals).toContainText("7,000,000");
    const totalsBeforeTable = await page.evaluate(() => {
      const summary = document.querySelector('section[aria-label="합계"]');
      const table = document.querySelector("table");
      return !!summary && !!table && (summary.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(totalsBeforeTable).toBe(true);
    await context.close();

    const other = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, teamId: team.teamId });
    const denied = await openAs(browser, other, "/projects/budget");
    // loading.tsx가 있어 응답은 스트리밍 200이다 — notFound 화면과 표 없음으로 판정한다.
    await expect(denied.page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
    await expect(budgetTable(denied.page)).toHaveCount(0);
    await denied.context.close();
  });
});

function historyPanel(page: Page) {
  return page.getByRole("dialog", { name: "예산 이력" });
}

async function openHistory(page: Page, name: string) {
  await budgetTable(page).locator("tbody tr", { hasText: name }).getByRole("button", { name: "예산 이력" }).click();
  await expect(historyPanel(page)).toBeVisible();
}

test.describe("예산 현황 — 완성 (07-24 Task 3)", () => {
  test("프로젝트 목록 머리 끝 링크 `예산 현황` — 보기 권한자만", async ({ browser }) => {
    const team = await makeTeam();
    const user = await budgetUser(team.teamId);
    const { page, context } = await openAs(browser, user, "/projects");
    await page.getByRole("link", { name: "예산 현황", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/budget$/);
    await context.close();

    const other = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, teamId: team.teamId });
    const denied = await openAs(browser, other, "/projects");
    await expect(denied.page.getByRole("heading", { name: "프로젝트", exact: true })).toBeVisible();
    await expect(denied.page.getByRole("link", { name: "예산 현황" })).toHaveCount(0);
    await denied.context.close();
  });

  test("초과가 맨 위 · 상태 칸 `초과` · 합계 = 행 합 · `전체`면 완료 포함 · 계산 불가 `—` + 배지", async ({ browser }) => {
    await setCostRate(70);
    const team = await makeTeam();
    const over = `E2E초과-${randomUUID().slice(0, 8)}`;
    const calm = `E2E여유-${randomUUID().slice(0, 8)}`;
    const done = `E2E완료-${randomUUID().slice(0, 8)}`;
    const partial = `E2E불가-${randomUUID().slice(0, 8)}`;
    const overId = await makeProject(team, over, 10_000_000);
    await addExecution(overId, 9_000_000);
    await makeProject(team, calm, 2_000_000);
    const doneId = await makeProject(team, done, 1_000_000);
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, doneId));
    const partialId = await makeProject(team, partial, null);
    await db.update(projects).set({ preEstimateAmountKrw: 5_000_000 }).where(eq(projects.id, partialId));
    const user = await budgetUser(team.teamId);

    const { page, context } = await openAs(browser, user, "/projects/budget");
    const rows = budgetTable(page).locator("tbody tr").filter({ hasText: /E2E/ });
    await expect(rows.first()).toContainText(over);
    const overRow = budgetTable(page).locator("tbody tr", { hasText: over });
    await expect(overRow.getByText("초과", { exact: true })).toBeVisible();
    await expect(overRow).toContainText("-2,000,000");
    await expect(budgetTable(page).locator("tbody tr", { hasText: done })).toHaveCount(0);
    // 합계 = 계산된 두 행(예산 700만 + 140만 · 사용 900만 · 남은 −60만), 계산 불가 행은 `—`와 배지.
    const totals = page.getByRole("region", { name: "합계" });
    await expect(totals).toContainText("8,400,000");
    await expect(totals).toContainText("9,000,000");
    await expect(totals).toContainText("-600,000");
    await expect(totals).toContainText("계산 불가 1건");
    await expect(budgetTable(page).locator("tbody tr", { hasText: partial })).toContainText("—");

    await page.getByLabel("상태").selectOption("all");
    await expect(page).toHaveURL(/status=all/);
    await expect(budgetTable(page).locator("tbody tr", { hasText: done })).toHaveCount(1);
    await context.close();
  });

  test("예산 이력 패널 — 산식 · 현재 값 · 최신 위 · 10줄 + 더 보기 · 프로젝트 열기 · 닫으면 그 행 링크로", async ({ browser }) => {
    await setCostRate(70);
    const team = await makeTeam();
    const name = `E2E이력-${randomUUID().slice(0, 8)}`;
    const id = await makeProject(team, name, 1_000_000);
    for (let step = 2; step <= 11; step += 1) {
      await saveProjectLedger(team.lead, id, { seenStatus: "in_progress", preEstimate: { currency: "KRW", amount: step * 1_000_000, fxRate: 1, fxRateTouched: false } });
    }
    const user = await budgetUser(team.teamId, { write: false });
    const { page, context } = await openAs(browser, user, "/projects/budget");
    await openHistory(page, name);
    const panel = historyPanel(page);
    await expect(panel.getByText("현재 예산", { exact: true })).toBeVisible();
    await expect(panel).toContainText("7,700,000");
    await expect(panel.locator('[data-ui="primary-button"]')).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "예산 바꾸기" })).toHaveCount(0);
    const historyRows = panel.locator("table", { has: page.locator("caption", { hasText: "예산 이력" }) }).locator("tbody tr");
    await expect(historyRows).toHaveCount(10);
    await expect(historyRows.first()).toContainText("PO 금액 변경");
    await expect(historyRows.first()).toContainText("+700,000");
    await expect(panel).not.toContainText("₩");
    await panel.getByRole("button", { name: "더 보기" }).click();
    await expect(historyRows).toHaveCount(11);
    await expect(panel.getByRole("button", { name: "더 보기" })).toHaveCount(0);
    await expect(panel.getByRole("link", { name: "프로젝트 열기" })).toHaveAttribute("href", `/projects/${id}`);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(budgetTable(page).locator("tbody tr", { hasText: name }).getByRole("button", { name: "예산 이력" })).toBeFocused();
    await context.close();
  });

  test("예산 바꾸기 — 1차 등장 · 사유 필수 · 결과는 현재 값과 맨 위 줄 · Esc 두 단계", async ({ browser }) => {
    await setCostRate(70);
    const team = await makeTeam();
    const name = `E2E수정-${randomUUID().slice(0, 8)}`;
    await makeProject(team, name, 10_000_000);
    const user = await budgetUser(team.teamId);
    const { page, context } = await openAs(browser, user, "/projects/budget");
    await openHistory(page, name);
    const panel = historyPanel(page);
    const edit = panel.getByRole("button", { name: "예산 바꾸기" });
    await expect(panel.locator('[data-ui="primary-button"]')).toHaveCount(0);

    await edit.click();
    const budget = panel.getByLabel("예산", { exact: true });
    await expect(budget).toBeFocused();
    await expect(budget).toHaveValue("7,000,000");
    await expect(panel.getByRole("button", { name: "예산 저장" })).toBeVisible();
    await expect(panel.getByRole("button", { name: /취소/ })).toBeVisible();
    // Esc 첫 번 = 편집만 닫힘(패널 남음 · 포커스 예산 바꾸기), 값 그대로.
    await page.keyboard.press("Escape");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "예산 저장" })).toHaveCount(0);
    await expect(edit).toBeFocused();
    await expect(panel).toContainText("7,000,000");

    await edit.click();
    await panel.getByLabel("예산", { exact: true }).fill("5000000");
    await panel.getByRole("button", { name: "예산 저장" }).click();
    await expect(panel.getByText("사유 · 입력")).toBeVisible();
    await panel.getByLabel("사유", { exact: true }).fill("오입력 정정");
    await panel.getByRole("button", { name: "예산 저장" }).click();
    await expect(panel.getByRole("button", { name: "예산 저장" })).toHaveCount(0);
    await expect(edit).toBeFocused();
    await expect(panel.locator("dd").filter({ hasText: "5,000,000" })).toHaveCount(1);
    const top = panel.locator("table", { has: page.locator("caption", { hasText: "예산 이력" }) }).locator("tbody tr").first();
    await expect(top).toContainText("직접 수정");
    // 07-24 감사 #8: 이력 변동분 음수도 표와 같은 하이픈 마이너스(SYSTEM §2-4).
    await expect(top).toContainText("-2,000,000");
    await expect(top).not.toContainText("−");
    await expect(top).toContainText("오입력 정정");
    await expect(page.locator('[data-ui="toast"]')).toHaveCount(0);

    // 다음 Esc = 패널 닫기 · 포커스는 그 행 링크.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(budgetTable(page).locator("tbody tr", { hasText: name }).getByRole("button", { name: "예산 이력" })).toBeFocused();
    await expect(budgetTable(page).locator("tbody tr", { hasText: name })).toContainText("5,000,000");
    await context.close();
  });

  test("원가율 비움 → 잠김 줄 + 설정으로 · 0 → 잠기지 않고 예산 0 행(이력 없음) · 대상 없음 → EMPTY", async ({ browser }) => {
    const team = await makeTeam();
    const name = `E2E영-${randomUUID().slice(0, 8)}`;
    await setCostRate(null);
    await makeProject(team, name, 3_000_000);
    const user = await budgetUser(team.teamId, { settings: true });

    const { page, context } = await openAs(browser, user, "/projects/budget");
    await expect(page.getByText("원가율 미설정", { exact: true })).toBeVisible();
    await expect(budgetTable(page)).toHaveCount(0);
    await page.getByRole("link", { name: "시스템 설정에서 입력" }).click();
    await expect(page).toHaveURL(/\/admin\/settings/);

    await setCostRate(0);
    await page.goto("/projects/budget");
    const row = budgetTable(page).locator("tbody tr", { hasText: name });
    await expect(row).toHaveCount(1);
    await openHistory(page, name);
    await expect(historyPanel(page).getByText("이력 없음", { exact: true })).toBeVisible();
    await context.close();

    const emptyTeam = await makeTeam();
    const emptyUser = await budgetUser(emptyTeam.teamId);
    const empty = await openAs(browser, emptyUser, "/projects/budget");
    await expect(empty.page.getByText("예산이 있는 진행 프로젝트가 없습니다", { exact: true })).toBeVisible();
    await empty.context.close();
  });

  test("원가율 첫 저장 결과 줄(U3) — `예산 N건 생성` + `예산 현황` · 다시 저장하면 없음 · 예산 권한 없으면 링크 없음", async ({ browser }) => {
    const team = await makeTeam();
    await setCostRate(null);
    const ids = [await makeProject(team, `E2E첫저장-${randomUUID().slice(0, 8)}`, null), await makeProject(team, `E2E첫저장-${randomUUID().slice(0, 8)}`, null)];
    for (const id of ids) await db.update(projects).set({ preEstimateAmountKrw: 4_000_000 }).where(eq(projects.id, id));
    const user = await budgetUser(team.teamId, { settings: true });
    const isServerAction = (response: { request: () => { method: () => string; headers: () => Record<string, string> } }) =>
      response.request().method() === "POST" && response.request().headers()["next-action"] !== undefined;

    const { page, context } = await openAs(browser, user, "/admin/settings");
    const projectSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "프로젝트", exact: true }) });
    const field = projectSection.getByLabel(PROJECT_COST_RATE_PCT.label, { exact: true });
    await field.fill("12.5");
    let saved = page.waitForResponse(isServerAction);
    await field.blur();
    await saved;
    const result = projectSection.getByRole("status").filter({ hasText: "원가율 저장" });
    await expect(result).toHaveText(/^원가율 저장 · 예산 \d+건 생성/);
    await expect(result.getByRole("link", { name: "예산 현황" })).toHaveAttribute("href", "/projects/budget");
    await expect(page.getByRole("button", { name: "되돌리기" })).toHaveCount(0);
    for (const id of ids) {
      expect(await db.select().from(projectBudgetEntries).where(eq(projectBudgetEntries.projectId, id))).toHaveLength(1);
    }

    await field.fill("13");
    saved = page.waitForResponse(isServerAction);
    await field.blur();
    await saved;
    await expect(projectSection.getByRole("status").filter({ hasText: "원가율 저장" })).toHaveCount(0);
    await context.close();

    await setCostRate(null);
    const settingsOnly = await budgetUser(team.teamId, { settings: true, budget: false });
    const second = await openAs(browser, settingsOnly, "/admin/settings");
    const secondSection = second.page.locator("section").filter({ has: second.page.getByRole("heading", { name: "프로젝트", exact: true }) });
    const secondField = secondSection.getByLabel(PROJECT_COST_RATE_PCT.label, { exact: true });
    await secondField.fill("12.5");
    saved = second.page.waitForResponse(isServerAction);
    await secondField.blur();
    await saved;
    await expect(secondSection.getByRole("status").filter({ hasText: "원가율 저장" })).toBeVisible();
    await expect(secondSection.getByRole("link", { name: "예산 현황" })).toHaveCount(0);
    await second.context.close();
  });
});

// 07-24 독립 DOM 감사(0724-dom-audit.md) 지적 — 4폭(1280 · 768 · 375 · 320) DOM 단언.
// 서버 액션은 화면 URL로 가는 POST다 — 본문의 인자 이름으로 저장(expectedBudgetKrw)과 이력 다음 쪽(cursor 문자열)을 가른다.
const AUDIT_WIDTHS = [1280, 768, 375, 320] as const;

function isSave(body: string | null): boolean {
  return body?.includes("expectedBudgetKrw") ?? false;
}

function isMore(body: string | null): boolean {
  return /"cursor":"/.test(body ?? "");
}

async function openHistoryAt(page: Page, name: string, width: number) {
  const row = budgetTable(page).locator("tbody tr", { hasText: name });
  // 폰(700 미만)은 행동 열이 숨고 행 탭 칸이 같은 시트를 연다.
  if (width >= 700) await row.getByRole("button", { name: "예산 이력" }).click();
  else await budgetTable(page).getByRole("button", { name: new RegExp(`· ${name} 상세 보기$`) }).click();
  await expect(historyPanel(page)).toBeVisible();
}

test.describe("예산 현황 — 감사 지적 (07-24 DOM 감사)", () => {
  for (const width of AUDIT_WIDTHS) {
    test(`${width} — 더 보기 실패 · 포커스 · 저장 실패 · 저장 중 닫기 무시 · 충돌 새로 불러오기 · 입력 버리기 확인 · PO 없음`, async ({ browser }) => {
      await setCostRate(70);
      const team = await makeTeam();
      const name = `E2E감사-${randomUUID().slice(0, 8)}`;
      const noPo = `E2E감사PO없음-${randomUUID().slice(0, 8)}`;
      const id = await makeProject(team, name, 1_000_000);
      for (let step = 2; step <= 11; step += 1) {
        await saveProjectLedger(team.lead, id, { seenStatus: "in_progress", preEstimate: { currency: "KRW", amount: step * 1_000_000, fxRate: 1, fxRateTouched: false } });
      }
      // PO 0 + 승인 견적 기준 예산 줄(감사 픽스처 「PO 없음」과 같은 상태 — 기준이 없으면 행이 서지 않는다).
      const noPoId = await makeProject(team, noPo, null);
      await db.insert(projectBudgetEntries).values({ projectId: noPoId, reason: "new_approved_revision", baseAmountKrw: 5_000_000, costRatePct: "70", deltaKrw: 3_500_000, createdBy: team.pmId });
      const user = await budgetUser(team.teamId);
      const { page, context } = await openAs(browser, user, "/projects/budget", width);

      // #7: PO 0 행의 PO 금액 칸은 `PO 없음`(PO 열은 700 이상에서만 보인다).
      if (width >= 700) {
        const poCells = budgetTable(page).locator("tbody tr", { hasText: noPo }).locator("td");
        await expect(poCells.filter({ hasText: /^PO 없음$/ })).toHaveCount(1);
      }

      await openHistoryAt(page, name, width);
      const panel = historyPanel(page);
      const rows = panel.locator("table", { has: page.locator("caption", { hasText: "예산 이력" }) }).locator("tbody tr");
      await expect(rows).toHaveCount(10);

      // #1(loadMore) · #11: 다음 쪽 읽기 실패 → 명사형 한 줄(role=alert) · `더 보기`가 다시 눌린다.
      await page.route("**/projects/budget*", (route) => (route.request().method() === "POST" && isMore(route.request().postData()) ? route.abort() : route.fallback()));
      const more = panel.getByRole("button", { name: "더 보기" });
      await more.click();
      await expect(panel.getByRole("alert")).toHaveText("예산 이력 불러오기 실패");
      await expect(more).not.toHaveAttribute("aria-disabled", "true");
      await page.unrouteAll({ behavior: "wait" });

      // #5: 키보드로 `더 보기` → 다 붙으면 버튼이 사라져도 포커스는 패널 안 `프로젝트 열기`.
      await more.focus();
      await page.keyboard.press("Enter");
      await expect(rows).toHaveCount(11);
      await expect(more).toHaveCount(0);
      await expect(panel.getByRole("alert")).toHaveCount(0);
      await expect(panel.getByRole("link", { name: "프로젝트 열기" })).toBeFocused();

      // #1: 저장 중 네트워크 실패 → 처리 중이 풀리고 오류 한 줄(role=alert) · `취소` 다시 켜짐 · 입력 그대로.
      await panel.getByRole("button", { name: "예산 바꾸기" }).click();
      await panel.getByLabel("예산", { exact: true }).fill("8000000");
      await panel.getByLabel("사유", { exact: true }).fill("감사 저장");
      await page.route("**/projects/budget*", (route) => (route.request().method() === "POST" && isSave(route.request().postData()) ? route.abort() : route.fallback()));
      const save = panel.getByRole("button", { name: /예산 저장/ });
      await save.click();
      await expect(panel.getByRole("alert")).toHaveText("저장 실패 · 다시 시도");
      await expect(save).not.toHaveAttribute("aria-disabled", "true");
      await expect(panel.getByRole("button", { name: /취소/ })).toBeEnabled();
      await expect(panel.getByLabel("사유", { exact: true })).toHaveValue("감사 저장");
      await page.unrouteAll({ behavior: "wait" });

      // #2: 저장 중 Esc 두 번 · 닫기(x)는 무시된다 — 편집 · 패널이 남고, 저장이 끝나면 결과가 패널에 선다.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/projects/budget*", async (route) => {
        if (route.request().method() === "POST" && isSave(route.request().postData())) await held;
        await route.fallback();
      });
      await save.click();
      await expect(save).toHaveAttribute("aria-disabled", "true");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await panel.getByRole("button", { name: "닫기" }).click();
      await expect(panel).toBeVisible();
      await expect(save).toBeVisible();
      release();
      await expect(save).toHaveCount(0);
      await expect(panel.locator("dd").filter({ hasText: /^8,000,000$/ })).toHaveCount(1);
      await page.unrouteAll({ behavior: "wait" });

      // #4: 충돌 → 오류 줄의 `새로 불러오기`가 현재 값 · `예산` 칸 · 맨 위 줄을 새 값으로 바꾸고 포커스를 `예산` 칸에 둔다.
      await panel.getByRole("button", { name: "예산 바꾸기" }).click();
      await panel.getByLabel("예산", { exact: true }).fill("9000000");
      await panel.getByLabel("사유", { exact: true }).fill("충돌 확인");
      await saveProjectLedger(team.lead, id, { seenStatus: "in_progress", preEstimate: { currency: "KRW", amount: 12_000_000, fxRate: 1, fxRateTouched: false } });
      await save.click();
      const conflict = panel.getByRole("alert");
      await expect(conflict).toContainText("다른 사람이 먼저 수정");
      await conflict.getByRole("button", { name: "새로 불러오기" }).click();
      await expect(panel.getByRole("alert")).toHaveCount(0);
      await expect(panel.locator("dd").filter({ hasText: /^8,700,000$/ })).toHaveCount(1);
      await expect(rows.first()).toContainText("PO 금액 변경");
      await expect(panel.getByLabel("예산", { exact: true })).toHaveValue("8,700,000");
      await expect(panel.getByLabel("예산", { exact: true })).toBeFocused();
      await expect(panel.getByLabel("사유", { exact: true })).toHaveValue("충돌 확인");

      // #3: 사유를 입력한 채 닫기(x) → `입력 버리기` 확인 창. 확인하면 닫힌다.
      await panel.getByRole("button", { name: "닫기" }).click();
      const discard = page.getByRole("dialog", { name: "입력 버리기" });
      await expect(discard).toBeVisible();
      await discard.getByRole("button", { name: "입력 버리기" }).click();
      await expect(panel).toHaveCount(0);

      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await context.close();
    });
  }
});
