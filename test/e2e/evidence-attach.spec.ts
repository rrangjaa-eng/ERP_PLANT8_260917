import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecords, expenses } from "@/db/schema";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createPurchaseRequest, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createIntakeManager, insertLinkFixture, insertRecordFixture } from "@/test/integration/fixtures/evidence";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { loginPage, makePerson as makeLeavePerson, waitForHydration, type Person } from "./leave-org";
import { clearEvidence, EVIDENCE_COL, evidenceCell, evidenceRows, loginAs } from "./helpers/evidence";

// 06.1-06 S4 · S7 — 증빙 목록 행 `붙이기` → 붙일 문서 고르기(PickDialog 단일) → 붙음 · 상태 2행 문서 번호 링크 → 문서 「증빙」 섹션 읽기 행.
// 판정은 CI=true 프로덕션 빌드에서 한다(CLAUDE.md §5). 등록 권한자는 회사 전체 증빙을 보므로 케이스마다 증빙 표를 비우고 시작한다.

test.beforeEach(async () => {
  await clearEvidence();
});

// 줄 하나의 문서를 화면에서 제출하고 팀장이 반려한다(expense-close.spec.ts와 같은 갈래 — 번호 있는 반려 문서).
// 통합 fixture setupExpenseProject는 쓰지 않는다 — 기획1팀에 팀장 자리를 남겨 뒤 스펙의 팀장 발령을 막는다.
async function returnedExpense(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E): Promise<{ expenseId: string; number: string }> {
  const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row?.number) throw new Error("번호 없음");
  return { expenseId, number: row.number };
}

test("S7 행 1 반려 지출결의 × 경영관리(두 키): 행 붙이기 → 검색 칸 포커스 · 콤보 0 → Enter → 붙음 · 번호 링크 → 문서 증빙 섹션 읽기 행", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const doc = await returnedExpense(browser, baseURL, fx);
  await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await loginAs(page, manager.roleId);

  // 기본 보기 「할 일」은 붙은 기록을 빼므로(06.1-05) 붙인 뒤 그 행을 보려고 「전체」로 연다.
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(1);
  await evidenceRows(page).first().getByRole("button", { name: "붙이기" }).click();

  const dialog = page.getByRole("dialog", { name: "붙일 문서 고르기" });
  await expect(dialog).toBeVisible();
  const search = dialog.getByRole("textbox", { name: "문서 번호 · 작성자 · 지급처" });
  await expect(search).toBeFocused();
  await expect(dialog.locator("[role=combobox]")).toHaveCount(0);

  // 회사 전체 문서 가운데 이 문서를 번호로 좁힌 뒤 ↓ → Enter(키보드만).
  // F-1 — 검색 응답 전에는 옛 목록(aria-busy)이 남아 그 번호가 이미 보인다. 그때 ↓는 옛 목록 첫 행으로 가고, 새 목록에서 그 행이 빠지면
  // PickDialog가 포커스를 검색 칸으로 돌린다(SP-8 설계). 새 목록이 선 뒤에 ↓를 누른다.
  await search.fill(doc.number);
  const option = dialog.getByRole("option", { name: new RegExp(doc.number) });
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  await expect(option).toBeVisible();
  await search.press("ArrowDown");
  await expect(option).toBeFocused();
  await option.press("Enter");
  await expect(dialog).toBeHidden();

  const status = evidenceCell(page, 0, EVIDENCE_COL.status);
  await expect(status).toContainText("붙음");
  const link = status.getByRole("link", { name: doc.number });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(new RegExp(`/expenses/${doc.expenseId}#evidence$`));
  const section = page.locator("#evidence + div").getByRole("table", { name: "붙은 증빙" });
  await expect(section.locator("tbody tr:visible")).toHaveCount(1);
  await expect(section.locator("tbody tr:visible").first()).toContainText(fx.vendorName);
});


