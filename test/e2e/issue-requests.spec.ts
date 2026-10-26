import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { db } from "@/db/client";
import { eq, sql } from "drizzle-orm";
import { projects, revenueIssueRequests } from "@/db/schema";
import { insertIssueRequest } from "@/repositories/revenue-issue-requests";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { insertTempRole } from "./temp-roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { addDays, kstToday } from "@/lib/kst-date";
import { saveProjectLedger } from "@/domain/projects/ledger";
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
    await expect(pmPage.getByRole("button", { name: /발행 줄로$/ })).toHaveCount(0);
    await pmSession.context.close();

    // 경영관리 — `발행 줄로` → 새 발행 줄(발행일 = 희망일 · 발행액 = 요청 금액) + 발행일 포커스 + 2행 `발행 줄 입력 중`.
    const financeSession = await openAs(browser, finance, projectUrl);
    const financePage = financeSession.page;
    await financePage.getByRole("button", { name: `희망 ${day} · 1번째 발행 줄로` }).click();
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
    await expect(requestTable(financeSession.page).getByRole("button", { name: `희망 ${today.slice(5)} · 1번째 발행 줄로` })).toBeVisible();
    await financeSession.context.close();
  });

  // 06.5-08(D-6512 L-2 · UI-SPEC V9): 같은 희망일 요청이 둘이어도 버튼 접근 이름이 행마다 유일하다 — 순번만(금액은 숨김 계급에 샌다), 보이는 글자 `발행 줄로`가 이름 끝.
  test("같은 희망일 요청 둘 — `발행 줄로` 접근 이름이 `희망 MM-DD · N번째 발행 줄로`로 행마다 다르고 금액을 담지 않는다", async ({ browser }) => {
    const { projectUrl, projectId, pm, finance, today } = await setupProject();
    await seedRequest(projectId, pm.userId, { desiredIssueDate: today, amount: 12_345_000, memo: "하나" });
    await seedRequest(projectId, pm.userId, { desiredIssueDate: today, amount: 67_890_000, memo: "둘" });

    const financeSession = await openAs(browser, finance, projectUrl);
    const buttons = requestTable(financeSession.page).getByRole("button", { name: /발행 줄로$/ });
    await expect(buttons).toHaveCount(2);
    const names = await buttons.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));
    const day = today.slice(5);
    expect(names).toEqual([`희망 ${day} · 1번째 발행 줄로`, `희망 ${day} · 2번째 발행 줄로`]);
    for (const name of names) expect(name).not.toMatch(/\d{1,3}(,\d{3})+|\d{5,}/);
    await buttons.first().click();
    await expect(requestTable(financeSession.page).getByRole("button", { name: `희망 ${day} · 1번째 발행 줄 빼기` })).toBeVisible();
    await financeSession.context.close();
  });
});

async function seedRequest(projectId: string, requestedBy: string, over: { desiredIssueDate: string; amount?: number; memo?: string | null }): Promise<string> {
  const id = randomUUID();
  await insertIssueRequest(
    SYSTEM_VIEWER,
    {
      id,
      projectId,
      requestedBy,
      desiredIssueDate: over.desiredIssueDate,
      amountCurrency: "KRW",
      amountForeignAmount: null,
      amountFxRate: "1.0000",
      amountAmountKrw: over.amount ?? 10_000_000,
      memo: over.memo ?? null,
    },
    db,
  );
  return id;
}

