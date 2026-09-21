import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 2026-09-21 스테이징 QA 회귀 — 폰 375에서도 PC와 같은 메커니즘(검색
// 파라미터 토글)으로 등록 폼을 연다. §6-1 목록 템플릿은 PC·폰이 같은 화면
// 구조를 쓰므로, "폼이 목록을 밀어내지 않는다"·"한 클릭으로 연다"는 폭과
// 무관하게 성립해야 한다(admin-master-list-first.spec.ts의 폰 버전).

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function expectReachableWithoutScrolling(page: Page, linkName: string): Promise<void> {
  const link = page.getByRole("link", { name: linkName });
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeLessThan(viewport!.height);
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBe(0);
}

const screens: { url: string; formLabel: string; actionLabel: string }[] = [
  { url: "/admin/vendors", formLabel: "이름", actionLabel: "거래처 등록" },
  { url: "/admin/code-tables", formLabel: "값", actionLabel: "코드 추가" },
  { url: "/admin/people", formLabel: "이름", actionLabel: "사람 등록" },
  { url: "/admin/corp-cards", formLabel: "발급사", actionLabel: "법인카드 등록" },
];

for (const { url, formLabel, actionLabel } of screens) {
  test.describe(`폰 375 ${url} — 목록이 첫 화면, 등록은 한 클릭 (§6-1)`, () => {
    test(`기본 진입에 폼이 없고, 「${actionLabel}」이 스크롤 없이 닿으며, 누르면 폼이 열린다`, async ({ page }) => {
      await loginAs(page);
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);

      await expect(page.getByLabel(formLabel)).toHaveCount(0);
      await expectReachableWithoutScrolling(page, actionLabel);

      await page.getByRole("link", { name: actionLabel }).click();
      await expect(page).toHaveURL(/[?&]new=1/);
      await expect(page.getByLabel(formLabel)).toBeVisible();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  });
}
