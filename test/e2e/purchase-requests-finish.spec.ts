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
    // 뒤 목록 첫 줄(최근 요청이 첫 줄).
    await expect(page.getByRole("row").nth(1)).toContainText(number);
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
