import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { assignTeam, createOrgUnit, createTeam, listTeams } from "@/domain/org";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";

// 04.1-02 Task 1 화면 트레이서(EXP-05): /leave/new 신청 → /leave/[id] → /approvals 승인 × 4 → 최종 승인.
// 다른 스펙의 픽스처와 섞이지 않게 전용 본부 · 팀을 도메인 함수로 만들고 기안자 · 팀장 · 본부 책임자를
// 발령한다. 3단(경영관리본부 · 계급 무관)은 기존 경영관리팀에 이 스펙의 한 명을, 4단(대표 · 전사)은 이
// 스펙의 대표를 후보로 둔다 — 다른 스펙의 사람이 같은 자리 후보여도 이 스펙의 사람이 처리할 수 있으면 된다.

type Person = { name: string; email: string; password: string };

// 발령일 = 그해 1월 1일(날짜는 3월 이후라 발령 뒤다 — 날짜 리터럴 없음).
async function makePerson(prefix: string, roleId: string, teamId: string, effectiveFrom: string): Promise<Person> {
  const name = `${prefix}${randomUUID().slice(0, 4)}`;
  const email = `e2e-leave-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom });
  return { name, email, password: tempPassword };
}

async function loginPage(browser: Browser, baseURL: string | undefined, person: Person): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(person.email);
  await page.getByLabel("비밀번호").fill(person.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

async function approveFromInbox(page: Page, documentLabel: string, toast: string | RegExp): Promise<void> {
  await page.goto("/approvals");
  const row = page.getByRole("row").filter({ hasText: documentLabel });
  // 문서 링크는 토큰 색(--accent) — 브라우저 기본 파랑이 아니다(SYSTEM §1 · DOM 감사 04.1-02).
  await expect(row.getByRole("link", { name: documentLabel })).toHaveCSS("color", "rgb(0, 84, 70)");
  await row.getByRole("button", { name: "승인" }).click();
  await expect(page.getByRole("status").filter({ hasText: toast })).toHaveText(toast);
  // 그 행이 `처리함` 그룹 머리글 뒤로 옮겨 가고 행동 버튼이 없다.
  await expect(row.getByRole("button", { name: "승인" })).toHaveCount(0);
  const texts = await page.getByRole("row").allInnerTexts();
  const processedHeader = texts.findIndex((text) => text.trim() === "처리함");
  const documentRow = texts.findIndex((text) => text.includes(documentLabel));
  expect(processedHeader).toBeGreaterThanOrEqual(0);
  expect(documentRow).toBeGreaterThan(processedHeader);
}

test.describe("연차 신청 → 결재함 승인 → 최종 승인 (04.1-02 트레이서)", () => {
  test("직원이 신청하고 결재자 넷이 결재함에서 차례로 승인하면 최종 승인이다", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const { startDate, endDate } = leaveWeekdayRange(today, { week: 0, weekdays: 2 });
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const documentLabel = `연차 · 종일 ${startDate.slice(5)} ~ ${endDate.slice(5)}`;

    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E연차본부-${randomUUID().slice(0, 8)}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E연차팀-${randomUUID().slice(0, 8)}` });
    const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
    if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");

    const drafter = await makePerson("기안", "role-pm", team.id, yearStart);
    const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
    const divisionHead = await makePerson("본부장", "role-division-head", team.id, yearStart);
    const mgmt = await makePerson("경영", "role-pm", mgmtTeam.id, yearStart);
    const ceo = await makePerson("대표", "role-ceo", team.id, yearStart);
    const outsider = await makePerson("무관", "role-pm", team.id, yearStart);

    // 기안자가 /leave/new에서 종일 두 평일을 신청한다.
    const drafterPage = await loginPage(browser, baseURL, drafter);
    await drafterPage.goto("/leave/new");
    await drafterPage.getByLabel("시작일").fill(startDate);
    await drafterPage.getByLabel("종료일").fill(endDate);
    await drafterPage.getByRole("button", { name: "연차 신청" }).click();
    await expect(drafterPage).toHaveURL(/\/leave\/[0-9a-f-]{36}$/);
    const documentUrl = new URL(drafterPage.url()).pathname;
    await expect(drafterPage.getByText(/^LV/)).toBeVisible();
    await expect(drafterPage.getByText("결재 중", { exact: true })).toBeVisible();

    // 결재 차례가 아닌 사람은 404다.
    const outsiderPage = await loginPage(browser, baseURL, outsider);
    const response = await outsiderPage.goto(documentUrl);
    expect(response?.status()).toBe(404);

    // 팀장 → 본부 책임자 → 경영관리 → 대표 차례로 승인.
    await approveFromInbox(await loginPage(browser, baseURL, teamLead), documentLabel, `승인 · 결재 요청됨 → ${divisionHead.name}`);
    // 3단 · 4단 후보는 다른 스펙의 사람과 함께일 수 있어(`… 외 N명`) 앞부분만 본다.
    await approveFromInbox(await loginPage(browser, baseURL, divisionHead), documentLabel, /^승인 · 결재 요청됨 → .+/);
    await approveFromInbox(await loginPage(browser, baseURL, mgmt), documentLabel, /^승인 · 결재 요청됨 → .+/);
    await approveFromInbox(await loginPage(browser, baseURL, ceo), documentLabel, "승인 · 최종 승인 · 2일 차감");

    await drafterPage.goto(documentUrl);
    await expect(drafterPage.getByText("승인", { exact: true })).toBeVisible();
  });
});
