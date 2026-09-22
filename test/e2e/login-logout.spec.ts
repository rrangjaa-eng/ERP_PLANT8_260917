import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

test.describe("로그인 → 세션 영속 → 로그아웃 (AUTH-02, D-07)", () => {
  test("픽스처 계정으로 로그인하면 /account로 이동하고 이메일이 보인다", async ({ page }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("저장한 브라우저 상태로 새 컨텍스트를 열어도 세션이 유지되고 쿠키가 30일 sliding이다", async ({
    page,
    browser,
  }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const storageState = await page.context().storageState();
    const newContext = await browser.newContext({ storageState });
    const newPage = await newContext.newPage();
    await newPage.goto("/account");
    await expect(newPage).toHaveURL(/\/account$/);
    await expect(newPage.getByText(user.email)).toBeVisible();

    // 쿠키 erp.session_token의 만료일이 현재+29일 이후(30일 sliding, D-07)
    const cookies = await newContext.cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === "erp.session_token");
    expect(sessionCookie).toBeDefined();
    const minExpiry = Date.now() / 1000 + 29 * 24 * 60 * 60;
    expect(sessionCookie?.expires ?? 0).toBeGreaterThan(minExpiry);

    await newContext.close();
  });

  test("로그아웃하면 /login으로 가고 /account 재접근은 /login으로 리다이렉트된다 (D-10)", async ({
    page,
  }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/account");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("로그인 버튼 위치 (/design-review 발견 4)", () => {
  // SYSTEM.md §6-7 로그인 화면 실물 스케치는 제출 버튼이 폼 가운데 온다.
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
