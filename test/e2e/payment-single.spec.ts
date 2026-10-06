import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, expensePayments, expenses, files } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
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

// 06-04부터 지급이 evidence.required를 읽는다 — 뒤 스펙이 시드 기본값(켜짐)을 보게 되돌린다.
test.afterAll(async () => {
  await upsertSimpleValue(SYSTEM_VIEWER, EVIDENCE_REQUIRED.key, EVIDENCE_REQUIRED.default ?? true, null);
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

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

// 06-04(D-604 · D-605 · Q6): 지급 섹션 칸 — 이체액 · 차이 사유 · 미래 지급일.
test.describe("지급 섹션 칸 (06-04)", () => {
  test("이체액을 다르게 + 차이 사유 + 미래 지급일 → 지급 완료 → 읽기 줄 2행에 차이 부호 · 지급일 = 그 날짜", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "tracer");
    const payer = await makePaymentManagerE2E();
    const future = addDays(seoulToday(), 10);
    const preview = await previewPayable(payer.viewer, { expenseId, payDate: future });
    if (preview.payableKrw == null) throw new Error("지급 총액 없음");
    const transfer = preview.payableKrw - 3_300;

    const page = await loginPage(browser, baseURL, payer);
    await page.goto(`/expenses/${expenseId}`);
    const pay = page.getByRole("button", { name: /^지급 완료/ });
    await waitForHydration(pay);
    const section = paymentSection(page);
    await expect(section.getByLabel("이체액")).toHaveValue(formatKrw(preview.payableKrw));
    await expect(section.getByLabel("차이 사유")).toHaveCount(0);

    await section.getByLabel("지급일").fill(future);
    await section.getByLabel("이체액").fill(String(transfer));
    const hint = section.getByTestId("payment-transfer-hint");
    await expect(hint).toHaveText(`지급 총액 ${formatKrw(preview.payableKrw)} · 차이 -3,300`);
    await expect(pay).toBeEnabled();
    await pay.click();
    await expect(section.getByText("차이 사유 없음 · 사유 적기")).toBeVisible();
    await expect(section.getByLabel("차이 사유")).toBeFocused();
    await section.getByLabel("차이 사유").fill("이체 수수료 차감");
    await pay.click();

    await expect(page.getByTestId("payment-result")).toHaveText(new RegExp(`^지급 완료 → ${future} · \\d{2}:\\d{2}$`));
    await expect(page.getByTestId("payment-paid-line")).toContainText(`지급 총액 ${formatKrw(preview.payableKrw)} · 차이 -3,300`);
    await expect(section.getByText(formatKrw(transfer), { exact: true })).toBeVisible();
    await expect(page.getByTestId("payment-diff-reason")).toHaveText("이체 수수료 차감");
    const [record] = await db
      .select({ payDate: expensePayments.payDate, diffKrw: expensePayments.diffKrw })
      .from(expensePayments)
      .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
    expect(record).toEqual({ payDate: future, diffKrw: -3_300 });
    await page.context().close();
  });
});

test.describe("지급 예정일 제자리 저장 (06-04 · SP-3 ②)", () => {
  test("3차 `지급 예정일 바꾸기` → 칸 dirty면 1차 `예정일 저장` · Esc는 되돌림 · Ctrl+Enter 저장 뒤 이체액 입력값은 남는다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "tracer");
    const payer = await makePaymentManagerE2E();
    const [row] = await db.select({ scheduled: expenses.scheduledPaymentDate }).from(expenses).where(eq(expenses.id, expenseId));
    const original = row?.scheduled ?? null;
    const future = addDays(seoulToday(), 45);

    const page = await loginPage(browser, baseURL, payer);
    await page.goto(`/expenses/${expenseId}`);
    const pay = page.getByRole("button", { name: /^지급 완료/ });
    await waitForHydration(pay);
    const section = paymentSection(page);
    await section.getByLabel("이체액").fill("1234");

    const edit = section.getByRole("button", { name: "지급 예정일 바꾸기" });
    await edit.click();
    const field = section.getByLabel("지급 예정일");
    await expect(field).toBeFocused();
    await expect(section.getByRole("button", { name: "지급 예정일 바꾸기" })).toHaveCount(0);
    await field.fill(future);
    const save = page.getByRole("button", { name: /^예정일 저장/ });
    await expect(save).toBeVisible();
    await expect(page.getByRole("button", { name: /^지급 완료/ })).toHaveCount(0);

    await field.press("Escape");
    await expect(section.getByLabel("지급 예정일")).toHaveCount(0);
    await expect(save).toHaveCount(0);
    await expect(pay).toBeVisible();
    await expect(section.getByRole("button", { name: "지급 예정일 바꾸기" })).toBeFocused();

    await section.getByRole("button", { name: "지급 예정일 바꾸기" }).click();
    await section.getByLabel("지급 예정일").fill(future);
    await section.getByLabel("지급 예정일").press("Enter");
    await expect(save).toBeVisible();
    await page.keyboard.press("Control+Enter");

    await expect(section.getByLabel("지급 예정일")).toHaveCount(0);
    await expect(section.getByText(future, { exact: true })).toBeVisible();
    await expect(pay).toBeFocused();
    await expect(section.getByLabel("이체액")).toHaveValue("1,234");
    const [saved] = await db.select({ scheduled: expenses.scheduledPaymentDate }).from(expenses).where(eq(expenses.id, expenseId));
    expect(saved?.scheduled).toBe(future);
    const logs = await db
      .select({ detail: actionLog.detail })
      .from(actionLog)
      .where(and(eq(actionLog.entityId, expenseId), eq(actionLog.actionType, "document_update")));
    expect(logs.at(-1)?.detail).toMatchObject({ field: "scheduledPaymentDate", before: original, after: future });
    await page.context().close();
  });
});

