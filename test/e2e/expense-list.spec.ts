import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createTeamExpenseDraft, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { loginPage } from "./leave-org";
import { setupExpenseE2E } from "./expense-fixture";

// 05-08(EXP-08 · UI-SPEC S8): 지출결의 목록 `/expenses` — 팀장이 팀원의 프로젝트 미연결 팀 비용을 2행 `프로젝트 미연결 · {종류}`로 본다.
// 판정은 DOM 실측(글자 · 링크)이다. 문서는 도메인 함수로 만든다(증빙은 메모리 가짜 저장소 — 제출 게이트 ⑧만 통과시킨다).

async function submittedTeamCost(viewer: Viewer, content: string): Promise<string> {
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
  return expenseId;
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
    await expect(page.locator('[data-ui="screen-title"]')).toHaveText("지출결의");
    const row = rowOf(page, expenseId);
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("link")).toContainText(content);
    await expect(row.getByText("프로젝트 미연결 · 팀 관리비", { exact: true })).toBeVisible();
    await expect(row.getByText(fx.pm.name, { exact: true })).toBeVisible();
    await expect(row.getByText(/결재 중$/)).toBeVisible();
    await page.context().close();
  });
});
