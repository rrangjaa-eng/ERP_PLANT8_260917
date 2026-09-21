import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// WR-06(02-REVIEW.md) — 로그아웃 세 경로가 실패를 삼킨다.
// 상단 바·「더보기」 시트는 호출 *전에* 표면을 닫아서 실패 시 아무 반응이 없다:
// 사용자는 로그아웃됐다고 믿지만 세션은 살아 있다. 내 계정 화면 버튼은
// pending이 영구히 걸려 다시 시도할 수 없다.
//
// 네트워크 단에서 sign-out을 끊어 그 상황을 실제로 만든다.
const FAIL_MESSAGE = "로그아웃하지 못했습니다";

// 「로그아웃」 이름의 버튼은 본문과 닫힌 「더보기」 시트 둘 다에 있다 — 본문 것으로 좁힌다.
function accountLogout(page: Page) {
  return page.getByRole("main").getByRole("button", { name: "로그아웃" });
}

async function login(page: Page): Promise<string> {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return "E2E Employee";
}

async function breakSignOut(page: Page): Promise<void> {
  await page.route("**/api/auth/sign-out", (route) => route.abort("failed"));
}

test.describe("로그아웃 실패 처리 (WR-06)", () => {
  test("내 계정 화면: 실패하면 문구가 뜨고 버튼이 다시 눌린다", async ({ page }) => {
    await login(page);
    await breakSignOut(page);

    await accountLogout(page).click();

    await expect(page.getByText(FAIL_MESSAGE)).toBeVisible();
    // 로그아웃되지 않았으므로 화면에 남아 있다.
    await expect(page).toHaveURL(/\/account$/);
    // pending이 풀려 다시 시도할 수 있다 — 영구히 잠기지 않는다.
    await expect(accountLogout(page)).toBeEnabled();
  });

  test("실패 문구는 role=alert다 — 스크린 리더가 즉시 읽는다", async ({ page }) => {
    await login(page);
    await breakSignOut(page);

    await accountLogout(page).click();

    await expect(page.getByRole("alert").filter({ hasText: FAIL_MESSAGE })).toBeVisible();
  });

  test("상단 바 사용자 메뉴: 실패하면 메뉴가 열린 채 문구가 뜬다", async ({ page }) => {
    const userName = await login(page);
    await breakSignOut(page);

    await page.getByRole("button", { name: userName }).click();
    await page.getByRole("menu").getByRole("menuitem", { name: "로그아웃" }).click();

    await expect(page.getByText(FAIL_MESSAGE)).toBeVisible();
    // 실패했으므로 메뉴를 닫지 않는다 — 닫아 버리면 사용자가 실패를 못 본다.
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("실패 뒤 성공하면 로그인 화면으로 간다 — 되돌릴 수 있는 상태다", async ({ page }) => {
    await login(page);
    await breakSignOut(page);

    await accountLogout(page).click();
    await expect(page.getByText(FAIL_MESSAGE)).toBeVisible();

    await page.unroute("**/api/auth/sign-out");
    await accountLogout(page).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
