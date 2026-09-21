import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// defect 4(wave 5 DOM 감사, 375px): 사람 목록의 「상세」 링크가 13×42로
// §3 터치 목표(44×44) 미만이었다. people.module.css에 폰 전용 .detailLink를
// 추가해 히트 영역만 44×44로 키웠다(PC는 그대로, 글자 크기·문구 불변).

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("폰 375 /admin/people 「상세」 링크 터치 목표 (defect 4)", () => {
  test("「상세」 링크의 터치 목표가 44×44 이상이다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people");

    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「사람 등록」이 그 폼을 연다.
    await page.getByRole("link", { name: "사람 등록" }).click();

    const newEmail = `e2e-mobile-detail-${Date.now()}@example.test`;
    await page.getByLabel("이름").fill("폰상세대상");
    await page.getByLabel("이메일").fill(newEmail);
    await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await page.getByRole("button", { name: "사람 등록" }).click();
    await expect(page.getByText(`초기 비밀번호 — ${newEmail}`)).toBeVisible();

    await page.goto("/admin/people");
    const detailLink = page.getByRole("link", { name: "상세" }).first();
    const box = await detailLink.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
