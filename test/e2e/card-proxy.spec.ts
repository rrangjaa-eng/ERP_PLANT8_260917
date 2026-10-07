import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, projects, purchaseRequests, quoteLines } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createExpenseFromLines } from "@/domain/expenses";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, archiveTempRoles, insertTempRole } from "./expense-fixture";
import { submitReadyDraft } from "../integration/fixtures/expenses";

// 06-09(EXP-16 · O-11 · UI-SPEC S8 · S9 · S15): 경영관리 대리 등록 · 행 `수정` 옆 패널 · 삭제 · 되돌리기.
// 사람 · 팀 · 카드 · 프로젝트는 도메인 함수로 만든다(스펙마다 전용 본부 · 팀).

type ProxyFx = {
  teamId: string;
  teamName: string;
  pm: Person;
  proxy: Person;
  cardId: string;
  cardLabel: string;
  cardText: string;
  projectId: string;
  projectName: string;
  projectNumber: string;
  itemName: string;
  lineId: string;
};

const VISIBLE = ["team.value", "card_usage.value", "card_usage.amount", "project.value", "quote.amount"];

async function proxyRole(): Promise<string> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E경영관리-${randomUUID().slice(0, 8)}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.proxy", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return role.id;
}

async function setup(): Promise<ProxyFx> {
  const suffix = randomUUID().slice(0, 8);
  const year = seoulToday().slice(0, 4);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E대리본부-${suffix}` });
  const teamName = `E2E대리팀-${suffix}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
  const pm = await makePerson("피엠", DEFAULT_ROLE_ID, team.id, `${year}-01-01`);
  const proxy = await makePerson("경영", await proxyRole(), team.id, `${year}-01-01`);
  const issuer = `현대-${suffix}`;
  const label = `PM카드-${suffix}`;
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4: "7788", label, kind: "personal", holderUserId: pm.viewer.id });
  if (!card.id) throw new Error("카드 id 없음");
  // 경영관리 본인 카드 — 옵션이 늘 둘 이상이라 카드 `Select`가 선다(본인 카드는 힌트 없음).
  await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4: "7789", label: `경영카드-${suffix}`, kind: "personal", holderUserId: proxy.viewer.id });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E대리클라이언트-${suffix}`, normalizedName: `e2e대리클라이언트-${suffix}` });
  const projectName = `E2E대리-${suffix}`;
  const project = await createProject(pm.viewer, { clientId: client.id, teamId: team.id, pmUserId: pm.viewer.id, name: projectName, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const itemName = `자동 결제-${suffix}`;
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory: (await firstSelectableSubcategory()).value,
        itemName,
        vendorId: null,
        unitPrice: { currency: "KRW" as const, amount: 2_500_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
      },
    ],
  });
  const [line] = await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
  if (!line) throw new Error("견적 줄이 없습니다");
  return {
    teamId: team.id,
    teamName,
    pm,
    proxy,
    cardId: card.id,
    cardLabel: label,
    cardText: `${label} · ${issuer} 7788`,
    projectId: project.id,
    projectName,
    projectNumber: project.number,
    itemName,
    lineId: line.id,
  };
}

// 목록 표에서 이 픽스처 카드의 묶음(카드별 rowgroup)만 — 권한자(회사 범위)는 다른 스펙이 같은 달에 만든 건도 본다.
function fixtureRows(page: Page, fx: ProxyFx) {
  return page.getByRole("table").getByRole("rowgroup").filter({ hasText: fx.cardLabel });
}

function cardSection(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "법인카드 사용", exact: true }) });
}

// 권한자가 화면으로 남의 개인 카드 · 견적 줄 한 건을 등록한다(1차 → 옆 패널).
async function registerByProxy(page: Page, fx: ProxyFx, amount: string): Promise<void> {
  await page.goto("/cards?new=1");
  const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
  const card = sheet.getByLabel("카드", { exact: true });
  await waitForHydration(card);
  await card.selectOption(fx.cardId);
  const hint = sheet.getByText(`경영관리 등록 · 카드 소지자 ${fx.pm.name}`, { exact: true });
  await expect(hint).toBeVisible();
  const total = sheet.getByLabel("결제 합계");
  await total.fill(amount);
  await sheet.getByRole("radio", { name: "견적 줄" }).check();
  await sheet.getByRole("button", { name: "프로젝트 바꾸기" }).click();
  const projects = page.getByRole("dialog", { name: "프로젝트 고르기" });
  await projects.getByRole("textbox", { name: "프로젝트 번호 · 이름 · 클라이언트 검색" }).fill(fx.projectName);
  await projects.getByRole("option", { name: new RegExp(fx.projectName) }).click();
  await projects.getByRole("button", { name: /^이 프로젝트로/ }).click();
  await sheet.getByRole("button", { name: "견적 줄 바꾸기" }).click();
  const lines = page.getByRole("dialog", { name: "견적 줄 고르기" });
  await lines.getByRole("option", { name: new RegExp(fx.itemName) }).click();
  await lines.getByRole("button", { name: /^이 줄로/ }).click();
  await total.press("Control+Enter");
  await expect(sheet.getByRole("status")).toHaveText(`카드 사용 등록됨 · ${Number(amount).toLocaleString("en-US")}`);
  await sheet.press("Escape");
  await expect(sheet).toBeHidden();
}

test.describe("법인카드 대리 등록 · 수정 (06-09)", () => {
  test("[트레이서] 경영관리 → 남의 개인 카드 힌트 · 견적 줄 저장 → 등록 칸 `경영관리 등록` → 행 `수정` → 결제 합계 고침 → 패널 닫힘 · 포커스 `수정` → PM S15에도 `경영관리 등록`", async ({ browser, baseURL }) => {
    const fx = await setup();
    const page = await loginPage(browser, baseURL, fx.proxy);
    await registerByProxy(page, fx, "300000");

    const rows = fixtureRows(page, fx);
    await expect(rows.getByText("경영관리 등록", { exact: true })).toHaveCount(1);
    const edit = rows.getByRole("link", { name: /수정$/ });
    await expect(edit).toHaveCount(1);
    await waitForHydration(edit);
    await edit.click();
    await expect(page).toHaveURL(/\/cards\?editId=/);
    const sheet = page.getByRole("dialog", { name: "카드 사용 수정" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(fx.cardText, { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /삭제/ })).toHaveCount(0);
    const total = sheet.getByLabel("결제 합계");
    await waitForHydration(total);
    await expect(total).toHaveValue("300,000");
    await total.fill("450000");
    await total.press("Control+Enter");
    await expect(sheet).toBeHidden();
    await expect(fixtureRows(page, fx).getByRole("link", { name: /수정$/ })).toBeFocused();
    await expect(fixtureRows(page, fx).getByText("450,000", { exact: true })).toHaveCount(1);
    await page.context().close();

    const pmPage = await loginPage(browser, baseURL, fx.pm);
    await pmPage.goto(`/projects/${fx.projectId}`);
    await expect(cardSection(pmPage).getByText("경영관리 등록", { exact: true })).toBeVisible();
    await pmPage.context().close();
  });

  test("[06-09 사용한 사람] 권한자 · 팀 카드 · 팀 비용 → `사용한 사람` 기본값 없음 → 고르면 팀 텍스트 → 사용일을 바꿔 후보에서 빠지면 칸 빔", async ({ browser, baseURL }) => {
    const fx = await setup();
    const year = seoulToday().slice(0, 4);
    const suffix = randomUUID().slice(0, 8);
    const teamCard = await createCorpCard(SYSTEM_VIEWER, { issuer: `팀카드사-${suffix}`, numberLast4: "7790", label: `팀카드-${suffix}`, kind: "team", teamId: fx.teamId });
    if (!teamCard.id) throw new Error("카드 id 없음");
    const newcomer = await makePerson("신입", DEFAULT_ROLE_ID, fx.teamId, `${year}-06-01`);
    const page = await loginPage(browser, baseURL, fx.proxy);
    await page.goto("/cards?new=1");
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    const card = sheet.getByLabel("카드", { exact: true });
    await waitForHydration(card);
    // 남의 개인 카드 → 사용한 사람 = 소지자 텍스트 · 팀 비용 값 = 소지자의 사용일 팀.
    await card.selectOption(fx.cardId);
    await sheet.getByRole("radio", { name: "팀 비용" }).check();
    await expect(sheet.getByText(fx.pm.name, { exact: true })).toBeVisible();
    await expect(sheet.locator('[data-ui="card-usage-team"]')).toHaveText(fx.teamName);
    await card.selectOption(teamCard.id);
    const usedBy = sheet.getByLabel("사용한 사람");
    await expect(usedBy.locator("option", { hasText: newcomer.name })).toHaveCount(1);
    await expect(usedBy).toHaveValue("");
    await usedBy.selectOption(newcomer.viewer.id);
    await expect(sheet.locator('[data-ui="card-usage-team"]')).toHaveText(fx.teamName);
    await sheet.getByLabel("사용일").fill(`${year}-03-02`);
    await expect(usedBy.locator("option", { hasText: newcomer.name })).toHaveCount(0);
    await expect(usedBy).toHaveValue("");
    await page.context().close();
  });

  test("[06-09 완료 프로젝트] 권한자 → 완료 프로젝트 고름 → 고를 수 있는 줄 0 → `견적 외 비용으로` → 저장", async ({ browser, baseURL }) => {
    const fx = await setup();
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const page = await loginPage(browser, baseURL, fx.proxy);
    await page.goto("/cards?new=1");
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    const card = sheet.getByLabel("카드", { exact: true });
    await waitForHydration(card);
    await card.selectOption(fx.cardId);
    const total = sheet.getByLabel("결제 합계");
    await total.fill("33000");
    await sheet.getByRole("radio", { name: "견적 줄" }).check();
    await sheet.getByRole("button", { name: "프로젝트 바꾸기" }).click();
    const projectsDialog = page.getByRole("dialog", { name: "프로젝트 고르기" });
    await projectsDialog.getByRole("textbox", { name: "프로젝트 번호 · 이름 · 클라이언트 검색" }).fill(fx.projectName);
    const option = projectsDialog.getByRole("option", { name: new RegExp(fx.projectName) });
    await expect(option).toContainText("완료 · 견적 줄 잠김");
    await option.click();
    await projectsDialog.getByRole("button", { name: /^이 프로젝트로/ }).click();
    await sheet.getByRole("button", { name: "견적 줄 바꾸기" }).click();
    const lines = page.getByRole("dialog", { name: "견적 줄 고르기" });
    await expect(lines.getByRole("button", { name: /^이 줄로/ })).toBeDisabled();
    await lines.getByRole("button", { name: "견적 외 비용으로" }).click();
    await expect(sheet.getByRole("radio", { name: "견적 외 비용" })).toBeChecked();
    const item = `완료 뒤 비용-${randomUUID().slice(0, 6)}`;
    await sheet.getByLabel("항목").fill(item);
    await total.press("Control+Enter");
    await expect(sheet.getByRole("status")).toHaveText("카드 사용 등록됨 · 33,000");
    await expect(page.getByRole("table").getByText(`${fx.projectName} · 견적 외 비용 · ${item}`, { exact: true })).toHaveCount(1);
    await page.context().close();
  });

  test("[06-09 수정 상한] 수정에서 결제 합계를 실행가 넘게 → 실행가 초과 막힘 · 패널 열림 유지", async ({ browser, baseURL }) => {
    const fx = await setup();
    const page = await loginPage(browser, baseURL, fx.proxy);
    await registerByProxy(page, fx, "300000");
    const edit = fixtureRows(page, fx).getByRole("link", { name: /수정$/ });
    await waitForHydration(edit);
    await edit.click();
    const sheet = page.getByRole("dialog", { name: "카드 사용 수정" });
    const total = sheet.getByLabel("결제 합계");
    await waitForHydration(total);
    // 이 건을 뺀 남은 실행가 = 2,000,000 — 카드 전표 2,500,000 → 공급가 2,272,727.
    await expect(sheet.getByText("남은 실행가 2,000,000", { exact: true })).toBeVisible();
    await total.fill("2500000");
    await expect(sheet.getByText("공급가 2,272,727 · 부가세 227,273 · 카드 전표 규칙", { exact: true })).toBeVisible();
    await total.press("Control+Enter");
    await expect(sheet.getByText(/^실행가 초과 · 남은 실행가 2,000,000 · /)).toBeVisible();
    await expect(sheet).toBeVisible();
    await page.context().close();
  });

  // 06-12 검토 I-2 — Esc 닫기 이동(`/cards` 목록 RSC) 응답이 오기 전에 `수정`을 누르면 기다리던 이동은 버려진다.
  // 등록 · 수정 패널이 같은 자리의 키 없는 SidePanel이면 닫힌 <dialog>가 재사용돼 수정 패널이 서지 않았다.
  test("[06-12 검토 I-2] 등록 패널 Esc 직후(목록 응답 2.5초 지연) `수정` → 수정 패널이 열린다", async ({ browser, baseURL }) => {
    const fx = await setup();
    const page = await loginPage(browser, baseURL, fx.proxy);
    await page.route(
      (url) => url.pathname === "/cards" && url.searchParams.has("_rsc") && [...url.searchParams.keys()].every((key) => key === "_rsc"),
      async (route) => {
        if (route.request().headers()["next-router-prefetch"]) return route.continue();
        await new Promise((resolve) => setTimeout(resolve, 2_500));
        await route.continue().catch(() => {});
      },
    );
    await registerByProxy(page, fx, "300000");
    await expect(page).toHaveURL(/\?new=1/);
    const edit = fixtureRows(page, fx).getByRole("link", { name: /수정$/ });
    await edit.click();
    const sheet = page.getByRole("dialog", { name: "카드 사용 수정" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("결제 합계")).toHaveValue("300,000");
    await page.context().close();
  });
});

// ── 06-09 Task 3: 삭제(= 보관) · 결과 줄 `되돌리기` · 폰 행 탭 ─────────────────

// 도메인으로 카드 사용 한 건(가맹점 = 새 거래처 — 행 접근 이름 `{MM-DD} {가맹점} …`으로 행을 가른다).
async function seedUsage(viewer: Person["viewer"], cardId: string, lineId: string, amount: number, merchant: string): Promise<string> {
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: merchant, normalizedName: `${merchant}-${randomUUID()}` });
  const input: CardUsageInput = {
    corpCardId: cardId,
    usedOn: seoulToday(),
    merchantVendorId: vendor.id,
    total: { currency: "KRW", amount, fxRate: 1 },
    evidenceTypeCode: "invoice",
    linkKind: "quote_line",
    lineId,
    memo: null,
  };
  return (await createCardUsage(viewer, input, await precheckCardUsage(viewer, input))).id;
}

// 역할 토큰의 계산 값(리터럴 rgb 대신 — executor brief).
async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

function undoLine(page: Page) {
  return page.getByRole("status").filter({ hasText: "카드 사용 삭제됨" });
}

test.describe("카드 사용 삭제 · 되돌리기 (06-09)", () => {
  test("행 `삭제` → 확인 창 없음 · 행 빠짐 · 결과 줄 · 포커스 `되돌리기` → 되돌리기 → 같은 행 돌아옴 · 결과 줄 사라짐", async ({ browser, baseURL }) => {
    const fx = await setup();
    const merchant = `가맹삭제-${randomUUID().slice(0, 6)}`;
    await seedUsage(fx.pm.viewer, fx.cardId, fx.lineId, 300_000, merchant);
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto("/cards");
    const remove = fixtureRows(page, fx).getByRole("button", { name: new RegExp(`${merchant} 삭제$`) });
    await waitForHydration(remove);
    await remove.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(fixtureRows(page, fx)).toHaveCount(0);
    await expect(undoLine(page)).toContainText("카드 사용 삭제됨 · 300,000");
    const undo = page.getByRole("button", { name: "되돌리기" });
    await expect(undo).toBeFocused();
    await undo.click();
    const restored = fixtureRows(page, fx).getByRole("button", { name: new RegExp(`${merchant} 삭제$`) });
    await expect(restored).toHaveCount(1);
    await expect(undoLine(page)).toHaveCount(0);
    // DOM D-4 — 포커스는 되살린 행의 `삭제`로(04.2 공휴일 선례).
    await expect(restored).toBeFocused();
    await page.context().close();
  });

  test("A 삭제 → B 삭제 → 결과 줄은 B 한 건", async ({ browser, baseURL }) => {
    const fx = await setup();
    const a = `가맹A-${randomUUID().slice(0, 6)}`;
    const b = `가맹B-${randomUUID().slice(0, 6)}`;
    await seedUsage(fx.pm.viewer, fx.cardId, fx.lineId, 100_000, a);
    await seedUsage(fx.pm.viewer, fx.cardId, fx.lineId, 200_000, b);
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto("/cards");
    const removeA = fixtureRows(page, fx).getByRole("button", { name: new RegExp(`${a} 삭제$`) });
    await waitForHydration(removeA);
    await removeA.click();
    await expect(undoLine(page)).toContainText("카드 사용 삭제됨 · 100,000");
    await fixtureRows(page, fx).getByRole("button", { name: new RegExp(`${b} 삭제$`) }).click();
    await expect(undoLine(page)).toHaveCount(1);
    await expect(undoLine(page)).toContainText("카드 사용 삭제됨 · 200,000");
    await expect(page.getByRole("button", { name: "되돌리기" })).toHaveCount(1);
    await page.context().close();
  });

  test("삭제 뒤 그 줄에 지출결의 → `되돌리기` → 결과 줄 --status-danger · 이중 연결 문구 · 행 안 돌아옴", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const label = `E2E되돌림-${randomUUID().slice(0, 8)}`;
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `국민-${randomUUID().slice(0, 6)}`, numberLast4: "5511", label, kind: "personal", holderUserId: fx.pm.viewer.id });
    if (!card.id) throw new Error("카드 id 없음");
    const merchant = `가맹이중-${randomUUID().slice(0, 6)}`;
    await seedUsage(fx.pm.viewer, card.id, fx.lines.tracer.id, 100_000, merchant);
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto(`/cards?card=${card.id}`);
    const group = page.getByRole("table").getByRole("rowgroup").filter({ hasText: label });
    const remove = group.getByRole("button", { name: new RegExp(`${merchant} 삭제$`) });
    await waitForHydration(remove);
    await remove.click();
    await expect(page.getByRole("status").filter({ hasText: "카드 사용 삭제됨 · 100,000" })).toHaveCount(1);
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id] });
    const submitted = await submitReadyDraft(fx.pm.viewer, created.created[0]?.expenseId ?? "");
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    await page.getByRole("button", { name: "되돌리기" }).click();
    // DOM O-3 — 지운 행이 화면에 없어 할 수 없는 다음 한 수 `다른 줄 고르기`는 뺀다. D-4 — 포커스는 결과 줄 글자로.
    const failed = page.getByRole("status").getByText(`지출결의 ${submitted.number} 연결됨`, { exact: true });
    await expect(failed).toBeVisible();
    await expect(failed).toHaveCSS("color", await tokenColor(page, "--status-danger"));
    await expect(failed).toBeFocused();
    await expect(page.getByRole("button", { name: "되돌리기" })).toHaveCount(0);
    await expect(group).toHaveCount(0);
    await page.context().close();
  });

  test("구매 완료 행 = `수정`만 · 권리 없는 행(남이 등록) = 행동 칸 빔", async ({ browser, baseURL }) => {
    const fx = await setup();
    const [request] = await db
      .insert(purchaseRequests)
      .values({ number: `26001-C${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId: fx.projectId, quoteLineId: fx.lineId, requestedBy: fx.pm.viewer.id, itemName: "현수막", estimateAmountKrw: 40_000 })
      .returning({ id: purchaseRequests.id });
    const bought = `가맹구매-${randomUUID().slice(0, 6)}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: bought, normalizedName: `${bought}-${randomUUID()}` });
    await db.insert(corpCardUsages).values({
      corpCardId: fx.cardId,
      usedOn: seoulToday(),
      merchantVendorId: vendor.id,
      totalCurrency: "KRW",
      totalForeignAmount: null,
      totalFxRate: "1",
      totalAmountKrw: 40_000,
      supplyKrw: 40_000,
      vatKrw: 0,
      evidenceTypeCode: "invoice",
      linkKind: "quote_line",
      quoteLineId: fx.lineId,
      teamId: null,
      usedByUserId: fx.pm.viewer.id,
      registeredBy: fx.pm.viewer.id,
      registeredVia: "purchase",
      purchaseRequestId: request?.id ?? null,
      memo: null,
    });
    const others = `가맹남의-${randomUUID().slice(0, 6)}`;
    await seedUsage(fx.proxy.viewer, fx.cardId, fx.lineId, 50_000, others);
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto("/cards");
    const group = fixtureRows(page, fx);
    await expect(group.getByRole("link", { name: new RegExp(`${bought} 수정$`) })).toHaveCount(1);
    await expect(group.getByRole("button", { name: new RegExp(`${bought} 삭제$`) })).toHaveCount(0);
    await expect(group.getByRole("link", { name: new RegExp(`${others} 수정$`) })).toHaveCount(0);
    await expect(group.getByRole("button", { name: new RegExp(`${others} 삭제$`) })).toHaveCount(0);
    await expect(group.getByRole("row").filter({ hasText: others }).locator('[data-ui="row-actions"]')).toHaveCount(0);
    await page.context().close();
  });

  test("폰 375 — 권리 있는 행 탭 → 수정 패널(시트) · 없는 행 탭 → RowSheet · S15 권리 있는 행 탭 → `/cards?editId=`", async ({ browser, baseURL }) => {
    const fx = await setup();
    const mine = `가맹내것-${randomUUID().slice(0, 6)}`;
    const others = `가맹남것-${randomUUID().slice(0, 6)}`;
    await seedUsage(fx.pm.viewer, fx.cardId, fx.lineId, 120_000, mine);
    await seedUsage(fx.proxy.viewer, fx.cardId, fx.lineId, 80_000, others);
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/cards");
    const group = fixtureRows(page, fx);
    const mineTap = group.getByRole("row").filter({ hasText: mine }).getByRole("button", { name: /상세 보기$/ });
    await waitForHydration(mineTap);
    await mineTap.click();
    await expect(page).toHaveURL(/\/cards\?editId=/);
    const sheet = page.getByRole("dialog", { name: "카드 사용 수정" });
    await expect(sheet).toBeVisible();
    await sheet.press("Escape");
    await expect(sheet).toBeHidden();
    const othersTap = fixtureRows(page, fx).getByRole("row").filter({ hasText: others }).getByRole("button", { name: /상세 보기$/ });
    await othersTap.click();
    const rowSheet = page.getByRole("dialog").filter({ hasText: others });
    await expect(rowSheet).toBeVisible();
    await expect(page).not.toHaveURL(/editId=/);
    await rowSheet.getByRole("button", { name: "닫기" }).click();

    await page.setViewportSize({ width: 320, height: 640 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/projects/${fx.projectId}`);
    const section = cardSection(page);
    const s15Tap = section.getByRole("row").filter({ hasText: mine }).getByRole("button", { name: /상세 보기$/ });
    await waitForHydration(s15Tap);
    await s15Tap.click();
    await expect(page).toHaveURL(/\/cards\?editId=/);
    await expect(page.getByRole("dialog", { name: "카드 사용 수정" })).toBeVisible();
    await page.context().close();
  });
});

