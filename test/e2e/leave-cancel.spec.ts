import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import "@/domain/leave";
import "@/domain/leave/cancel";
import { approveDocument, NotCurrentHolderError, rejectDocument } from "@/domain/approvals";
import { submitLeave } from "@/domain/leave";
import { requestLeaveCancel } from "@/domain/leave/cancel";
import { getMyLeaveBalance } from "@/domain/leave/balance-service";
import { createOrgUnit, createTeam } from "@/domain/org";
import { db } from "@/db/client";
import { approvalInstances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";
import { loginPage, makeMgmtHead, makePerson, setupLeaveOrg, waitForHydration, type Person } from "./leave-org";

// 07.2-15(S18 · PU10 · D-7252~7256 · 07.2 D-7310): 승인된 연차의 문서 화면 `취소 요청` — 입구는 기안자 · 승인 · 취소 없음일 때만,
// 창 = 제목 `연차 취소 요청` · 부제 `{종류} {기간}` · 결과 줄 `결재 → {결재자} · 승인 시 잔고 복귀` · 사유 필수 · 1차 `취소 요청`.
// 제출 → `취소 요청 중` → 팀장 승인 → `취소됨`(잔고 복귀) / 반려 → `승인` + 결재선 `취소 요청 반려` · `사유 · …` · 3차 `취소 다시 요청`.
// 날짜는 테스트마다 서울 오늘 한 번 · week 9~12(다른 연차 스펙과 겹치지 않게).

function periodOf(range: { startDate: string; endDate: string }): string {
  const end = range.endDate !== range.startDate ? ` ~ ${range.endDate.slice(5)}` : "";
  return `종일 ${range.startDate.slice(5)}${end}`;
}

// 지금 담당이 누구든 people 중 승인할 수 있는 사람이 끝까지 승인한다(지금 담당이 아니면 엔진이 NotCurrentHolderError).
async function approveThrough(people: Viewer[], instanceId: string): Promise<void> {
  for (let guard = 0; guard < 8; guard++) {
    const [row] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, instanceId));
    if (row?.status === "approved") return;
    let moved = false;
    for (const person of people) {
      try {
        await approveDocument(person, { instanceId, expectedVersion: row?.version ?? 0 });
        moved = true;
        break;
      } catch (error) {
        if (!(error instanceof NotCurrentHolderError)) throw error;
      }
    }
    if (!moved) throw new Error("승인할 사람 없음");
  }
  throw new Error("최종 승인에 닿지 않음");
}

async function approvedLeave(drafter: Person, approvers: Person[], range: { startDate: string; endDate: string }) {
  const leave = await submitLeave(drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });
  await approveThrough(
    approvers.map((person) => person.viewer),
    leave.instanceId,
  );
  return leave;
}

function headerStatus(page: Page) {
  return page.locator('[data-ui="screen-title"]').locator("..");
}

async function usedQuarters(person: Person): Promise<number | undefined> {
  return (await getMyLeaveBalance(person.viewer, { fiscalYear: Number(seoulToday().slice(0, 4)) })).annual?.usedQuarters;
}