test.describe("발행 요청 — S16 상태 마감 (06-18 Task 3)", () => {
  test("빈 화면 세 갈래 — 쓰기 PM 1280은 첫 행동 버튼, 그 밖의 사람은 담당 PM 이름, 375는 사실만", async ({ browser }) => {
    const { projectUrl, pm, finance } = await setupProject();

    const pmWide = await openAs(browser, pm, projectUrl, 1280);
    await expect(requestTable(pmWide.page).getByText("발행 요청이 없습니다", { exact: true })).toBeVisible();
    await expect(requestTable(pmWide.page).getByRole("button", { name: "발행 요청 추가" })).toBeVisible();
    await pmWide.context.close();

    const financeWide = await openAs(browser, finance, projectUrl, 1280);
    await expect(requestTable(financeWide.page)).toContainText("발행 요청이 없습니다 · 요청은 담당 PM E2E 요청 PM");
    await expect(requestTable(financeWide.page).getByRole("button")).toHaveCount(0);
    await financeWide.context.close();

    const pmPhone = await openAs(browser, pm, projectUrl, 375);
    await expect(requestTable(pmPhone.page).getByText("발행 요청이 없습니다", { exact: true })).toBeVisible();
    await expect(requestTable(pmPhone.page).getByRole("button")).toHaveCount(0);
    await pmPhone.context.close();

    const financePhone = await openAs(browser, finance, projectUrl, 375);
    await expect(requestTable(financePhone.page).getByText("발행 요청이 없습니다", { exact: true })).toBeVisible();
    await financePhone.context.close();
  });

  test("`발행 줄로` 뒤 저장 전 = 2행 `발행 줄 입력 중`, 그 새 발행 줄을 빼면 연결이 풀리고 2행이 사라진다", async ({ browser }) => {
    const { projectUrl, projectId, pm, finance, today } = await setupProject();
    await seedRequest(projectId, pm.userId, { desiredIssueDate: today, amount: 5_000_000, memo: "빼기" });
    const day = today.slice(5);

    const { page, context } = await openAs(browser, finance, projectUrl);
    await page.getByRole("button", { name: `희망 ${day} · 1번째 발행 줄로` }).click();
    await expect(requestTable(page).getByText("발행 줄 입력 중", { exact: true })).toBeVisible();
    await expect(issuedTable(page).getByLabel("발행일")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    await page.getByRole("button", { name: `희망 ${day} · 1번째 발행 줄 빼기` }).click();
    await expect(requestTable(page).getByText("발행 줄 입력 중")).toHaveCount(0);
    await expect(issuedTable(page).getByLabel("발행일")).toHaveCount(0);
    await expect(requestTable(page).getByRole("button", { name: `희망 ${day} · 1번째 발행 줄로` })).toBeVisible();
    await expect(page.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();
    await context.close();
  });

  test("다른 사람이 그사이 같은 요청을 이으면 저장이 전부 거부되고 오류가 발행 줄 칸에 선다", async ({ browser }) => {
    const { projectUrl, projectId, pm, finance, today } = await setupProject();
    const requestId = await seedRequest(projectId, pm.userId, { desiredIssueDate: today, amount: 7_000_000 });

    const { page, context } = await openAs(browser, finance, projectUrl);
    await page.getByRole("button", { name: `희망 ${today.slice(5)} · 1번째 발행 줄로` }).click();
    await saveProjectLedger(SYSTEM_VIEWER, projectId, {
      seenStatus: "bidding",
      revenue: { issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: today, amount: { currency: "KRW", amount: 7_000_000, fxRate: 1 }, fromIssueRequestId: requestId }] },
    });

    await page.getByRole("button", { name: /일괄 저장/ }).click();

    await expect(issuedTable(page)).toContainText("다른 사람이 먼저 이 요청을 이음 · 새로 고침");
    await expect(issuedTable(page)).toContainText("오류 1칸 · 전부 거부");
    await expect(requestTable(page).getByText("신청됨", { exact: true })).toBeVisible();
    await context.close();
  });

  test("줄 순서는 희망 발행일 오름차순(같은 날은 만든 순), 200자 메모는 두 줄 뒤 말줄임 + title", async ({ browser }) => {
    const { projectUrl, projectId, pm, finance, today } = await setupProject();
    const long = "긴메모".repeat(67).slice(0, 200);
    await seedRequest(projectId, pm.userId, { desiredIssueDate: addDays(today, 5), amount: 3_000_000, memo: "셋째" });
    await seedRequest(projectId, pm.userId, { desiredIssueDate: today, amount: 1_000_000, memo: long });
    await seedRequest(projectId, pm.userId, { desiredIssueDate: today, amount: 2_000_000, memo: "같은날-둘째" });

    const { page, context } = await openAs(browser, finance, projectUrl);
    // 행마다 폰 접힌 줄이 함께 있어 행 수가 아니라 금액이 읽히는 순서로 센다.
    const text = await requestTable(page).innerText();
    const order = ["1,000,000", "2,000,000", "3,000,000"].map((amount) => text.indexOf(amount));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    const memo = requestTable(page).locator("span[title]", { hasText: "긴메모" }).locator("visible=true");
    await expect(memo).toHaveAttribute("title", long);
    const metrics = await memo.evaluate((node) => {
      const style = getComputedStyle(node);
      return { clamp: style.getPropertyValue("-webkit-line-clamp"), clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, lineHeight: parseFloat(style.lineHeight) };
    });
    expect(metrics.clamp).toBe("2");
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.clientHeight).toBeLessThanOrEqual(metrics.lineHeight * 2 + 1);
    await context.close();
  });
  test("폰 375 · 320에서도 200자 메모는 접힌 줄에서 두 줄 뒤 말줄임 + title이고 가로로 넘치지 않는다 (DOM 감사 D-1)", async ({ browser }) => {
    const { projectUrl, projectId, pm, finance, today } = await setupProject();
    const long = "긴메모".repeat(67).slice(0, 200);
    await seedRequest(projectId, pm.userId, { desiredIssueDate: today, amount: 1_000_000, memo: long });

    for (const width of [375, 320]) {
      const { page, context } = await openAs(browser, finance, projectUrl, width);
      const memo = requestTable(page).locator("span[title]", { hasText: "긴메모" }).locator("visible=true");
      await expect(memo).toHaveCount(1);
      await expect(memo).toHaveAttribute("title", long);
      const metrics = await memo.evaluate((node) => {
        const style = getComputedStyle(node);
        return { clamp: style.getPropertyValue("-webkit-line-clamp"), clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, lineHeight: parseFloat(style.lineHeight) };
      });
      expect(metrics.clamp, `${width}px`).toBe("2");
      expect(metrics.scrollHeight, `${width}px`).toBeGreaterThan(metrics.clientHeight);
      expect(metrics.clientHeight, `${width}px`).toBeLessThanOrEqual(metrics.lineHeight * 2 + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBe(width);
      await context.close();
    }
  });

  test("요청 줄 저장이 version 충돌로 거부되면 포커스가 오류가 선 상태 칸으로 간다 (DOM 감사 D-2)", async ({ browser }) => {
    const { projectUrl, projectId, pm, today } = await setupProject();
    const requestId = await seedRequest(projectId, pm.userId, { desiredIssueDate: today, amount: 4_000_000, memo: "처음" });

    const { page, context } = await openAs(browser, pm, projectUrl);
    await requestTable(page).getByLabel("메모").fill("내가 고침");
    await db.update(revenueIssueRequests).set({ version: sql`${revenueIssueRequests.version} + 1`, memo: "다른 사람이 고침" }).where(eq(revenueIssueRequests.id, requestId));

    await page.getByRole("button", { name: /일괄 저장/ }).click();

    await expect(requestTable(page)).toContainText("다른 사람이 먼저 이 요청을 바꿈 · 새로 고침");
    const focused = await page.evaluate(() => {
      const cell = document.activeElement?.closest("td");
      const reasonId = cell?.getAttribute("aria-describedby");
      return { inCell: cell !== null && cell !== undefined, reason: reasonId ? (document.getElementById(reasonId)?.textContent ?? null) : null };
    });
    expect(focused).toEqual({ inCell: true, reason: "다른 사람이 먼저 이 요청을 바꿈 · 새로 고침" });
    await context.close();
  });

  test("금액을 비운(0원) 새 요청 줄은 저장이 거부되고 금액 칸에 한 줄 이유가 선다 (검토 I-2)", async ({ browser }) => {
    const { projectUrl, pm } = await setupProject();

    const { page, context } = await openAs(browser, pm, projectUrl);
    await requestTable(page).getByRole("button", { name: "발행 요청 추가" }).click();
    await requestTable(page).getByLabel("메모").fill("금액 없음");
    await page.getByRole("button", { name: /일괄 저장/ }).click();

    await expect(requestTable(page)).toContainText("0원 초과 · 금액 입력");
    await context.close();
  });
});