// ── 06-09 DOM 감사 반영(D-1 · D-2 · D-3 · D-5) ──────────────────────────────────

// 금액 숨김(card_usage.amount) 계정 · 본인 개인 카드 · 팀 비용 한 건.
async function hiddenAmountFx(): Promise<{ person: Person; cardId: string; usageId: string; merchant: string }> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E숨김본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E숨김팀-${suffix}` });
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E카드금액숨김-${suffix}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of ["project.value", "card_usage.value", "team.value", "quote.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "card_usage.amount", visible: false });
  const person = await makePerson("금액숨김", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `신한-${suffix}`, numberLast4: "4321", label: `E2E숨김-${suffix}`, kind: "personal", holderUserId: person.viewer.id });
  if (!card.id) throw new Error("카드 id 없음");
  const merchant = `가맹숨김-${suffix}`;
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: merchant, normalizedName: `${merchant}-${randomUUID()}` });
  const input: CardUsageInput = {
    corpCardId: card.id,
    usedOn: seoulToday(),
    merchantVendorId: vendor.id,
    total: { currency: "KRW", amount: 123_457, fxRate: 1 },
    evidenceTypeCode: "invoice",
    linkKind: "team_cost",
    memo: null,
  };
  const { id } = await createCardUsage(person.viewer, input, await precheckCardUsage(person.viewer, input));
  return { person, cardId: card.id, usageId: id, merchant };
}

test.describe("카드 사용 삭제 · 수정 — DOM 감사 반영 (06-09)", () => {
  test("[D-1] 금액 숨김 계정 · 자기 건 삭제 → 결과 줄 · 액션 응답에 금액 없음 → 되돌리기 → 포커스 그 행 `삭제`", async ({ browser, baseURL }) => {
    const fx = await hiddenAmountFx();
    const page = await loginPage(browser, baseURL, fx.person);
    // 액션 응답 본문은 가로채 직접 읽는다 — 뒤이은 refresh가 브라우저 쪽 본문을 치워 response.text()가 실패할 수 있다.
    const bodies: string[] = [];
    await page.route("**/cards**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      bodies.push(await response.text());
      return route.fulfill({ response });
    });
    const actionBody = async (act: () => Promise<void>): Promise<string> => {
      const before = bodies.length;
      await act();
      await expect.poll(() => bodies.length).toBeGreaterThan(before);
      return bodies[before] ?? "";
    };
    await page.goto(`/cards?card=${fx.cardId}`);
    const remove = page.getByRole("button", { name: new RegExp(`${fx.merchant} 삭제$`) });
    await waitForHydration(remove);
    const deleted = await actionBody(() => remove.click());
    await expect(undoLine(page)).toHaveText(/^카드 사용 삭제됨\s*되돌리기/);
    await expect(page.locator("main")).not.toContainText("123,457");
    // 삭제의 새로 고침이 끝나 행이 빠진 뒤에 되돌린다 — 그 전에 누르면 행이 DOM에서 한 번도 사라지지 않아 되살아난 행의 `autoFocus`가 일어날 수 없다.
    await expect(remove).toHaveCount(0);
    const undo = page.getByRole("button", { name: "되돌리기" });
    const undone = await actionBody(() => undo.click());
    const restored = page.getByRole("button", { name: new RegExp(`${fx.merchant} 삭제$`) });
    await expect(restored).toBeFocused();
    for (const body of [deleted, undone]) {
      expect(body).toContain('"totalKrw":null');
      expect(body).not.toContain("123457");
    }
    await page.context().close();
  });

  test("[D-2] 되돌리기 요청이 끊김 → `되돌리기 실패 · 다시 시도` · `되돌리기` 남음(포커스 유지) → 다시 누르면 행이 돌아옴", async ({ browser, baseURL }) => {
    const fx = await hiddenAmountFx();
    const page = await loginPage(browser, baseURL, fx.person);
    await page.goto(`/cards?card=${fx.cardId}`);
    const remove = page.getByRole("button", { name: new RegExp(`${fx.merchant} 삭제$`) });
    await waitForHydration(remove);
    await remove.click();
    const undo = page.getByRole("button", { name: "되돌리기" });
    await expect(undo).toBeFocused();
    await page.route("**/cards**", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await undo.click();
    const failed = page.getByRole("status").getByText("되돌리기 실패 · 다시 시도", { exact: true });
    await expect(failed).toBeVisible();
    await expect(failed).toHaveCSS("color", await tokenColor(page, "--status-danger"));
    await expect(undo).toHaveCount(1);
    await expect(undo).toBeFocused();
    await page.unroute("**/cards**");
    await undo.click();
    await expect(page.getByRole("button", { name: new RegExp(`${fx.merchant} 삭제$`) })).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "되돌리기" })).toHaveCount(0);
    await page.context().close();
  });

  test("[D-3] 금액 숨김 계정 · 자기 건 수정 → 결제 합계는 읽기 `—`(칸 없음) · 1차 막힘 없음 → 메모만 저장 → 저장된 금액 그대로", async ({ browser, baseURL }) => {
    const fx = await hiddenAmountFx();
    const page = await loginPage(browser, baseURL, fx.person);
    await page.goto(`/cards?card=${fx.cardId}&editId=${fx.usageId}`);
    const sheet = page.getByRole("dialog", { name: "카드 사용 수정" });
    const memo = sheet.getByLabel("메모");
    await waitForHydration(memo);
    await expect(sheet.getByRole("textbox", { name: "결제 합계" })).toHaveCount(0);
    await expect(sheet.locator('[data-ui="field-row"]').filter({ hasText: "결제 합계" })).toContainText("—");
    await expect(sheet.getByText(/결제 합계 .*비어 있음/)).toHaveCount(0);
    await memo.fill("메모만 고침");
    await memo.press("Control+Enter");
    await expect(sheet).toBeHidden();
    await expect
      .poll(async () => (await db.select({ total: corpCardUsages.totalAmountKrw, memo: corpCardUsages.memo }).from(corpCardUsages).where(eq(corpCardUsages.id, fx.usageId)))[0])
      .toEqual({ total: 123_457, memo: "메모만 고침" });
    await page.context().close();
  });

  test("[D-5] 권한자 카드 `Select` — 긴 카드 이름은 말줄임", async ({ browser, baseURL }) => {
    const fx = await setup();
    await createCorpCard(SYSTEM_VIEWER, { issuer: `우리-${randomUUID().slice(0, 6)}`, numberLast4: "6464", label: `아주긴카드이름-${"가".repeat(56)}`, kind: "team", teamId: fx.teamId });
    const page = await loginPage(browser, baseURL, fx.proxy);
    await page.goto("/cards?new=1");
    const card = page.getByRole("dialog", { name: "카드 사용 등록" }).getByLabel("카드", { exact: true });
    await waitForHydration(card);
    await expect(card).toHaveCSS("text-overflow", "ellipsis");
    await page.context().close();
  });
});

test.afterAll(archiveTempRoles);
