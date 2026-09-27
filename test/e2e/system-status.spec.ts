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
    // 04.2-13 (18A · D-711): 알림 발송·이메일 두 줄. E2E 환경에는 SMTP 값이 없다.
    // 이메일 값은 「미설정」으로 시작만 단언한다 — 같은 DB를 쓰는 holidays.spec.ts의
    // B2 준비가 결과 꼬리를 붙일 수 있다(꼬리 정확 일치는 holidays.spec.ts).
    const notifyValue = page.locator("dt", { hasText: /^알림 발송$/ }).locator("xpath=following-sibling::dd[1]");
    await expect(notifyValue).toHaveText(
      /^(기록 없음 — 첫 알림 발송 전|\d{4}-\d{2}-\d{2} \d{2}:\d{2} · (알림 \d+건 · 중복 건너뜀 \d+건 · 남음 \d+건|비영업일 · 보내지 않음))$/,
    );
    const emailValue = page.locator("dt", { hasText: /^이메일$/ }).locator("xpath=following-sibling::dd[1]");
    await expect(emailValue).toHaveText(/^미설정/);
    // Next.js dev 모드는 라우트 변경 안내용 숨은 role=alert 리전을 자체로 렌더한다
    // (접근성 announcer) — 배너 유무는 main 안에서만 확인한다. 04.2-13: 다른 파일의
    // B2 준비와 겹쳐도 깨지지 않게 DB 커넥션 배너 문구만 없다고 단언한다.
    await expect(page.getByText(/DB 커넥션이 한도의/)).toHaveCount(0);
  });
});
