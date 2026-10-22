import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalRoutes, approvalSteps, expenses } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { resolvePaySchedule } from "@/domain/payments/pay-schedule";
import { loadPayScheduleConfig } from "@/domain/payments/pay-schedule-load";
import { seoulToday } from "@/lib/dates";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { insertLinkFixture, insertRecordFixture } from "../integration/fixtures/evidence";
import { loginPage } from "./leave-org";
import { setupExpenseE2E, archiveTempRoles, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 07-06 Task 1 트레이서(D-715 · D-714 · D-740): 예정일을 적지 않은 승인 지출결의가 지출결의 목록 · 문서 화면에 자동 예정일로 보이고(빈 칸 아님 — D-704),
// 기존 저장값이 있는 문서는 그 값 그대로(수동 지정). 화면(.tsx)은 바꾸지 않았다 — DTO 값만. 기대값은 같은 순수 함수 · 시험 DB 공휴일 표로 셈한다.

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

// 증빙 기록(issued_on) 붙임 + 05 파일로 제출 → 결재선 넷 승인. 지급 예정일 칸은 비워 둔다.
async function approvedWithRecord(fx: ExpenseE2E, line: LineKey, issuedOn: string): Promise<{ id: string; approvedAt: Date }> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[line].id] });
  const id = created.created[0]?.expenseId;
  if (!id) throw new Error("작성 중 문서를 만들지 못했다");
  await insertLinkFixture({ recordId: await insertRecordFixture(fx.pm.viewer, { issuedOn }), ownerId: id, attachedBy: fx.pm.viewer.id });
  const submitted = await submitReadyDraft(fx.pm.viewer, id);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: id });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
  const [doc] = await db.select({ scheduled: expenses.scheduledPaymentDate }).from(expenses).where(eq(expenses.id, id));
  expect(doc?.scheduled).toBeNull();
  const steps = await db
    .select({ actedAt: approvalSteps.actedAt })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, view.instanceId));
  return { id, approvedAt: new Date(Math.max(...steps.map((step) => step.actedAt?.getTime() ?? 0))) };
}

async function listCellText(page: Page, expenseId: string): Promise<string> {
  const table = page.locator("table").filter({ has: page.locator(`a[href="/expenses/${expenseId}"]`) });
  await expect(table).toHaveCount(1);
  const index = await table.locator("thead th").evaluateAll((cells) => cells.findIndex((cell) => cell.textContent?.trim() === "지급 예정"));
  expect(index).toBeGreaterThanOrEqual(0);
  const row = table.locator("tbody tr").filter({ has: page.locator(`a[href="/expenses/${expenseId}"]`) });
  await expect(row).toHaveCount(1);
  return (await row.locator(":scope > th, :scope > td").nth(index).innerText()).trim();
}

// 문서 화면의 「지급 예정일」 값 칸 전부(지급 섹션 값 칸은 날짜 뒤에 지급 담당 안내가 이어진다) — 모두 그 날짜로 시작한다.
async function expectPayDateCells(page: Page, date: string): Promise<void> {
  const cells = page.locator("dt", { hasText: /^지급 예정일$/ }).locator("xpath=following-sibling::dd[1]");
  await expect(cells.first()).toHaveText(new RegExp(`^${date}`));
  for (const text of await cells.allInnerTexts()) expect(text.trim().startsWith(date), text).toBe(true);
}

test.afterAll(archiveTempRoles);

test.describe("지출결의 목록 · 문서 화면 자동 예정일 (07-06 트레이서)", () => {
  test("예정일을 적지 않은 승인 건은 자동 예정일, 기존 저장값이 있는 건은 그 값 그대로", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const issuedOn = addDays(seoulToday(), -3);
    const auto = await approvedWithRecord(fx, "tracer", issuedOn);
    const stored = await approvedWithRecord(fx, "hold", issuedOn);
    const storedDate = addDays(seoulToday(), 9);
    await db.update(expenses).set({ scheduledPaymentDate: storedDate }).where(eq(expenses.id, stored.id));

    const cfg = await loadPayScheduleConfig();
    const year = Number(issuedOn.slice(0, 4));
    const lookup = await loadHolidayLookup([year, year + 1, year + 2]);
    const expected = resolvePaySchedule({ baseDate: issuedOn, termDays: cfg.termDays, manualDate: null, approvedAt: auto.approvedAt, now: new Date(), lookup, cfg });

    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 900 });
    await page.goto(`/expenses?${new URLSearchParams({ status: "승인" })}`);
    expect(await listCellText(page, auto.id)).toBe(expected.payDate.slice(5));
    expect(await listCellText(page, stored.id)).toBe(storedDate.slice(5));

    await page.goto(`/expenses/${auto.id}`);
    await expectPayDateCells(page, expected.payDate);
    await page.goto(`/expenses/${stored.id}`);
    await expectPayDateCells(page, storedDate);
    await page.context().close();
  });
});
