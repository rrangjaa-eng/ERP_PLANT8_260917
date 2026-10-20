import { expect, test, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, expenses } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { loginAsSysadmin } from "./row-actions-helpers";

// 06.1-14(G15 · RP-15 ⑵ · 카드 R6): 관리자가 `/admin/code-tables` 증빙 종류 펼침 칸의 체크박스로 「올린 사람 · 경영관리만 보기」를 켜고 끄며,
// 켜진 종류 문서의 05 파일은 결재자에게 보이지 않고 잠김 줄 한 줄만 보인다. 꺼 둔 「개인카드 전표」(06.1-01 시드)는 기존 사용 켬으로 켠다.
// 공유 코드 항목을 바꾸므로 afterAll에서 시드 값(속성 켬 · 사용 꺼짐)으로 되돌린다(재검토 2회차 eng P3).

const PRIVATE_VALUE = "personal_card_receipt";
const PRIVATE_LABEL = "개인카드 전표";
const PRIVATE_FIELD_LABEL = "올린 사람 · 경영관리만 보기";
// 시드는 사용 꺼짐이라 코드표 목록에 「숨김 포함」으로 들어가야 보인다(카드 R6 · 운영에서도 이 길이다).
const CODE_TABLE_URL = "/admin/code-tables?tableKey=evidence_type&includeInactive=1";

async function privateItem(): Promise<{ id: string; privateToOwner: boolean; active: boolean }> {
  const [row] = await db
    .select({ id: codeItems.id, privateToOwner: codeItems.privateToOwner, active: codeItems.active })
    .from(codeItems)
    .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_VALUE)));
  if (!row) throw new Error("개인카드 전표 코드 항목 없음");
  return row;
}

async function setPrivate(value: boolean): Promise<void> {
  await db
    .update(codeItems)
    .set({ privateToOwner: value })
    .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_VALUE)));
}

test.afterAll(async () => {
  // 시드 값으로 되돌린다 — 속성 켬 · 사용 꺼짐(06.1-01 시드 · 카드 R6).
  await db
    .update(codeItems)
    .set({ privateToOwner: true, active: false })
    .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_VALUE)));
});

// 이름 칸은 쓰기 권한이 있으면 입력칸이라 글자로 집을 수 없다 — 행 머리 id(`code-row-{항목 id}`)로 행을 집고 그 아래 전폭 줄을 잡는다.
function detailRowOf(page: Page, itemId: string) {
  return page.locator(`xpath=//th[@id="code-row-${itemId}"]/parent::tr/following-sibling::tr[@data-ui="static-table-detail"][1]`);
}

test.describe("G15 코드표 체크박스", () => {
  test("관리자가 라벨 클릭 · Space로 켜고 끄며 새로 고침 뒤에도 그대로다", async ({ page }) => {
    await loginAsSysadmin(page);
    await setPrivate(true);
    const itemId = (await privateItem()).id;

    await page.goto(CODE_TABLE_URL);
    const checkbox = detailRowOf(page, itemId).getByLabel(PRIVATE_FIELD_LABEL);
    await waitForHydration(checkbox);
    await expect(checkbox).toBeChecked();

    // 라벨 자체가 클릭 영역(SYSTEM §7-2 boolean).
    await detailRowOf(page, itemId).getByText(PRIVATE_FIELD_LABEL).click();
    await expect(checkbox).not.toBeChecked();
    await expect.poll(async () => (await privateItem()).privateToOwner, { timeout: 10_000 }).toBe(false);

    await page.reload();
    const after = detailRowOf(page, itemId).getByLabel(PRIVATE_FIELD_LABEL);
    await waitForHydration(after);
    await expect(after).not.toBeChecked();

    // 키보드만으로 다시 켠다 — 포커스가 남는다.
    await after.focus();
    await page.keyboard.press("Space");
    await expect(after).toBeChecked();
    await expect(after).toBeFocused();
    await expect.poll(async () => (await privateItem()).privateToOwner, { timeout: 10_000 }).toBe(true);
  });

  test("폰 375에서는 같은 칸이 값 글자뿐이다(보이는 체크박스 0)", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    await loginAsSysadmin(page);
    await setPrivate(true);
    const itemId = (await privateItem()).id;
    await page.goto(CODE_TABLE_URL);

    const detail = detailRowOf(page, itemId);
    await expect(detail.getByLabel(PRIVATE_FIELD_LABEL).locator("visible=true")).toHaveCount(0);
    await expect(detail.getByText("올린 사람 · 경영관리만 ·")).toBeVisible();
    await context.close();
  });
});

test.describe("G15 결재자 문서 화면", () => {
  test("결재자에게 파일 행 0 · 잠김 줄 `개인카드 전표 · 경영관리만`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "hold");
    await setPrivate(true);
    await db.update(expenses).set({ evidenceType: PRIVATE_VALUE }).where(eq(expenses.id, expenseId));

    const page = await loginPage(browser, baseURL, fx.lead);
    await page.goto(`/expenses/${expenseId}`);

    await expect(page.locator('[data-ui="attachments"] li')).toHaveCount(0);
    await expect(page.getByText(`${PRIVATE_LABEL} · 경영관리만`)).toBeVisible();
    await page.context().close();
  });
});

test.describe("카드 R6 — 꺼 둔 종류를 관리자가 켠다", () => {
  test("시드 상태에서는 증빙 종류 선택지에 없고, 사용 켬 뒤에는 있다", async ({ browser, baseURL }) => {
    const fx: ExpenseE2E = await setupExpenseE2E();
    await db
      .update(codeItems)
      .set({ active: false })
      .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_VALUE)));
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.retry.id] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서 없음");

    const drafter = await loginPage(browser, baseURL, fx.pm);
    await drafter.goto(`/expenses/${expenseId}`);
    const select = drafter.getByLabel("증빙 종류");
    await waitForHydration(select);
    await expect(select.getByRole("option", { name: PRIVATE_LABEL })).toHaveCount(0);

    // 관리자가 기존 「사용 켬」으로 켠다(새 쓰기 0 — PR-D 배포 뒤 운영에서도 이 길이다).
    const adminPage = await browser.newPage({ baseURL });
    await loginAsSysadmin(adminPage);
    await adminPage.goto(CODE_TABLE_URL);
    const itemId = (await privateItem()).id;
    const row = adminPage.locator(`xpath=//th[@id="code-row-${itemId}"]/parent::tr`);
    await row.getByRole("button", { name: "활성화" }).click();
    await expect.poll(async () => (await privateItem()).active, { timeout: 10_000 }).toBe(true);
    await adminPage.close();

    await drafter.reload();
    const reopened = drafter.getByLabel("증빙 종류");
    await waitForHydration(reopened);
    await expect(reopened.getByRole("option", { name: PRIVATE_LABEL })).toHaveCount(1);
    await drafter.context().close();
  });
});
