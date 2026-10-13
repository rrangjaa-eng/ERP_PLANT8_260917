import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, expenseEvidenceReviews, expensePayments, expenses, files, projects, quoteLines, vendors } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, createTeamExpenseDraft, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence, loadPrepaidDueDays } from "@/domain/evidence-reviews";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { listAllPaymentTargets } from "@/domain/payments/targets";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { AMOUNT_HIDDEN } from "@/domain/payments/action-row";
import { previewPayable } from "@/domain/payments";
import { formatKrw } from "@/lib/format-number";
import { encrypt } from "@/lib/crypto";
import { seedCodeItem } from "@/repositories/code-tables";
import { addHistorizedValue, cancelHistorizedValue, getSettingValue } from "@/domain/settings/registry";
import { PAYMENT_METHOD_EVIDENCE_PAIRS, TAX_VAT_RATE } from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { EVIDENCE_UNCONFIRMED } from "@/domain/payments/action-row";
import { seoulToday } from "@/lib/dates";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { attachEvidence, submitReadyDraft } from "../integration/fixtures/expenses";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E, type LineKey, archiveTempRoles, insertTempRole } from "./expense-fixture";

// 06-15(EXP-09 · UI-SPEC S1 · S2): 지급 권한자의 `/expenses` 기본 보기 「지급 대상」 → 여러 건 고르기 → 확인 모달(지급일) → 건별 처리.
// E2E DB는 스펙끼리 공유한다 — 지급 권한자는 팀 업무 범위(`expenses.team` 보기)로 이 스펙의 프로젝트 팀 문서만 보게 만든다(목록 보임 범위 = 문서 보임).
// 문서는 도메인 함수로 만든다(증빙은 메모리 가짜 저장소로 붙여 제출하고, 결재 통과 뒤 지급 권한자의 증빙 확인으로 P4).

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

async function teamOf(fx: ExpenseE2E): Promise<string> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return row.teamId;
}

// 테스트 계급 「경영관리」 — 팀 업무 범위 · 지출결의 보기(+ 팀 보기) + 지급 처리 쓰기. 이 스펙 프로젝트의 팀에 발령한다.
async function makeTeamPayer(fx: ExpenseE2E, opts: { amountHidden?: boolean } = {}): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E일괄지급-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: !(opts.amountHidden && infoItem === "expense.amount") });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

// 줄 하나 → 증빙 붙여 제출 → 결재선 넷 승인 → (payable이면) 지급 권한자가 증빙 금액 = 공급가로 확인 = P4 · (unreviewed면) 확인 전 = P2. 문서 id를 돌려준다.
// 전역 설정(증빙 필수)을 바꾸지 않는다 — 다른 워커의 스펙(payment-single 등)과 설정을 다투지 않게 확인 기록으로 P4를 만든다.
async function approvedTarget(fx: ExpenseE2E, key: LineKey, state: "payable" | "unreviewed" = "payable"): Promise<string> {
  return approvedLine(fx, fx.lines[key].id, state);
}

async function approvedLine(fx: ExpenseE2E, lineId: string, state: "payable" | "unreviewed" = "payable", confirmerOf?: Person): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const submitted = await submitReadyDraft(fx.pm.viewer, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
  }
  if (state === "unreviewed") return expenseId;
  const [doc] = await db.select({ version: expenses.version, supply: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, expenseId));
  if (!doc?.supply) throw new Error("문서 · 공급가 없음");
  const confirmer = confirmerOf ?? (await makeTeamPayer(fx));
  // 빈 증빙 금액은 확인 때 공급가로 적는다(F2 — 빈 금액은 확인이 채우지 않는다).
  await confirmEvidence(confirmer.viewer, { expenseId, version: doc.version, correctedAmountKrw: doc.supply });
  return expenseId;
}

