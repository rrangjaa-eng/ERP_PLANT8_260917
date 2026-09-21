import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 네비게이션 공백 수정(2026-09-21) — SYSTEM.md §6-8·§7-8이 말하는 "관리자용
// 「더보기」 시트"를 폰에서도 직접 클릭으로 검증한다. mobile-*.spec.ts 접두어라
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

test.describe("관리자용 「더보기」 시트로 관리자 화면에 클릭만으로 닿는다 (폰 375)", () => {
  test("시스템 관리자는 「더보기」 시트의 「관리자」 그룹에서 「사람」을 눌러 /admin/people로 간다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto("/");

    await page.getByRole("button", { name: "더보기" }).click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    // 「관리자」 그룹 아래 admin.* 링크 전부가 보인다 — 「계정」 그룹과 구분된다.
    await expect(sheet.getByText("관리자", { exact: true })).toBeVisible();
    await expect(sheet.getByText("계정", { exact: true })).toBeVisible();

    await sheet.getByRole("link", { name: "사람" }).click();

    await expect(page).toHaveURL(/\/admin\/people$/);
  });
});