async function storedStatus(requestId: string): Promise<string | undefined> {
  const [row] = await db.select({ status: revenueIssueRequests.status }).from(revenueIssueRequests).where(eq(revenueIssueRequests.id, requestId));
  return row?.status;
}

test.describe("발행 요청 취소 (06-21 Task 1 — O-12 · r4 F-F3)", () => {
  test("발행 요청 취소 — 일괄 저장 때 반영", async ({ browser }) => {
    const { projectUrl, projectId, pm, today } = await setupProject();
    const requestId = await seedRequest(projectId, pm.userId, { desiredIssueDate: today, amount: 4_000_000, memo: "취소할 요청" });

    const { page, context } = await openAs(browser, pm, projectUrl);
    const memoCell = requestTable(page).locator("td", { has: page.getByLabel("메모") });
    const dialog = page.getByRole("dialog", { name: "발행 요청 취소" });

    // 2차 `닫기 Esc` — 아무것도 바뀌지 않는다. 스트리밍된 본문은 잠깐 숨은 자리(`<div hidden>`)에 있다가 옮겨진다(실측 ~230ms) —
    // 숨은 칸에는 포커스가 가지 않으므로 칸이 보일 때까지 기다린 뒤 포커스한다.
    await expect(memoCell).toBeVisible();
    await memoCell.focus();
    await page.keyboard.press("Delete");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`희망 ${today} · 4,000,000`);
    await expect(dialog).toContainText("경영관리 목록에서 빠짐");
    await expect(dialog.getByRole("button", { name: /닫기/ })).toContainText("Esc");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(requestTable(page).getByText("신청됨", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toHaveCount(0);

    // 1차 `발행 요청 취소` — 그 줄이 dirty 한 칸(`취소`)이 되고 `일괄 저장 1`, DB는 아직 그대로.
    await memoCell.focus();
    await page.keyboard.press("Delete");
    await dialog.getByRole("button", { name: /^발행 요청 취소/ }).click();
    await expect(dialog).toBeHidden();
    await expect(requestTable(page).getByText("취소", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    expect(await storedStatus(requestId)).toBe("requested");

    // 일괄 저장 — 그때 반영되고 줄은 `취소`로 남는다.
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(page.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();
    await expect.poll(() => storedStatus(requestId)).toBe("cancelled");
    await expect(requestTable(page).getByText("취소", { exact: true })).toBeVisible();
    await expect(requestTable(page)).toContainText("취소할 요청");
    await context.close();
  });
});

// 06-21 S17 — 목록 보는 사람: 제 프로젝트만 보는 계급(viewScope own)이라 다른 스펙 · 테스트가 만든 요청이 목록에 끼지 않는다.
// 06.5 카드 ③: 발행 처리 권한(projects.revenue write)을 켜면 범위와 무관하게 전부를 본다 — 건수 · 빈 화면 단언은 쓰기 없이,
// 쓰기에만 서는 3차 · 도착 포커스는 grantWrite 뒤 제 프로젝트 번호가 든 접근 이름 · 고유 값으로 겨눈다.
async function setupBoard(opts: { write: boolean }) {
  const today = kstToday(new Date());
  const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E발행요청목록-${randomUUID()}`, viewScope: "own" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.revenue", action: "view", allowed: true });
  if (opts.write) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.revenue", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "revenue.issued_amount", visible: true });
  const email = `e2e-board-${randomUUID()}@example.test`;
  const account = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 목록 보는 사람", roleId: role.id });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E발행목록-${randomUUID()}`, normalizedName: `e2e발행목록-${randomUUID()}` });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: account.userId, name: `E2E발행목록-${randomUUID().slice(0, 8)}`, startDate: today, endDate: addDays(today, 10) });
  const [stored] = await db.select({ number: projects.number }).from(projects).where(eq(projects.id, project.id));
  if (!stored) throw new Error("프로젝트가 없습니다");
  return { user: { email, password: account.tempPassword, userId: account.userId }, roleId: role.id, projectId: project.id, projectNumber: stored.number, today };
}