// 06-17 Task 3 — 50건 쪽(LIST_PAGE_SIZE)을 넘는 목록. 픽스처 차수는 고객 승인으로 잠겨 줄을 더할 수 없으므로, 같은 팀에 프로젝트를 하나 더 만들어
// (픽스처와 같은 도메인 함수 순서 — 줄 저장 → 진행 중 → 고객 승인) 줄마다 P4 문서를 만든다. 예정일을 모두 오늘로 맞춰 한 그룹 · 번호 순 —
// 마지막에 만든 문서가 둘째 쪽에 선다.
async function manyTargets(fx: ExpenseE2E, count: number): Promise<{ id: string; itemName: string }[]> {
  const today = seoulToday();
  const suffix = randomUUID().slice(0, 6);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E쪽넘김클라이언트-${suffix}`, normalizedName: `e2e쪽넘김클라이언트-${suffix}` });
  const project = await createProject(fx.pm.viewer, {
    clientId: client.id,
    teamId: await teamOf(fx),
    pmUserId: fx.pm.viewer.id,
    name: `E2E쪽넘김-${suffix}`,
    startDate: `${today.slice(0, 4)}-01-01`,
    endDate: `${today.slice(0, 4)}-12-31`,
  });
  if (!project.id) throw new Error("프로젝트 없음");
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("차수 없음");
  const subcategory = (await firstSelectableSubcategory()).value;
  const names = Array.from({ length: count }, (_, index) => `쪽 넘김 ${String(index + 1).padStart(2, "0")}-${suffix}`);
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: names.map((itemName) => ({
      id: randomUUID(),
      isNew: true as const,
      subcategory,
      itemName,
      vendorId: fx.vendorId,
      unitPrice: { currency: "KRW" as const, amount: 1_100_000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
    })),
  });
  await changeProjectStatus(fx.lead.viewer, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(fx.pm.viewer, revision.id, { approvedOn: today, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  const confirmer = await makeTeamPayer(fx);
  const made: { id: string; itemName: string }[] = [];
  for (const itemName of names) {
    const lineId = saved.lines.find((row) => row.itemName === itemName)?.id;
    if (!lineId) throw new Error(`견적 줄 없음: ${itemName}`);
    const id = await approvedLine(fx, lineId, "payable", confirmer);
    await setScheduled(id, seoulToday());
    made.push({ id, itemName });
  }
  return made;
}

function rowOf(page: Page, itemName: string) {
  return page.locator("tbody tr").filter({ hasText: itemName });
}

async function livePaymentCount(expenseId: string): Promise<number> {
  const rows = await db
    .select({ id: expensePayments.id })
    .from(expensePayments)
    .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
  return rows.length;
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

async function setScheduled(expenseId: string, date: string | null): Promise<void> {
  await db.update(expenses).set({ scheduledPaymentDate: date }).where(eq(expenses.id, expenseId));
}

async function payDates(expenseId: string): Promise<string[]> {
  const rows = await db
    .select({ payDate: expensePayments.payDate })
    .from(expensePayments)
    .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
  return rows.map((row) => String(row.payDate));
}

function tokenAsColor(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
}

function tokenAsWeight(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement("span");
    probe.style.fontWeight = `var(${token})`;
    document.body.append(probe);
    const weight = getComputedStyle(probe).fontWeight;
    probe.remove();
    return weight;
  }, name);
}

function colorOf(locator: ReturnType<Page["locator"]>): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

test.describe("지급 대상 · 일괄 지급 (06-15 Task 1)", () => {
  test("지급 대상 기본 보기 → 두 건 지급 — select `지급 대상` · 두 건 고름 → `지급 완료 2` → 모달 지급일 오늘 → 두 행이 빠지고 결과 글자", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const a = await approvedTarget(fx, "tracer");
    const b = await approvedTarget(fx, "hold");
    const payer = await makeTeamPayer(fx);

    const page = await loginPage(browser, baseURL, payer);
    await page.goto("/expenses");
    await expect(page.getByLabel("상태")).toHaveValue("지급 대상");
    const rowA = rowOf(page, fx.lines.tracer.itemName);
    const rowB = rowOf(page, fx.lines.hold.itemName);
    await waitForHydration(rowA.getByRole("checkbox"));
    await rowA.getByRole("checkbox").check();
    await rowB.getByRole("checkbox").check();

    await page.getByRole("button", { name: /^지급 완료 2/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("지급일")).toHaveValue(seoulToday());
    await dialog.getByRole("button", { name: /^지급 완료 2건/ }).click();

    await expect(dialog).toBeHidden();
    await expect(rowA).toHaveCount(0);
    await expect(rowB).toHaveCount(0);
    const live = page.locator('[aria-live="polite"]').filter({ hasText: "지급 완료" });
    await expect(live).toHaveText(/^\d{2}:\d{2} 지급 완료 2건$/);
    expect(await livePaymentCount(a)).toBe(1);
    expect(await livePaymentCount(b)).toBe(1);
    await page.context().close();
  });

  test("지급 권한 없는 사람 — select에 `지급 대상` 값이 없고 기본은 `진행 중`(05 그대로)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await approvedTarget(fx, "retry");

    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto("/expenses");
    const select = page.getByLabel("상태");
    await expect(select).toHaveValue("진행 중");
    await expect(select.locator("option", { hasText: "지급 대상" })).toHaveCount(0);
    await page.context().close();
  });
});

test.describe("지급 대상 · 일괄 지급 마감 (06-15 Task 3)", () => {
  test("빈 지급 대상 — 0건이면 `지급할 건이 없습니다 · 지급 완료 보기`(→ `?status=지급 완료`), 필터 0건이면 `조건에 맞는 건이 없습니다 · 필터 지우기` · 합계 · 선택 · 1차 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer);

    await page.goto("/expenses");
    await expect(page.getByText("지급할 건이 없습니다")).toBeVisible();
    // 화면 이동이라 링크(<a>, SYSTEM §10) — href는 URLSearchParams로 인코딩한다(원시 공백 · 한글 href는 프리페치가 끝나지 않는다, 06-15 검토 I-1).
    const paidView = page.getByRole("link", { name: "지급 완료 보기" });
    await expect(paidView).toBeVisible();
    await expect(paidView).toHaveAttribute("href", `/expenses?${new URLSearchParams({ status: "지급 완료" })}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("region", { name: "합계" })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^지급 완료( \d|$)/ })).toHaveCount(0);
    await waitForHydration(paidView);
    await paidView.click();
    await expect(page).toHaveURL(/\/expenses\?status=(%EC%A7%80%EA%B8%89(%20|\+)%EC%99%84%EB%A3%8C|지급 완료)$/);

    await approvedTarget(fx, "tracer");
    await page.goto(`/expenses?status=${encodeURIComponent("지급 대상")}&evidence=unreviewed`);
    await expect(page.getByText("조건에 맞는 건이 없습니다")).toBeVisible();
    const clear = page.getByRole("link", { name: "필터 지우기" });
    await expect(clear).toBeVisible();
    await expect(clear).toHaveAttribute("href", `/expenses?${new URLSearchParams({ status: "지급 대상" })}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("region", { name: "합계" })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^지급 완료/ })).toHaveCount(0);
    await waitForHydration(clear);
    await clear.click();
    await expect(page).not.toHaveURL(/evidence=/);
    await expect(rowOf(page, fx.lines.tracer.itemName)).toHaveCount(1);
    await page.context().close();
  });

  test("증빙 필터 — `확인 전`을 고르면 URL `evidence=unreviewed` · 확인 전 행만 · 합계 줄 건수가 그 필터 전체", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await approvedTarget(fx, "tracer", "unreviewed");
    await approvedTarget(fx, "hold");
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer);

    await page.goto("/expenses");
    await expect(rowOf(page, fx.lines.tracer.itemName)).toHaveCount(1);
    await expect(rowOf(page, fx.lines.hold.itemName)).toHaveCount(1);
    await waitForHydration(page.getByLabel("증빙", { exact: true }));
    await page.getByLabel("증빙", { exact: true }).selectOption({ label: "확인 전" });
    await expect(page).toHaveURL(/evidence=unreviewed/);
    await expect(rowOf(page, fx.lines.hold.itemName)).toHaveCount(0);
    await expect(rowOf(page, fx.lines.tracer.itemName)).toHaveCount(1);
    await expect(page.getByRole("region", { name: "합계" })).toContainText("합계 (지급 대상 · 1건)");
    await page.context().close();
  });

  test("그룹 · 합계 — 예정일 어제 · 오늘 · 없음 → `예정일 지남` · `이번 주 지급` · `지급 예정일 없음` 순, 지남 머리글 경고 색 · 합계 금액 굵게", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const today = seoulToday();
    await setScheduled(await approvedTarget(fx, "tracer"), addDays(today, -1));
    await setScheduled(await approvedTarget(fx, "hold"), today);
    await setScheduled(await approvedTarget(fx, "retry"), null);
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });

    await page.goto("/expenses");
    const table = page.getByRole("grid", { name: "지급 대상" }); // 06-17 — P4 행에 이체액 편집 칸이 서서 편집 표(grid)다
    const overdue = table.getByText("예정일 지남", { exact: true });
    const thisWeek = table.getByText("이번 주 지급", { exact: true });
    const none = table.getByText("지급 예정일 없음", { exact: true });
    await expect(overdue).toBeVisible();
    const ys = await Promise.all([overdue, thisWeek, none].map(async (locator) => (await locator.boundingBox())?.y ?? -1));
    expect(ys[0]).toBeLessThan(ys[1] ?? -1);
    expect(ys[1]).toBeLessThan(ys[2] ?? -1);
    expect(await colorOf(overdue)).toBe(await tokenAsColor(page, "--status-warning"));
    expect(await colorOf(thisWeek)).not.toBe(await tokenAsColor(page, "--status-warning"));

    const totals = page.getByRole("region", { name: "합계" });
    await expect(totals).toContainText("합계 (지급 대상 · 3건)");
    const amount = totals.locator("p").filter({ hasText: "지급 총액" });
    expect(await amount.evaluate((element) => getComputedStyle(element).fontWeight)).toBe(await tokenAsWeight(page, "--fw-bold"));
    await page.context().close();
  });

  test("막힌 행 이유 · 결과 글자 색 — 모달을 연 사이 다른 사람이 한 건을 먼저 지급 → 이유 줄 위험 색 · 결과 글자 두 색 · 막힌 행 선택 칸 aria-disabled · 토스트 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const a = await approvedTarget(fx, "tracer");
    const b = await approvedTarget(fx, "hold");
    const payer = await makeTeamPayer(fx);
    const other = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });

    await page.goto("/expenses");
    const rowA = rowOf(page, fx.lines.tracer.itemName);
    const rowB = rowOf(page, fx.lines.hold.itemName);
    await waitForHydration(rowA.getByRole("checkbox"));
    await rowA.getByRole("checkbox").check();
    await rowB.getByRole("checkbox").check();
    await page.getByRole("button", { name: /^지급 완료 2/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("지급일")).toHaveValue(seoulToday());

    const targetB = (await listAllPaymentTargets(other.viewer, {})).find((target) => target.row.id === b);
    if (!targetB || targetB.payableKrw === null) throw new Error("b 지급 대상 없음");
    const first = await completePaymentsBatch(other.viewer, {
      payDate: seoulToday(),
      rows: [{ expenseId: b, expenseVersion: targetB.row.version, expectedPayableKrw: targetB.payableKrw }],
    });
    expect(first.processed).toBe(1);

    await dialog.getByRole("button", { name: /^지급 완료 2건/ }).click();
    await expect(dialog).toBeHidden();
    const live = page.locator('p[aria-live="polite"]').filter({ hasText: "지급 완료" });
    await expect(live).toHaveText(/^\d{2}:\d{2} 지급 완료 1건 · 막힘 1건$/);
    const done = live.locator("span").filter({ hasText: "지급 완료 1건" });
    const blockedPart = live.locator("span").filter({ hasText: "막힘 1건" });
    expect(await colorOf(done)).toBe(await tokenAsColor(page, "--status-success"));
    expect(await colorOf(blockedPart)).toBe(await tokenAsColor(page, "--status-danger"));

    await expect(rowA).toHaveCount(0);
    await expect(rowB).toHaveCount(1);
    const reasonLine = rowB.locator('p[id$="-select-blocked"]');
    await expect(reasonLine).toHaveText(/^이미 지급됨 · .+ · \d{2}:\d{2} · 새로 고침$/);
    expect(await colorOf(reasonLine)).toBe(await tokenAsColor(page, "--status-danger"));
    await expect(rowB.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(await livePaymentCount(a)).toBe(1);
    expect(await livePaymentCount(b)).toBe(1);
    await page.context().close();
  });

  test("미래 지급일 — 내일로 처리하면 지급일 = 내일 / `2026-13-01` · `2026-02-30`은 둘 다 `날짜 형식 오류 · 2026-09-19처럼` · 모달 유지 · 지급 0건", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const a = await approvedTarget(fx, "tracer");
    const b = await approvedTarget(fx, "hold");
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });

    await page.goto("/expenses");
    const rowB = rowOf(page, fx.lines.hold.itemName);
    await waitForHydration(rowB.getByRole("checkbox"));
    await rowB.getByRole("checkbox").check();
    await page.getByRole("button", { name: /^지급 완료 1/ }).click();
    const dialog = page.getByRole("dialog");
    const field = dialog.getByLabel("지급일");
    // type="date"는 달력에 없는 날을 값으로 받지 않는다(브라우저가 빈 값으로 정리) — 그 값이 React onChange로 오는 길을 그대로 탄다.
    for (const bad of ["2026-13-01", "2026-02-30"]) {
      await field.evaluate((element, value) => {
        const input = element as HTMLInputElement;
        Reflect.set(HTMLInputElement.prototype, "value", value, input);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, bad);
      await expect(dialog.getByText("날짜 형식 오류 · 2026-09-19처럼")).toBeVisible();
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await dialog.getByRole("button", { name: /^지급 완료 1건/ }).click({ force: true });
      await expect(dialog).toBeVisible();
      expect(await livePaymentCount(b)).toBe(0);
      await field.fill(seoulToday());
      await expect(dialog.getByText("날짜 형식 오류 · 2026-09-19처럼")).toHaveCount(0);
    }

    const tomorrow = addDays(seoulToday(), 1);
    await field.fill(tomorrow);
    await dialog.getByRole("button", { name: /^지급 완료 1건/ }).click();
    await expect(dialog).toBeHidden();
    await expect(rowB).toHaveCount(0);
    expect(await payDates(b)).toEqual([tomorrow]);
    expect(await livePaymentCount(a)).toBe(0);
    await page.context().close();
  });

  test("좁은 폭 — 800px은 선택 칸 · 1차 없음(보기만) / 390px은 행이 문서 화면 링크", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const a = await approvedTarget(fx, "tracer");
    const payer = await makeTeamPayer(fx);

    const tablet = await loginPage(browser, baseURL, payer, { width: 800, height: 900 });
    await tablet.goto("/expenses");
    await expect(rowOf(tablet, fx.lines.tracer.itemName)).toHaveCount(1);
    await expect(tablet.getByRole("checkbox")).toHaveCount(0);
    await expect(tablet.getByRole("button", { name: /^지급 완료/ })).toHaveCount(0);
    await tablet.context().close();

    const phone = await loginPage(browser, baseURL, payer, { width: 390, height: 844 });
    await phone.goto("/expenses");
    const link = rowOf(phone, fx.lines.tracer.itemName).locator("a[data-row-link]");
    await expect(link).toHaveAttribute("href", `/expenses/${a}`);
    // 검토 D-6 — 한 줄로 자른 폰 제목은 전체 값을 title로도 남긴다.
    expect(await link.getAttribute("title")).toContain(fx.lines.tracer.itemName);
    await expect(phone.getByRole("checkbox")).toHaveCount(0);
    await link.click();
    await expect(phone).toHaveURL(new RegExp(`/expenses/${a}$`));
    await phone.context().close();
  });

  test("1건 · 0건 — 하나 고르면 1차 `지급 완료 1`, 고른 건이 없으면 1차 비활성 + `고른 건 없음`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await approvedTarget(fx, "tracer");
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });

    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await waitForHydration(row.getByRole("checkbox"));
    const primary = page.getByRole("button", { name: /^지급 완료/ });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("고른 건 없음")).toBeVisible();
    await row.getByRole("checkbox").check();
    await expect(primary).toHaveAccessibleName(/^지급 완료 1/);
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await row.getByRole("checkbox").uncheck();
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("고른 건 없음")).toBeVisible();
    await page.context().close();
  });

  test("금액 숨김 지급 권한자 — 모든 행이 막혀 1차 `지급 완료` 비활성 이유가 `고른 건 없음`이 아니라 `지급 총액 볼 권한 없음 · 노출 설정은 관리자`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await approvedTarget(fx, "tracer");
    const payer = await makeTeamPayer(fx, { amountHidden: true });
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });

    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await waitForHydration(row.getByRole("checkbox"));
    await expect(row.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true");
    const primary = page.getByRole("button", { name: /^지급 완료/ });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(primary).toHaveAccessibleDescription(AMOUNT_HIDDEN);
    await expect(page.getByText("고른 건 없음")).toHaveCount(0);
    await page.context().close();
  });
});

test.describe("일괄 지급 마감 (06-17)", () => {
  test("이체액 고침 → 자동 선택 → 사유 → 처리 — 차이 2행(서버 값 · 경고 색) · 사유 칸 필수 · 합 = 서버 값(굵게) → S2 → 문서 화면 S5에 이체액 · 차이 · 사유 · 세율 바뀜 줄 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedTarget(fx, "tracer");
    const payer = await makeTeamPayer(fx);
    const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
    if (preview.payableKrw == null) throw new Error("지급 총액 없음");
    const transfer = preview.payableKrw - 3_300;

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    const checkbox = row.getByRole("checkbox");
    await waitForHydration(checkbox);
    await expect(checkbox).not.toBeChecked();
    await expect(row.getByLabel("차이 사유")).toHaveCount(0);

    await row.getByTestId("payment-transfer-cell").click();
    await row.getByLabel("이체액").fill(String(transfer));
    await row.getByLabel("이체액").press("Enter");
    await expect(checkbox).toBeChecked();
    const diff = row.getByText("차이 -3,300", { exact: true });
    await expect(diff).toBeVisible();
    expect(await colorOf(diff)).toBe(await tokenAsColor(page, "--status-warning"));
    const reasonCell = row.locator('td:has([data-testid="payment-diff-reason-cell"])');
    await expect(reasonCell).toHaveAttribute("aria-readonly", "false");

    const totals = page.getByRole("region", { name: "합계" });
    await expect(totals.getByText(/^고른 1건 · 이체액/)).toBeVisible();
    const sum = totals.getByText(formatKrw(transfer), { exact: true });
    await expect(sum).toBeVisible();
    expect(await sum.evaluate((element) => getComputedStyle(element).fontWeight)).toBe(await tokenAsWeight(page, "--fw-bold"));

    await reasonCell.click();
    await row.getByLabel("차이 사유").fill("이체 수수료");
    await row.getByLabel("차이 사유").press("Enter");
    await expect(row.getByText("이체 수수료", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^지급 완료 1/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(`1건 · 이체액 합계 ${formatKrw(transfer)}`)).toBeVisible();
    await dialog.getByRole("button", { name: /^지급 완료 1건/ }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(0);

    await page.goto(`/expenses/${expenseId}`);
    await expect(page.getByTestId("payment-paid-line")).toContainText(`지급 총액 ${formatKrw(preview.payableKrw)} · 차이 -3,300`);
    await expect(page.getByText(formatKrw(transfer), { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("payment-diff-reason")).toHaveText("이체 수수료");
    await expect(page.getByTestId("expense-tax-drift")).toHaveCount(0);
    const [record] = await db
      .select({ transferKrw: expensePayments.transferKrw, diffKrw: expensePayments.diffKrw, diffReason: expensePayments.diffReason })
      .from(expensePayments)
      .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
    expect(record).toEqual({ transferKrw: transfer, diffKrw: -3_300, diffReason: "이체 수수료" });
    await page.context().close();
  });
  test("모달 지급일 기억(O-3) — 닫고 다시 열면 방금 고른 날, 필터를 바꾸면 오늘", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await approvedTarget(fx, "tracer");
    const payer = await makeTeamPayer(fx);
    const tomorrow = addDays(seoulToday(), 1);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await waitForHydration(row.getByRole("checkbox"));
    await row.getByRole("checkbox").check();
    const primary = page.getByRole("button", { name: /^지급 완료 1/ });
    await primary.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("지급일").fill(tomorrow);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await primary.click();
    await expect(dialog.getByLabel("지급일")).toHaveValue(tomorrow);
    await page.keyboard.press("Escape");

    // 검토 L-2 — 같은 필터로 다시 마운트되면(문서 화면 왕복) 합의 세율 기준일도 기억한 지급일이다(모달 지급일과 같은 날).
    const sumRequest = page.waitForRequest(
      (request) => request.method() === "POST" && Boolean(request.headers()["next-action"]) && (request.postData() ?? "").includes('"seq"'),
    );
    await row.locator("a[data-row-link]").click();
    await expect(page).toHaveURL(/from=pay/);
    await page.goBack();
    expect((await sumRequest).postData()).toContain(`"payDate":"${tomorrow}"`);
    await waitForHydration(row.getByRole("checkbox"));
    await expect(row.getByRole("checkbox")).toBeChecked();

    await page.getByLabel("증빙", { exact: true }).selectOption({ label: "지급 가능" });
    await expect(page).toHaveURL(/evidence=payable/);
    await waitForHydration(row.getByRole("checkbox"));
    await row.getByRole("checkbox").check();
    await page.getByRole("button", { name: /^지급 완료 1/ }).click();
    await expect(page.getByRole("dialog").getByLabel("지급일")).toHaveValue(seoulToday());
    await page.context().close();
  });

  test("합 실패 — S1 `고른 1건 · 합계를 받지 못함 · 다시 시도` · S2 막힘 이유 `합계를 받지 못함` + 1차 aria-disabled → `다시 시도`로 같은 번호 합을 받으면 켜짐", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await approvedTarget(fx, "tracer");
    const payer = await makeTeamPayer(fx);
    const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
    if (preview.payableKrw == null) throw new Error("지급 총액 없음");

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await waitForHydration(row.getByRole("checkbox"));
    // 서버 액션(POST · next-action 머리)을 끊는다 — 고르기 뒤 나가는 요청은 합 액션 하나다.
    const cut = (route: import("@playwright/test").Route) => (route.request().headers()["next-action"] ? route.abort() : route.fallback());
    await page.route("**/expenses**", cut);
    await row.getByRole("checkbox").check();
    const totals = page.getByRole("region", { name: "합계" });
    await expect(totals.getByText("고른 1건 · 합계를 받지 못함 ·")).toBeVisible();
    await expect(totals.getByRole("button", { name: "다시 시도" })).toBeVisible();

    await page.getByRole("button", { name: /^지급 완료 1/ }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: /^지급 완료 1건/ });
    await expect(confirm).toHaveAccessibleDescription("합계를 받지 못함");
    await expect(confirm).toHaveAttribute("aria-disabled", "true");
    await page.unroute("**/expenses**", cut);
    await dialog.getByRole("button", { name: "다시 시도" }).click();
    await expect(dialog.getByText(`1건 · 이체액 합계 ${formatKrw(preview.payableKrw)}`)).toBeVisible();
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    await page.context().close();
  });

  test("일괄 결과 알림 · 막힌 행 선택 — 게이트 막힘 · 지급일 세율 막힘 · 처리 한 건씩: 빈 aria-live → 결과 글자, 막힌 행 aria-describedby 둘, 포커스 첫 막힌 행, 게이트 막힘만 선택 풀림", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const fx = await setupExpenseE2E();
    const today = seoulToday();
    const gateId = await approvedTarget(fx, "tracer");
    const taxId = await approvedTarget(fx, "hold");
    await approvedTarget(fx, "retry");
    await setScheduled(gateId, addDays(today, -1));
    const typeValue = `e2e_vat_paydate_${randomUUID().slice(0, 6)}`;
    await seedCodeItem(SYSTEM_VIEWER, {
      tableKey: "evidence_type",
      value: typeValue,
      label: typeValue,
      sortOrder: 99,
      taxRule: { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "payment_date" },
    });
    await db.update(expenses).set({ evidenceType: typeValue }).where(eq(expenses.id, taxId));
    const rateFrom = addDays(today, 30);
    const payDate = addDays(today, 40);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: rateFrom, value: 0.12 });
    try {
      const payer = await makeTeamPayer(fx);
      const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
      await page.goto("/expenses");
      const live = page.locator('main p[aria-live="polite"]');
      await expect(live).toHaveCount(1);
      await expect(live).toHaveText("");
      const gateRow = rowOf(page, fx.lines.tracer.itemName);
      const taxRow = rowOf(page, fx.lines.hold.itemName);
      const doneRow = rowOf(page, fx.lines.retry.itemName);
      await waitForHydration(gateRow.getByRole("checkbox"));
      for (const row of [gateRow, taxRow, doneRow]) await row.getByRole("checkbox").check();

      await page.getByRole("button", { name: /^지급 완료 3/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(/^3건 · 이체액 합계 [\d,]+$/)).toBeVisible();
      await dialog.getByLabel("지급일").fill(payDate);
      // 모달을 연 사이 기안자가 증빙을 더해 확인 기록이 풀린다(C4 — version + 1 · P2).
      await attachEvidence(fx.pm.viewer, gateId);
      await dialog.getByRole("button", { name: /^지급 완료 3건/ }).click();
      await expect(dialog).toBeHidden();

      await expect(live).toHaveText(/^\d{2}:\d{2} 지급 완료 1건 · 막힘 2건$/);
      await expect(doneRow).toHaveCount(0);
      const gateBox = gateRow.getByRole("checkbox");
      await expect(gateBox).toBeFocused();
      const ids = ((await gateBox.getAttribute("aria-describedby")) ?? "").split(" ").filter(Boolean);
      expect(ids).toHaveLength(2);
      const texts = await Promise.all(ids.map((id) => page.locator(`[id="${id}"]`).innerText()));
      expect(texts[0]).toBe(EVIDENCE_UNCONFIRMED);
      expect(texts[1]).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
      await expect(gateBox).not.toBeChecked();
      await expect(gateBox).toHaveAttribute("aria-disabled", "true");
      await expect(taxRow.getByRole("checkbox")).toBeChecked();
      await expect(taxRow.getByText(`지급일 ${payDate.slice(5)} 기준 지급 총액 바뀜 · 이체액 확인`)).toBeVisible();
      const newPayable = await previewPayable(payer.viewer, { expenseId: taxId, payDate });
      if (newPayable.payableKrw == null) throw new Error("새 지급 총액 없음");
      await expect(taxRow.getByText(formatKrw(newPayable.payableKrw), { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^지급 완료 1/ })).toBeVisible();

      // 재시도 — 기억한 지급일 · 새 지급 총액으로 보내 같은 이유로 다시 막히지 않는다.
      await page.getByRole("button", { name: /^지급 완료 1/ }).click();
      await expect(dialog.getByLabel("지급일")).toHaveValue(payDate);
      await expect(dialog.getByText(`1건 · 이체액 합계 ${formatKrw(newPayable.payableKrw)}`)).toBeVisible();
      await dialog.getByRole("button", { name: /^지급 완료 1건/ }).click();
      await expect(dialog).toBeHidden();
      await expect(live).toHaveText(/^\d{2}:\d{2} 지급 완료 1건$/);
      expect(await livePaymentCount(taxId)).toBe(1);
      expect(await payDates(taxId)).toEqual([payDate]);
      await page.context().close();
    } finally {
      await cancelHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, rateFrom);
    }
  });

  test("막힘 0 — 처리 뒤 포커스는 1차 버튼", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await approvedTarget(fx, "tracer");
    await approvedTarget(fx, "hold");
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await waitForHydration(row.getByRole("checkbox"));
    await row.getByRole("checkbox").check();
    await page.getByRole("button", { name: /^지급 완료 1/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^지급 완료 1건/ }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^지급 완료/ })).toBeFocused();
    await page.context().close();
  });
});

test.describe("일괄 지급 마감 — 쪽 · 키보드 (06-17 Task 3)", () => {
  async function payableOf(viewer: Person["viewer"], expenseId: string): Promise<number> {
    const preview = await previewPayable(viewer, { expenseId, payDate: seoulToday() });
    if (preview.payableKrw == null) throw new Error("지급 총액 없음");
    return preview.payableKrw;
  }

  // 격자 포커스 칸을 왼쪽으로 옮겨 그 이름의 링크(`[data-cell-action]`)가 든 칸에 닿는다.
  async function arrowToLink(page: Page, name: string) {
    const target = page.locator("td[data-grid-focus]").getByRole("link", { name });
    for (let step = 0; step < 8 && (await target.count()) === 0; step += 1) await page.keyboard.press("ArrowLeft");
    await expect(page.locator("td[data-grid-focus]")).toBeFocused();
    await expect(target).toHaveAttribute("data-cell-action", "");
  }

  test("링크 셀 Enter 열기(H-2) — ≥1280 번호 링크 `{번호} 지출결의 열기` · from=pay, 방향키로 닿아 Enter → 문서 화면 / 1100px 번호 없음 · 「프로젝트 · 항목」 링크 Enter / 800px from=pay / 600px 행 링크", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const id = await approvedTarget(fx, "tracer");
    const [doc] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, id));
    if (!doc?.number) throw new Error("번호 없음");
    const payer = await makeTeamPayer(fx);
    const payable = await payableOf(payer.viewer, id);
    const docUrl = new RegExp(`/expenses/${id}\\?from=pay&status=`);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await waitForHydration(row.getByRole("checkbox"));
    const numberLink = row.getByRole("link", { name: `${doc.number} 지출결의 열기` });
    await expect(numberLink).toHaveAttribute("href", docUrl);
    await row.locator("td").filter({ hasText: fx.vendorName }).click();
    await arrowToLink(page, `${doc.number} 지출결의 열기`);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(docUrl);
    await page.context().close();

    const narrow = await loginPage(browser, baseURL, payer, { width: 1100, height: 900 });
    await narrow.goto("/expenses");
    const narrowRow = rowOf(narrow, fx.lines.tracer.itemName);
    await waitForHydration(narrowRow.getByRole("checkbox"));
    await expect(narrowRow.getByRole("link", { name: `${doc.number} 지출결의 열기` })).toHaveCount(0);
    await expect(narrowRow.getByRole("link", { name: fx.lines.tracer.itemName })).toHaveAttribute("href", docUrl);
    await narrowRow.locator("td").filter({ hasText: formatKrw(payable) }).first().click();
    await arrowToLink(narrow, fx.lines.tracer.itemName);
    await narrow.keyboard.press("Enter");
    await expect(narrow).toHaveURL(docUrl);
    await narrow.context().close();

    const tablet = await loginPage(browser, baseURL, payer, { width: 800, height: 900 });
    await tablet.goto("/expenses");
    await expect(rowOf(tablet, fx.lines.tracer.itemName).getByRole("link", { name: fx.lines.tracer.itemName })).toHaveAttribute("href", docUrl);
    await tablet.context().close();

    const phone = await loginPage(browser, baseURL, payer, { width: 600, height: 900 });
    await phone.goto("/expenses");
    await expect(rowOf(phone, fx.lines.tracer.itemName).locator("a[data-row-link]")).toHaveAttribute("href", `/expenses/${id}`);
    await phone.context().close();
  });

  test("표 안 Ctrl+Enter는 화면 1차(DR-8) — 칸에서 Space로 고르고 Ctrl+Enter → 행 수 그대로 · S2 모달, 한 쪽 안 차이 없음이면 결과 줄 ③ 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await approvedTarget(fx, "tracer");
    await approvedTarget(fx, "hold");
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await waitForHydration(row.getByRole("checkbox"));
    const rowCount = await page.locator("tbody tr").count();
    await row.locator("td").filter({ hasText: fx.vendorName }).click();
    await page.keyboard.press(" ");
    await expect(row.getByRole("checkbox")).toBeChecked();
    await expect(page.getByRole("button", { name: /^지급 완료 1/ })).toBeVisible();
    await page.keyboard.press("Control+Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/^1건 · 이체액 합계 [\d,]+$/)).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(rowCount);
    await expect(dialog.getByText(/다른 쪽|차이 있음/)).toHaveCount(0);
    await page.context().close();
  });

  test("다른 쪽 N건 포함 · 처리 뒤 쪽 다시 받기(M-1) — 51건: Space로 첫 쪽 고름 → 둘째 쪽에서도 선택 유지 · 이체액 고친 행 + 합은 두 쪽 합 → 결과 줄 ③ → 처리 뒤 빈 둘째 쪽 대신 첫 쪽 · 결과 글자 유지", async ({ browser, baseURL }) => {
    test.setTimeout(420_000);
    const fx = await setupExpenseE2E();
    const made = await manyTargets(fx, 51);
    const first = made[0];
    const last = made[50];
    if (!first || !last) throw new Error("문서 51건 없음");
    const payer = await makeTeamPayer(fx);
    const firstPayable = await payableOf(payer.viewer, first.id);
    const lastPayable = await payableOf(payer.viewer, last.id);
    const transfer = lastPayable - 1_000;

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const firstRow = rowOf(page, first.itemName);
    await waitForHydration(firstRow.getByRole("checkbox"));
    await expect(rowOf(page, last.itemName)).toHaveCount(0);
    await firstRow.locator("td").filter({ hasText: fx.vendorName }).click();
    await page.keyboard.press(" ");
    await expect(firstRow.getByRole("checkbox")).toBeChecked();

    await page.getByRole("navigation", { name: "지급 대상 페이지" }).getByRole("link", { name: "2", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    const lastRow = rowOf(page, last.itemName);
    await waitForHydration(lastRow.getByRole("checkbox"));
    await expect(page.getByRole("button", { name: /^지급 완료 1/ })).toBeVisible();
    await lastRow.getByTestId("payment-transfer-cell").click();
    await lastRow.getByLabel("이체액").fill(String(transfer));
    await lastRow.getByLabel("이체액").press("Enter");
    await expect(lastRow.getByRole("checkbox")).toBeChecked();
    const totals = page.getByRole("region", { name: "합계" });
    await expect(totals.getByText(/^고른 2건 · 이체액/)).toBeVisible();
    await expect(totals.getByText(formatKrw(firstPayable + transfer), { exact: true })).toBeVisible();

    // 검토 M-1 — 사유를 비운 채 첫 쪽으로 가서 1차를 누르면 모달 · 요청 없이 그 행 쪽으로 가 그 행 사유 칸 오류 · 포커스(요청 전체 거부가 아님).
    const navigation = page.getByRole("navigation", { name: "지급 대상 페이지" });
    await navigation.getByRole("link", { name: "1", exact: true }).click();
    await expect(page).not.toHaveURL(/page=2/);
    await waitForHydration(firstRow.getByRole("checkbox"));
    await expect(totals.getByText(formatKrw(firstPayable + transfer), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^지급 완료 2/ }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(lastRow.getByText("차이 사유 없음 · 사유 적기", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(lastRow.locator(":focus")).toHaveCount(1);
    await lastRow.locator('td:has([data-testid="payment-diff-reason-cell"])').click();
    await lastRow.getByLabel("차이 사유").fill("이체 수수료");
    await lastRow.getByLabel("차이 사유").press("Enter");

    await page.getByRole("button", { name: /^지급 완료 2/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(`2건 · 이체액 합계 ${formatKrw(firstPayable + transfer)}`)).toBeVisible();
    await expect(dialog.getByText("다른 쪽 1건 포함 · 차이 있음 1건", { exact: true })).toBeVisible();
    // 검토 D-2 — 결과 줄 ①은 모든 쪽 고른 행의 견적 줄 수(두 건은 서로 다른 견적 줄).
    await expect(dialog.getByText("견적 줄 2줄 잠김", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: /^지급 완료 2건/ }).click();
    await expect(dialog).toBeHidden();

    await expect(page).not.toHaveURL(/page=2/);
    await expect(rowOf(page, made[1]?.itemName ?? "")).toHaveCount(1);
    await expect(page.getByText("조건에 맞는 건이 없습니다")).toHaveCount(0);
    await expect(page.locator('main p[aria-live="polite"]')).toHaveText(/^\d{2}:\d{2} 지급 완료 2건$/);
    await expect(rowOf(page, first.itemName)).toHaveCount(0);
    await expect(page.getByText("고른 건 없음")).toBeVisible();
    // 검토 D-5 — 첫 쪽으로 옮겨 다시 마운트돼도 막힘 0이면 포커스는 1차(BODY가 아님).
    await expect(page.getByRole("button", { name: /^지급 완료/ })).toBeFocused();
    expect(await livePaymentCount(first.id)).toBe(1);
    const [record] = await db
      .select({ transferKrw: expensePayments.transferKrw, diffReason: expensePayments.diffReason })
      .from(expensePayments)
      .where(and(eq(expensePayments.expenseId, last.id), isNull(expensePayments.cancelledAt)));
    expect(record).toEqual({ transferKrw: transfer, diffReason: "이체 수수료" });
    await page.context().close();
  });
});

test.describe("제자리 증빙 확인 · 보관 (06-17 Task 4)", () => {
  async function docOf(expenseId: string) {
    const [row] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
    if (!row?.number || row.supplyAmountKrw === null) throw new Error("문서 · 번호 · 공급가 없음");
    return { ...row, number: row.number, supplyAmountKrw: row.supplyAmountKrw };
  }

  // 결재 통과 · 증빙 있음 · 확인 기록 없음(확인 전 P2). 증빙 금액은 픽스처가 문서 행에 직접 둔다(null이면 빈 금액 — R10-F2).
  async function unreviewedTarget(fx: ExpenseE2E, key: LineKey, evidenceAmount: "supply" | number | null = "supply"): Promise<string> {
    const id = await approvedTarget(fx, key, "unreviewed");
    const doc = await docOf(id);
    await db
      .update(expenses)
      .set({ evidenceAmount: evidenceAmount === "supply" ? doc.supplyAmountKrw : evidenceAmount })
      .where(eq(expenses.id, id));
    return id;
  }

  function transferTd(page: Page, itemName: string) {
    return rowOf(page, itemName).locator('td:has([data-testid="payment-transfer-cell"])');
  }

  async function openEvidence(page: Page, itemName: string, number: string) {
    await rowOf(page, itemName).getByRole("button", { name: `${number} 증빙 확인` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "증빙 확인" })).toBeVisible();
    return dialog;
  }

  test("제자리 증빙 확인 — 3차 → 모달(부제 · 첨부 보기 칸 · 결과 줄) → Ctrl+Enter → 확인됨 · 저절로 골라짐 · 포커스 이체액 셀 · 1차 N+1 → S2(첨부 칸 없음) → 막힘 0", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const a = await unreviewedTarget(fx, "tracer");
    await approvedTarget(fx, "hold");
    const doc = await docOf(a);
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const rowA = rowOf(page, fx.lines.tracer.itemName);
    const rowB = rowOf(page, fx.lines.hold.itemName);
    await waitForHydration(rowB.getByRole("checkbox"));
    await rowB.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: /^지급 완료 1/ })).toBeVisible();
    await expect(rowA.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true");

    // 검토 D-4 — Esc로 닫으면 포커스는 그 3차로(3차는 남아 있다).
    const trigger = rowA.getByRole("button", { name: `${doc.number} 증빙 확인` });
    const escaped = await openEvidence(page, fx.lines.tracer.itemName, doc.number);
    // 연 동안 폭이 폰으로 줄었다 돌아오면 3차가 새로 그려진다(06-29 ConfirmDialog가 기억한 트리거는 문서에서 빠짐) — 그래도 그 행 3차로.
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(trigger).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(trigger).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(escaped).toBeHidden();
    await expect(trigger).toBeFocused();

    // 키보드만으로 다시 연다(3차 Enter) — 확인 뒤 이체액 셀 포커스 링(D-10)은 키보드 경로에서 보여야 한다.
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "증빙 확인" })).toBeVisible();
    await expect(dialog.getByText(new RegExp(`^${doc.number} · .+ · 증빙 금액 ${formatKrw(doc.supplyAmountKrw)}$`))).toBeVisible();
    await expect(dialog.locator('[data-ui="confirm-attachments"] li[data-state="done"]')).toHaveCount(1);
    await expect(dialog.getByTestId("evidence-confirm-tax-line")).toBeVisible();
    const confirmButton = dialog.getByRole("button", { name: /^증빙 확인/ });
    await expect(confirmButton).not.toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Control+Enter");
    await expect(dialog).toBeHidden();

    await expect(rowA.getByText("확인됨", { exact: true })).toBeVisible();
    await expect(rowA.getByRole("checkbox")).toBeChecked();
    await expect(transferTd(page, fx.lines.tracer.itemName)).toBeFocused();
    await expect.poll(() => transferTd(page, fx.lines.tracer.itemName).evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    await expect(page.getByRole("button", { name: /^지급 완료 2/ })).toBeVisible();

    await page.getByRole("button", { name: /^지급 완료 2/ }).click();
    const batch = page.getByRole("dialog");
    await expect(batch.getByText(/^2건 · 이체액 합계 [\d,]+$/)).toBeVisible();
    await expect(batch.locator('[data-ui="confirm-attachments"]')).toHaveCount(0);
    await batch.getByRole("button", { name: /^지급 완료 2건/ }).click();
    await expect(batch).toBeHidden();
    await expect(page.locator('main p[aria-live="polite"]')).toHaveText(/^\d{2}:\d{2} 지급 완료 2건$/);
    expect(await livePaymentCount(a)).toBe(1);
    await page.context().close();
  });

  test("모달 연 뒤 증빙 바뀜 → 새 증빙으로 다시 — ⑴ 기안자가 증빙 더함 → 거부 · 새로 고침 → 두 파일로 다시 → 확인 ⑵ 목록 뒤 문서 바뀜 → 1차 막힘 → 새로 고침 → 켜짐 ⑶ 다른 사람이 먼저 확인 → 거부 → 새로 고침 → 닫힘 · 확인됨 · 고르지 않음 · 포커스 링크", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const fx = await setupExpenseE2E();
    const one = await unreviewedTarget(fx, "tracer");
    const two = await unreviewedTarget(fx, "hold");
    const three = await unreviewedTarget(fx, "retry");
    const other = await approvedTarget(fx, "phone");
    const [docOne, docTwo, docThree] = await Promise.all([docOf(one), docOf(two), docOf(three)]);
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const otherRow = rowOf(page, fx.lines.phone.itemName);
    await waitForHydration(otherRow.getByRole("checkbox"));
    const otherPayable = await previewPayable(payer.viewer, { expenseId: other, payDate: seoulToday() });
    if (otherPayable.payableKrw == null) throw new Error("지급 총액 없음");
    await otherRow.getByTestId("payment-transfer-cell").click();
    await otherRow.getByLabel("이체액").fill(String(otherPayable.payableKrw - 500));
    await otherRow.getByLabel("이체액").press("Enter");
    await expect(otherRow.getByRole("checkbox")).toBeChecked();

    // ⑵ — 목록을 받은 뒤 문서가 바뀜(다른 경로의 새로 고침이 끼지 않게 맨 먼저)
    await db
      .update(expenses)
      .set({ version: docTwo.version + 1, updatedAt: new Date() })
      .where(eq(expenses.id, two));
    let dialog = await openEvidence(page, fx.lines.hold.itemName, docTwo.number);
    const confirmTwo = dialog.getByRole("button", { name: /^증빙 확인/ });
    await expect(confirmTwo).toHaveAttribute("aria-disabled", "true");
    await expect(confirmTwo).toHaveAccessibleDescription(/에 바꿈$/);
    await dialog.getByRole("button", { name: "새로 고침" }).click();
    await expect(confirmTwo).not.toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // ⑴
    dialog = await openEvidence(page, fx.lines.tracer.itemName, docOne.number);
    const files = dialog.locator('[data-ui="confirm-attachments"] li[data-state="done"]');
    await expect(files).toHaveCount(1);
    await attachEvidence(fx.pm.viewer, one);
    await page.keyboard.press("Control+Enter");
    await expect(dialog.getByRole("button", { name: /^증빙 확인/ })).toHaveAccessibleDescription(/에 (증빙을 )?바꿈$/);
    await expect(dialog).toBeVisible();
    await expect(rowOf(page, fx.lines.tracer.itemName).getByText("확인 전", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "새로 고침" }).click();
    await expect(files).toHaveCount(2);
    await expect(otherRow.getByRole("checkbox")).toBeChecked();
    await expect(otherRow.getByTestId("payment-transfer-cell")).toHaveText(formatKrw(otherPayable.payableKrw - 500));
    await page.keyboard.press("Control+Enter");
    await expect(dialog).toBeHidden();
    await expect(rowOf(page, fx.lines.tracer.itemName).getByText("확인됨", { exact: true })).toBeVisible();

    // ⑶
    dialog = await openEvidence(page, fx.lines.retry.itemName, docThree.number);
    await expect(dialog.getByRole("button", { name: /^증빙 확인/ })).not.toHaveAttribute("aria-disabled", "true");
    const someoneElse = await makeTeamPayer(fx);
    await confirmEvidence(someoneElse.viewer, { expenseId: three, version: docThree.version });
    await page.keyboard.press("Control+Enter");
    await expect(dialog.getByRole("button", { name: /^증빙 확인/ })).toHaveAccessibleDescription(/에 바꿈$/);
    await dialog.getByRole("button", { name: "새로 고침" }).click();
    await expect(dialog).toBeHidden();
    const rowThree = rowOf(page, fx.lines.retry.itemName);
    await expect(rowThree.getByText("확인됨", { exact: true })).toBeVisible();
    await expect(rowThree.getByRole("checkbox")).not.toBeChecked();
    await expect(rowThree.locator("a[data-row-link]")).toBeFocused();
    await page.context().close();
  });

  test("제자리 증빙 확인 — 증빙 금액 초과 표시(Q-F): 승인액 12,000,000 · 실행가 12,250,000 · 증빙 금액 12,400,000 → 결과 줄 다음 한 줄 · 1차 막지 않음 → 확인됨 / 초과 없는 행 모달에는 그 글자 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const over = await unreviewedTarget(fx, "tracer", 12_400_000);
    await db.update(expenses).set({ supplyAmountKrw: 12_000_000 }).where(eq(expenses.id, over));
    await db.update(quoteLines).set({ executionAmountKrw: 12_250_000 }).where(eq(quoteLines.id, fx.lines.tracer.id));
    const plain = await unreviewedTarget(fx, "hold");
    const [docOver, docPlain] = await Promise.all([docOf(over), docOf(plain)]);
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await waitForHydration(rowOf(page, fx.lines.hold.itemName).getByRole("button", { name: `${docPlain.number} 증빙 확인` }));

    let dialog = await openEvidence(page, fx.lines.hold.itemName, docPlain.number);
    await expect(dialog.getByTestId("evidence-confirm-tax-line")).toBeVisible();
    await expect(dialog.getByText(/승인액보다|실행가 초과/)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    dialog = await openEvidence(page, fx.lines.tracer.itemName, docOver.number);
    await expect(dialog.getByTestId("evidence-confirm-overrun")).toHaveText("승인액보다 +400,000 · 실행가 초과 150,000");
    expect(await colorOf(dialog.getByTestId("evidence-confirm-overrun"))).toBe(await tokenAsColor(page, "--status-warning"));
    await expect(dialog.getByRole("button", { name: /^증빙 확인/ })).not.toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Control+Enter");
    await expect(dialog).toBeHidden();
    await expect(rowOf(page, fx.lines.tracer.itemName).getByText("확인됨", { exact: true })).toBeVisible();
    await page.context().close();
  });

  test("짝 막힘 행 제자리 확인(R10-R1 · N3) — 확인 성공 → 확인됨 · 체크박스 aria-disabled · 짝 이유 · 이체액 편집 칸 없음 · 고른 수 그대로 · 포커스 그 행 링크", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const id = await unreviewedTarget(fx, "tracer");
    const doc = await docOf(id);
    const method = `e2e_pair_${randomUUID().slice(0, 6)}`;
    await seedCodeItem(SYSTEM_VIEWER, { tableKey: "payment_method", value: method, label: method, sortOrder: 99 });
    await db.update(expenses).set({ paymentMethod: method }).where(eq(expenses.id, id));
    const before = await getSettingValue(PAYMENT_METHOD_EVIDENCE_PAIRS);
    // 이 테스트만의 지급 방식 하나에 이 문서 증빙 종류가 아닌 짝을 둔다 — 다른 지급 방식 문서는 영향 없음(짝 없는 방식은 검사 없음).
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [...before, { method, evidence: `none_${method}` }], null);
    try {
      const payer = await makeTeamPayer(fx);
      const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
      await page.goto("/expenses");
      const row = rowOf(page, fx.lines.tracer.itemName);
      await waitForHydration(row.getByRole("button", { name: `${doc.number} 증빙 확인` }));
      const dialog = await openEvidence(page, fx.lines.tracer.itemName, doc.number);
      await expect(dialog.getByRole("button", { name: /^증빙 확인/ })).not.toHaveAttribute("aria-disabled", "true");
      await page.keyboard.press("Control+Enter");
      await expect(dialog).toBeHidden();
      await expect(row.getByText("확인됨", { exact: true })).toBeVisible();
      const box = row.getByRole("checkbox");
      await expect(box).toHaveAttribute("aria-disabled", "true");
      await expect(box).not.toBeChecked();
      await expect(row.getByText(/짝 아님 · 짝 설정은 관리자$/)).toBeVisible();
      await expect(transferTd(page, fx.lines.tracer.itemName)).not.toHaveAttribute("aria-readonly", "false");
      await expect(page.getByText("고른 건 없음")).toBeVisible();
      await expect(row.locator("a[data-row-link]")).toBeFocused();
      await page.context().close();
    } finally {
      await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, before, null);
    }
  });

  test("금액 빈 확인 전 → 문서 화면(R10-F2) — 3차가 `from=pay` 링크 · 모달 없음 / 800px도 3차는 문서 화면 링크", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const empty = await unreviewedTarget(fx, "tracer", null);
    const filled = await unreviewedTarget(fx, "hold");
    const [docEmpty, docFilled] = await Promise.all([docOf(empty), docOf(filled)]);
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await waitForHydration(rowOf(page, fx.lines.hold.itemName).getByRole("button", { name: `${docFilled.number} 증빙 확인` }));
    const link = rowOf(page, fx.lines.tracer.itemName).getByRole("link", { name: `${docEmpty.number} 증빙 확인` });
    await expect(link).toHaveAttribute("href", new RegExp(`^/expenses/${empty}\\?from=pay&`));
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${empty}\\?from=pay`));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.context().close();

    const tablet = await loginPage(browser, baseURL, payer, { width: 800, height: 900 });
    await tablet.goto("/expenses");
    await expect(rowOf(tablet, fx.lines.hold.itemName).getByRole("link", { name: `${docFilled.number} 증빙 확인` })).toHaveAttribute(
      "href",
      new RegExp(`^/expenses/${filled}\\?from=pay&`),
    );
    await expect(tablet.getByRole("button", { name: /증빙 확인$/ })).toHaveCount(0);
    await tablet.context().close();
  });

  test("증빙 불러오지 못함 — 보기 응답이 끊기면 `증빙 불러오지 못함` · 1차 aria-disabled · `다시 시도`로 받으면 켜짐", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const id = await unreviewedTarget(fx, "tracer");
    const doc = await docOf(id);
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await waitForHydration(rowOf(page, fx.lines.tracer.itemName).getByRole("button", { name: `${doc.number} 증빙 확인` }));
    const cut = (route: import("@playwright/test").Route) => (route.request().headers()["next-action"] ? route.abort() : route.fallback());
    await page.route("**/expenses**", cut);
    const dialog = await openEvidence(page, fx.lines.tracer.itemName, doc.number);
    const confirmButton = dialog.getByRole("button", { name: /^증빙 확인/ });
    await expect(confirmButton).toHaveAccessibleDescription("증빙 불러오지 못함");
    await expect(confirmButton).toHaveAttribute("aria-disabled", "true");
    await page.unroute("**/expenses**", cut);
    await dialog.getByRole("button", { name: "다시 시도" }).click();
    await expect(confirmButton).not.toHaveAttribute("aria-disabled", "true");
    await expect(dialog.locator('[data-ui="confirm-attachments"] li[data-state="done"]')).toHaveCount(1);
    await page.context().close();
  });

  test("확인 직후 Ctrl+Enter 반복 무시(M-3) — 누른 채 반복된 Enter는 S2를 열지 않고, 떼고 새로 누른 Ctrl+Enter는 S2를 연다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const id = await unreviewedTarget(fx, "tracer");
    const doc = await docOf(id);
    const payer = await makeTeamPayer(fx);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await waitForHydration(rowOf(page, fx.lines.tracer.itemName).getByRole("button", { name: `${doc.number} 증빙 확인` }));
    const dialog = await openEvidence(page, fx.lines.tracer.itemName, doc.number);
    await expect(dialog.getByRole("button", { name: /^증빙 확인/ })).not.toHaveAttribute("aria-disabled", "true");

    await page.keyboard.down("Control");
    await page.keyboard.down("Enter");
    // 모달이 닫히고 포커스가 이체액 셀로 간 것을 기다린 뒤(키는 떼지 않음) 반복 Enter를 보낸다.
    await expect(dialog).toBeHidden();
    await expect(transferTd(page, fx.lines.tracer.itemName)).toBeFocused();
    await page.keyboard.down("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^지급 완료 1/ })).toBeVisible();
    await page.keyboard.up("Enter");
    await page.keyboard.up("Control");
    await page.keyboard.press("Control+Enter");
    await expect(page.getByRole("dialog").getByRole("button", { name: /^지급 완료 1건/ })).toBeVisible();
    await page.context().close();
  });

  test("보관 되살리기(C-1 · r2 F-2) — 이체액 편집 + 선택 → 번호 링크로 문서 화면 → 돌아오면 묻지 않고 되살아남 · 합 다시 / 필터를 바꾸면 되살릴 것 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const a = await approvedTarget(fx, "tracer");
    const b = await approvedTarget(fx, "hold");
    const payer = await makeTeamPayer(fx);
    const payA = await previewPayable(payer.viewer, { expenseId: a, payDate: seoulToday() });
    const payB = await previewPayable(payer.viewer, { expenseId: b, payDate: seoulToday() });
    if (payA.payableKrw == null || payB.payableKrw == null) throw new Error("지급 총액 없음");
    const docA = await docOf(a);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const rowA = rowOf(page, fx.lines.tracer.itemName);
    const rowB = rowOf(page, fx.lines.hold.itemName);
    await waitForHydration(rowB.getByRole("checkbox"));
    await rowA.getByTestId("payment-transfer-cell").click();
    await rowA.getByLabel("이체액").fill(String(payA.payableKrw - 1_000));
    await rowA.getByLabel("이체액").press("Enter");
    await rowB.getByRole("checkbox").check();
    const totals = page.getByRole("region", { name: "합계" });
    const sum = formatKrw(payA.payableKrw - 1_000 + payB.payableKrw);
    await expect(totals.getByText(sum, { exact: true })).toBeVisible();

    await rowA.getByRole("link", { name: `${docA.number} 지출결의 열기` }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${a}\\?from=pay`));
    await page.goBack();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(rowB.getByRole("checkbox")).toBeChecked();
    await expect(rowA.getByRole("checkbox")).toBeChecked();
    await expect(rowA.getByTestId("payment-transfer-cell")).toHaveText(formatKrw(payA.payableKrw - 1_000));
    await expect(totals.getByText(/^고른 2건 · 이체액/)).toBeVisible();
    await expect(totals.getByText(sum, { exact: true })).toBeVisible();
    // 검토 D-6 — 한 줄로 자른 거래처는 전체 값을 title로.
    await expect(rowB.getByText(fx.vendorName, { exact: true })).toHaveAttribute("title", fx.vendorName);
    // 검토 D-9 — 보기 전용 폭(700~1023)에는 선택 열 · 1차가 없으므로 고른 건 합계 줄도 없다(되살린 선택이 있어도).
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(page.getByRole("button", { name: /^지급 완료/ })).toHaveCount(0);
    await expect(totals.getByText(/^고른 \d+건/)).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(totals.getByText(/^고른 2건 · 이체액/)).toBeVisible();

    await page.getByLabel("증빙", { exact: true }).selectOption({ label: "지급 가능" });
    await expect(page).toHaveURL(/evidence=payable/);
    await waitForHydration(rowB.getByRole("checkbox"));
    await expect(rowB.getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByText("고른 건 없음")).toBeVisible();
    await page.context().close();
  });

  test("보관 되살리기 — 51건: 첫 쪽 A 편집(사유) + 둘째 쪽 C 선택 → 둘째 쪽에서 문서 화면 → 돌아옴 → A · C 살아 있고 `지급 완료 2` · 결과 줄 ③ `다른 쪽 1건 포함` → 처리 막힘 0", async ({ browser, baseURL }) => {
    test.setTimeout(420_000);
    const fx = await setupExpenseE2E();
    const made = await manyTargets(fx, 51);
    const first = made[0];
    const last = made[50];
    if (!first || !last) throw new Error("문서 51건 없음");
    const payer = await makeTeamPayer(fx);
    const payFirst = await previewPayable(payer.viewer, { expenseId: first.id, payDate: seoulToday() });
    if (payFirst.payableKrw == null) throw new Error("지급 총액 없음");
    const docLast = await docOf(last.id);
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const firstRow = rowOf(page, first.itemName);
    await waitForHydration(firstRow.getByRole("checkbox"));
    await firstRow.getByTestId("payment-transfer-cell").click();
    await firstRow.getByLabel("이체액").fill(String(payFirst.payableKrw - 2_000));
    await firstRow.getByLabel("이체액").press("Enter");
    await firstRow.locator('td:has([data-testid="payment-diff-reason-cell"])').click();
    await firstRow.getByLabel("차이 사유").fill("이체 수수료");
    await firstRow.getByLabel("차이 사유").press("Enter");
    await expect(firstRow.getByRole("checkbox")).toBeChecked();

    await page.getByRole("navigation", { name: "지급 대상 페이지" }).getByRole("link", { name: "2", exact: true }).click();
    const lastRow = rowOf(page, last.itemName);
    await waitForHydration(lastRow.getByRole("checkbox"));
    await lastRow.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: /^지급 완료 2/ })).toBeVisible();
    await lastRow.getByRole("link", { name: `${docLast.number} 지출결의 열기` }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${last.id}\\?from=pay.*page=2`));
    await page.goBack();
    await expect(page).toHaveURL(/page=2/);
    await expect(lastRow.getByRole("checkbox")).toBeChecked();
    await expect(page.getByRole("button", { name: /^지급 완료 2/ })).toBeVisible();

    await page.getByRole("button", { name: /^지급 완료 2/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("다른 쪽 1건 포함 · 차이 있음 1건", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: /^지급 완료 2건/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('main p[aria-live="polite"]')).toHaveText(/^\d{2}:\d{2} 지급 완료 2건$/);
    const [record] = await db
      .select({ transferKrw: expensePayments.transferKrw, diffReason: expensePayments.diffReason })
      .from(expensePayments)
      .where(and(eq(expensePayments.expenseId, first.id), isNull(expensePayments.cancelledAt)));
    expect(record).toEqual({ transferKrw: payFirst.payableKrw - 2_000, diffReason: "이체 수수료" });
    await page.context().close();
  });
});

