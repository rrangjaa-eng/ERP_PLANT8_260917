import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// defect 2(wave 5 DOM 감사): 본부·팀 이름을 바꾸는 인라인 입력이 <label>도
// aria-label도 없어 스크린리더 사용자가 이게 어느 행의 이름 칸인지 알 수
// 없었다. org-client.tsx의 RenameInput이 aria-label={`${이름} 이름`}을
// 달게 고쳤다 — 이 스펙은 그게 실제로 렌더되고, 어느 행인지 식별 가능한지
// 화면에서 검증한다.

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("본부·팀 이름 변경 입력의 접근 가능한 이름 (defect 2)", () => {
  test("각 본부 이름 입력이 <본부 이름> 이름으로 된 고유한 접근 가능한 이름을 가진다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/org?new=org");

    const orgUnitName = `E2E본부-${Date.now()}`;
    await page.locator("#org-unit-form").getByLabel("이름").fill(orgUnitName);
    await page.locator("#org-unit-form button[type=submit]").click();

    const renameInput = page.getByLabel(`${orgUnitName} 이름`);
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveValue(orgUnitName);
  });

  test("각 팀 이름 입력이 <팀 이름> 이름으로 된 고유한 접근 가능한 이름을 가진다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/org?new=team");

    // 시드 데이터의 본부 하나를 골라 그 아래 팀을 만든다.
    const teamName = `E2E팀-${Date.now()}`;
    await page.locator("#team-form select[name=orgUnitId]").selectOption({ label: "기획본부" });
    await page.locator("#team-form").getByLabel("이름").fill(teamName);
    await page.locator("#team-form button[type=submit]").click();

    const renameInput = page.getByLabel(`${teamName} 이름`);
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveValue(teamName);
  });

  test("서로 다른 두 행의 이름 입력은 서로 다른 접근 가능한 이름을 가진다(행 구분 가능)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/org?new=org");

    const orgA = `E2E본부A-${Date.now()}`;
    const orgB = `E2E본부B-${Date.now()}`;
    await page.locator("#org-unit-form").getByLabel("이름").fill(orgA);
    await page.locator("#org-unit-form button[type=submit]").click();
    await expect(page.getByLabel(`${orgA} 이름`)).toBeVisible();

    await page.locator("#org-unit-form").getByLabel("이름").fill(orgB);
    await page.locator("#org-unit-form button[type=submit]").click();
    await expect(page.getByLabel(`${orgB} 이름`)).toBeVisible();

    // 같은 라벨을 공유하지 않는다 — getByLabel이 서로 다른 요소를 정확히 하나씩 찾는다.
    await expect(page.getByLabel(`${orgA} 이름`)).toHaveCount(1);
    await expect(page.getByLabel(`${orgB} 이름`)).toHaveCount(1);
  });
});
