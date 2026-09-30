import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import "@/domain/leave";
import { submitLeave } from "@/domain/leave";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";
import { documentLabel, loginPage, setupLeaveOrg } from "./leave-org";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import {
  APPROVAL_ROUTE_LEAVE_SELF_APPROVAL,
  APPROVAL_ROUTE_LEAVE_STEP1_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID,
} from "@/domain/settings/keys";

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

    // SYSTEM.md §1-2: 비활성 글자는 --faint on --surface, 반투명은 --scrim 하나뿐. 활성 select 글자는 --fg.
    const tokenColor = (token: string) =>
      page.evaluate((name) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${name})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      }, token);
    const style = (label: string) =>
      page.getByLabel(label).evaluate((el) => {
        const computed = getComputedStyle(el);
        return { color: computed.color, background: computed.backgroundColor, opacity: computed.opacity };
      });
    expect(await style("1단 특정 부서")).toEqual({
      color: await tokenColor("--faint"),
      background: await tokenColor("--surface"),
      opacity: "1",
    });
    expect((await style("3단 특정 부서")).color).toBe(await tokenColor("--fg"));
  });

  test("자기 승인을 본인 승인으로 바꾸면 즉시 저장되고 새로 고쳐도 남는다", async ({ page }) => {
    const original = await getSettingValue(APPROVAL_ROUTE_LEAVE_SELF_APPROVAL);
    try {
      await openSettings(page);
      await page.getByLabel("자기 승인").selectOption({ label: "본인 승인" });
      await expect(async () => {
        await page.reload();
        await expect(checkedText(page, "자기 승인")).toHaveText("본인 승인");
      }).toPass();
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, original);
    }
  });

  test("3단 특정 부서를 —로 바꾸면 칸 아래 경고가 보이고 저장은 된다", async ({ page }) => {
    const original = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID);
    try {
      await openSettings(page);
      const step3OrgUnit = page.getByLabel("3단 특정 부서");
      const field = step3OrgUnit.locator("xpath=ancestor::div[1]");
      await expect(field.getByText("부서 없음 · 이 단계는 빈 자리로 건너뜀")).toHaveCount(0);

      await step3OrgUnit.selectOption({ label: "—" });
      await expect(async () => {
        await page.reload();
        await expect(page.getByLabel("3단 특정 부서")).toHaveValue("");
        await expect(field.getByText("부서 없음 · 이 단계는 빈 자리로 건너뜀")).toBeVisible();
      }).toPass();
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID, original);
    }
  });

  // 04.1-05(CXF-B-F01 · CXF2-B-RF01 · T6): 본인 승인이면 팀장 자기 문서의 행동 줄 = 1차 승인 + 2차 회수(반려 없음).
  // PC 결재함 행에는 3차 승인 하나(회수는 문서 화면 · 폰 시트에서만), 폰 결재 시트는 승인 + 회수.
  test("본인 승인 — 팀장 자기 문서: 문서 화면 승인 + 회수, PC 결재함 행 승인 하나, 폰 시트 승인 + 회수", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 9, weekdays: 2 });
    const original = await getSettingValue(APPROVAL_ROUTE_LEAVE_SELF_APPROVAL);
    try {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, "self_approve");
      const org = await setupLeaveOrg(today);
      const doc = await submitLeave(org.teamLead.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });
      const lead = await loginPage(browser, baseURL, org.teamLead);

      await lead.goto(`/leave/${doc.leaveId}`);
      await expect(lead.getByRole("button", { name: /^승인/ })).toBeVisible();
      await expect(lead.getByRole("button", { name: /^회수/ })).toBeVisible();
      await expect(lead.getByRole("button", { name: "반려" })).toHaveCount(0);

      await lead.goto("/approvals");
      const row = lead.getByRole("row").filter({ hasText: documentLabel(range) });
      await expect(row.getByRole("button", { name: /^승인/ })).toHaveCount(1);
      await expect(row.getByRole("button", { name: /^회수/ })).toHaveCount(0);
      await expect(row.getByRole("button", { name: "반려" })).toHaveCount(0);

      await lead.setViewportSize({ width: 375, height: 800 });
      await lead.getByRole("button", { name: documentLabel(range) }).click();
      const sheet = lead.getByRole("dialog");
      await expect(sheet.getByRole("button", { name: /^승인/ })).toBeVisible();
      await expect(sheet.getByRole("button", { name: "회수" })).toBeVisible();
      await expect(sheet.getByRole("button", { name: "반려" })).toHaveCount(0);
      await lead.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await lead.setViewportSize({ width: 1280, height: 800 });

      await lead.goto(`/leave/${doc.leaveId}`);
      await lead.getByRole("button", { name: /^승인/ }).click();
      await expect(lead.getByRole("status").filter({ hasText: "승인 · " })).toBeVisible();
      await expect(lead.getByRole("button", { name: /^승인/ })).toHaveCount(0);
      await expect(lead.getByRole("button", { name: /^회수/ })).toHaveCount(1);
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, original);
    }
  });

  // 파일 안 테스트는 선언 순서로 돈다(fullyParallel: false) — 앞 테스트들의 복원 증명.
  test("복원 확인 — 자기 승인이 건너뜀 · 3단 특정 부서가 경영관리본부다", async ({ page }) => {
    await openSettings(page);
    await expect(checkedText(page, "자기 승인")).toHaveText("건너뜀");
    await expect(checkedText(page, "3단 특정 부서")).toHaveText("경영관리본부");
  });
});
