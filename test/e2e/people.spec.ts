import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// MAST-02: 사람 등록 화면에서 이름·이메일·계급·팀·발령일을 채워 등록하면 같은
// 화면에서 계정과 초기 비밀번호가 함께 발급되고, 그 계정으로 실제 로그인이
// 되는 것이 「같은 화면에서 발급한다」의 진짜 증명이다.
test.describe("사람 등록 → 계정·초기 비밀번호 발급 → 로그인 (MAST-02)", () => {
  test("시스템 관리자가 사람을 등록하면 초기 비밀번호가 보이고 그 계정으로 실제 로그인이 된다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/people");
    expect(response?.status()).toBe(200);

    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「사람 등록」이 그 폼을 연다.
    await expect(page.getByLabel("이름")).toHaveCount(0);
    await page.getByRole("link", { name: "사람 등록" }).click();

    const newEmail = `e2e-person-${Date.now()}@example.test`;
    await page.getByLabel("이름").fill("이영희");
    await page.getByLabel("이메일").fill(newEmail);
    await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await page.getByLabel("팀").selectOption({ label: "기획본부 · 기획1팀" });
    await page.getByLabel("발령일").fill("2026-01-01");
    await page.getByRole("button", { name: "사람 등록" }).click();

    await expect(page.getByText(`초기 비밀번호 — ${newEmail}`)).toBeVisible();
    await expect(page.getByText("이 비밀번호는 다시 볼 수 없습니다 · 지금 전달하세요")).toBeVisible();

    const tempPasswordText = await page.getByText(/^[A-Za-z0-9_-]{10,}$/).first().textContent();
    expect(tempPasswordText).toBeTruthy();
    const tempPassword = tempPasswordText!.trim();

    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("이메일").fill(newEmail);
    await page.getByLabel("비밀번호").fill(tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(newEmail)).toBeVisible();
  });

  test("기본 계급(기획 PM)으로는 사람 화면이 404다", async ({ page }) => {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/people");
    expect(response?.status()).toBe(404);
  });
});
