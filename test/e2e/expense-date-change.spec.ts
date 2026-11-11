import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { requestDateChange } from "@/domain/expenses/date-change";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { isBusinessDay } from "@/domain/holidays/business-day";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { placeInFundDivision } from "@/test/integration/fixtures/fund-scope";
import { loginPage, makePerson, type Person } from "./leave-org";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, type ExpenseE2E } from "./expense-fixture";
import { approvedDoc, payTargetsUrl } from "./pay-schedule-e2e";

// 07.2-18 S16(X4 · D-7290~D-7296): 승인 뒤 희망 지급일 변경 요청 — 기안자 입구 · 요청 화면 · 대기 줄 · 철회 / 경영관리 처리 줄 · 승인 토스트 `되돌리기` ·
// 거절 창 · 이력 표 · 지급 대상 행 아래 줄 · 계급별 입구 노출 · 320 가로 넘침. 화면 검증 재료로 4폭 캡처를 test-results/07.2-18/에 남긴다.

test.afterAll(archiveTempRoles);

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];
const SHOTS = "test-results/07.2-18";
const WIDTHS = [1280, 768, 375, 320] as const;

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

async function businessDayFrom(date: string): Promise<string> {
  const year = Number(date.slice(0, 4));
  const lookup = await loadHolidayLookup([year, year + 1]);
  let day = date;
  while (!isBusinessDay(day, lookup)) day = addDays(day, 1);
  return day;
}

// 팀 업무 범위 지급 권한자(지급 예정일 바꾸기 = 변경 요청 처리 권한자) — payment-schedule.spec.ts와 같은 꼴.
async function makeTeamPayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E변경요청-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const person = await makePerson("경영관리", role.id, fx.teamId, `${seoulToday().slice(0, 4)}-01-01`);
  await placeInFundDivision(person.viewer.id);
  return person;
}

const HOPE = { date: "", reason: "행사 정산 뒤 지급" };

async function approvedWithHope(fx: ExpenseE2E, payer: Person): Promise<string> {
  const { id } = await approvedDoc(fx, "tracer", payer, { issuedOn: seoulToday() });
  HOPE.date = await businessDayFrom(addDays(seoulToday(), 2));
  await db.update(expenses).set({ requestedPaymentDate: HOPE.date, requestedPaymentReason: HOPE.reason }).where(eq(expenses.id, id));
  return id;
}

