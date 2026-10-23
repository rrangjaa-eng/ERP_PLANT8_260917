import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalRoutes, approvalSteps, expenses, projects, vendors } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { payRuleLine, payWeekGroupLabel, payWeekIndex, resolvePaySchedule, type PaySchedule } from "@/domain/payments/pay-schedule";
import { previewPayable, saveScheduledPayDate } from "@/domain/payments";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { updateVendor } from "@/domain/vendors";
import { isBusinessDay } from "@/domain/holidays/business-day";
import { loadPayScheduleConfig } from "@/domain/payments/pay-schedule-load";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { insertLinkFixture, insertRecordFixture } from "../integration/fixtures/evidence";
import { loginPage, makePerson, type Person } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E, archiveTempRoles, insertTempRole } from "./expense-fixture";
import {
  approvedDoc,
  expectTokenColor,
  groupOf,
  payCalendar,
  pushedDoc,
  setVendorTerm,
  submittedDoc,
  targetsGrid,
  type PayCalendar,
} from "./pay-schedule-e2e";

// 07-01 Task 1 트레이서(D-715 · D-741): 지급 예정일을 비워 둔 승인 지출결의가 지급 대상 목록 예정일 칸에 자동 날짜(증빙 작성일 + 기한 안 마지막
// 지급 요일)로 보인다 — 화면(.tsx)은 바꾸지 않았다. 기대값은 같은 순수 함수와 시험 DB의 실제 공휴일 표로 셈한다.
// 새 배지 · 결재 중 묶음 · 규칙 줄 단언은 07-16이 더한다(R7 — 중간 상태).

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

async function teamOf(fx: ExpenseE2E): Promise<string> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return row.teamId;
}

// 팀 업무 범위 지급 권한자 — 이 스펙 프로젝트 팀 문서만 본다(payment-batch.spec.ts와 같은 꼴).
async function makeTeamPayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E지급일정-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

// 증빙 기록(issued_on) 붙임 + 05 파일로 제출 → 결재선 넷 승인 → 확인(P4). 지급 예정일 칸은 비워 둔다.
async function approvedWithRecord(fx: ExpenseE2E, issuedOn: string, payer: Person): Promise<{ id: string; approvedAt: Date }> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id] });
  const id = created.created[0]?.expenseId;
  if (!id) throw new Error("작성 중 문서를 만들지 못했다");
  const recordId = await insertRecordFixture(fx.pm.viewer, { issuedOn });
  await insertLinkFixture({ recordId, ownerId: id, attachedBy: fx.pm.viewer.id });
  const submitted = await submitReadyDraft(fx.pm.viewer, id);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: id });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
  const [doc] = await db.select({ version: expenses.version, scheduled: expenses.scheduledPaymentDate }).from(expenses).where(eq(expenses.id, id));
  if (!doc) throw new Error("문서 없음");
  expect(doc.scheduled).toBeNull();
  await confirmEvidence(payer.viewer, { expenseId: id, version: doc.version });
  const steps = await db
    .select({ actedAt: approvalSteps.actedAt })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, view.instanceId));
  const approvedAt = new Date(Math.max(...steps.map((step) => step.actedAt?.getTime() ?? 0)));
  return { id, approvedAt };
}

async function scheduledCellText(page: Page, itemName: string): Promise<string> {
  const table = page.getByRole("grid", { name: "지급 대상" });
  await expect(table).toBeVisible();
  const index = await table.locator("thead th").evaluateAll((cells) => cells.findIndex((cell) => cell.textContent?.trim() === "예정일"));
  expect(index).toBeGreaterThanOrEqual(0);
  const row = table.locator("tbody tr").filter({ hasText: itemName });
  await expect(row).toHaveCount(1);
  return (await row.locator(":scope > th, :scope > td").nth(index).innerText()).trim();
}

test.afterAll(archiveTempRoles);

