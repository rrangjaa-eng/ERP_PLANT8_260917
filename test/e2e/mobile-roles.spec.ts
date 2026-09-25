import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// defect 3(wave 5 DOM 감사, 375px): /admin/people/roles의 scrollWidth(416)가
// clientWidth(375)를 넘었다 — 같은 원인(people.module.css .select에 width
// 없음)이 계급 이름 인라인 입력에도 있었다. 같은 원인이 "시드 여부"「정렬」
// 「동작」 머리글을 한 줄에 한두 글자씩 세로로 꺾이게 만들었다(칸이 굶주려서) —
// width: 100% + 머리글 white-space: nowrap 둘 다로 고쳤다.

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("폰 375 /admin/people/roles 가로 스크롤 금지 · 머리글 한 줄 (defect 3)", () => {
  test("문서 가로 스크롤 폭이 뷰포트 폭을 넘지 않는다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("계급 이름 변경 입력이 컨테이너 폭을 넘지 않는다(width: 100%)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles");

    const inputs = page.locator("table tbody input");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    for (let i = 0; i < count; i += 1) {
      const box = await inputs.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth);
    }
  });

  // 재현: 「시드 여부」「정렬」「동작」 머리글이 칸이 굶주려 한 글자씩 세로로
  // 꺾였다. Range.getClientRects()가 텍스트 노드가 실제로 몇 줄로 렌더됐는지
  // 알려준다 — CSS 선언이 아니라 렌더 결과로 검사한다.
  test("표 머리글이 한 줄로만 렌더된다(세로 꺾임 없음)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles");

    const headers = page.locator("th");
    const count = await headers.count();
    expect(count).toBe(5);
    for (let i = 0; i < count; i += 1) {
      const lineCount = await headers.nth(i).evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length;
      });
      expect(lineCount).toBe(1);
    }
  });
});
