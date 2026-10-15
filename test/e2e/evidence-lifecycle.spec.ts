import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, expenseEvidenceReviews, expensePayments, expenses, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, uniqueReceipt, type ExpenseE2E, type LineKey, archiveTempRoles, insertTempRole } from "./expense-fixture";
import { attachEvidence } from "../integration/fixtures/expenses";

// 06-11(EVID-02 · EVID-04 · C4 · B-1 · U-4) — 증빙 수명 주기: 승인 뒤 기안자가 증빙을 하나 더 붙이면 확인된 문서가 `확인 전`으로 돌아오고,
// 완료 프로젝트의 승인 문서에는 기안자에게 「하나 더」 대신 잠김 한 줄이 선다. 문서는 05 폼 · 04.1 승인 · 06-06 확인 도메인 함수로 만든다.

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];
const EVIDENCE_AMOUNT = 12_400_000;
const EVIDENCE_COMPLETED_PROJECT_LINE = "완료 프로젝트 · 증빙은 경영관리";

// 테스트 계급 「경영관리」 — 전사 업무 범위 · 지출결의 보기 + 지급 처리 쓰기 (+ 선택으로 증빙 붙이기). 결재선 밖 전용 본부 · 팀에 발령한다.
async function makeManagerE2E(options: { attach?: boolean; void?: boolean } = {}): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E수명-${suffix}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  if (options.attach) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.evidence_attach", action: "write", allowed: true });
  if (options.void) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.evidence_void", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E수명본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E수명팀-${suffix}` });
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

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

test.describe("증빙 수명 주기 (06-11)", () => {
  test("경영관리가 확인한 문서에 승인 뒤 기안자가 파일을 하나 더 붙이면 확인 전으로 돌아오고 1차 `공급가액과 같음`이 선다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    await approveAll(fx, expenseId);
    // 테스트 준비 전용 — 기안자 증빙 금액 입력(06-10)을 거치지 않고 금액을 적은 뒤 경영관리가 확인한다.
    await db.update(expenses).set({ evidenceAmount: EVIDENCE_AMOUNT, evidenceDate: seoulToday() }).where(eq(expenses.id, expenseId));
    const manager = await makeManagerE2E();
    await confirmEvidence(manager.viewer, { expenseId, version: await versionOf(expenseId) });

    const payerPage = await loginPage(browser, baseURL, manager);
    await payerPage.goto(`/expenses/${expenseId}`);
    const evidence = payerPage.getByTestId("evidence-review");
    await waitForHydration(payerPage.getByRole("button", { name: /^지급 완료/ }));
    await expect(evidence.getByText("확인됨", { exact: true })).toBeVisible();

    // 기안자 세션 — 승인 뒤 문서 화면의 「하나 더」로 파일을 더한다.
    const drafterPage = await loginPage(browser, baseURL, fx.pm);
    await drafterPage.goto(`/expenses/${expenseId}`);
    await expect(drafterPage.getByText("하나 더", { exact: false }).first()).toBeVisible();
    await drafterPage.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(drafterPage));
    // 완료 통보까지 끝난 행만 `크기 · 날짜`를 그린다(올리는 중인 행은 진행 바).
    await expect(drafterPage.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toHaveCount(2, { timeout: 20_000 });
    await drafterPage.context().close();

    // 경영관리 세션 — 새로 고침 뒤 확인 줄이 `확인 전`, 1차 `공급가액과 같음`(06.5 D-6520 — 기존 `증빙 확인` 자리).
    await payerPage.reload();
    await expect(payerPage.getByTestId("evidence-review").getByText("확인 전", { exact: true })).toBeVisible();
    await expect(payerPage.getByRole("button", { name: /^공급가액과 같음/ })).toBeVisible();
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId))).toHaveLength(0);
    await payerPage.context().close();
  });

  test("완료 프로젝트의 승인 문서 — 기안자 화면에는 「하나 더」 없이 잠김 한 줄, 붙이기 권한자 화면에는 「하나 더」", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "hold");
    await approveAll(fx, expenseId);
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const manager = await makeManagerE2E({ attach: true });

    const drafterPage = await loginPage(browser, baseURL, fx.pm);
    await drafterPage.goto(`/expenses/${expenseId}`);
    const drafterArea = drafterPage.locator('[data-ui="attachments"]');
    await expect(drafterArea).toBeVisible();
    await expect(drafterArea.getByText(EVIDENCE_COMPLETED_PROJECT_LINE, { exact: true })).toBeVisible();
    await expect(drafterArea.getByText("하나 더", { exact: false })).toHaveCount(0);
    await expect(drafterPage.getByTestId("attachments-input")).toHaveCount(0);
    await drafterPage.context().close();

    const managerPage = await loginPage(browser, baseURL, manager);
    await managerPage.goto(`/expenses/${expenseId}`);
    const managerArea = managerPage.locator('[data-ui="attachments"]');
    await expect(managerArea.getByText("하나 더", { exact: false }).first()).toBeVisible();
    await expect(managerArea.getByText(EVIDENCE_COMPLETED_PROJECT_LINE, { exact: true })).toHaveCount(0);
    await managerPage.context().close();
  });
});

