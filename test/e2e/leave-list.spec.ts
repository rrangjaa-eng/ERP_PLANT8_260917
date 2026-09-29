import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createRole, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell, setVisibilityCell } from "@/domain/permissions/matrix";
import { setRoleArchived } from "@/repositories/roles";
import { previewRoute, rejectDocument } from "@/domain/approvals";
import { LEAVE_DOCUMENT_KIND, listMyLeave, submitLeave } from "@/domain/leave";
import { registerPerson, setHireDate } from "@/domain/people";
import { createOrgUnit, createTeam } from "@/domain/org";
import { getSettingValue } from "@/domain/settings/registry";
import { LEAVE_ANNUAL_DAYS } from "@/domain/settings/keys";
import { seoulDateToUtcDate } from "@/lib/dates";
import { DEFAULT_HALF_PERIOD, formatLeaveDays, type LeaveKind } from "@/domain/leave/days";
import {
  allocateLeave,
  annualGrantQuarters,
  balanceFiscalYears,
  buildLeaveGrants,
  formatBalanceLines,
  formatBalanceRow,
  requestBalanceOf,
  summarizeLeaveBalance,
} from "@/domain/leave/balance";
import { createFixtureUser } from "./fixtures";
import { leaveWeekdayRange, onStableSeoulDay } from "./leave-dates";
import { delayServerActions, setupLeaveOrg } from "./leave-org";

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

// DOM 감사 #4(UI-SPEC Typography): 잔고·일수 숫자는 700 — `일` 앞 숫자 토막이 굵은 요소로 따로 있다.
async function expectDayNumbersBold(scope: Locator, expected: string[]): Promise<void> {
  const numbers = scope.locator("b");
  await expect(numbers).toHaveText(expected);
  for (const weight of await numbers.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontWeight))) {
    expect(weight).toBe("700");
  }
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
      const annual = formatLeaveDays(expected.annualDays * 4).replace("일", "");
      await expectDayNumbersBold(page.getByTestId("leave-balance"), [annual, "0", "0", annual]);
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

// ── 04.1-06 Task 2: 신청 폼(S2) ─────────────────────────────────────────────────────────────────────────

// 신청 창 잔고 행 기대값 — 페이지(previewLeaveBalance)와 같은 순수 함수 경로(buildLeaveGrants → allocateLeave →
// requestBalanceOf → formatBalanceRow)를 같은 입력(입사일 · 오늘 · 다른 신청 없음 · 이 신청)으로.
async function expectedRow(hireDate: string | null, today: string, request: { startDate: string; quarters: number }, kind: LeaveKind) {
  const year = yearOf(request.startDate);
  const years = balanceFiscalYears(hireDate, year);
  const annualDaysByYear: Record<number, number> = {};
  for (const y of years) annualDaysByYear[y] = await getSettingValue(LEAVE_ANNUAL_DAYS, { asOf: seoulDateToUtcDate(`${y}-01-01`) });
  const grants = buildLeaveGrants({ hireDate, resignationDate: null, fiscalYears: years, annualDaysByYear, adjustments: [], asOf: today });
  const allocations = allocateLeave(grants, [{ id: "~preview", startDate: request.startDate, quarters: request.quarters, status: "pending" }]);
  const summary = summarizeLeaveBalance({ fiscalYear: year, asOf: today, hireDate, grants, allocations });
  const row = requestBalanceOf(summary, allocations, "~preview");
  return { row, lines: (formatBalanceRow(row, kind) ?? []).map((line) => line.text), annualDays: annualDaysByYear[year] ?? 0 };
}

function form(page: Page) {
  return page.locator("form#leave-form");
}

function balanceRow(page: Page) {
  return page.getByTestId("leave-balance-row").locator("span");
}

function routeLine(page: Page) {
  return page.getByTestId("approval-route-line");
}

