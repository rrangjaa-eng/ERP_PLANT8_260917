import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalRoutes, approvalSteps, expenses, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { resolvePaySchedule } from "@/domain/payments/pay-schedule";
import { loadPayScheduleConfig } from "@/domain/payments/pay-schedule-load";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { insertLinkFixture, insertRecordFixture } from "../integration/fixtures/evidence";
import { loginPage, makePerson, type Person } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E, archiveTempRoles, insertTempRole } from "./expense-fixture";

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
