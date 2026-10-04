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

// 묶음 ④ /review R2 — 같은 브라우저의 다음 사용자가 앞 사용자의 저장 안 한 편집을 복원 줄로 보지 않게, 로그아웃이
// 미저장 편집 보관본(quote-ledger:dirty*)을 전부 지운다. 다른 키는 남긴다.
test("로그아웃하면 이 브라우저의 미저장 편집 보관본이 모두 지워진다", async ({ page }) => {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.evaluate(() => {
    window.localStorage.setItem("quote-ledger:dirty:someone:reserves:ledger", JSON.stringify({ "row-1:note": "앞 사용자 메모" }));
    window.localStorage.setItem("quote-ledger:dirty:project-1:revision-1", JSON.stringify({ "line-1:itemName": "옛 형식" }));
    window.localStorage.setItem("other-app:setting", "keep");
  });

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login$/);

  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys.filter((key) => key.startsWith("quote-ledger:dirty"))).toEqual([]);
  expect(keys).toContain("other-app:setting");
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

  // SYSTEM.md §7-1 · §2-2 — 내부 1차 버튼은 PC 32 · 폰 40, 글자 --text-body(PC 14 · 폰 15 — 계산된 역할 토큰 값).
  test("로그인 1차 버튼은 PC 1280에서 높이 32 · 폰 375에서 높이 40, 글자는 --text-body(04.3-03 F1 · 04.3-15 R3)", async ({
    page,
  }) => {
    const button = page.getByRole("button", { name: "로그인" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");
    await expect(button).toHaveCSS("height", "32px");
    const bodySize = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-body").trim());
    await expect(button).toHaveCSS("font-size", await bodySize());
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(button).toHaveCSS("height", "40px");
    await expect(button).toHaveCSS("font-size", await bodySize());
  });
});

// Q18(#88) — 개인정보 화면에서 끊겨 온 로그인은 같은 자리에 상태 한 줄(문구 그대로)을 보이고, 그 밖에는 상태 줄이 없다.
test("/login?reason=privacy-session은 「개인정보 화면 · 다시 로그인」 상태 줄을 보이고 reason이 없으면 상태 줄이 없다", async ({ page }) => {
  await page.goto("/login?reason=privacy-session");
  await expect(page.getByRole("status").filter({ hasText: "개인정보 화면 · 다시 로그인" })).toBeVisible();

  await page.goto("/login");
  await expect(page.getByRole("status")).toHaveCount(0);
});
