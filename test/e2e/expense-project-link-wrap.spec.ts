import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { loginPage } from "./leave-org";
import { setupExpenseE2E, submitLineExpense } from "./expense-fixture";

// 06.2 PR-6 /design-review DOM 감사: 지출결의 문서의 프로젝트 칸 링크(3차 버튼 · nowrap)가 실제 길이 행사 이름에서
// 값 칸을 넘어 문서가 가로로 넘쳤다(320 = +101px · 375 = +46px, SYSTEM §6-0 「320에서 문서 넘침 0」 위반).
// 같은 이름을 링크 없이 글자로 그리는 쪽(범위 밖 사람)은 줄바꿈해 넘치지 않았다.
const LONG_NAME = "2026 하반기 신제품 런칭 팝업스토어 운영";

for (const width of [375, 320]) {
  test(`폭 ${width} — 긴 행사 이름의 프로젝트 칸 링크가 값 칸 안에서 줄바꿈하고 문서가 가로로 넘치지 않는다`, async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await db.update(projects).set({ name: LONG_NAME }).where(eq(projects.id, fx.projectId));
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");

    const page = await loginPage(browser, baseURL, fx.pm, { width, height: 900 });
    await page.goto(`/expenses/${expenseId}`);
    const field = page.locator("dt", { hasText: /^프로젝트$/ }).locator("xpath=following-sibling::dd[1]");
    const link = field.getByRole("link", { name: new RegExp(LONG_NAME) });
    await expect(link).toHaveAttribute("href", `/projects/${fx.projectId}`);

    const box = await link.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const dd = el.closest("dd")!.getBoundingClientRect();
      return { right: r.right, ddRight: dd.right, height: r.height };
    });
    expect(box.right).toBeLessThanOrEqual(box.ddRight + 0.5);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.context().close();
  });
}
