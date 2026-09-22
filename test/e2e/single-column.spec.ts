import { test, expect, type Page, type Locator } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// F-02(260922-o2b) — SYSTEM.md §3 「단일 기둥 최대 폭」의 DOM 회귀. desktop
// 프로젝트 전용(1280 뷰포트 기본값). 태스크 2가 관리자 화면·폼 케이스를 더한다.

async function loginAs(page: Page, roleId: string): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ roleId });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return user;
}

// 뷰포트 폭 1280 전제로 폭 ≤ 720(그리고 > 0), x가 main h1의 x와 1px 안에서
// 같음(왼쪽 정렬)을 확인한다. 태스크 2가 관리자 화면·폼 케이스에 재사용한다.
async function expectSingleColumn(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.width).toBeLessThanOrEqual(720);

  const h1Box = await page.locator("main h1").first().boundingBox();
  expect(h1Box).not.toBeNull();
  expect(Math.abs(box!.x - h1Box!.x)).toBeLessThanOrEqual(1);
}

test.describe("단일 기둥 최대 폭 — /account (F-02 트레이서)", () => {
  test("1280에서 비밀번호 변경 폼이 720px 이하로 main h1과 같은 x에서 시작한다", async ({ page }) => {
    expect(page.viewportSize()?.width).toBe(1280);

    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/account");

    const currentPasswordInput = page.getByLabel("현재 비밀번호");
    const form = page.locator("form", { has: currentPasswordInput });

    await expectSingleColumn(page, form);

    const inputBox = await currentPasswordInput.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(inputBox!.width).toBeLessThanOrEqual(720);
  });
});

async function expectAllSingleColumn(page: Page, selector: string): Promise<void> {
  const locators = await page.locator(selector).all();
  expect(locators.length).toBeGreaterThan(0);
  for (const locator of locators) {
    await expectSingleColumn(page, locator);
  }
}

test.describe("단일 기둥 최대 폭 — 관리자 화면·폼 전면 적용 (F-02)", () => {
  test("/admin의 main ul 전부가 720px 이하로 main h1과 같은 x에서 시작한다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin");
    await expectAllSingleColumn(page, "main ul");
  });

  test("/admin/settings의 main section 전부가 720px 이하로 main h1과 같은 x에서 시작한다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/settings");
    await expectAllSingleColumn(page, "main section");
  });

  test("/admin/system-status의 main dl이 720px 이하로 main h1과 같은 x에서 시작한다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/system-status");
    await expectSingleColumn(page, page.locator("main dl"));
  });

  test("사람 상세의 main dl과 #person-role-change가 720px 이하로 main h1과 같은 x에서 시작한다", async ({
    page,
  }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/people");
    await page.getByRole("link", { name: "상세" }).first().click();
    await expect(page).toHaveURL(/\/admin\/people\/.+/);
    await expectSingleColumn(page, page.locator("main dl"));
    await expectSingleColumn(page, page.locator("#person-role-change"));
  });

  test("/admin/people/org의 최상위 main ul과 #org-unit-form이 720px 이하로 main h1과 같은 x에서 시작한다", async ({
    page,
  }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/people/org");
    // 본부 목록 <ul>의 각 <li> 안에 팀 목록 <ul>이 중첩된다(계층 목록,
    // SYSTEM.md §3) — 그 중첩 ul은 의도적으로 들여쓰기된다(브라우저 기본
    // list padding). 최상위 목록(.single-column의 직계 자식)만 본다.
    await expectAllSingleColumn(page, "main .single-column > ul");
    await page.getByRole("link", { name: "본부 추가" }).first().click();
    await expectSingleColumn(page, page.locator("#org-unit-form"));
  });

  const registrationForms: Array<{ listPath: string; linkName: string; formSelector: string }> = [
    { listPath: "/admin/vendors", linkName: "거래처 등록", formSelector: "#vendor-form" },
    { listPath: "/admin/corp-cards", linkName: "법인카드 등록", formSelector: "#corp-card-form" },
    { listPath: "/admin/code-tables", linkName: "코드 추가", formSelector: "#code-item-form" },
    { listPath: "/admin/people", linkName: "사람 등록", formSelector: "#person-form" },
  ];

  for (const { listPath, linkName, formSelector } of registrationForms) {
    test(`${formSelector}가 720px 이하로 main h1과 같은 x에서 시작한다`, async ({ page }) => {
      await loginAs(page, SYSADMIN_ROLE_ID);
      await page.goto(listPath);
      await page.getByRole("link", { name: linkName }).first().click();
      await expectSingleColumn(page, page.locator(formSelector));
    });
  }

  test("#role-form이 720px 이하로 main h1과 같은 x에서 시작한다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/people/roles?new=1");
    await expectSingleColumn(page, page.locator("#role-form"));
  });

  test("반례 — /admin/code-tables 목록의 main table은 720px보다 넓다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/code-tables");
    const table = page.locator("main table");
    const box = await table.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(720);
  });
});
