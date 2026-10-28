import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { like } from "drizzle-orm";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E } from "./expense-fixture";

// 07.1-02 PX2(C-75 · W14 · U-5): 폰(699.98 이하) 고르기 대화상자 시트 높이는 내용 따라 — 3줄이면 88dvh(--sheet-max-h)보다 작고 50줄이면 88dvh.
// 잴 대화상자는 지출결의 지급처 고르기(VendorPickDialog)이고, 후보는 이 스펙이 고유 접미사로 넣은 협력사 거래처 3 · 50건이다
// (공유 erp_test에서 다른 스펙 거래처가 섞이지 않게 option 수를 먼저 단언한다). 검색 중 시트가 낮아져 검색 칸이 내려오는 것은 U-5 허용이라 위치는 재지 않는다.

const PICK_LIMIT = 50;
const RUN = randomUUID().slice(0, 8);
const FEW_KEY = `고르기시트${RUN}a`;
const MANY_KEY = `고르기시트${RUN}b`;

async function insertPickVendors(key: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const name = `E2E${key}-${String(index).padStart(2, "0")}`;
    await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), kind: "supplier" });
  }
}

// 고르기만 하고 저장하지 않아 참조 행이 없다 — 지우고, FK로 막히면 보관해 뒤 스펙(mobile-vendors 등)의 거래처 목록에 섞이지 않게 한다.
test.afterAll(async () => {
  const pattern = `E2E고르기시트${RUN}%`;
  try {
    await db.delete(vendors).where(like(vendors.name, pattern));
  } catch {
    await db.update(vendors).set({ archivedAt: new Date() }).where(like(vendors.name, pattern));
  }
});

async function openPayeePicker(page: Page, query: string): Promise<Locator> {
  await page.locator("#vendor-pick").click();
  const picker = page.getByRole("dialog", { name: /^지급처 (고르기|바꾸기)$/ });
  await expect(picker).toBeVisible();
  await picker.getByRole("textbox", { name: "지급처 이름 검색" }).fill(query);
  return picker;
}

function dialogHeight(picker: Locator): Promise<{ height: number; innerHeight: number }> {
  return picker.evaluate((node) => ({ height: node.getBoundingClientRect().height, innerHeight: window.innerHeight }));
}

test.describe("폰 고르기 시트 높이 (07.1-02 PX2 · U-5)", () => {
  test("375 · 320: 후보 3줄이면 시트가 88dvh보다 낮고 50줄이면 88dvh이며 가로 넘침 0", async ({ browser, baseURL }) => {
    await insertPickVendors(FEW_KEY, 3);
    await insertPickVendors(MANY_KEY, PICK_LIMIT);
    const fx = await setupExpenseE2E();
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.phone.id] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");

    for (const width of [375, 320]) {
      const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
      await page.goto(`/expenses/${expenseId}`);
      await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));

      const picker = await openPayeePicker(page, FEW_KEY);
      await expect(picker.getByRole("option")).toHaveCount(3);
      const few = await dialogHeight(picker);
      expect(few.height, `${width}: 3줄 시트 높이`).toBeLessThan(0.88 * few.innerHeight);

      await picker.getByRole("textbox", { name: "지급처 이름 검색" }).fill(MANY_KEY);
      await expect(picker.getByRole("option")).toHaveCount(PICK_LIMIT);
      const many = await dialogHeight(picker);
      expect(Math.abs(many.height - 0.88 * many.innerHeight), `${width}: 50줄 시트 높이 ${many.height} vs 88dvh`).toBeLessThanOrEqual(1);

      const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      expect(overflow.scrollWidth, `${width}: 가로 스크롤`).toBeLessThanOrEqual(overflow.innerWidth);
      await page.context().close();
    }
  });
});