test.describe("지급 예정일 자동 계산 (07-01 트레이서)", () => {
  test("증빙 작성일만 있는 승인 건 → 지급 대상 예정일 칸 = 작성일 + 기한 안 마지막 지급 요일(공휴일이면 앞 영업일)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const issuedOn = addDays(seoulToday(), -3);
    const { approvedAt } = await approvedWithRecord(fx, issuedOn, payer);

    const cfg = await loadPayScheduleConfig();
    const year = Number(issuedOn.slice(0, 4));
    const lookup = await loadHolidayLookup([year, year + 1, year + 2]);
    const expected = resolvePaySchedule({ baseDate: issuedOn, termDays: cfg.termDays, manualDate: null, approvedAt, now: new Date(), lookup, cfg });

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await expect(page.getByLabel("상태")).toHaveValue("지급 대상");
    expect(await scheduledCellText(page, fx.lines.tracer.itemName)).toBe(expected.payDate.slice(5));
    await page.context().close();
  });
});

// ── 07-16 Task 2(D-741 · J11 · K9 · SC-03 · D-731 · N4 · U13) ───────────────────────────────────────────────

function payDateOf(cal: PayCalendar, manualDate: string): PaySchedule {
  return resolvePaySchedule({ baseDate: cal.today, termDays: cal.cfg.termDays, manualDate, approvedAt: null, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
}

async function docVersion(id: string): Promise<number> {
  const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, id));
  if (!doc) throw new Error("문서 없음");
  return doc.version;
}

// 그 날 이후 첫 영업일 중 조건에 맞는 날.
function firstDay(cal: PayCalendar, from: string, ok: (date: string) => boolean): string {
  let date = from;
  for (let step = 0; step < 40 && !ok(date); step += 1) date = addDays(date, 1);
  return date;
}

function isFriday(date: string): boolean {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 5;
}