// 06.5 D-6520(UI-SPEC V8 개정 4판) — 증빙 확인의 금액은 공급가액 하나: `공급가액과 같음`으로 확정, 지급 전에만 남은 실행가 안에서 고친다,
// 지급 뒤(P5)에는 `바꾸기` 대신 잠김 줄. 줄 실행가 = 공급가 = 12,400,000(픽스처)이라 남은 실행가는 12,400,000이다.
async function prepaidPaidWithLateEvidence(fx: ExpenseE2E, payer: Person): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await saveExpenseDraft(fx.pm.viewer, { expenseId, expectedVersion: await versionOf(expenseId), fields: { prepaid: true, prepaidReason: "행사장 선입금 요구" } });
  const submitted = await submitExpense(fx.pm.viewer, { expenseId, expectedVersion: await versionOf(expenseId) });
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  await approveAll(fx, expenseId);
  const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
  await completeExpensePayment(payer.viewer, { expenseId, expectedPayableKrw: preview.payableKrw, version: await versionOf(expenseId) });
  await attachEvidence(fx.pm.viewer, expenseId);
  return expenseId;
}

test.describe("S4 증빙 확인 = 공급가액 하나 (06.5 D-6520 · UI-SPEC V8)", () => {
  test("P2 — `공급가액` 행 · 1차 `공급가액과 같음` · `공급가액 바꾸기` → 고침 칸 · 다를 때만 `공급가액 고쳐 확인` + 힌트 · 빈 칸 이유 · 상한 오류는 칸에 · 고쳐 확인 → 확인됨 전 → 후", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    await approveAll(fx, expenseId);
    const manager = await makeManagerE2E();
    const page = await loginPage(browser, baseURL, manager);
    await page.goto(`/expenses/${expenseId}`);
    const evidence = page.getByTestId("evidence-review");
    const same = page.getByRole("button", { name: /^공급가액과 같음/ });
    await waitForHydration(same);
    await expect(evidence.getByText("공급가액", { exact: true })).toBeVisible();
    await expect(page.getByText("증빙 금액")).toHaveCount(0);
    const url = page.url();

    // `바꾸기` → 고침 칸(값 = 지금 공급가액 · 포커스) — 같은 값이면 1차 글자 그대로 · 힌트 없음.
    await page.getByRole("button", { name: "공급가액 바꾸기" }).click();
    const field = page.locator("#corrected-supply");
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("12,400,000");
    await expect(same).toBeVisible();
    await expect(page.locator("#corrected-supply-hint")).toHaveCount(0);

    // 다른 값 → 1차 `공급가액 고쳐 확인` + 힌트.
    await field.fill("12,000,000");
    const corrected = page.getByRole("button", { name: /^공급가액 고쳐 확인/ });
    await expect(corrected).toBeVisible();
    await expect(page.locator("#corrected-supply-hint")).toHaveText("확인하면 12,400,000 → 12,000,000");

    // 빈 칸 → 1차 비활성 + 이유(칸 오류로 되풀이하지 않는다).
    await field.fill("");
    await expect(same).toHaveAttribute("aria-disabled", "true");
    await expect(same).toHaveAccessibleDescription("공급가액 비어 있음 · 공급가액 적기");
    await expect(page.locator("#corrected-supply-error")).toHaveCount(0);

    // 남은 실행가를 넘는 값 → 고침 칸 아래 상한 문구 · aria-invalid · 값 유지 · 포커스 · `새로 고침` 없음 · 화면 이동 없음.
    await field.fill("12,500,000");
    await corrected.click();
    await expect(page.locator("#corrected-supply-error")).toHaveText("남은 실행가 12,400,000 넘음 · 공급가액 고치기");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveValue("12,500,000");
    await expect(field).toBeFocused();
    await expect(page.getByRole("button", { name: "새로 고침" })).toHaveCount(0);
    expect(page.url()).toBe(url);

    // 남은 실행가 안 값 → 확인됨 + 2행 ` · 전 → 후`.
    await field.fill("12,000,000");
    await corrected.click();
    await expect(evidence.getByText("확인됨", { exact: true })).toBeVisible();
    await expect(page.getByTestId("evidence-review-line")).toContainText(" · 12,400,000 → 12,000,000");
    await expect(page.locator("#corrected-supply")).toHaveCount(0);
    const [row] = await db.select({ supply: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, expenseId));
    expect(row?.supply).toBe(12_000_000);

    // 06.5-07 Task 3(UI-SPEC V8 「고친 뒤 문서 화면」) — 다시 그린 문서 화면 금액 묶음: `공급가액` = 고친 값, 계산 한 줄은 고친 값 기준, `세율 바뀜` 0.
    await page.reload();
    const taxLine = page.getByTestId("expense-tax-line");
    await expect(taxLine).toContainText("1,200,000");
    await expect(taxLine).toContainText("13,200,000");
    await expect(taxLine.locator("xpath=..")).toContainText("12,000,000");
    await expect(page.getByTestId("expense-tax-drift")).toHaveCount(0);
    await expect(page.getByText(/세율 바뀜/)).toHaveCount(0);
    await page.context().close();
  });

  test("P2 — 고침 없이 `공급가액과 같음` → 확인됨(2행에 화살표 없음)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "retry");
    await approveAll(fx, expenseId);
    const manager = await makeManagerE2E();
    const page = await loginPage(browser, baseURL, manager);
    await page.goto(`/expenses/${expenseId}`);
    const same = page.getByRole("button", { name: /^공급가액과 같음/ });
    await waitForHydration(same);
    await same.click();
    await expect(page.getByTestId("evidence-review").getByText("확인됨", { exact: true })).toBeVisible();
    await expect(page.getByTestId("evidence-review-line")).not.toContainText("→");
    await page.context().close();
  });

  test("P5 — 지급 뒤 · 확인 전: `공급가액 바꾸기` 0 · 잠김 줄 · 1차 `공급가액과 같음`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const manager = await makeManagerE2E();
    const expenseId = await prepaidPaidWithLateEvidence(fx, manager);
    const page = await loginPage(browser, baseURL, manager);
    await page.goto(`/expenses/${expenseId}`);
    const same = page.getByRole("button", { name: /^공급가액과 같음/ });
    await waitForHydration(same);
    await expect(page.getByRole("button", { name: "공급가액 바꾸기" })).toHaveCount(0);
    await expect(page.getByText("지급 완료 문서 · 공급가액 못 바꿈 · 지급 취소 뒤 고치기", { exact: true })).toHaveCount(1);
    await page.context().close();
  });

  test("LOCKED — 고침 칸을 연 사이 지급이 생기면 거부 뒤 다시 읽으면 거부 줄 · `새로 고침` 없이 잠김 줄 하나", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "phone");
    await approveAll(fx, expenseId);
    const manager = await makeManagerE2E();
    const page = await loginPage(browser, baseURL, manager);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^공급가액과 같음/ }));
    await page.getByRole("button", { name: "공급가액 바꾸기" }).click();
    await page.locator("#corrected-supply").fill("12,000,000");

    // 다른 탭의 지급 완료를 문서 version을 건드리지 않는 지급 행 하나로 흉내 낸다(서버 잠금 뒤 판정이 살아 있는 지급을 보는지 — 화면 갈래 확인용).
    await db.insert(expensePayments).values({
      expenseId,
      payDate: seoulToday(),
      transferKrw: 13_640_000,
      payableKrw: 13_640_000,
      diffKrw: 0,
      paymentMethod: "transfer",
      processedBy: manager.viewer.id,
    });
    await page.getByRole("button", { name: /^공급가액 고쳐 확인/ }).click();
    // 거부 뒤 자동으로 다시 읽어 P5(잠김)가 서면 거부 줄 · `새로 고침`은 사라지고 잠김 줄 하나만 남는다(06.5-07 감사 FAIL 1).
    await expect(page.getByText("지급 완료 문서 · 공급가액 못 바꿈 · 지급 취소 뒤 고치기", { exact: true })).toHaveCount(1);
    await expect(page.getByText("지급 완료 문서 · 공급가액 못 바꿈 · 새로 고침", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "새로 고침" })).toHaveCount(0);
    await page.context().close();
  });
});