// 「할 일」 보기는 붙은 기록을 빼므로 붙인 행이 새로 고침 뒤 사라진다 — 포커스는 다음 행(없으면 이전 행, 없으면 화면 제목)으로.
async function attachFirstRowTo(page: Page, number: string): Promise<void> {
  await evidenceRows(page).first().getByRole("button", { name: "붙이기" }).click();
  const dialog = page.getByRole("dialog", { name: "붙일 문서 고르기" });
  const search = dialog.getByRole("textbox", { name: "문서 번호 · 작성자 · 지급처" });
  await expect(search).toBeFocused();
  await search.fill(number);
  const option = dialog.getByRole("option", { name: new RegExp(number) });
  await expect(option).toBeVisible();
  await search.press("ArrowDown");
  await option.press("Enter");
  await expect(dialog).toBeHidden();
}

test("S7 행 2 「할 일」 보기에서 붙이면 그 행이 빠지고 포커스는 다음 행 · 마지막 행이면 화면 제목", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const doc = await returnedExpense(browser, baseURL, fx);
  await insertRecordFixture(manager, { nameOnDocument: "먼저붙일곳", issuedOn: "2026-09-21" });
  await insertRecordFixture(manager, { nameOnDocument: "남을곳", issuedOn: "2026-09-20" });
  await loginAs(page, manager.roleId);

  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(2);
  await expect(evidenceRows(page).first()).toContainText("먼저붙일곳");
  await attachFirstRowTo(page, doc.number);
  await expect(evidenceRows(page)).toHaveCount(1);
  await expect(evidenceRows(page).first().locator(":focus")).toHaveCount(1);
  await expect(evidenceRows(page).first()).toContainText("남을곳");

  await attachFirstRowTo(page, doc.number);
  await expect(evidenceRows(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "증빙" })).toBeFocused();
});

// 구매 권한자의 남의 요청 취소 — 사유 확인 창(본인 취소는 창 없이 즉시라 결과 줄이 없다). 팀 비용 요청은 온라인구매 전역 설정을 쓰지 않는다.
const PURCHASER_VISIBLE = ["purchase_request.value", "purchase_request.amount", "project.value", "card_usage.value", "card_usage.amount", "team.value", "vendor.value"];

async function teamCostRequest(): Promise<{ requester: Person; id: string; number: string }> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E붙임구매본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E붙임구매팀-${suffix}` });
  const requester = await makeLeavePerson("붙임요청", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const input = { linkKind: "team_cost" as const, itemName: `현장 소모품-${suffix}`, linkUrl: null, estimate: { currency: "KRW" as const, amount: 110_000, fxRate: 1 }, memo: null };
  const created = await createPurchaseRequest(requester.viewer, input, await precheckPurchaseRequest(requester.viewer, input));
  return { requester, id: created.id, number: created.number };
}

async function makePurchaser(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E붙임구매처리-${suffix}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of PURCHASER_VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E붙임처리본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E붙임처리팀-${suffix}` });
  return makeLeavePerson("처리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

test.afterAll(archiveTempRoles);

test("S7 행 3 구매 요청 취소 확인 창: 붙은 증빙 2건이면 결과 줄 `붙은 증빙 2건은 증빙 목록으로` · 0건이면 그 줄 DOM 0", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const manager = await createIntakeManager();
  const linked = await teamCostRequest();
  const bare = await teamCostRequest();
  for (let index = 0; index < 2; index += 1) {
    await insertLinkFixture({ recordId: await insertRecordFixture(manager, { supplyKrw: 100_000, vatKrw: 10_000 }), ownerKind: "purchase_request", ownerId: linked.id, attachedBy: manager.id });
  }
  const page = await loginPage(browser, baseURL, await makePurchaser());
  await page.goto("/cards/purchases");

  const openDialog = async (number: string) => {
    const cancel = page.getByRole("row").filter({ hasText: number }).getByRole("button", { name: `${number} 요청 취소` });
    await waitForHydration(cancel);
    await cancel.click();
    const dialog = page.getByRole("dialog", { name: "구매 요청 취소" });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  const withLinks = await openDialog(linked.number);
  await expect(withLinks).toContainText("붙은 증빙 2건은 증빙 목록으로");
  await page.keyboard.press("Escape");
  await expect(withLinks).toHaveCount(0);

  const without = await openDialog(bare.number);
  await expect(without.getByText(/^붙은 증빙/)).toHaveCount(0);
});

// 결재선 넷(팀장 → 본부장 → 경영 → 대표)을 도메인으로 승인한다 — 승인 문서 무효 처리 케이스의 준비.
async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    if (!view) throw new Error(`결재 문서를 읽지 못했다: ${approver.name}`);
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
}