// ── 06-20 「지급 완료」 보기(S3) · 계좌 칸 · 문서 화면 왕복 · Phase 5 상태 열 ─────────────────────────

// 이 스펙 거래처에 계좌를 단다(테스트 준비 — 03 관리자 화면 대신 같은 칸을 직접 쓴다). 뒤 4자리 · 예금주는 이 실행에만 있는 값.
async function seedVendorAccount(fx: ExpenseE2E): Promise<{ bank: string; last4: string; holder: string; plain: string }> {
  const suffix = randomUUID().slice(0, 6);
  // 9로 시작 — 연도(2026) · 쉼표 금액과 겹치지 않는 뒤 4자리.
  const last4 = String(9000 + Math.floor(Math.random() * 1000));
  const account = { bank: "신한", last4, holder: `E2E예금주-${suffix}`, plain: `110-${suffix.replace(/\D/g, "7").slice(0, 3)}-29${last4}` };
  await db
    .update(vendors)
    .set({ accountBank: account.bank, accountHolder: account.holder, accountNumberLast4: last4, accountNumberEncrypted: encrypt(account.plain) })
    .where(eq(vendors.id, fx.vendorId));
  return account;
}

// 결재 통과 · 확인됨(P4) 문서를 지급 권한자가 오늘 지급한다(06-15 일괄 경로 — 단건과 같은 지급 기록).
async function paidTarget(fx: ExpenseE2E, key: LineKey, payer: Person): Promise<string> {
  const expenseId = await approvedTarget(fx, key, "payable");
  const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
  if (!doc || typeof preview.payableKrw !== "number") throw new Error("지급할 수 없는 문서");
  const result = await completePaymentsBatch(payer.viewer, {
    payDate: seoulToday(),
    rows: [{ expenseId, expenseVersion: doc.version, expectedPayableKrw: preview.payableKrw }],
  });
  if (result.processed !== 1) throw new Error(`지급 안 됨: ${JSON.stringify(result.blocked)}`);
  return expenseId;
}

