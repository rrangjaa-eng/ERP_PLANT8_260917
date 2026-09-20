import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { insertRole } from "@/repositories/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// ADMN-01, D-40, 성공 기준 2: 권한표 셀을 켜면 저장 버튼 없이 즉시 저장되고
// 다른 계급의 실제 접근이 바뀐다는 end-to-end 증명.
test.describe("권한표 격자 (ADMN-01, D-40, 성공 기준 2)", () => {
  test("셀을 켜면 저장 버튼 없이 즉시 저장되고, 그 계급이 실제로 코드표 화면에 들어갈 수 있게 된다", async ({
    page,
    browser,
  }) => {
    // E2E는 전역 setup에서 한 번만 시드되고 스펙 파일 사이에 DB 상태를
    // 초기화하지 않는다(통합 테스트와 다름) — 다른 스펙 파일과 병렬 워커로
    // 같은 DB를 공유하므로, 기존 계급(role-pm)의 권한을 여기서 바꾸면
    // code-tables.spec.ts의 "기획 PM은 404" 가정이 실행 순서·타이밍에 따라
    // 깨진다. 이 테스트 전용 임시 계급을 만들어 완전히 격리한다.
    const tempRoleId = `role-e2e-perm-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: tempRoleId, name: "E2E 임시 계급", sortOrder: 99 });

    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/permissions");
    expect(response?.status()).toBe(200);

    const cell = page.getByRole("checkbox", { name: "E2E 임시 계급 · 코드표 · 보기" });
    await expect(cell).not.toBeChecked();

    // 「일괄 저장」 버튼이 없다 — 셀 하나가 곧 저장이다(성공 기준 2).
    await expect(page.getByRole("button", { name: /일괄 저장/ })).toHaveCount(0);

    await cell.check();
    // 저장 버튼을 누르지 않고 상태가 켜진 것을 확인한다 — 클릭 자체가 저장이다.
    await expect(cell).toBeChecked();

    // 같은 브라우저 컨텍스트를 버리고 방금 켠 계급의 픽스처로 로그인한다.
    const tempUser = await createFixtureUser({ roleId: tempRoleId });
    const tempContext = await browser.newContext();
    const tempPage = await tempContext.newPage();
    await tempPage.goto("/login");
    await tempPage.getByLabel("이메일").fill(tempUser.email);
    await tempPage.getByLabel("비밀번호").fill(tempUser.password);
    await tempPage.getByRole("button", { name: "로그인" }).click();
    await expect(tempPage).toHaveURL(/\/account$/);

    const tempResponse = await tempPage.goto("/admin/code-tables");
    expect(tempResponse?.status()).toBe(200);

    await tempContext.close();
  });

  test("권한 없는 계급은 권한표 화면 자체에서 404를 받는다", async ({ page }) => {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/permissions");
    expect(response?.status()).toBe(404);
  });

  test("셀 체크박스의 접근성 라벨이 좌표 세 조각(계급·메뉴·동작)을 담는다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/permissions");

    await expect(page.getByRole("checkbox", { name: "시스템 관리자 · 코드표 · 보기" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "시스템 관리자 · 코드표 · 쓰기" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "시스템 관리자 · 코드표 · 승인" })).toBeVisible();
  });
});
