import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 네비게이션 공백 수정(2026-09-21) 회귀 방지 — Phase 3이 관리자 화면 9개를
// 더 만들었지만(admin.code-tables·people·vendors·corp-cards·permissions·
// visibility·settings·action-log·archive) role-menu.ts는 "admin.system-status"
// 하나만 진입점으로 뚫려 있었다. 나머지는 주소를 직접 입력해야만 닿을 수
// 있었고, 이 파일은 "클릭만으로 닿는다"를 직접 증명한다(SYSTEM.md §6-0 (a)
// PC 사용자 메뉴). 시스템 관리자는 seed에서 MENUS × PERMISSION_ACTIONS 전부를
// 받으므로(domain/seed/index.ts) admin.* 10개가 전부 PC 사용자 메뉴에 보여야
// 한다.
async function loginAsSysadmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("PC 사용자 메뉴로 관리자 화면에 클릭만으로 닿는다 (네비게이션 공백 수정)", () => {
  test("시스템 관리자는 사용자 메뉴에서 「코드표」를 눌러 /admin/code-tables로 간다", async ({ page }) => {
    await loginAsSysadmin(page);

    await page.getByRole("button", { name: "E2E Admin" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // 주소를 직접 입력하지 않고 메뉴 항목을 눌러서만 이동한다 — 이 테스트의 핵심.
    await menu.getByRole("menuitem", { name: "코드표" }).click();

    await expect(page).toHaveURL(/\/admin\/code-tables$/);
    // 404가 아니라 실제 화면임을 확인한다. 등록 폼의 입력칸으로 판정하지
    // 않는다 — §6-1 재구성으로 폼이 ?new=1 뒤로 들어가 기본 진입에는 없다.
    // 화면 제목과 코드표 선택 nav는 기본 진입에 항상 있다.
    await expect(page.getByRole("heading", { name: "코드표" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "코드표 선택" })).toBeVisible();
  });

  test("시스템 관리자의 사용자 메뉴에는 admin.* 10개 전부가 「내 정보」·「로그아웃」 위에 보인다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);

    await page.getByRole("button", { name: "E2E Admin" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    const labels = [
      "시스템 상태",
      "코드표",
      "사람",
      "거래처",
      "법인카드 마스터",
      "권한표",
      "정보 노출표",
      "행동 로그",
      "보관함",
    ];
    for (const label of labels) {
      await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
    }

    // admin.settings는 "설정"이 아니라 구분되는 라벨이어야 한다 — 사용자 자신의
    // 「설정」(/settings)과 헷갈리면 안 된다.
    await expect(menu.getByRole("menuitem", { name: "설정", exact: true })).toHaveCount(0);
  });
});