// 06-39(G-06-H · UAT 23) — 지급 행동 줄의 Ctrl+Enter 리스너는 열린 모달 안 키를 모달 몫으로 둔다: 한 키 = 1차 하나.
// 준비: 결재 통과 → 경영관리 증빙 확인 → 확인됨 · 지급 전 문서(1차 `지급 완료`).
async function confirmedUnpaid(fx: ExpenseE2E, browser: Browser, baseURL: string | undefined, key: LineKey, manager: Person): Promise<string> {
  const expenseId = await submitLineExpense(browser, baseURL, fx, key);
  await approveAll(fx, expenseId);
  await confirmEvidence(manager.viewer, { expenseId, version: await versionOf(expenseId) });
  return expenseId;
}

async function paymentTraces(expenseId: string): Promise<{ payments: number; processLogs: number }> {
  const payments = await db.select({ id: expensePayments.id }).from(expensePayments).where(eq(expensePayments.expenseId, expenseId));
  const logs = await db
    .select({ seq: actionLog.seq })
    .from(actionLog)
    .where(and(eq(actionLog.entityId, expenseId), eq(actionLog.actionType, "payment_process")));
  return { payments: payments.length, processLogs: logs.length };
}

const EVIDENCE_ROWS = '[data-ui="attachments"] li';

