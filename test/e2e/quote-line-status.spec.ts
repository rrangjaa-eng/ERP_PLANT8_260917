import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage } from "@/domain/corp-card-usages";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { insertVendor, updateVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { E2E_ONLINE_VENDOR_NAME, enableOnlineVendorSetting } from "./online-vendor";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { submitReadyDraft } from "../integration/fixtures/expenses";

// 06-13(S14 · EXP-06 · SP-2): 견적 줄 표의 상태 열 · 금액 셀 읽기 전용 이유 · 행 행동 막힘이 서버 값 하나로 같은 사실을 말한다.
// 문서는 05 폼(증빙 붙여 제출) · 04.1 승인 · 06-06 확인 · 06-03 지급 도메인 함수로 만든다.

const DESKTOP = { width: 1280, height: 800 };
// Phase 4 표 열 순서 그대로(실행가 = 7).
const ITEM_COLUMN = 2;
const EXECUTION_COLUMN = 7;
const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

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

async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
}

// 증빙 확인(06-06) 뒤 지급 완료(06-03).
async function payExpense(payer: Person, expenseId: string): Promise<void> {
  const [row] = await db.select({ version: expenses.version, supply: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  await db.update(expenses).set({ evidenceAmount: row.supply }).where(eq(expenses.id, expenseId));
  const confirmed = await confirmEvidence(payer.viewer, { expenseId, version: row.version });
  const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
  if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");
  await completeExpensePayment(payer.viewer, { expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
}

// 감사 O-8 — 같은 화면 S15 「법인카드 사용」 섹션 행(카드 사용의 연결 칸에 줄 이름이 든다)을 잡지 않게 견적 줄 표 안으로 좁힌다.
function rowOf(page: Page, itemName: string) {
  return page.getByRole("grid", { name: "견적 줄" }).getByRole("row").filter({ hasText: itemName });
}

const cellOf = (locator: Locator) => locator.locator("xpath=ancestor::*[self::td or self::th][1]");
const widthOf = async (locator: Locator) => (await locator.boundingBox())?.width ?? 0;

// 줄 하나에 소지자 본인 카드로 이은 카드 사용(계산서 — 공급가 = 결제 합계).
async function cardOn(holder: Person, lineId: string, amount = 100_000): Promise<void> {
  const card = await createCorpCard(SYSTEM_VIEWER, {
    issuer: `신한-${randomUUID().slice(0, 8)}`,
    numberLast4: String(1000 + Math.floor(Math.random() * 9000)),
    label: `E2E줄카드-${randomUUID().slice(0, 8)}`,
    kind: "personal",
    holderUserId: holder.viewer.id,
  });
  if (!card.id) throw new Error("카드 id 없음");
  const input = {
    corpCardId: card.id,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW" as const, amount, fxRate: 1 },
    evidenceTypeCode: "invoice",
    linkKind: "quote_line" as const,
    lineId,
    memo: null,
  };
  await createCardUsage(holder.viewer, input, await precheckCardUsage(holder.viewer, input));
}

// 06-13(N-3) — 수주 중(고객 승인 전 — 줄 상태를 고칠 수 있다) 프로젝트의 줄 둘(실행가 1,000,000)에 카드 사용 공급가 600,000씩.
async function cardHeldProject(): Promise<{ pm: Person; projectId: string; lines: [string, string] }> {
  const suffix = randomUUID().slice(0, 8);
  const year = seoulToday().slice(0, 4);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E카드줄본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E카드줄팀-${suffix}` });
  const pm = await makePerson("카드줄", "role-pm", team.id, `${year}-01-01`);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E카드줄클라이언트-${suffix}`, normalizedName: `e2e카드줄클라이언트-${suffix}` });
  const project = await createProject(pm.viewer, {
    clientId: client.id,
    teamId: team.id,
    pmUserId: pm.viewer.id,
    name: `E2E카드줄-${suffix}`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const names: [string, string] = [`현수막 출력-${suffix}`, `현장 소모품-${suffix}`];
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: names.map((itemName) => ({
      id: randomUUID(),
      isNew: true as const,
      subcategory,
      itemName,
      vendorId: null,
      unitPrice: { currency: "KRW" as const, amount: 1_500_000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
    })),
  });
  for (const itemName of names) {
    const lineId = saved.lines.find((row) => row.itemName === itemName)?.id;
    if (!lineId) throw new Error(`견적 줄 없음: ${itemName}`);
    await cardOn(pm, lineId, 600_000);
  }
  return { pm, projectId: project.id, lines: names };
}

async function tokenStyle(page: Page, token: { color: string; weight: string }): Promise<{ color: string; fontWeight: string }> {
  return page.evaluate(({ color, weight }) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${color})`;
    probe.style.fontWeight = `var(${weight})`;
    document.body.append(probe);
    const computed = getComputedStyle(probe);
    const style = { color: computed.color, fontWeight: computed.fontWeight };
    probe.remove();
    return style;
  }, token);
}

async function styleOf(locator: Locator): Promise<{ color: string; fontWeight: string }> {
  return locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { color: computed.color, fontWeight: computed.fontWeight };
  });
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

// 선결제 문서(증빙 없이 제출 — 06-10) → 결재 통과 → 지급일 `payDate`로 지급 완료.
async function prepaidPaidOn(fx: ExpenseE2E, payDate: string): Promise<void> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서 없음");
  const versionOf = async () => {
    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
    if (!row) throw new Error("지출결의 없음");
    return row.version;
  };
  await saveExpenseDraft(fx.pm.viewer, { expenseId, expectedVersion: await versionOf(), fields: { prepaid: true, prepaidReason: "행사장 선결제 요구" } });
  await submitExpense(fx.pm.viewer, { expenseId, expectedVersion: await versionOf() });
  await approveAll(fx, expenseId);
  const payer = await makePayerE2E();
  const preview = await previewPayable(payer.viewer, { expenseId, payDate });
  if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");
  await completeExpensePayment(payer.viewer, { expenseId, payDate, expectedPayableKrw: preview.payableKrw, version: await versionOf() });
}

const hintOf = (page: Page) => page.locator("p", { has: page.locator("kbd", { hasText: "Ctrl+E" }) });

test.describe("견적 줄 상태 (06-13)", () => {
  test("지급 완료 줄 — 상태 `지급 완료` · 금액 셀 이유 `지급 완료` 꼴 · 행 행동 자리에 `지급 완료 {번호} · 새 지출결의 없음`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "closed");
    await approveAll(fx, expenseId);
    await payExpense(await makePayerE2E(), expenseId);
    const number = `${fx.projectNumber}-0001`;

    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const row = rowOf(page, fx.lines.closed.itemName);
    await expect(row.getByRole("gridcell").filter({ hasText: /^지급 완료$/ })).toHaveCount(1);
    await expect(row.getByText(`지급 완료 ${number} · 새 지출결의 없음`, { exact: true })).toBeVisible();

    const amount = row.getByRole("gridcell").nth(EXECUTION_COLUMN);
    await waitForHydration(amount);
    await expect(async () => {
      await amount.focus();
      await page.keyboard.press("Enter");
      await expect(amount.getByText(`지출결의 ${number} 지급 완료 · 고치려면 새 차수`, { exact: true })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect(amount.locator("input, select")).toHaveCount(0);
  });

  test("한쪽 연결 다음 한 수 — 카드 사용 2건 줄: `지출결의 올리기` 비활성 + 이유 · 3차 `카드 사용 등록` → `/cards?new=1&line={id}` 패널이 그 줄", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await cardOn(fx.pm, fx.lines.hold.id);
    await cardOn(fx.pm, fx.lines.hold.id);

    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const row = rowOf(page, fx.lines.hold.itemName);
    const reason = "카드 사용 2건 연결됨 · 지출결의는 다른 줄";
    const blocked = row.getByRole("button", { name: /^지출결의 올리기/ });
    await expect(blocked).toHaveAttribute("aria-disabled", "true");
    await expect(blocked).toHaveAccessibleDescription(new RegExp(`${reason}$`));
    await expect(row.getByText(reason, { exact: true })).toBeVisible();
    const next = row.getByRole("link", { name: "카드 사용 등록" });
    await expect(next).toHaveAttribute("href", `/cards?new=1&line=${fx.lines.hold.id}`);

    await waitForHydration(next);
    await next.click();
    await expect(page).toHaveURL(new RegExp(`/cards\\?new=1&line=${fx.lines.hold.id}$`));
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    await expect(sheet.getByRole("radio", { name: "견적 줄" })).toBeChecked();
    await expect(sheet.getByText(fx.lines.hold.itemName, { exact: true })).toBeVisible();
    await page.context().close();
  });

  // 감사 D-1 — long-text backstop: 막힘 이유가 행동 칸 안에서 줄바꿈하고 막힌 줄이 행동 열을 늘려 항목 열을 누르지 않는다(SYSTEM §6-0 · §7-3 가로 스크롤 금지).
  // 기준은 같은 프로젝트의 막힘 없는 화면이다 — 상태 낱말(`미착수` → `카드 사용`)이 넓힌 만큼만 항목 열이 줄 수 있다.
  test("[감사 D-1] 막힌 줄 이유 + 3차 — 1280 · 1024 · 768에서 문서 가로 넘침 0 · 이유는 행동 칸 안 · 행동 열은 막힘 없는 화면 폭 그대로 · 항목 열은 상태 열이 넓힌 만큼만 줄어듦", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const reasonText = "카드 사용 2건 연결됨 · 지출결의는 다른 줄";
    const widths = [1280, 1024, 768] as const;
    // 1024 이상은 편집 격자(grid), 700~1023은 보기 전용 표(table) — 같은 캡션 `견적 줄`.
    const quoteTable = (page: Page) => page.getByRole("grid", { name: "견적 줄" }).or(page.getByRole("table", { name: "견적 줄" }));
    const columns = async (page: Page) => ({
      item: await widthOf(quoteTable(page).getByRole("columnheader", { name: "항목", exact: true })),
      status: await widthOf(quoteTable(page).getByRole("columnheader", { name: "상태", exact: true })),
      door: await widthOf(quoteTable(page).getByRole("columnheader", { name: "행동", exact: true })),
    });

    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    const base = new Map<number, Awaited<ReturnType<typeof columns>>>();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/projects/${fx.projectId}`);
      await expect(page.getByText(fx.lines.worst.itemName, { exact: true }).first()).toBeVisible();
      base.set(width, await columns(page));
    }

    await cardOn(fx.pm, fx.lines.hold.id);
    await cardOn(fx.pm, fx.lines.hold.id);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/projects/${fx.projectId}`);
      const row = page.getByRole("row").filter({ hasText: fx.lines.hold.itemName }).filter({ hasText: reasonText });
      const reason = row.getByText(reasonText, { exact: true });
      await expect(reason).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${width} 문서 가로 넘침`).toBeLessThanOrEqual(0);
      expect(await widthOf(reason), `${width} 이유가 행동 칸 안`).toBeLessThanOrEqual(await widthOf(cellOf(reason)));
      const before = base.get(width);
      if (!before) throw new Error("기준 폭 없음");
      const after = await columns(page);
      expect(after.door, `${width} 행동 열 폭`).toBeLessThanOrEqual(before.door + 1);
      expect(after.item, `${width} 항목 열 폭`).toBeGreaterThanOrEqual(before.item - Math.max(0, after.status - before.status) - 1);
    }
    await page.context().close();
  });

  // 감사 D-3 — 행 안 3차는 로빙 밖(tabIndex -1)이라 키보드 경로는 `Ctrl+E`다. 카드 쪽으로 막힌 줄의 `Ctrl+E`는 다음 한 수로 간다.
  test("[감사 D-3] 카드 쪽으로 막힌 줄 — 항목 칸에서 `Ctrl+E` → 다음 한 수 `/cards?new=1&line={id}`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await cardOn(fx.pm, fx.lines.hold.id);
    await cardOn(fx.pm, fx.lines.hold.id);

    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const item = rowOf(page, fx.lines.hold.itemName).getByRole("gridcell").nth(ITEM_COLUMN);
    await waitForHydration(item);
    await expect(async () => {
      await item.focus();
      await page.keyboard.press("Control+e");
      await expect(page).toHaveURL(new RegExp(`/cards\\?new=1&line=${fx.lines.hold.id}$`), { timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    await page.context().close();
  });

  test("서버 거부 = 화면 문구 — 카드 사용 2건 줄의 작성 중 문서 제출 거부 문구가 행 행동 이유와 같은 문자열", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.retry.id] });
    const draft = created.created[0]?.expenseId;
    if (!draft) throw new Error("작성 중 문서 없음");
    await cardOn(fx.pm, fx.lines.retry.id);
    await cardOn(fx.pm, fx.lines.retry.id);
    const serverReason = await submitReadyDraft(fx.pm.viewer, draft).then(
      () => "거부되지 않음",
      (error: unknown) => (error as Error).message,
    );

    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const row = rowOf(page, fx.lines.retry.itemName);
    await expect(row.getByText(serverReason, { exact: true })).toBeVisible();
    expect(serverReason).toBe("카드 사용 2건 연결됨 · 지출결의는 다른 줄");
    await page.context().close();
  });

  test.describe("온라인구매 줄 문", () => {
    test("온라인구매 협력사 줄 — 행 행동 `구매 요청` · `Ctrl+E` → `/cards/purchases?new=1&line={id}` · 힌트 줄 `지출결의·구매 요청 Ctrl+E` / 없는 프로젝트는 05 그대로", async ({ browser, baseURL }) => {
      const fx = await setupExpenseE2E();
      const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
      await page.goto(`/projects/${fx.projectId}`);
      await expect(hintOf(page)).toHaveText(/지출결의 올리기 Ctrl\+E$/);

      // 전역 설정은 모든 스펙이 같은 고정 이름으로 켜 둔다(`online-vendor.ts`) — 값을 바꾸지 않고 이 줄들의 거래처 이름을 그 이름으로 바꿔 문을 연다.
      await enableOnlineVendorSetting();
      await updateVendor(SYSTEM_VIEWER, fx.vendorId, { name: E2E_ONLINE_VENDOR_NAME, normalizedName: E2E_ONLINE_VENDOR_NAME.toLowerCase() });
      await page.goto(`/projects/${fx.projectId}`);
      await expect(hintOf(page)).toHaveText(/지출결의·구매 요청 Ctrl\+E$/);
      const row = rowOf(page, fx.lines.tracer.itemName);
      await expect(row.getByRole("link", { name: "구매 요청" })).toHaveAttribute("href", `/cards/purchases?new=1&line=${fx.lines.tracer.id}`);
      await expect(row.getByRole("button", { name: /^지출결의 올리기/ })).toHaveCount(0);

      const item = row.getByRole("gridcell").nth(ITEM_COLUMN);
      await waitForHydration(item);
      await expect(async () => {
        await item.focus();
        await page.keyboard.press("Control+e");
        await expect(page).toHaveURL(new RegExp(`/cards/purchases\\?new=1&line=${fx.lines.tracer.id}$`), { timeout: 2000 });
      }).toPass({ timeout: 20_000 });
      await page.context().close();
    });
  });

  test("상태 2행 — 기한 16일 지난 선결제 줄: 상태 `증빙 없음` + 2행 `증빙 16일 경과`(--status-warning · --fw-regular)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await prepaidPaidOn(fx, addDays(seoulToday(), -30));

    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const row = rowOf(page, fx.lines.hold.itemName);
    await expect(row.getByText("증빙 없음", { exact: true })).toBeVisible();
    const note = row.getByText("증빙 16일 경과", { exact: true });
    await expect(note).toBeVisible();
    expect(await styleOf(note)).toEqual(await tokenStyle(page, { color: "--status-warning", weight: "--fw-regular" }));
    await page.context().close();
  });

  test("카드 붙잡은 줄 — 삭제 → 확인 창 `견적 줄 취소` → 저장 뒤 행이 남고 상태 `취소`", async ({ browser, baseURL }) => {
    const fx = await cardHeldProject();

    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const row = rowOf(page, fx.lines[0]);
    const item = row.getByRole("gridcell").nth(ITEM_COLUMN);
    await waitForHydration(item);
    const dialog = page.getByRole("dialog", { name: "견적 줄 취소" });
    await expect(async () => {
      await item.focus();
      await page.keyboard.press("Delete");
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    await dialog.getByRole("button", { name: "견적 줄 취소" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: /^일괄 저장 1/ }).click();
    await expect(page.getByRole("button", { name: /^일괄 저장 1/ })).toHaveCount(0);

    await page.reload();
    const saved = rowOf(page, fx.lines[0]);
    await expect(saved).toHaveCount(1);
    await expect(saved.getByText("취소", { exact: true })).toBeVisible();
    await page.context().close();
  });

  test("카드 붙잡은 줄 — 실행가를 카드 쪽 공급가 아래(500,000)로 내려 저장 → 2행 `실행가 초과 100,000`(--status-warning) · 행 행동 그대로", async ({ browser, baseURL }) => {
    const fx = await cardHeldProject();

    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const row = rowOf(page, fx.lines[1]);
    const amount = row.getByRole("gridcell").nth(EXECUTION_COLUMN);
    await waitForHydration(amount);
    await expect(async () => {
      await amount.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("textbox", { name: "실행가", exact: true })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.getByRole("textbox", { name: "실행가", exact: true }).fill("500000");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /^일괄 저장 1/ }).click();

    const note = row.getByText("실행가 초과 100,000", { exact: true });
    await expect(note).toBeVisible();
    expect(await styleOf(note)).toEqual(await tokenStyle(page, { color: "--status-warning", weight: "--fw-regular" }));
    await expect(row.getByText("거래처 없음", { exact: true })).toBeVisible();
    await page.context().close();
  });
});
