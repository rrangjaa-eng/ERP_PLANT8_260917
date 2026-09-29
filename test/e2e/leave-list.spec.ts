import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createRole, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { setRoleArchived } from "@/repositories/roles";
import { rejectDocument } from "@/domain/approvals";
import { submitLeave } from "@/domain/leave";
import { setHireDate } from "@/domain/people";
import { getSettingValue } from "@/domain/settings/registry";
import { LEAVE_ANNUAL_DAYS } from "@/domain/settings/keys";
import { seoulDateToUtcDate } from "@/lib/dates";
import { formatLeaveDays } from "@/domain/leave/days";
import {
  allocateLeave,
  annualGrantQuarters,
  balanceFiscalYears,
  buildLeaveGrants,
  formatBalanceLines,
  summarizeLeaveBalance,
} from "@/domain/leave/balance";
import { createFixtureUser } from "./fixtures";
import { leaveWeekdayRange, onStableSeoulDay } from "./leave-dates";
import { setupLeaveOrg } from "./leave-org";

// 04.1-06 Task 1(S1 · S10 · A1 · A4): 계정 그룹 「연차」 → `/leave` 잔고 줄 · 상태 그룹 · 연도 규칙(D6).
// 잔고를 단언하는 사례는 이 스펙이 만든 전용 사용자(입사일 없음 · 신청 기록 없음)만 쓴다(CEO-15). 연도 · 날짜는
// onStableSeoulDay가 준 오늘에서 계산하고, 신청 날짜는 leaveWeekdayRange(오늘, {week 10~20})로만 만든다
// (Codex HIGH 06). 기대 잔고 문자열은 04.1-03 순수 함수로 같은 입력에서 만든다 — 숫자를 스펙에 적지 않는다.

