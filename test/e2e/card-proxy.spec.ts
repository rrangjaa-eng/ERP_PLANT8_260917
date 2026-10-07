import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, quoteLines } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";

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
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E경영관리-${randomUUID().slice(0, 8)}`, workScope: "company" });
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
    await card.selectOption(teamCard.id);
    await sheet.getByRole("radio", { name: "팀 비용" }).check();
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
});
