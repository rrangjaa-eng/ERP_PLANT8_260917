import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { loginPage, makePerson, type Person } from "./leave-org";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06-23(S19 · UA-611 · O-15): 첫 화면 「내 차례」의 Phase 6 항목. E2E DB는 스펙끼리 초기화 없이 공유한다 — 건수는 시드 전후 상대값으로 본다(E-28).
// 지급 권한자는 팀 업무 범위로 이 스펙 프로젝트 팀의 문서만 본다(payment-batch.spec.ts 꼴).

const DESKTOP = { width: 1280, height: 900 };
const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];
const PAYMENT_DUE = /지급 — 예정일 지남·오늘 (\d+)건/;

test.afterAll(async () => {
  await archiveTempRoles();
});

async function teamOf(fx: ExpenseE2E): Promise<string> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return row.teamId;
}

async function makeTeamPayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E내차례지급-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

// 줄 하나 → 증빙 붙여 제출 → 결재선 넷 승인(결재 통과 · 지급 전). 문서 id를 돌려준다.
async function approvedLine(fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const submitted = await submitReadyDraft(fx.pm.viewer, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    if (!view) throw new Error("결재 인스턴스 없음");
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
  return expenseId;
}

async function dueCount(page: Page): Promise<number> {
  const label = page.getByText(PAYMENT_DUE);
  if ((await label.count()) === 0) return 0;
  const match = PAYMENT_DUE.exec((await label.first().textContent()) ?? "");
  return Number(match?.[1] ?? 0);
}

test.describe("「내 차례」 Phase 6 — 지급 묶음 (06-23 트레이서)", () => {
  test("지급 묶음 — 지급 대상 보기", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, DESKTOP);
    await page.goto("/");
    const before = await dueCount(page);

    const expenseId = await approvedLine(fx, "tracer");
    await db.update(expenses).set({ scheduledPaymentDate: seoulToday() }).where(eq(expenses.id, expenseId));

    await page.goto("/");
    const row = page.getByRole("listitem").filter({ hasText: PAYMENT_DUE });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("오늘", { exact: true })).toBeVisible();
    expect(await dueCount(page)).toBe(before + 1);

    await row.getByRole("link", { name: "지급 대상 보기" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/expenses");
    expect(new URL(page.url()).searchParams.get("status")).toBe("지급 대상");
  });
});
