import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { runTick, type TickResult } from "@/domain/notify/tick";
import { createTestConditionKind, testCandidate, type TestConditionKind } from "@/test/support/notify-tick";

// 04.2-09 Task 2 — 폰 375 「더보기」 시트 계정 그룹 「알림함 N」(S1-b · S1-menu-item).
// 파일명 접두어 mobile-*.spec.ts로 mobile-375 프로젝트에서만 돈다(playwright.config.ts).

async function tickOnce(kind: TestConditionKind): Promise<TickResult> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await runTick({ conditionKinds: [kind], isBusinessDay: () => Promise.resolve(true) });
    if (result.status !== "locked") return result;
  }
  throw new Error("notify tick: advisory lock 재시도 초과(20회)");
}

async function createEmployee(): Promise<{ email: string; password: string; userId: string }> {
  const email = `e2e-mobile-notify-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name: "E2E Employee",
    roleId: DEFAULT_ROLE_ID,
  });
  return { email, password: tempPassword, userId };
}

test.describe("폰 「더보기」 시트 계정 그룹 — 「알림함 N」 (04.2-09 Task 2)", () => {
  test("알림 1건 — 계정 그룹이 「알림함 1」·「내 정보」·「설정」·「로그아웃」 순서이고 시트에 스크롤·잘림이 없다", async ({
    page,
  }) => {
    const user = await createEmployee();
    const kind = createTestConditionKind([
      testCandidate({ recipientId: user.userId, entityId: randomUUID(), referenceDate: "2026-01-01" }),
    ]);
    await tickOnce(kind);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.getByRole("button", { name: "더보기" }).click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    const accountItems = sheet.locator('li[role="presentation"] ~ li');
    const texts = await accountItems.allTextContents();
    expect(texts.map((text) => text.trim())).toEqual(["알림함 1", "내 정보", "설정", "로그아웃"]);

    // 항목(링크·버튼) 높이가 이웃과 같다(추가된 행이 목록 행 규격을 벗어나지 않는다).
    // <li> 자체가 아니라 안의 링크/버튼을 잰다 — 마지막 <li>만 border-bottom이 0이라
    // <li> 높이로 재면 1px 차이가 나 무관한 실패가 된다(MoreSheet.module.css .list li:last-child).
    const rows = sheet.locator('li[role="presentation"] ~ li > a, li[role="presentation"] ~ li > button');
    const heights = await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(heights).toHaveLength(4);
    expect(new Set(heights.map((h) => Math.round(h))).size).toBe(1);

    // 시트에 스크롤·잘림이 없다 — 내부 스크롤 높이가 보이는 높이를 넘지 않는다.
    const sheetOverflow = await sheet.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(sheetOverflow).toBeLessThanOrEqual(1);
  });

  test("0건 — 계정 그룹 첫 항목이 「알림함」(숫자 없음)이고 링크가 동작한다", async ({ page }) => {
    const user = await createEmployee();

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.getByRole("button", { name: "더보기" }).click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    const notificationsLink = sheet.getByRole("link", { name: "알림함", exact: true });
    await expect(notificationsLink).toBeVisible();

    await notificationsLink.click();
    await expect(page).toHaveURL(/\/notifications$/);
  });
});
