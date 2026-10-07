import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { db } from "@/db/client";
import { insertIssueRequest } from "@/repositories/revenue-issue-requests";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { addDays, kstToday } from "@/lib/kst-date";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 06-18(S16 · D-610) — 발행 요청: PM이 `발행 요청 추가` → 일괄 저장 → `신청됨`, 매출 기록 권한자가 `발행 줄로` → 일괄 저장 → `발행됨` + 2행.
// 글자 · 색 기대는 리터럴 대신 계산된 역할 토큰 값과 비교한다.

async function grantFinanceRole() {
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects.revenue", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.issued_amount", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.paid_amount", visible: true });
}

async function setupProject() {
  const today = kstToday(new Date());
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E발행요청-${randomUUID()}`, normalizedName: `e2e발행요청-${randomUUID()}` });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const pmEmail = `e2e-req-pm-${randomUUID()}@example.test`;
  const pm = await createAccount(SYSTEM_VIEWER, { email: pmEmail, name: "E2E 요청 PM", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId: pm.userId, teamId: team.id, effectiveFrom: today });
  const project = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: team.id,
    pmUserId: pm.userId,
    name: `E2E발행요청-${randomUUID().slice(0, 8)}`,
    startDate: today,
    endDate: addDays(today, 10),
  });
  await grantFinanceRole();
  const finance = await createFixtureUser({ roleId: "role-ceo" });
  return { projectUrl: `/projects/${project.id}`, projectId: project.id, pm: { email: pmEmail, password: pm.tempPassword, userId: pm.userId }, finance, today };
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function openAs(browser: Browser, user: { email: string; password: string }, url: string, width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await login(page, user.email, user.password);
  await page.goto(url);
  return { page, context };
}

function requestTable(page: Page) {
  return page.locator("table", { has: page.locator("caption", { hasText: /^발행 요청$/ }) });
}

function issuedTable(page: Page) {
  return page.locator("table", { has: page.locator("caption", { hasText: /^발행 줄$/ }) });
}

async function cssColor(page: Page, token: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, `var(${token})`);
}

test.describe("발행 요청 — PM 요청 → 매출 기록 권한자 발행 줄로 → 발행됨 (06-18 Task 1)", () => {
  test("PM이 요청을 일괄 저장해 `신청됨`, 경영관리가 `발행 줄로` 뒤 일괄 저장해 `발행됨` + 2행", async ({ browser }) => {
    const { projectUrl, pm, finance, today } = await setupProject();
    const day = today.slice(5);

    // PM — 빈 표의 첫 행동 버튼 → 금액 · 메모 → 일괄 저장.
    const pmSession = await openAs(browser, pm, projectUrl);
    const pmPage = pmSession.page;
    await expect(requestTable(pmPage).getByText("발행 요청이 없습니다")).toBeVisible();
    await requestTable(pmPage).getByRole("button", { name: "발행 요청 추가" }).click();
    await expect(requestTable(pmPage).getByLabel("희망 발행일")).toHaveValue(today);
    await requestTable(pmPage).getByLabel("금액").fill("22000000");
    await requestTable(pmPage).getByLabel("메모").fill("선금");
    await pmPage.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(pmPage.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();
    await expect(requestTable(pmPage).getByText("신청됨", { exact: true })).toBeVisible();
    // 부가세 · 합계는 서버 값(% 글자 없음).
    await expect(requestTable(pmPage)).toContainText("부가세 2,200,000");
    await expect(requestTable(pmPage)).toContainText("합계 24,200,000");
    await expect(requestTable(pmPage)).not.toContainText("%");
    // PM에게는 `발행 줄로`가 없다(렌더하지 않음).
    await expect(pmPage.getByRole("button", { name: `희망 ${day} 발행 줄로` })).toHaveCount(0);
    await pmSession.context.close();

    // 경영관리 — `발행 줄로` → 새 발행 줄(발행일 = 희망일 · 발행액 = 요청 금액) + 발행일 포커스 + 2행 `발행 줄 입력 중`.
    const financeSession = await openAs(browser, finance, projectUrl);
    const financePage = financeSession.page;
    await financePage.getByRole("button", { name: `희망 ${day} 발행 줄로` }).click();
    await expect(issuedTable(financePage).getByLabel("발행일")).toHaveValue(today);
    await expect(issuedTable(financePage).getByLabel("발행일")).toBeFocused();
    await expect(issuedTable(financePage).getByLabel("발행액")).toHaveValue("22,000,000");
    const inProgress = requestTable(financePage).getByText("발행 줄 입력 중", { exact: true });
    await expect(inProgress).toBeVisible();
    expect(await inProgress.evaluate((node) => getComputedStyle(node).color)).toBe(await cssColor(financePage, "--text-muted"));

    // 일괄 저장 → `발행됨` + `발행 MM-DD · 금액`.
    await financePage.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(financePage.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();
    await expect(requestTable(financePage).getByText("발행됨", { exact: true })).toBeVisible();
    await expect(requestTable(financePage)).toContainText(`발행 ${day} · 22,000,000`);
    await expect(requestTable(financePage).getByText("발행 줄 입력 중")).toHaveCount(0);
    await expect(requestTable(financePage).getByRole("button", { name: /발행 줄로/ })).toHaveCount(0);
    await financeSession.context.close();
  });

  test("미리 만들어 둔 요청 줄은 PM에게 `신청됨`, 경영관리에게 `발행 줄로`로 보인다", async ({ browser }) => {
    const { projectUrl, projectId, pm, finance, today } = await setupProject();
    await insertIssueRequest(
      SYSTEM_VIEWER,
      { id: randomUUID(), projectId, requestedBy: pm.userId, desiredIssueDate: today, amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1.0000", amountAmountKrw: 10_000_000, memo: "읽기" },
      db,
    );

    const pmSession = await openAs(browser, pm, projectUrl);
    await expect(requestTable(pmSession.page).getByText("신청됨", { exact: true })).toBeVisible();
    await pmSession.context.close();

    const financeSession = await openAs(browser, finance, projectUrl);
    await expect(requestTable(financeSession.page).getByRole("button", { name: `희망 ${today.slice(5)} 발행 줄로` })).toBeVisible();
    await financeSession.context.close();
  });
});
