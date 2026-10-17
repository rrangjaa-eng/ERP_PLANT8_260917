import { test, expect, type Browser } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { getApprovalView, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { createIntakeManager, insertLinkFixture, insertRecordFixture, setRecordVisibilityFixture } from "@/test/integration/fixtures/evidence";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { loginPage, waitForHydration } from "./leave-org";
import { clearEvidence, loginAs } from "./helpers/evidence";

// 06.1-08 S5(EVID-07 · RP-4): 작성자 증빙 고르기 — 임시 지출결의 화면 → `증빙 고르기 N` → PickDialog 다중 → 붙임 → 문서 섹션 읽기 행.
// 판정은 CI=true 프로덕션 빌드에서 한다(CLAUDE.md §5). 등록 권한자는 회사 전체 증빙을 보므로 케이스마다 증빙 표를 비우고 시작한다.

test.beforeEach(async () => {
  await clearEvidence();
});

test("작성자 PM: 임시 지출결의 → 증빙 고르기 1 → 검색 칸 포커스 · 다중 목록 · 1위 선택 → Enter → 읽기 행 · 트리거 사라짐", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  const recordId = await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: fx.teamId });
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");

  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 1" });
  await waitForHydration(trigger);
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "거래처 · 금액" })).toBeFocused();
  const list = dialog.getByRole("listbox");
  await expect(list).toHaveAttribute("aria-multiselectable", "true");
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  const option = list.getByRole("option");
  await expect(option).toHaveCount(1);
  await expect(option.first()).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByText("고른 1건")).toBeVisible();
  const primary = dialog.getByRole("button", { name: /^증빙 붙이기 1/ });
  await expect(primary).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();

  const rows = page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(fx.vendorName);
  await expect(rows.first()).toContainText(`${fx.pm.name} 고름`);
  await expect(page.getByRole("button", { name: /^증빙 고르기/ })).toHaveCount(0);
  await page.context().close();
});

// 번호 있는 반려 문서(06.1-06 evidence-attach.spec.ts와 같은 갈래) — 경영관리 여러 장 붙이기의 문서.
async function returnedExpense(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E): Promise<{ expenseId: string; number: string }> {
  const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row?.number) throw new Error("번호 없음");
  return { expenseId, number: row.number };
}

test("경영관리: 여러 장 — 21째 고르기는 막히고(상한 줄 · 1차 켜짐) 20건이 한 번에 붙는다 · 넘침 줄", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const doc = await returnedExpense(browser, baseURL, fx);
  for (let index = 0; index < 22; index += 1) await insertRecordFixture(manager, { nameOnDocument: `상한후보${String(index).padStart(2, "0")}`, supplyKrw: 1_000_000 + index });
  await loginAs(page, manager.roleId);
  await page.goto(`/expenses/${doc.expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 22" });
  await waitForHydration(trigger);
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  const options = dialog.getByRole("option");
  await expect(options).toHaveCount(20);
  await expect(dialog.getByText("20건 넘음 · 검색으로 좁히기")).toBeVisible();
  // 반려 문서 — 서버가 1위를 미리 골라 둔다. 나머지 19개를 눌러 20건을 채운다.
  await expect(dialog.getByText("고른 1건")).toBeVisible();
  const listed = (await options.allTextContents()).join(" ");
  const leftOut = Array.from({ length: 22 }, (_, index) => `상한후보${String(index).padStart(2, "0")}`).filter((name) => !listed.includes(name));
  expect(leftOut).toHaveLength(2);
  for (let index = 1; index < 20; index += 1) await options.nth(index).click();
  await expect(dialog.getByRole("button", { name: /^증빙 붙이기 20/ })).toBeVisible();

  // 21째 — 목록에 없는 후보를 검색해 누른다: 고름은 20 그대로 · 상한 줄 · 1차는 막히지 않는다.
  const search = dialog.getByRole("textbox", { name: "거래처 · 금액" });
  await search.fill(leftOut[0] ?? "");
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  const unselected = dialog.getByRole("option", { selected: false });
  await expect(unselected.first()).toBeVisible();
  await unselected.first().click();
  await expect(dialog.getByText("20건 상한 · 나눠 붙이기")).toBeVisible();
  const primary = dialog.getByRole("button", { name: /^증빙 붙이기 20/ });
  await expect(primary).not.toHaveAttribute("aria-disabled", "true");

  await primary.click();
  await expect(dialog).toBeHidden();
  const rows = page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible");
  await expect(rows).toHaveCount(20);
  // 남은 2건 — 트리거는 후보가 남아 있어 그대로 선다.
  await expect(page.getByRole("button", { name: "증빙 고르기 2" })).toBeVisible();
});

test("경영관리: 모달을 연 뒤 다른 경로로 하나가 먼저 붙으면 Enter → 경합 줄 + 새로 고침 → 그 행이 빠지고 붙은 것은 0", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const doc = await returnedExpense(browser, baseURL, fx);
  const taken = await insertRecordFixture(manager, { nameOnDocument: "먼저붙은곳", supplyKrw: 5_000_000 });
  await insertRecordFixture(manager, { nameOnDocument: "남는곳", supplyKrw: 4_000_000 });
  await loginAs(page, manager.roleId);
  await page.goto(`/expenses/${doc.expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 2" });
  await waitForHydration(trigger);
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  const options = dialog.getByRole("option");
  await expect(options).toHaveCount(2);
  await options.nth(1).click();
  await expect(dialog.getByText("고른 2건")).toBeVisible();

  await insertLinkFixture({ recordId: taken, ownerId: doc.expenseId.replace(/.$/, "0"), attachedBy: manager.id });
  await dialog.getByRole("button", { name: /^증빙 붙이기 2/ }).click();
  await expect(dialog.getByText(/^다른 사람이 먼저 붙임 · 먼저붙은곳/)).toBeVisible();
  await dialog.getByRole("button", { name: "새로 고침" }).click();
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("남는곳");
  await expect(page.getByRole("table", { name: "붙은 증빙" })).toHaveCount(0);
});
