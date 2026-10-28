import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createTeamExpenseDraft, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { approveDocument } from "@/domain/approvals";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertTempRole } from "./temp-roles";
import { upsertPermission } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teams } from "@/db/schema";
import { createTeam } from "@/domain/org";
import { orgUnitIdByName } from "../integration/approvals-fixtures";
import { submitReadyDraft, testVendorAccount } from "../integration/fixtures/expenses";
import { loginPage, makePerson, setupLeaveOrg, waitForHydration } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E } from "./expense-fixture";

// 05-08(EXP-08 · UI-SPEC S8): 지출결의 목록 `/expenses` — 팀장이 팀원의 프로젝트 미연결 팀 비용을 2행 `프로젝트 미연결 · {종류}`로 본다.
// 판정은 DOM 실측(글자 · 링크)이다. 문서는 도메인 함수로 만든다(증빙은 메모리 가짜 저장소 — 제출 게이트 ⑧만 통과시킨다).

async function submittedTeamCost(viewer: Viewer, content: string): Promise<string> {
  return (await submitTeamCost(viewer, content)).expenseId;
}

async function submitTeamCost(viewer: Viewer, content: string) {
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E목록거래처-${randomUUID().slice(0, 6)}`, normalizedName: `e2e목록-${randomUUID()}`, defaultEvidenceType: "tax_invoice", ...testVendorAccount() });
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
    const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `지출 보기만-${randomUUID().slice(0, 6)}`, workScope: "team" });
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
    // 06.5-08(검토 P3-1): 문서가 하나도 없으면 검색어가 붙어도 보통 빈 화면이다 — 검색 0건 문구 · `필터 지우기` 없이 필터 줄도 없다.
    await writerPage.goto("/expenses?q=x");
    await expect(writerEmpty).toContainText("등록된 지출결의가 없습니다");
    await expect(writerEmpty).not.toContainText("조건에 맞는 건이 없습니다");
    await expect(writerEmpty.getByRole("link", { name: "필터 지우기" })).toHaveCount(0);
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
    expect(await visibleHeaders()).toEqual(["번호", "프로젝트 · 항목", "지급처", "금액", "지급 예정", "기안", "상태"]);
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect.poll(visibleHeaders).toEqual(["프로젝트 · 항목", "지급처", "금액", "지급 예정", "상태"]);
    expect(await noOverflow()).toBe(true);
    await page.setViewportSize({ width: 800, height: 900 });
    await expect.poll(visibleHeaders).toEqual(["프로젝트 · 항목", "지급처", "금액", "지급 예정", "상태"]);
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
    await expect(page.getByText(gate, { exact: true })).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`/projects/${fx.projectId}$`));
    await expect(grid.getByText(gate)).toHaveCount(0);
    await page.context().close();
  });
});

// 06.5-08 Task 1(D-6508 · UI-SPEC V1): 목록 검색 칸 — 필터 줄 DOM 첫째, Enter만 제출(DM-1), `q`는 보기 전환에 남고 1쪽부터 다시 그린다, 0건에도 필터 줄이 남는다(EP1-13).
test.describe("목록 검색 (06.5 D-6508)", () => {
  async function twoDocs() {
    const fx = await setupExpenseE2E();
    const a = await submitTeamCost(fx.pm.viewer, `검색대상-${randomUUID().slice(0, 4)}`);
    const b = await submitTeamCost(fx.pm.viewer, `다른문서-${randomUUID().slice(0, 4)}`);
    return { fx, a, b };
  }

  test("번호로 연 주소는 입력 값이 남고 그 문서만 보이며, 상태를 바꿔도 q가 남고 Enter 제출에는 page가 없다", async ({ browser, baseURL }) => {
    const { fx, a, b } = await twoDocs();
    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/expenses?q=${encodeURIComponent(a.number)}`);
    await expect(page.getByRole("textbox", { name: "검색" })).toHaveValue(a.number);
    await expect(rowOf(page, a.expenseId)).toHaveCount(1);
    await expect(rowOf(page, b.expenseId)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "합계" })).toContainText("합계 (진행 중 · 1건)");

    await page.getByRole("combobox", { name: "상태" }).selectOption("전체");
    await expect(page).toHaveURL((url) => url.searchParams.get("status") === "전체" && url.searchParams.get("q") === a.number);
    await expect(rowOf(page, a.expenseId)).toHaveCount(1);

    await page.goto(`/expenses?q=${encodeURIComponent(a.number)}&page=2`);
    await page.getByRole("textbox", { name: "검색" }).press("Enter");
    await expect(page).toHaveURL((url) => url.searchParams.get("q") === a.number && !url.searchParams.has("page"));
    await page.context().close();
  });

  test("검색어를 넣고 Tab으로 상태로 가도 주소가 바뀌지 않고, 검색 칸에서 Enter를 눌러야 q가 주소에 실린다 (DM-1)", async ({ browser, baseURL }) => {
    const { fx, a } = await twoDocs();
    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto("/expenses");
    const search = page.getByRole("textbox", { name: "검색" });
    await waitForHydration(search);
    const before = page.url();
    await search.fill(a.number);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("combobox", { name: "상태" })).toBeFocused();
    await page.waitForTimeout(500);
    expect(page.url()).toBe(before);

    await search.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL((url) => url.searchParams.get("q") === a.number);
    await expect(rowOf(page, a.expenseId)).toHaveCount(1);
    await page.context().close();
  });

  test("문서는 있는데 0건이면 필터 줄 · 검색어가 남고 `조건에 맞는 건이 없습니다` + 2차 `필터 지우기`가 q를 지운다 (EP1-13)", async ({ browser, baseURL }) => {
    const { fx, a } = await twoDocs();
    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/expenses?q=${encodeURIComponent("없는검색어zz")}`);
    await expect(page.getByRole("form", { name: "지출결의 보기" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "검색" })).toHaveValue("없는검색어zz");
    const empty = page.locator('[data-ui="empty-state"]');
    await expect(empty).toContainText("조건에 맞는 건이 없습니다");
    await empty.getByRole("link", { name: "필터 지우기" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("status") === "진행 중" && !url.searchParams.has("q"));
    await expect(rowOf(page, a.expenseId)).toHaveCount(1);
    await page.context().close();
  });

  test("375 · 320에서 검색 칸은 필터 줄 DOM 첫째이고 줄 전폭이며 가로 스크롤이 없다", async ({ browser, baseURL }) => {
    const { fx } = await twoDocs();
    for (const width of [375, 320]) {
      const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
      await page.goto("/expenses");
      const form = page.getByRole("form", { name: "지출결의 보기" });
      const search = form.getByRole("textbox", { name: "검색" });
      await expect(search).toBeVisible();
      const measure = await form.evaluate((element) => {
        const input = element.querySelector<HTMLInputElement>('input[name="q"]');
        const formBox = element.getBoundingClientRect();
        const inputBox = input?.getBoundingClientRect();
        const firstControl = element.querySelector("input, select");
        return {
          first: firstControl?.getAttribute("name"),
          formWidth: formBox.width,
          inputWidth: inputBox?.width ?? 0,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      expect(measure.first).toBe("q");
      expect(Math.abs(measure.formWidth - measure.inputWidth)).toBeLessThanOrEqual(1);
      expect(measure.overflow).toBe(false);
      await page.context().close();
    }
  });
});

// 07.1-09 W11(PF4 · U-7): 메인 목록 필터 줄 — 검색 → 상태 → 팀 → 월 → 내 것만, 바꾸면 URL 반영 · 쪽 1, 팀 select는 범위 안 팀이 둘 이상일 때만, 0건이면 `필터 지우기`가 셋을 모두 지운다.
test.describe("목록 팀 · 월 · 내 것만 (07.1-09 W11)", () => {
  const filterForm = (page: Page) => page.getByRole("form", { name: "지출결의 보기" });
  const thisMonth = () => seoulToday().slice(0, 7);

  // 필터 칸 다섯의 래퍼 아래 변(flex-end 정렬이라 한 줄이면 같다 — 래퍼 높이는 칸 종류마다 달라 위 변은 다르다)과 이름 순서.
  async function filterLine(page: Page) {
    return filterForm(page).evaluate((form) => {
      const controls = Array.from(form.querySelectorAll<HTMLElement>("input[name], select[name]"));
      return controls.map((control) => ({ name: control.getAttribute("name") ?? "", bottom: Math.round((control.closest("div")?.getBoundingClientRect().bottom ?? 0) * 10) / 10 }));
    });
  }

  test("전사 범위(대표) 1280 — 칸 순서 q → status → team → month → mine, 보관 팀은 옵션에 없고, 고르면 URL에 team · month · mine=1이 실리며 page는 없다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const archived = await createTeam(SYSTEM_VIEWER, { orgUnitId: await orgUnitIdByName("기획본부"), name: `보관거름-${randomUUID().slice(0, 6)}` });
    await db.update(teams).set({ archivedAt: new Date() }).where(eq(teams.id, archived.id));
    const doc = await submitTeamCost(fx.pm.viewer, `거름대상-${randomUUID().slice(0, 4)}`);
    const page = await loginPage(browser, baseURL, fx.ceo, DESKTOP);
    await page.goto("/expenses?page=2");
    const form = filterForm(page);
    await waitForHydration(form.getByRole("combobox", { name: "상태" }));
    expect((await filterLine(page)).map((item) => item.name)).toEqual(["q", "status", "team", "month", "mine"]);
    const teamOptions = await form.getByRole("combobox", { name: "팀" }).locator("option").allTextContents();
    expect(teamOptions[0]).toBe("팀 전체");
    expect(teamOptions).toContain(fx.teamName);
    expect(teamOptions).not.toContain(archived.name);
    expect(await form.getByRole("combobox", { name: "월" }).locator("option").first().textContent()).toBe("월 전체");
    expect(await form.getByRole("checkbox", { name: "내 것만" }).isChecked()).toBe(false);

    await form.getByRole("combobox", { name: "팀" }).selectOption({ label: fx.teamName });
    await expect(page).toHaveURL((url) => url.searchParams.get("team") === fx.teamId && !url.searchParams.has("page"));
    await form.getByRole("combobox", { name: "월" }).selectOption(thisMonth());
    await expect(page).toHaveURL((url) => url.searchParams.get("month") === thisMonth());
    // 진행 중(지급일 없는) 문서가 이번 달 거름에 남는다 — 0건이 아니다.
    await expect(rowOf(page, doc.expenseId)).toHaveCount(1);
    await form.getByRole("checkbox", { name: "내 것만" }).check();
    await expect(page).toHaveURL((url) => url.searchParams.get("mine") === "1" && url.searchParams.get("team") === fx.teamId && url.searchParams.get("month") === thisMonth());
    // 대표는 기안자가 아니라 내 것만이면 0건 — 필터 줄이 남고 빈 결과 문구가 선다.
    await expect(page.locator('[data-ui="empty-state"]')).toContainText("조건에 맞는 건이 없습니다");
    await expect(form.getByRole("checkbox", { name: "내 것만" })).toBeChecked();
    await page.locator('[data-ui="empty-state"]').getByRole("link", { name: "필터 지우기" }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has("team") && !url.searchParams.has("month") && !url.searchParams.has("mine"));
    await expect(rowOf(page, doc.expenseId)).toHaveCount(1);
    await page.context().close();
  });

  test("옵션에 없는 ?month= — 월 select는 월 전체로 보이고 결과도 거르지 않는다(#320 P2)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const doc = await submitTeamCost(fx.pm.viewer, `옵션밖월-${randomUUID().slice(0, 4)}`);
    const page = await loginPage(browser, baseURL, fx.ceo, DESKTOP);
    await page.goto("/expenses?status=전체&month=2020-01");
    const monthSelect = filterForm(page).getByRole("combobox", { name: "월" });
    await waitForHydration(filterForm(page).getByRole("combobox", { name: "상태" }));
    await expect(monthSelect).toHaveValue("");
    await expect(rowOf(page, doc.expenseId)).toHaveCount(1);
    await page.context().close();
  });

  test("내 것만 — 기안자가 나인 행만 남는다(팀장은 자기 문서만, 팀원 문서는 빠진다)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const pmDoc = await submitTeamCost(fx.pm.viewer, `팀원문서-${randomUUID().slice(0, 4)}`);
    const leadDoc = await submitTeamCost(fx.lead.viewer, `팀장문서-${randomUUID().slice(0, 4)}`);
    const page = await loginPage(browser, baseURL, fx.lead, DESKTOP);
    await page.goto("/expenses?status=전체");
    await expect(rowOf(page, pmDoc.expenseId)).toHaveCount(1);
    await expect(rowOf(page, leadDoc.expenseId)).toHaveCount(1);
    await filterForm(page).getByRole("checkbox", { name: "내 것만" }).check();
    await expect(page).toHaveURL((url) => url.searchParams.get("mine") === "1");
    await expect(rowOf(page, leadDoc.expenseId)).toHaveCount(1);
    await expect(rowOf(page, pmDoc.expenseId)).toHaveCount(0);
    await page.context().close();
  });

  test("팀장(범위가 팀 하나) — 팀 select는 DOM 0, 월 · 내 것만은 있다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await submitTeamCost(fx.pm.viewer, `팀장범위-${randomUUID().slice(0, 4)}`);
    const page = await loginPage(browser, baseURL, fx.lead, DESKTOP);
    await page.goto("/expenses");
    const form = filterForm(page);
    await expect(form.getByRole("combobox", { name: "월" })).toBeVisible();
    await expect(form.getByRole("checkbox", { name: "내 것만" })).toBeVisible();
    await expect(form.locator('select[name="team"]')).toHaveCount(0);
    await page.context().close();
  });

  for (const width of [1280, 1024]) {
    test(`${width} — 필터 칸 다섯(검색 · 상태 · 팀 · 월 · 내 것만)이 한 줄이다`, async ({ browser, baseURL }) => {
      const fx = await setupExpenseE2E();
      await submitTeamCost(fx.pm.viewer, `한줄-${randomUUID().slice(0, 4)}`);
      const page = await loginPage(browser, baseURL, fx.ceo, { width, height: 800 });
      await page.goto("/expenses");
      await waitForHydration(filterForm(page).getByRole("combobox", { name: "상태" }));
      const line = await filterLine(page);
      expect(line.map((item) => item.name)).toEqual(["q", "status", "team", "month", "mine"]);
      expect(new Set(line.map((item) => item.bottom)).size, JSON.stringify(line)).toBe(1);
      await page.context().close();
    });
  }
});
