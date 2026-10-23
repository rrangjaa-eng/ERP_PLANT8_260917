import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, quoteLines } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { createOrgUnit, createTeam } from "@/domain/org";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, uniqueReceipt, type ExpenseE2E, type LineKey } from "./expense-fixture";
import { E2E_ONLINE_VENDOR_NAME, enableOnlineVendorSetting } from "./online-vendor";

// 06-24 [E-29]: PM 정산 흐름이 끝까지 한 E2E에 있다 — 구매 요청 → 구매 완료(카드 사용이 줄 A에) · 지출결의(이미지 증빙) → 결재 통과 → 정산 전환 →
// 「완료 전 점검」 막힘(매출 발행 없음) · 「정산 결재 올리기」 비활성 → 발행 요청 → 경영관리 발행 → 막힘 0 → 정산 결재 올리기 → 대표 승인 → 프로젝트 `완료`.
// 플랜 사이 이음새(구매 완료 → 카드 사용 연결 · 발행 → 점검 풀림 · 정산 기안 → 최종 승인 점검)를 화면으로 건너뛰지 않는다. 건수 단언은 이 프로젝트 안 값만 본다.

const PURCHASER_VISIBLE = ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount", "team.value", "vendor.value"];
const FINANCE_VISIBLE = ["project.value", "revenue.issued_amount", "revenue.paid_amount"];

test.afterAll(async () => {
  await archiveTempRoles();
});

// 카드는 호출마다 새로 만든다 — `corp_cards_issuer_last4_key`는 (발급사, 뒤 4자리) 복합 UNIQUE이고 E2E DB는 스펙 사이에 비우지 않는다(X-a).
function randomCard(kind: "personal" | "shared", holderUserId?: string) {
  const tag = randomUUID().slice(0, 8);
  return {
    issuer: `E2E흐름카드사-${tag}`,
    numberLast4: String(1000 + Math.floor(Math.random() * 9000)),
    label: `E2E흐름카드-${tag}`,
    kind,
    ...(holderUserId ? { holderUserId } : {}),
  };
}

// 견적 줄 하나에 카드 사용 1건(06-05 `precheckCardUsage` → `createCardUsage`) — 금액은 줄 실행가보다 작다. 완료 전 점검의 미매칭에서 그 줄을 뺀다.
async function cardUsageOn(holder: Viewer, lineId: string): Promise<void> {
  const card = await createCorpCard(SYSTEM_VIEWER, randomCard("personal", holder.id));
  if (!card.id) throw new Error("카드 id 없음");
  const input: CardUsageInput = {
    corpCardId: card.id,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW", amount: 100_000, fxRate: 1 },
    evidenceTypeCode: "invoice",
    linkKind: "quote_line",
    lineId,
    memo: null,
  };
  await createCardUsage(holder, input, await precheckCardUsage(holder, input));
}

// 구매 권한자(`cards.purchases` write) — 요청자와 다른 새 팀(06-12 스펙과 같은 꼴).
async function makePurchaser(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E흐름구매처리-${suffix}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of PURCHASER_VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E흐름처리본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E흐름처리팀-${suffix}` });
  return makePerson("처리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

// 매출 기록 권한자(`projects.revenue` write) — 전용 계급이라 다른 스펙의 role-ceo 권한 부여와 다투지 않는다.
async function makeRevenueRecorder(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E흐름매출기록-${suffix}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.revenue", action: "write", allowed: true });
  for (const infoItem of FINANCE_VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E흐름매출본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E흐름매출팀-${suffix}` });
  return makePerson("매출", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

// PM이 줄 하나의 작성 중 문서를 만들고 폼에서 이미지 증빙을 올려 제출한다(화면). 문서 id를 돌려준다.
async function pmSubmitsExpense(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
  await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^지출결의 제출/ }).click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  await page.context().close();
  return expenseId;
}

// 결재선 넷 승인(approved) — 05 도우미와 같은 꼴(결재자 승인만 도메인 함수).
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

function completePanel(page: Page) {
  return page.getByRole("dialog", { name: "구매 완료" });
}

function preSettleSection(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "완료 전 점검", level: 2 }) });
}

