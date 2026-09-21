import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// §3 터치 목표: 폰에서 모든 행동 요소 최소 44×44. code-tables.module.css의
// .toggle은 밑줄 링크라 글자 줄 높이(20px 안팎)로 찌그러져 있다 — 공유
// Button .tertiary에서 고친 것과 같은 결함이 이 화면별 CSS 모듈에 남아 있었다.
test.describe("폰 375 /admin/code-tables 터치 목표 (§3)", () => {
  test("코드표 선택 링크와 숨김 토글이 44×44 이상이다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/code-tables");

    const targets = [
      page.getByRole("navigation", { name: "코드표 선택" }).getByRole("link").first(),
      page.getByRole("link", { name: /숨김 포함|숨김 제외/ }),
    ];

    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
