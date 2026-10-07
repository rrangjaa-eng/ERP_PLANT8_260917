import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchaseRequests } from "@/db/schema";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createCorpCard } from "@/domain/corp-cards";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";

// 06-14(EXP-10 · UI-SPEC S11 · S12 · S8 하위 링크): 팀 비용 구매 요청 · 요청 취소 · 목록 마감.
// 06-08 · 06-12 스펙(purchase-requests.spec.ts)은 건드리지 않는다 — 이 파일은 `온라인구매 협력사` 같은 전역 설정을 바꾸지 않는다
// (견적 줄 요청 행은 도메인 문 판정을 거치지 않고 DB에 직접 넣는다. 팀 비용 요청은 그 설정을 쓰지 않는다).

type Requester = { person: Person; teamId: string; teamName: string };

async function makeRequester(): Promise<Requester> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E마감본부-${suffix}` });
  const teamName = `E2E마감팀-${suffix}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
  const person = await makePerson("마감", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  return { person, teamId: team.id, teamName };
}

const PURCHASER_VISIBLE = ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount", "team.value", "vendor.value"];

// 구매 권한자(`cards.purchases` write) — 요청자와 다른 새 팀.
async function makePurchaser(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E마감처리-${suffix}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of PURCHASER_VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E처리본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E처리팀-${suffix}` });
  return makePerson("처리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

function panel(page: Page) {
  return page.getByRole("dialog", { name: "구매 요청" });
}

function completePanel(page: Page) {
  return page.getByRole("dialog", { name: "구매 완료" });
}

test.describe.configure({ mode: "serial" });

// 팀 비용 요청 한 건을 화면에서 신청하고 번호를 돌려준다 — 신청 뒤 패널을 닫고(`/cards/purchases`) 목록으로 돌아온다.
async function submitTeamRequest(page: Page): Promise<string> {
  await page.goto("/cards/purchases");
  const open = page.getByRole("link", { name: "구매 요청", exact: true });
  await waitForHydration(open);
  await open.click();
  const sheet = panel(page);
  await expect(sheet).toBeVisible();
  const item = sheet.getByLabel("품목");
  await waitForHydration(item);
  await item.fill(`취소 확인-${randomUUID().slice(0, 6)}`);
  const amount = sheet.getByLabel("예상 금액");
  await amount.fill("33000");
  await amount.press("Control+Enter");
  const status = sheet.getByRole("status");
  await expect(status).toHaveText(/^구매 요청됨 · TC\d{2}-\d{4}$/);
  const number = ((await status.textContent()) ?? "").split(" · ")[1] ?? "";
  await page.goto("/cards/purchases");
  return number;
}

function rowOf(page: Page, number: string) {
  return page.getByRole("row").filter({ hasText: number });
}

test.describe("팀 비용 구매 요청 (06-14)", () => {
  test("[06-14 트레이서] 목록 1차 `구매 요청` → 팀 비용 선택됨 · 팀 텍스트(힌트 0) → Ctrl+Enter → 결과 한 줄 `구매 요청됨 · TC` → 구매 권한자 구매 완료 → `/cards` 요청자 팀 `팀 비용 · {팀}`", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const page = await loginPage(browser, baseURL, requester.person);
    await page.goto("/cards/purchases");

    const open = page.getByRole("link", { name: "구매 요청", exact: true });
    await waitForHydration(open);
    await open.click();
    const sheet = panel(page);
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(/new=1/);
    // 연결 `팀 비용`이 골라진 채 열린다(라디오는 남는다) · 팀 값은 요청자의 오늘 소속 텍스트 — 그 아래 힌트 없음(M-5).
    await expect(sheet.getByRole("radio", { name: "팀 비용" })).toBeChecked();
    await expect(sheet.getByRole("radio", { name: "견적 줄" })).not.toBeChecked();
    const teamText = sheet.getByText(requester.teamName, { exact: true });
    await expect(teamText).toBeVisible();
    await expect(teamText.locator("xpath=..").locator("p")).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "프로젝트 바꾸기" })).toHaveCount(0);
    // 팀 · 사용한 사람 칸은 없다(O-19).
    await expect(sheet.getByLabel("팀", { exact: true })).toHaveCount(0);
    await expect(sheet.getByLabel("사용한 사람")).toHaveCount(0);

    const item = sheet.getByLabel("품목");
    await waitForHydration(item);
    const itemName = `팀 간식-${randomUUID().slice(0, 6)}`;
    await item.fill(itemName);
    const amount = sheet.getByLabel("예상 금액");
    await amount.fill("55000");
    await amount.press("Control+Enter");

    const status = sheet.getByRole("status");
    await expect(status).toHaveText(/^구매 요청됨 · TC\d{2}-\d{4}$/);
    const number = ((await status.textContent()) ?? "").split(" · ")[1] ?? "";
    expect(number).toMatch(/^TC\d{2}-\d{4}$/);
    // 뒤 목록 첫 줄(최근 요청이 첫 줄) — 첫 행은 요청일 주 그룹 머리(06-14)라 데이터 첫 행은 둘째.
    await expect(page.getByRole("row").nth(2)).toContainText(number);
    await page.context().close();

    const [saved] = await db.select({ id: purchaseRequests.id }).from(purchaseRequests).where(eq(purchaseRequests.number, number));
    expect(saved?.id).toBeTruthy();

    // 구매 권한자 — 그 행 `구매 완료` → S13 팀 텍스트(요청자의 사용일 소속, 힌트 0) → 구매 완료.
    const buyer = await makePurchaser();
    const suffix = randomUUID().slice(0, 6);
    await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${suffix}`, numberLast4: "4411", label: `공용카드-${suffix}`, kind: "shared" });
    const buyerPage = await loginPage(browser, baseURL, buyer);
    await buyerPage.goto("/cards/purchases");
    const complete = buyerPage.getByRole("link", { name: `${number} 구매 완료`, exact: true });
    await waitForHydration(complete);
    await complete.click();
    const done = completePanel(buyerPage);
    await expect(done).toBeVisible();
    const buyerTeam = done.locator('[data-ui="card-usage-team"]');
    await expect(buyerTeam).toHaveText(requester.teamName);
    await expect(buyerTeam.locator("xpath=..").locator("p")).toHaveCount(0);
    const total = done.getByLabel("결제 합계");
    await waitForHydration(total);
    const cardSelect = done.getByRole("combobox", { name: "카드" });
    if ((await cardSelect.count()) > 0) await cardSelect.selectOption({ label: `공용카드-${suffix} · 공용사-${suffix} 4411` });
    await total.press("Control+Enter");
    await expect(done).toHaveCount(0);

    await buyerPage.goto("/cards");
    const usageRow = buyerPage.getByRole("row").filter({ hasText: `구매 요청 ${number}` });
    await expect(usageRow).toHaveCount(1);
    await expect(usageRow.getByText(`팀 비용 · ${requester.teamName}`, { exact: true })).toBeVisible();
    await buyerPage.context().close();
  });
});

