import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createFixtureUser } from "./fixtures";
import { withCertFeatureOff } from "./helpers/cert";

// 04.3-09 — 「관리」 → 확인증 그룹 → 확인증 행사 진입 · 게이트 꺼짐 · 설정 문의 전화 형식 오류.
// 전역 설정(기능 · 문의 전화)은 cert.setup.ts가 켠다 — 이 스펙은 cert.enabled · 문의 전화 설정을
// 직접 바꾸지 않는다(C4). 기능 끄기는 withCertFeatureOff 범위 안에서만 한다. 문의 전화는 형식이
// 틀린 값(값이 바뀌지 않는 경로)만 본다 — 올바른 값 · 비우기는 단위 테스트가 본다.

test.describe.configure({ mode: "serial" });

const PHONE_FORMAT_ERROR = "전화번호 형식이 아닙니다 · 02-1234-5678처럼 적어 주세요";

async function login(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("확인증 관리 진입(04.3-09)", () => {
  test("게이트 켬: 기획 PM은 「관리」 → 그룹 「확인증」만 → 「확인증 행사」로 행사 화면에 간다", async ({ page }) => {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await login(page, pm);

    await page.getByRole("button", { name: "E2E Employee" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "관리", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["확인증"]);
    await page.getByRole("link", { name: "확인증 행사", exact: true }).click();

    await expect(page).toHaveURL(/\/certs\/events$/);
    await expect(page.getByRole("heading", { name: "확인증 행사", level: 1 })).toBeVisible();
  });

  test("게이트 끔: 같은 PM에게 「관리」가 없고 /admin은 404 · 시스템 관리자의 /admin은 그룹 셋뿐이다", async ({
    page,
    browser,
  }) => {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await withCertFeatureOff(async () => {
      await login(page, pm);
      await page.getByRole("button", { name: "E2E Employee" }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "관리", exact: true })).toHaveCount(0);
      const response = await page.goto("/admin");
      expect(response?.status()).toBe(404);

      const adminContext = await browser.newContext();
      try {
        const adminPage = await adminContext.newPage();
        await login(adminPage, admin);
        const adminResponse = await adminPage.goto("/admin");
        expect(adminResponse?.status()).toBe(200);
        await expect(adminPage.getByRole("heading", { level: 2 })).toHaveText(["마스터", "설정·권한", "운영 기록"]);
        await expect(adminPage.getByRole("link", { name: "확인증 행사", exact: true })).toHaveCount(0);
      } finally {
        await adminContext.close();
      }
    });
  });

  test("설정: 수령자 문의 전화에 형식이 틀린 값을 적으면 오류 줄이 서고 저장된 값은 그대로다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await login(page, admin);
    await page.goto("/admin/settings");

    await expect(page.getByRole("heading", { name: "확인증", exact: true })).toBeVisible();
    const phone = page.getByLabel("수령자 문의 전화");
    const before = await phone.inputValue();

    await phone.fill("02-12");
    await phone.blur();

    await expect(page.locator('[id="setting-cert.contact_phone-error"]')).toContainText(PHONE_FORMAT_ERROR);

    await page.reload();
    await expect(page.getByLabel("수령자 문의 전화")).toHaveValue(before);
  });
});
