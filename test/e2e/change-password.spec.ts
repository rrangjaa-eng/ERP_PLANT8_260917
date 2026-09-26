import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

test.describe("비밀번호 변경 + 임시 비밀번호 배너 (AUTH-03, D-08, D-09, D-10)", () => {
  test("임시 배너 → 변경 → 재로그인 → 옛 비밀번호 실패 → 새 비밀번호 성공 → 배너 사라짐 → 틀린 현재 비밀번호 → 7자 거부 → 로그아웃", async ({
    page,
  }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // D-08: 임시 비밀번호 배너가 보인다.
    await expect(page.getByText("임시 비밀번호를 쓰고 있습니다")).toBeVisible();

    const newPassword = "new-password-123";
    await page.getByLabel("현재 비밀번호").fill(user.password);
    await page.getByLabel("새 비밀번호").fill(newPassword);
    await page.getByRole("button", { name: "비밀번호 변경" }).click();

    // D-10: 전 세션 만료 → /login으로 안내.
    await expect(page).toHaveURL(/\/login\?reason=password-changed$/);
    await expect(page.getByText("비밀번호가 바뀌었습니다. 다시 로그인하세요.")).toBeVisible();

    // 옛 비밀번호로는 로그인 실패한다.
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).not.toHaveURL(/\/account$/);

    // 새 비밀번호로는 로그인 성공하고 배너가 사라졌다.
    await page.getByLabel("비밀번호").fill(newPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText("임시 비밀번호를 쓰고 있습니다")).toHaveCount(0);

    // 틀린 현재 비밀번호로 변경 시도하면 거부된다.
    await page.getByLabel("현재 비밀번호").fill("wrong-current-password");
    await page.getByLabel("새 비밀번호").fill("another-password-1");
    await page.getByRole("button", { name: "비밀번호 변경" }).click();
    await expect(page.getByText("현재 비밀번호 오류 · 다시 입력", { exact: true })).toBeVisible();

    // 7자 새 비밀번호는 폼 오류로 거부된다(제출 안 됨, 화면은 그대로 /account).
    await page.getByLabel("현재 비밀번호").fill(newPassword);
    await page.getByLabel("새 비밀번호").fill("short12");
    await page.getByRole("button", { name: "비밀번호 변경" }).click();
    await expect(page.getByText("8자 미만 · 8자 이상으로")).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);

    // 로그아웃한다.
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
