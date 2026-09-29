import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createRole, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell, setVisibilityCell } from "@/domain/permissions/matrix";
import { listPeople, registerPerson, setHireDate, setResignationDate } from "@/domain/people";
import { addLeaveAdjustment } from "@/domain/leave/balance-service";
import { getSettingValue } from "@/domain/settings/registry";
import { LEAVE_ANNUAL_DAYS } from "@/domain/settings/keys";
import { seoulDateToUtcDate } from "@/lib/dates";
import { listLeaveAdjustments } from "@/repositories/leave-adjustments";
import { setRoleArchived } from "@/repositories/roles";
import {
  allocateLeave,
  balanceFiscalYears,
  buildLeaveGrants,
  checkLeaveAdjustment,
  formatBalanceLines,
  resignationBalanceOf,
  summarizeLeaveBalance,
  type LeaveAdjustmentInput,
} from "@/domain/leave/balance";
import { createFixtureUser } from "./fixtures";
import { onStableSeoulDay } from "./leave-dates";

// 04.1-06 Task 3(S9 · D-96 · D-97 · S9-FY): 관리자 사람 상세 `연차` 섹션 — 입사일 · 퇴직일 blur 저장, 잔고 줄(S1과 같은
// 함수 · 퇴직 연도면 퇴직 줄), 연차 조정 추가(연차 = 보는 회계연도 · 월차 = 연도 없음), 조정 기록 표, 등록 폼 입사일 필수.
// 대상은 이 스펙이 만든 전용 사람이고, 날짜 · 기대 문자열은 onStableSeoulDay가 준 오늘과 04.1-03 순수 함수로 계산한다
// (CEO-15 — 네 자리 연도를 적지 않는다). 조정 행의 fiscalYear는 스펙(테스트 코드)만 리포지토리로 읽는다(DTO에 없다).

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

async function adminPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
  return login(browser, baseURL, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
}