function paidViewUrl(teamId: string): string {
  return `/expenses?${new URLSearchParams({ status: "지급 완료", team: teamId })}`;
}

test.describe("지급 완료 보기 (06-20 Task 1)", () => {
  test("대표 지급 완료 보기 — 계좌 문자열 없음: 지급된 건 한 줄 · 합계 줄 `합계 (지급 완료 · {YYYY-MM} · 1건)` · HTML에 계좌 뒤 4자리 · 예금주 없음 / PM 보기 select에 `지급 완료` 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const account = await seedVendorAccount(fx);
    const payer = await makeTeamPayer(fx);
    await paidTarget(fx, "tracer", payer);

    const page = await loginPage(browser, baseURL, fx.ceo);
    await page.goto(paidViewUrl(await teamOf(fx)));
    await expect(page.getByLabel("상태")).toHaveValue("지급 완료");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("계좌이체");
    await expect(page.getByRole("region", { name: "합계" })).toContainText(`합계 (지급 완료 · ${seoulToday().slice(0, 7)} · 1건)`);
    await expect(page.getByRole("button", { name: /^지급 완료/ })).toHaveCount(0);
    const html = await page.content();
    expect(html).not.toContain(`**-${account.last4}`);
    expect(html).not.toContain(account.holder);
    expect(html).not.toContain(account.plain);
    expect(await page.locator("main").innerText()).not.toContain(account.last4);
    await page.context().close();

    const pmPage = await loginPage(browser, baseURL, fx.pm);
    await pmPage.goto(paidViewUrl(await teamOf(fx)));
    const select = pmPage.getByLabel("상태");
    await expect(select).toHaveValue("진행 중");
    await expect(select.locator("option", { hasText: "지급 완료" })).toHaveCount(0);
    await pmPage.context().close();
  });
});

