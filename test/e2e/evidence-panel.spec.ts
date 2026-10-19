import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecords, expenses, projects } from "@/db/schema";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { createIntakeManager, insertLinkFixture, insertRecordFixture } from "@/test/integration/fixtures/evidence";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { clearEvidence, EVIDENCE_COL, evidenceCell, evidenceRows, evidenceTable, focusGridCell, loginAs } from "./helpers/evidence";

// 06.1-07 S3 — 증빙 패널(옆 패널 480): 거래처 칸 Enter · 클릭 → 패널 · 공급가 고침(서버 미리 보기 · 저장 · 표 행 제자리 갱신) · 확인 필요 풀기 ·
// 잠김(작성 중 · 결재 중 · 승인됨 — 완료 프로젝트 반려 문서는 열림, 사용자 결정 2026-10-05) · 충돌 `새로 고침` · 입력 버리기 · 1024 미만 읽기 시트.
// 판정은 CI=true 프로덕션 빌드에서 한다(CLAUDE.md §5). 등록 권한자는 회사 전체 증빙을 보므로 케이스마다 증빙 표를 비우고 시작한다.

test.beforeEach(async () => {
  await clearEvidence();
});

const TITLE = "세금계산서 · 스테이지원";

function panelOf(page: Page): Locator {
  return page.getByRole("dialog", { name: TITLE });
}

async function managerPage(page: Page) {
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  return { manager, login: () => loginAs(page, manager.roleId as string) };
}

// 거래처 칸에 격자 포커스를 주고 Enter(키보드 경로 — PA-PANEL-OPEN).
async function openByEnter(page: Page, rowIndex = 0): Promise<Locator> {
  const cell = evidenceCell(page, rowIndex, EVIDENCE_COL.counterparty);
  await focusGridCell(cell);
  await cell.press("Enter");
  const panel = panelOf(page);
  await expect(panel).toBeVisible();
  return panel;
}

// 마우스 경로 — 거래처 칸의 행 이름 버튼(잠긴 줄만 있으면 표가 격자가 아니라 Enter 경로가 없다 — 06.1-05 evidenceTable 주석).
async function openByClick(page: Page, rowIndex = 0): Promise<Locator> {
  await evidenceCell(page, rowIndex, EVIDENCE_COL.counterparty).locator('[aria-haspopup="dialog"]').click();
  const panel = panelOf(page);
  await expect(panel).toBeVisible();
  return panel;
}

async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    if (!view) throw new Error(`결재 문서를 읽지 못했다: ${approver.name}`);
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
}

async function returnedExpense(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E): Promise<string> {
  const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  return expenseId;
}

test("tracer: 거래처 칸 Enter → 패널 · 공급가 = 파일 값 → 바꾸면 서버 한 줄 → 증빙 금액 저장 → 닫힘 · 행 공급가 · 세액 새 값 · 합계 그대로 · 포커스 = 거래처 칸", async ({ page }) => {
  const { manager, login } = await managerPage(page);
  await insertRecordFixture(manager, { supplyKrw: 1_000_000, vatKrw: 100_000 });
  await login();
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(1);
  await expect(evidenceCell(page, 0, EVIDENCE_COL.counterparty).locator('[role="button"][aria-haspopup="dialog"][tabindex="-1"]')).toHaveCount(1);

  const panel = await openByEnter(page);
  const supply = panel.getByRole("textbox", { name: "공급가" });
  await expect(supply).toHaveValue("1,000,000");
  // 미공개 줄의 상태 낱말은 `공개` 줄과 같은 말 — 상태 줄을 따로 두지 않는다.
  await expect(panel.locator("dt", { hasText: /^상태$/ })).toHaveCount(0);
  const preview = panel.locator("#evidence-panel-preview");
  await expect(preview).toHaveText("세액 100,000 · 합계 1,100,000");
  const primary = panel.locator('[data-ui="primary-button"]');
  await expect(primary).toHaveText(/증빙 금액 저장/);

  await supply.fill("990,000");
  await expect(preview).toHaveText("세액 110,000 · 합계 1,100,000");
  await primary.click();
  await expect(panel).toBeHidden();

  await expect(evidenceCell(page, 0, EVIDENCE_COL.supply)).toHaveText("990,000");
  await expect(evidenceCell(page, 0, EVIDENCE_COL.vat)).toHaveText("110,000");
  await expect(evidenceCell(page, 0, EVIDENCE_COL.total)).toHaveText("1,100,000");
  await expect(evidenceCell(page, 0, EVIDENCE_COL.counterparty)).toBeFocused();
});