test.describe("구매 요청 취소 (06-14)", () => {
  test("요청자 본인 `요청 취소` — 확인 창 없이 즉시 · 결과 줄 · 포커스 `되돌리기` → 되돌리기 → 행 `신청됨`", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const page = await loginPage(browser, baseURL, requester.person);
    const number = await submitTeamRequest(page);
    const row = rowOf(page, number);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("신청됨");

    const cancel = row.getByRole("button", { name: `${number} 요청 취소` });
    await waitForHydration(cancel);
    await cancel.click();
    // 모달 없이 즉시 — 결과 줄 한 줄 + 포커스는 `되돌리기`.
    const line = page.getByRole("status").filter({ hasText: `구매 요청 취소됨 · ${number}` });
    await expect(line).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const undo = line.getByRole("button", { name: "되돌리기" });
    await expect(undo).toBeFocused();
    // 기본 보기(`신청됨`)에서 그 행은 빠진다.
    await expect(rowOf(page, number)).toHaveCount(0);

    await undo.press("Enter");
    await expect(line).toHaveCount(0);
    await expect(rowOf(page, number)).toHaveCount(1);
    await expect(rowOf(page, number)).toContainText("신청됨");
    // 되돌린 행의 `요청 취소`가 포커스를 받는다(06-09 카드 되돌리기 선례 — DOM D-3a).
    await expect(rowOf(page, number).getByRole("button", { name: `${number} 요청 취소` })).toBeFocused();
    await page.context().close();
  });

  test("구매 권한자의 남의 요청 `요청 취소` — 사유 확인 창 · 빈 사유 막힘 → 취소 행 2행 사유 · `되돌리기` 0 · `구매 완료` 행에 `요청 취소` 0", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const requesterPage = await loginPage(browser, baseURL, requester.person);
    const number = await submitTeamRequest(requesterPage);
    const doneNumber = await submitTeamRequest(requesterPage);
    await requesterPage.context().close();
    const [done] = await db.select({ id: purchaseRequests.id }).from(purchaseRequests).where(eq(purchaseRequests.number, doneNumber));
    await db.update(purchaseRequests).set({ status: "purchased", completedBy: requester.person.viewer.id, completedAt: new Date() }).where(eq(purchaseRequests.id, done?.id ?? ""));

    const buyer = await makePurchaser();
    const page = await loginPage(browser, baseURL, buyer);
    await page.goto("/cards/purchases");
    const cancel = rowOf(page, number).getByRole("button", { name: `${number} 요청 취소` });
    await waitForHydration(cancel);
    await cancel.click();
    const dialog = page.getByRole("dialog", { name: "구매 요청 취소" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("사유 없음 · 사유 적기");
    const confirm = dialog.getByRole("button", { name: /^구매 요청 취소/ });
    await expect(confirm).toHaveAttribute("aria-disabled", "true");
    const reason = dialog.getByLabel("사유");
    const reasonText = `중복 요청-${randomUUID().slice(0, 6)}`;
    await reason.fill(reasonText);
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    await reason.press("Control+Enter");
    await expect(dialog).toHaveCount(0);
    // 행이 사라진(새로 고침이 끝난) 뒤에도 포커스는 화면 제목에 있다(DOM D-3b — 행 `요청 취소`가 사라져 BODY로 떨어지지 않게).
    await expect(rowOf(page, number)).toHaveCount(0);
    await expect(page.locator('[data-ui="screen-title"]')).toBeFocused();
    // 남의 요청 취소에는 결과 줄 · `되돌리기`가 없다 — 행 2행이 말한다.
    await expect(page.getByRole("button", { name: "되돌리기" })).toHaveCount(0);

    await page.goto(`/cards/purchases?status=${encodeURIComponent("취소")}`);
    const cancelled = rowOf(page, number);
    await expect(cancelled).toHaveCount(1);
    await expect(cancelled).toContainText(`취소 ${seoulToday().slice(5)} · ${buyer.name} · ${reasonText}`);
    await expect(cancelled.getByRole("button", { name: "요청 취소", exact: false })).toHaveCount(0);

    // `구매 완료` 행에는 `요청 취소`가 없다(Q2).
    await page.goto(`/cards/purchases?status=${encodeURIComponent("구매 완료")}`);
    const purchasedRow = rowOf(page, doneNumber);
    await expect(purchasedRow).toHaveCount(1);
    await expect(purchasedRow.getByRole("button", { name: `${doneNumber} 요청 취소` })).toHaveCount(0);
    await page.context().close();
  });
});

