import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// defect 2(wave 5 DOM 감사): 계급 이름을 바꾸는 인라인 입력이 <label>도
// aria-label도 없었다. roles-client.tsx의 RoleRow가
// aria-label={`${role.name} 이름`}을 달게 고쳤다.

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("계급 이름 변경 입력의 접근 가능한 이름 (defect 2)", () => {
  test("각 계급 이름 입력이 <계급 이름> 이름으로 된 고유한 접근 가능한 이름을 가진다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles?new=1");

    const roleName = `E2E계급-${Date.now()}`;
    await page.locator("#role-form").getByLabel("이름").fill(roleName);
    await page.locator("#role-form button[type=submit]").click();

    const renameInput = page.getByLabel(`${roleName} 이름`);
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveValue(roleName);
  });

  test("서로 다른 두 계급의 이름 입력은 서로 다른 접근 가능한 이름을 가진다(행 구분 가능)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles?new=1");

    const roleA = `E2E계급A-${Date.now()}`;
    const roleB = `E2E계급B-${Date.now()}`;
    await page.locator("#role-form").getByLabel("이름").fill(roleA);
    await page.locator("#role-form button[type=submit]").click();
    await expect(page.getByLabel(`${roleA} 이름`)).toBeVisible();

    await page.locator("#role-form").getByLabel("이름").fill(roleB);
    await page.locator("#role-form button[type=submit]").click();
    await expect(page.getByLabel(`${roleB} 이름`)).toBeVisible();

    await expect(page.getByLabel(`${roleA} 이름`)).toHaveCount(1);
    await expect(page.getByLabel(`${roleB} 이름`)).toHaveCount(1);
  });
});

// /review(PR #76) 지적: 계급이 보관되면 listRoles가 그 계급을 빼서 사람 상세의
// 「계급 변경」 칸에 맞는 항목이 없고, 브라우저가 첫 계급을 골라 그 사람의
// 현재 계급처럼 보였다. 칸은 빈 값(「계급 선택」)이어야 한다.
test.describe("보관된 계급을 가진 사람의 상세 화면", () => {
  test("계급 변경 칸이 첫 계급이 아니라 빈 값으로 보인다", async ({ page }) => {
    await loginAs(page);

    const stamp = Date.now();
    const roleName = `E2E보관계급-${stamp}`;
    await page.goto("/admin/people/roles?new=1");
    await page.locator("#role-form").getByLabel("이름").fill(roleName);
    await page.locator("#role-form button[type=submit]").click();
    await expect(page.getByLabel(`${roleName} 이름`)).toBeVisible();

    const personName = `보관계급사람-${stamp}`;
    await page.goto("/admin/people");
    await page.getByRole("link", { name: "사람 등록" }).click();
    await page.getByLabel("이름").fill(personName);
    await page.getByLabel("이메일").fill(`e2e-archived-role-${stamp}@example.test`);
    await page.getByLabel("계급").selectOption({ label: roleName });
    await page.getByRole("button", { name: "사람 등록" }).click();
    await expect(page.getByText(/초기 비밀번호 — /)).toBeVisible();

    // 계급을 보관한다 — 두 단계 삭제.
    await page.goto("/admin/people/roles");
    const roleRow = page.getByRole("row").filter({ has: page.getByLabel(`${roleName} 이름`) });
    await roleRow.getByRole("button", { name: "삭제" }).click();
    await roleRow.getByRole("button", { name: "삭제" }).click();
    // 보관된 계급은 기본 목록에서 빠진다.
    await expect(page.getByLabel(`${roleName} 이름`)).toHaveCount(0);

    await page.goto("/admin/people");
    await page.getByRole("row", { name: new RegExp(personName) }).getByRole("link", { name: "상세" }).click();

    const state = await page.getByLabel("계급 변경").evaluate((el) => (el as HTMLSelectElement).value);
    expect(state).toBe("");
  });
});
