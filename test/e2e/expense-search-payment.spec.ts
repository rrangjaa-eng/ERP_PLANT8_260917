import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { previewPayable } from "@/domain/payments";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06.5-08 Task 2(D-6508 · UI-SPEC V1 · OI-11 · DM-3): 지급 대상 · 지급 완료 보기의 검색 칸 — 필터 줄 맨 앞(검색 → select → 이체 파일), 검색하면 고른 행 · 이체액 편집을 비운다,
// 0건이면 `필터 지우기`가 q · 팀 · 증빙을 지운다, 지급 완료 보기는 q가 팀 · 월 select를 바꿔도 남는다. 문서는 도메인 함수로 만든다(payment-transfer-file.spec.ts 꼴).

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value", "vendor.account_number_unmasked"];

async function makePayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E검색지급-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return makePerson("경영관리", role.id, row.teamId, `${seoulToday().slice(0, 4)}-01-01`);
}

// 줄 하나 → 제출 → 결재선 넷 승인 → 지급 권한자가 증빙 확인 = 지급 대상(고를 수 있음). 번호도 돌려준다.
async function approvedTarget(fx: ExpenseE2E, key: LineKey, confirmer: Person): Promise<{ expenseId: string; number: string }> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const submitted = await submitReadyDraft(fx.pm.viewer, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
  const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!doc) throw new Error("문서 없음");
  await confirmEvidence(confirmer.viewer, { expenseId, version: doc.version });
  return { expenseId, number: submitted.number };
}

async function pay(payer: Person, expenseId: string): Promise<void> {
  const payDate = seoulToday();
  const preview = await previewPayable(payer.viewer, { expenseId, payDate });
  if (preview.payableKrw == null) throw new Error("지급 총액 없음");
  const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  const result = await completePaymentsBatch(payer.viewer, { payDate, rows: [{ expenseId, expenseVersion: doc?.version ?? 0, expectedPayableKrw: preview.payableKrw }] });
  if (result.processed !== 1) throw new Error(`지급 안 됨: ${JSON.stringify(result.blocked)}`);
}

function rowOf(page: Page, itemName: string) {
  return page.locator("tbody tr").filter({ hasText: itemName });
}

test.describe("지급 대상 검색 (06.5 D-6508 · OI-11)", () => {
  test("검색하면 고른 행 · 이체액 편집이 비고 1차는 건수가 없고, 검색어를 지우면 이체액이 서버 값이다 · 필터 줄은 검색 → select → 이체 파일 순서", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makePayer(fx);
    const tracer = await approvedTarget(fx, "tracer", payer);
    await approvedTarget(fx, "hold", payer);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const tracerRow = rowOf(page, fx.lines.tracer.itemName);
    const holdRow = rowOf(page, fx.lines.hold.itemName);
    await waitForHydration(tracerRow.getByRole("checkbox"));
    const original = (await tracerRow.getByTestId("payment-transfer-cell").innerText()).trim();

    // 필터 줄 순서 — 검색 → 상태 → 팀 → 증빙 → 이체 파일 받기(SP-65-2).
    const xs = await page.evaluate(() => {
      const left = (element: Element | null) => element?.getBoundingClientRect().left ?? -1;
      const button = Array.from(document.querySelectorAll("button")).find((node) => node.textContent?.trim() === "이체 파일 받기") ?? null;
      return [
        left(document.querySelector("#expense-search")),
        left(document.querySelector("#expense-status")),
        left(document.querySelector("#expense-filter-team")),
        left(document.querySelector("#expense-filter-evidence")),
        left(button),
      ];
    });
    expect(xs.every((x) => x >= 0)).toBe(true);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);

    // 두 행을 고르고 한 행의 이체액을 고친다.
    await holdRow.getByRole("checkbox").check();
    await tracerRow.getByTestId("payment-transfer-cell").click();
    await tracerRow.getByLabel("이체액").fill("1");
    await tracerRow.getByLabel("이체액").press("Enter");
    await expect(tracerRow.getByRole("checkbox")).toBeChecked();
    await expect(page.getByRole("button", { name: /^지급 완료 2/ })).toBeVisible();

    // 번호로 검색 — 그 문서만 남고 선택은 비며 1차는 건수 없는 `지급 완료`.
    const search = page.getByRole("textbox", { name: "검색" });
    await search.fill(tracer.number);
    await search.press("Enter");
    await expect(page).toHaveURL((url) => url.searchParams.get("q") === tracer.number);
    await expect(holdRow).toHaveCount(0);
    await expect(tracerRow.getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByRole("button", { name: /^지급 완료 Ctrl\+Enter$/ })).toBeDisabled();

    // 검색어를 지워 다시 제출 — 이체액은 고치기 전 서버 값, 선택은 비어 있다.
    await search.fill("");
    await search.press("Enter");
    await expect(rowOf(page, fx.lines.hold.itemName)).toHaveCount(1);
    expect((await rowOf(page, fx.lines.tracer.itemName).getByTestId("payment-transfer-cell").innerText()).trim()).toBe(original);
    await expect(rowOf(page, fx.lines.tracer.itemName).getByRole("checkbox")).not.toBeChecked();
    await expect(rowOf(page, fx.lines.hold.itemName).getByRole("checkbox")).not.toBeChecked();
    await page.context().close();
  });

  test("0건이면 필터 줄 · 검색어가 남고 `필터 지우기`가 q · 팀 · 증빙을 모두 지운 주소로 간다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makePayer(fx);
    await approvedTarget(fx, "tracer", payer);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto(`/expenses?${new URLSearchParams({ status: "지급 대상", q: "없는검색어zz", evidence: "payable" })}`);
    await expect(page.getByRole("textbox", { name: "검색" })).toHaveValue("없는검색어zz");
    const empty = page.locator('[data-ui="empty-state"]');
    await expect(empty).toContainText("조건에 맞는 건이 없습니다");
    await expect(page.getByRole("button", { name: /지급 완료/ })).toHaveCount(0);
    const clear = empty.getByRole("link", { name: "필터 지우기" });
    await expect(clear).toHaveAttribute("href", `/expenses?${new URLSearchParams({ status: "지급 대상" })}`);
    await clear.click();
    await expect(page).toHaveURL((url) => !url.searchParams.has("q") && !url.searchParams.has("evidence") && !url.searchParams.has("team"));
    await expect(rowOf(page, fx.lines.tracer.itemName)).toHaveCount(1);
    await page.context().close();
  });
});

