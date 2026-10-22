import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { NOTE_REQUIRED } from "@/domain/expenses/gate";
import { attachEvidence } from "../integration/fixtures/expenses";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 07-28 트레이서(J13 · N8 · SC-02 ④): 지출결의 「비고」는 `상세`로 이름이 바뀌고 제출 때 필수다 — 임시 저장은 비어도 된다.
// 서버 submitExpense와 화면 제출 막힘은 같은 판정 한 길(gate.ts EXPENSE_REQUIRED_FIELDS)이다.

// 상세를 비운 채 증빙까지 붙은 작성 중 문서 — 막히는 이유가 상세 하나뿐이다.
async function openBlankDetail(page: Page, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await attachEvidence(fx.pm.viewer, expenseId);
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return expenseId;
}

const noteOf = async (id: string) => (await db.select({ note: expenses.note, supply: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, id)))[0];

test.describe("상세 — 제출 필수 (07-28 J13 · N8)", () => {
  test("칸 라벨은 `상세` · 비운 채 임시 저장은 되고 · 비운 채 제출은 칸 아래 `상세 · 입력`으로 막히고 · 적으면 제출된다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    const id = await openBlankDetail(page, fx, "hold");

    await expect(page.getByLabel("상세", { exact: true })).toBeVisible();
    await expect(page.getByLabel("비고", { exact: true })).toHaveCount(0);

    // 첫 포커스 = 막힘 대상(상세) · 1차 옆 이유는 기존 빈 칸 꼴.
    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    await expect(submit).toHaveAttribute("aria-disabled", "true", { timeout: 10_000 });
    const describedBy = (await submit.getAttribute("aria-describedby")) ?? "";
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("상세 비어 있음 · 상세 입력");
    await expect(page.locator("#note")).toBeFocused();

    // 비운 채 임시 저장 — 다른 칸은 저장되고 상세는 비어도 된다.
    await page.getByLabel("공급가액").fill("1,234,000");
    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect.poll(async () => (await noteOf(id))?.supply).toBe(1_234_000);
    expect((await noteOf(id))?.note).toBeNull();
    await expect(page.locator("#note-error")).toHaveCount(0);

    // 비운 채 제출 — 막힘 + 칸 아래 `상세 · 입력`.
    await page.getByLabel("지급 방식").focus();
    await submit.click({ force: true });
    await expect(page.locator("#note-error")).toHaveText(NOTE_REQUIRED);
    expect(NOTE_REQUIRED).toBe("상세 · 입력");
    await expect(page.locator("#note")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#note")).toHaveAttribute("aria-describedby", "note-error");
    await expect(page.locator("#note")).toBeFocused();
    await expect(page).not.toHaveURL(/submitted=1/);

    // 공백만 적어도 막힌다 · 적으면 칸 오류가 걷히고 제출된다.
    await page.locator("#note").fill("   ");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await page.locator("#note").fill("행사 운영비");
    await expect(page.locator("#note-error")).toHaveCount(0);
    await expect(submit).not.toHaveAttribute("aria-disabled", "true", { timeout: 10_000 });
    await submit.click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${id}\\?submitted=1$`));
    expect((await noteOf(id))?.note).toBe("행사 운영비");
    await page.context().close();
  });
});
