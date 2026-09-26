import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, APPROVAL_ROUTE_LEAVE_STEP1_ORG_UNIT_ID } from "@/domain/settings/keys";

// 04.1-04(ADMN-04 · CEO-14): 설정 화면 `연차 결재선` 섹션. 결재선은 공유 erp_test의
// 전역 값이라 이 스펙은 `desktop-settings` 프로젝트(다른 모든 스펙 뒤)에서만 돌고,
// 바꾼 값은 finally에서 도메인 함수로 되돌린다. 단계 사용 체크는 누르지 않는다.

async function openSettings(page: Page) {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "연차 결재선" })).toBeVisible();
}

function checkedText(page: Page, label: string) {
  return page.getByLabel(label).locator("option:checked");
}

test.describe("설정 화면 연차 결재선 (ADMN-04)", () => {
  test("선택지는 이름으로 보이고 날것 키가 없으며, 효과 없는 칸은 비활성이다", async ({ page }) => {
    await openSettings(page);

    await expect(page.getByLabel("자기 승인").locator("option")).toHaveText(["건너뜀", "본인 승인"]);
    const step1Role = page.getByLabel("1단 담당 계급").locator("option");
    await expect(step1Role.first()).toHaveText("계급 무관");
    await expect(step1Role.filter({ hasText: /^팀장$/ })).toHaveCount(1);
    await expect(checkedText(page, "3단 담당 계급")).toHaveText("계급 무관");
    await expect(checkedText(page, "3단 특정 부서")).toHaveText("경영관리본부");
    await expect(page.getByLabel("1단 조직 범위").locator("option")).toHaveText(["기안자 팀", "기안자 본부", "전사", "특정 부서"]);

    const text = await page.locator("main").innerText();
    for (const raw of ["self_approve", "drafter_team", "role-team-lead"]) expect(text).not.toContain(raw);

    // 기본 설정 그대로 — 1단 범위 = 기안자 팀이라 1단 특정 부서는 비활성, 3단은 활성.
    const step1OrgUnit = page.getByLabel("1단 특정 부서");
    await expect(step1OrgUnit).toBeDisabled();
    await expect(step1OrgUnit).toHaveValue(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP1_ORG_UNIT_ID));
    await expect(page.getByLabel("3단 특정 부서")).toBeEnabled();
  });

  test("자기 승인을 본인 승인으로 바꾸면 즉시 저장되고 새로 고쳐도 남는다", async ({ page }) => {
    try {
      await openSettings(page);
      await page.getByLabel("자기 승인").selectOption({ label: "본인 승인" });
      await expect(async () => {
        await page.reload();
        await expect(checkedText(page, "자기 승인")).toHaveText("본인 승인");
      }).toPass();
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, "skip");
    }
  });

  // 파일 안 테스트는 선언 순서로 돈다(fullyParallel: false) — 앞 테스트의 복원 증명.
  test("복원 확인 — 자기 승인이 건너뜀이다", async ({ page }) => {
    await openSettings(page);
    await expect(checkedText(page, "자기 승인")).toHaveText("건너뜀");
  });
});
