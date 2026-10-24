import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalRoutes, approvalSteps, expenses, permissionMatrix, projects, users, vendors, visibilityMatrix } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { businessNoProblem } from "@/domain/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { insertLinkFixture, insertRecordFixture } from "../integration/fixtures/evidence";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 07-23 Task 3(SC-18 · D-745 · K20 · AQ-21 · U11 · U16 · N2): 지출결의 지급처 고르기에서 없는 거래처를 그 자리에서 등록한다 — 검색어가 있으면 목록 끝
// 3차 `새 거래처 · "{검색어}"` → 고르기 창이 닫히고 07-20 거래처 등록 패널(이름 = 검색어 · 갈래 협력사 · 계좌 세 칸 · 지급 기한 칸 없음) → 저장하면
// 지급처 칸이 채워지고 토스트 · 칸 옆 `확인 전`. 같은 사업자 번호면 `이 거래처로`. 기안자는 관리자가 아닌 기획 PM 계정(role-pm)이다.

test.afterAll(archiveTempRoles);

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

function validBusinessNo(): string {
  const digits = `${Math.floor(Math.random() * 9e9) + 1e9}`;
  const valid = Array.from({ length: 10 }, (_, d) => `${digits.slice(0, 9)}${d}`).find((candidate) => businessNoProblem(candidate) === null);
  if (!valid) throw new Error("검증합 번호 없음");
  return valid;
}

// 07-23 R-1(사용자 결정 10/23): 계좌 세 칸은 `vendors.account` 쓰기 보유자만 넣는다. 기안 PM을 role-pm 칸을 그대로 옮긴 임시 계급 + 계좌 쓰기로
// 옮긴다(공용 role-pm을 바꾸면 다른 스펙이 흔들린다). 문서를 만들기 전에 부른다.
async function grantAccountWrite(fx: ExpenseE2E): Promise<void> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E일자리계좌-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
  const cells = await db.select({ menu: permissionMatrix.menu, action: permissionMatrix.action }).from(permissionMatrix).where(and(eq(permissionMatrix.roleId, "role-pm"), eq(permissionMatrix.allowed, true)));
  for (const { menu, action } of [...cells, { menu: "vendors.account", action: "write" }]) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action, allowed: true });
  const items = await db.select({ infoItem: visibilityMatrix.infoItem }).from(visibilityMatrix).where(and(eq(visibilityMatrix.roleId, "role-pm"), eq(visibilityMatrix.visible, true)));
  for (const { infoItem } of items) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  await db.update(users).set({ roleId: role.id }).where(eq(users.id, fx.pm.viewer.id));
  fx.pm.viewer = { ...fx.pm.viewer, roleId: role.id };
}

