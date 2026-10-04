import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createTeamExpenseDraft, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { approveDocument } from "@/domain/approvals";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertRole } from "@/repositories/roles";
import { upsertPermission } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { loginPage, makePerson, setupLeaveOrg, waitForHydration } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E } from "./expense-fixture";

// 05-08(EXP-08 · UI-SPEC S8): 지출결의 목록 `/expenses` — 팀장이 팀원의 프로젝트 미연결 팀 비용을 2행 `프로젝트 미연결 · {종류}`로 본다.
// 판정은 DOM 실측(글자 · 링크)이다. 문서는 도메인 함수로 만든다(증빙은 메모리 가짜 저장소 — 제출 게이트 ⑧만 통과시킨다).

async function submittedTeamCost(viewer: Viewer, content: string): Promise<string> {
  return (await submitTeamCost(viewer, content)).expenseId;
}

async function submitTeamCost(viewer: Viewer, content: string) {
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E목록거래처-${randomUUID().slice(0, 6)}`, normalizedName: `e2e목록-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  const { expenseId } = await createTeamExpenseDraft(viewer, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", usageDate: seoulToday(), content } });
  const payment = (await listExpenseFormOptions(viewer)).payment[0]?.value ?? null;
  await saveExpenseDraft(viewer, {
    expenseId,
    expectedVersion: 1,
    fields: { vendorId: vendor.id, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
  });
  const submitted = await submitReadyDraft(viewer, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  return submitted;
}

function rowOf(page: Page, expenseId: string) {
  return page.locator("tr").filter({ has: page.locator(`a[href="/expenses/${expenseId}"]`) });
}

test.describe("팀장 목록 · 프로젝트 미연결 (EXP-08)", () => {
  test("팀장이 /expenses를 열면 팀원의 팀 관리비 문서가 2행 `프로젝트 미연결 · 팀 관리비` · 기안 열 이름 · `… 결재 중` 상태로 보인다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const content = `팀 회식-${randomUUID().slice(0, 4)}`;
    const expenseId = await submittedTeamCost(fx.pm.viewer, content);

    const page = await loginPage(browser, baseURL, fx.lead);
    await page.goto("/expenses");
    await expect(page.locator('[data-ui="screen-title"]:visible')).toHaveText("지출결의");
    const row = rowOf(page, expenseId);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("link")).toContainText(content);
    await expect(row.getByText("프로젝트 미연결 · 팀 관리비", { exact: true })).toBeVisible();
    await expect(row.getByText(fx.pm.name, { exact: true })).toBeVisible();
    await expect(row.getByText(/결재 중$/)).toBeVisible();
    await page.context().close();
  });
});

test.describe("결재 당사자가 아닌 보는 사람의 문서 화면 (05-08 검토 #1)", () => {
  test("대표(전사 범위 · 지금 단계 아님)가 목록 행을 열면 문서 화면에 상태 배지 `결재 중`과 결재선이 보이고 행동 버튼이 없다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submittedTeamCost(fx.pm.viewer, `읽기 전용-${randomUUID().slice(0, 4)}`);

    const page = await loginPage(browser, baseURL, fx.ceo);
    await page.goto(`/expenses/${expenseId}`);
    const head = page.locator('[data-ui="screen-title"]:visible').locator("..");
    await expect(head.getByText("결재 중", { exact: true })).toBeVisible();
    const route = page.locator("dt", { hasText: "결재선" }).locator("xpath=following-sibling::dd[1]");
    await expect(route.getByRole("listitem").first()).toContainText(fx.lead.name);
    await expect(page.getByRole("button", { name: /^(승인|반려|회수)/ })).toHaveCount(0);
    await page.context().close();
  });
});