test.describe("지급 완료 검색 (06.5 D-6508)", () => {
  test("q로 그 지급만 보이고 팀 · 월 select를 바꿔도 q가 남으며 0건이면 필터 줄이 남는다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makePayer(fx);
    const tracer = await approvedTarget(fx, "tracer", payer);
    await approvedTarget(fx, "hold", payer);
    await pay(payer, tracer.expenseId);
    const holdDoc = await approvedTarget(fx, "retry", payer);
    await pay(payer, holdDoc.expenseId);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto(`/expenses?${new URLSearchParams({ status: "지급 완료", q: tracer.number })}`);
    await expect(page.getByRole("textbox", { name: "검색" })).toHaveValue(tracer.number);
    await expect(rowOf(page, fx.lines.tracer.itemName)).toHaveCount(1);
    await expect(rowOf(page, fx.lines.retry.itemName)).toHaveCount(0);

    // 월 select가 바뀐 이동이 끝난 뒤 다음 goto를 해야 한다 — q · status만 보면 이동 전 주소로도 통과해 goto가 ERR_ABORTED로 끊긴다.
    const monthSelect = page.getByRole("combobox", { name: "월" });
    const monthBefore = await monthSelect.inputValue();
    const monthFirst = await monthSelect.locator("option").first().getAttribute("value");
    await monthSelect.selectOption({ index: 0 });
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("q") === tracer.number &&
        url.searchParams.get("status") === "지급 완료" &&
        (monthFirst === monthBefore || url.searchParams.get("month") === monthFirst),
    );
    await page.waitForLoadState();

    await page.goto(`/expenses?${new URLSearchParams({ status: "지급 완료", q: "없는검색어zz" })}`);
    await expect(page.getByRole("textbox", { name: "검색" })).toHaveValue("없는검색어zz");
    const empty = page.locator('[data-ui="empty-state"]');
    await expect(empty).toContainText("조건에 맞는 건이 없습니다");
    await empty.getByRole("link", { name: "필터 지우기" }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has("q") && url.searchParams.get("status") === "지급 완료");
    await expect(rowOf(page, fx.lines.tracer.itemName)).toHaveCount(1);
    await page.context().close();
  });
});

test.afterAll(archiveTempRoles);