// 전용 사람 — 입사일 · 퇴직일 · 조정 없음(다른 사례와 섞이지 않게).
async function makeTarget(prefix: string): Promise<{ id: string; name: string; email: string }> {
  const name = `${prefix}${randomUUID().slice(0, 5)}`;
  const email = `e2e-person-leave-${randomUUID()}@example.test`;
  const { userId } = await registerPerson(SYSTEM_VIEWER, { name, email, roleId: DEFAULT_ROLE_ID });
  return { id: userId, name, email };
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

// 오늘이 든 달에서 6개월 앞 달의 1일(일자를 1로 고정 — 월말 · 일자 차이를 없앤다). 근속 첫 1년이다.
function sixMonthsAgo(today: string): string {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) - 6;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

function annualAdjustment(fiscalYear: number, days: number, today: string): LeaveAdjustmentInput {
  return { id: randomUUID(), bucket: "annual", fiscalYear, amountQuarters: days * 4, createdOn: today };
}

function monthlyAdjustment(days: number, today: string): LeaveAdjustmentInput {
  return { id: randomUUID(), bucket: "monthly", fiscalYear: null, amountQuarters: days * 4, createdOn: today };
}

// 섹션 잔고 기대값 — 페이지(getLeaveBalanceForUser → formatBalanceLines)와 같은 순수 함수 경로.
async function expectedLines(input: {
  hireDate: string | null;
  resignationDate: string | null;
  fiscalYear: number;
  today: string;
  adjustments?: LeaveAdjustmentInput[];
}): Promise<string[]> {
  const years = balanceFiscalYears(input.hireDate, input.fiscalYear);
  const annualDaysByYear: Record<number, number> = {};
  for (const y of years) annualDaysByYear[y] = await getSettingValue(LEAVE_ANNUAL_DAYS, { asOf: seoulDateToUtcDate(`${y}-01-01`) });
  const grants = buildLeaveGrants({
    hireDate: input.hireDate,
    resignationDate: input.resignationDate,
    fiscalYears: years,
    annualDaysByYear,
    adjustments: input.adjustments ?? [],
    asOf: input.today,
  });
  const summary = summarizeLeaveBalance({
    fiscalYear: input.fiscalYear,
    asOf: input.today,
    hireDate: input.hireDate,
    grants,
    allocations: allocateLeave(grants, []),
  });
  return formatBalanceLines({ ...summary, resignation: resignationBalanceOf(summary, input.resignationDate) }).map((line) => line.text);
}

function section(page: Page) {
  return page.getByRole("region", { name: "연차" });
}

function balance(page: Page) {
  return section(page).getByTestId("person-leave-balance").locator("p");
}

function primary(page: Page) {
  return section(page).getByRole("button", { name: /연차 조정 추가$/ });
}

// 조정 추가 — 성공하면 폼이 빈다. 보는 연도 기록에 들어가는 조정이면(연차 = 그 해 · 월차 = 유효 창이 겹치는 해) 기록 맨 위.
async function addAdjustment(page: Page, input: { bucket?: "연차" | "월차"; days: string; reason: string; listed?: boolean }): Promise<void> {
  if (input.bucket) await section(page).getByLabel("잔고").selectOption({ label: input.bucket });
  await section(page).getByLabel("일수").fill(input.days);
  await section(page).getByLabel("사유").fill(input.reason);
  await primary(page).click();
  await expect(section(page).getByLabel("사유")).toHaveValue("");
  if (input.listed === false) return;
  await expect(page.getByRole("table", { name: "연차 조정 기록" }).locator("tbody tr").first()).toContainText(input.reason);
}

async function fiscalYearOf(userId: string, reason: string): Promise<number | null | undefined> {
  return (await listLeaveAdjustments(SYSTEM_VIEWER, userId)).find((row) => row.reason === reason)?.fiscalYear;
}

async function bucketOptions(page: Page): Promise<string[]> {
  return (await section(page).getByLabel("잔고").locator("option").allTextContents()).filter((label) => label !== "—");
}

async function blurSave(page: Page, label: "입사일" | "퇴직일", value: string): Promise<void> {
  const input = section(page).getByLabel(label);
  await input.fill(value);
  // 날짜 칸 안의 Tab은 연 · 월 · 일 칸 사이를 옮길 뿐 칸을 떠나지 않는다 — 칸을 벗어나는 blur를 직접 낸다.
  await input.blur();
}

test.describe("관리자 사람 상세 연차 섹션 (04.1-06 Task 3 · S9)", () => {
  test("입사일 blur 저장 — 새로 고침 없이 잔고 둘째 줄이 첫 1년 월차 줄이고, 새로 고침 뒤에도 남는다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const target = await makeTarget("입사");
      const hireDate = sixMonthsAgo(today);
      const page = await adminPage(browser, baseURL);
      await page.goto(`/admin/people/${target.id}`);

      await blurSave(page, "입사일", hireDate);
      const expected = await expectedLines({ hireDate, resignationDate: null, fiscalYear: yearOf(today), today });
      await expect(balance(page)).toHaveText(expected);
      await expect(balance(page).nth(1)).toHaveText(/^월차 적립 /);
      await page.reload();
      await expect(section(page).getByLabel("입사일")).toHaveValue(hireDate);
      await page.context().close();
    });
  });

  test("연차 조정 -1 · 무단 결근 — 기록 맨 위 · 잔고 `조정 -1일` · 폼 비움 · fiscalYear = 올해", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const year = yearOf(today);
      const target = await makeTarget("조정");
      const page = await adminPage(browser, baseURL);
      await page.goto(`/admin/people/${target.id}`);

      await expect(section(page).getByText(`${year} 회계연도`, { exact: true })).toBeVisible();
      await expect(section(page).getByLabel("잔고")).toHaveValue("annual");
      await addAdjustment(page, { days: "-1", reason: "무단 결근" });
      await expect(balance(page).first()).toContainText("조정 -1일");
      await expect(section(page).getByLabel("일수")).toHaveValue("");
      await expect(section(page).getByLabel("사유")).toHaveValue("");
      expect(await fiscalYearOf(target.id, "무단 결근")).toBe(year);
      await page.context().close();
    });
  });

  test("지난 연도 정정(S9-FY · CX-R6 · T13): 링크로 지난해를 열어 1차 라벨에 연도 · 조정은 그 해 · 올해 보기에는 조정 없음", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const year = yearOf(today);
      const hireDate = sixMonthsAgo(today);
      const target = await makeTarget("지난해");
      await setHireDate(SYSTEM_VIEWER, target.id, hireDate);
      const page = await adminPage(browser, baseURL);
      await page.goto(`/admin/people/${target.id}`);

      await section(page).getByRole("link", { name: `${year - 1} 회계연도` }).click();
      await expect(page).toHaveURL(new RegExp(`\\?year=${year - 1}$`));
      await expect(section(page).getByText(`${year - 1} 회계연도`, { exact: true })).toBeVisible();
      await expect(section(page).getByRole("link", { name: "올해 보기" })).toBeVisible();
      // 폰(375)에서 연도 링크 터치 영역 ≥ 44(DOM 감사 #7 · SYSTEM §10).
      await page.setViewportSize({ width: 375, height: 800 });
      for (const name of [`${year - 2} 회계연도`, "올해 보기"]) {
        expect((await section(page).getByRole("link", { name }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(primary(page)).toHaveText(new RegExp(`^${year - 1} 연차 조정 추가`));
      await section(page).getByLabel("잔고").selectOption({ label: "월차" });
      await expect(primary(page)).toHaveText(/^연차 조정 추가/);
      await section(page).getByLabel("잔고").selectOption({ label: "연차" });

      await addAdjustment(page, { days: "1", reason: "지난해 정정" });
      expect(await fiscalYearOf(target.id, "지난해 정정")).toBe(year - 1);
      const lastYear = await expectedLines({
        hireDate,
        resignationDate: null,
        fiscalYear: year - 1,
        today,
        adjustments: [annualAdjustment(year - 1, 1, today)],
      });
      await expect(balance(page).first()).toHaveText(lastYear[0] ?? "");

      await section(page).getByRole("link", { name: "올해 보기" }).click();
      await expect(page).toHaveURL(new RegExp(`\\?year=${year}$`));
      await expect(section(page).getByText(`${year} 회계연도`, { exact: true })).toBeVisible();
      await expect(balance(page).first()).not.toContainText("조정");

      for (const raw of [String(year + 1), "abc"]) {
        await page.goto(`/admin/people/${target.id}?year=${raw}`);
        await expect(section(page).getByText(`${year} 회계연도`, { exact: true })).toBeVisible();
      }
      await page.context().close();
    });
  });

  test("월차 조정(S9-FY · C-14): 지난해를 보는 중이어도 fiscalYear null · 월차 줄이 순수 함수 결과와 같다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const year = yearOf(today);
      const hireDate = sixMonthsAgo(today);
      const target = await makeTarget("월차");
      await setHireDate(SYSTEM_VIEWER, target.id, hireDate);
      const page = await adminPage(browser, baseURL);
      await page.goto(`/admin/people/${target.id}?year=${year - 1}`);

      // 오늘 입력한 월차 조정은 지난해 기록 목록에 없을 수 있다(유효 창 = 입력한 날 ~ 소멸일) — 올해 화면에서 기록을 본다.
      await addAdjustment(page, { bucket: "월차", days: "1", reason: "월차 정정", listed: false });
      expect(await fiscalYearOf(target.id, "월차 정정")).toBeNull();
      const expected = await expectedLines({
        hireDate,
        resignationDate: null,
        fiscalYear: year - 1,
        today,
        adjustments: [monthlyAdjustment(1, today)],
      });
      await expect(balance(page)).toHaveText(expected);
      await page.goto(`/admin/people/${target.id}`);
      const thisYear = await expectedLines({ hireDate, resignationDate: null, fiscalYear: year, today, adjustments: [monthlyAdjustment(1, today)] });
      await expect(balance(page)).toHaveText(thisYear);
      await expect(page.getByRole("table", { name: "연차 조정 기록" }).locator("tbody tr").first()).toContainText("월차 정정");
      await page.context().close();
    });
  });

  test("막힘 · 칸 오류: 사유가 비면 1차가 막히고, 일수 0.3은 0.25 단위 오류", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const target = await makeTarget("막힘");
      const page = await adminPage(browser, baseURL);
      await page.goto(`/admin/people/${target.id}`);

      await section(page).getByLabel("일수").fill("-1");
      await expect(primary(page)).toBeDisabled();
      // 막힘 줄 = 이유 + 다음 한 수 3차(SYSTEM §7-15 Form.Actions · DOM 감사 #8) — 3차가 사유 칸으로 포커스.
      await expect(section(page).getByText("사유 비어 있음 ·", { exact: true })).toBeVisible();
      await section(page).getByRole("button", { name: "사유 적기" }).click();
      await expect(section(page).getByLabel("사유")).toBeFocused();

      await section(page).getByLabel("일수").fill("0.3");
      await section(page).getByLabel("사유").fill("단위 확인");
      await primary(page).click();
      const unitError = checkLeaveAdjustment({ bucket: "annual", fiscalYear: yearOf(today), amountDays: 0.3, reason: "단위 확인", createdOn: today, hireDate: null });
      await expect(section(page).getByText(unitError?.message ?? "—", { exact: true })).toBeVisible();
      await expect(page.getByText("연차 조정 기록이 없습니다", { exact: true })).toBeVisible();
      await page.context().close();
    });
  });

  test("지난해 퇴직(CXF2-C-F2-01 · C-N01): 기본 섹션 연도 = 퇴직 연도 · 조정도 그 해 · 올해 보기는 보통 줄 · 퇴직 전 해는 퇴직 줄 없음", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const year = yearOf(today);
      const resignationDate = `${year - 1}-06-30`;
      const target = await makeTarget("퇴직");
      await setResignationDate(SYSTEM_VIEWER, target.id, resignationDate);
      const page = await adminPage(browser, baseURL);
      await page.goto(`/admin/people/${target.id}`);

      await expect(section(page).getByText(`${year - 1} 회계연도`, { exact: true })).toBeVisible();
      await addAdjustment(page, { days: "1", reason: "퇴직 정정" });
      expect(await fiscalYearOf(target.id, "퇴직 정정")).toBe(year - 1);
      const resigned = await expectedLines({
        hireDate: null,
        resignationDate,
        fiscalYear: year - 1,
        today,
        adjustments: [annualAdjustment(year - 1, 1, today)],
      });
      expect(resigned[0]).toMatch(/^퇴직 /);
      await expect(balance(page)).toHaveText(resigned);

      await page.goto(`/admin/people/${target.id}?year=abc`);
      await expect(section(page).getByText(`${year - 1} 회계연도`, { exact: true })).toBeVisible();

      await section(page).getByRole("link", { name: "올해 보기" }).click();
      await expect(page).toHaveURL(new RegExp(`\\?year=${year}$`));
      await expect(section(page).getByText(`${year} 회계연도`, { exact: true })).toBeVisible();
      await expect(balance(page).first()).not.toHaveText(/^퇴직 /);
      await expect(balance(page)).toHaveText(await expectedLines({ hireDate: null, resignationDate, fiscalYear: year, today }));
      await addAdjustment(page, { days: "1", reason: "올해 정정" });
      expect(await fiscalYearOf(target.id, "올해 정정")).toBe(year);

      await page.goto(`/admin/people/${target.id}?year=${year - 2}`);
      await expect(balance(page).first()).not.toHaveText(/^퇴직 /);
      await expect(balance(page)).toHaveText(await expectedLines({ hireDate: null, resignationDate, fiscalYear: year - 2, today }));
      await page.context().close();
    });
  });

  test("올해 퇴직은 퇴직 줄 하나(금액 없음), 다음 해 퇴직은 올해 보통 줄", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const year = yearOf(today);
      const page = await adminPage(browser, baseURL);

      const thisYear = await makeTarget("올해퇴직");
      await page.goto(`/admin/people/${thisYear.id}`);
      await blurSave(page, "퇴직일", `${year}-12-28`);
      const resigned = await expectedLines({ hireDate: null, resignationDate: `${year}-12-28`, fiscalYear: year, today });
      await expect(balance(page)).toHaveText(resigned);
      expect(resigned[0]).toMatch(new RegExp(`^퇴직 ${year}-12-28 · 남은 연차 .*일 · 월차 .*일$`));
      await expect(section(page)).not.toContainText("원");

      const nextYear = await makeTarget("다음해퇴직");
      await setResignationDate(SYSTEM_VIEWER, nextYear.id, `${year + 1}-03-31`);
      await page.goto(`/admin/people/${nextYear.id}`);
      await expect(section(page).getByText(`${year} 회계연도`, { exact: true })).toBeVisible();
      await expect(balance(page).first()).not.toHaveText(/^퇴직 /);
      await expect(balance(page)).toHaveText(await expectedLines({ hireDate: null, resignationDate: `${year + 1}-03-31`, fiscalYear: year, today }));
      await page.goto(`/admin/people/${nextYear.id}?year=${year + 1}`);
      await expect(section(page).getByText(`${year} 회계연도`, { exact: true })).toBeVisible();
      await page.context().close();
    });
  });

  test("월차 옵션(CX-R5 · CX2-03 · C-02): 처음 값 연차 · 입사일 없음/소멸이면 월차가 빠지고 거부 문구 · 입사일을 넣으면 돌아오고 · 고른 월차가 막히면 연차로", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const year = yearOf(today);
      const page = await adminPage(browser, baseURL);
      const noHire = await makeTarget("입사없음");
      await page.goto(`/admin/people/${noHire.id}`);
      await expect(section(page).getByLabel("잔고")).toHaveValue("annual");
      expect(await bucketOptions(page)).toEqual(["연차"]);
      const noHireReason = checkLeaveAdjustment({ bucket: "monthly", fiscalYear: null, amountDays: 1, reason: "-", createdOn: today, hireDate: null });
      await expect(section(page).getByText(noHireReason?.message ?? "—", { exact: true })).toBeVisible();

      await blurSave(page, "입사일", sixMonthsAgo(today));
      await expect.poll(() => bucketOptions(page)).toEqual(["연차", "월차"]);
      await expect(section(page).getByText(noHireReason?.message ?? "—", { exact: true })).toHaveCount(0);

      await section(page).getByLabel("잔고").selectOption({ label: "월차" });
      const expiredHire = `${year - 2}-01-01`;
      await blurSave(page, "입사일", expiredHire);
      await expect.poll(() => bucketOptions(page)).toEqual(["연차"]);
      await expect(section(page).getByLabel("잔고")).toHaveValue("annual");
      const expired = checkLeaveAdjustment({ bucket: "monthly", fiscalYear: null, amountDays: 1, reason: "-", createdOn: today, hireDate: expiredHire });
      await expect(section(page).getByText(expired?.message ?? "—", { exact: true })).toBeVisible();
      await page.context().close();
    });
  });

  test("권한(CX-R2 · CXF-C-F06): 보기만이면 읽기 전용 기록 · 노출 없으면 사유가 응답에 없음 · 권한 없으면 404", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const target = await makeTarget("권한");
      const author = await registerPerson(SYSTEM_VIEWER, { name: "조정입력", email: `e2e-author-${randomUUID()}@example.test`, roleId: SYSADMIN_ROLE_ID });
      await addLeaveAdjustment(
        { id: author.userId, roleId: SYSADMIN_ROLE_ID },
        { userId: target.id, bucket: "annual", fiscalYear: yearOf(today), amountDays: -1, reason: "무단 결근" },
      );
      const suffix = randomUUID().slice(0, 8);
      const viewOnly = await createRole(SYSTEM_VIEWER, { name: `E2E 사람보기노출 ${suffix}` });
      const viewHidden = await createRole(SYSTEM_VIEWER, { name: `E2E 사람보기숨김 ${suffix}` });
      const none = await createRole(SYSTEM_VIEWER, { name: `E2E 사람없음 ${suffix}` });
      try {
        for (const role of [viewOnly, viewHidden]) {
          await setPermissionCell(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.people", action: "view", allowed: true });
          await setVisibilityCell(SYSTEM_VIEWER, { roleId: role.id, infoItem: "person.value", visible: true });
        }
        await setVisibilityCell(SYSTEM_VIEWER, { roleId: viewOnly.id, infoItem: "leave.value", visible: true });

        const reader = await login(browser, baseURL, await createFixtureUser({ roleId: viewOnly.id }));
        await reader.goto(`/admin/people/${target.id}`);
        await expect(reader.getByRole("table", { name: "연차 조정 기록" })).toContainText("무단 결근");
        await expect(balance(reader).first()).toContainText("조정 -1일");
        await expect(section(reader).getByLabel("입사일")).toHaveCount(0);
        await expect(section(reader).getByRole("button", { name: /연차 조정 추가$/ })).toHaveCount(0);
        await reader.context().close();

        const hidden = await login(browser, baseURL, await createFixtureUser({ roleId: viewHidden.id }));
        await hidden.goto(`/admin/people/${target.id}`);
        await expect(section(hidden)).toBeVisible();
        expect(await hidden.content()).not.toContain("무단 결근");
        await hidden.context().close();

        const blocked = await login(browser, baseURL, await createFixtureUser({ roleId: none.id }));
        expect((await blocked.goto(`/admin/people/${target.id}`))?.status()).toBe(404);
        expect(await blocked.content()).not.toContain("무단 결근");
        await blocked.context().close();
      } finally {
        for (const role of [viewOnly, viewHidden, none]) await setRoleArchived(SYSTEM_VIEWER, role.id, true);
      }
    });
  });

  test("사람 등록 폼 입사일 필수(D-96 · C-13): 비면 `입사일 비어 있음 · 입사일 적기`, 채우면 등록되고 상세에 그 값", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const page = await adminPage(browser, baseURL);
      const email = `e2e-hire-${randomUUID()}@example.test`;
      await page.goto("/admin/people");
      await page.getByRole("link", { name: "사람 등록" }).click();
      await page.getByLabel("이름").fill(`입사필수${randomUUID().slice(0, 5)}`);
      await page.getByLabel("이메일").fill(email);
      await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
      expect(await page.getByLabel("입사일").getAttribute("required")).toBeNull();
      await page.getByRole("button", { name: "사람 등록" }).click();
      await expect(page.getByText("입사일 비어 있음 · 입사일 적기", { exact: true })).toBeVisible();

      const hireDate = sixMonthsAgo(today);
      await page.getByLabel("입사일").fill(hireDate);
      await page.getByRole("button", { name: "사람 등록" }).click();
      await expect(page.getByText(`초기 비밀번호 — ${email}`)).toBeVisible();
      const person = (await listPeople(SYSTEM_VIEWER)).find((candidate) => candidate.email === email);
      if (!person) throw new Error("등록한 사람이 목록에 없다");
      await page.goto(`/admin/people/${person.id}`);
      await expect(section(page).getByLabel("입사일")).toHaveValue(hireDate);
      await page.context().close();
    });
  });
});
