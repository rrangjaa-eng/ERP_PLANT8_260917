import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// defect 2(wave 6 DOM 감사, 375px): ui/button/Button.module.css의 .tertiary가
// height: auto + padding: 0라 §3 터치 목표(44×44)를 무시하고 텍스트 줄
// 높이(20px 안팎)로 찌그러진다. 거래처 화면의 「번호 보기」·「숨기기」가
// 실측 43×20 · 30×20이었다 — 공유 Button 컴포넌트를 고쳐 모든 화면의 3차
// 버튼에 한 번에 적용한다(PC는 --control-h 그대로, 폰만 min-width/min-height).
test.describe("폰 375 /admin/vendors 3차 버튼 터치 목표 (defect 2)", () => {
  test("「번호 보기」·「숨기기」 버튼의 터치 목표가 44×44 이상이다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/vendors");
    const vendorName = `폰E2E거래처-${Date.now()}`;
    await page.getByLabel("이름").fill(vendorName);
    await page.getByLabel("사업자 번호").fill("123-45-67890");
    await page.getByLabel("계좌 은행").fill("국민은행");
    await page.getByLabel("예금주").fill("홍길동");
    await page.getByLabel("계좌번호").fill("110-222-334455");
    await page.getByRole("button", { name: "거래처 등록" }).click();
    await expect(page.getByText(vendorName)).toBeVisible();

    const row = page.locator("tr", { hasText: vendorName });

    const revealButton = row.getByRole("button", { name: "번호 보기" });
    const revealBox = await revealButton.boundingBox();
    expect(revealBox).not.toBeNull();
    expect(revealBox!.width).toBeGreaterThanOrEqual(44);
    expect(revealBox!.height).toBeGreaterThanOrEqual(44);

    const hideButton = row.getByRole("button", { name: "숨기기" });
    const hideBox = await hideButton.boundingBox();
    expect(hideBox).not.toBeNull();
    expect(hideBox!.width).toBeGreaterThanOrEqual(44);
    expect(hideBox!.height).toBeGreaterThanOrEqual(44);
  });
});