test.describe("보기 · 빈 상태 · 폭", () => {
  test("보기 0건은 표 자리에서 보기를 넓히고 머리 1차가 남는다 — 승인 0건 · 진행 중 0건 · 합계 줄", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const content = `해외 렌탈-${randomUUID().slice(0, 4)}`;
    const doc = await submitTeamCost(fx.pm.viewer, content);

    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto("/expenses");
    await expect(page.getByRole("region", { name: "합계" })).toContainText("합계 (진행 중 · 1건)");
    await page.goto(`/expenses?status=${encodeURIComponent("승인")}`);
    const empty = page.locator('[data-ui="empty-state"]');
    await expect(empty).toContainText("승인된 지출결의가 없습니다");
    await expect(page.locator('[data-ui="primary-button"]')).toHaveText("새 지출결의");
    // 보기 때문에 0건이면 상태 select는 남는다(문서는 있다).
    await expect(page.getByRole("combobox", { name: "상태" })).toBeVisible();
    await empty.getByRole("link", { name: "진행 중 보기" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("status") === "진행 중");
    await expect(rowOf(page, doc.expenseId)).toHaveCount(1);

    // 결재선 넷이 모두 승인하면 진행 중 보기는 0건 — 다음 한 수는 `전체 보기`.
    let version = doc.version;
    for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
      version = (await approveDocument(approver.viewer, { instanceId: doc.instanceId, expectedVersion: version })).version;
    }
    await page.goto("/expenses");
    await expect(empty).toContainText("진행 중인 지출결의가 없습니다");
    await expect(page.locator('[data-ui="primary-button"]')).toHaveText("새 지출결의");
    await empty.getByRole("link", { name: "전체 보기" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("status") === "전체");
    await expect(rowOf(page, doc.expenseId)).toHaveCount(1);
    await expect(rowOf(page, doc.expenseId).getByText("승인", { exact: true })).toBeVisible();
    await page.context().close();
  });

  test("보임 범위 안 문서가 0건이면 빈 화면 하나 — 쓰기 권한자는 `새 지출결의` 하나(머리 1차 없음), 쓰기 권한이 없으면 문장만", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const org = await setupLeaveOrg(today);
    const writer = await makePerson("빈목록", DEFAULT_ROLE_ID, org.teamId, `${today.slice(0, 4)}-01-01`);
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `지출 보기만-${randomUUID().slice(0, 6)}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
    const reader = await makePerson("보기만", role.id, org.teamId, `${today.slice(0, 4)}-01-01`);

    const writerPage = await loginPage(browser, baseURL, writer);
    await writerPage.goto("/expenses");
    const writerEmpty = writerPage.locator('[data-ui="empty-state"]');
    await expect(writerEmpty).toContainText("등록된 지출결의가 없습니다");
    await expect(writerEmpty.getByRole("link")).toHaveCount(1);
    await expect(writerEmpty.getByRole("link", { name: "새 지출결의" })).toHaveAttribute("href", "/expenses/new");
    await expect(writerPage.locator('[data-ui="primary-button"]')).toHaveCount(0);
    await expect(writerPage.getByRole("region", { name: "합계" })).toHaveCount(0);
    // 걸러 낼 문서가 없으면 상태 select도 없다(wave10 N2 — 쓸 수 없는 선택지는 숨김).
    await expect(writerPage.getByRole("form", { name: "지출결의 보기" })).toHaveCount(0);
    await writerPage.context().close();

    const readerPage = await loginPage(browser, baseURL, reader);
    await readerPage.goto("/expenses");
    const readerEmpty = readerPage.locator('[data-ui="empty-state"]');
    await expect(readerEmpty).toContainText("등록된 지출결의가 없습니다");
    await expect(readerEmpty.getByRole("link")).toHaveCount(0);
    await expect(readerPage.locator('[data-ui="primary-button"]')).toHaveCount(0);
    await expect(readerPage.getByRole("form", { name: "지출결의 보기" })).toHaveCount(0);
    await readerPage.context().close();
  });

  test("느리게 불러오면 진짜 열 이름의 뼈대만 보이고 합계 줄 · 필터 · 1차가 없다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await submittedTeamCost(fx.pm.viewer, `뼈대-${randomUUID().slice(0, 4)}`);
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto("/expenses");
    // 스트리밍이 끝나 진짜 표(행 링크)가 보인 뒤에 머리글을 읽는다 — 그 전에는 뼈대 표가 같은 자리에 있다.
    await expect(page.locator("main table a[data-row-link]").first()).toBeVisible();
    const headers = await page.locator("main table thead th").allInnerTexts();
    await page.goto("/account");
    // 뼈대(loading 틀)는 라우터가 미리 가져온 경우에만 응답이 늦는 동안 보인다 — 먼저 미리 가져오고, 그다음에 응답을 늦춘다.
    const prefetched = page.waitForResponse((response) => response.url().includes("/expenses") && response.request().headers()["next-router-prefetch"] === "1");
    await page.evaluate(() => (window as unknown as { next: { router: { prefetch(url: string): void } } }).next.router.prefetch("/expenses"));
    await prefetched;
    await page.waitForLoadState("networkidle");
    await page.route(
      (url) => url.pathname === "/expenses",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await route.continue();
      },
    );
    await page.evaluate(() => (window as unknown as { next: { router: { push(url: string): void } } }).next.router.push("/expenses"));
    const skeleton = page.locator('[data-ui="table-skeleton"]');
    await expect.poll(async () => (await skeleton.count()) > 0 && parseFloat(await skeleton.first().evaluate((element) => getComputedStyle(element).opacity)) > 0).toBe(true);
    const skeletonHeaders = await skeleton.locator("th").allInnerTexts();
    expect(skeletonHeaders.length).toBeGreaterThan(0);
    expect(skeletonHeaders).toEqual(headers.slice(0, skeletonHeaders.length));
    await expect(page.locator('[data-ui="screen-title"]:visible')).toHaveText("지출결의");
    await expect(page.locator('[data-ui="primary-button"]')).toHaveCount(0);
    await expect(page.locator("#expense-status")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "합계" })).toHaveCount(0);
    await page.context().close();
  });

  test("폭 1100에서 번호 · 기안 열이 없고, 폭 800에서 P1 + P2만 — 가로 스크롤 0", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await submittedTeamCost(fx.pm.viewer, `폭-${randomUUID().slice(0, 4)}`);
    const page = await loginPage(browser, baseURL, fx.lead);
    const visibleHeaders = () => page.locator("main table thead th:visible").allInnerTexts();
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/expenses");
    await expect(page.locator("main table a[data-row-link]").first()).toBeVisible();
    expect(await visibleHeaders()).toEqual(["번호", "프로젝트 · 항목", "거래처", "금액", "지급 예정", "기안", "상태"]);
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect.poll(visibleHeaders).toEqual(["프로젝트 · 항목", "거래처", "금액", "지급 예정", "상태"]);
    expect(await noOverflow()).toBe(true);
    await page.setViewportSize({ width: 800, height: 900 });
    await expect.poll(visibleHeaders).toEqual(["프로젝트 · 항목", "거래처", "금액", "지급 예정", "상태"]);
    expect(await noOverflow()).toBe(true);
    await page.context().close();
  });
});

// 05-08 Task 3(UI-SPEC 확정 #5 · S1): 견적 줄 표 범위 선택 + Ctrl+E — 열린 줄마다 작성 중 문서(이미 있으면 그 문서) → 목록 `진행 중` 보기 + 토스트.
// 전부 막힘이면 이동 없이 합계 행 오른쪽에 첫 막힌 줄 이유, 표 전체 게이트면 표 위 한 줄만. 열 순서는 Phase 4 표 그대로(항목 2).
const ITEM_COLUMN = 2;
const DESKTOP = { width: 1280, height: 800 };

function quoteRowOf(page: Page, itemName: string) {
  return page.getByRole("row").filter({ hasText: itemName });
}

// 첫 줄 항목 칸에 격자 초점을 두고 Shift+↓로 범위를 넓힌 뒤 Ctrl+E(수화 전 초점은 좌표에 남지 않아 toPass로 다시 잡는다).
async function rangeCtrlE(page: Page, fx: ExpenseE2E, first: keyof ExpenseE2E["lines"], extraRows: number, done: () => Promise<void>) {
  await page.goto(`/projects/${fx.projectId}`);
  const item = quoteRowOf(page, fx.lines[first].itemName).getByRole("gridcell").nth(ITEM_COLUMN);
  await waitForHydration(item);
  await expect(async () => {
    await item.focus();
    for (let i = 0; i < extraRows; i += 1) await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Control+e");
    await done();
  }).toPass({ timeout: 20_000 });
}

const draftLinks = (page: Page) => page.locator('main table a[data-row-link]');

test.describe("여러 줄 Ctrl+E · 두 번 눌러도 하나", () => {
  test("열림 · 열림 · 거래처 없음을 골라 Ctrl+E → 진행 중 보기 · 토스트 `작성 중 2건 · 막힘 1줄` · 작성 중 2행, 다시 눌러도 2행", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    const toast = "지출결의 올리기 · 작성 중 2건 · 막힘 1줄";
    const landed = async () => {
      await expect(page).toHaveURL((url) => url.pathname === "/expenses" && url.searchParams.get("status") === "진행 중", { timeout: 3000 });
    };

    await rangeCtrlE(page, fx, "retry", 2, landed);
    await expect(page.getByRole("status").filter({ hasText: toast })).toBeVisible();
    await expect(draftLinks(page)).toHaveCount(2);
    for (const key of ["retry", "phone"] as const) {
      const row = page.locator("main table tr").filter({ hasText: fx.lines[key].itemName });
      await expect(row).toHaveCount(1);
      await expect(row.getByText("작성 중", { exact: true })).toBeVisible();
    }

    // 같은 범위를 다시 — 이미 있는 작성 중 문서가 created에 들어 토스트는 같고 행은 늘지 않는다.
    await rangeCtrlE(page, fx, "retry", 2, landed);
    await expect(page.getByRole("status").filter({ hasText: toast })).toBeVisible();
    await expect(draftLinks(page)).toHaveCount(2);

    // 줄 1 셀 `지출결의 올리기`를 두 번 눌러도(두 번째는 있던 문서로) 작성 중 줄 1 행은 하나.
    for (let i = 0; i < 2; i += 1) {
      await page.goto(`/projects/${fx.projectId}`);
      const door = quoteRowOf(page, fx.lines.tracer.itemName).getByRole("gridcell").last().getByRole("button", { name: "지출결의 올리기" });
      await waitForHydration(door);
      await door.click();
      await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    }
    await page.goto(`/expenses?status=${encodeURIComponent("진행 중")}`);
    await expect(draftLinks(page)).toHaveCount(3);
    await expect(page.locator("main table tr").filter({ hasText: fx.lines.tracer.itemName })).toHaveCount(1);
    await page.context().close();
  });

  test("고른 줄이 전부 막히면 이동하지 않고 합계 행 오른쪽에 첫 막힌 줄 이유, 표 전체 게이트면 합계 행에 아무것도 더 쓰지 않는다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    const grid = page.getByRole("grid", { name: "견적 줄" });
    const reason = "거래처 없음 · 거래처 고르기";
    await rangeCtrlE(page, fx, "noVendor", 1, async () => {
      await expect(grid.getByText(reason, { exact: true })).toBeVisible({ timeout: 3000 });
    });
    await expect(page).toHaveURL(new RegExp(`/projects/${fx.projectId}$`));

    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, fx.projectId);
    if (!revision) throw new Error("현재 차수가 없다");
    await createRevisionFromCurrent(fx.pm.viewer, { projectId: fx.projectId, fromRevisionId: revision.id });
    const gate = "2차 고객 승인 전 · 고객 승인 표시";
    await page.goto(`/projects/${fx.projectId}`);
    const item = quoteRowOf(page, fx.lines.tracer.itemName).getByRole("gridcell").nth(ITEM_COLUMN);
    await waitForHydration(item);
    await item.focus();
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Control+e");
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(new RegExp(`/projects/${fx.projectId}$`));
    await expect(page.getByText(gate, { exact: true })).toHaveCount(1);
    await expect(grid.getByText(gate)).toHaveCount(0);
    await page.context().close();
  });
});
