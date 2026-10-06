import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 06-27: Phase 6 메뉴 키 셋 · 정보 항목 넷이 기존 권한표 · 정보 노출표에 새 행으로 그려진다(화면 코드 변경 없음).
test.describe("Phase 6 메뉴 · 정보 항목 (06-27)", () => {
  test.beforeEach(async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("권한표에 지급 처리 · 구매 처리 · 카드 대리 등록 세 메뉴가 있다", async ({ page }) => {
    const response = await page.goto("/admin/permissions");
    expect(response?.status()).toBe(200);
    for (const label of ["지급 처리", "구매 처리", "카드 대리 등록"]) {
      await expect(page.getByRole("checkbox", { name: `시스템 관리자 · ${label} · 쓰기`, exact: true })).toBeVisible();
    }
  });

  test("정보 노출표에 법인카드 사용 · 구매 요청 정보 항목 네 줄이 있다", async ({ page }) => {
    const response = await page.goto("/admin/visibility");
    expect(response?.status()).toBe(200);
    for (const label of ["법인카드 사용 정보", "법인카드 사용 금액", "구매 요청 정보", "구매 요청 금액"]) {
      await expect(page.getByRole("rowheader", { name: label })).toBeVisible();
    }
  });
});