async function grantWrite(roleId: string): Promise<void> {
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects.revenue", action: "write", allowed: true });
}

// 오늘(서울)이 속한 주의 일요일 — 주는 월~일(IR-1).
function sundayOf(today: string): string {
  return addDays(today, (7 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7);
}

test.describe("발행 요청 목록 S17 (06-21 Task 2)", () => {
  test("[Empty] 기본 보기(신청됨) 0건 → `처리할 발행 요청이 없습니다 · 전체 보기`", async ({ browser }) => {
    const { user } = await setupBoard({ write: false });
    const { page, context } = await openAs(browser, user, "/projects/issue-requests");
    await expect(page.getByRole("heading", { level: 1, name: "발행 요청" })).toBeVisible();
    await expect(page.getByText("처리할 발행 요청이 없습니다", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "전체 보기", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/issue-requests\?status=all$/);
    await expect(page.locator("#issue-request-filter-status")).toHaveValue("all");
    await context.close();
  });

  test("그룹은 희망일 지남(경고 색) → 이번 주 → 다음 주 → 그 뒤, 합계 줄 · 행 3차 `발행 줄 입력` / `요청 보기`", async ({ browser }) => {
    const { user, roleId, projectId, projectNumber, today } = await setupBoard({ write: false });
    const sunday = sundayOf(today);
    const later = await seedRequest(projectId, user.userId, { desiredIssueDate: addDays(sunday, 8), amount: 1_000_000 });
    const nextWeek = await seedRequest(projectId, user.userId, { desiredIssueDate: addDays(sunday, 1), amount: 2_000_000 });
    const overdue = await seedRequest(projectId, user.userId, { desiredIssueDate: addDays(today, -1), amount: 3_000_000 });
    await seedRequest(projectId, user.userId, { desiredIssueDate: today, amount: 4_000_000 });
    const cancelledDate = addDays(today, 2);
    const cancelled = await seedRequest(projectId, user.userId, { desiredIssueDate: cancelledDate, amount: 5_000_000 });
    await db.update(revenueIssueRequests).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: user.userId }).where(eq(revenueIssueRequests.id, cancelled));

    const { page, context } = await openAs(browser, user, "/projects/issue-requests");
    const list = page.locator("table", { has: page.locator("caption", { hasText: /^발행 요청$/ }) });
    const groups = list.locator("[class*='groupRow']");
    await expect(groups).toHaveText(["희망일 지남", "이번 주", "다음 주", "그 뒤"]);
    const overdueHeader = groups.first().getByText("희망일 지남", { exact: true });
    expect(await overdueHeader.evaluate((node) => getComputedStyle(node).color)).toBe(await cssColor(page, "--status-warning"));
    // 합계 줄 — 기본 보기(신청됨) 4건 · 공급가 합(취소 건 제외).
    await expect(page.getByText("합계 (신청됨 · 4건)", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "합계" })).toContainText("10,000,000");
    // 금액 2행 합계(서버 부가세).
    await expect(list).toContainText("합계 3,300,000");

    // `취소` 보기 합계.
    await page.locator("#issue-request-filter-status").selectOption("cancelled");
    await expect(page).toHaveURL(/status=cancelled/);
    await expect(page.getByText("합계 (취소 · 1건)", { exact: true })).toBeVisible();

    // 발행 처리 권한 — 행 3차 접근 이름 `{번호} 희망 {MM-DD} 발행 줄 입력` → `?issueRequest={id}`, 취소 행은 `요청 보기`.
    await grantWrite(roleId);
    await page.goto("/projects/issue-requests");
    const overdueAction = page.getByRole("link", { name: `${projectNumber} 희망 ${addDays(today, -1).slice(5)} 발행 줄 입력`, exact: true });
    await expect(overdueAction).toHaveAttribute("href", `/projects/${projectId}?issueRequest=${overdue}`);
    await expect(page.getByRole("link", { name: `${projectNumber} 희망 ${addDays(sunday, 1).slice(5)} 발행 줄 입력`, exact: true })).toHaveAttribute("href", `/projects/${projectId}?issueRequest=${nextWeek}`);
    await expect(page.getByRole("link", { name: `${projectNumber} 희망 ${addDays(sunday, 8).slice(5)} 발행 줄 입력`, exact: true })).toHaveAttribute("href", `/projects/${projectId}?issueRequest=${later}`);
    await page.goto("/projects/issue-requests?status=cancelled");
    await expect(page.getByRole("link", { name: `${projectNumber} 희망 ${cancelledDate.slice(5)} 요청 보기`, exact: true })).toHaveAttribute("href", `/projects/${projectId}?issueRequest=${cancelled}`);
    await context.close();
  });

  test("1024 미만에는 행동 칸이 없고 행을 누르면 같은 주소의 상세로 간다", async ({ browser }) => {
    const { user, projectId, today } = await setupBoard({ write: true });
    const requestId = await seedRequest(projectId, user.userId, { desiredIssueDate: today, amount: 6_000_000, memo: "좁은 폭" });

    const { page, context } = await openAs(browser, user, "/projects/issue-requests", 900);
    const list = page.locator("table", { has: page.locator("caption", { hasText: /^발행 요청$/ }) });
    await expect(list.getByText("좁은 폭", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /발행 줄 입력$/ })).toHaveCount(0);
    await expect(list.getByRole("columnheader", { name: "행동" })).toBeHidden();
    // 메모 칸(링크 밖)을 눌러도 행 링크가 받는다.
    await list.getByText("좁은 폭", { exact: true }).filter({ visible: true }).click({ force: true });
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?issueRequest=${requestId}$`));
    await context.close();
  });
});

test.describe("프로젝트 목록 하위 링크 `발행 요청 {N}` · `?issueRequest` 포커스 (06-21 Task 3 — SP-4)", () => {
  test("프로젝트 목록 링크 `발행 요청 1` → 목록 → `발행 줄 입력` → 상세의 `발행 줄로`에 포커스", async ({ browser }) => {
    const { user, roleId, projectId, projectNumber, today } = await setupBoard({ write: false });
    const requestId = await seedRequest(projectId, user.userId, { desiredIssueDate: today, amount: 8_000_000 });
    const day = today.slice(5);

    const { page, context } = await openAs(browser, user, "/projects");
    await page.getByRole("link", { name: "발행 요청 1", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/issue-requests$/);
    await grantWrite(roleId);
    await page.reload();
    await page.getByRole("link", { name: `${projectNumber} 희망 ${day} 발행 줄 입력`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?issueRequest=${requestId}$`));
    await expect(page.getByRole("button", { name: `희망 ${day} · 1번째 발행 줄로` })).toBeFocused();
    await context.close();
  });

  test("발행됨 · 취소 요청으로 들어오면 그 요청 줄 자체에 포커스한다", async ({ browser }) => {
    const { user, projectId, today } = await setupBoard({ write: true });
    const requestId = await seedRequest(projectId, user.userId, { desiredIssueDate: today, amount: 9_000_000, memo: "취소된 요청 줄" });
    await db.update(revenueIssueRequests).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: user.userId }).where(eq(revenueIssueRequests.id, requestId));

    const { page, context } = await openAs(browser, user, `/projects/${projectId}?issueRequest=${requestId}`);
    // 폰 접힌 줄(aria-hidden)에도 같은 메모가 있다 — 주 행은 첫째다.
    const row = requestTable(page).locator("tr", { hasText: "취소된 요청 줄" }).first();
    await expect(row).toBeFocused();
    await expect(row).toHaveAttribute("tabindex", "-1");
    await context.close();
  });

  test("열린 요청 0건이면 링크 글자는 `발행 요청`이고 링크는 남는다", async ({ browser }) => {
    const { user } = await setupBoard({ write: false });
    const { page, context } = await openAs(browser, user, "/projects");
    const link = page.getByRole("link", { name: "발행 요청", exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/projects/issue-requests");
    await context.close();
  });
});

