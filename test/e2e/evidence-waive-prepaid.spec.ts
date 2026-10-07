import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, expenseEvidenceReviews, expenses, files } from "@/db/schema";
import { voidEvidence } from "@/domain/evidence";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { makeEvidenceManagerE2E, setupExpenseE2E, submitLineExpense, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06-10(EXP-13 · EVID-03 · D-603 · D-611 · UI-SPEC S6 · S4 empty): 기안자가 폼에서 `선결제`를 켜고 사유를 적어 증빙 없이 제출 → 결재 통과 →
// 증빙 필수 on에서도 지급 완료가 통과하고 증빙 섹션에 `선결제` + 2행 `증빙 기한` · `선결제 사유`가 선다. 문서는 05 폼 · 04.1 승인 도메인 함수로 만든다.

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];
const PREPAID_REASON = "행사 장소 선결제 요구로 증빙을 지급 뒤에 받기로 함";

// 테스트 계급 「경영관리」 — 전사 업무 범위 · 지출결의 보기 + 지급 처리 쓰기. 결재선 밖 전용 본부 · 팀에 발령한다.
async function makePayerE2E(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E지급-${suffix}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E지급본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E지급팀-${suffix}` });
  return makePerson("경영관리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

// 결재선 넷 승인(approved).
async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
    if (approver === fx.ceo && result.status !== "approved") throw new Error(`결재 통과 안 됨: ${result.status}`);
  }
}

// 줄 하나의 작성 중 문서를 만들어 기안자 폼을 연다(증빙은 붙이지 않는다).
async function openDraftForm(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, key: LineKey): Promise<{ page: Page; expenseId: string }> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return { page, expenseId };
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe("선결제 (06-10)", () => {
  test("선결제 사유가 비면 제출이 막히고, 사유를 적으면 증빙 없이 제출 → 지급 → 증빙 섹션에 선결제 · 기한 · 사유", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const { page, expenseId } = await openDraftForm(browser, baseURL, fx, "tracer");

    // 선결제 켜기 — 사유 칸과 기한 힌트가 서고, 사유가 비면 1차 옆 이유가 `선결제 사유 없음`이다.
    await expect(page.getByLabel("선결제 사유")).toHaveCount(0);
    await page.getByLabel("선결제", { exact: true }).check();
    const reason = page.getByLabel("선결제 사유");
    await expect(reason).toBeVisible();
    await expect(page.getByText("증빙 기한 지급일부터 14일")).toBeVisible();
    await expect(page.locator("#expense-blocked")).toContainText("선결제 사유 없음 · 사유 적기");
    await expect(page.getByRole("button", { name: /^지출결의 제출/ })).toBeDisabled();
    // must_have 1 · S6 — `선결제`는 첨부 영역 바로 아래(증빙 금액 칸보다 위).
    const prepaidBox = await page.getByLabel("선결제", { exact: true }).boundingBox();
    const attachBox = await page.locator('[data-ui="attachments"]').boundingBox();
    const amountBox = await page.getByLabel("증빙 금액").boundingBox();
    expect(prepaidBox && attachBox && amountBox && attachBox.y < prepaidBox.y && prepaidBox.y < amountBox.y).toBe(true);

    // 끄면 적은 사유는 버린다(S6) — 다시 켜면 빈 칸.
    await reason.fill("버릴 사유");
    await page.getByLabel("선결제", { exact: true }).uncheck();
    await page.getByLabel("선결제", { exact: true }).check();
    await expect(page.getByLabel("선결제 사유")).toHaveValue("");

    // 사유를 적으면 증빙 0이어도 제출이 풀린다.
    await reason.fill(PREPAID_REASON);
    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
    // 제출 뒤 문서 화면 — 읽기 줄 `선결제 사유` 원문, 선결제를 켜고 끄는 칸은 없다(O-4).
    await expect(page.getByTestId("prepaid-reason")).toHaveText(PREPAID_REASON);
    await expect(page.getByLabel("선결제", { exact: true })).toHaveCount(0);
    await page.context().close();

    await approveAll(fx, expenseId);
    const payer = await makePayerE2E();
    const payerPage = await loginPage(browser, baseURL, payer);
    await payerPage.goto(`/expenses/${expenseId}`);
    const pay = payerPage.getByRole("button", { name: /^지급 완료/ });
    await waitForHydration(pay);
    await pay.click();
    await expect(payerPage.getByTestId("payment-result")).toHaveText(/^지급 완료 → /);

    // 지급 뒤 다시 읽는다 — `선결제` + 2행 `증빙 기한 {지급일 + 14일}` · `선결제 사유` 원문.
    await payerPage.reload();
    const evidence = payerPage.getByTestId("evidence-review");
    await expect(evidence.getByText("선결제", { exact: true })).toBeVisible();
    await expect(payerPage.getByTestId("evidence-prepaid-due")).toHaveText(`증빙 기한 ${addDays(seoulToday(), 14).slice(5)}`);
    await expect(payerPage.getByTestId("prepaid-reason")).toHaveText(PREPAID_REASON);
    await payerPage.context().close();
  });

  test("증빙 금액 칸 오류 → 고쳐 저장 · 부가세 포함 금액은 저장 막힘(EA-1)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const { page } = await openDraftForm(browser, baseURL, fx, "hold");
    const amount = page.getByLabel("증빙 금액");
    const save = page.getByRole("button", { name: /^임시 저장/ });

    // 0 이하 → 서버 칸 오류 원문, 칸 입력값은 남는다.
    await amount.fill("0");
    await save.click();
    await expect(page.locator("#evidenceAmount-error")).toHaveText("증빙 금액 0 이하 · 금액 고치기");
    await expect(amount).toHaveValue("0");

    // 공급가 12,400,000 + 부가세 1,240,000(세금계산서 10%) = 13,640,000 → 부가세 포함 금액 거부.
    await amount.fill("13640000");
    await save.click();
    await expect(page.locator("#evidenceAmount-error")).toHaveText("부가세 포함 금액 · 공급가로 입력");

    // 공급가로 고쳐 적으면 저장 전에 칸 오류가 사라지고, 저장된다.
    await amount.fill("12400000");
    await expect(page.locator("#evidenceAmount-error")).toHaveCount(0);
    await expect(amount).not.toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("증빙일").fill(seoulToday());
    await save.click();
    await expect(page.getByText(/^임시 저장됨 /)).toBeVisible();
    await expect(page.locator("#evidenceAmount-error")).toHaveCount(0);
    await page.context().close();
  });
});

// 결재 통과 → 살아 있는 증빙 전부 무효(증빙 0, 선결제 아님) = 지급 행 P3.
async function approvedWithoutEvidence(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const expenseId = await submitLineExpense(browser, baseURL, fx, key);
  await approveAll(fx, expenseId);
  const voider = await makeEvidenceManagerE2E();
  const alive = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, EXPENSE_DOCUMENT_KIND), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  for (const file of alive) await voidEvidence(voider.viewer, { fileId: file.id, reason: "다른 건 영수증" });
  return expenseId;
}

test.describe("증빙 면제 (06-10)", () => {
  test("증빙 0 → 3차 `증빙 면제` → 사유 → 확인 → `면제` 2행 · 1차 `지급 완료` → 지급 완료", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedWithoutEvidence(browser, baseURL, fx, "retry");
    const payer = await makePayerE2E();
    const page = await loginPage(browser, baseURL, payer);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^지급 완료/ }));

    // 사유가 비면 1차 비활성 + `사유 없음 · 사유 적기`, 적으면 풀린다.
    await page.getByRole("button", { name: "증빙 면제", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: /^증빙 면제/ });
    await expect(confirm).toHaveAttribute("aria-disabled", "true");
    await expect(confirm).toHaveAccessibleDescription("사유 없음 · 사유 적기");
    await dialog.getByLabel("사유").fill("거래처 폐업 · 영수증 재발급 불가");
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    await confirm.click();

    // 면제 뒤 다시 읽은 행 — `면제` 2행(누가 · 사유), 1차 `지급 완료`가 켜지고 포커스가 옮겨 간다.
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("evidence-empty-line")).toHaveCount(0);
    await expect(page.getByTestId("evidence-review-line")).toContainText("거래처 폐업 · 영수증 재발급 불가");
    await expect(page.getByTestId("evidence-review").getByText("면제", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "증빙 면제", exact: true })).toHaveCount(0);
    const payNow = page.getByRole("button", { name: /^지급 완료/ });
    await expect(payNow).not.toHaveAttribute("aria-disabled", "true");
    await expect(payNow).toBeFocused();

    await payNow.click();
    await expect(page.getByTestId("payment-result")).toHaveText(/^지급 완료 → /);

    const logs = await db.select({ detail: actionLog.detail }).from(actionLog).where(and(eq(actionLog.entityId, expenseId), eq(actionLog.actionType, "evidence_waive")));
    expect(logs).toHaveLength(1);
    const reviews = await db.select({ status: expenseEvidenceReviews.status, waiveReason: expenseEvidenceReviews.waiveReason }).from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
    expect(reviews).toEqual([{ status: "waived", waiveReason: "거래처 폐업 · 영수증 재발급 불가" }]);
    await page.context().close();
  });

  // UI-SPEC S5 「행동 뒤 포커스」 — 지급 뒤(P6)에는 1차가 없어 면제 뒤 포커스가 결과 글자로 간다(2차 `지급 취소`가 아니다 — DOM 감사 D-1).
  test("지급된 선결제 문서(P6) → `증빙 면제` → 포커스는 결과 글자", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
    const versionOf = async () => (await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId)))[0]?.version ?? 0;
    await saveExpenseDraft(fx.pm.viewer, { expenseId, expectedVersion: await versionOf(), fields: { prepaid: true, prepaidReason: PREPAID_REASON } });
    const submitted = await submitExpense(fx.pm.viewer, { expenseId, expectedVersion: await versionOf() });
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    await approveAll(fx, expenseId);
    const payer = await makePayerE2E();
    const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
    await completeExpensePayment(payer.viewer, { expenseId, expectedPayableKrw: preview.payableKrw, version: await versionOf() });

    const page = await loginPage(browser, baseURL, payer);
    await page.goto(`/expenses/${expenseId}`);
    const waive = page.getByRole("button", { name: "증빙 면제", exact: true });
    await waitForHydration(waive);
    await waive.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("사유").fill("현장 확인으로 대체");
    await dialog.getByRole("button", { name: /^증빙 면제/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("evidence-review").getByText("면제", { exact: true })).toBeVisible();
    await expect(page.getByTestId("payment-result")).toBeFocused();
    await page.context().close();
  });
});