// ── 06-20 Task 2 — 계좌 칸 · 번호 보기(O-17 · E-50) ─────────────────────

async function setReveal(person: Person, visible: boolean): Promise<void> {
  if (!person.viewer.roleId) throw new Error("계급 없음");
  await upsertVisibility(SYSTEM_VIEWER, { roleId: person.viewer.roleId, infoItem: "vendor.account_number_unmasked", visible });
}

async function revealLogCount(vendorId: string, actorId: string): Promise<number> {
  const rows = await db
    .select({ seq: actionLog.seq })
    .from(actionLog)
    .where(and(eq(actionLog.actionType, "mask_reveal"), eq(actionLog.entityId, vendorId), eq(actionLog.actorId, actorId)));
  return rows.length;
}

test.describe("계좌 칸 · 번호 보기 (06-20 Task 2)", () => {
  test("번호 보기 — 해제 항목 없음: 해제 항목이 꺼진 지급 권한자 S1 지급 방식 칸에 `{은행} ****-**-{뒤4}` · 예금주, `번호 보기` 0 · HTML에 평문 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const account = await seedVendorAccount(fx);
    await approvedTarget(fx, "tracer");
    const payer = await makeTeamPayer(fx);
    await setReveal(payer, false);

    const page = await loginPage(browser, baseURL, payer);
    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await expect(row).toContainText(account.bank);
    await expect(row).toContainText(`****-**-${account.last4}`);
    await expect(row).toContainText(account.holder);
    await expect(page.getByRole("button", { name: "번호 보기" })).toHaveCount(0);
    expect(await page.content()).not.toContain(account.plain);
    await page.context().close();
  });

  test("번호 보기 — 권한자만: 해제 항목을 켠 지급 권한자는 `번호 보기` → 평문 · `가리기` · mask_reveal 1줄 / 대표 문서 화면 S5에 계좌 행 없음 · 뒤 4자리 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const account = await seedVendorAccount(fx);
    const expenseId = await approvedTarget(fx, "tracer");
    const payer = await makeTeamPayer(fx);
    await setReveal(payer, true);

    const page = await loginPage(browser, baseURL, payer);
    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await expect(row).toContainText(`${account.bank}`);
    await expect(row).toContainText(`****-**-${account.last4}`);
    const reveal = row.getByRole("button", { name: "번호 보기" });
    await waitForHydration(reveal);
    await reveal.click();
    await expect(row).toContainText(account.plain);
    await expect(row.getByRole("button", { name: "가리기" })).toBeVisible();
    expect(await revealLogCount(fx.vendorId, payer.viewer.id)).toBe(1);
    await page.context().close();

    const ceoPage = await loginPage(browser, baseURL, fx.ceo);
    await ceoPage.goto(`/expenses/${expenseId}`);
    await expect(ceoPage.getByText("지급 방식", { exact: true }).first()).toBeVisible();
    await expect(ceoPage.locator("[data-payment-account]")).toHaveCount(0);
    expect(await ceoPage.locator("main").innerText()).not.toContain(account.last4);
    expect(await ceoPage.content()).not.toContain(`**-${account.last4}`);
    await ceoPage.context().close();
  });
});

