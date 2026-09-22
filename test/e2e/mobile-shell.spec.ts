import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { roleMenu } from "@/ui/shell/role-menu";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// SYSTEM.md §6-0 폰 셸(<700) 계약 — 성공 기준 3(폰 375px)을 자동 검사로 고정한다.
// 이 파일은 playwright.config.ts의 "mobile-*.spec.ts" 파일명 접두어 규칙으로
// mobile-375 프로젝트에서만 돈다 — desktop 프로젝트에서는 등록되지 않는다.
//
// §10의 터치 목표(44×44) 항목은 폰에서만 의미가 있어 여기에 둔다. test/e2e/a11y.spec.ts
// (데스크톱 프로젝트 전용)에는 두지 않는다 — 그 파일이 폰 뷰포트에서 도는 일이
// 없어서 거기 두면 이 §10 항목이 한 번도 판정되지 않는다.

async function loginAsEmployee(page: Page): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
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

    const { accountGroup } = roleMenu({ roleId: DEFAULT_ROLE_ID, allowedMenus: [] });
    // "계정" 그룹 헤더(role="presentation") 다음에 오는 형제 <li>들이 계정 그룹 항목이다.
    const accountItems = sheet.locator('li[role="presentation"] ~ li');
    const texts = await accountItems.allTextContents();
    expect(texts.map((text) => text.trim())).toEqual(accountGroup.map((entry) => entry.label));
  });

  test("로그인 화면에는 하단 탭이 없다", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("navigation", { name: "하단 탭" })).toHaveCount(0);
  });

  // F-04(260922-o2b) — SYSTEM.md §7-8 「시트(폰): 하단에서 올라옴」. 네이티브
  // dialog:modal의 브라우저 기본 inset-block(위아래 0)이 남아 있으면 시트가
  // 위쪽에도 붙는다.
  test("「더보기」 시트가 뷰포트 아래 끝에 붙는다(F-04)", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    await page.getByRole("button", { name: "더보기" }).click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThan(0);
    expect(Math.abs(box!.y + box!.height - 800)).toBeLessThanOrEqual(1);
  });

  // F-05 부분(260922-o2b) — SYSTEM.md §3·§10 폰 44×44 터치 목표.
  test("사용자 메뉴 트리거가 44×44 이상이고 상단 바를 넘치지 않는다(F-05)", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    const trigger = page.locator('header button[aria-haspopup="menu"]');
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(triggerBox!.width).toBeGreaterThanOrEqual(44);
    expect(triggerBox!.height).toBeGreaterThanOrEqual(44);

    const headerBox = await page.locator("header").boundingBox();
    expect(headerBox).not.toBeNull();
    expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height);
  });

  // /design-review 발견 1 — 폰 사용자 메뉴(TopBar 트리거가 여는 메뉴, F-05 트리거
  // 자체는 위에서 이미 44×44를 확인한다)의 항목이 12px/400으로 35px 높이였다.
  // §3·§10 폰 터치 목표 44×44는 트리거뿐 아니라 열리는 항목에도 적용된다.
  test("사용자 메뉴 항목의 터치 목표가 44 이상이고 글자 크기가 --fs-base다", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    await page.locator('header button[aria-haspopup="menu"]').click();
    const items = page.getByRole("menuitem");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    const expectedFontSize = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--fs-base").trim(),
    );

    for (let i = 0; i < count; i += 1) {
      const item = items.nth(i);
      const box = await item.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      const fontSize = await item.evaluate((el) => getComputedStyle(el).fontSize);
      expect(fontSize).toBe(expectedFontSize);
    }
  });

  // /design-review 발견 3 — 「더보기」 시트 그룹 머리글("계정")이 11px(--fs-xs)로
  // 렌더됐다. SYSTEM.md §6-10이 admin-index.module.css .groupLabel에 적용한
  // §7-3 그룹 머리글 행 규칙(--fs-sm)과 같은 값이어야 한다.
  test("더보기 시트 그룹 머리글 글자 크기가 --fs-sm이다(§7-3 그룹 머리글 행)", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/");

    await page.getByRole("button", { name: "더보기" }).click();
    const sheet = page.getByRole("dialog", { name: "더보기" });
    await expect(sheet).toBeVisible();

    const groupHeader = sheet.locator('li[role="presentation"]').first();
    await expect(groupHeader).toHaveText("계정");

    const expectedFontSize = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--fs-sm").trim(),
    );
    const fontSize = await groupHeader.evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe(expectedFontSize);
  });

  // /design-review 발견 4 — SYSTEM.md §6-7 로그인 화면 실물 스케치는 제출 버튼이
  // 폼 가운데 온다. 폰 375에서도 같은 계약이다(셸 없는 화면이라 폰·PC 공통 틀).
  test("로그인 버튼이 폼 안에서 가운데 정렬된다(§6-7)", async ({ page }) => {
    await page.goto("/login");

    const form = page.locator("form");
    const button = page.getByRole("button", { name: "로그인" });
    const formBox = await form.boundingBox();
    const buttonBox = await button.boundingBox();
    expect(formBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();

    const formCenterX = formBox!.x + formBox!.width / 2;
    const buttonCenterX = buttonBox!.x + buttonBox!.width / 2;
    expect(Math.abs(formCenterX - buttonCenterX)).toBeLessThanOrEqual(1);
  });
});