test("바뀐 칸 없음 → 1차 aria-disabled + 이유 줄 · 네이티브 disabled 0 / dirty 닫기 → 입력 버리기 / 공급가가 합계보다 큼 → 칸 오류", async ({ page }) => {
  const { manager, login } = await managerPage(page);
  await insertRecordFixture(manager, { supplyKrw: 1_000_000, vatKrw: 100_000 });
  await login();
  await page.goto("/expenses/evidence?state=all");
  const panel = await openByEnter(page);
  const primary = panel.locator('[data-ui="primary-button"]');
  await expect(primary).toHaveAttribute("aria-disabled", "true");
  await expect(primary).not.toHaveAttribute("disabled", /.*/);
  const reasonId = await primary.getAttribute("aria-describedby");
  expect(reasonId).toBeTruthy();
  await expect(page.locator(`[id="${reasonId}"]`)).toHaveText("바뀐 칸 없음");

  const supply = panel.getByRole("textbox", { name: "공급가" });
  await supply.fill("1,100,001");
  await expect(panel.getByText("공급가가 합계보다 큼", { exact: true })).toBeVisible();

  await supply.fill("900,000");
  await expect(panel.locator("#evidence-panel-preview")).toHaveText("세액 200,000 · 합계 1,100,000");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "입력 버리기" })).toBeVisible();
});

test("(감사 D-1) 공급가를 한 번만 고치고 Esc → 「입력 버리기」(숫자 칸 hidden 값이 다시 그린 뒤 바뀌어도 바뀐 칸 수가 늦지 않는다)", async ({ page }) => {
  const { manager, login } = await managerPage(page);
  await insertRecordFixture(manager, { supplyKrw: 1_000_000, vatKrw: 100_000 });
  await login();
  await page.goto("/expenses/evidence?state=all");
  const panel = await openByEnter(page);
  await panel.getByRole("textbox", { name: "공급가" }).fill("990,000");
  await expect(panel.locator("#evidence-panel-preview")).toHaveText("세액 110,000 · 합계 1,100,000");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("dialog", { name: "입력 버리기" });
  await expect(discard).toBeVisible();
  // 버린 뒤 포커스 = 연 칸(§10) — 패널과 확인 창이 한 번에 사라질 때 확인 창이 화면 제목으로 빼앗지 않는다.
  await discard.getByRole("button", { name: /^입력 버리기/ }).click();
  await expect(panel).toBeHidden();
  await expect(evidenceCell(page, 0, EVIDENCE_COL.counterparty)).toBeFocused();
});

test("충돌: 다른 세션이 먼저 바꾼 뒤 저장 → FormAlert `다른 사람이 {HH:mm}에 바꿈` + 3차 새로 고침 · 입력 값 · 패널 그대로 → 새로 고침 → 새 서버 값 · 줄 0", async ({ page }) => {
  const { manager, login } = await managerPage(page);
  const recordId = await insertRecordFixture(manager, { supplyKrw: 1_000_000, vatKrw: 100_000 });
  await login();
  await page.goto("/expenses/evidence?state=all");
  const panel = await openByEnter(page);
  const supply = panel.getByRole("textbox", { name: "공급가" });
  await supply.fill("990,000");

  await db
    .update(evidenceRecords)
    .set({ supplyKrw: 950_000, vatKrw: 150_000, version: sql`${evidenceRecords.version} + 1`, updatedAt: sql`(now() at time zone 'UTC')` })
    .where(eq(evidenceRecords.id, recordId));
  await panel.locator('[data-ui="primary-button"]').click();

  const alert = panel.getByRole("alert");
  await expect(alert).toContainText(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
  await expect(panel).toBeVisible();
  await expect(supply).toHaveValue("990,000");
  await alert.getByRole("button", { name: "새로 고침" }).click();
  await expect(panel.getByRole("textbox", { name: "공급가" })).toHaveValue("950,000");
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("확인 필요: 맨 위 `확인 필요 · {사유}` · 1차 확인 필요 풀기 → 닫힘 · 행 상태 바뀜 / 공급가와 함께 → 한 번에 둘 다", async ({ page }) => {
  const { manager, login } = await managerPage(page);
  const first = await insertRecordFixture(manager, { supplyKrw: 1_000_000, vatKrw: 100_000 });
  await db.update(evidenceRecords).set({ needsCheck: "사업자번호 틀림 · 거래처 확인" }).where(eq(evidenceRecords.id, first));
  await login();
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).toContainText("확인 필요");

  let panel = await openByClick(page);
  await expect(panel.locator("dd").first()).toHaveText("확인 필요 · 사업자번호 틀림 · 거래처 확인");
  const primary = panel.locator('[data-ui="primary-button"]');
  await expect(primary).toHaveText(/확인 필요 풀기/);
  await expect(primary).not.toHaveAttribute("aria-disabled", "true");
  await primary.click();
  await expect(panel).toBeHidden();
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).not.toContainText("확인 필요");

  await db.update(evidenceRecords).set({ needsCheck: "사업자번호 틀림 · 거래처 확인" }).where(eq(evidenceRecords.id, first));
  await page.reload();
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).toContainText("확인 필요");
  panel = await openByClick(page);
  await panel.getByRole("textbox", { name: "공급가" }).fill("980,000");
  await expect(panel.locator("#evidence-panel-preview")).toHaveText("세액 120,000 · 합계 1,100,000");
  await panel.locator('[data-ui="primary-button"]').click();
  await expect(panel).toBeHidden();
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).not.toContainText("확인 필요");
  await expect(evidenceCell(page, 0, EVIDENCE_COL.supply)).toHaveText("980,000");
  const [row] = await db.select({ needsCheck: evidenceRecords.needsCheck, supplyKrw: evidenceRecords.supplyKrw }).from(evidenceRecords).where(eq(evidenceRecords.id, first));
  expect(row).toEqual({ needsCheck: null, supplyKrw: 980_000 });
});