test.describe("연차 취소 요청 (07.2-15 · S18)", () => {
  test("기안자만 `취소 요청` 입구 → 창(사유 필수) → `취소 요청 중` → 팀장 결재함 새 행 → 승인 → `취소됨` · 잔고 복귀", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 9, weekdays: 2 });
    const org = await setupLeaveOrg(today);
    const leave = await approvedLeave(org.drafter, [org.teamLead, org.divisionHead, org.mgmt, org.ceo], range);
    const url = `/leave/${leave.leaveId}`;
    const usedBefore = await usedQuarters(org.drafter);

    // 처리자(팀장)는 문서를 보지만 입구가 없다.
    const lead = await loginPage(browser, baseURL, org.teamLead);
    await lead.goto(url);
    await expect(headerStatus(lead).getByText("승인", { exact: true })).toBeVisible();
    await expect(lead.getByRole("button", { name: "취소 요청" })).toHaveCount(0);

    const drafter = await loginPage(browser, baseURL, org.drafter);
    await drafter.goto(url);
    await expect(drafter.getByRole("link", { name: "인쇄" })).toHaveCount(1);
    const entry = drafter.getByRole("button", { name: "취소 요청" });
    await expect(entry).toHaveCount(1);
    await waitForHydration(entry);
    await entry.click();
    const dialog = drafter.getByRole("dialog");
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("연차 취소 요청");
    await expect(dialog.getByText(periodOf(range), { exact: true })).toBeVisible();
    await expect(dialog.getByText(`결재 → ${org.teamLead.name} · 승인 시 잔고 복귀`, { exact: true })).toBeVisible();
    const primary = dialog.getByRole("button", { name: /^취소 요청/ });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.getByText("사유 없음 · 사유 적기").first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^닫기/ })).toBeVisible();

    const reason = dialog.getByLabel("사유");
    await expect(reason).toBeFocused();
    await reason.fill("일정이 바뀌어 출근");
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await drafter.keyboard.press("Control+Enter");
    await expect(drafter.getByRole("status").filter({ hasText: "취소 요청 · " })).toHaveText(`취소 요청 · 결재 요청됨 → ${org.teamLead.name}`);
    await expect(headerStatus(drafter).getByText("취소 요청 중", { exact: true })).toBeVisible();
    await expect(drafter.getByRole("button", { name: "취소 요청" })).toHaveCount(0);

    // 팀장 결재함 `내 결재`에 새 종류 행 하나 → 문서 화면에서 승인.
    await lead.goto("/approvals");
    const label = `연차 취소 요청 · ${periodOf(range)}`;
    await expect(lead.getByRole("row").filter({ hasText: label })).toHaveCount(1);
    await expect(lead.getByRole("row").filter({ hasText: label }).getByRole("button", { name: "승인" })).toBeVisible();
    await lead.goto(url);
    const approve = lead.getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await approve.click();
    await expect(lead.getByRole("status").filter({ hasText: "승인 · " })).toContainText("승인 · 최종 승인");

    await drafter.goto("/leave");
    await expect(drafter.getByRole("row").filter({ hasText: periodOf(range).slice(3) }).getByText("취소됨", { exact: true })).toBeVisible();
    await drafter.goto(url);
    await expect(headerStatus(drafter).getByText("취소됨", { exact: true })).toBeVisible();
    await expect(drafter.getByRole("button", { name: "취소 요청" })).toHaveCount(0);
    // 취소된 연차는 인쇄 입구가 없고 인쇄 주소도 응답 전 404(게이트 지적 — 볼 수 없는 문서와 같은 막기).
    await expect(drafter.getByRole("link", { name: "인쇄" })).toHaveCount(0);
    expect((await drafter.goto(`/print/leaves/${leave.leaveId}`))?.status()).toBe(404);
    expect(await usedQuarters(org.drafter)).toBe((usedBefore ?? 0) - 8);
  });

  test("반려 → 상태 `승인` · 결재선 `취소 요청 반려` + `사유 · {원문}` · 3차 `취소 다시 요청` → 다시 `취소 요청 중`", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 10, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    const leave = await approvedLeave(org.drafter, [org.teamLead, org.divisionHead, org.mgmt, org.ceo], range);
    const cancel = await requestLeaveCancel(org.drafter.viewer, { leaveId: leave.leaveId, reason: "출근으로 바뀜" });
    await rejectDocument(org.teamLead.viewer, { instanceId: cancel.instanceId, expectedVersion: cancel.version, reason: "그날 인원 부족" });

    const drafter = await loginPage(browser, baseURL, org.drafter);
    await drafter.goto(`/leave/${leave.leaveId}`);
    await expect(headerStatus(drafter).getByText("승인", { exact: true })).toBeVisible();
    await expect(drafter.getByText("취소 요청 반려", { exact: true })).toBeVisible();
    await expect(drafter.getByText("사유 · 그날 인원 부족", { exact: true })).toBeVisible();
    await expect(drafter.getByRole("button", { name: "취소 요청" })).toHaveCount(0);
    const again = drafter.getByRole("button", { name: "취소 다시 요청" });
    await waitForHydration(again);
    await again.click();
    const dialog = drafter.getByRole("dialog");
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("연차 취소 요청");
    await expect(dialog.getByText(`결재 → ${org.teamLead.name} · 승인 시 잔고 복귀`, { exact: true })).toBeVisible();
    await dialog.getByLabel("사유").fill("다시 요청");
    await dialog.getByRole("button", { name: /^취소 요청/ }).click();
    await expect(drafter.getByRole("status").filter({ hasText: "취소 요청 · " })).toHaveText(`취소 요청 · 결재 요청됨 → ${org.teamLead.name}`);
    await expect(headerStatus(drafter).getByText("취소 요청 중", { exact: true })).toBeVisible();
    await expect(drafter.getByRole("button", { name: "취소 다시 요청" })).toHaveCount(0);
  });

  test("대표 본인 연차 → 창 갈래 하나(1차 `취소 요청` · 결과 줄 `결재 → {대표}`) · 대표 결재함 `승인` 1클릭 → `취소됨`", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 11, weekdays: 1 });
    const yearStart = `${today.slice(0, 4)}-01-01`;
    // 팀장 · 본부 책임자가 없는 팀의 대표 — 원 결재선 팀장 단계가 비어 취소 결재자 = 대표 대체(07.2 D-7310). 대표 대체는 기안자가 아닌 대표가
    // 있으면 그 사람들이 받는다(엔진 W7) — 시드 · 다른 스펙의 대표도 후보라 로그인할 수 있는 대표를 하나 더 둔다.
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E취소본부-${randomUUID().slice(0, 8)}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E취소팀-${randomUUID().slice(0, 8)}` });
    const ceo = await makePerson("대표", "role-ceo", team.id, yearStart);
    const otherCeo = await makePerson("대표", "role-ceo", team.id, yearStart);
    const mgmt = await makeMgmtHead("경영");
    const leave = await approvedLeave(ceo, [mgmt, otherCeo], range);

    const page = await loginPage(browser, baseURL, ceo);
    await page.goto(`/leave/${leave.leaveId}`);
    const entry = page.getByRole("button", { name: "취소 요청" });
    await waitForHydration(entry);
    await entry.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("연차 취소 요청");
    // 대표 후보는 다른 스펙의 대표와 함께일 수 있어(`… 외 N명`) 모양만 본다.
    await expect(dialog.getByText(/^결재 → .+ · 승인 시 잔고 복귀$/)).toBeVisible();
    await dialog.getByLabel("사유").fill("출장 취소");
    await dialog.getByRole("button", { name: /^취소 요청/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "취소 요청 · " })).toHaveText(/^취소 요청 · 결재 요청됨 → .+/);
    await expect(headerStatus(page).getByText("취소 요청 중", { exact: true })).toBeVisible();

    const approver = await loginPage(browser, baseURL, otherCeo);
    await approver.goto("/approvals");
    const row = approver.getByRole("row").filter({ hasText: `연차 취소 요청 · ${periodOf(range)}` });
    await expect(row).toHaveCount(1);
    const approve = row.getByRole("button", { name: "승인" });
    await waitForHydration(approve);
    await approve.click();
    await expect(approver.getByRole("status").filter({ hasText: "승인 · " })).toContainText("승인 · 최종 승인");
    await page.goto(`/leave/${leave.leaveId}`);
    await expect(headerStatus(page).getByText("취소됨", { exact: true })).toBeVisible();
  });

  test("375 — 고정 행동 줄의 `취소 요청`은 44 이상 · 창은 아래 시트", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 12, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    const leave = await approvedLeave(org.drafter, [org.teamLead, org.divisionHead, org.mgmt, org.ceo], range);

    const page = await loginPage(browser, baseURL, org.drafter, { width: 375, height: 800 });
    await page.goto(`/leave/${leave.leaveId}`);
    const entry = page.getByRole("button", { name: "취소 요청" });
    await waitForHydration(entry);
    expect((await entry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(page.locator("[data-fixed-bar]")).toHaveCSS("position", "fixed");
    await entry.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("연차 취소 요청");
    const box = await dialog.boundingBox();
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(800);
    expect(Math.round(box?.width ?? 0)).toBe(375);
  });
});
