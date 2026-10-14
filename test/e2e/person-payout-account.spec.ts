import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { registerPerson } from "@/domain/people";
import { createFixtureUser } from "./fixtures";

// 06.5-04(D-6505 · UI-SPEC V2): 사람 상세 「지급 계좌」 섹션 + 옆 패널 「지급 계좌 수정」.
// 대상은 이 스펙이 만든 전용 사람이다(다른 사례와 계좌가 섞이지 않게).

async function login(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(creds.email);
  await page.getByLabel("비밀번호").fill(creds.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function makeTarget(): Promise<string> {
  const { userId } = await registerPerson(SYSTEM_VIEWER, {
    name: `계좌대상${randomUUID().slice(0, 5)}`,
    email: `e2e-payout-${randomUUID()}@example.test`,
    roleId: DEFAULT_ROLE_ID,
  });
  return userId;
}

const panel = (page: Page) => page.locator('dialog[data-ui="side-panel"]');
const section = (page: Page) => page.getByRole("region", { name: "지급 계좌" });

test.describe("사람 상세 지급 계좌(06.5 D-6505)", () => {
  test("계좌 적기 → 패널 저장 → 섹션에 끝 4자리 마스킹 · 3차 계좌 바꾸기 · 포커스 복귀", async ({ page }) => {
    await login(page, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
    const userId = await makeTarget();
    await page.goto(`/admin/people/${userId}`);

    await expect(section(page).getByRole("heading", { name: "지급 계좌" })).toBeVisible();
    await expect(section(page).locator("dd")).toHaveText(["—", "—", "—"]);
    await section(page).getByRole("link", { name: "계좌 적기" }).click();

    await expect(page).toHaveURL(/editAccount=1/);
    await expect(page.getByRole("dialog", { name: "지급 계좌 수정" })).toBeVisible();
    await panel(page).getByLabel("계좌 은행").fill("신한");
    await panel(page).getByLabel("예금주").fill("김직원");
    await panel(page).getByLabel("새 계좌번호").fill("110-123-456789");
    await panel(page).getByRole("button", { name: "계좌 저장" }).click();

    await expect(panel(page)).toHaveCount(0);
    await expect(section(page).locator("dd")).toHaveText(["신한", "김직원", /\*{4}-\*{2}-6789/]);
    const tertiary = section(page).getByRole("link", { name: "계좌 바꾸기" });
    await expect(tertiary).toBeVisible();
    await expect(tertiary).toBeFocused();
  });
});