async function openDraft(page: Page, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const id = created.created[0]?.expenseId;
  if (!id) throw new Error("작성 중 문서를 만들지 못했다");
  await page.goto(`/expenses/${id}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return id;
}

async function searchPayee(page: Page, query: string) {
  await page.locator("#vendor-pick").click();
  const picker = page.getByRole("dialog", { name: /^지급처 (고르기|바꾸기)$/ });
  await expect(picker).toBeVisible();
  await picker.getByRole("textbox", { name: "지급처 이름 검색" }).fill(query);
  return picker;
}

// 고르기 0건 → 끝 3차로 등록 패널을 연다.
async function openRegisterPanel(page: Page, name: string) {
  const picker = await searchPayee(page, name);
  await expect(picker.getByText("조건에 맞는 지급처가 없습니다 ·")).toBeVisible();
  await picker.getByRole("button", { name: `새 거래처 · "${name}"` }).click();
  await expect(picker).toHaveCount(0);
  const panel = page.getByRole("dialog", { name: "거래처 등록" });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("일하는 자리 거래처 바로 등록 (07-23 SC-18)", () => {
  test("U11 — 비슷한 이름 결과가 있어도 목록 맨 끝에 `새 거래처 · \"{검색어}\"` · 검색어를 비우면 없다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");
    const query = fx.vendorName.slice(0, -2);
    const picker = await searchPayee(page, query);
    await expect(picker.getByRole("option", { name: new RegExp(fx.vendorName) })).toBeVisible();
    const tail = picker.getByRole("button", { name: `새 거래처 · "${query}"` });
    await expect(tail).toBeVisible();
    // 맨 끝 — 목록(listbox) 뒤에 선다.
    const listBottom = await picker.getByRole("listbox").evaluate((list) => list.getBoundingClientRect().bottom);
    expect((await tail.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(listBottom - 1);
    await picker.getByRole("textbox", { name: "지급처 이름 검색" }).fill("");
    await expect(picker.getByRole("button", { name: /^새 거래처 · / })).toHaveCount(0);
    await page.context().close();
  });

  test("0건 → 고르기 닫힘 · 등록 패널(이름 채움 · 협력사 · 계좌 세 칸 · 지급 기한 없음 · 첫 포커스 이름) → 저장 → 지급처 칸 · 토스트 · `확인 전` · 포커스 지급처", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await grantAccountWrite(fx);
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "hold");
    const name = `현장설비-${randomUUID().slice(0, 6)}`;
    const panel = await openRegisterPanel(page, name);

    await expect(panel.getByLabel("이름")).toHaveValue(name);
    await expect(panel.getByLabel("이름")).toBeFocused();
    await expect(panel.getByLabel("갈래")).toHaveValue("supplier");
    await expect(panel.getByLabel("갈래").locator("option")).toHaveText(["협력사", "둘 다"]);
    for (const label of ["계좌 은행", "예금주", "계좌번호"]) await expect(panel.getByLabel(label, { exact: true })).toBeVisible();
    await expect(panel.getByLabel("지급 기한")).toHaveCount(0);
    await expect(panel.getByText("기본 증빙 종류")).toHaveCount(0);
    await expect(panel.getByText("담당자 더하기")).toHaveCount(0);

    await panel.getByLabel("계좌 은행").fill("국민");
    await panel.getByLabel("예금주").fill("주식회사 현장설비");
    await panel.getByLabel("계좌번호", { exact: true }).fill("123-456-789012");
    await panel.getByRole("button", { name: /^거래처 등록/ }).click();

    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("expense-vendor")).toHaveText(name);
    await expect(page.getByText(`거래처 등록 · ${name} (확인 전)`)).toBeVisible();
    await expect(page.getByTestId("expense-vendor").locator("xpath=..").getByText("확인 전", { exact: true })).toBeVisible();
    await expect(page.locator("#vendor-pick")).toBeFocused();
    const [row] = await db.select({ confirmedAt: vendors.confirmedAt, kind: vendors.kind }).from(vendors).where(eq(vendors.name, name));
    expect(row).toEqual({ confirmedAt: null, kind: "supplier" });
    await page.context().close();
  });

  test("U16 — 등록 실패(예금주 없음)는 패널이 열린 채 첫 오류 칸 포커스 · 고르기 창 없음 / `취소 Esc` → 고르기 창 없음 · 포커스 지급처 칸", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await grantAccountWrite(fx);
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "retry");
    const name = `예금주없음-${randomUUID().slice(0, 6)}`;
    const panel = await openRegisterPanel(page, name);
    await panel.getByLabel("계좌 은행").fill("국민");
    await panel.getByLabel("계좌번호", { exact: true }).fill("123456789012");
    await panel.getByRole("button", { name: /^거래처 등록/ }).click();
    await expect(panel.getByLabel("예금주")).toBeFocused();
    await expect(panel.getByLabel("예금주")).toHaveAttribute("aria-invalid", "true");
    await expect(panel).toBeVisible();
    await expect(page.getByRole("dialog", { name: /^지급처 (고르기|바꾸기)$/ })).toHaveCount(0);
    expect(await db.select().from(vendors).where(eq(vendors.name, name))).toHaveLength(0);

    // 고친 칸이 있는 패널은 `입력 버리기` 확인 뒤 닫힌다. 손대지 않은 패널의 `취소 Esc`는 확인 없이 닫히고 고르기 창은 다시 열리지 않는다.
    const other = `취소-${randomUUID().slice(0, 6)}`;
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "입력 버리기" }).getByRole("button", { name: "입력 버리기" }).click();
    await expect(panel).toHaveCount(0);
    const again = await openRegisterPanel(page, other);
    await page.keyboard.press("Escape");
    await expect(again).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: /^지급처 (고르기|바꾸기)$/ })).toHaveCount(0);
    await expect(page.locator("#vendor-pick")).toBeFocused();
    await page.context().close();
  });

  // 사용자 결정(10/24 「지금처럼 받기」): 지출결의 쓰기만 있는 PM도 업무 중 등록에서 계좌 세 칸을 넣는다(10/23 R-1 막음을 이 경로에서만 되돌림).
  test("R-1 — 계좌 쓰기 없음 → 등록 패널에 계좌 세 칸 있음 · 저장 → 지급처 칸 · 계좌 실림", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");
    const name = `계좌받음-${randomUUID().slice(0, 6)}`;
    const panel = await openRegisterPanel(page, name);
    await expect(panel.getByLabel("이름")).toHaveValue(name);
    await panel.getByLabel("계좌 은행", { exact: true }).fill("국민");
    await panel.getByLabel("예금주", { exact: true }).fill("주식회사 계좌받음");
    await panel.getByLabel("계좌번호", { exact: true }).fill("123-456-789012");
    await panel.getByRole("button", { name: /^거래처 등록/ }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("expense-vendor")).toHaveText(name);
    const [row] = await db.select({ bank: vendors.accountBank, holder: vendors.accountHolder, last4: vendors.accountNumberLast4 }).from(vendors).where(eq(vendors.name, name));
    expect(row).toEqual({ bank: "국민", holder: "주식회사 계좌받음", last4: "9012" });
    await page.context().close();
  });

  test("K20 — 이미 있는 사업자 번호 → `이미 등록됨 · {이름}` + `이 거래처로` → 지급처 칸에 그 거래처 · 패널 닫힘", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const businessNo = validBusinessNo();
    const existingName = `기존협력-${randomUUID().slice(0, 6)}`;
    await insertVendor(SYSTEM_VIEWER, { name: existingName, normalizedName: existingName, businessNo, kind: "supplier" });
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "phone");
    const panel = await openRegisterPanel(page, `중복-${randomUUID().slice(0, 6)}`);
    await panel.getByLabel("사업자 번호").fill(businessNo);
    await panel.getByRole("button", { name: /^거래처 등록/ }).click();
    await expect(panel.getByText(`이미 등록됨 · ${existingName}`)).toBeVisible();
    await panel.getByRole("button", { name: "이 거래처로" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("expense-vendor")).toHaveText(existingName);
    await page.context().close();
  });
});

