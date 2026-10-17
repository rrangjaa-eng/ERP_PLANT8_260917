import { test, expect } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { createIntakeManager, insertRecordFixture, setRecordVisibilityFixture } from "@/test/integration/fixtures/evidence";
import { setupExpenseE2E } from "./expense-fixture";
import { loginPage, waitForHydration } from "./leave-org";
import { clearEvidence } from "./helpers/evidence";

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