test.describe("지급 대상 머리글 · 결재 중 하위 그룹 (07-16 Task 2)", () => {
  test("이번 주 · 다음 주 머리글 = 07-01 라벨 그대로 · 규칙 줄 없음", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const { schedule: next } = await pushedDoc(fx, "hold", payer, cal);
    const { id } = await approvedDoc(fx, "retry", payer, { issuedOn: addDays(cal.today, -3) });
    const manual = firstDay(cal, cal.today, (date) => isBusinessDay(date, cal.lookup) && payWeekIndex(date, cal.today) === 0);
    await saveScheduledPayDate(payer.viewer, { expenseId: id, scheduledPayDate: manual, version: await docVersion(id) });

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await expect(targetsGrid(page)).toBeVisible();
    expect(await groupOf(page, fx.lines.hold.itemName)).toBe(payWeekGroupLabel(next, cal.today).label);
    expect(await groupOf(page, fx.lines.retry.itemName)).toBe(payWeekGroupLabel(payDateOf(cal, manual), cal.today).label);
    await expect(targetsGrid(page).getByText(/결재 마감/)).toHaveCount(0);
    await page.context().close();
  });

  test("D-741 — 같은 주 금요일 건과 기한 안 마지막 영업일 건은 머리글 둘(각 실제 요일)", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    await setVendorTerm(fx, 6);
    const now = Date.now();
    let base = cal.today;
    for (let step = 0; step < 21; step += 1) {
      const probe = resolvePaySchedule({ baseDate: base, termDays: 6, manualDate: null, approvedAt: null, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
      const friday = addDays(probe.payDate, 1);
      if (probe.pushReason === "no-slot" && probe.cutoffAt.getTime() > now + 3_600_000 && isFriday(friday) && isBusinessDay(friday, cal.lookup)) break;
      base = addDays(base, 1);
    }
    const { approvedAt } = await approvedDoc(fx, "worst", payer, { issuedOn: base });
    const noSlot = resolvePaySchedule({ baseDate: base, termDays: 6, manualDate: null, approvedAt, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
    expect(noSlot.pushReason).toBe("no-slot");
    const friday = addDays(noSlot.payDate, 1);
    const { id } = await approvedDoc(fx, "retry", payer, { issuedOn: addDays(cal.today, -3) });
    await saveScheduledPayDate(payer.viewer, { expenseId: id, scheduledPayDate: friday, version: await docVersion(id) });

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await expect(targetsGrid(page)).toBeVisible();
    const noSlotLabel = payWeekGroupLabel(noSlot, cal.today).label;
    const fridayLabel = payWeekGroupLabel(payDateOf(cal, friday), cal.today).label;
    expect(noSlotLabel).not.toBe(fridayLabel);
    expect(await groupOf(page, fx.lines.worst.itemName)).toBe(noSlotLabel);
    expect(await groupOf(page, fx.lines.retry.itemName)).toBe(fridayLabel);
    await page.context().close();
  });

  test("J11 · K9 — 그 주 결재 중 건은 그룹 맨 아래 `결재 중 · 합계 제외` · 체크박스 없음 · 합계에서 빠지고 `결재 중 1건 · 합계 제외 {합}`(₩ 없음)", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const issuedOn = addDays(cal.today, 7 - cal.cfg.termDays);
    await submittedDoc(fx, "phone", issuedOn);
    const approving = resolvePaySchedule({ baseDate: issuedOn, termDays: cal.cfg.termDays, manualDate: null, approvedAt: null, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
    const week = payWeekIndex(approving.payDate, cal.today);
    test.skip(week !== 0 && week !== 1, "결재 중 건이 이번 주 · 다음 주 밖");
    const { id } = await approvedDoc(fx, "retry", payer, { issuedOn: addDays(cal.today, -3) });
    await saveScheduledPayDate(payer.viewer, { expenseId: id, scheduledPayDate: approving.payDate, version: await docVersion(id) });

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const grid = targetsGrid(page);
    await expect(grid).toBeVisible();
    const label = payWeekGroupLabel(approving, cal.today).label;
    expect(await groupOf(page, fx.lines.retry.itemName)).toBe(label);
    const approvingRow = grid.locator("tbody tr").filter({ hasText: fx.lines.phone.itemName });
    await expect(approvingRow).toHaveCount(1);
    expect(await approvingGroupOf(page, fx.lines.phone.itemName)).toBe("결재 중 · 합계 제외");
    await expect(approvingRow.getByRole("checkbox")).toHaveCount(0);
    await expect(approvingRow.getByRole("link")).toHaveCount(0);
    await expect(approvingRow.getByText("결재 중", { exact: true })).toBeVisible();
    const totals = page.getByRole("region", { name: "합계" });
    await expect(totals).toContainText("합계 (지급 대상 · 1건)");
    const line = page.getByText(/^결재 중 1건 · 합계 제외/);
    await expect(line).toHaveText(/^결재 중 1건 · 합계 제외 [\d,]+$/);
    await expect(line).not.toContainText("₩");
    await page.context().close();
  });

  test("결재 중만 있으면 `이번 주 지급 대상 없음` + 하위 그룹", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const issuedOn = addDays(cal.today, 7 - cal.cfg.termDays);
    await submittedDoc(fx, "phone", issuedOn);
    const approving = resolvePaySchedule({ baseDate: issuedOn, termDays: cal.cfg.termDays, manualDate: null, approvedAt: null, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
    const week = payWeekIndex(approving.payDate, cal.today);
    test.skip(week !== 0 && week !== 1, "결재 중 건이 이번 주 · 다음 주 밖");

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await expect(page.getByText("이번 주 지급 대상 없음", { exact: true })).toBeVisible();
    const table = page.getByRole("table", { name: "지급 대상" }).or(targetsGrid(page));
    await expect(table.locator("tbody tr").filter({ hasText: fx.lines.phone.itemName })).toHaveCount(1);
    expect(await approvingGroupOf(page, fx.lines.phone.itemName)).toBe(`${payWeekGroupLabel(approving, cal.today).label} · 결재 중 · 합계 제외`);
    await page.context().close();
  });

  test("필터(검색)가 결재 중 건만 남기면 — 다른 지급 대상이 있어도 결재 중 하위 그룹 표가 지워지지 않고 `필터 지우기`와 함께 선다", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const issuedOn = addDays(cal.today, 7 - cal.cfg.termDays);
    const approvingId = await submittedDoc(fx, "phone", issuedOn);
    const approving = resolvePaySchedule({ baseDate: issuedOn, termDays: cal.cfg.termDays, manualDate: null, approvedAt: null, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
    const week = payWeekIndex(approving.payDate, cal.today);
    test.skip(week !== 0 && week !== 1, "결재 중 건이 이번 주 · 다음 주 밖");
    await approvedDoc(fx, "retry", payer, { issuedOn: addDays(cal.today, -3) });
    const [doc] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, approvingId));
    if (!doc?.number) throw new Error("문서 번호 없음");

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto(`/expenses?${new URLSearchParams({ status: "지급 대상", q: doc.number })}`);
    const table = page.getByRole("table", { name: "지급 대상" }).or(targetsGrid(page));
    await expect(table.locator("tbody tr").filter({ hasText: fx.lines.phone.itemName })).toHaveCount(1);
    expect(await approvingGroupOf(page, fx.lines.phone.itemName)).toBe(`${payWeekGroupLabel(approving, cal.today).label} · 결재 중 · 합계 제외`);
    await expect(page.getByRole("link", { name: "필터 지우기" })).toBeVisible();
    await page.context().close();
  });
});

// 결재 중 행(링크 없음)의 가장 가까운 그룹 머리글.
async function approvingGroupOf(page: Page, itemName: string): Promise<string> {
  return page.locator("table").first().evaluate((table, name) => {
    const rows = [...table.querySelectorAll("tr")];
    const at = rows.findIndex((tr) => tr.textContent?.includes(name) && tr.querySelectorAll(":scope > td, :scope > th").length > 1);
    for (let index = at - 1; index >= 0; index -= 1) {
      const tr = rows[index];
      if (!tr || !(tr instanceof HTMLElement) || tr.offsetParent === null) continue;
      const cells = tr.querySelectorAll(":scope > td, :scope > th");
      const only = cells[0];
      if (cells.length === 1 && only && (only as HTMLTableCellElement).colSpan > 1) return (only.textContent ?? "").trim();
    }
    return "";
  }, itemName);
}

// 보이는 `지급 예정일` 값 칸 — 문서 화면에는 숨은 행 시트(domain/expenses/detail.ts) 줄도 같은 라벨로 있다(expense-auto-date.spec.ts 「값 칸 전부」).
function scheduleRow(page: Page) {
  return page.locator("dt:visible", { hasText: /^지급 예정일$/ }).locator("xpath=following-sibling::dd[1]");
}

test.describe("상세 지급 예정일 표시 · 수정 (07-16 Task 2 · SC-03)", () => {
  test("기안자 · 결재 중 문서 — 희망 두 줄 · `YYYY-MM-DD (자동)` · 값 아래 규칙 줄 · 따로 선 결재 마감 줄 없음 · 바꾸기 없음", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const issuedOn = addDays(cal.today, -3);
    const id = await submittedDoc(fx, "tracer", issuedOn);
    const hope = addDays(cal.today, 10);
    await db.update(expenses).set({ requestedPaymentDate: hope, requestedPaymentReason: "행사 전 선금" }).where(eq(expenses.id, id));
    const schedule = resolvePaySchedule({ baseDate: issuedOn, termDays: cal.cfg.termDays, manualDate: null, approvedAt: null, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });

    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 900 });
    await page.goto(`/expenses/${id}`);
    // 감사 #8(P3): 표 밖 날짜는 ISO(SYSTEM §2-4) — 바로 아래 `지급 예정일` 값과 같은 꼴.
    await expect(page.locator("dt", { hasText: /^희망 지급일$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText(hope);
    await expect(page.locator("dt", { hasText: /^희망 사유$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText("행사 전 선금");
    const value = scheduleRow(page);
    await expect(value).toContainText(`${schedule.payDate} (자동)`);
    await expect(value).toContainText(payRuleLine(schedule, cal.cfg.termDays, cal.cfg));
    await expect(page.locator("dt", { hasText: /^결재 마감$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "지급 예정일 바꾸기" })).toHaveCount(0);
    await page.context().close();
  });

  test("경영관리 · 결재 통과 문서 — 토요일 거부 · 목요일 저장 → `수동 지정` · `결재 마감 면제` · `자동 계산` · `금요일 아님` · 편집 중 1차 하나 · 자동으로 되돌리기 결과 줄 · 되돌리기", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    test.skip(cal.cfg.payWeekday !== "fri", "설정 지급 요일이 금요일이 아님");
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const { id } = await approvedDoc(fx, "tracer", payer, { issuedOn: addDays(cal.today, -3) });
    const saturday = firstDay(cal, addDays(cal.today, 1), (date) => new Date(`${date}T12:00:00Z`).getUTCDay() === 6);
    const thursday = firstDay(cal, addDays(cal.today, 1), (date) => new Date(`${date}T12:00:00Z`).getUTCDay() === 4 && isBusinessDay(date, cal.lookup));

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto(`/expenses/${id}`);
    const primaries = page.locator('main [data-ui="primary-button"]:visible');
    await expect(page.getByRole("button", { name: /^지급 완료/ })).toBeVisible();
    await page.getByRole("button", { name: "지급 예정일 바꾸기" }).click();
    await expect(page.locator("#payment-scheduled-date")).toBeFocused();
    await expect(primaries).toHaveCount(1);
    await expect(primaries).toContainText("예정일 저장");
    await expect(page.getByRole("button", { name: /^지급 완료/ })).not.toHaveAttribute("data-ui", "primary-button");

    await page.locator("#payment-scheduled-date").fill(saturday);
    await page.getByRole("button", { name: /^예정일 저장/ }).click();
    await expect(page.getByText("영업일만 선택 · 다시 선택")).toBeVisible();

    await page.locator("#payment-scheduled-date").fill(thursday);
    await page.getByRole("button", { name: /^예정일 저장/ }).click();
    const value = scheduleRow(page);
    await expect(value).toContainText(thursday);
    await expect(value.getByText("수동 지정", { exact: true })).toBeVisible();
    await expect(value).toContainText("결재 마감 면제");
    await expect(value).toContainText(/자동 계산 \d{2}-\d{2}/);
    const offWeekday = value.getByText("금요일 아님", { exact: true });
    await expect(offWeekday).toBeVisible();
    await expectTokenColor(offWeekday, "--status-warning");
    await expect(primaries).toHaveCount(1);
    await expect(primaries).toContainText("지급 완료");

    await value.getByRole("button", { name: "자동으로 되돌리기" }).click();
    const result = page.locator('[role="status"]').filter({ hasText: "자동 계산으로 복귀" });
    await expect(result).toBeVisible();
    await expect(result.getByRole("button", { name: "되돌리기" })).toBeFocused();
    await expect(value).toContainText("(자동)");
    await expect(page.getByRole("status").filter({ hasText: "자동 계산으로 복귀" })).toHaveCount(1);
    await result.getByRole("button", { name: "되돌리기" }).click();
    await expect(value.getByText("수동 지정", { exact: true })).toBeVisible();
    await expect(value).toContainText(thursday);
    await page.context().close();
  });

  test("밀린 건 상세 — 값 뒤 `마감 지나 밀림` · 규칙 줄 `결재 마감 MM-DD HH:MM`", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const { id, schedule } = await pushedDoc(fx, "hold", payer, cal);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto(`/expenses/${id}`);
    const value = scheduleRow(page);
    await expect(value.getByText("마감 지나 밀림", { exact: true })).toBeVisible();
    await expect(value).toContainText(payRuleLine(schedule, cal.cfg.termDays, cal.cfg));
    await expect(value).not.toContainText("(자동)");
    await page.context().close();
  });

  // 감사 #1(P1) · #2(P2): 폰에서 3차 둘(`자동으로 되돌리기` · `지급 예정일 바꾸기`)이 값 칸을 0px로 밀어 날짜가 글자마다 꺾였다.
  // 날짜는 어떤 폭에서도 한 줄(SYSTEM §2-4 nowrap) · 규칙 줄은 값 칸 전체 폭 · 폰(<700)에서는 행동이 값 아래 줄 · 가로 넘침 없음.
  test("감사 #1 · #2 — 375 · 320 · 768 · 1280 수동 지정 · 밀린 건 지급 예정일: 날짜 한 줄 · 규칙 줄 접히지 않음 · 폰은 행동이 값 아래", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const { id: manualId } = await approvedDoc(fx, "tracer", payer, { issuedOn: addDays(cal.today, -3) });
    const thursday = firstDay(cal, addDays(cal.today, 1), (date) => new Date(`${date}T12:00:00Z`).getUTCDay() === 4 && isBusinessDay(date, cal.lookup));
    await saveScheduledPayDate(payer.viewer, { expenseId: manualId, scheduledPayDate: thursday, version: await docVersion(manualId) });
    const { id: pushedId, schedule } = await pushedDoc(fx, "hold", payer, cal);
    const cases = [
      { id: manualId, date: thursday, rule: "결재 마감 면제", ruleMax: 1 },
      { id: pushedId, date: schedule.payDate, rule: payRuleLine(schedule, cal.cfg.termDays, cal.cfg), ruleMax: 2 },
    ];

    for (const width of [375, 320, 768, 1280]) {
      const page = await loginPage(browser, baseURL, payer, { width, height: 900 });
      for (const doc of cases) {
        await page.goto(`/expenses/${doc.id}`);
        const value = scheduleRow(page);
        await expect(value).toContainText(doc.date);
        const shape = await value.evaluate(
          (dd, { date, rule }) => {
            const lines = (text: string) => {
              const walker = document.createTreeWalker(dd, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const at = node.textContent?.indexOf(text) ?? -1;
                if (at < 0) continue;
                const range = document.createRange();
                range.setStart(node, at);
                range.setEnd(node, at + text.length);
                return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size;
              }
              return -1;
            };
            const button = [...dd.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "지급 예정일 바꾸기");
            const walker = document.createTreeWalker(dd, NodeFilter.SHOW_TEXT);
            let dateBottom = 0;
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const at = node.textContent?.indexOf(date) ?? -1;
              if (at < 0) continue;
              const range = document.createRange();
              range.setStart(node, at);
              range.setEnd(node, at + date.length);
              dateBottom = range.getBoundingClientRect().bottom;
              break;
            }
            return {
              dateLines: lines(date),
              ruleLines: lines(rule),
              buttonTop: button ? button.getBoundingClientRect().top : -1,
              dateBottom,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
          },
          { date: doc.date, rule: doc.rule },
        );
        expect(shape.dateLines, `${width} ${doc.date} 날짜 줄 수`).toBe(1);
        expect(shape.ruleLines, `${width} 규칙 줄 수`).toBeGreaterThanOrEqual(1);
        expect(shape.ruleLines, `${width} 규칙 줄 수`).toBeLessThanOrEqual(doc.ruleMax);
        expect(shape.overflow, `${width} 가로 넘침`).toBeLessThanOrEqual(0);
        if (width < 700) expect(shape.buttonTop, `${width} 행동이 값 아래`).toBeGreaterThanOrEqual(shape.dateBottom);
      }
      await page.context().close();
    }
  });

  test("키보드 — `지급 예정일 바꾸기` Enter → 칸 포커스 · Esc → 취소 · 포커스가 버튼으로", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const { id } = await approvedDoc(fx, "retry", payer, { issuedOn: addDays(cal.today, -3) });

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto(`/expenses/${id}`);
    const open = page.getByRole("button", { name: "지급 예정일 바꾸기" });
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#payment-scheduled-date")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#payment-scheduled-date")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "지급 예정일 바꾸기" })).toBeFocused();
    await page.context().close();
  });
});

// ── 07-23 Task 1(N2 · B-P2-5 · V9 · AQ-36) ─────────────────────────────────────────────────────────────

// 거래처 관리 + 계좌 수정(vendors.account) 계급 — 도메인으로 계좌를 바꾼다(화면 흐름은 vendors.spec.ts).
async function makeVendorAccountEditor(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E계좌-${randomUUID().slice(0, 8)}`, workScope: "company" });
  for (const menu of ["admin.vendors", "vendors.account"]) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action: "write", allowed: true });
  }
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "vendor.value", visible: true });
  return makePerson("계좌관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

async function methodCell(page: Page, itemName: string) {
  const table = page.getByRole("grid", { name: "지급 대상" });
  await expect(table).toBeVisible();
  const index = await table.locator("thead th").evaluateAll((cells) => cells.findIndex((cell) => cell.textContent?.trim() === "지급 방식"));
  expect(index).toBeGreaterThanOrEqual(0);
  const row = table.locator("tbody tr").filter({ has: page.getByRole("link", { name: itemName, exact: false }) });
  await expect(row).toHaveCount(1);
  return row.locator(":scope > th, :scope > td").nth(index);
}

test.describe("지급 목록 계좌 아래 한 값 `확인 전 > 계좌 바뀜` (07-23 N2)", () => {
  test("확인 전 거래처 → `확인 전` 하나 · 확인됨 + 계좌 바뀜 → `계좌 바뀜` · 그 거래처로 지급 처리 뒤 사라짐", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const editor = await makeVendorAccountEditor(fx);
    const issuedOn = addDays(seoulToday(), -3);
    const paid = await approvedDoc(fx, "tracer", payer, { issuedOn });
    await approvedDoc(fx, "hold", payer, { issuedOn });

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const before = await methodCell(page, fx.lines.hold.itemName);
    await expect(before.getByText("확인 전", { exact: true })).toHaveCount(1);
    await expect(before.getByText("계좌 바뀜", { exact: true })).toHaveCount(0);

    await db.update(vendors).set({ confirmedAt: new Date(), confirmedBy: editor.viewer.id }).where(eq(vendors.id, fx.vendorId));
    const [vendor] = await db.select({ version: vendors.version }).from(vendors).where(eq(vendors.id, fx.vendorId));
    await updateVendor(editor.viewer, fx.vendorId, { name: fx.vendorName, accountNumber: "220987655678", expectedVersion: vendor?.version ?? 0 });
    await page.reload();
    const changed = await methodCell(page, fx.lines.hold.itemName);
    await expect(changed.getByText("계좌 바뀜", { exact: true })).toHaveCount(1);
    await expect(changed.getByText("확인 전", { exact: true })).toHaveCount(0);

    const preview = await previewPayable(payer.viewer, { expenseId: paid.id, payDate: seoulToday() });
    const result = await completePaymentsBatch(payer.viewer, {
      payDate: seoulToday(),
      rows: [{ expenseId: paid.id, expenseVersion: await docVersion(paid.id), expectedPayableKrw: preview.payableKrw ?? 0 }],
    });
    expect(result.processed).toBe(1);
    await page.reload();
    const after = await methodCell(page, fx.lines.hold.itemName);
    await expect(after.getByText("계좌 바뀜", { exact: true })).toHaveCount(0);
    await page.context().close();
  });
});
