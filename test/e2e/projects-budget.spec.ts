import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, settingsSimple } from "@/db/schema";
import { createFixtureUser } from "./fixtures";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { saveProjectLedger } from "@/domain/projects/ledger";
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
async function budgetUser(teamId: string, opts: { write?: boolean } = {}) {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E경영관리-${randomUUID().slice(0, 8)}`, viewScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.budget", action: "view", allowed: true });
  if (opts.write !== false) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.budget", action: "write", allowed: true });
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