async function openForm(browser: Browser, baseURL: string | undefined, person: { email: string; password: string }): Promise<Page> {
  const page = await login(browser, baseURL, person);
  await page.goto("/leave/new");
  await expect(page.getByLabel("종류")).toHaveValue("full_day");
  // 하이드레이션 전에 채운 입력은 버려진다 — 마운트 미리보기의 잔고 행이 뜬 뒤(= 하이드레이션 끝) 입력한다.
  await expect(page.getByTestId("leave-balance-row")).toBeVisible();
  return page;
}

async function fillRange(page: Page, range: { startDate: string; endDate: string }): Promise<void> {
  await page.getByLabel("시작일").fill(range.startDate);
  await page.getByLabel("종료일").fill(range.endDate);
}

async function myLeaveCount(viewer: Viewer, year: number): Promise<number> {
  return (await listMyLeave(viewer, { fiscalYear: year })).length;
}

// 결재선 이름 사례(C-07) — 사례마다 고유 이름의 기안자 · 전용 팀장을 도메인 registerPerson으로 만든다.
async function namedOrg(today: string, drafterRoleId: string) {
  const suffix = randomUUID().slice(0, 6);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E이름본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E이름팀-${suffix}` });
  const effectiveFrom = `${today.slice(0, 4)}-01-01`;
  const make = async (prefix: string, roleId: string) => {
    const name = `${prefix}${randomUUID().slice(0, 5)}`;
    const email = `e2e-route-${randomUUID()}@example.test`;
    const { userId, tempPassword } = await registerPerson(SYSTEM_VIEWER, { name, email, roleId, teamId: team.id, effectiveFrom });
    return { name, email, password: tempPassword, viewer: { id: userId, roleId } as Viewer };
  };
  return { drafter: await make("이름기안", drafterRoleId), lead: await make("이름팀장", "role-team-lead") };
}

test.describe("연차 신청 폼 /leave/new (04.1-06 Task 2 · S2)", () => {
  test("종일 6일(주말 포함): 힌트 `주말 2일 제외` · 잔고 행 `이번 신청 6일` 한 자리 · 결재선 한 줄", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await openForm(browser, baseURL, org.drafter);
      const range = leaveWeekdayRange(today, { week: 12, weekdays: 6 });
      await fillRange(page, range);

      await expect(form(page).getByText("주말 2일 제외", { exact: true })).toBeVisible();
      await expectDayNumbersBold(page.getByTestId("leave-days-hint"), ["2"]);
      const expected = await expectedRow(null, today, { startDate: range.startDate, quarters: 24 }, "full_day");
      await expect(balanceRow(page)).toHaveText(expected.lines);
      await expectDayNumbersBold(page.getByTestId("leave-balance-row"), [formatLeaveDays(expected.annualDays * 4).replace("일", ""), "0", "6"]);
      expect(expected.lines[0]).toBe(`연차 남음 ${formatLeaveDays(expected.annualDays * 4)} · 결재 중 0일 · 이번 신청 6일`);
      expect(((await form(page).innerText()).match(/이번 신청/g) ?? []).length).toBe(1);
      await expect(routeLine(page)).toHaveText(new RegExp(`^${org.drafter.name} → .* · 결재 규칙$`));
      await page.context().close();
    });
  });

  test("날짜 전(DOM 감사 #2 · UI-SPEC S2 계산 전): 잔고 행 `연차 남음 · 결재 중`이 먼저 있고, 평일 하루를 골라도 1차가 움직이지 않는다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await openForm(browser, baseURL, org.drafter);
      const annual = formatLeaveDays((await expectedBalance(null, today)).annualDays * 4);
      await expect(balanceRow(page)).toHaveText([`연차 남음 ${annual} · 결재 중 0일`]);
      const primary = page.getByRole("button", { name: /^연차 신청/ });
      const before = await primary.boundingBox();

      await page.getByLabel("시작일").fill(leaveWeekdayRange(today, { week: 15, weekdays: 1 }).startDate);
      await expect(balanceRow(page)).toHaveText([`연차 남음 ${annual} · 결재 중 0일 · 이번 신청 1일`]);
      const after = await primary.boundingBox();
      if (!before || !after) throw new Error("1차 버튼 상자 없음");
      expect(after.y).toBe(before.y);
      await page.context().close();
    });
  });

  test("신청 성공(DOM 감사 #3 · UI-SPEC S2): 문서 화면으로 옮긴 뒤 토스트 `연차 신청 · 결재 요청됨 → 담당`이 보이고, 닫히면 주소에서 표시가 빠진다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await openForm(browser, baseURL, org.drafter);
      await page.getByLabel("시작일").fill(leaveWeekdayRange(today, { week: 16, weekdays: 1 }).startDate);
      await expect(balanceRow(page).first()).toHaveText(/ · 이번 신청 1일$/);
      await page.getByRole("button", { name: /^연차 신청/ }).click();

      await expect(page).toHaveURL(/\/leave\/[0-9a-f-]{36}\?submitted=1$/);
      const toast = page.getByRole("status").filter({ hasText: "연차 신청 · " });
      await expect(toast).toHaveText(`연차 신청 · 결재 요청됨 → ${org.teamLead.name}`);
      // 4초 뒤 스스로 닫히면(§7-6) 주소에서 표시를 떼어 새로 고침이 토스트를 다시 띄우지 않는다.
      await expect(toast).toHaveCount(0, { timeout: 8000 });
      await expect(page).toHaveURL(/\/leave\/[0-9a-f-]{36}$/);
      await page.reload();
      await expect(page.getByRole("status").filter({ hasText: "연차 신청 · " })).toHaveCount(0);
      await page.context().close();
    });
  });

  test("입사 다음 해(11:43 · R1/D5): 잔고 행이 연차 남음 · 월차 남음을 따로 보이고 합은 없다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const year = yearOf(today);
      const hireDate = `${year - 1}-10-01`;
      const org = await setupLeaveOrg(today);
      await setHireDate(SYSTEM_VIEWER, org.drafter.viewer.id, hireDate);
      const page = await openForm(browser, baseURL, org.drafter);
      const range = leaveWeekdayRange(today, { week: 13, weekdays: 6 });
      await fillRange(page, range);

      const annualDays = await getSettingValue(LEAVE_ANNUAL_DAYS, { asOf: seoulDateToUtcDate(`${year}-01-01`) });
      const p = formatLeaveDays(annualGrantQuarters({ fiscalYear: year, hireDate, resignationDate: null, annualDays }));
      const expected = await expectedRow(hireDate, today, { startDate: range.startDate, quarters: 24 }, "full_day");
      await expect(balanceRow(page)).toHaveText(expected.lines);
      await expect(balanceRow(page).first()).toHaveText(new RegExp(`^연차 남음 ${p} · 월차 남음 .* · 결재 중 0일 · 이번 신청 6일$`));
      await expect(balanceRow(page).nth(1)).toHaveText(/^차감 예정 월차 .* · 연차 .*$/);
      const monthly = expected.row.monthlyRemaining ?? 0;
      await expect(form(page)).not.toContainText(`남음 ${formatLeaveDays(expected.row.annualRemaining + monthly)}`);
      await page.context().close();
    });
  });

  test("입사일 = 오늘(D4): 반차의 잔고 행에 `월차 남음 0일`이 있다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      await setHireDate(SYSTEM_VIEWER, org.drafter.viewer.id, today);
      const page = await openForm(browser, baseURL, org.drafter);
      await page.getByLabel("종류").selectOption({ label: "반차" });
      const range = leaveWeekdayRange(today, { week: 15, weekdays: 1 });
      await page.getByLabel("날짜").fill(range.startDate);

      const expected = await expectedRow(today, today, { startDate: range.startDate, quarters: 2 }, "half_day");
      expect(expected.lines[0]).toContain("월차 남음 0일");
      await expect(balanceRow(page)).toHaveText(expected.lines);
      await page.context().close();
    });
  });

  test("제어 기본값(T1): 종일로 열리고, 반차는 날짜 하나 + 시간 기본값 · 힌트 없음 · `이번 신청 0.5일`, 재택은 `재택 · 차감 없음` · 잔고 행 없음", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await openForm(browser, baseURL, org.drafter);
      const range = leaveWeekdayRange(today, { week: 20, weekdays: 1 });

      await page.getByLabel("종류").selectOption({ label: "반차" });
      await expect(page.getByLabel("시간")).toHaveValue(DEFAULT_HALF_PERIOD);
      await expect(page.getByLabel("종료일")).toHaveCount(0);
      await page.getByLabel("날짜").fill(range.startDate);
      await expect(balanceRow(page).first()).toHaveText(/ · 이번 신청 0\.5일$/);
      await expect(page.getByTestId("leave-days-hint")).toHaveCount(0);

      await page.getByLabel("종류").selectOption({ label: "재택" });
      await fillRange(page, range);
      await expect(page.getByTestId("leave-days-hint")).toHaveText("재택 · 차감 없음");
      await expect(page.getByTestId("leave-balance-row")).toHaveCount(0);
      await expect(routeLine(page)).toBeVisible();
      await page.context().close();
    });
  });

  test("잔여 초과: 경고만 보이고 1차는 켜져 있으며 신청된다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await openForm(browser, baseURL, org.drafter);
      const range = leaveWeekdayRange(today, { week: 14, weekdays: 16 });
      await fillRange(page, range);

      const expected = await expectedRow(null, today, { startDate: range.startDate, quarters: 64 }, "full_day");
      expect(expected.row.over).toBeGreaterThan(0);
      await expect(balanceRow(page)).toHaveText(expected.lines);
      await expect(balanceRow(page).last()).toHaveText(`잔여 초과 ${formatLeaveDays(expected.row.over)}`);
      const primary = page.getByRole("button", { name: /^연차 신청/ });
      await expect(primary).toBeEnabled();
      await primary.click();
      await expect(page).toHaveURL(/\/leave\/[0-9a-f-]{36}\?submitted=1$/);
      await page.context().close();
    });
  });

  test("필수 막힘(T10): 날짜 없이 Ctrl+Enter면 `시작일 비어 있음 · 시작일 적기` · 3차가 시작일로 포커스", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await openForm(browser, baseURL, org.drafter);
      await page.getByLabel("종류").focus();
      await page.keyboard.press("Control+Enter");
      await expect(form(page).getByText("시작일 비어 있음 · 시작일 적기")).toBeVisible();
      await expect(page).toHaveURL(/\/leave\/new$/);
      await page.getByRole("button", { name: "시작일 적기" }).click();
      await expect(page.getByLabel("시작일")).toBeFocused();
      await page.context().close();
    });
  });

  test("종료일 자동 채움(T10 · #7): 시작일만 골라도 1차가 켜지고, 종료일을 지우면 다시 채워지며, Esc 확인은 `1칸`", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await openForm(browser, baseURL, org.drafter);
      const { startDate } = leaveWeekdayRange(today, { week: 17, weekdays: 1 });
      await page.getByLabel("시작일").fill(startDate);

      await expect(page.getByLabel("종료일")).toHaveValue(startDate);
      await expect(form(page).getByText("시작일 비어 있음")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^연차 신청/ })).toBeEnabled();
      await expect(balanceRow(page).first()).toHaveText(/ · 이번 신청 1일$/);
      await page.getByLabel("종료일").fill("");
      await expect(page.getByLabel("종료일")).toHaveValue(startDate);

      await page.keyboard.press("Escape");
      const dialog = page.getByRole("dialog", { name: "입력 버리기" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("연차 신청 · 1칸", { exact: true })).toBeVisible();
      await page.context().close();
    });
  });

  test("입력 버리기: 비고를 적고 Esc → 확인 → /leave, 아무것도 안 적고 Esc → 바로 /leave", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await openForm(browser, baseURL, org.drafter);
      await page.getByLabel("비고").fill("가족 행사");
      await page.keyboard.press("Escape");
      const dialog = page.getByRole("dialog", { name: "입력 버리기" });
      await expect(dialog.getByText("연차 신청 · 1칸", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "입력 버리기" }).click();
      await expect(page).toHaveURL(/\/leave$/);

      await page.goto("/leave/new");
      await expect(page.getByTestId("leave-balance-row")).toBeVisible();
      await page.getByLabel("종류").focus();
      await page.keyboard.press("Escape");
      await expect(page).toHaveURL(/\/leave$/);
      await page.context().close();
    });
  });

  test("네트워크 실패(#24): `신청 실패 · 네트워크 · 다시 신청` · 입력 그대로 · 3차 `다시 신청`이 한 건을 만든다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await openForm(browser, baseURL, org.drafter);
      const range = leaveWeekdayRange(today, { week: 19, weekdays: 1 });
      await fillRange(page, range);
      await page.getByLabel("비고").fill("병원");
      await expect(balanceRow(page).first()).toHaveText(/ · 이번 신청 1일$/);
      const before = await myLeaveCount(org.drafter.viewer, yearOf(today));

      let aborted = false;
      await page.route("**/*", async (route) => {
        if (!aborted && route.request().method() === "POST" && route.request().headers()["next-action"]) {
          aborted = true;
          await route.abort();
          return;
        }
        await route.continue();
      });
      await page.getByRole("button", { name: /^연차 신청/ }).click();
      await expect(form(page).getByText("신청 실패 · 네트워크 ·")).toBeVisible();
      await expect(page.getByLabel("시작일")).toHaveValue(range.startDate);
      await expect(page.getByLabel("비고")).toHaveValue("병원");
      expect(await myLeaveCount(org.drafter.viewer, yearOf(today))).toBe(before);

      // 코드 검토 L2: 실패 뒤 고친 입력이 `다시 신청`에 그대로 실린다(옛 입력을 다시 보내지 않는다).
      await page.getByLabel("비고").fill("병원 진료");
      await page.getByRole("button", { name: "다시 신청" }).click();
      await expect(page).toHaveURL(/\/leave\/[0-9a-f-]{36}\?submitted=1$/);
      await expect(page.getByText("병원 진료", { exact: true })).toBeVisible();
      expect(await myLeaveCount(org.drafter.viewer, yearOf(today))).toBe(before + 1);
      await page.context().close();
    });
  });

  test("결재선 투영(CX-R3 · C-07): approval.value가 숨은 계급 A는 단계 이름만, 양성 대조는 이름이 있다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const range = leaveWeekdayRange(today, { week: 16, weekdays: 2 });
      const roleA = await createRole(SYSTEM_VIEWER, { name: `E2E 결재선A ${randomUUID().slice(0, 8)}` });
      try {
        await setPermissionCell(SYSTEM_VIEWER, { roleId: roleA.id, menu: "leave", action: "view", allowed: true });
        await setPermissionCell(SYSTEM_VIEWER, { roleId: roleA.id, menu: "leave", action: "write", allowed: true });
        await setVisibilityCell(SYSTEM_VIEWER, { roleId: roleA.id, infoItem: "role.value", visible: true });
        const hidden = await namedOrg(today, roleA.id);
        const preview = await previewRoute(hidden.drafter.viewer, { kind: LEAVE_DOCUMENT_KIND });
        const labels = preview.steps.filter((step) => !step.skipped).map((step) => step.label ?? "");
        expect(labels.length).toBeGreaterThan(0);

        const page = await openForm(browser, baseURL, hidden.drafter);
        await fillRange(page, range);
        await expect(routeLine(page)).toHaveText(new RegExp(`^${labels.join(" → ")}`));
        await expect(form(page)).not.toContainText(hidden.drafter.name);
        await expect(form(page)).not.toContainText(hidden.lead.name);
        await page.context().close();

        const shown = await namedOrg(today, DEFAULT_ROLE_ID);
        const control = await openForm(browser, baseURL, shown.drafter);
        await fillRange(control, range);
        await expect(routeLine(control)).toHaveText(new RegExp(`^${shown.drafter.name} → `));
        await expect(routeLine(control)).toContainText(shown.lead.name);
        await control.context().close();
      } finally {
        await setRoleArchived(SYSTEM_VIEWER, roleA.id, true);
      }
    });
  });

  test("결재선 투영(CX2-02): approval.value · role.value가 둘 다 숨은 계급 B는 `1단 → 2단 …`, 이름 · 계급 이름 · 건너뜀 없음", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const range = leaveWeekdayRange(today, { week: 16, weekdays: 2 });
      const roleB = await createRole(SYSTEM_VIEWER, { name: `E2E 결재선B ${randomUUID().slice(0, 8)}` });
      try {
        await setPermissionCell(SYSTEM_VIEWER, { roleId: roleB.id, menu: "leave", action: "view", allowed: true });
        await setPermissionCell(SYSTEM_VIEWER, { roleId: roleB.id, menu: "leave", action: "write", allowed: true });
        const hidden = await namedOrg(today, roleB.id);
        const preview = await previewRoute(hidden.drafter.viewer, { kind: LEAVE_DOCUMENT_KIND });
        const labels = preview.steps.map((step) => step.label ?? "");
        expect(labels[0]).toBe("1단");

        const page = await openForm(browser, baseURL, hidden.drafter);
        await fillRange(page, range);
        await expect(routeLine(page)).toHaveText(new RegExp(`^${labels.join(" → ")}`));
        for (const hiddenText of [hidden.drafter.name, hidden.lead.name, "팀장", "건너뜀"]) {
          await expect(form(page)).not.toContainText(hiddenText);
        }
        await page.context().close();
      } finally {
        await setRoleArchived(SYSTEM_VIEWER, roleB.id, true);
      }
    });
  });

  test("미리보기 순서(CX-R4): 응답을 쥔 동안 다음 미리보기는 나가지 않고, 풀면 마지막 입력의 `이번 신청 3일`이다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await openForm(browser, baseURL, org.drafter);
      const one = leaveWeekdayRange(today, { week: 18, weekdays: 1 });
      await fillRange(page, one);
      await expect(balanceRow(page).first()).toHaveText(/ · 이번 신청 1일$/);

      let requests = 0;
      let responses = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" && request.headers()["next-action"]) requests += 1;
      });
      page.on("response", (response) => {
        if (response.request().method() === "POST" && response.request().headers()["next-action"]) responses += 1;
      });
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let holding = true;
      await page.route("**/*", async (route) => {
        if (holding && route.request().method() === "POST" && route.request().headers()["next-action"]) {
          holding = false;
          const response = await route.fetch();
          await held;
          await route.fulfill({ response });
          return;
        }
        await route.continue();
      });

      await page.getByLabel("종료일").fill(leaveWeekdayRange(today, { week: 18, weekdays: 2 }).endDate);
      await page.getByLabel("종료일").fill(leaveWeekdayRange(today, { week: 18, weekdays: 3 }).endDate);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));
      expect(requests).toBe(1);

      release();
      await expect.poll(() => responses).toBeGreaterThanOrEqual(2);
      await expect.poll(() => responses === requests).toBe(true);
      await expect(balanceRow(page).first()).toHaveText(/ · 이번 신청 3일$/);
      await page.context().close();
    });
  });

  test("두 번 제출(CEO-12): Ctrl+Enter 두 번 · 빠른 두 번 클릭 모두 한 건, 제출 중 1차 `연차 신청…` · 2차 `취소` aria-disabled", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const year = yearOf(today);

      const page = await openForm(browser, baseURL, org.drafter);
      await fillRange(page, leaveWeekdayRange(today, { week: 10, weekdays: 1 }));
      await expect(balanceRow(page).first()).toHaveText(/ · 이번 신청 1일$/);
      const before = await myLeaveCount(org.drafter.viewer, year);
      await delayServerActions(page, 1500);
      await page.getByLabel("비고").focus();
      await page.keyboard.press("Control+Enter");
      await page.keyboard.press("Control+Enter");
      await expect(page.getByRole("button", { name: /^연차 신청/ })).toHaveText(/연차 신청…/);
      const cancel = page.getByRole("button", { name: /^취소/ });
      await expect(cancel).toHaveAttribute("aria-disabled", "true");
      // 코드 검토 L5(UX-06): 비활성 이유 = 제출 중인 1차 — 취소가 aria-describedby로 1차를 가리킨다.
      const primaryId = await page.getByRole("button", { name: /^연차 신청/ }).getAttribute("id");
      expect(primaryId).toBeTruthy();
      await expect(cancel).toHaveAttribute("aria-describedby", primaryId ?? "");
      expect(await cancel.getAttribute("disabled")).toBeNull();
      await expect(page).toHaveURL(/\/leave\/[0-9a-f-]{36}\?submitted=1$/);
      expect(await myLeaveCount(org.drafter.viewer, year)).toBe(before + 1);
      await page.context().close();

      const second = await openForm(browser, baseURL, org.drafter);
      await fillRange(second, leaveWeekdayRange(today, { week: 11, weekdays: 1 }));
      await expect(balanceRow(second).first()).toHaveText(/ · 이번 신청 1일$/);
      await delayServerActions(second, 1500);
      await second.getByRole("button", { name: /^연차 신청/ }).dblclick();
      await expect(second).toHaveURL(/\/leave\/[0-9a-f-]{36}\?submitted=1$/);
      expect(await myLeaveCount(org.drafter.viewer, year)).toBe(before + 2);
      await second.context().close();
    });
  });

  test("다시 신청 모드(04.1-05 편차 · LOW-8): 같은 폼에 `취소 Esc` · Ctrl+Enter 두 번에 제출 요청 한 번", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const range = leaveWeekdayRange(today, { week: 20, weekdays: 2 });
      const rejected = await submitLeave(org.drafter.viewer, { kind: "full_day", half: "", ...range });
      await rejectDocument(org.teamLead.viewer, { instanceId: rejected.instanceId, expectedVersion: rejected.version, reason: "일정 겹침" });
      const page = await login(browser, baseURL, org.drafter);

      await page.goto(`/leave/${rejected.leaveId}`);
      await expect(page.getByRole("button", { name: /^취소 Esc/ })).toBeVisible();
      await page.getByLabel("비고").focus();
      await page.keyboard.press("Escape");
      await expect(page).toHaveURL(/\/leave$/);

      await page.goto(`/leave/${rejected.leaveId}`);
      await expect(balanceRow(page).first()).toHaveText(/ · 이번 신청 2일$/);
      let submits = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" && request.headers()["next-action"]) submits += 1;
      });
      await delayServerActions(page, 1500);
      await page.getByLabel("비고").focus();
      await page.keyboard.press("Control+Enter");
      await page.keyboard.press("Control+Enter");
      await expect(page.getByRole("button", { name: /^연차 다시 신청/ })).toHaveText(/연차 다시 신청…/);
      await expect(page.getByRole("button", { name: /^취소/ })).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByRole("status").filter({ hasText: "연차 다시 신청 · " })).toBeVisible();
      expect(submits).toBe(1);
      await page.context().close();
    });
  });
});

