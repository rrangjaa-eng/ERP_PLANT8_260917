import { test, expect, type Browser } from "@playwright/test";
import { getApprovalView, rejectDocument } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { seoulToday } from "@/lib/dates";
import { loginPage, waitForHydration } from "./leave-org";
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
});
