import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// Phase 4 Task 3 ⑤ — 매출 섹션 E2E: 계약 금액(PM 쓰기) → 부가세·합계
// 서버 계산 확인 → 발행·입금 줄(경영관리 쓰기) → 입금 셀 둘째 줄 공급가액 +
// 합계 행 미수 표시 확인 → 기획 PM에게는 두 표가 DOM에 없음(부재, 숨김이
// 아니다). "경영관리"는 SEED_ROLES 5종에 없어 role-ceo에 이 스펙이
// 직접 권한을 부여한다(D-57, domain/permissions/menus.ts 04-02 주석과 같은
// 결 — 계획의 예시 흐름과 달리 계약 금액은 경영관리가 아니라 PM이 적는다,
// 실제 구현된 쓰기 주체 분리를 따른다).
async function grantFinanceRole() {
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects.revenue", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.issued_amount", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.paid_amount", visible: true });
}

test.describe("매출 섹션 (Phase 4 Task 3)", () => {
  test("계약 금액(PM) → 발행·입금(경영관리) → 미수 표시 → PM에게는 두 표 부재", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E매출클라이언트-${Date.now()}`,
      normalizedName: `e2e매출클라이언트-${Date.now()}`,
    });
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await grantFinanceRole();
    const finance = await createFixtureUser({ roleId: "role-ceo" });

    // PM: 프로젝트 등록 + 계약 금액 입력
    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/projects?new=1");
    await page.getByLabel("클라이언트").selectOption({ label: vendor.name });
    await page.getByLabel("팀").selectOption({ index: 1 });
    await page.getByLabel("담당 PM").selectOption({ index: 1 });
    const projectName = `E2E수익섹션-${Date.now()}`;
    await page.getByLabel("프로젝트명").fill(projectName);
    await page.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    const projectUrl = page.url();

    await page.getByLabel("계약 금액", { exact: true }).fill("5000000");
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(page.getByText("부가세 10% 500,000 · 합계 5,500,000 · 서버 계산")).toBeVisible();

    // 로그아웃 후 경영관리(role-ceo)로 로그인
    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("이메일").fill(finance.email);
    await page.getByLabel("비밀번호").fill(finance.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(projectUrl);
    await page.getByRole("button", { name: "발행 줄 추가" }).click();
    await page.getByLabel("발행일").fill("2026-09-01");
    await page.getByLabel("발행액").fill("10000000");

    await page.getByRole("button", { name: "입금 줄 추가" }).click();
    await page.getByLabel("입금일").fill("2026-09-05");
    await page.getByLabel("입금액").fill("5500000");

    await page.getByRole("button", { name: /일괄 저장/ }).click();

    // 입금 셀 둘째 줄 — 서버가 역산한 공급가액.
    await expect(page.getByText("공급가액 5,000,000 · 서버 계산")).toBeVisible();
    // 합계 행 — 발행 10,000,000 - 입금 공급가 5,000,000 = 미수 5,000,000.
    await expect(page.getByText("미수 5,000,000")).toBeVisible();

    // 다시 PM으로 로그인해 같은 화면을 연다 — 두 표가 DOM에 없다(숨김이 아니라 부재).
    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(projectUrl);
    await expect(page.getByRole("heading", { name: "매출", exact: true })).toBeVisible();
    // 부제 "공급가액 기준 · 입금액만 통장 합계"는 항상 렌더되므로("공급가액"
    // 포함) 표 부재 단언은 표에만 나오는 열 머리글·미수 문구로 확인한다.
    await expect(page.getByText("발행일")).toHaveCount(0);
    await expect(page.getByText("입금일")).toHaveCount(0);
    await expect(page.getByText("공급가액 5,000,000")).toHaveCount(0);
    await expect(page.getByText("미수 5,000,000")).toHaveCount(0);
  });
});
