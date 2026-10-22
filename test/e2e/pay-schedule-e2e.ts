import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalRoutes, approvalSteps, expenses, projects, vendors } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { resolvePaySchedule, thisWeekPayDate, type PaySchedule, type PayScheduleConfig } from "@/domain/payments/pay-schedule";
import { loadPayScheduleConfig } from "@/domain/payments/pay-schedule-load";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { insertLinkFixture, insertRecordFixture } from "../integration/fixtures/evidence";
import { makePerson, type Person } from "./leave-org";
import { insertTempRole, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 07-16 지급 화면 E2E 공용 준비 — 앱 서버에 시험 시계가 없어(플랜 「E2E 날짜」) 기대 날짜 · 갈래는 07-01 순수 함수(resolvePaySchedule ·
// thisWeekPayDate)와 시험 DB의 실제 공휴일 표 · 설정으로 셈한다. 밀린 건은 승인 단계 acted_at을 이번 주 지급일 마감 1분 뒤로 옮겨 만든다
// (07-06 통합 move-to-this-week와 같은 방식 — 기준일이 오래돼 첫 후보가 지났고, 승인이 이번 주 마감 뒤라 다음 주로 민다).

export const PAY_INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

async function teamOf(fx: ExpenseE2E): Promise<string> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return row.teamId;
}

// 팀 업무 범위 지급 권한자 — 이 스펙 프로젝트 팀 문서만 본다(payment-schedule.spec.ts와 같은 꼴).
export async function makeTeamPayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E지급화면-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of PAY_INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

export type PayCalendar = { today: string; cfg: PayScheduleConfig; lookup: HolidayLookup; thisPay: string };

export async function payCalendar(): Promise<PayCalendar> {
  const today = seoulToday();
  const year = Number(today.slice(0, 4));
  const cfg = await loadPayScheduleConfig();
  const lookup = await loadHolidayLookup([year - 1, year, year + 1, year + 2]);
  return { today, cfg, lookup, thisPay: thisWeekPayDate(today, cfg, lookup) };
}

// 그 날짜에 수동 지정했을 때의 마감(표시용) — 마감 셈은 07-01 함수 하나(cutoffOf가 내보내지 않아 resolvePaySchedule로 읽는다).
export function cutoffOfPayDate(cal: PayCalendar, payDate: string): Date {
  return resolvePaySchedule({ baseDate: cal.today, termDays: cal.cfg.termDays, manualDate: payDate, approvedAt: null, now: new Date(), lookup: cal.lookup, cfg: cal.cfg }).cutoffAt;
}

// 증빙 기록(issued_on) 붙임 + 제출 → 결재선 넷 승인 → (actedAt이 있으면 승인 시각을 그 값으로) → 증빙 확인(P4). 지급 예정일 칸은 비운다.
// note: 07-28이 제출 때 `상세`를 필수로 만들어도 깨지지 않게 submitReadyDraft(공용 픽스처) 관례를 쓴다.
export async function approvedDoc(
  fx: ExpenseE2E,
  key: LineKey,
  payer: Person,
  opts: { issuedOn: string; actedAt?: Date },
): Promise<{ id: string; approvedAt: Date }> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const id = created.created[0]?.expenseId;
  if (!id) throw new Error("작성 중 문서를 만들지 못했다");
  const recordId = await insertRecordFixture(fx.pm.viewer, { issuedOn: opts.issuedOn });
  await insertLinkFixture({ recordId, ownerId: id, attachedBy: fx.pm.viewer.id });
  const submitted = await submitReadyDraft(fx.pm.viewer, id);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: id });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
  const routes = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(eq(approvalRoutes.instanceId, view.instanceId));
  const routeIds = routes.map((route) => route.id);
  if (opts.actedAt) await db.update(approvalSteps).set({ actedAt: opts.actedAt }).where(inArray(approvalSteps.routeId, routeIds));
  const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, id));
  if (!doc) throw new Error("문서 없음");
  await confirmEvidence(payer.viewer, { expenseId: id, version: doc.version });
  const steps = await db.select({ actedAt: approvalSteps.actedAt }).from(approvalSteps).where(and(inArray(approvalSteps.routeId, routeIds)));
  return { id, approvedAt: new Date(Math.max(...steps.map((step) => step.actedAt?.getTime() ?? 0))) };
}

// 제출만 한(결재 중) 문서 — 지급 대상이 아니라 그 주 「결재 중 · 합계 제외」 하위 그룹 재료(07-01 approvingByWeek).
export async function submittedDoc(fx: ExpenseE2E, key: LineKey, issuedOn: string): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const id = created.created[0]?.expenseId;
  if (!id) throw new Error("작성 중 문서를 만들지 못했다");
  const recordId = await insertRecordFixture(fx.pm.viewer, { issuedOn });
  await insertLinkFixture({ recordId, ownerId: id, attachedBy: fx.pm.viewer.id });
  const submitted = await submitReadyDraft(fx.pm.viewer, id);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  return id;
}

// 마감 지나 다음 주로 밀린 승인 건(pushReason cutoff) — 기준일은 기한보다 2주 더 앞(첫 후보가 이미 지남), 승인은 이번 주 지급일 마감 1분 뒤.
export async function pushedDoc(fx: ExpenseE2E, key: LineKey, payer: Person, cal: PayCalendar): Promise<{ id: string; schedule: PaySchedule }> {
  const issuedOn = addDays(cal.today, -(cal.cfg.termDays + 14));
  const actedAt = new Date(cutoffOfPayDate(cal, cal.thisPay).getTime() + 60_000);
  const { id } = await approvedDoc(fx, key, payer, { issuedOn, actedAt });
  const schedule = resolvePaySchedule({ baseDate: issuedOn, termDays: cal.cfg.termDays, manualDate: null, approvedAt: actedAt, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
  expect(schedule.pushReason).toBe("cutoff");
  expect(schedule.payDate > cal.thisPay).toBe(true);
  return { id, schedule };
}

// 거래처를 협력사 갈래 + 지급 기한 N일로(07-06 J5 — CHECK가 협력사 갈래만 받는다).
export async function setVendorTerm(fx: ExpenseE2E, days: number): Promise<void> {
  await db.update(vendors).set({ kind: "supplier", paymentTermDays: days }).where(eq(vendors.id, fx.vendorId));
}

export function targetsGrid(page: Page): Locator {
  return page.getByRole("grid", { name: "지급 대상" });
}

// 그 행(항목 이름)의 주 행 — 행 아래 줄 · 접힌 줄이 아니라 제목 링크가 있는 줄.
export function targetRow(page: Page, itemName: string): Locator {
  return targetsGrid(page).locator("tbody tr").filter({ has: page.getByRole("link", { name: itemName, exact: false }) });
}

// 그 행 위에서 가장 가까운 그룹 머리글 글자(보이는 줄 중 칸 하나가 표 폭 전체인 줄).
export async function groupOf(page: Page, itemName: string): Promise<string> {
  await expect(targetRow(page, itemName)).toHaveCount(1);
  return targetsGrid(page).evaluate((table, name) => {
    const rows = [...table.querySelectorAll("tr")];
    const at = rows.findIndex((tr) => [...tr.querySelectorAll("a")].some((a) => a.textContent?.includes(name)));
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

// 계산된 색이 그 토큰 색인가 — 토큰 값을 같은 문서의 임시 요소로 계산된 rgb로 바꿔 비교한다.
export async function expectTokenColor(locator: Locator, token: string): Promise<void> {
  const [actual, expected] = await locator.evaluate((element, name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(element).color, want];
  }, token);
  expect(actual).toBe(expected);
}
