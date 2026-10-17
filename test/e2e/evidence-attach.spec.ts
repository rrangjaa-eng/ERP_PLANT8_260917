import { test, expect, type Browser } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { getApprovalView, rejectDocument } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { createIntakeManager, insertRecordFixture } from "@/test/integration/fixtures/evidence";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { clearEvidence, EVIDENCE_COL, evidenceCell, evidenceRows, loginAs } from "./helpers/evidence";

// 06.1-06 S4 · S7 — 증빙 목록 행 `붙이기` → 붙일 문서 고르기(PickDialog 단일) → 붙음 · 상태 2행 문서 번호 링크 → 문서 「증빙」 섹션 읽기 행.
// 판정은 CI=true 프로덕션 빌드에서 한다(CLAUDE.md §5). 등록 권한자는 회사 전체 증빙을 보므로 케이스마다 증빙 표를 비우고 시작한다.

test.beforeEach(async () => {
  await clearEvidence();
});

// 줄 하나의 문서를 화면에서 제출하고 팀장이 반려한다(expense-close.spec.ts와 같은 갈래 — 번호 있는 반려 문서).
// 통합 fixture setupExpenseProject는 쓰지 않는다 — 기획1팀에 팀장 자리를 남겨 뒤 스펙의 팀장 발령을 막는다.
async function returnedExpense(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E): Promise<{ expenseId: string; number: string }> {
  const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row?.number) throw new Error("번호 없음");
  return { expenseId, number: row.number };
}

test("S7 행 1 반려 지출결의 × 경영관리(두 키): 행 붙이기 → 검색 칸 포커스 · 콤보 0 → Enter → 붙음 · 번호 링크 → 문서 증빙 섹션 읽기 행", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const doc = await returnedExpense(browser, baseURL, fx);
  await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await loginAs(page, manager.roleId);

  // 기본 보기 「할 일」은 붙은 기록을 빼므로(06.1-05) 붙인 뒤 그 행을 보려고 「전체」로 연다.
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(1);
  await evidenceRows(page).first().getByRole("button", { name: "붙이기" }).click();

  const dialog = page.getByRole("dialog", { name: "붙일 문서 고르기" });
  await expect(dialog).toBeVisible();
  const search = dialog.getByRole("textbox", { name: "문서 번호 · 작성자 · 지급처" });
  await expect(search).toBeFocused();
  await expect(dialog.locator("[role=combobox]")).toHaveCount(0);

  // 회사 전체 문서 가운데 이 문서를 번호로 좁힌 뒤 ↓ → Enter(키보드만).
  await search.fill(doc.number);
  const option = dialog.getByRole("option", { name: new RegExp(doc.number) });
  await expect(option).toBeVisible();
  await search.press("ArrowDown");
  await expect(option).toBeFocused();
  await option.press("Enter");
  await expect(dialog).toBeHidden();

  const status = evidenceCell(page, 0, EVIDENCE_COL.status);
  await expect(status).toContainText("붙음");
  const link = status.getByRole("link", { name: doc.number });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(new RegExp(`/expenses/${doc.expenseId}#evidence$`));
  const section = page.locator("#evidence + div").getByRole("table", { name: "붙은 증빙" });
  await expect(section.locator("tbody tr:visible")).toHaveCount(1);
  await expect(section.locator("tbody tr:visible").first()).toContainText(fx.vendorName);
});