test.describe("지급 취소 (06-04 · D-606)", () => {
  test("지급 뒤 2차 `지급 취소` → 사유 → 지급 전 모양으로 돌아가고 1차 `지급 완료`가 다시 선다(포커스)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "tracer");
    const payer = await makePaymentManagerE2E();

    const page = await loginPage(browser, baseURL, payer);
    await page.goto(`/expenses/${expenseId}`);
    const pay = page.getByRole("button", { name: /^지급 완료/ });
    await waitForHydration(pay);
    await pay.click();
    await expect(page.getByTestId("payment-result")).toBeVisible();
    const [record] = await db
      .select({ id: expensePayments.id, payDate: expensePayments.payDate, transferKrw: expensePayments.transferKrw })
      .from(expensePayments)
      .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
    if (!record) throw new Error("지급 기록 없음");
    const [doc] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));

    await page.getByRole("button", { name: "지급 취소", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "지급 취소" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`${doc?.number} · ${record.payDate} 지급 · ${formatKrw(record.transferKrw)}`);
    await expect(dialog).toContainText("지급 전으로 돌아감 · 견적 줄 잠금 풀림");
    const confirm = dialog.getByRole("button", { name: /^지급 취소/ });
    await expect(confirm).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.getByText("사유 없음 · 사유 적기").first()).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^닫기/ })).toBeVisible();
    await dialog.getByLabel("사유").fill("계좌 오입력");
    await page.keyboard.press("Control+Enter");

    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("payment-result")).toHaveCount(0);
    await expect(pay).toBeVisible();
    await expect(pay).toBeFocused();
    const [cancelled] = await db
      .select({ cancelReason: expensePayments.cancelReason, cancelledBy: expensePayments.cancelledBy })
      .from(expensePayments)
      .where(eq(expensePayments.id, record.id));
    expect(cancelled).toEqual({ cancelReason: "계좌 오입력", cancelledBy: payer.viewer.id });
    const logs = await db
      .select({ actorId: actionLog.actorId })
      .from(actionLog)
      .where(and(eq(actionLog.entityId, expenseId), eq(actionLog.actionType, "payment_cancel")));
    expect(logs).toEqual([{ actorId: payer.viewer.id }]);
    await page.context().close();
  });

  test("대표 — 지급된 문서에도 `지급 완료` · `지급 취소` 버튼 요소 0", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "hold");
    const payer = await makePaymentManagerE2E();
    const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
    if (preview.payableKrw == null || !row) throw new Error("지급 준비 실패");
    await completeExpensePayment(payer.viewer, { expenseId, expectedPayableKrw: preview.payableKrw, version: row.version });

    const page = await loginPage(browser, baseURL, fx.ceo);
    await page.goto(`/expenses/${expenseId}`);
    await expect(paymentSection(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /지급 완료|지급 취소/ })).toHaveCount(0);
    await page.context().close();
  });
});

test.describe("증빙 없음 막힘 (06-04 · P3)", () => {
  test("증빙 필수 on · 증빙 0 → `지급 완료` 비활성 + `증빙 없음 · 기안자 {이름}`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "tracer");
    const payer = await makePaymentManagerE2E();
    await upsertSimpleValue(SYSTEM_VIEWER, EVIDENCE_REQUIRED.key, true, null);
    try {
      const page = await loginPage(browser, baseURL, payer);
      await page.goto(`/expenses/${expenseId}`);
      const pay = page.getByRole("button", { name: /^지급 완료/ });
      await waitForHydration(pay);
      await expect(pay).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByText(/^증빙 없음 · 기안자 \S+$/)).toBeVisible();
      await pay.click({ force: true });
      await page.keyboard.press("Control+Enter");
      await expect(page.getByTestId("payment-result")).toHaveCount(0);
      const records = await db.select({ id: expensePayments.id }).from(expensePayments).where(eq(expensePayments.expenseId, expenseId));
      expect(records).toHaveLength(0);
      await page.context().close();
    } finally {
      await upsertSimpleValue(SYSTEM_VIEWER, EVIDENCE_REQUIRED.key, false, null);
    }
  });
});

