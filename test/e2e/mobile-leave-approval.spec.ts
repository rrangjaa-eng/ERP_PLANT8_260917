import { test, expect } from "@playwright/test";
import "@/domain/leave";
import { getApprovalView } from "@/domain/approvals";
import { submitLeave } from "@/domain/leave";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";
import { delayServerActions, documentLabel, documentTitle, loginPage, setupLeaveOrg } from "./leave-org";

// 04.1-05 트레이서(EXP-05 · ROADMAP 기준 3): 폰 375에서 결재함 `내 결재` 행 탭 → 결재 시트(근거 · 잔고 ·
// 결재선) → 승인 → 처리함. 처리함 행은 문서 링크라 탭하면 문서 화면으로 간다(ENG-16 · T4). 두 번 탭은
// 한 번만 처리된다(T7). 날짜는 테스트 맨 앞 서울 오늘 한 번에서만(CXF2-B-RF03 · week 2~3 — 다른 스펙과 겹치지 않게).

const PHONE = { width: 375, height: 800 };

test.describe("폰 결재 시트 (04.1-05)", () => {
  test("팀장이 폰으로 내 결재 행을 탭해 근거를 보고 승인하면 그 행이 처리함 문서 링크가 된다", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 2, weekdays: 3 });
    const org = await setupLeaveOrg(today);

    // 기안자(입사일 없음 — 월차 부여 없음)가 폰에서 종일 3평일을 신청한다.
    const drafterPage = await loginPage(browser, baseURL, org.drafter, PHONE);
    await drafterPage.goto("/leave/new");
    // 하이드레이션 전에 채운 입력은 버려진다 — 마운트 미리보기의 잔고 행이 뜬 뒤(= 하이드레이션 끝) 입력한다.
    await expect(drafterPage.getByTestId("leave-balance-row")).toBeVisible();
    await drafterPage.getByLabel("시작일").fill(range.startDate);
    await drafterPage.getByLabel("종료일").fill(range.endDate);
    await drafterPage.getByRole("button", { name: "연차 신청" }).click();
    await expect(drafterPage).toHaveURL(/\/leave\/[0-9a-f-]{36}\?submitted=1$/);

    const lead = await loginPage(browser, baseURL, org.teamLead, PHONE);
    await lead.goto("/approvals");
    const scroll = await lead.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(scroll[0]).toBeLessThanOrEqual(scroll[1] ?? 0);

    // 내 결재 행 탭 대상 = button + aria-haspopup="dialog"(T4).
    const trigger = lead.getByRole("button", { name: documentLabel(range) });
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await trigger.click();

    const sheet = lead.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(documentTitle(range));
    const subtitle = await sheet.getByText(new RegExp(` · ${org.drafter.name}$`)).innerText();
    const number = subtitle.split(" · ")[0] ?? "";
    expect(number).toMatch(/^LV/);
    await expect(sheet.getByText(/^연차 남음 [\d.]+일 · 결재 중 0일 · 이번 신청 3일$/)).toBeVisible();
    await expect(sheet.getByText("월차 남음")).toHaveCount(0);
    // 잔고 행이 있으면 `일수` 행이 없고 `이번 신청` 글자는 한 번이다(T8).
    await expect(sheet.locator("dt", { hasText: /^일수$/ })).toHaveCount(0);
    expect(((await sheet.innerText()).match(/이번 신청/g) ?? []).length).toBe(1);
    await expect(sheet.getByRole("listitem").first()).toHaveText(`${org.teamLead.name}(나) 팀장 · 내 결재`);
    await expect(sheet.getByRole("button", { name: "승인" })).toBeFocused();

    await sheet.getByRole("button", { name: "승인" }).click();
    await expect(lead.getByRole("status").filter({ hasText: "승인 · " })).toHaveText(`승인 · 결재 요청됨 → ${org.divisionHead.name}`);
    await expect(sheet).toBeHidden();

    // 처리함 행 = 문서 링크(aria-haspopup 없음) → 탭하면 문서 화면, 시트 없음(ENG-16).
    const processed = lead.getByRole("link", { name: documentLabel(range) });
    await expect(processed).toBeVisible();
    await expect(processed).not.toHaveAttribute("aria-haspopup", /.*/);
    await expect(lead.getByRole("button", { name: documentLabel(range) })).toHaveCount(0);
    await processed.click();
    await expect(lead).toHaveURL(/\/leave\/[0-9a-f-]{36}$/);
    await expect(lead.getByRole("dialog")).toHaveCount(0);
    await expect(lead.getByText(number, { exact: true })).toBeVisible();
  });

  test("승인을 빠르게 두 번 눌러도 처리 기록은 한 건이고, 제출 중 반려는 aria-disabled이며 disabled 속성이 없다(T7)", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 3, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    const submitted = await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });

    const lead = await loginPage(browser, baseURL, org.teamLead, PHONE);
    await lead.goto("/approvals");
    await lead.getByRole("button", { name: documentLabel(range) }).click();
    const sheet = lead.getByRole("dialog");
    await expect(sheet).toBeVisible();

    await delayServerActions(lead, 1500);
    const approve = sheet.getByRole("button", { name: /^승인/ });
    await approve.click();
    await approve.click({ force: true });
    await expect(approve).toContainText("승인…");
    const reject = sheet.getByRole("button", { name: "반려" });
    await expect(reject).toHaveAttribute("aria-disabled", "true");
    expect(await reject.getAttribute("disabled")).toBeNull();

    await expect(sheet).toBeHidden();
    const view = await getApprovalView(org.teamLead.viewer, { kind: "leave", documentId: submitted.leaveId });
    expect(view?.steps?.filter((step) => step.state === "approved")).toHaveLength(1);
  });

  test("결재 시트의 반려는 결재 시트를 닫고 반려 확인 시트를 열며, 확인 시트를 닫으면 목록 행으로 포커스가 돌아간다", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 2, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });

    const lead = await loginPage(browser, baseURL, org.teamLead, PHONE);
    await lead.goto("/approvals");
    const trigger = lead.getByRole("button", { name: documentLabel(range) });
    await trigger.click();
    await lead.getByRole("dialog").getByRole("button", { name: "반려" }).click();

    const dialogs = lead.getByRole("dialog");
    await expect(dialogs).toHaveCount(1);
    await expect(dialogs.getByRole("heading", { level: 2 })).toHaveText("연차 반려");
    await expect(dialogs.getByLabel("사유")).toBeFocused();
    await dialogs.getByRole("button", { name: "닫기" }).click();
    await expect(dialogs).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  // 사용자 결정(2026-09-29 · PR #90 A2·A3): 폰 행동 줄은 결재 시트와 문서 화면 모두 반려(2차) 왼쪽 · 승인(1차)
  // 오른쪽이고, 두 버튼 사이는 --s-4(16px) 이상이다.
  test("폰 결재 시트와 문서 화면 행동 줄은 반려가 왼쪽 · 승인이 오른쪽이고 사이가 16px 이상이다", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 3, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    const { leaveId } = await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });

    const lead = await loginPage(browser, baseURL, org.teamLead, PHONE);
    const expectRejectLeftOfApprove = async (scope: ReturnType<typeof lead.locator>) => {
      const reject = await scope.getByRole("button", { name: "반려" }).boundingBox();
      const approve = await scope.getByRole("button", { name: /^승인/ }).boundingBox();
      if (!reject || !approve) throw new Error("행동 버튼 없음");
      expect(approve.x - (reject.x + reject.width)).toBeGreaterThanOrEqual(16);
    };

    await lead.goto("/approvals");
    await lead.getByRole("button", { name: documentLabel(range) }).click();
    await expect(lead.getByRole("dialog")).toBeVisible();
    await expectRejectLeftOfApprove(lead.getByRole("dialog"));

    await lead.goto(`/leave/${leaveId}`);
    await expectRejectLeftOfApprove(lead.locator("main"));
  });
});
