import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteLines } from "@/db/schema";
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
    cardText: `${label} · ${issuer} 7788`,
    projectId: project.id,
    projectName,
    projectNumber: project.number,
    itemName,
    lineId: line.id,
  };
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
  await expect(sheet.getByText(`경영관리 등록 · 카드 소지자 ${fx.pm.name}`, { exact: true })).toBeVisible();
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

    const table = page.getByRole("table");
    await expect(table.getByText("경영관리 등록", { exact: true })).toHaveCount(1);
    const edit = table.getByRole("link", { name: /수정$/ });
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
    await expect(page.getByRole("table").getByRole("link", { name: /수정$/ })).toBeFocused();
    await expect(page.getByRole("table").getByText("450,000", { exact: true })).toHaveCount(1);
    await page.context().close();

    const pmPage = await loginPage(browser, baseURL, fx.pm);
    await pmPage.goto(`/projects/${fx.projectId}`);
    await expect(cardSection(pmPage).getByText("경영관리 등록", { exact: true })).toBeVisible();
    await pmPage.context().close();
  });
});
