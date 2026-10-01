import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor, setVendorHidden } from "@/repositories/vendors";

// /design-review 2026-09-24 FINDING-005: 폰에서 EMPTY 「다음 한 수」 링크의 밑줄이
// border-bottom이라 44px 터치 상자 바닥에 붙어 글자에서 12px 떠 있었다. §4-4는
// 3차 버튼 밑줄을 text-underline-offset 2px(--underline-offset)로 정한다.
test.describe("폰 375 EMPTY 다음 한 수의 밑줄 (§4-4, /design-review FINDING-005)", () => {
  test("밑줄이 글자 밑줄(text-decoration)이고 offset이 --underline-offset이다", async ({ page }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/expenses");
    const link = page.locator("p").filter({ hasText: /없습니다/ }).getByRole("link");
    await expect(link).toBeVisible();
    await expect(link).toHaveCSS("text-decoration-line", "underline");
    await expect(link).toHaveCSS("text-underline-offset", "2px");
    await expect(link).toHaveCSS("border-bottom-style", "none");
    // 터치 목표(design-review H-1)는 그대로다.
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

// 260930-f3l /design-review FINDING-002: 공유 Button .tertiary의 밑줄이 border-bottom이라 폰에서 44 상자 바닥에 붙어
// 글자에서 13.5px 떠 있었다. ListEmpty(FINDING-005)와 같은 글자 밑줄로 고친다(SYSTEM §4-4).
test.describe("폰 375 공유 Button 3차(표 행 「숨기기」)의 밑줄 (§4-4, 260930-f3l FINDING-002)", () => {
  test("밑줄이 글자 밑줄이고 offset이 --underline-offset이며 44×44 상자를 지킨다", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `밑줄점검거래처-${randomUUID().slice(0, 8)}`,
      normalizedName: `밑줄점검-${randomUUID()}`,
    });
    try {
      const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
      await page.goto("/login");
      await page.getByLabel("이메일").fill(admin.email);
      await page.getByLabel("비밀번호").fill(admin.password);
      await page.getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL(/\/account$/);

      await page.goto("/admin/vendors");
      const hide = page.locator("tr", { hasText: vendor.name }).getByRole("button", { name: "숨기기" });
      await expect(hide).toBeVisible();
      await expect(hide).toHaveCSS("text-decoration-line", "underline");
      await expect(hide).toHaveCSS("text-underline-offset", "2px");
      await expect(hide).toHaveCSS("border-bottom-style", "none");
      const box = await hide.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});
