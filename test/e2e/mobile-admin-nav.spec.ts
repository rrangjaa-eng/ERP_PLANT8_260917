import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 「관리」 한 줄로 접기(2026-09-22, quick/260922-i3k, 사용자 결정 옵션 B) —
// SYSTEM.md §7-8이 말하는 "「더보기」 시트의 「관리」 한 줄(그룹 머리글 없이 목록
// 행 하나)"을 폰에서도 직접 클릭으로 검증한다. 개별 관리자 화면 이름은 이 시트가
// 아니라 /admin 인덱스(§6-10)에서 고른다. mobile-*.spec.ts 접두어라
// playwright.config.ts의 mobile-375 프로젝트에서만 돈다(mobile-shell.spec.ts와
// 같은 규칙).
async function loginAsSysadmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("「더보기」 시트의 「관리」 한 줄 → /admin 인덱스로 클릭만으로 관리자 화면에 닿는다 (폰 375)", () => {
  test("시스템 관리자는 「더보기」 시트의 「관리」를 눌러 /admin으로, 거기서 「사람」을 눌러 /admin/people로 간다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto("/");

    await page.getByRole("button", { name: "더보기" }).click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    // 「관리」 한 줄만 있고, 「관리자」 그룹 머리글은 없다 — 「계정」 그룹과는
    // 여전히 구분된다.
    await expect(sheet.getByRole("link", { name: "관리", exact: true })).toBeVisible();
    await expect(sheet.getByText("관리자", { exact: true })).toHaveCount(0);
    await expect(sheet.getByText("계정", { exact: true })).toBeVisible();

    await sheet.getByRole("link", { name: "관리", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.getByRole("link", { name: "사람" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
  });
});
