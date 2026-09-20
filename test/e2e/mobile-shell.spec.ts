import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { roleMenu } from "@/ui/shell/role-menu";

// SYSTEM.md §6-0 폰 셸(<700) 계약 — 성공 기준 3(폰 375px)을 자동 검사로 고정한다.
// 이 파일은 playwright.config.ts의 "mobile-*.spec.ts" 파일명 접두어 규칙으로
// mobile-375 프로젝트에서만 돈다 — desktop 프로젝트에서는 등록되지 않는다.
//
// §10의 터치 목표(44×44) 항목은 폰에서만 의미가 있어 여기에 둔다. test/e2e/a11y.spec.ts
// (데스크톱 프로젝트 전용)에는 두지 않는다 — 그 파일이 폰 뷰포트에서 도는 일이
// 없어서 거기 두면 이 §10 항목이 한 번도 판정되지 않는다.

async function loginAsEmployee(page: Page): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ isAdmin: false });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return user;
}

test.describe("폰 375 공통 셸 (성공 기준 3 · §6-0 폰 전략 · §10 터치 목표)", () => {
  test("하단 탭이 보이고 항목이 4개이며 마지막이 「더보기」다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    const tabs = page.getByRole("navigation", { name: "하단 탭" });
    await expect(tabs).toBeVisible();

    const items = tabs.locator("a, button");
    await expect(items).toHaveCount(4);
    await expect(items.last()).toHaveText("더보기");
  });

  test("상단 바의 1차 메뉴가 보이지 않는다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeHidden();
  });

  test("문서 가로 스크롤 폭이 뷰포트 폭을 넘지 않는다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("「더보기」를 열면 시트가 뜨고 첫 행동 요소에 포커스가 있다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    await page.getByRole("button", { name: "더보기" }).click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    // 검색 행은 비활성 <span>이라 첫 실제 행동 요소는 목록의 첫 <a>/<button>이다
    // (MoreSheet.tsx가 firstItemRef를 그 요소에만 건다).
    const firstActionable = sheet.locator("ul li a, ul li button").first();
    await expect(firstActionable).toBeFocused();
  });

  test("Esc로 시트가 닫히고 포커스가 열었던 요소로 돌아온다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "더보기" });
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  // §10 터치 목표 44×44 — 렌더된 실제 경계 상자로 잰다(CSS 선언을 읽지 않는다).
  test("하단 탭 항목의 터치 목표가 44 이상이다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    const items = page.getByRole("navigation", { name: "하단 탭" }).locator("a, button");
    const count = await items.count();
    expect(count).toBe(4);
    for (let i = 0; i < count; i += 1) {
      const box = await items.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  // 2026-09-20 staging QA 회귀: 검색 행에 "이 페이즈는 자리만 둔다"라는 계획 용어가
  // 노출돼 있었다. §7-8이 이 자리에 요구하는 것은 대상 목록(범위 표시)이고,
  // §8 규칙 5가 안내 문구 자체를 금지한다. 소스 단언은
  // test/unit/ui/system-md-compliance.test.ts가 맡고, 여기서는 실제로 그렇게
  // 렌더되는지를 본다.
  test("검색 행에 대상 목록이 보이고 안내 문구가 없다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    await page.getByRole("button", { name: "더보기" }).click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    const searchRow = sheet.locator("ul > li").first();
    await expect(searchRow).toContainText("검색");
    for (const scope of ["프로젝트", "지출결의", "거래처"]) {
      await expect(searchRow).toContainText(scope);
    }
    await expect(searchRow).not.toContainText("페이즈");
  });

  test("더보기 시트 항목의 터치 목표가 44 이상이다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    await page.getByRole("button", { name: "더보기" }).click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    // 직계 자식만 잡는다 — 검색 행(span.searchRow) 안의 부제 span(.reason)까지
    // 잡으면 그 문구 크기(터치 목표가 아니다)가 44 미만이라 잘못된 실패를 만든다.
    const rows = sheet.locator("ul > li > a, ul > li > button, ul > li > span");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const box = await rows.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  // 항목 이름을 스펙에 박지 않는다 — ui/shell/role-menu.ts가 내보내는 accountGroup을
  // 읽어 대조한다. 02-01 체크포인트 H가 나중에 바뀌어 「설정」이 빠져도 이 테스트는
  // 고칠 필요가 없다.
  test("시트 안 계정 그룹 항목이 role-menu.ts의 accountGroup과 같다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    await page.getByRole("button", { name: "더보기" }).click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    const { accountGroup } = roleMenu({ isAdmin: false });
    // "계정" 그룹 헤더(role="presentation") 다음에 오는 형제 <li>들이 계정 그룹 항목이다.
    const accountItems = sheet.locator('li[role="presentation"] ~ li');
    const texts = await accountItems.allTextContents();
    expect(texts.map((text) => text.trim())).toEqual(accountGroup.map((entry) => entry.label));
  });

  test("로그인 화면에는 하단 탭이 없다", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("navigation", { name: "하단 탭" })).toHaveCount(0);
  });
});
