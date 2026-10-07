import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { expensePayments, expenses, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { listAllPaymentTargets } from "@/domain/payments/targets";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { AMOUNT_HIDDEN } from "@/domain/payments/action-row";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";

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
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E일괄지급-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: !(opts.amountHidden && infoItem === "expense.amount") });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

// 줄 하나 → 증빙 붙여 제출 → 결재선 넷 승인 → (payable이면) 지급 권한자가 증빙 금액 = 공급가로 확인 = P4 · (unreviewed면) 확인 전 = P2. 문서 id를 돌려준다.
// 전역 설정(증빙 필수)을 바꾸지 않는다 — 다른 워커의 스펙(payment-single 등)과 설정을 다투지 않게 확인 기록으로 P4를 만든다.
async function approvedTarget(fx: ExpenseE2E, key: LineKey, state: "payable" | "unreviewed" = "payable"): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
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
  const confirmer = await makeTeamPayer(fx);
  // 빈 증빙 금액은 확인 때 공급가로 적는다(F2 — 빈 금액은 확인이 채우지 않는다).
  await confirmEvidence(confirmer.viewer, { expenseId, version: doc.version, correctedAmountKrw: doc.supply });
  return expenseId;
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
    await waitForHydration(page.getByLabel("증빙"));
    await page.getByLabel("증빙").selectOption({ label: "확인 전" });
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
    const table = page.getByRole("table", { name: "지급 대상" });
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