test.describe("지급 총액 바뀜 뒤 다시 지급 (06-03 검토 P2-1)", () => {
  test("화면을 연 뒤 지급 총액이 바뀌면 거부 + 새 지급 총액이 이체액 칸에 서고, 다시 누르면 새 값으로 지급된다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "hold");
    const payer = await makePaymentManagerE2E();
    const today = seoulToday();
    const before = await previewPayable(payer.viewer, { expenseId, payDate: today });
    if (before.payableKrw == null) throw new Error("지급 총액 없음");

    const page = await loginPage(browser, baseURL, payer);
    await page.goto(`/expenses/${expenseId}`);
    const pay = page.getByRole("button", { name: /^지급 완료/ });
    await waitForHydration(pay);
    const section = paymentSection(page);
    await expect(section.getByLabel("이체액")).toHaveValue(formatKrw(before.payableKrw));

    // 테스트 준비 전용 — 이 문서 행의 공급가액만 바꿔 서버가 다시 계산할 지급 총액을 바꾼다(전역 세율 · 설정은 그대로).
    const [row] = await db.select({ supply: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, expenseId));
    if (row?.supply == null) throw new Error("공급가액 없음");
    await db
      .update(expenses)
      .set({ supplyAmountKrw: row.supply + 100_000 })
      .where(eq(expenses.id, expenseId));
    const after = await previewPayable(payer.viewer, { expenseId, payDate: today });
    if (after.payableKrw == null || after.payableKrw === before.payableKrw) throw new Error("지급 총액이 바뀌지 않았다");

    await pay.click();
    await expect(page.getByText(/지급 총액 바뀜 · 이체액 확인/)).toBeVisible();
    await expect(section.getByLabel("이체액")).toHaveValue(formatKrw(after.payableKrw));
    await expect(page.getByRole("button", { name: /^지급 완료/ })).toBeEnabled();
    await pay.click();

    await expect(page.getByTestId("payment-result")).toBeVisible();
    const [record] = await db
      .select({ payableKrw: expensePayments.payableKrw, transferKrw: expensePayments.transferKrw })
      .from(expensePayments)
      .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
    expect(record).toEqual({ payableKrw: after.payableKrw, transferKrw: after.payableKrw });
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

// 서버에서(도메인 함수로) 지급해 둔다 — 화면은 이미 지급된 상태로 처음 열린다.
async function paidOnServer(payer: Person, expenseId: string, payDate: string): Promise<void> {
  const preview = await previewPayable(payer.viewer, { expenseId, payDate });
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (preview.payableKrw == null || !row) throw new Error("지급 준비 실패");
  await completeExpensePayment(payer.viewer, { expenseId, payDate, expectedPayableKrw: preview.payableKrw, version: row.version });
}

test.describe("06-04 검토 · DOM 감사 수정", () => {
  // 검토 P2-1 — 지급된 상태로 연 문서에서 취소하면 패널 칸이 옛 지급 기록 값(지급일)으로 남았다.
  test("지급된 상태로 연 문서 — 지급 취소 뒤 지급일 기본값은 오늘 · 이체액은 지급 총액이고, 그대로 지급하면 오늘로 저장된다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "tracer");
    const payer = await makePaymentManagerE2E();
    const today = seoulToday();
    const earlier = addDays(today, -3);
    await paidOnServer(payer, expenseId, earlier);
    const current = await previewPayable(payer.viewer, { expenseId, payDate: today });
    if (current.payableKrw == null) throw new Error("지급 총액 없음");

    const page = await loginPage(browser, baseURL, payer);
    await page.goto(`/expenses/${expenseId}`);
    const cancel = page.getByRole("button", { name: "지급 취소", exact: true });
    await waitForHydration(cancel);
    await expect(page.getByTestId("payment-result")).toHaveText(new RegExp(`^지급 완료 → ${earlier} · `));
    await cancel.click();
    const dialog = page.getByRole("dialog", { name: "지급 취소" });
    await dialog.getByLabel("사유").fill("지급일 오입력");
    await page.keyboard.press("Control+Enter");
    await expect(dialog).toHaveCount(0);

    const pay = page.getByRole("button", { name: /^지급 완료/ });
    await expect(pay).toBeFocused();
    const section = paymentSection(page);
    await expect(section.getByLabel("지급일")).toHaveValue(today);
    await expect(section.getByLabel("이체액")).toHaveValue(formatKrw(current.payableKrw));
    await pay.click();
    await expect(page.getByTestId("payment-result")).toHaveText(new RegExp(`^지급 완료 → ${today} · `));
    const [record] = await db
      .select({ payDate: expensePayments.payDate })
      .from(expensePayments)
      .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
    expect(record?.payDate).toBe(today);
    await page.context().close();
  });
});