function linkedSection(page: Page) {
  return page.locator("#evidence + div");
}

test("S7 행 4 반려 지출결의 종결 확인 창: 붙은 증빙 1건이면 결과 줄 끝 `붙은 증빙 1건은 증빙 목록으로` → 종결 뒤 그 기록은 목록에서 붙음 아님", async ({ page, browser, baseURL }) => {
  test.setTimeout(150_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const doc = await returnedExpense(browser, baseURL, fx);
  await insertLinkFixture({ recordId: await insertRecordFixture(manager, { nameOnDocument: "종결될곳" }), ownerId: doc.expenseId, attachedBy: manager.id });

  const pmPage = await loginPage(browser, baseURL, fx.pm);
  await pmPage.goto(`/expenses/${doc.expenseId}`);
  const trigger = pmPage.getByRole("button", { name: "종결", exact: true });
  await waitForHydration(trigger);
  await trigger.click();
  const dialog = pmPage.getByRole("dialog", { name: "지출결의 종결" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("붙은 증빙 1건은 증빙 목록으로", { exact: true })).toBeVisible();
  await dialog.getByLabel("사유").fill("업체 취소");
  await dialog.getByLabel("사유").press("Control+Enter");
  await expect(pmPage.getByRole("dialog")).toHaveCount(0);
  await pmPage.context().close();

  await loginAs(page, manager.roleId);
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(1);
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).not.toContainText("붙음");
});

test("S7 행 5 작성 중(번호 없는) 문서에 붙은 기록 → 상태 2행 `작성 중 문서` · 그 칸 링크 0", async ({ page }) => {
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id] });
  const draftId = created.created[0]?.expenseId;
  if (!draftId) throw new Error("작성 중 문서 없음");
  await insertLinkFixture({ recordId: await insertRecordFixture(manager), ownerId: draftId, attachMode: "author", attachedBy: fx.pm.viewer.id });
  await loginAs(page, manager.roleId);
  await page.goto("/expenses/evidence?state=all");
  const status = evidenceCell(page, 0, EVIDENCE_COL.status);
  await expect(status).toContainText("붙음");
  await expect(status).toContainText("작성 중 문서");
  await expect(status.locator("a")).toHaveCount(0);
});

test("S7 행 6 반려 문서 붙은 증빙 `떼기` → 사유 비면 1차 막힘 · 사유 적고 떼면 그 행이 사라진다", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const doc = await returnedExpense(browser, baseURL, fx);
  await insertLinkFixture({ recordId: await insertRecordFixture(manager, { nameOnDocument: "뗄곳" }), ownerId: doc.expenseId, attachedBy: manager.id });
  await loginAs(page, manager.roleId);
  await page.goto(`/expenses/${doc.expenseId}`);
  const section = linkedSection(page);
  await expect(section.locator("tbody tr:visible")).toHaveCount(1);
  const detach = section.getByRole("button", { name: "떼기" });
  await waitForHydration(detach);
  await detach.click();
  const dialog = page.getByRole("dialog", { name: "증빙 떼기" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("사유 없음 · 사유 적기");
  const confirm = dialog.getByRole("button", { name: /^증빙 떼기/ });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await dialog.getByLabel("사유").fill("다른 건 증빙");
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("table", { name: "붙은 증빙" })).toHaveCount(0);
});