test.describe("구매 요청 목록 마감 (06-14)", () => {
  test("카드 목록 필터 끝 하위 링크 — 0건이면 `구매 요청` · 신청 1건 뒤 `구매 요청 1` → 구매 요청 목록", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    // 쓸 카드가 0장인 직원 — 필터 줄이 서지 않아 빈 화면의 행동이 같은 링크를 맡는다(구매 요청은 카드 없는 직원도 한다).
    const page = await loginPage(browser, baseURL, requester.person);
    await page.goto("/cards");
    await expect(page.getByRole("link", { name: "구매 요청", exact: true })).toBeVisible();
    await submitTeamRequest(page);
    await page.goto("/cards");
    const link = page.getByRole("link", { name: "구매 요청 1", exact: true });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/cards\/purchases$/);
    await page.context().close();
  });

  test("`전체` 보기 — 그룹 순서 신청됨 → 구매 완료 → 취소 · 합계 줄 `합계 (전체 · 3건)` · 예상 금액 합", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const page = await loginPage(browser, baseURL, requester.person);
    const first = await submitTeamRequest(page);
    const second = await submitTeamRequest(page);
    const third = await submitTeamRequest(page);
    const byNumber = async (number: string) => (await db.select({ id: purchaseRequests.id }).from(purchaseRequests).where(eq(purchaseRequests.number, number)))[0]?.id ?? "";
    // 가장 최근 요청을 취소 · 중간을 구매 완료로 — 요청일 순서(최근 먼저)와 상태 그룹 순서가 정반대가 되게 한다.
    await db
      .update(purchaseRequests)
      .set({ status: "cancelled", cancelledBy: requester.person.viewer.id, cancelledAt: new Date(), cancelReason: null })
      .where(eq(purchaseRequests.id, await byNumber(third)));
    await db
      .update(purchaseRequests)
      .set({ status: "purchased", completedBy: requester.person.viewer.id, completedAt: new Date() })
      .where(eq(purchaseRequests.id, await byNumber(second)));

    await page.goto(`/cards/purchases?status=${encodeURIComponent("전체")}`);
    const table = page.getByRole("table");
    await expect(table).toContainText(first);
    const text = (await table.textContent()) ?? "";
    expect(text.indexOf(first)).toBeGreaterThan(-1);
    expect(text.indexOf(first)).toBeLessThan(text.indexOf(second));
    expect(text.indexOf(second)).toBeLessThan(text.indexOf(third));
    const summary = page.getByRole("region", { name: "합계" });
    await expect(summary).toContainText("합계 (전체 · 3건)");
    await expect(summary).toContainText("99,000");
    // 취소 행 2행 — 본인 취소는 사유 칸이 없다.
    await expect(rowOf(page, third)).toContainText(`취소 ${seoulToday().slice(5)} · ${requester.person.name}`);
    await page.context().close();
  });

  test("외화 요청 — 예상 금액 2행 `USD 1,000.00 @1,350`", async ({ browser, baseURL }) => {
    const requester = await makeRequester();
    const number = `TCUSD${randomUUID().slice(0, 6)}`;
    await db.insert(purchaseRequests).values({
      number,
      linkKind: "team_cost",
      requestedBy: requester.person.viewer.id,
      itemName: "해외 결제 물건",
      estimateCurrency: "USD",
      estimateForeignAmount: "1000",
      estimateFxRate: "1350",
      estimateAmountKrw: 1_350_000,
    });
    const page = await loginPage(browser, baseURL, requester.person);
    await page.goto("/cards/purchases");
    const row = rowOf(page, number);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("1,350,000");
    await expect(row).toContainText("USD 1,000.00 @1,350");
    await page.context().close();
  });
});
