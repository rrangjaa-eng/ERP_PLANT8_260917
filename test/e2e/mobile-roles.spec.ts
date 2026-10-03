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

  // 사용자 결정 2026-10-03 14:57 KST 카드 「폰은 읽기만」 — 폰에는 표 안 입력이 없고 계급 이름이 글자로 보인다(옛 「입력이 폭을 넘지 않는다」 단언의 대체).
  test("폰에는 표 안 입력이 없고 계급 이름이 글자로 보인다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles");

    // 편집 요소는 DOM에 있되 폰에서 CSS로 숨는다(첫 렌더부터 — 04.6 W5 D-1) — 의미는 「보이는 입력 0」이다.
    await expect(page.locator("table tbody input").filter({ visible: true })).toHaveCount(0);
    await expect(page.locator("table tbody").getByRole("cell", { name: "대표", exact: true })).toBeVisible();
  });

  // 재현: 「시드 여부」「정렬」「동작」 머리글이 칸이 굶주려 한 글자씩 세로로
  // 꺾였다. Range.getClientRects()가 텍스트 노드가 실제로 몇 줄로 렌더됐는지
  // 알려준다 — CSS 선언이 아니라 렌더 결과로 검사한다.
  test("표 머리글이 한 줄로만 렌더된다(세로 꺾임 없음)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles");

    // 04.6 W1-4 B2·B3 — 폰에서 P2 머리글(시드 여부 · 정렬)은 접혀 안 보인다. 5열 선언은 그대로 두고 보이는 머리글만 줄 수를 잰다.
    expect(await page.locator("th").count()).toBe(5);
    const headers = page.locator("th").filter({ visible: true });
    const count = await headers.count();
    expect(count).toBe(3);
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
