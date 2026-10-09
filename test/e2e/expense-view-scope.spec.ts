import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { createTeam, listTeams } from "@/domain/org";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { approvalBasis } from "@/repositories/quote-revisions";
import { findProjectById } from "@/repositories/projects";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, uniqueReceipt, type ExpenseE2E } from "./expense-fixture";

// 06.2-09(S5 · S6 · D-6215 · D-6224 · D-6206): 다른 팀 PM이 담당인 행사의 견적 줄 지출결의.
// 세계 = setupExpenseE2E(결재선 팀장 → 본부장 → 경영 → 대표) + 같은 본부의 다른 팀 · 그 팀 PM(타팀PM) + 프로젝트 팀이 setupExpenseE2E 팀인 행사.
// 1단 「행사 담당 팀장」 = 프로젝트 팀의 팀장(fx.lead)이고, 경영(경영관리팀 · 팀 범위)은 결재 차례로 문서만 보고 프로젝트는 범위 밖이다.
// 사용자 결정 A-9 「목록만 줄임」(2026-10-09): 지출결의 목록 상태 열은 `팀장 결재 중`, 결재선 · 결재 시트는 `{이름} 행사 담당 팀장`.

type World = {
  fx: ExpenseE2E;
  otherPm: Person;
  projectId: string;
  projectLabel: string;
  lineId: string;
  itemName: string;
};

const UPLOAD_WAIT = 20_000;

