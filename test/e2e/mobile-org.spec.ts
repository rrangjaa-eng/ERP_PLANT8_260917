import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// defect 3(wave 5 DOM 감사, 375px): /admin/people/org의 scrollWidth(399)가
// clientWidth(375)를 넘었다 — 원인은 people.module.css의 .select(본부·팀
// 이름 인라인 입력이 쓰는 클래스)에 width가 없어 <select>와 달리 <td>/<li>
// 안에서 브라우저 기본 입력 폭(~170px+)을 그대로 쓴 것(측정으로 확인).
// width: 100%를 넣어 해결했다 — 이 스펙은 375px 실제 렌더에서 문서 가로
// 스크롤 폭이 뷰포트를 넘지 않는지를 잰다. 파일명 접두어 "mobile-"이
// mobile-375 프로젝트에서만 돌게 한다(playwright.config.ts).

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("폰 375 /admin/people/org 가로 스크롤 금지 (defect 3)", () => {
  test("문서 가로 스크롤 폭이 뷰포트 폭을 넘지 않는다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/org");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("본부·팀 이름 변경 입력이 컨테이너 폭을 넘지 않는다(width: 100%)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/org");

    const inputs = page.locator("li input");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    for (let i = 0; i < count; i += 1) {
      const box = await inputs.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth);
    }
  });
});
