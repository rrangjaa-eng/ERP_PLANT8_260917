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
  APPROVAL_ROUTE_LEAVE_STEP1_ENABLED,
  APPROVAL_ROUTE_LEAVE_STEP1_ORG_UNIT_ID,
  APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP2_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID,
} from "@/domain/settings/keys";
import { CEO_ROLE_ID } from "@/domain/permissions/roles";

// 04.1-04(ADMN-04 · CEO-14): 설정 화면 `연차 결재선` 섹션. 결재선은 공유 erp_test의
// 전역 값이라 이 스펙은 `desktop-settings` 프로젝트(다른 모든 스펙 뒤)에서만 돌고,
// 바꾼 값은 finally에서 도메인 함수로 되돌린다. 단계 사용 체크는 저장하지 않는다.
// 사용자 결정(2026-09-30 A): 단계 네 칸은 화면에 모았다가 `N단 저장` 한 번에 저장한다.

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

  test("3단 특정 부서를 —로 바꾸고 3단 저장을 누르면 칸 아래 경고가 보이고 저장은 된다", async ({ page }) => {
    const original = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID);
    try {
      await openSettings(page);
      const step3OrgUnit = page.getByLabel("3단 특정 부서");
      const field = step3OrgUnit.locator("xpath=ancestor::div[1]");
      await expect(field.getByText("부서 없음 · 이 단계는 빈 자리로 건너뜀")).toHaveCount(0);

      await step3OrgUnit.selectOption({ label: "—" });
      await page.getByRole("button", { name: "3단 저장" }).click();
      await expect(async () => {
        await page.reload();
        await expect(page.getByLabel("3단 특정 부서")).toHaveValue("");
        await expect(field.getByText("부서 없음 · 이 단계는 빈 자리로 건너뜀")).toBeVisible();
      }).toPass();
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID, original);
    }
  });

  test("2단 계급 · 범위는 2단 저장 전까지 저장되지 않고, 저장 한 번에 둘 다 저장된 뒤 버튼이 다시 꺼진다", async ({ page }) => {
    const originalRole = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID);
    const originalScope = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_SCOPE);
    try {
      await openSettings(page);
      const save = page.getByRole("button", { name: "2단 저장" });
      await expect(save).toHaveAttribute("aria-disabled", "true");
      await expect(save).toHaveAccessibleDescription("바뀐 칸 없음");

      await page.getByLabel("2단 담당 계급").selectOption(CEO_ROLE_ID);
      await page.getByLabel("2단 조직 범위").selectOption({ label: "전사" });
      await expect(save).not.toHaveAttribute("aria-disabled", "true");
      // 즉시 저장이었다면 이 사이에 요청이 나갔다 — 네트워크가 멈춘 뒤에 저장값을 읽는다.
      await page.waitForLoadState("networkidle");
      expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID)).toBe(originalRole);
      expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_SCOPE)).toBe(originalScope);

      await save.click();
      // 이유 줄은 대기(pending) 중에는 없다 — 저장 · 새로 그리기가 끝나 바뀐 칸이 없어진 뒤에만 보인다.
      await expect(save).toHaveAccessibleDescription("바뀐 칸 없음");
      expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID)).toBe(CEO_ROLE_ID);
      expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_SCOPE)).toBe("company");
      await page.reload();
      await expect(checkedText(page, "2단 담당 계급")).toHaveText("대표");
      await expect(checkedText(page, "2단 조직 범위")).toHaveText("전사");
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID, originalRole);
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_SCOPE, originalScope);
    }
  });

  test("1단 사용을 끄면 저장 전에도 1단 칸이 바로 비활성이고, 저장하지 않고 떠나면 이탈 경고 뒤 그대로다", async ({ page }) => {
    const original = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP1_ENABLED);
    expect(original).toBe(true);
    try {
      await openSettings(page);
      await page.getByLabel("1단 사용").uncheck();
      await expect(page.getByLabel("1단 담당 계급")).toBeDisabled();
      await expect(page.getByLabel("1단 조직 범위")).toBeDisabled();
      await expect(page.getByRole("button", { name: "1단 저장" })).not.toHaveAttribute("aria-disabled", "true");

      await page.getByLabel("1단 사용").check();
      await expect(page.getByLabel("1단 담당 계급")).toBeEnabled();
      await expect(page.getByRole("button", { name: "1단 저장" })).toHaveAttribute("aria-disabled", "true");

      await page.getByLabel("1단 사용").uncheck();
      const dialog = page.waitForEvent("dialog");
      const reload = page.reload();
      const leaving = await dialog;
      expect(leaving.type()).toBe("beforeunload");
      await leaving.accept();
      await reload;
      await expect(page.getByLabel("1단 사용")).toBeChecked();
      expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP1_ENABLED)).toBe(original);
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP1_ENABLED, original);
    }
  });

  test("화면을 연 뒤 다른 관리자가 2단을 먼저 저장했으면 2단 저장이 거부되고 이유가 버튼에 붙는다", async ({ page }) => {
    const originalRole = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID);
    const originalScope = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_SCOPE);
    try {
      await openSettings(page);
      await page.getByLabel("2단 담당 계급").selectOption(CEO_ROLE_ID);
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_SCOPE, "company");

      const save = page.getByRole("button", { name: "2단 저장" });
      await save.click();
      const reason = "저장 실패 · 다른 저장이 먼저 됨 · 새로 고침";
      await expect(page.getByRole("alert").filter({ hasText: reason })).toBeVisible();
      await expect(save).toHaveAccessibleDescription(reason);
      await expect(save).not.toHaveAttribute("aria-disabled", "true");
      expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID)).toBe(originalRole);
      expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_SCOPE)).toBe("company");
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID, originalRole);
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_SCOPE, originalScope);
    }
  });

  test("손대지 않은 단계는 다른 관리자의 저장을 새로 그릴 때 새 값을 따라가고 저장 버튼이 꺼진 채다", async ({ page }) => {
    const originalOrg = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID);
    const originalSelf = await getSettingValue(APPROVAL_ROUTE_LEAVE_SELF_APPROVAL);
    try {
      await openSettings(page);
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID, "");
      // 자기 승인은 즉시 저장이라 저장 뒤 화면이 새 저장값으로 다시 그려진다.
      await page.getByLabel("자기 승인").selectOption({ label: "본인 승인" });
      await expect(page.getByLabel("3단 특정 부서")).toHaveValue("");
      await expect(page.getByRole("button", { name: "3단 저장" })).toHaveAttribute("aria-disabled", "true");
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID, originalOrg);
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, originalSelf);
    }
  });

  // Codex P2(PR #105 r4140619759): 앱 안 링크(next/link — 상단 로고)는 beforeunload 없이 떠난다 → 입력 버리기 확인.
  test("저장 안 한 단계가 있으면 앱 안 링크로 떠날 때 입력 버리기 확인이 뜨고, 취소하면 남고 확인하면 떠난다", async ({ page }) => {
    const originalRole = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID);
    await openSettings(page);
    await page.getByLabel("2단 담당 계급").selectOption(CEO_ROLE_ID);

    await page.getByRole("link", { name: "PLANT8 내 차례" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "입력 버리기" })).toBeVisible();
    await expect(dialog).toContainText("결재선 2단");
    await dialog.getByRole("button", { name: "취소" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/settings$/);
    await expect(page.getByLabel("2단 담당 계급")).toHaveValue(CEO_ROLE_ID);

    await page.getByRole("link", { name: "PLANT8 내 차례" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "입력 버리기" }).click();
    await expect(page).not.toHaveURL(/\/admin\/settings$/);
    expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID)).toBe(originalRole);
  });

  // Codex P2(PR #105 r4141687057): 브라우저 뒤로 · 앞으로(앱 안 이동)는 popstate — 링크 누름도 문서 이탈도 아니다.
  // 칸을 바꾸면 화면이 기록을 한 칸 쌓는다 — 쌓이기 전(사람 손으로는 못 누르는 간격)에 뒤로 가지 않게 기다린다.
  async function editStep2Role(page: Page) {
    const length = await page.evaluate(() => window.history.length);
    await page.getByLabel("2단 담당 계급").selectOption(CEO_ROLE_ID);
    await expect.poll(() => page.evaluate(() => window.history.length)).toBe(length + 1);
  }

  test("저장 안 한 단계가 있으면 뒤로 가기에도 입력 버리기 확인이 뜨고, 취소하면 남고 확인하면 앞 화면으로 간다", async ({ page }) => {
    const originalRole = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID);
    await openSettings(page);
    await page.goto("/admin");
    const home = page.url();
    await page.getByRole("link", { name: "시스템 설정" }).first().click();
    await expect(page.getByRole("heading", { name: "연차 결재선" })).toBeVisible();
    await editStep2Role(page);

    await page.goBack();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "입력 버리기" })).toBeVisible();
    await expect(dialog).toContainText("결재선 2단");
    await dialog.getByRole("button", { name: "취소" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/settings$/);
    await expect(page.getByLabel("2단 담당 계급")).toHaveValue(CEO_ROLE_ID);

    await page.goBack();
    await page.getByRole("dialog").getByRole("button", { name: "입력 버리기" }).click();
    await expect(page).toHaveURL(home);
    expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID)).toBe(originalRole);
  });

  test("바꾼 칸을 되돌려 저장할 것이 없어지면 뒤로 가기 한 번으로 앞 화면에 간다", async ({ page }) => {
    await openSettings(page);
    await page.goto("/admin");
    const home = page.url();
    await page.getByRole("link", { name: "시스템 설정" }).first().click();
    const role = page.getByLabel("2단 담당 계급");
    const original = await role.inputValue();
    await role.selectOption(CEO_ROLE_ID);
    await expect(page.getByRole("button", { name: "2단 저장" })).not.toHaveAccessibleDescription("바뀐 칸 없음");
    await role.selectOption(original);
    await expect(page.getByRole("button", { name: "2단 저장" })).toHaveAccessibleDescription("바뀐 칸 없음");

    await page.goBack();
    await expect(page).toHaveURL(home);
  });

  test("앞 화면이 다른 문서여도 뒤로 가기 확인 뒤 브라우저 이탈 경고가 한 번 더 뜨지 않는다", async ({ page }) => {
    const originalRole = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID);
    await openSettings(page);
    const dialogs: string[] = [];
    page.on("dialog", (native) => {
      dialogs.push(native.type());
      void native.dismiss();
    });
    await editStep2Role(page);

    await page.goBack();
    await page.getByRole("dialog").getByRole("button", { name: "입력 버리기" }).click();
    await expect(page).toHaveURL(/\/account$/);
    expect(dialogs).toEqual([]);
    expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID)).toBe(originalRole);
  });

  // Codex P2(PR #105 r4140619761): 저장 대기 중 칸을 또 바꾸면 다음 저장이 옛 기대값을 보내 거부된다 → 대기 중엔 칸을 잠근다.
  test("단계 저장 대기 중에는 그 단계 칸이 잠기고, 끝나면 다시 풀린다", async ({ page }) => {
    const originalRole = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID);
    try {
      await openSettings(page);
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/admin/settings", async (route) => {
        if (route.request().method() === "POST") await held;
        await route.continue();
      });
      await page.getByLabel("2단 담당 계급").selectOption(CEO_ROLE_ID);
      await page.getByRole("button", { name: "2단 저장" }).click();
      await expect(page.getByLabel("2단 조직 범위")).toBeDisabled();
      await expect(page.getByLabel("2단 담당 계급")).toBeDisabled();
      await expect(page.getByLabel("2단 사용")).toBeDisabled();
      release();
      await expect(page.getByRole("button", { name: "2단 저장" })).toHaveAccessibleDescription("바뀐 칸 없음");
      await expect(page.getByLabel("2단 담당 계급")).toBeEnabled();
      await page.unroute("**/admin/settings");
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID, originalRole);
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
  test("복원 확인 — 자기 승인이 건너뜀 · 2단이 본부 책임자 · 기안자 본부 · 3단 특정 부서가 경영관리본부다", async ({ page }) => {
    await openSettings(page);
    await expect(checkedText(page, "자기 승인")).toHaveText("건너뜀");
    await expect(checkedText(page, "2단 담당 계급")).toHaveText("본부 책임자");
    await expect(checkedText(page, "2단 조직 범위")).toHaveText("기안자 본부");
    await expect(checkedText(page, "3단 특정 부서")).toHaveText("경영관리본부");
  });
});