function requestTable(page: Page) {
  return page.locator("table", { has: page.locator("caption", { hasText: /^발행 요청$/ }) });
}

test.describe("PM 정산 흐름 — 구매 · 지출결의 · 발행 · 정산 기안 · 대표 승인 · 완료 (06-24 · E-29)", () => {
  test("끝까지 — 막힘은 매출 발행 없음 한 번, 발행 뒤 풀려 정산 결재가 올라가고 대표 승인으로 프로젝트가 완료된다", async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const fx = await setupExpenseE2E();
    const lineA = fx.lines.tracer;

    // ── 시드: 줄 A만 온라인구매 협력사 줄로(구매 요청 문), 나머지 활성 줄은 카드 사용 1건씩(줄 B는 지출결의 몫이라 뺀다). 발행 줄은 시드하지 않는다.
    await enableOnlineVendorSetting();
    const online = await insertVendor(SYSTEM_VIEWER, { name: E2E_ONLINE_VENDOR_NAME, normalizedName: E2E_ONLINE_VENDOR_NAME.toLowerCase(), defaultEvidenceType: "tax_invoice" });
    await db.update(quoteLines).set({ vendorId: online.id }).where(eq(quoteLines.id, lineA.id));
    for (const key of ["retry", "phone", "noVendor", "worst", "closed"] as const) await cardUsageOn(fx.pm.viewer, fx.lines[key].id);

    // ── 줄 A: PM 구매 요청(화면) → 구매 권한자 구매 완료(화면) — 카드 사용이 줄 A에 이어진다.
    const pmPage = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 900 });
    await pmPage.goto(`/cards/purchases?new=1&line=${lineA.id}`);
    const requestSheet = pmPage.getByRole("dialog", { name: "구매 요청" });
    await expect(requestSheet).toBeVisible();
    const item = requestSheet.getByLabel("품목");
    await waitForHydration(item);
    await item.fill("현수막 3장");
    const estimate = requestSheet.getByLabel("예상 금액");
    await estimate.fill("110000");
    await estimate.press("Control+Enter");
    const requested = requestSheet.getByRole("status");
    await expect(requested).toHaveText(new RegExp(`^구매 요청됨 · ${fx.projectNumber}-C\\d{4}$`));
    const number = ((await requested.textContent()) ?? "").split(" · ")[1] ?? "";
    await pmPage.context().close();

    const buyer = await makePurchaser();
    const sharedCard = randomCard("shared");
    await createCorpCard(SYSTEM_VIEWER, sharedCard);
    const buyerPage = await loginPage(browser, baseURL, buyer);
    await buyerPage.goto("/cards/purchases");
    const complete = buyerPage.getByRole("link", { name: `${number} 구매 완료`, exact: true });
    await waitForHydration(complete);
    await complete.click();
    const done = completePanel(buyerPage);
    await expect(done).toBeVisible();
    await expect(done.getByText(lineA.itemName, { exact: true })).toBeVisible();
    const total = done.getByLabel("결제 합계");
    await waitForHydration(total);
    await expect(total).toHaveValue("110,000");
    // 활성 카드가 여러 장이면 카드 칸은 기본값 없는 Select, 한 장이면 읽기 텍스트 — 다른 스펙이 카드를 더 만들 수 있다.
    const cardLabel = `${sharedCard.label} · ${sharedCard.issuer} ${sharedCard.numberLast4}`;
    const cardSelect = done.getByRole("combobox", { name: "카드" });
    if ((await cardSelect.count()) > 0) await cardSelect.selectOption({ label: cardLabel });
    else await expect(done.getByText(cardLabel, { exact: true })).toBeVisible();
    await total.press("Control+Enter");
    await expect(done).toHaveCount(0);
    await buyerPage.context().close();

    // ── 줄 B: PM 지출결의(이미지 증빙) 제출 → 결재 통과.
    const expenseId = await pmSubmitsExpense(browser, baseURL, fx, "hold");
    await approveAll(fx, expenseId);

    // ── 정산 전환: 종료일이 지난 진행 프로젝트를 자동 정산 경로(applyAutoSettlement)로 정산에 둔다(테스트 준비 — 기간만 직접 쓴다).
    const lastYear = Number(seoulToday().slice(0, 4)) - 1;
    await db.update(projects).set({ startDate: `${lastYear}-11-01`, endDate: `${lastYear}-12-31` }).where(eq(projects.id, fx.projectId));
    const settled = await applyAutoSettlement({ projectIds: [fx.projectId] });
    expect(settled).toContain(fx.projectId);

    // ── PM 상세: 매출 발행 없음 막힘 하나 — 미매칭 견적 줄 · 미결 지출결의는 없다(구매 완료 · 지출결의 승인이 줄에 이어졌다).
    const pm = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 900 });
    await pm.goto(`/projects/${fx.projectId}`);
    const section = preSettleSection(pm);
    await expect(section.getByRole("heading", { name: "매출 미입력", level: 3 })).toBeVisible();
    await expect(section.getByText("발행 줄 없음", { exact: true })).toBeVisible();
    await expect(section.getByText(/^미매칭 견적 줄 /)).toHaveCount(0);
    await expect(section.getByText(/^미결 지출결의 /)).toHaveCount(0);
    const submit = pm.getByRole("button", { name: "정산 결재 올리기" });
    await waitForHydration(submit);
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    const blocked = pm.getByText(/^완료 전 점검 (\d+)건$/);
    await expect(blocked).toBeVisible();
    expect(Number(/(\d+)건/.exec((await blocked.textContent()) ?? "")?.[1] ?? 0)).toBeGreaterThanOrEqual(1);

    // ── 발행 요청(PM, 화면) → 경영관리 발행(화면).
    const requests = requestTable(pm);
    await requests.getByRole("button", { name: "발행 요청 추가" }).click();
    const today = seoulToday();
    await expect(requests.getByLabel("희망 발행일")).toHaveValue(today);
    await requests.getByLabel("금액").fill("22000000");
    await requests.getByLabel("메모").fill("정산 흐름 발행");
    await pm.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(pm.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();
    await expect(requests.getByText("신청됨", { exact: true })).toBeVisible();

    const recorder = await makeRevenueRecorder();
    const financePage = await loginPage(browser, baseURL, recorder, { width: 1280, height: 900 });
    await financePage.goto(`/projects/${fx.projectId}`);
    const issueButton = financePage.getByRole("button", { name: `희망 ${today.slice(5)} · 1번째 발행 줄로` });
    await waitForHydration(issueButton);
    await issueButton.click();
    await financePage.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(financePage.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();
    await expect(requestTable(financePage).getByText("발행됨", { exact: true })).toBeVisible();
    await financePage.context().close();

    // ── PM 상세: 막힘 0 · 「정산 결재 올리기」 활성 → 올리기.
    await pm.goto(`/projects/${fx.projectId}`);
    const ready = pm.getByRole("button", { name: "정산 결재 올리기" });
    await waitForHydration(ready);
    await expect(ready).not.toHaveAttribute("aria-disabled", "true");
    await expect(pm.getByText(/^완료 전 점검 \d+건$/)).toHaveCount(0);
    await ready.click();
    await expect(pm.getByRole("status").filter({ hasText: /^정산 결재 올리기 · 결재 요청됨 → / })).toBeVisible();
    await expect(pm.getByRole("link", { name: "정산 결재 중" })).toHaveAttribute("href", `/projects/${fx.projectId}/settlement`);
    await pm.context().close();

    // ── 대표 승인 → 프로젝트 `완료`.
    const ceo = await loginPage(browser, baseURL, fx.ceo);
    await ceo.goto(`/projects/${fx.projectId}/settlement`);
    const approve = ceo.getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await expect(approve).not.toHaveAttribute("aria-disabled", "true");
    await approve.click();
    await expect(ceo.getByRole("status").filter({ hasText: `승인 · 최종 승인 · ${fx.projectNumber} 완료` })).toBeVisible();
    const [project] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, fx.projectId));
    expect(project?.status).toBe("completed");
    await ceo.goto(`/projects/${fx.projectId}`);
    await expect(ceo.locator('[data-ui="screen-title"]').locator("..").getByText("완료", { exact: true })).toBeVisible();
    await ceo.context().close();
  });
});