// 06-21 독립 DOM 감사(D-1 ~ D-6) 반영 — 넘침 · 도착 포커스 · 확인 뒤 포커스 · 링크 색 · dirty 표시.
test.describe("발행 요청 — 06-21 DOM 감사 반영", () => {
  test("S17 — 200자 메모 · 9억 금액 · 긴 프로젝트 이름이 있어도 1280 · 768 · 375 · 320 가로 넘침 0, 메모는 말줄임 + title (D-1 · D-2)", async ({ browser }) => {
    const { user, projectId, today } = await setupBoard({ write: true });
    const longName = "2026 하반기 전국 순회 브랜드 체험 팝업스토어 운영 및 현장 프로모션 대행 (서울·부산·대구·광주·대전 5개 도시)";
    await db.update(projects).set({ name: longName }).where(eq(projects.id, projectId));
    // 발행 처리 권한자는 전부를 보므로(06.5 카드 ③) 다른 테스트 · 프로젝트의 같은 메모와 겹치지 않게 앞 8자를 고유 값으로.
    const long = `${randomUUID().slice(0, 8)}${"긴메모".repeat(67)}`.slice(0, 200);
    // 금액은 9억(10자리 미만 — 320의 P1 세 열 예산 안). 13자리는 375까지만 들어간다(SUMMARY 후속 기록).
    await seedRequest(projectId, user.userId, { desiredIssueDate: addDays(today, 20), amount: 900_000_000, memo: long });
    await seedRequest(projectId, user.userId, { desiredIssueDate: today, amount: 8_000_000, memo: "짧은 메모" });

    for (const width of [1280, 768, 375, 320]) {
      const { page, context } = await openAs(browser, user, "/projects/issue-requests", width);
      const list = page.locator("table", { has: page.locator("caption", { hasText: /^발행 요청$/ }) });
      const memo = list.locator(`[title="${long}"]`).locator("visible=true");
      await expect(memo, `${width}px`).toHaveCount(1);
      const clipped = await memo.evaluate((node) => {
        const clip = [node, ...Array.from(node.querySelectorAll<HTMLElement>("*"))].find((element) => getComputedStyle(element).textOverflow === "ellipsis");
        return clip ? clip.scrollWidth > clip.clientWidth : false;
      });
      expect(clipped, `${width}px 메모 말줄임`).toBe(true);
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        table: Math.max(...Array.from(document.querySelectorAll("main table")).map((table) => table.scrollWidth - (table.parentElement?.clientWidth ?? 0))),
      }));
      expect(overflow.doc, `${width}px 문서 넘침`).toBe(0);
      expect(overflow.table, `${width}px 표 넘침`).toBeLessThanOrEqual(0);
      await context.close();
    }
  });

  test("S17 — 프로젝트 링크 색은 식별자형 링크 토큰(--accent)이다 (D-5)", async ({ browser }) => {
    const { user, projectId, today } = await setupBoard({ write: true });
    await seedRequest(projectId, user.userId, { desiredIssueDate: today, amount: 1_000_000 });

    const { page, context } = await openAs(browser, user, "/projects/issue-requests");
    const link = page.locator("main table a[data-row-link]").first();
    await expect(link).toBeVisible();
    expect(await link.evaluate((node) => getComputedStyle(node).color)).toBe(await cssColor(page, "--accent"));
    await context.close();
  });

  test("1024 미만(900 · 375)에서 `신청됨` 요청으로 들어오면 그 줄 자체에 포커스하고 화면 안으로 스크롤한다 (D-3)", async ({ browser }) => {
    const { user, projectId, today } = await setupBoard({ write: true });
    const requestId = await seedRequest(projectId, user.userId, { desiredIssueDate: today, amount: 2_000_000, memo: "좁은 폭 도착" });

    for (const width of [900, 375]) {
      const { page, context } = await openAs(browser, user, `/projects/${projectId}?issueRequest=${requestId}`, width);
      const row = requestTable(page).locator("tr", { hasText: "좁은 폭 도착" }).first();
      await expect(row, `${width}px`).toBeFocused();
      await expect(row, `${width}px`).toHaveAttribute("tabindex", "-1");
      await expect(row, `${width}px`).toBeInViewport();
      await context.close();
    }
  });

  test("확인 모달 1차 뒤 포커스는 취소한 줄로 가고, 상태 칸 `취소`는 저장 대기(dirty) 표시다 (D-4 · D-6)", async ({ browser }) => {
    const { projectUrl, projectId, pm, today } = await setupProject();
    await seedRequest(projectId, pm.userId, { desiredIssueDate: today, amount: 4_000_000, memo: "포커스 볼 요청" });

    const { page, context } = await openAs(browser, pm, projectUrl);
    const memoCell = requestTable(page).locator("td", { has: page.getByLabel("메모") });
    const dialog = page.getByRole("dialog", { name: "발행 요청 취소" });
    await expect(memoCell).toBeVisible();
    await memoCell.focus();
    await page.keyboard.press("Delete");
    await dialog.getByRole("button", { name: /^발행 요청 취소/ }).click();
    await expect(dialog).toBeHidden();

    const row = requestTable(page).locator("tr", { hasText: "포커스 볼 요청" }).first();
    await expect(row).toBeFocused();
    const dirty = requestTable(page).locator("td[class*='dirtyCell']");
    await expect(dirty).toHaveCount(1);
    await expect(dirty).toContainText("취소");
    // 저장 대기 표시는 면이 아니라 모서리 삼각형(--mark-dirty)이다(2026-10-26).
    await expect(dirty).toHaveCSS("background-image", /linear-gradient/);
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(page.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();
    await expect(dirty).toHaveCount(0);
    await context.close();
  });
});