// ── N2 흐름 — 일하는 자리 등록 거래처로 승인된 지출결의 → 지급 목록 `확인 전` → 경영관리 확인 → 사라짐 ─────────────────────────

async function teamOf(fx: ExpenseE2E): Promise<string> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return row.teamId;
}

// 팀 업무 범위 지급 권한자 + 거래처 확인 권한(vendors.account 쓰기) — 경영관리 한 사람이 지급 목록과 거래처 패널을 함께 본다.
async function makeManager(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E일자리확인-${randomUUID().slice(0, 8)}`, workScope: "team" });
  for (const [menu, action] of [
    ["expenses", "view"],
    ["expenses.team", "view"],
    ["expenses.payments", "write"],
    ["admin.vendors", "view"],
    ["admin.vendors", "write"],
    ["vendors.account", "view"],
    ["vendors.account", "write"],
  ] as const) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action, allowed: true });
  }
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

// 공용 픽스처로 제출(submitReadyDraft) → 결재선 넷 승인 → 증빙 확인.
async function approve(fx: ExpenseE2E, id: string, manager: Person): Promise<void> {
  const recordId = await insertRecordFixture(fx.pm.viewer, { issuedOn: seoulToday() });
  await insertLinkFixture({ recordId, ownerId: id, attachedBy: fx.pm.viewer.id });
  const submitted = await submitReadyDraft(fx.pm.viewer, id);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: id });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
  const routes = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(eq(approvalRoutes.instanceId, view.instanceId));
  const steps = await db.select({ actedAt: approvalSteps.actedAt }).from(approvalSteps).where(and(inArray(approvalSteps.routeId, routes.map((route) => route.id))));
  expect(steps.length).toBeGreaterThan(0);
  const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, id));
  if (!doc) throw new Error("문서 없음");
  await confirmEvidence(manager.viewer, { expenseId: id, version: doc.version });
}

// 표는 고칠 칸(고를 수 있는 행의 이체액)이 있을 때만 grid다 — 행이 모두 막히면(확인 전 거래처 · 2026-10-24 결정) table(ui/table hasEditableCell).
function targetsTable(page: Page) {
  return page.getByRole("grid", { name: "지급 대상" }).or(page.getByRole("table", { name: "지급 대상" }));
}

function targetRow(page: Page, itemName: string) {
  return targetsTable(page).locator("tbody tr").filter({ has: page.getByRole("link", { name: itemName, exact: false }) });
}

async function methodCell(page: Page, itemName: string) {
  const table = targetsTable(page);
  await expect(table).toBeVisible();
  const index = await table.locator("thead th").evaluateAll((cells) => cells.findIndex((cell) => cell.textContent?.trim() === "지급 방식"));
  expect(index).toBeGreaterThanOrEqual(0);
  const row = table.locator("tbody tr").filter({ has: page.getByRole("link", { name: itemName, exact: false }) });
  await expect(row).toHaveCount(1);
  return row.locator(":scope > th, :scope > td").nth(index);
}

test.describe("N2 — 일하는 자리 등록 거래처의 사후 확인 (07-23)", () => {
  test("등록 거래처로 승인 → 지급 목록 계좌 아래 `거래처 확인 전` → 경영관리 `확인됨으로 표시` → 사라짐", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await grantAccountWrite(fx);
    const manager = await makeManager(fx);
    const page = await loginPage(browser, baseURL, fx.pm);
    const id = await openDraft(page, fx, "worst");
    const name = `N2거래처-${randomUUID().slice(0, 6)}`;
    const panel = await openRegisterPanel(page, name);
    await panel.getByLabel("계좌 은행").fill("국민");
    await panel.getByLabel("예금주").fill("주식회사 N2");
    await panel.getByLabel("계좌번호", { exact: true }).fill("110-222-333444");
    await panel.getByRole("button", { name: /^거래처 등록/ }).click();
    await expect(page.getByTestId("expense-vendor")).toHaveText(name);
    await page.context().close();

    const [vendor] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.name, name));
    if (!vendor) throw new Error("등록 거래처 없음");
    await expect.poll(async () => (await db.select({ vendorId: expenses.vendorId }).from(expenses).where(eq(expenses.id, id)))[0]?.vendorId).toBe(vendor.id);
    await approve(fx, id, manager);

    const payPage = await loginPage(browser, baseURL, manager, { width: 1280, height: 900 });
    await payPage.goto("/expenses");
    await expect((await methodCell(payPage, fx.lines.worst.itemName)).getByText("거래처 확인 전", { exact: true })).toHaveCount(1);
    // 2026-10-24 사용자 결정(G13 일부 변경): 확인 전 거래처 건은 고를 수 없다.
    await expect(targetRow(payPage, fx.lines.worst.itemName).getByRole("checkbox")).toHaveAttribute("aria-disabled", "true");

    await payPage.goto(`/admin/vendors?editId=${vendor.id}`);
    await payPage.getByRole("button", { name: "확인됨으로 표시" }).click();
    await expect(payPage.getByRole("button", { name: "되돌리기" })).toBeVisible();

    await payPage.goto("/expenses");
    await expect((await methodCell(payPage, fx.lines.worst.itemName)).getByText("거래처 확인 전", { exact: true })).toHaveCount(0);
    await expect(targetRow(payPage, fx.lines.worst.itemName).getByRole("checkbox")).not.toHaveAttribute("aria-disabled", "true");
    await payPage.context().close();
  });
});