test("잠김: 결재 중 · 승인됨 문서에 붙은 기록 → 공급가 input 0 · 잠김 줄 글자 · 1차 0", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  const fx = await setupExpenseE2E();
  const { manager, login } = await managerPage(page);
  const inReview = await submitLineExpense(browser, baseURL, fx, "tracer");
  const approved = await submitLineExpense(browser, baseURL, fx, "hold");
  await approveAll(fx, approved);
  await insertLinkFixture({ recordId: await insertRecordFixture(manager, { issuedOn: "2026-09-21" }), ownerId: inReview, attachedBy: manager.id });
  await insertLinkFixture({ recordId: await insertRecordFixture(manager, { issuedOn: "2026-09-20" }), ownerId: approved, attachedBy: manager.id });
  await login();
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(2);

  // 줄은 서식 → 날짜 내림차순 — 첫 줄 = 결재 중(09-21), 둘째 = 승인(09-20).
  for (const [index, lock] of [
    [0, "결재 중 문서에 붙음 · 금액 잠김"],
    [1, "승인됨 문서에 붙음 · 금액 잠김"],
  ] as const) {
    const panel = await openByClick(page, index);
    await expect(panel.locator("input:not([type=hidden])")).toHaveCount(0);
    await expect(panel.getByText(lock, { exact: true })).toBeVisible();
    await expect(panel.locator('[data-ui="primary-button"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  }
});

test("완료 프로젝트의 반려 문서에 붙은 기록 → 공급가 input 1 · 잠김 줄 0(사용자 결정 2026-10-05) / 작성 중 문서 → 잠김 · 문서 링크 0", async ({ page, browser, baseURL }) => {
  test.setTimeout(150_000);
  const fx = await setupExpenseE2E();
  const { manager, login } = await managerPage(page);
  const returned = await returnedExpense(browser, baseURL, fx);
  // 완료 프로젝트는 새 지출결의를 만들지 않는다(PROJECT_COMPLETED) — 작성 중 문서를 먼저 만들고 완료로 바꾼다.
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id] });
  const draftId = created.created[0]?.expenseId;
  if (!draftId) throw new Error("작성 중 문서 없음");
  await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
  const [draft] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, draftId));
  expect(draft?.number ?? null).toBeNull();
  await insertLinkFixture({ recordId: await insertRecordFixture(manager, { issuedOn: "2026-09-21" }), ownerId: returned, attachedBy: manager.id });
  await insertLinkFixture({ recordId: await insertRecordFixture(manager, { issuedOn: "2026-09-20" }), ownerId: draftId, attachMode: "author", attachedBy: fx.pm.viewer.id });
  await login();
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(2);

  let panel = await openByClick(page, 0);
  await expect(panel.getByRole("textbox", { name: "공급가" })).toHaveCount(1);
  await expect(panel.getByText(/문서에 붙음 · 금액 잠김$/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  panel = await openByClick(page, 1);
  await expect(panel.locator("input:not([type=hidden])")).toHaveCount(0);
  await expect(panel.getByText("작성 중 문서에 붙음 · 금액 잠김", { exact: true })).toBeVisible();
  await expect(panel.locator('[data-ui="primary-button"]')).toHaveCount(0);
  await expect(panel.locator('a[href*="/expenses/"]')).toHaveCount(0);
  await expect(panel).toContainText("붙임 작성 중 문서");
});

