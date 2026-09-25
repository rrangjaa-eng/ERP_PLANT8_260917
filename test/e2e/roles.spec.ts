import { test, expect, type Page, type Locator } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID, createRole } from "@/domain/permissions/roles";
import { archive } from "@/domain/archive";
import { SYSTEM_VIEWER } from "@/domain/viewer";

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

// 04-27(D11·D20): 계급 표의 「업무 범위」 칸. 시드 계급의 값은 읽기만 한다 —
// 다른 워커의 상태 전환·기간 수정 스펙이 그 값을 읽는다(엔지 리뷰 A 공백 7).
// 바꾸는 것은 이 스펙이 beforeAll에서 만든 임시 계급뿐이다.
function selectedLabel(select: Locator): Locator {
  return select.locator("option:checked");
}

test.describe("계급 업무 범위 칸 (04-27 · D11·D20)", () => {
  const tempRoleName = `E2E 업무범위 ${Date.now()}`;
  let tempRoleId = "";

  test.beforeAll(async () => {
    const role = await createRole(SYSTEM_VIEWER, { name: tempRoleName });
    tempRoleId = role.id;
  });

  test.afterAll(async () => {
    if (tempRoleId) await archive(SYSTEM_VIEWER, "roles", tempRoleId);
  });

  test("시드 값을 보여 주고, 임시 계급을 전사로 바꾸면 새로 고쳐도 남고 되돌릴 수 있다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles");

    await expect(selectedLabel(page.getByLabel("팀장 업무 범위"))).toHaveText("자기 팀");
    await expect(selectedLabel(page.getByLabel("대표 업무 범위"))).toHaveText("전사");

    const tempScope = page.getByLabel(`${tempRoleName} 업무 범위`);
    await expect(selectedLabel(tempScope)).toHaveText("자기 팀");

    const savedToCompany = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/admin/people/roles"),
    );
    await tempScope.selectOption({ label: "전사" });
    await savedToCompany;

    await page.reload();
    await expect(selectedLabel(page.getByLabel(`${tempRoleName} 업무 범위`))).toHaveText("전사");

    const savedToTeam = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/admin/people/roles"),
    );
    await page.getByLabel(`${tempRoleName} 업무 범위`).selectOption({ label: "자기 팀" });
    await savedToTeam;

    await page.reload();
    await expect(selectedLabel(page.getByLabel(`${tempRoleName} 업무 범위`))).toHaveText("자기 팀");
  });
});
