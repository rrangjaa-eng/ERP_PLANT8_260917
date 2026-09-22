import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 「관리」 한 줄로 접기(2026-09-22, quick/260922-i3k, 사용자 결정 옵션 B) 회귀
// 방지 — PC 사용자 메뉴·「더보기」 시트는 더 이상 관리자 화면 10개의 이름을
// 나열하지 않고 「관리」 한 줄(/admin)만 보여준다. 개별 화면 이름·그룹은
// /admin 인덱스(SYSTEM.md §6-10)가 담당한다. 이 파일은 "클릭만으로 닿는다"를
// 새 두 단계 진입(사용자 메뉴 「관리」 → /admin 인덱스 → 개별 화면)으로 직접
// 증명한다. 시스템 관리자는 seed에서 MENUS × PERMISSION_ACTIONS 전부를
// 받으므로(domain/seed/index.ts) admin.* 10개가 전부 /admin 인덱스에 보여야
// 한다.
async function loginAsSysadmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("PC 사용자 메뉴 → /admin 인덱스로 클릭만으로 관리자 화면에 닿는다 (「관리」 한 줄로 접기)", () => {
  test("사용자 메뉴의 「관리」를 눌러 /admin에 닿고, 거기서 「코드표」를 눌러 /admin/code-tables에 닿는다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);

    await page.getByRole("button", { name: "E2E Admin" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // 주소를 직접 입력하지 않고 메뉴 항목을 눌러서만 이동한다.
    await menu.getByRole("menuitem", { name: "관리" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.getByRole("link", { name: "코드표" }).click();

    await expect(page).toHaveURL(/\/admin\/code-tables$/);
    // 404가 아니라 실제 화면임을 확인한다. 등록 폼의 입력칸으로 판정하지
    // 않는다 — §6-1 재구성으로 폼이 ?new=1 뒤로 들어가 기본 진입에는 없다.
    // 화면 제목과 코드표 선택 nav는 기본 진입에 항상 있다.
    await expect(page.getByRole("heading", { name: "코드표" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "코드표 선택" })).toBeVisible();
  });

  test("PC 사용자 메뉴에는 「관리」 항목만 보이고, 관리자 화면 개별 라벨 10개는 메뉴 안에 하나도 없다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);

    await page.getByRole("button", { name: "E2E Admin" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    await expect(menu.getByRole("menuitem", { name: "관리", exact: true })).toBeVisible();

    const individualLabels = [
      "시스템 상태",
      "코드표",
      "사람",
      "거래처",
      "법인카드 마스터",
      "권한표",
      "정보 노출표",
      "시스템 설정",
      "행동 로그",
      "보관함",
    ];
    for (const label of individualLabels) {
      await expect(menu.getByRole("menuitem", { name: label, exact: true })).toHaveCount(0);
    }

    // admin.settings는 사용자 자신의 「설정」(/settings)과 구분되는 라벨이라
    // 이 메뉴에는 애초에 보이지 않는다.
    await expect(menu.getByRole("menuitem", { name: "설정", exact: true })).toHaveCount(0);
  });

  test("/admin 인덱스에 그룹 머리글 셋(마스터·설정·권한·운영 기록)과 항목 링크 10개가 전부 보인다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "관리", exact: true })).toBeVisible();

    for (const groupLabel of ["마스터", "설정·권한", "운영 기록"]) {
      await expect(page.getByRole("heading", { name: groupLabel })).toBeVisible();
    }

    const itemLabels = [
      "사람",
      "거래처",
      "법인카드 마스터",
      "코드표",
      "권한표",
      "정보 노출표",
      "시스템 설정",
      "시스템 상태",
      "행동 로그",
      "보관함",
    ];
    for (const label of itemLabels) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  // WR-04·WR-05 회귀 방지 — 지금까지 위 세 테스트는 전부 sysadmin(권한표 전 항목
  // 허용)이라 MENUS × can() 필터·groups.length === 0 → notFound()는 한 번도
  // 실행되지 않았다(role-menu.test.ts의 adminIndexGroups 단위 테스트는 이 화면
  // 자체를 렌더하지 않는다). 관리자 메뉴가 0개인 계급(기획 PM, seed에서 admin.*
  // view 권한을 전혀 받지 않는다)으로 실제 화면을 눌러 확인한다.
  test("관리자 메뉴가 0개인 계급(기획 PM)은 사용자 메뉴에 「관리」가 없고 /admin은 404다", async ({
    page,
  }) => {
    const employee = await createFixtureUser({ roleId: "role-pm" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(employee.email);
    await page.getByLabel("비밀번호").fill(employee.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.getByRole("button", { name: "E2E Employee" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "관리", exact: true })).toHaveCount(0);

    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
  });
});
