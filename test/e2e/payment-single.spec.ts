import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, expensePayments, expenses, files } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createTeamExpenseDraft, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { voidEvidence } from "@/domain/evidence";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { formatKrw } from "@/lib/format-number";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { upsertSimpleValue } from "@/repositories/settings";
import { EVIDENCE_REQUIRED } from "@/domain/settings/keys";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { makeEvidenceManagerE2E, setupExpenseE2E, submitLineExpense, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06-03(EXP-06 · OPS-09 · UI-SPEC S5 · 「지출결의 상태 → 1차」): 결재 통과 지출결의 한 건을 지급 권한자가 문서 화면 1차 `지급 완료`로 끝낸다.
// 문서는 05 E2E 도우미(폼 제출)와 04.1 승인 · 05 증빙 무효 처리 도메인 함수로 만든다 — 증빙 0 · 증빙 필수 off(06-04 · 06-06 게이트가 붙어도 P4 유지).

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

// 테스트 계급 「경영관리」 — 전사 업무 범위 · 지출결의 보기 + 지급 처리 쓰기. 결재선 밖 전용 본부 · 팀에 발령한다.
async function makePaymentManagerE2E(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E지급-${suffix}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E지급본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E지급팀-${suffix}` });
  return makePerson("경영관리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

// 줄 하나를 폼으로 제출 → 결재선 넷 승인(approved) → 살아 있는 증빙 전부 무효(증빙 0). 문서 id를 돌려준다.
async function approvedWithoutEvidence(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const expenseId = await submitLineExpense(browser, baseURL, fx, key);
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
    if (approver === fx.ceo && result.status !== "approved") throw new Error(`결재 통과 안 됨: ${result.status}`);
  }
  const voider = await makeEvidenceManagerE2E();
  const alive = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, EXPENSE_DOCUMENT_KIND), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  for (const file of alive) await voidEvidence(voider.viewer, { fileId: file.id, reason: "다른 건 영수증" });
  return expenseId;
}

function paymentSection(page: Page) {
  return page.locator("section", { has: page.getByRole("heading", { level: 2, name: "지급", exact: true }) });
}

test.beforeAll(async () => {
  await upsertSimpleValue(SYSTEM_VIEWER, EVIDENCE_REQUIRED.key, false, null);
});

test.describe("한 건 지급 완료 (06-03)", () => {
  test("지급 권한자 — 1차 `지급 완료` → 1차 자리 결과 글자 · 행동 로그 payment_process", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "tracer");
    const payer = await makePaymentManagerE2E();

    const page = await loginPage(browser, baseURL, payer);
    await page.goto(`/expenses/${expenseId}`);
    const pay = page.getByRole("button", { name: /^지급 완료/ });
    await waitForHydration(pay);
    await expect(paymentSection(page)).toHaveCount(1);
    await expect(paymentSection(page).getByText("지급은 경영관리")).toHaveCount(0);
    await pay.click();

    const result = page.getByTestId("payment-result");
    await expect(result).toHaveText(/^지급 완료 → \d{4}-\d{2}-\d{2} · \d{2}:\d{2}$/);
    await expect(result).toBeFocused();
    await expect(page.getByRole("button", { name: /^지급 완료/ })).toHaveCount(0);

    const logs = await db
      .select({ actorId: actionLog.actorId })
      .from(actionLog)
      .where(and(eq(actionLog.entityId, expenseId), eq(actionLog.actionType, "payment_process")));
    expect(logs).toEqual([{ actorId: payer.viewer.id }]);
    await page.context().close();
  });

  test("대표 — 이 페이즈 버튼 0 + 담당 표기 `지급은 경영관리`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "hold");

    const page = await loginPage(browser, baseURL, fx.ceo);
    await page.goto(`/expenses/${expenseId}`);
    const section = paymentSection(page);
    await expect(section.getByText("지급은 경영관리")).toBeVisible();
    await expect(section.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /지급/ })).toHaveCount(0);
    await page.context().close();
  });

  test("지급된 문서 — 지급 기록이 정본 · 세율 바뀜 줄 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "retry");
    // 제출 스냅숏 지급 총액을 이 문서 행 하나만 바꾼다(전역 세율 · 설정은 그대로 — E2E는 DB 하나를 공유한다).
    const [snapshot] = await db.select({ payableKrw: expenses.payableKrw }).from(expenses).where(eq(expenses.id, expenseId));
    if (snapshot?.payableKrw == null) throw new Error("스냅숏 지급 총액 없음");
    await db
      .update(expenses)
      .set({ payableKrw: snapshot.payableKrw + 1_000 })
      .where(eq(expenses.id, expenseId));
    const payer = await makePaymentManagerE2E();

    const page = await loginPage(browser, baseURL, payer);
    await page.goto(`/expenses/${expenseId}`);
    const pay = page.getByRole("button", { name: /^지급 완료/ });
    await waitForHydration(pay);
    await expect(page.getByTestId("expense-tax-drift")).toHaveCount(1);
    await pay.click();
    await expect(page.getByTestId("payment-result")).toBeVisible();

    await expect(page.getByTestId("expense-tax-drift")).toHaveCount(0);
    await expect(page.getByTestId("expense-tax-line")).toHaveCount(1);
    const [record] = await db
      .select({ payableKrw: expensePayments.payableKrw })
      .from(expensePayments)
      .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
    if (!record) throw new Error("지급 기록 없음");
    await expect(page.getByTestId("payment-paid-line")).toContainText(`지급 총액 ${formatKrw(record.payableKrw)}`);
    await page.context().close();
  });
});

// 05 /review C1 갈래: 쓰기 권한이 빠진 기안자의 번호 없는 작성 중 문서(view null)는 문서 화면으로 오지만 지급 섹션은 결재 통과일 때만이다.
test.describe("05 C1 작성 중 문서의 지급 섹션 (06-03)", () => {
  test("쓰기 권한 없는 기안자 작성 중 문서 — 지급 섹션 없음", async ({ browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 8);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E권한본부-${suffix}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E권한팀-${suffix}` });
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E쓰기회수-${suffix}`, workScope: "company" });
    for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action, allowed: true });
    for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    const email = `e2e-nowrite-${randomUUID()}@example.test`;
    const name = `회수${suffix.slice(0, 4)}`;
    const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId: role.id });
    const today = seoulToday();
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: `${today.slice(0, 4)}-01-01` });
    const drafter: Person = { name, email, password: tempPassword, viewer: { id: userId, roleId: role.id } };
    const content = `권한회수 지급-${suffix}`;
    const { expenseId } = await createTeamExpenseDraft(drafter.viewer, {
      idempotencyKey: randomUUID(),
      fields: { teamExpenseKind: "team_overhead", usageDate: today, content },
    });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: false });

    const page = await loginPage(browser, baseURL, drafter);
    await page.goto(`/expenses/${expenseId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(content);
    await expect(page.getByText("지출결의 불러오기 실패")).toHaveCount(0);
    await expect(page.getByText(/지급 정보 불러오지 못함/)).toHaveCount(0);
    await expect(paymentSection(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /지급/ })).toHaveCount(0);
    await page.context().close();
  });
});