async function setupWorld(): Promise<World> {
  const fx = await setupExpenseE2E();
  const today = seoulToday();
  const year = today.slice(0, 4);
  const suffix = randomUUID().slice(0, 4);
  const fxProject = await findProjectById(SYSTEM_VIEWER, fx.projectId);
  if (!fxProject) throw new Error("setupExpenseE2E 프로젝트 없음");
  const team = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.id === fxProject.teamId);
  if (!team?.orgUnitId) throw new Error("setupExpenseE2E 팀의 본부 없음");
  const otherTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: team.orgUnitId, name: `E2E다른팀-${suffix}` });
  const otherPm = await makePerson("타팀PM", "role-pm", otherTeam.id, `${year}-01-01`);

  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E범위고객-${suffix}`, normalizedName: `e2e범위고객-${suffix}` });
  // 짧은 이름 — 폰 행 줄 수가 상태 낱말만으로 정해지게 한다.
  const projectName = `E2E범위-${suffix}`;
  const project = await createProject(fx.ceo.viewer, {
    clientId: client.id,
    teamId: fxProject.teamId,
    pmUserId: otherPm.viewer.id,
    name: projectName,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  });
  if (!project.id || !project.number) throw new Error("행사를 만들지 못했다");
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수 없음");
  const itemName = `무대-${suffix}`;
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory: (await firstSelectableSubcategory()).value,
        itemName,
        vendorId: fx.vendorId,
        unitPrice: { currency: "KRW" as const, amount: 13_400_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 12_400_000, fxRate: 1 },
      },
    ],
  });
  const lineId = saved.lines.find((row) => row.itemName === itemName)?.id;
  if (!lineId) throw new Error("견적 줄 없음");
  await changeProjectStatus(fx.lead.viewer, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(otherPm.viewer, revision.id, { approvedOn: today, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  return { fx, otherPm, projectId: project.id, projectLabel: `${project.number} ${projectName}`, lineId, itemName };
}

async function draftOf(world: World): Promise<string> {
  const created = await createExpenseFromLines(world.otherPm.viewer, { lineIds: [world.lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서를 만들지 못했다: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

// 타팀PM이 폼에서 사진 한 장을 붙여 제출한다(expense-fixture submitLineExpense와 같은 길 — 기안자만 다르다).
async function submitAsOtherPm(page: Page, expenseId: string): Promise<void> {
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
  await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: UPLOAD_WAIT });
  await page.getByRole("button", { name: /^지출결의 제출/ }).click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
}

function projectField(page: Page): Locator {
  return page.locator("dt", { hasText: /^프로젝트$/ }).locator("xpath=following-sibling::dd[1]");
}

async function approveOnDocument(browser: Browser, baseURL: string | undefined, person: Person, expenseId: string): Promise<void> {
  const page = await loginPage(browser, baseURL, person);
  await page.goto(`/expenses/${expenseId}`);
  const approve = page.getByRole("button", { name: /^승인/ });
  await waitForHydration(approve);
  await approve.click();
  await expect(page.getByRole("button", { name: /^승인/ })).toHaveCount(0);
  await page.context().close();
}

test.describe("행사 담당 팀장 결재선 낱말 · 담당자 (06.2 S5)", () => {
  test("다른 팀 PM의 작성 중 문서 결재선이 {프로젝트 팀 팀장 이름} 행사 담당 팀장이고, 제출 뒤 목록 상태 열은 팀장 결재 중", async ({ browser, baseURL }) => {
    const world = await setupWorld();
    const expenseId = await draftOf(world);
    const page = await loginPage(browser, baseURL, world.otherPm);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await expect(page.getByTestId("approval-route-line")).toContainText(`${world.fx.lead.name} 행사 담당 팀장`);

    await submitAsOtherPm(page, expenseId);
    await page.goto("/expenses");
    const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: new RegExp(world.itemName) }) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("팀장 결재 중");
    await expect(row).not.toContainText("행사 담당 팀장 결재 중");
    await page.context().close();
  });

  test("제출 뒤 문서 결재선 list와 결재함 결재 시트의 1단이 모두 {팀장 이름} 행사 담당 팀장(label 하나 — design I9)", async ({ browser, baseURL }) => {
    const world = await setupWorld();
    const expenseId = await draftOf(world);
    const drafter = await loginPage(browser, baseURL, world.otherPm);
    await submitAsOtherPm(drafter, expenseId);
    const route = drafter.locator("dt", { hasText: "결재선" }).locator("xpath=following-sibling::dd[1]");
    await expect(route.getByRole("listitem").first()).toContainText(`${world.fx.lead.name} 행사 담당 팀장`);
    await drafter.context().close();

    const lead = await loginPage(browser, baseURL, world.fx.lead);
    await lead.goto("/approvals");
    const trigger = lead.getByRole("button", { name: new RegExp(`지출결의 · .*${world.itemName}`) });
    await waitForHydration(trigger);
    await trigger.click();
    const sheet = lead.getByRole("dialog");
    await expect(sheet).toContainText(`${world.fx.lead.name} 행사 담당 팀장`);
    await lead.context().close();
  });

  test("남의 작성 중 문서 주소는 열리지 않는다 — 문서 팀 · 팀장 이름이 새지 않는다(T-06.2-93)", async ({ browser, baseURL }) => {
    const world = await setupWorld();
    const expenseId = await draftOf(world);
    // 작성 중 문서는 기안자만 본다(canSeeExpense) — 다른 사람에게는 문서 화면도 결재선 미리보기도 없다.
    const other = await loginPage(browser, baseURL, world.fx.pm);
    await other.goto(`/expenses/${expenseId}`);
    await expect(other.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
    await expect(other.getByTestId("approval-route-line")).toHaveCount(0);
    await expect(other.locator("body")).not.toContainText(world.fx.lead.name);
    await other.context().close();
  });
});

test.describe("범위 밖 프로젝트로 가는 죽은 링크 없음 (06.2 S6 · D-6206)", () => {
  test("1단 팀장(프로젝트 팀)에게는 프로젝트 칸이 상세 링크, 결재 차례가 된 경영(팀 범위 — 프로젝트 범위 밖)에게는 같은 글자가 링크 없이", async ({ browser, baseURL }) => {
    const world = await setupWorld();
    const expenseId = await draftOf(world);
    const drafter = await loginPage(browser, baseURL, world.otherPm);
    await submitAsOtherPm(drafter, expenseId);
    await drafter.context().close();

    const lead = await loginPage(browser, baseURL, world.fx.lead);
    await lead.goto(`/expenses/${expenseId}`);
    await expect(projectField(lead).getByRole("link", { name: world.projectLabel })).toHaveAttribute("href", `/projects/${world.projectId}`);
    await lead.context().close();

    await approveOnDocument(browser, baseURL, world.fx.lead, expenseId);
    await approveOnDocument(browser, baseURL, world.fx.divisionHead, expenseId);

    const mgmt = await loginPage(browser, baseURL, world.fx.mgmt);
    await mgmt.goto(`/expenses/${expenseId}`);
    await expect(projectField(mgmt)).toHaveText(world.projectLabel);
    await expect(projectField(mgmt).getByRole("link")).toHaveCount(0);
    await expect(mgmt.getByRole("link", { name: world.projectLabel })).toHaveCount(0);
    await mgmt.context().close();
  });
});

// 폰 행 줄 수 — 보이는 칸마다 글자 줄(같은 높이의 글자 조각을 한 줄로 묶는다)을 세어 주 행의 최댓값 + 바로 뒤 접힌 줄(칸 하나 · colSpan > 1)의 줄 수.
async function rowLines(row: Locator): Promise<number> {
  return row.evaluate((tr) => {
    const visible = (el: Element) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
    const lineCount = (el: Element): number => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = [...range.getClientRects()]
        .filter((rect) => rect.width > 1 && rect.height > 1)
        .map((rect) => rect.top)
        .sort((a, b) => a - b);
      let lines = 0;
      let last = Number.NEGATIVE_INFINITY;
      for (const top of tops) {
        if (top - last > 4) {
          lines += 1;
          last = top;
        }
      }
      return lines;
    };
    const maxLines = (cells: Element[]) => cells.filter(visible).reduce((max, cell) => Math.max(max, lineCount(cell)), 0);
    const main = maxLines([...tr.children]);
    const next = tr.nextElementSibling;
    const nextCell = next?.children.length === 1 ? next.children[0] : null;
    const folded = next && nextCell instanceof HTMLTableCellElement && nextCell.colSpan > 1 && visible(next) ? maxLines([nextCell]) : 0;
    return main + folded;
  });
}

async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const width of [375, 320]) {
  test.describe(`폭 ${width} — 결재선 낱말이 든 목록 행 (06.2 S5 · design I9)`, () => {
    test(`지출결의 목록 · 결재함 행이 두 줄 이내이고 문서 가로 넘침 0`, async ({ browser, baseURL }) => {
      const world = await setupWorld();
      const expenseId = await draftOf(world);
      const drafter = await loginPage(browser, baseURL, world.otherPm);
      await submitAsOtherPm(drafter, expenseId);
      await drafter.context().close();

      const viewport = { width, height: 800 };
      const list = await loginPage(browser, baseURL, world.otherPm, viewport);
      await list.goto("/expenses");
      const row = list.getByRole("row").filter({ has: list.getByRole("link", { name: new RegExp(world.itemName) }) });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("팀장 결재 중");
      expect(await documentOverflow(list)).toBeLessThanOrEqual(0);
      expect(await rowLines(row)).toBeLessThanOrEqual(2);
      await list.context().close();

      const inbox = await loginPage(browser, baseURL, world.fx.lead, viewport);
      await inbox.goto("/approvals");
      const inboxRow = inbox.getByRole("row").filter({ has: inbox.getByRole("button", { name: new RegExp(`지출결의 · .*${world.itemName}`) }) });
      await expect(inboxRow).toHaveCount(1);
      expect(await documentOverflow(inbox)).toBeLessThanOrEqual(0);
      expect(await rowLines(inboxRow)).toBeLessThanOrEqual(2);
      await inbox.context().close();
    });
  });
}