test("S7 행 7 결재 중 문서 → 붙은 증빙 행에 행동 없음 · 잠김 줄 `결재 중 · 떼기 없음`", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
  await insertLinkFixture({ recordId: await insertRecordFixture(manager), ownerId: expenseId, attachedBy: manager.id });
  await loginAs(page, manager.roleId);
  await page.goto(`/expenses/${expenseId}`);
  const section = linkedSection(page);
  await expect(section.getByRole("table", { name: "붙은 증빙" })).toBeVisible();
  await expect(section.getByRole("button")).toHaveCount(0);
  await expect(page.getByText("결재 중 · 떼기 없음", { exact: true })).toHaveCount(1);
});

test("S7 행 8 승인 문서 → 무효 담당은 `무효 처리`(창 제목 `증빙 무효 처리`) · 등록만 가진 사람은 행동 없음", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const fx = await setupExpenseE2E();
  const voider = await createIntakeManager("무효담당", { attach: false, void: true });
  const intakeOnly = await createIntakeManager("등록만", { attach: false, void: false });
  if (!voider.roleId || !intakeOnly.roleId) throw new Error("계급 없음");
  const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
  await approveAll(fx, expenseId);
  await insertLinkFixture({ recordId: await insertRecordFixture(voider), ownerId: expenseId, attachedBy: voider.id });

  const onlyPage = await browser.newPage({ baseURL });
  await loginAs(onlyPage, intakeOnly.roleId);
  await onlyPage.goto(`/expenses/${expenseId}`);
  await expect(linkedSection(onlyPage).getByRole("table", { name: "붙은 증빙" })).toBeVisible();
  await expect(linkedSection(onlyPage).getByRole("button")).toHaveCount(0);
  await onlyPage.close();

  const page = await browser.newPage({ baseURL });
  await loginAs(page, voider.roleId);
  await page.goto(`/expenses/${expenseId}`);
  const voidButton = linkedSection(page).getByRole("button", { name: "무효 처리" });
  await waitForHydration(voidButton);
  await voidButton.click();
  await expect(page.getByRole("dialog", { name: "증빙 무효 처리" })).toBeVisible();
  await page.close();
});

test("S7 행 9 확인 필요 기록 → `붙이기` 비활성 · 이유 `확인 필요 · 패널에서 확인 필요 풀기`", async ({ page }) => {
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const fx = await setupExpenseE2E();
  void fx;
  const recordId = await insertRecordFixture(manager);
  await db.update(evidenceRecords).set({ needsCheck: "취소 줄 있음" }).where(eq(evidenceRecords.id, recordId));
  await loginAs(page, manager.roleId);
  await page.goto("/expenses/evidence?state=all");
  const attach = evidenceRows(page).first().getByRole("button", { name: /^붙이기/ });
  await expect(attach).toHaveAttribute("aria-disabled", "true");
  await expect(evidenceRows(page).first()).toContainText("확인 필요 · 패널에서 확인 필요 풀기");
});

test("S7 행 10 결재 중 문서 × 경영관리(두 키): 고르면 바닥 결과 줄 `결재 중 문서 · 결재 끝까지 떼기 없음` → Enter로 붙임 → 문서 붙은 증빙 행", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
  const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row?.number) throw new Error("번호 없음");
  await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await loginAs(page, manager.roleId);
  await page.goto("/expenses/evidence?state=all");
  await evidenceRows(page).first().getByRole("button", { name: "붙이기" }).click();
  const dialog = page.getByRole("dialog", { name: "붙일 문서 고르기" });
  const search = dialog.getByRole("textbox", { name: "문서 번호 · 작성자 · 지급처" });
  await search.fill(row.number);
  const option = dialog.getByRole("option", { name: new RegExp(row.number) });
  await expect(option).toBeVisible();
  await search.press("ArrowDown");
  await expect(dialog.getByText("결재 중 문서 · 결재 끝까지 떼기 없음", { exact: true })).toBeVisible();
  await option.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status).getByRole("link", { name: row.number })).toBeVisible();
  await page.goto(`/expenses/${expenseId}`);
  await expect(linkedSection(page).locator("tbody tr:visible")).toHaveCount(1);
});
