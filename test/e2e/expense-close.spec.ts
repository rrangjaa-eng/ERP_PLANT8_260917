import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { closeExpense, createTeamExpenseDraft, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06-28(UI-SPEC S23 · Copywriting 「Destructive — 지출결의 종결」): 반려 · 회수 지출결의를 기안자 · 지급 권한자가 사유와 함께 끝낸다.
// 2차 `종결` → 05 ConfirmDialog(부제 · 결과 줄은 서버) → 같은 화면이 제자리에서 다시 선다(상태 `종결` · 메타 · 행동 없음 · 포커스 제목).

// 줄 하나의 문서를 화면에서 제출하고 팀장이 반려한다(05 E2E 도우미 · 도메인 반려).
async function rejectedExpense(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const expenseId = await submitLineExpense(browser, baseURL, fx, key);
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  return expenseId;
}

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

// 테스트 계급 「경영관리」 — 전사 업무 범위 · 지출결의 보기 + 지급 처리 쓰기(06-27 「C9-종결키」 — 종결 권한). 결재선 밖 전용 본부 · 팀.
async function makePayerE2E(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E종결-${suffix}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E종결본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E종결팀-${suffix}` });
  return makePerson("경영관리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

async function instanceOf(fx: ExpenseE2E, expenseId: string): Promise<{ instanceId: string; version: number }> {
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  return { instanceId: view.instanceId, version: view.version };
}

// 결재선 넷(팀장 → 본부장 → 경영 → 대표) 중 앞 count 단계를 승인한다.
async function approveSteps(fx: ExpenseE2E, expenseId: string, count: number): Promise<void> {
  const { instanceId, version: start } = await instanceOf(fx, expenseId);
  let version = start;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo].slice(0, count)) {
    version = (await approveDocument(approver.viewer, { instanceId, expectedVersion: version })).version;
  }
}

// 기안자가 서버에서 종결한다(다른 컨텍스트 · 준비용).
async function closeOnServer(viewer: Person["viewer"], expenseId: string, reason = "업체 취소"): Promise<void> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  await closeExpense(viewer, { expenseId, expectedVersion: row.version, reason });
}

// 문서 화면에서 2차 `종결`을 눌러 모달을 연다.
async function openCloseDialog(page: Page, expenseId: string) {
  await page.goto(`/expenses/${expenseId}`);
  const trigger = page.getByRole("button", { name: "종결", exact: true });
  await waitForHydration(trigger);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "지출결의 종결" });
  await expect(dialog).toBeVisible();
  return dialog;
}

// 1차 비활성 이유 — 버튼의 aria-describedby가 가리키는 글자(ConfirmDialog 막힘 줄과 같은 글자가 둘 선다 — 연결된 쪽으로 단언).
async function expectPrimaryReason(primary: Locator, text: string): Promise<void> {
  await expect(primary).toHaveAttribute("aria-disabled", "true");
  const describedBy = await primary.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(primary.page().locator(`[id="${describedBy}"]`)).toHaveText(text);
}

function isServerAction(method: string, headers: Record<string, string>): boolean {
  return method === "POST" && headers["next-action"] !== undefined;
}

async function expectNoOverflow(page: Page, label: string): Promise<void> {
  const measured = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(measured.scrollWidth, `${label} 가로 넘침`).toBeLessThanOrEqual(measured.clientWidth);
}

function tokenAsColor(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
}

test.describe("반려 · 회수 지출결의 종결 (S23)", () => {
  test("populated — 기안자가 반려된 자기 문서(다시 제출 폼)에서 2차 종결 → 사유 · Ctrl+Enter → 제자리 종결 · 메타 · 행동 없음 · 포커스 제목", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await rejectedExpense(browser, baseURL, fx, "tracer");
    const number = `${fx.projectNumber}-0001`;

    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto(`/expenses/${expenseId}`);
    // 05 다시 제출 폼 — 1차는 그대로, 2차 `종결`.
    await expect(page.getByRole("button", { name: /^지출결의 다시 제출/ })).toBeVisible();
    const trigger = page.getByRole("button", { name: "종결", exact: true });
    await waitForHydration(trigger);
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "지출결의 종결" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("견적 줄 1 문 열림 · 되돌림 없음", { exact: true })).toBeVisible();
    await expect(dialog.getByText(new RegExp(`^${number} · ${fx.lines.tracer.itemName} · `))).toBeVisible();
    const reason = dialog.getByLabel("사유");
    await expect(reason).toBeFocused();
    await reason.fill("업체 취소");
    await reason.press("Control+Enter");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}$`));
    const title = page.locator('[data-ui="screen-title"]');
    await expect(title.locator("..").getByText("종결", { exact: true })).toBeVisible();
    await expect(page.locator('[data-ui="screen-meta"]')).toHaveText(`${number} · 종결 · ${fx.pm.name} ${seoulToday().slice(5)} · 업체 취소`);
    // 행동 자리 빔 — 다시 제출 · 종결 없음.
    await expect(page.getByRole("button", { name: /^지출결의 다시 제출/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "종결", exact: true })).toHaveCount(0);
    await expect(title).toBeFocused();
    await page.context().close();
  });

  test("populated — 지급 권한자(기안자 아님)가 남의 반려 문서에서 2차 종결 → 제자리 종결 · 메타 · 행동 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await rejectedExpense(browser, baseURL, fx, "tracer");
    const number = `${fx.projectNumber}-0001`;
    const payer = await makePayerE2E();

    const page = await loginPage(browser, baseURL, payer);
    const dialog = await openCloseDialog(page, expenseId);
    await expect(dialog.getByText("견적 줄 1 문 열림 · 되돌림 없음", { exact: true })).toBeVisible();
    await dialog.getByLabel("사유").fill("업체 취소");
    await dialog.getByLabel("사유").press("Control+Enter");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    const title = page.locator('[data-ui="screen-title"]');
    await expect(title.locator("..").getByText("종결", { exact: true })).toBeVisible();
    await expect(page.locator('[data-ui="screen-meta"]')).toHaveText(`${number} · 종결 · ${payer.name} ${seoulToday().slice(5)} · 업체 취소`);
    await expect(page.getByRole("button", { name: "종결", exact: true })).toHaveCount(0);
    await expect(title).toBeFocused();
    await page.context().close();
  });

  test("partial — 결재 중 · 결재 통과 · 종결 문서와 결재자에게는 종결 버튼이 없고, 종결 문서 첨부는 읽기만, 쓰기 권한 없는 기안자의 작성 중 문서는 그대로 선다", async ({ browser, baseURL }) => {
    test.setTimeout(150_000);
    const fx = await setupExpenseE2E();
    const inReview = await submitLineExpense(browser, baseURL, fx, "tracer");
    await approveSteps(fx, inReview, 1);
    const approved = await submitLineExpense(browser, baseURL, fx, "hold");
    await approveSteps(fx, approved, 4);
    const closed = await rejectedExpense(browser, baseURL, fx, "retry");
    await closeOnServer(fx.pm.viewer, closed);
    const rejected = await rejectedExpense(browser, baseURL, fx, "phone");

    const page = await loginPage(browser, baseURL, fx.pm);
    for (const expenseId of [inReview, approved, closed]) {
      await page.goto(`/expenses/${expenseId}`);
      await expect(page.getByRole("heading", { level: 1, name: /^지출결의 — / })).toBeVisible();
      await expect(page.getByRole("button", { name: "종결", exact: true })).toHaveCount(0);
    }
    // 종결 문서(마지막으로 연 화면) — 붙이기 · 떼기 컨트롤 없음.
    const attachments = page.locator('[data-ui="attachments"]');
    await expect(attachments.getByTestId("attachments-input")).toHaveCount(0);
    await expect(attachments.getByRole("button", { name: /지우기/ })).toHaveCount(0);
    await page.context().close();

    // 반려 문서를 보는 결재자(반려한 팀장).
    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto(`/expenses/${rejected}`);
    await expect(lead.getByRole("heading", { level: 1, name: /^지출결의 — / })).toBeVisible();
    await expect(lead.getByRole("button", { name: "종결", exact: true })).toHaveCount(0);
    await lead.context().close();

    // (05 C1 — drift (4)) 쓰기 권한이 빠진 기안자의 자기 작성 중 문서 — 문서 화면이 서고 종결 버튼 · 종결 메타 없음.
    const suffix = randomUUID().slice(0, 8);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E종결권한본부-${suffix}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E종결권한팀-${suffix}` });
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E종결쓰기회수-${suffix}`, workScope: "company" });
    for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action, allowed: true });
    for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    const email = `e2e-close-nowrite-${randomUUID()}@example.test`;
    const name = `종결${suffix.slice(0, 4)}`;
    const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId: role.id });
    const today = seoulToday();
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: `${today.slice(0, 4)}-01-01` });
    const drafter: Person = { name, email, password: tempPassword, viewer: { id: userId, roleId: role.id } };
    const content = `종결권한 회식-${suffix}`;
    const { expenseId: draft } = await createTeamExpenseDraft(drafter.viewer, {
      idempotencyKey: randomUUID(),
      fields: { teamExpenseKind: "team_overhead", usageDate: today, content },
    });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: false });
    const own = await loginPage(browser, baseURL, drafter);
    await own.goto(`/expenses/${draft}`);
    await expect(own.getByRole("heading", { level: 1, name: new RegExp(content) })).toBeVisible();
    await expect(own.getByText("지출결의 불러오기 실패")).toHaveCount(0);
    await expect(own.getByRole("button", { name: "종결", exact: true })).toHaveCount(0);
    await expect(own.locator('[data-ui="screen-meta"]').getByText(/종결/)).toHaveCount(0);
    await own.context().close();
  });

  test("empty — 사유가 비거나 공백뿐이면 1차 aria-disabled + `사유 없음 · 사유 적기`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await rejectedExpense(browser, baseURL, fx, "tracer");
    const page = await loginPage(browser, baseURL, fx.pm);
    const dialog = await openCloseDialog(page, expenseId);
    const primary = dialog.getByRole("button", { name: /^종결/ });
    await expectPrimaryReason(primary, "사유 없음 · 사유 적기");
    await dialog.getByLabel("사유").fill("   ");
    await dialog.getByLabel("사유").press("Control+Enter");
    await expectPrimaryReason(primary, "사유 없음 · 사유 적기");
    await expect(dialog).toBeVisible();
    await page.context().close();
  });

  test("loading — 응답을 늦춘 동안 1차 `종결…` · aria-disabled, Ctrl+Enter 두 번 · Esc는 아무 일도 없고 요청은 한 번, 뒤에 토스트 없이 포커스 제목", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await rejectedExpense(browser, baseURL, fx, "tracer");
    const page = await loginPage(browser, baseURL, fx.pm);
    const dialog = await openCloseDialog(page, expenseId);
    let requests = 0;
    await page.route("**/expenses/**", async (route) => {
      const request = route.request();
      if (isServerAction(request.method(), request.headers())) {
        requests += 1;
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      await route.continue();
    });

    const reason = dialog.getByLabel("사유");
    await reason.fill("업체 취소");
    await reason.press("Control+Enter");
    const primary = dialog.getByRole("button", { name: /^종결/ });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(primary).toContainText("종결…");
    await page.keyboard.press("Control+Enter");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
    expect(requests).toBe(1);
    await expect(page.getByRole("status").filter({ hasText: "종결" })).toHaveCount(0);
    await expect(page.locator('[data-ui="screen-title"]')).toBeFocused();
    await page.context().close();
  });

  test("error — 다른 곳에서 먼저 종결하면 1차 왼쪽 `이미 종결` + `새로 고침`, 요청이 끊기면 `결과를 받지 못함` + `새로 고침` — 모달 · 사유 그대로", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const first = await rejectedExpense(browser, baseURL, fx, "tracer");
    const second = await rejectedExpense(browser, baseURL, fx, "hold");
    const page = await loginPage(browser, baseURL, fx.pm);

    const dialog = await openCloseDialog(page, first);
    await dialog.getByLabel("사유").fill("업체 취소");
    await closeOnServer(fx.pm.viewer, first, "다른 곳");
    await dialog.getByLabel("사유").press("Control+Enter");
    await expectPrimaryReason(dialog.getByRole("button", { name: /^종결/ }), "이미 종결");
    await expect(dialog.getByRole("button", { name: "새로 고침" })).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("사유")).toHaveValue("업체 취소");

    await page.route("**/expenses/**", async (route) => {
      const request = route.request();
      if (isServerAction(request.method(), request.headers())) return route.abort();
      return route.continue();
    });
    const again = await openCloseDialog(page, second);
    await again.getByLabel("사유").fill("업체 취소");
    await again.getByLabel("사유").press("Control+Enter");
    await expect(again.getByText("결과를 받지 못함", { exact: true })).toBeVisible();
    await expect(again.getByRole("button", { name: "새로 고침" })).toBeVisible();
    await expect(again).toBeVisible();
    await expect(again.getByLabel("사유")).toHaveValue("업체 취소");
    await page.context().close();
  });

  for (const width of [375, 320]) {
    test(`폰 ${width} — 같은 2차 종결 → 아래 시트 · 행동 줄 화면 안 · 가로 넘침 0`, async ({ browser, baseURL }) => {
      const fx = await setupExpenseE2E();
      const expenseId = await rejectedExpense(browser, baseURL, fx, "phone");
      const page = await loginPage(browser, baseURL, fx.pm, { width, height: 740 });
      const dialog = await openCloseDialog(page, expenseId);
      const rect = await dialog.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { left: box.left, right: box.right, bottom: box.bottom, vw: innerWidth, vh: innerHeight };
      });
      expect(rect.left).toBeLessThanOrEqual(1);
      expect(rect.right).toBeGreaterThanOrEqual(rect.vw - 1);
      expect(Math.abs(rect.bottom - rect.vh)).toBeLessThanOrEqual(1);
      const primary = dialog.getByRole("button", { name: /^종결/ });
      await expect(primary).toBeInViewport();
      const height = await primary.evaluate((el) => el.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(44);
      await expectNoOverflow(page, `종결 시트 ${width}`);
      await page.context().close();
    });
  }

  test("long-text — 210자 사유로 종결한 문서의 메타 사유 조각 title = 원문 · 320 가로 넘침 0", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await rejectedExpense(browser, baseURL, fx, "worst");
    const reason = `업체 사정으로 행사 취소${"가나다라마바사아자차카타파하".repeat(15)}`.slice(0, 210);
    expect(reason).toHaveLength(210);
    await closeOnServer(fx.pm.viewer, expenseId, reason);
    const page = await loginPage(browser, baseURL, fx.pm, { width: 320, height: 740 });
    await page.goto(`/expenses/${expenseId}`);
    const piece = page.locator('[data-ui="screen-meta"] span[title]');
    await expect(piece).toHaveAttribute("title", reason);
    await expectNoOverflow(page, "종결 메타 320");
    await page.context().close();
  });

  test("목록 — `/expenses` 상태 열에 `종결` 낱말(muted 배지)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await rejectedExpense(browser, baseURL, fx, "tracer");
    await closeOnServer(fx.pm.viewer, expenseId);
    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 800 });
    await page.goto("/expenses");
    const row = page.locator("main table tr").filter({ hasText: fx.lines.tracer.itemName });
    await expect(row).toHaveCount(1);
    const word = row.getByText("종결", { exact: true });
    await expect(word).toBeVisible();
    expect(await word.evaluate((el) => getComputedStyle(el).color)).toBe(await tokenAsColor(page, "--status-muted"));
    await page.context().close();
  });
});
