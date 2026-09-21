import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";

test.describe("코드표 관리 화면 (MAST-04, ADMN-01, D-36 계약: 화면 코드에 계급 이름 분기 없음)", () => {
  test("시스템 관리자 계급은 코드표 항목을 추가하고 목록에서 확인한다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/code-tables");
    expect(response?.status()).toBe(200);

    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「코드 추가」가 그 폼을 연다.
    await expect(page.getByLabel("값")).toHaveCount(0);
    await page.getByRole("link", { name: "코드 추가" }).click();

    const value = `e2e-${Date.now()}`;
    await page.getByLabel("값").fill(value);
    await page.locator("#code-item-form").getByLabel("이름").fill("E2E 코드");
    await page.getByRole("button", { name: "코드 추가" }).click();

    await expect(page.getByText(value)).toBeVisible();
  });

  test("기획 PM 계급은 코드표 관리 화면에서 404를 받는다 — 권한표가 이 계급에 메뉴를 주지 않았기 때문이다", async ({
    page,
  }) => {
    const pm = await createFixtureUser({ roleId: "role-pm" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/code-tables");
    expect(response?.status()).toBe(404);
  });

  // 사용자 QA 보고: 코드표 선택 링크가 「프로젝트 상태증빙 종류」로 붙어 보인다.
  // .filterRow가 display:flex인데 gap이 없다(code-tables.module.css) — 링크가
  // 하나뿐인 「숨김 포함」 줄에서는 드러나지 않았지만, 코드표 선택 nav는 링크가
  // 둘이라 두 이름이 한 덩어리로 읽힌다.
  test("코드표 선택 링크 둘이 서로 붙어 있지 않다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/code-tables");

    const nav = page.getByRole("navigation", { name: "코드표 선택" });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(2);

    const first = await links.nth(0).boundingBox();
    const second = await links.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // 두 상자 사이의 가로 간격. 붙어 있으면 0이다.
    const gap = second!.x - (first!.x + first!.width);
    expect(gap).toBeGreaterThan(0);
  });
});