test("(Codex #6) 확인 필요 + 결재 중 문서에 붙음 → 공급가 글자 · 잠김 줄 · 1차 `확인 필요 풀기` / (P3-2) 보관됨 → 공급가 input 0 · 1차 0", async ({ page, browser, baseURL }) => {
  test.setTimeout(150_000);
  const fx = await setupExpenseE2E();
  const { manager, login } = await managerPage(page);
  const inReview = await submitLineExpense(browser, baseURL, fx, "tracer");
  const locked = await insertRecordFixture(manager, { issuedOn: "2026-09-21" });
  await insertLinkFixture({ recordId: locked, ownerId: inReview, attachedBy: manager.id });
  await db.update(evidenceRecords).set({ needsCheck: "사업자번호 틀림 · 거래처 확인" }).where(eq(evidenceRecords.id, locked));
  const archived = await insertRecordFixture(manager, { issuedOn: "2026-09-20" });
  await db.update(evidenceRecords).set({ archivedAt: sql`now()`, archivedBy: manager.id }).where(eq(evidenceRecords.id, archived));
  await login();
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(1);

  let panel = await openByClick(page, 0);
  await expect(panel.locator("input:not([type=hidden])")).toHaveCount(0);
  await expect(panel.getByText("결재 중 문서에 붙음 · 금액 잠김", { exact: true })).toBeVisible();
  await expect(panel.locator('[data-ui="primary-button"]')).toHaveText(/확인 필요 풀기/);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.goto("/expenses/evidence?state=archived");
  await expect(evidenceRows(page)).toHaveCount(1);
  panel = await openByClick(page, 0);
  await expect(panel.locator("dd").first()).toHaveText("보관됨");
  await expect(panel.locator("input:not([type=hidden])")).toHaveCount(0);
  await expect(panel.locator('[data-ui="primary-button"]')).toHaveCount(0);
});

test("(Codex #5) 768 — 상세를 받지 못하면 그 실패 한 줄이 열린 시트 안에 선다", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const { manager, login } = await managerPage(page);
  const recordId = await insertRecordFixture(manager, { supplyKrw: 1_000_000, vatKrw: 100_000 });
  await login();
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(1);
  await db.delete(evidenceRecords).where(eq(evidenceRecords.id, recordId));
  await evidenceTable(page).locator('[role="button"][aria-haspopup="dialog"]').first().click();
  const sheet = page.getByRole("dialog", { name: "스테이지원" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("결과를 받지 못함");
});

for (const width of [768, 375] as const) {
  test(`${width} — 행 탭 → 읽기 시트에 패널과 같은 줄(공급가 글자 · 이력) · input 0 · 1차 0`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { manager, login } = await managerPage(page);
    await insertRecordFixture(manager, { supplyKrw: 1_000_000, vatKrw: 100_000 });
    await login();
    await page.goto("/expenses/evidence?state=all");
    await expect(evidenceRows(page)).toHaveCount(1);
    // 700~1023은 접힌 줄이 없어(P1+P2가 다 보임) 행 이름 버튼이 시트를 연다 — 폰은 접힌 줄 탭도 같은 시트.
    // 폰은 날짜 칸이 접혀 칸 순서가 달라진다 — 표 안 행 이름 버튼으로 잡는다.
    const opener = evidenceTable(page).locator('[role="button"][aria-haspopup="dialog"]').first();
    await opener.click();
    const sheet = page.getByRole("dialog", { name: "스테이지원" });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("dt", { hasText: "이력" })).toHaveCount(1);
    await expect(sheet).toContainText("등록");
    await expect(sheet.locator("dt", { hasText: /^공급가$/ })).toHaveCount(1);
    await expect(sheet).toContainText("1,000,000");
    await expect(sheet.locator("input")).toHaveCount(0);
    await expect(sheet.locator('[data-ui="primary-button"]')).toHaveCount(0);
  });
}
