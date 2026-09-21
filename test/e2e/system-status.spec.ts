import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

test.describe("관리자 시스템 상태 화면 (OPS-06, D-17, D-18)", () => {
  test("권한표에 시스템 상태 보기 권한이 없는 계급이 접근하면 404를 받는다", async ({ page }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/system-status");
    expect(response?.status()).toBe(404);
  });

  test("시스템 관리자는 배포 버전·DB 커넥션·마지막 백업을 보고 배너는 없다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/system-status");
    expect(response?.status()).toBe(200);

    await expect(page.getByText("배포 버전")).toBeVisible();
    await expect(page.getByText("DB 커넥션")).toBeVisible();
    await expect(page.getByText("마지막 백업")).toBeVisible();
    // 로컬 개발 환경은 GCP_PROJECT_ID/CLOUD_SQL_INSTANCE_ID가 없어 "확인 불가"다.
    await expect(page.getByText("확인 불가")).toBeVisible();
    // Next.js dev 모드는 라우트 변경 안내용 숨은 role=alert 리전을 자체로 렌더한다
    // (접근성 announcer) — 배너 유무는 main 안에서만 확인한다.
    await expect(page.getByText(/DB 커넥션이 한도의/)).toHaveCount(0);
  });
});