// 서버 액션 POST 가운데 `지급 완료`(payDate · expectedPayableKrw · version)를 실어 보낸 것만 센다 — 한 키가 모달 1차 말고 화면 1차까지 불렀는지의 직접 증거.
function trackPayActionPosts(page: Page): { count: () => number } {
  let count = 0;
  page.on("request", (request) => {
    if (request.method() !== "POST" || request.headers()["next-action"] === undefined) return;
    if ((request.postData() ?? "").includes("expectedPayableKrw")) count += 1;
  });
  return { count: () => count };
}

test.describe("Ctrl+Enter 한 번 = 보이는 1차 하나 (G-06-H · UAT 23)", () => {
  test("G-06-H ⓐ — 무효 모달 사유 칸 Ctrl+Enter: 모달 1차만 돈다(무효 · `다른 사람이` 줄 0 · 지급 0)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const manager = await makeManagerE2E({ void: true });
    const expenseId = await confirmedUnpaid(fx, browser, baseURL, "tracer", manager);

    const page = await loginPage(browser, baseURL, manager);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^지급 완료/ }));
    await page.locator(EVIDENCE_ROWS).getByRole("button", { name: "무효 처리" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "증빙 무효 처리" })).toBeVisible();
    const reason = dialog.getByLabel("사유");
    await reason.fill("다른 건 영수증");
    const payPosts = trackPayActionPosts(page);
    await reason.press("Control+Enter");

    await expect(dialog).toHaveCount(0);
    await expect(page.locator(EVIDENCE_ROWS).first().getByText("무효", { exact: true })).toBeVisible();
    expect(payPosts.count()).toBe(0);
    await expect(page.getByText("다른 사람이", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "새로 고침" })).toHaveCount(0);
    await expect(page.getByTestId("payment-result")).toHaveCount(0);
    expect(await paymentTraces(expenseId)).toEqual({ payments: 0, processLogs: 0 });
    await page.context().close();
  });

  test("G-06-H ⓑ — 막힌 모달(사유 빈 칸) Ctrl+Enter: 아무 행동도 없다(모달 그대로 · 지급 0) → 사유 적고 Ctrl+Enter로 무효 처리", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const manager = await makeManagerE2E({ void: true });
    const expenseId = await confirmedUnpaid(fx, browser, baseURL, "hold", manager);

    const page = await loginPage(browser, baseURL, manager);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^지급 완료/ }));
    await page.locator(EVIDENCE_ROWS).getByRole("button", { name: "무효 처리" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "증빙 무효 처리" })).toBeVisible();
    const reason = dialog.getByLabel("사유");
    const payPosts = trackPayActionPosts(page);
    await reason.press("Control+Enter");
    await expect(dialog.getByRole("heading", { name: "증빙 무효 처리" })).toBeVisible();

    await reason.fill("다른 건 영수증");
    await reason.press("Control+Enter");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(EVIDENCE_ROWS).first().getByText("무효", { exact: true })).toBeVisible();
    expect(payPosts.count()).toBe(0);
    expect(await paymentTraces(expenseId)).toEqual({ payments: 0, processLogs: 0 });
    await expect(page.getByText("다른 사람이", { exact: false })).toHaveCount(0);
    await page.context().close();
  });

  test("G-06-H ⓒ — 대조: 모달 밖 `지급일` 칸(Enter 기본 동작을 막는 칸) Ctrl+Enter는 그때 보이는 1차 `지급 완료`를 돌린다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const manager = await makeManagerE2E();
    const expenseId = await confirmedUnpaid(fx, browser, baseURL, "retry", manager);

    const page = await loginPage(browser, baseURL, manager);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^지급 완료/ }));
    await page.locator("#payment-pay-date").press("Control+Enter");
    await expect(page.getByTestId("payment-result")).toHaveText(/^지급 완료 → \d{4}-\d{2}-\d{2} · \d{2}:\d{2}$/);
    expect((await paymentTraces(expenseId)).payments).toBe(1);
    await page.context().close();
  });
});

test.afterAll(archiveTempRoles);
