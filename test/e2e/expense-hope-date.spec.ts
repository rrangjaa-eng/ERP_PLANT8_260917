import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { createExpenseFromLines, getExpense, submitExpense } from "@/domain/expenses";
import { isBusinessDay } from "@/domain/holidays/business-day";
import { REQUESTED_REASON_REQUIRED } from "@/domain/expenses/gate";
import { attachEvidence } from "../integration/fixtures/expenses";
import { delayServerActions, loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";
import { addDays, payCalendar } from "./pay-schedule-e2e";

// 07-16 Task 3(SC-02 · D-714 · K19 · D-731 · AQ-10): 기안자는 지급 예정일을 적지 않는다 — 희망 지급일 · 희망 사유 한 쌍만 적고, 예정일은
// 읽기 줄(자동 · 수동 지정) + 바로 아래 규칙 줄(07-01 payRuleLine 그대로)로 본다. 값은 첫 그림 = 폼 data, 그 뒤 = 미리보기(화면 계산 없음).

// evidence: 제출 칸 판정까지 보려면 증빙이 붙어 있어야 1차 `지출결의 제출`이 열린다(증빙 없음이면 aria-disabled).
async function openDraft(page: Page, fx: ExpenseE2E, key: LineKey, opts: { evidence?: boolean } = {}): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  if (opts.evidence) await attachEvidence(fx.pm.viewer, expenseId);
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return expenseId;
}

const scheduleValue = (page: Page) => page.getByTestId("expense-schedule-value");
const scheduleRule = (page: Page) => page.getByTestId("expense-schedule-rule");

test.describe("지출결의 폼 — 지급 예정일 읽기 줄 · 희망 지급일 (07-16 SC-02)", () => {
  test("입력 칸 없이 `지급 예정일 · MM-DD (자동)` + 규칙 줄 · 미리보기 동안 두 줄 다 `…`(이전 문구 없음)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    const id = await openDraft(page, fx, "tracer");
    const doc = await getExpense(fx.pm.viewer, { expenseId: id });
    const date = doc?.scheduledPaymentDate ?? "";
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await expect(page.locator("#scheduledPaymentDate")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "지급 예정일" })).toHaveCount(0);
    await expect(scheduleValue(page)).toHaveText(`${date.slice(5)} (자동)`);
    await expect(scheduleRule(page)).toHaveText(doc?.paymentRuleLine ?? "");

    await delayServerActions(page, 1_500);
    await page.getByLabel("공급가액").fill("1,234,000");
    await expect(scheduleValue(page)).toHaveText("…");
    await expect(scheduleRule(page)).toHaveText("…");
    await expect(scheduleValue(page)).toHaveText(`${date.slice(5)} (자동)`, { timeout: 10_000 });
    await expect(scheduleRule(page)).toHaveText(doc?.paymentRuleLine ?? "");
    await page.context().close();
  });

  test("K19 — 지급 권한자가 수동 지정한 작성 중 문서는 `(자동)` 대신 `수동 지정` · 규칙 줄 `결재 마감 면제`", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.retry.id] });
    const id = created.created[0]?.expenseId ?? "";
    let manual = addDays(cal.today, 10);
    while (!isBusinessDay(manual, cal.lookup)) manual = addDays(manual, 1);
    // D-740 기존 값 꼴(기록 칸 없음)도 수동 지정이다 — 작성 중 문서는 지급 권한자 길(결재 통과만)로 정할 수 없어 칸을 바로 채운다.
    await db.update(expenses).set({ scheduledPaymentDate: manual }).where(eq(expenses.id, id));

    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto(`/expenses/${id}`);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await expect(scheduleValue(page)).toHaveText(`${manual.slice(5)} 수동 지정`);
    await expect(scheduleValue(page)).not.toContainText("(자동)");
    await expect(scheduleRule(page)).toHaveText("결재 마감 면제");
    await page.context().close();
  });

  test("희망 지급일을 골라야 희망 사유 칸 · 포커스는 날짜 칸에 · 날짜를 지우면 사유도 지워짐 · 사유 빈 채 임시 저장 · 제출 → `희망 사유 · 입력`", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    const id = await openDraft(page, fx, "hold", { evidence: true });
    const hope = addDays(cal.today, 7);
    const date = page.getByLabel("희망 지급일");
    const reason = page.getByLabel("희망 사유");

    // 07-28 결합(실행 순서) — 제출 흐름은 상세(비고)를 먼저 채운다.
    await page.getByLabel("비고", { exact: true }).fill("행사 운영비");
    await expect(reason).toHaveCount(0);
    await date.fill(hope);
    await expect(reason).toBeVisible();
    await expect(date).toBeFocused();
    await reason.fill("행사 전 선금");
    await date.fill("");
    await expect(reason).toHaveCount(0);
    await date.fill(hope);
    await expect(reason).toHaveValue("");

    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect(page.getByText("임시 저장 실패 · 희망 사유 1칸")).toBeVisible();
    await expect(page.locator("#requestedPaymentReason-error")).toHaveText(REQUESTED_REASON_REQUIRED);
    await expect(reason).toHaveAttribute("aria-invalid", "true");

    await page.getByRole("button", { name: /^지출결의 제출/ }).click();
    await expect(page.getByText("제출 실패 · 희망 사유 1칸")).toBeVisible();
    await expect(page.locator("#requestedPaymentReason-error")).toHaveText(REQUESTED_REASON_REQUIRED);

    await reason.fill("행사 전 선금");
    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect(page.locator("#requestedPaymentReason-error")).toHaveCount(0);
    await expect
      .poll(async () => (await db.select({ date: expenses.requestedPaymentDate, reason: expenses.requestedPaymentReason, scheduled: expenses.scheduledPaymentDate }).from(expenses).where(eq(expenses.id, id)))[0])
      .toEqual({ date: hope, reason: "행사 전 선금", scheduled: null });

    // 저장 뒤 상세(제출한 문서 — 증빙은 위에서 붙였다) — 희망 두 줄(Task 2 표시).
    const [saved] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, id));
    const submitted = await submitExpense(fx.pm.viewer, { expenseId: id, expectedVersion: saved?.version ?? 0 });
    expect(submitted.kind).toBe("submitted");
    await page.goto(`/expenses/${id}`);
    // 감사 #8(P3): 표 밖 날짜는 ISO(SYSTEM §2-4).
    await expect(page.locator("dt", { hasText: /^희망 지급일$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText(hope);
    await expect(page.locator("dt", { hasText: /^희망 사유$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText("행사 전 선금");
    await page.context().close();
  });
});