async function login(browser: Browser, baseURL: string | undefined, creds: { email: string; password: string }): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(creds.email);
  await page.getByLabel("비밀번호").fill(creds.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

// PC 사용자 메뉴 항목 — 「알림함 N」의 건수는 다른 스펙의 알림에 따라 달라 이름만 본다.
async function userMenuItems(page: Page, userName: string): Promise<string[]> {
  await page.getByRole("button", { name: new RegExp(`^${userName}`) }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  const texts = await page.getByRole("menuitem").allTextContents();
  return texts.map((text) => text.trim().replace(/^알림함( \d+\+?)?$/, "알림함"));
}

function yearOf(today: string): number {
  return Number(today.slice(0, 4));
}

// 스펙 기대 잔고 줄 — 페이지와 같은 순수 함수 경로(buildLeaveGrants → allocateLeave → summarizeLeaveBalance →
// formatBalanceLines)를 같은 입력(입사일 · 오늘 · 신청 없음 · 조정 없음)으로.
async function expectedBalance(hireDate: string | null, today: string) {
  const year = yearOf(today);
  const years = balanceFiscalYears(hireDate, year);
  const annualDaysByYear: Record<number, number> = {};
  for (const y of years) annualDaysByYear[y] = await getSettingValue(LEAVE_ANNUAL_DAYS, { asOf: seoulDateToUtcDate(`${y}-01-01`) });
  const grants = buildLeaveGrants({ hireDate, resignationDate: null, fiscalYears: years, annualDaysByYear, adjustments: [], asOf: today });
  const summary = summarizeLeaveBalance({ fiscalYear: year, asOf: today, hireDate, grants, allocations: allocateLeave(grants, []) });
  return { summary, lines: formatBalanceLines(summary).map((line) => line.text), annualDays: annualDaysByYear[year] ?? 0 };
}

function balanceLines(page: Page) {
  return page.getByTestId("leave-balance").locator("p");
}

// 이 스펙 전용 기안자의 신청 두 건 — 하나는 팀장이 반려, 하나는 결재 중.
async function submitTwo(drafter: Viewer, teamLead: Viewer, today: string): Promise<void> {
  const rejected = await submitLeave(drafter, { kind: "full_day", half: "", ...leaveWeekdayRange(today, { week: 10, weekdays: 2 }) });
  await rejectDocument(teamLead, { instanceId: rejected.instanceId, expectedVersion: rejected.version, reason: "일정 겹침" });
  await submitLeave(drafter, { kind: "full_day", half: "", ...leaveWeekdayRange(today, { week: 11, weekdays: 2 }) });
}

async function groupHeaders(page: Page): Promise<string[]> {
  return (await page.locator("tbody tr td[colspan]").allTextContents()).map((text) => text.trim()).filter((text) => ["결재 중", "반려", "승인", "회수"].includes(text));
}

test.describe("연차 목록 /leave (04.1-06 Task 1 · S1 · S10)", () => {
  test("전용 사용자: PC 사용자 메뉴 「연차」 → 첫해 목록 — 부제 한 자리 · 잔고 두 줄 · EMPTY · 머리 1차 없음", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const year = yearOf(today);
      const org = await setupLeaveOrg(today);
      const page = await login(browser, baseURL, org.drafter);

      expect(await userMenuItems(page, org.drafter.name)).toEqual(["알림함", "내 정보", "연차", "로그아웃"]);
      await page.getByRole("menuitem", { name: "연차" }).click();
      await expect(page).toHaveURL(/\/leave$/);

      await expect(page.getByText(`${year} 회계연도`, { exact: true })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "연도" })).toHaveCount(0);
      const expected = await expectedBalance(null, today);
      await expect(balanceLines(page)).toHaveText([
        `연차 ${formatLeaveDays(expected.annualDays * 4)} · 사용 0일 · 결재 중 0일 · 남음 ${formatLeaveDays(expected.annualDays * 4)}`,
        "월차 계산 불가 · 입사일 없음",
      ]);
      await expect(page.getByText("신청한 연차가 없습니다", { exact: true })).toBeVisible();
      // 머리 1차는 없고 EMPTY 3차 하나만 — 연도는 EMPTY에 쓰지 않는다(#6).
      await expect(page.getByRole("link", { name: "연차 신청" })).toHaveCount(1);
      await expect(page.getByRole("link", { name: "연차 신청" })).toHaveAttribute("href", "/leave/new");
      await expect(page.getByText("신청한 연차가 없습니다", { exact: true }).locator("..")).not.toContainText(String(year));
      await page.context().close();
    });
  });

  test("신청 두 건(반려 · 결재 중): 그룹 머리글 `결재 중` → `반려` · 합계 행 없음 · 연도 select 없음", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      await submitTwo(org.drafter.viewer, org.teamLead.viewer, today);
      const page = await login(browser, baseURL, org.drafter);
      await page.goto("/leave");

      const table = page.getByRole("table", { name: "내 연차" });
      await expect(table).toBeVisible();
      expect(await groupHeaders(page)).toEqual(["결재 중", "반려"]);
      await expect(table.locator("tfoot")).toHaveCount(0);
      await expect(page.getByRole("main")).not.toContainText("합계");
      await expect(page.getByRole("combobox", { name: "연도" })).toHaveCount(0);
      // 행 전체가 문서 링크 — 종류 · 기간 칸이 /leave/[id]로 간다.
      const pending = leaveWeekdayRange(today, { week: 11, weekdays: 2 });
      const link = table.getByRole("link", { name: `종일 ${pending.startDate.slice(5)} ~ ${pending.endDate.slice(5)}` });
      await expect(link).toHaveAttribute("href", /^\/leave\/[0-9a-f-]{36}$/);
      // 신청이 있으면 머리 1차 `연차 신청`이 있다.
      await expect(page.getByRole("link", { name: "연차 신청" })).toHaveCount(1);
      await page.context().close();
    });
  });

  test("연도 규칙(D6): 지난해는 그대로 EMPTY `올해 보기` · 옵션 둘 · 부제 없음, 미래 · 형식 오류 · 범위 밖은 올해", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const year = yearOf(today);
      const org = await setupLeaveOrg(today);
      await submitTwo(org.drafter.viewer, org.teamLead.viewer, today);
      const page = await login(browser, baseURL, org.drafter);

      await page.goto(`/leave?year=${year - 1}`);
      await expect(page.getByText("신청한 연차가 없습니다", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "올해 보기" })).toHaveAttribute("href", "/leave");
      const select = page.getByRole("combobox", { name: "연도" });
      await expect(select).toHaveValue(String(year - 1));
      const options = (await select.locator("option").allTextContents()).filter((label) => label !== "—");
      expect([...options].sort()).toEqual([String(year - 1), String(year)]);
      await expect(page.getByText(`${year - 1} 회계연도`, { exact: true })).toHaveCount(0);
      await expect(page.getByText(`${year} 회계연도`, { exact: true })).toHaveCount(0);

      for (const raw of [String(year + 1), "abc", "1999"]) {
        await page.goto(`/leave?year=${raw}`);
        await expect(page.getByText(`${year} 회계연도`, { exact: true })).toBeVisible();
        await expect(page.getByRole("combobox", { name: "연도" })).toHaveCount(0);
        expect(await groupHeaders(page)).toEqual(["결재 중", "반려"]);
      }
      await page.context().close();
    });
  });

  test("입사 다음 해 사용자(11:43 · R1/D5): 연차 줄은 비례 부여, 월차 줄은 따로, 두 남음의 합은 어디에도 없다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const year = yearOf(today);
      const hireDate = `${year - 1}-10-01`;
      const org = await setupLeaveOrg(today);
      await setHireDate(SYSTEM_VIEWER, org.drafter.viewer.id, hireDate);
      const page = await login(browser, baseURL, org.drafter);
      await page.goto("/leave");

      const annualDays = await getSettingValue(LEAVE_ANNUAL_DAYS, { asOf: seoulDateToUtcDate(`${year}-01-01`) });
      const p = formatLeaveDays(annualGrantQuarters({ fiscalYear: year, hireDate, resignationDate: null, annualDays }));
      const expected = await expectedBalance(hireDate, today);
      expect(expected.lines[0]).toBe(`연차 ${p} · 사용 0일 · 결재 중 0일 · 남음 ${p}`);
      await expect(balanceLines(page)).toHaveText([`연차 ${p} · 사용 0일 · 결재 중 0일 · 남음 ${p}`, expected.lines[1] ?? ""]);
      await expect(balanceLines(page).nth(1)).toHaveText(new RegExp(`^월차 적립 .* · ${year}-12-31 소멸$`));
      const monthly = expected.summary.monthly;
      if (monthly?.status !== "active") throw new Error("월차 줄이 있어야 한다(입사 다음 해)");
      const total = formatLeaveDays(expected.summary.annual.remainingQuarters + monthly.remainingQuarters);
      await expect(page.getByRole("main")).not.toContainText(`남음 ${total}`);
      await page.context().close();
    });
  });

  test("입사일 = 오늘(D4): 근속 첫 1년 · 적립 0이어도 월차 줄이 있다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      await setHireDate(SYSTEM_VIEWER, org.drafter.viewer.id, today);
      const page = await login(browser, baseURL, org.drafter);
      await page.goto("/leave");

      const expected = await expectedBalance(today, today);
      expect(expected.lines[1]).toMatch(/^월차 적립 0일 · /);
      await expect(balanceLines(page)).toHaveText(expected.lines);
      await page.context().close();
    });
  });

  test("PC 사용자 메뉴 순서(Codex MEDIUM): 관리자는 관리 · 알림함 · 내 정보 · 연차 · 로그아웃", async ({ browser, baseURL }) => {
    const page = await login(browser, baseURL, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
    expect(await userMenuItems(page, "E2E Admin")).toEqual(["관리", "알림함", "내 정보", "연차", "로그아웃"]);
    await page.context().close();
  });

  test("권한(CX-R5 · T-04.1-34): view만 있으면 `연차 신청`이 어디에도 없고, view가 없으면 항목이 없고 /leave는 404", async ({ browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 8);
    const viewOnly = await createRole(SYSTEM_VIEWER, { name: `E2E 연차보기 ${suffix}` });
    const none = await createRole(SYSTEM_VIEWER, { name: `E2E 연차없음 ${suffix}` });
    try {
      await setPermissionCell(SYSTEM_VIEWER, { roleId: viewOnly.id, menu: "leave", action: "view", allowed: true });

      const viewer = await login(browser, baseURL, await createFixtureUser({ roleId: viewOnly.id }));
      await viewer.goto("/leave");
      await expect(viewer.getByText("신청한 연차가 없습니다", { exact: true })).toBeVisible();
      await expect(viewer.getByRole("link", { name: "연차 신청" })).toHaveCount(0);
      await expect(viewer.getByRole("button", { name: "연차 신청" })).toHaveCount(0);
      await viewer.context().close();

      // 양성 대조 — write가 있는 전용 사용자의 EMPTY에는 3차 `연차 신청`이 있다.
      const writer = await login(browser, baseURL, await createFixtureUser({ roleId: DEFAULT_ROLE_ID }));
      await writer.goto("/leave");
      await expect(writer.getByRole("link", { name: "연차 신청" })).toHaveCount(1);
      await writer.context().close();

      const blocked = await login(browser, baseURL, await createFixtureUser({ roleId: none.id }));
      expect(await userMenuItems(blocked, "E2E Employee")).toEqual(["알림함", "내 정보", "로그아웃"]);
      expect((await blocked.goto("/leave"))?.status()).toBe(404);
      await blocked.context().close();
    } finally {
      await setRoleArchived(SYSTEM_VIEWER, viewOnly.id, true);
      await setRoleArchived(SYSTEM_VIEWER, none.id, true);
    }
  });
});

