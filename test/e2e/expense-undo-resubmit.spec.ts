import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, createTeamExpenseDraft, EXPENSE_DOCUMENT_KIND, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, waitForHydration } from "./leave-org";
import { makeEvidenceManagerE2E, setupExpenseE2E, submitLineExpense, uniqueReceipt, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 05-09(UI-SPEC 확정 #2 · S3 「반려 · 회수 뒤」 · Copywriting 「SUCCESS — 토스트」): 제출 토스트 `되돌리기` = 확인 없는 즉시 회수 → 같은 주소가
// 고칠 수 있는 폼 → 같은 번호로 다시 제출. 토스트 4초 자동 소멸에 기대지 않는다 — `page.clock.install()`을 `goto` 전에 두고 토스트가 보이면
// 곧바로 `pauseAt`으로 멈춘 뒤 누르고 결과를 단언한 다음 `resume`(P3-12).

const UPLOAD_WAIT = 20_000;
const META = /^\d+KB · \d{2}-\d{2}$/;

async function submitFromForm(page: Page, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
  await expect(page.locator('[data-ui="attachments"] li').getByText(META)).toBeVisible({ timeout: UPLOAD_WAIT });
  await page.getByRole("button", { name: /^지출결의 제출/ }).click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1`));
  return expenseId;
}

// 토스트가 보인 바로 그때 페이지 시계를 멈춘다(자동 소멸 타이머가 돌지 않게).
async function pauseClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 200);
}

test.describe("되돌리기 → 같은 번호 다시 제출 (확정 #2)", () => {
  test("제출 토스트 되돌리기 → 확인 없이 회수 · 폼(회수 읽기 행) → 공급가액 고침 · Ctrl+Enter → 같은 번호 · 다시 제출 토스트 → 팀장 승인", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.clock.install();
    const expenseId = await submitFromForm(page, fx, "tracer");
    const number = `${fx.projectNumber}-0001`;

    const toast = page.getByRole("status").filter({ hasText: `지출결의 제출 · 결재 요청됨 → ${fx.lead.name}` });
    await expect(toast).toBeVisible();
    await pauseClock(page);
    await toast.getByRole("button", { name: "되돌리기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "되돌리기 · 결재 멈춤" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}`));

    // 같은 주소가 폼 — 머리 줄 상태 `회수` · 메타 번호 · 맨 위 읽기 행 `회수 MM-DD HH:mm` · 1차 `지출결의 다시 제출`.
    const title = page.locator('[data-ui="screen-title"]');
    await expect(title).toHaveText(new RegExp(`^지출결의 — ${fx.projectName}`));
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await expect(page.locator('[data-ui="screen-title"]').locator("..").getByText("회수", { exact: true })).toBeVisible();
    const firstTerm = page.locator("dl dt").first();
    await expect(firstTerm).toHaveText("회수");
    await expect(page.locator("dl dd").first()).toHaveText(/^\d{2}-\d{2} \d{2}:\d{2}$/);
    const resubmit = page.getByRole("button", { name: /^지출결의 다시 제출/ });
    await expect(resubmit).toBeVisible();
    await page.clock.resume();

    await waitForHydration(resubmit);
    const amount = page.getByLabel("공급가액");
    await amount.fill("10,000,000");
    await amount.press("Control+Enter");
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1`));
    await expect(page.getByRole("status").filter({ hasText: `지출결의 다시 제출 · 결재 요청됨 → ${fx.lead.name}` })).toBeVisible();
    await expect(page.getByText(number, { exact: true })).toBeVisible();
    await page.context().close();

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto(`/expenses/${expenseId}`);
    const approve = lead.getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await approve.click();
    await expect(lead.getByRole("button", { name: /^승인/ })).toHaveCount(0);
    await expect(lead.getByText(number, { exact: true })).toBeVisible();
    await expect(lead.locator('[data-ui="screen-title"]').locator("..").getByText("결재 중", { exact: true })).toBeVisible();
    await lead.context().close();
  });
});

test.describe("작성 중 삭제 · 문서 화면 회수 · 본인 승인 (Task 2)", () => {
  test("작성 중 폼 머리 줄 `지출결의 삭제` → 확인 창 없이 목록 · 토스트 `되돌리기` → 폼", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.clock.install();
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id] });
    const expenseId = created.created[0]?.expenseId ?? "";
    await page.goto(`/expenses/${expenseId}`);
    const remove = page.getByRole("button", { name: "지출결의 삭제" });
    await waitForHydration(remove);
    await remove.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/expenses(\?|$)/);
    const toast = page.getByRole("status").filter({ hasText: "지출결의 삭제" });
    await expect(toast).toBeVisible();
    await pauseClock(page);
    await toast.getByRole("button", { name: "되돌리기" }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}$`));
    await page.clock.resume();
    await expect(page.getByRole("button", { name: /^임시 저장/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "지출결의 삭제" })).toBeVisible();
  });

  test("팀장 승인 뒤 문서 화면 `회수` → 04.1 확인(제목 · 결과 줄) → Ctrl+Enter → 폼", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    const expenseId = await submitFromForm(page, fx, "retry");
    const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    await approveDocument(fx.lead.viewer, { instanceId: view?.instanceId ?? "", expectedVersion: view?.version ?? 0 });

    await page.goto(`/expenses/${expenseId}`);
    const withdraw = page.getByRole("button", { name: /^회수/ });
    await waitForHydration(withdraw);
    await withdraw.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "지출결의 회수" })).toBeVisible();
    await expect(dialog.getByText("팀장 승인 기록은 남음 · 다시 제출 때 첫 단계부터")).toBeVisible();
    await page.keyboard.press("Control+Enter");
    await expect(page.getByRole("button", { name: /^지출결의 다시 제출/ })).toBeVisible();
    await expect(page.locator("dl dt").first()).toHaveText("회수");
  });

  test("팀장이 기안한 문서 — 제출 토스트 `본인 승인 차례` · 행동 줄 승인 + 회수(반려 없음)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const suffix = randomUUID().slice(0, 6);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E회식집-${suffix}`, normalizedName: `e2e회식집-${suffix}`, defaultEvidenceType: "tax_invoice" });
    const { expenseId, version } = await createTeamExpenseDraft(fx.lead.viewer, {
      idempotencyKey: randomUUID(),
      fields: { teamExpenseKind: "team_overhead", usageDate: seoulToday(), content: `팀 회식-${suffix}` },
    });
    const payment = (await listExpenseFormOptions(fx.lead.viewer)).payment[0]?.value ?? null;
    await saveExpenseDraft(fx.lead.viewer, {
      expenseId,
      expectedVersion: version,
      fields: { vendorId: vendor.id, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
    });
    const page = await loginPage(browser, baseURL, fx.lead);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
    await expect(page.locator('[data-ui="attachments"] li').getByText(META)).toBeVisible({ timeout: UPLOAD_WAIT });
    await page.getByRole("button", { name: /^지출결의 제출/ }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1`));
    await expect(page.getByRole("status").filter({ hasText: "지출결의 제출 · 본인 승인 차례" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^승인/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^회수/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^반려/ })).toHaveCount(0);
  });
});

// 05-09 Task 3(사용자 결정 2026-10-04 — 260907 :79 복귀 · UI-SPEC S4 파일 행 3차 · 「무효 행 접근성」): 결재 중에는 아무도 떼지 못하고 붙이기는
// 경영관리 권한자만, 기안자는 승인 뒤 더하기만. 승인 뒤 잘못 붙은 증빙은 권한자가 무효 처리(사유 · 확인 창 · 토스트 없음).
async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  for (const person of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(person.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    await approveDocument(person.viewer, { instanceId: view?.instanceId ?? "", expectedVersion: view?.version ?? 0 });
  }
}

const ROWS = '[data-ui="attachments"] li';

test.describe("제출 뒤 증빙", () => {
  test("결재 중 — 기안자는 잠김 한 줄 · 하나 더 0 · 삭제 0, 권한자는 하나 더로 붙임 · 삭제 0, 권한 없는 결재자는 크게 보기만", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const manager = await makeEvidenceManagerE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "phone");

    const drafter = await loginPage(browser, baseURL, fx.pm);
    await drafter.goto(`/expenses/${expenseId}`);
    await expect(drafter.locator(ROWS)).toHaveCount(1);
    await expect(drafter.getByText("결재 중 · 증빙은 경영관리")).toBeVisible();
    await expect(drafter.getByRole("button", { name: /^하나 더/ })).toHaveCount(0);
    await expect(drafter.getByRole("button", { name: "삭제" })).toHaveCount(0);
    await drafter.context().close();

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto(`/expenses/${expenseId}`);
    await expect(lead.locator(ROWS)).toHaveCount(1);
    await expect(lead.locator(ROWS).getByRole("link", { name: "크게 보기" })).toBeVisible();
    await expect(lead.getByRole("button", { name: /^하나 더/ })).toHaveCount(0);
    await expect(lead.getByText("결재 중 · 증빙은 경영관리")).toHaveCount(0);
    await lead.context().close();

    const page = await loginPage(browser, baseURL, manager);
    await page.goto(`/expenses/${expenseId}`);
    const more = page.getByRole("button", { name: /^하나 더/ });
    await waitForHydration(more);
    await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
    await expect(page.locator(ROWS).getByText(META)).toHaveCount(2, { timeout: UPLOAD_WAIT });
    await expect(page.getByRole("button", { name: "삭제" })).toHaveCount(0);
    await page.context().close();
  });

  test("승인 뒤 — 기안자는 하나 더만, 권한자 무효 처리(사유 칸 textarea · 빈 칸 막힘) → 취소선 · 「무효」 태그 · 2행 · 토스트 없음 · 접근성", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const manager = await makeEvidenceManagerE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "phone");
    await approveAll(fx, expenseId);

    const drafter = await loginPage(browser, baseURL, fx.pm);
    await drafter.goto(`/expenses/${expenseId}`);
    await expect(drafter.getByRole("button", { name: /^하나 더/ })).toBeVisible();
    await expect(drafter.getByRole("button", { name: "삭제" })).toHaveCount(0);
    await expect(drafter.getByRole("button", { name: "무효 처리" })).toHaveCount(0);
    await drafter.context().close();

    const page = await loginPage(browser, baseURL, manager);
    await page.goto(`/expenses/${expenseId}`);
    const voidButton = page.locator(ROWS).getByRole("button", { name: "무효 처리" });
    await waitForHydration(voidButton);
    await voidButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "증빙 무효 처리" })).toBeVisible();
    const reason = dialog.getByLabel("사유");
    expect(await reason.evaluate((el) => el.tagName)).toBe("TEXTAREA");
    await expect(dialog.getByText("사유 없음 · 사유 적기").first()).toBeVisible();
    await reason.fill("다른 건 영수증");
    await dialog.getByRole("button", { name: /^무효 처리/ }).click();
    await expect(dialog).toHaveCount(0);

    const row = page.locator(ROWS).first();
    const tag = row.getByText("무효", { exact: true });
    await expect(tag).toBeVisible();
    const name = row.locator("[aria-describedby]").first();
    await expect(name).toHaveCSS("text-decoration-line", "line-through");
    const describedBy = (await name.getAttribute("aria-describedby")) ?? "";
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(/^무효 · 경영지원.{4} · \d{2}-\d{2} \d{2}:\d{2} · 다른 건 영수증$/);
    expect(await tag.evaluate((el, other) => (el.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, await name.elementHandle())).toBe(true);
    expect(await row.evaluate((el) => el.closest('[aria-live="polite"]') !== null)).toBe(true);
    await expect(row.getByRole("button", { name: "무효 처리" })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /무효/ })).toHaveCount(0);
    await page.context().close();
  });

  test("폰 375 — 권한자의 승인 문서 살아 있는 파일 행: 크게 보기 · 무효 처리 각각 높이 44 이상 · 사이 16 이상", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const manager = await makeEvidenceManagerE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "phone");
    await approveAll(fx, expenseId);

    const page = await loginPage(browser, baseURL, manager, { width: 375, height: 800 });
    await page.goto(`/expenses/${expenseId}`);
    const row = page.locator(ROWS).first();
    const view = await row.getByRole("link", { name: "크게 보기" }).boundingBox();
    const voidBox = await row.getByRole("button", { name: "무효 처리" }).boundingBox();
    if (!view || !voidBox) throw new Error("파일 행 3차가 없다");
    expect(view.height).toBeGreaterThanOrEqual(44);
    expect(voidBox.height).toBeGreaterThanOrEqual(44);
    const sameLine = Math.abs(view.y - voidBox.y) < 1;
    const gap = sameLine ? voidBox.x - (view.x + view.width) : voidBox.y - (view.y + view.height);
    expect(gap).toBeGreaterThanOrEqual(16);
    await page.context().close();
  });
});