// 보이는 값 칸만 — 문서 화면에는 숨은 행 시트 줄도 같은 라벨로 있다(payment-schedule.spec.ts 「보이는 지급 예정일 값 칸」과 같은 꼴).
function kvValue(page: Page, label: string): Locator {
  return page.locator("dt:visible", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");
}

async function noOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.describe("희망 지급일 변경 요청 — 기안자 (07.2-18 Task 1)", () => {
  test("입구 → 요청 화면(포커스 · 막힘) → 제출 → 토스트 · `변경 요청 중` + `요청 철회` · 다른 계급 입구 0 · 철회", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const id = await approvedWithHope(fx, payer);
    const newDate = await businessDayFrom(addDays(seoulToday(), 6));

    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 900 });
    await page.goto(`/expenses/${id}`);
    const hope = kvValue(page, "희망 지급일");
    await expect(hope).toContainText(HOPE.date);
    await hope.getByRole("link", { name: "변경 요청", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${id}/date-request$`));
    await expect(page.getByRole("heading", { name: "희망 지급일 변경 요청" })).toBeVisible();
    await expect(kvValue(page, "현재 희망일")).toHaveText(HOPE.date);
    const dateInput = page.getByLabel("새 희망일");
    await expect(dateInput).toBeFocused();
    await expect(dateInput).toHaveAttribute("min", addDays(seoulToday(), 1));
    const submit = page.locator("#date-request-submit");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("#date-request-blocked")).toHaveText("새 희망일 없음 · ");
    await dateInput.fill(newDate);
    await expect(page.locator("#date-request-blocked")).toHaveText("사유 없음 · ");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await shoot(page, "request-form");
    await page.locator("textarea#reason").fill("행사 일정 연기");
    await expect(submit).not.toHaveAttribute("aria-disabled", "true");
    await submit.click();

    await expect(page).toHaveURL(new RegExp(`/expenses/${id}(\\?|$)`));
    await expect(page.getByRole("status").filter({ hasText: "변경 요청 · 경영관리 확인 대기" })).toBeVisible();
    await expect(hope.getByTestId("date-change-pending")).toContainText(`변경 요청 중 · ${newDate}`);
    await expect(hope.getByRole("button", { name: "요청 철회" })).toBeVisible();
    await expect(page.getByRole("link", { name: "변경 요청", exact: true })).toHaveCount(0);
    await expect(page.getByRole("table", { name: "희망 지급일 변경 이력" })).toContainText("대기");
    await shoot(page, "drafter-pending");

    // 계급별 입구 노출 — 대표 · 팀장은 입구 · 처리 줄 DOM 0, 이력은 읽기.
    for (const other of [fx.ceo, fx.lead]) {
      const otherPage = await loginPage(browser, baseURL, other, { width: 1280, height: 900 });
      await otherPage.goto(`/expenses/${id}`);
      await expect(otherPage.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(otherPage.getByRole("link", { name: "변경 요청", exact: true })).toHaveCount(0);
      await expect(otherPage.getByRole("button", { name: "요청 승인" })).toHaveCount(0);
      await expect(otherPage.getByRole("button", { name: "요청 철회" })).toHaveCount(0);
      await otherPage.context().close();
    }

    await hope.getByRole("button", { name: "요청 철회" }).click();
    await expect(hope.getByRole("link", { name: "변경 요청", exact: true })).toBeVisible();
    await expect(page.getByRole("table", { name: "희망 지급일 변경 이력" })).toContainText("회수");
    await page.context().close();
  });
});

test.describe("희망 지급일 변경 요청 — 경영관리 처리 (07.2-18 Task 2)", () => {
  test("처리 줄 → 승인 토스트 `되돌리기` → 되돌림 → 거절 창(메모 필수) · 지급 대상 행 아래 줄 · 이력", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const id = await approvedWithHope(fx, payer);
    const newDate = await businessDayFrom(addDays(seoulToday(), 7));
    await requestDateChange(fx.pm.viewer, { expenseId: id, newDate, reason: "행사 일정 연기" });

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto(payTargetsUrl(fx.teamId));
    await expect(page.getByText(`희망 지급일 변경 요청 ${newDate.slice(5)}`)).toBeVisible();

    await page.goto(`/expenses/${id}`);
    const hope = kvValue(page, "희망 지급일");
    const decide = hope.getByTestId("date-change-decide");
    await expect(decide).toContainText(newDate);
    await expect(decide).toContainText(fx.pm.name);
    await expect(decide).toContainText(`희망 사유 ${HOPE.reason}`);
    await expect(decide).toContainText("변경 사유 행사 일정 연기");
    const scheduleBefore = (await kvValue(page, "지급 예정일").innerText()).trim();
    await shoot(page, "manager-decide");

    await decide.getByRole("button", { name: "요청 승인" }).click();
    const toast = page.getByRole("status").filter({ hasText: `변경 승인 · 지급 예정일 ${newDate.slice(5)}` });
    await expect(toast).toBeVisible();
    await expect(kvValue(page, "지급 예정일")).toContainText(newDate);
    await expect(hope).toContainText(HOPE.date);
    await expect(page.getByRole("table", { name: "희망 지급일 변경 이력" })).toContainText("승인");
    await page.screenshot({ path: `${SHOTS}/manager-approved-toast-1280.png`, fullPage: true });
    await toast.getByRole("button", { name: "되돌리기" }).click();
    await expect(hope.getByTestId("date-change-decide")).toBeVisible();
    await expect(kvValue(page, "지급 예정일")).not.toContainText(newDate);
    expect((await kvValue(page, "지급 예정일").innerText()).trim()).toBe(scheduleBefore);
    await expect(page.getByRole("table", { name: "희망 지급일 변경 이력" })).toContainText("대기");

    await hope.getByRole("button", { name: "요청 거절" }).click();
    const dialog = page.getByRole("dialog", { name: "변경 요청 거절" });
    await expect(dialog).toBeVisible();
    const primary = dialog.getByRole("button", { name: /요청 거절/ });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await shoot(page, "reject-dialog");
    await dialog.getByLabel("거절 메모").fill("이번 주 지급 확정");
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await primary.click();
    await expect(dialog).toBeHidden();
    const history = page.getByRole("table", { name: "희망 지급일 변경 이력" });
    await expect(history).toContainText("거절");
    await expect(history).toContainText("이번 주 지급 확정");
    await expect(hope.getByTestId("date-change-decide")).toHaveCount(0);
    await shoot(page, "manager-history");
    await page.context().close();
  });
});