// ── 06-20 Task 3 — 문서 화면 왕복(C-1 문서 화면 쪽) · M-3 ──────────────────

async function numberOf(expenseId: string): Promise<{ number: string; supplyAmountKrw: number }> {
  const [row] = await db.select({ number: expenses.number, supplyAmountKrw: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row?.number || row.supplyAmountKrw === null) throw new Error("번호 · 공급가 없음");
  return { number: row.number, supplyAmountKrw: row.supplyAmountKrw };
}

// 결재 통과 · 증빙 있음 · 확인 기록 없음(P2) — 증빙 금액 = 공급가(픽스처가 문서 행에 직접).
async function unreviewedDoc(fx: ExpenseE2E, key: LineKey): Promise<string> {
  const id = await approvedTarget(fx, key, "unreviewed");
  const { supplyAmountKrw } = await numberOf(id);
  await db.update(expenses).set({ evidenceAmount: supplyAmountKrw }).where(eq(expenses.id, id));
  return id;
}

test.describe("문서 화면 왕복 (06-20 Task 3)", () => {
  test("문서 화면 왕복 — 지급 대상으로: A 이체액 편집 + B 선택 → C(확인 전) 번호 링크 → 3차 `지급 대상으로` → 금액 고쳐 확인 → `다음 확인 전 {D}` → `지급 대상으로` → A · B 그대로 + C 고를 수 있음 / `다음 확인 전` → D 문서 화면 · from=pay 유지", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const a = await approvedTarget(fx, "tracer");
    await approvedTarget(fx, "hold");
    const c = await unreviewedDoc(fx, "retry");
    const d = await unreviewedDoc(fx, "phone");
    const payer = await makeTeamPayer(fx);
    const payA = await previewPayable(payer.viewer, { expenseId: a, payDate: seoulToday() });
    if (payA.payableKrw == null) throw new Error("지급 총액 없음");
    const docC = await numberOf(c);
    const docD = await numberOf(d);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const rowA = rowOf(page, fx.lines.tracer.itemName);
    const rowB = rowOf(page, fx.lines.hold.itemName);
    const rowC = rowOf(page, fx.lines.retry.itemName);
    await waitForHydration(rowB.getByRole("checkbox"));
    await rowA.getByTestId("payment-transfer-cell").click();
    await rowA.getByLabel("이체액").fill(String(payA.payableKrw - 1_000));
    await rowA.getByLabel("이체액").press("Enter");
    await rowB.getByRole("checkbox").check();
    await expect(rowC.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true");

    await rowC.getByRole("link", { name: `${docC.number} 지출결의 열기` }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${c}\\?from=pay`));
    const back = page.getByRole("link", { name: "지급 대상으로" });
    await expect(back).toBeVisible();
    await expect(page.getByRole("link", { name: /^다음 확인 전/ })).toHaveCount(0);

    const review = page.getByTestId("evidence-review");
    const confirm = page.getByRole("button", { name: /^증빙 확인/ });
    await waitForHydration(confirm);
    await review.getByRole("button", { name: "바꾸기" }).click();
    await page.locator("#evidence-amount").fill(String(docC.supplyAmountKrw - 100_000));
    await confirm.click();
    await expect(review.getByText("확인됨", { exact: true })).toBeVisible();
    const next = page.getByRole("link", { name: `다음 확인 전 ${docD.number}` });
    await expect(next).toBeVisible();
    const docUrl = page.url();

    await back.click();
    await expect(page).toHaveURL(/\/expenses\?status=/);
    await expect(page.getByLabel("상태")).toHaveValue("지급 대상");
    await expect(rowB.getByRole("checkbox")).toBeChecked();
    await expect(rowA.getByTestId("payment-transfer-cell")).toHaveText(formatKrw(payA.payableKrw - 1_000));
    await expect(rowC.getByRole("checkbox")).not.toHaveAttribute("aria-disabled", "true");

    await page.goto(docUrl);
    await page.getByRole("link", { name: `다음 확인 전 ${docD.number}` }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${d}\\?from=pay&status=`));
    await expect(page.getByRole("link", { name: "지급 대상으로" })).toBeVisible();
    await page.context().close();
  });

  test("작성 중 문서 + from=pay — 05 C1 입력: 쓰기 권한이 빠진 기안자의 작성 중 문서를 `?from=pay&page=1`로 열면 문서 화면 그대로 · 3차 둘 · 계좌 행 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const suffix = randomUUID().slice(0, 8);
    const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E쓰기회수지급-${suffix}`, workScope: "company" });
    for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action, allowed: true });
    for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    const drafter = await makePerson("회수", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
    const content = `권한회수 지급왕복-${suffix}`;
    const { expenseId } = await createTeamExpenseDraft(drafter.viewer, {
      idempotencyKey: randomUUID(),
      fields: { teamExpenseKind: "team_overhead", usageDate: seoulToday(), content },
    });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: false });
    try {
      const page = await loginPage(browser, baseURL, drafter);
      await page.goto(`/expenses/${expenseId}?from=pay&page=1`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(content);
      await expect(page.getByText("지출결의 불러오기 실패")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^임시 저장/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "지급 대상으로" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /^다음 확인 전/ })).toHaveCount(0);
      await expect(page.locator("[data-payment-account]")).toHaveCount(0);
      await page.context().close();
    } finally {
      await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: true });
    }
  });

  test("되돌림 쿼리 조작 — 허용 밖 키 · 바깥 URL 값을 붙여도 `지급 대상으로` href는 `/expenses?status=`로 시작하고 허용 키만 / from=pay 없이 연 문서 화면에는 3차 둘 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const id = await approvedTarget(fx, "tracer");
    const payer = await makeTeamPayer(fx);

    const page = await loginPage(browser, baseURL, payer);
    const tampered = new URLSearchParams({ from: "pay", status: "https://evil.example", team: "//evil.example", evidence: "javascript:alert(1)", page: "2", next: "https://evil.example" });
    await page.goto(`/expenses/${id}?${tampered}`);
    const back = page.getByRole("link", { name: "지급 대상으로" });
    await expect(back).toBeVisible();
    const href = (await back.getAttribute("href")) ?? "";
    expect(href.startsWith("/expenses?status=")).toBe(true);
    expect(href).not.toMatch(/evil|javascript/);
    expect([...new URLSearchParams(href.slice(href.indexOf("?") + 1)).keys()].sort()).toEqual(["page", "status"]);

    await page.goto(`/expenses/${id}`);
    await expect(page.getByRole("button", { name: /^지급 완료/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "지급 대상으로" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^다음 확인 전/ })).toHaveCount(0);
    await page.context().close();
  });

  test("문서 화면 확인 직후 Ctrl+Enter 반복 무시 — 첫 Ctrl+Enter로 증빙 확인 → 1차 `지급 완료` · 포커스 이체액 칸을 기다린 뒤 누른 채 반복 Enter → 지급 0건 · 그대로 / 떼고 새 Ctrl+Enter → 지급", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const id = await unreviewedDoc(fx, "tracer");
    const payer = await makeTeamPayer(fx);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto(`/expenses/${id}?from=pay`);
    const confirm = page.getByRole("button", { name: /^증빙 확인/ });
    await waitForHydration(confirm);
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    const primary = page.getByRole("button", { name: /^지급 완료/ });
    const transfer = page.locator("#payment-transfer");

    await page.keyboard.down("Control");
    await page.keyboard.down("Enter");
    // 1차가 `지급 완료`로 바뀌고 포커스가 이체액 칸으로 간 뒤(키는 떼지 않음) 반복 Enter를 보낸다(r2 F-4).
    await expect(primary).toBeVisible();
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await expect(transfer).toBeFocused();
    await page.keyboard.down("Enter");
    // 없는 일을 증명하는 자리 — 지급 요청이 갔다면 응답 · 다시 읽기가 끝날 시간을 둔다.
    await page.waitForTimeout(1_500);
    expect(await livePaymentCount(id)).toBe(0);
    await expect(primary).toBeVisible();
    await expect(page.getByTestId("payment-result")).toHaveCount(0);
    await expect(transfer).toBeFocused();

    await page.keyboard.up("Enter");
    await page.keyboard.up("Control");
    await page.keyboard.press("Control+Enter");
    await expect(page.getByTestId("payment-result")).toBeVisible();
    expect(await livePaymentCount(id)).toBe(1);
    await page.context().close();
  });
});

// ── 06-20 Task 4 — S3 마감 · Phase 5 상태 열 ─────────────────────────────

function paidMonthUrl(teamId: string, month: string): string {
  return `/expenses?${new URLSearchParams({ status: "지급 완료", team: teamId, month })}`;
}

// 지급 기록의 지급일만 옮긴다(테스트 준비 — 기한 · 달 경계).
async function movePaidDate(expenseId: string, payDate: string): Promise<void> {
  await db.update(expensePayments).set({ payDate }).where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
}

test.describe("지급 완료 보기 마감 (06-20 Task 4)", () => {
  test("S3 빈 · 오류 — 0건이면 `지급 완료한 건이 없습니다` + 지급 권한자에게만 `지급 대상 보기`(합계 줄 없음) / 로드 실패면 `지급 완료 목록 불러오지 못함` + `다시 시도`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const teamId = await teamOf(fx);
    const payer = await makeTeamPayer(fx);

    const page = await loginPage(browser, baseURL, payer);
    await page.goto(paidMonthUrl(teamId, "2000-01"));
    await expect(page.getByText("지급 완료한 건이 없습니다", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "지급 대상 보기" })).toHaveAttribute("href", `/expenses?${new URLSearchParams({ status: "지급 대상" })}`);
    await expect(page.getByRole("region", { name: "합계" })).toHaveCount(0);

    // 없는 해(0000년)는 서버 목록 쿼리를 실패시킨다 — 다른 스펙이 쓰는 표 · 설정은 건드리지 않는다(구매 요청 목록 로드 오류와 같은 방법).
    await page.goto(paidMonthUrl(teamId, "0000-01"));
    await expect(page.getByText("지급 완료 목록 불러오지 못함", { exact: true })).toBeVisible();
    await expect(page.getByLabel("상태")).toHaveValue("지급 완료");
    await page.route("**/expenses?*month=0000-01*", (route) => route.continue({ url: route.request().url().replace("month=0000-01", "month=2000-01") }));
    const retry = page.getByRole("button", { name: "다시 시도" });
    await waitForHydration(retry);
    await retry.click();
    await expect(page.getByText("지급 완료한 건이 없습니다", { exact: true })).toBeVisible();
    await page.context().close();

    const ceoPage = await loginPage(browser, baseURL, fx.ceo);
    await ceoPage.goto(paidMonthUrl(teamId, "2000-01"));
    await expect(ceoPage.getByText("지급 완료한 건이 없습니다", { exact: true })).toBeVisible();
    await expect(ceoPage.getByRole("link", { name: "지급 대상 보기" })).toHaveCount(0);
    await ceoPage.context().close();
  });

  test("S3 부분 · 차이 — 차이 0 → 이체액 2행 없음 · 사유 `—` / 차이 있음 → 2행 `차이 -1,000` 경고 색 · 사유 글자", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const even = await approvedTarget(fx, "tracer");
    const short = await approvedTarget(fx, "hold");
    const rows = await Promise.all(
      [even, short].map(async (expenseId) => {
        const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
        const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
        if (!doc || typeof preview.payableKrw !== "number") throw new Error("지급할 수 없는 문서");
        return { expenseId, expenseVersion: doc.version, expectedPayableKrw: preview.payableKrw };
      }),
    );
    const [evenRow, shortRow] = rows;
    if (!evenRow || !shortRow) throw new Error("두 행 필요");
    const result = await completePaymentsBatch(payer.viewer, {
      payDate: seoulToday(),
      rows: [evenRow, { ...shortRow, transferKrw: shortRow.expectedPayableKrw - 1_000, diffReason: "은행 수수료 차감" }],
    });
    if (result.processed !== 2) throw new Error(`지급 안 됨: ${JSON.stringify(result.blocked)}`);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto(paidViewUrl(await teamOf(fx)));
    const evenTr = rowOf(page, fx.lines.tracer.itemName);
    const shortTr = rowOf(page, fx.lines.hold.itemName);
    await expect(evenTr).toContainText(formatKrw(evenRow.expectedPayableKrw));
    await expect(evenTr.getByText(/^차이/)).toHaveCount(0);
    await expect(evenTr.locator("td").filter({ hasText: /^—$/ }).first()).toBeVisible();
    const diff = shortTr.getByText("차이 -1,000", { exact: true });
    await expect(diff).toBeVisible();
    expect(await colorOf(diff)).toBe(await tokenAsColor(page, "--status-warning"));
    await expect(shortTr.getByText("은행 수수료 차감", { exact: true })).toHaveAttribute("title", "은행 수수료 차감");
    await page.context().close();
  });

  test("S3 제자리 증빙 확인 — 지급 뒤 증빙이 들어온 선결제 `확인 전` 행 3차 → 모달(1차 켜짐) → 확인 → 증빙 칸 `확인됨` · 포커스 번호 링크 · 지급 기록 1 그대로 / 800px 문서 화면 링크 / 대표에게는 3차 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const id = await paidTarget(fx, "tracer", payer);
    // 지급 뒤 들어온 증빙 — 확인 기록을 지워 `확인 전`(P5)으로 둔다(증빙 금액은 남는다).
    await db.delete(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, id));
    await db.update(expenses).set({ prepaid: true, prepaidReason: "해외 결제 선결제" }).where(eq(expenses.id, id));
    const { number } = await numberOf(id);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto(paidViewUrl(await teamOf(fx)));
    const row = rowOf(page, fx.lines.tracer.itemName);
    await expect(row.getByText("확인 전", { exact: true })).toBeVisible();
    const action = row.getByRole("button", { name: `${number} 증빙 확인` });
    await waitForHydration(action);
    await action.click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: /^증빙 확인/ });
    await expect(confirm).toBeVisible();
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(row.getByText("확인됨", { exact: true })).toBeVisible();
    await expect(row.getByRole("link", { name: `${number} 지출결의 열기` })).toBeFocused();
    expect(await livePaymentCount(id)).toBe(1);

    await db.delete(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, id));
    await page.setViewportSize({ width: 800, height: 900 });
    await page.reload();
    await expect(row.getByRole("link", { name: `${number} 증빙 확인` })).toHaveAttribute("href", `/expenses/${id}`);
    await page.context().close();

    const ceoPage = await loginPage(browser, baseURL, fx.ceo, { width: 1280, height: 900 });
    await ceoPage.goto(paidViewUrl(await teamOf(fx)));
    await expect(rowOf(ceoPage, fx.lines.tracer.itemName).getByText("확인 전", { exact: true })).toBeVisible();
    await expect(ceoPage.getByRole("button", { name: /증빙 확인$/ })).toHaveCount(0);
    await expect(ceoPage.getByRole("link", { name: /증빙 확인$/ })).toHaveCount(0);
    await ceoPage.context().close();
  });

  test("S3 쪽 · 폭 — 51건이면 둘째 쪽 1건 · 합계 줄은 51건 / 1100px · 600px에서 P3 머리글(지급 방식 · 차이 사유 · 처리한 사람)이 먼저 사라진다", async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const made = await manyTargets(fx, 51);
    const rows = await Promise.all(
      made.map(async ({ id }) => {
        const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, id));
        const preview = await previewPayable(payer.viewer, { expenseId: id, payDate: seoulToday() });
        if (!doc || typeof preview.payableKrw !== "number") throw new Error("지급할 수 없는 문서");
        return { expenseId: id, expenseVersion: doc.version, expectedPayableKrw: preview.payableKrw };
      }),
    );
    const result = await completePaymentsBatch(payer.viewer, { payDate: seoulToday(), rows });
    if (result.processed !== 51) throw new Error(`지급 안 됨: ${JSON.stringify(result.blocked)}`);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    const base = paidViewUrl(await teamOf(fx));
    await page.goto(`${base}&page=2`);
    await expect(page.locator("main table tbody tr a[data-paid-number]")).toHaveCount(1);
    await expect(page.getByRole("region", { name: "합계" })).toContainText("51건");
    const headers = () => page.locator("main table thead th:visible").allInnerTexts();
    for (const label of ["지급 방식", "차이 사유", "처리한 사람", "번호", "거래처", "증빙"]) expect(await headers()).toContain(label);
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect.poll(headers).not.toContain("지급 방식");
    for (const label of ["차이 사유", "처리한 사람"]) expect(await headers()).not.toContain(label);
    for (const label of ["번호", "거래처", "증빙", "지급일", "이체액"]) expect(await headers()).toContain(label);
    await page.setViewportSize({ width: 600, height: 900 });
    await expect.poll(headers).not.toContain("처리한 사람");
    for (const label of ["지급 방식", "차이 사유"]) expect(await headers()).not.toContain(label);
    await page.context().close();
  });

  test("Phase 5 상태 열 — 기안자 05 목록: 지급된 행 `지급 완료 {MM-DD}` · 기한 지난 선결제 둘째 줄 `증빙 {N}일 경과`(경고 색 · 태그 크기 · 400) · 열 머리글은 05 그대로", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    await paidTarget(fx, "tracer", payer);
    const overdue = await paidTarget(fx, "hold", payer);
    const dueDays = await loadPrepaidDueDays();
    const past = addDays(seoulToday(), -(dueDays + 2));
    await movePaidDate(overdue, past);
    await db.delete(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, overdue));
    await db.update(expenses).set({ prepaid: true, prepaidReason: "해외 결제 선결제" }).where(eq(expenses.id, overdue));
    // 증빙 없음 — 테스트 준비로 그 문서의 파일을 지운 것으로 둔다(removed_at).
    await db.update(files).set({ removedAt: new Date() }).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, overdue)));

    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 900 });
    await page.goto(`/expenses?${new URLSearchParams({ status: "승인" })}`);
    const paidRow = rowOf(page, fx.lines.tracer.itemName);
    const overdueRow = rowOf(page, fx.lines.hold.itemName);
    await expect(paidRow).toContainText(`지급 완료 ${seoulToday().slice(5)}`);
    await expect(overdueRow).toContainText(`지급 완료 ${past.slice(5)}`);
    const note = overdueRow.getByText("증빙 2일 경과", { exact: true });
    await expect(note).toBeVisible();
    expect(await colorOf(note)).toBe(await tokenAsColor(page, "--status-warning"));
    expect(await note.evaluate((element) => getComputedStyle(element).fontWeight)).toBe(await tokenAsWeight(page, "--fw-regular"));
    const tagSize = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.fontSize = "var(--text-tag)";
      document.body.append(probe);
      const size = getComputedStyle(probe).fontSize;
      probe.remove();
      return size;
    });
    expect(await note.evaluate((element) => getComputedStyle(element).fontSize)).toBe(tagSize);
    const headers = await page.locator("main table thead th").allInnerTexts();
    const allowed: string[] = ["번호", "프로젝트 · 항목", "거래처", "금액", "지급 예정", "기안", "상태"];
    expect(headers.every((header) => allowed.includes(header.trim()))).toBe(true);
    expect(headers.length).toBeLessThanOrEqual(allowed.length);
    await page.context().close();
  });
});

test.afterAll(archiveTempRoles);
