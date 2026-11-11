import { randomUUID } from "node:crypto";
import { test, expect, type Page, type Request } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, quoteLines } from "@/db/schema";
import { placeInFundDivision } from "@/test/integration/fixtures/fund-scope";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { addDays, kstToday } from "@/lib/kst-date";
import { insertTempRole } from "./temp-roles";
import { waitForCardUsageSection } from "./fixtures";

// 07.2-12(D7298-B · D-7300 · UI-SPEC S11) — 프로젝트 사이 조정 쌍 화면: 「조정 줄 추가」 → 상대 프로젝트 고르기 → 새 조정 줄 항목 2행
// `상대 {번호} {이름}` → 일괄 저장 → 상대 현재 차수에 반대 부호 짝 줄 · 한쪽 삭제 예정이면 `상대 줄도 삭제` → 저장하면 짝도 보관.
// 경영관리는 시드 계급에 없어 이 스펙이 임시 계급을 만든다(quote-line-kinds.spec.ts와 같은 준비 — 공유 상태를 바꾸지 않는다).
const TODAY = kstToday(new Date());
const COL = { itemName: 2, execution: 8 } as const;

type Account = { userId: string; email: string; password: string };

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E쌍본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E쌍팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

async function makeAccount(roleId: string, teamId: string, name: string): Promise<Account> {
  const email = `e2e-pair-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

// 경영관리 — `projects` 보기 · `projects.adjustment` 쓰기. fund면 경영관리본부 발령(07.3-01 — 조정 쓰기 범위가 회사 전체).
async function makeAdjuster(teamId: string, fund = true): Promise<Account> {
  const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E쌍경영관리-${randomUUID().slice(0, 8)}`, workScope: fund ? "company" : "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.adjustment", action: "write", allowed: true });
  for (const infoItem of ["project.value", "quote.amount", "vendor.value"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  const account = await makeAccount(role.id, teamId, "E2E 쌍 경영관리");
  if (fund) await placeInFundDivision(account.userId);
  return account;
}

async function makeProject(teamId: string, pmUserId: string, label: string, status = "in_progress") {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E쌍거래처-${randomUUID()}`, normalizedName: `e2e쌍거래처-${randomUUID()}` });
  const name = `E2E쌍${label}-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId, name, startDate: addDays(TODAY, -5), endDate: addDays(TODAY, 10) });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  await db.update(projects).set({ status }).where(eq(projects.id, created.id));
  const [row] = await db.select({ number: projects.number }).from(projects).where(eq(projects.id, created.id));
  return { id: created.id, name, number: row!.number, revisionId: revision.id };
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

function isSaveAction(request: Request): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined && (request.postData() ?? "").includes("\"seenStatus\"");
}

async function saveAndWait(page: Page) {
  const saved = page.waitForResponse((response) => isSaveAction(response.request()));
  await page.getByRole("button", { name: /일괄 저장/ }).click();
  await saved;
}

function dataRows(page: Page) {
  return page.getByRole("table", { name: "견적 줄" }).or(page.getByRole("grid", { name: "견적 줄" })).locator("tbody tr:not([class*='groupRow']):not([class*='collapsedRow'])");
}

async function liveAdjustments(revisionId: string) {
  return db
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), eq(quoteLines.lineKind, "adjustment"), isNull(quoteLines.archivedAt)));
}

async function openProject(page: Page, project: { id: string; name: string }) {
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await waitForCardUsageSection(page);
}

test.describe("조정 줄 쌍 — 상대 프로젝트 고르기 (07.2-12 S11)", () => {
  test("경영관리 — 고르기(완료 행 고를 수 없음 · Esc 포커스 복귀) → −1,000,000 저장 → B에 +1,000,000 짝(상대 A 2행) → A 삭제 예정 `상대 줄도 삭제` → 저장하면 B 줄 0", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team, "E2E 쌍 PM");
    const a = await makeProject(team, pm.userId, "A");
    const b = await makeProject(team, pm.userId, "B");
    const done = await makeProject(team, pm.userId, "완료", "completed");
    await login(page, await makeAdjuster(team));
    await openProject(page, a);

    const trigger = page.getByRole("button", { name: "조정 줄 추가" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "상대 프로젝트 고르기" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("조정 줄 추가");
    const searchBox = dialog.getByRole("searchbox").or(dialog.getByRole("textbox")).first();
    await searchBox.fill(done.name);
    const doneRow = dialog.getByRole("option", { name: new RegExp(done.name) });
    await expect(doneRow).toHaveAttribute("aria-disabled", "true");
    await expect(doneRow).toContainText("완료 프로젝트 · 고를 수 없음");
    await expect(doneRow).toContainText(done.number);
    // 자기 프로젝트는 목록에 없다.
    await searchBox.fill(a.name);
    await expect(dialog.getByRole("option")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await searchBox.fill(b.name);
    await dialog.getByRole("option", { name: new RegExp(b.name) }).click();
    await dialog.getByRole("button", { name: /이 프로젝트로/ }).click();
    await expect(dialog).toBeHidden();
    const execution = page.getByRole("textbox", { name: "실행가" });
    await expect(execution).toBeFocused();
    await execution.fill("-1000000");
    await page.keyboard.press("Enter");
    const newItem = dataRows(page).nth(0).locator("> td").nth(COL.itemName);
    await expect(newItem).toContainText(`상대 ${b.number} ${b.name}`);
    await newItem.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "항목", exact: true }).fill("프로젝트 간 비용 이전");
    await page.keyboard.press("Enter");
    await expect(newItem).toContainText("프로젝트 간 비용 이전");
    await saveAndWait(page);

    await expect.poll(async () => (await liveAdjustments(b.revisionId)).map((line) => line.executionAmountKrw)).toEqual([1_000_000]);
    const [own] = await liveAdjustments(a.revisionId);
    const [partner] = await liveAdjustments(b.revisionId);
    expect(own!.executionAmountKrw + partner!.executionAmountKrw).toBe(0);
    expect(partner!.adjustmentPairId).toBe(own!.adjustmentPairId);

    await page.screenshot({ path: "test-results/07.2-12/pair-a-1280.png", fullPage: true });
    await openProject(page, b);
    const partnerItem = dataRows(page).nth(0).locator("> td").nth(COL.itemName);
    await expect(partnerItem).toContainText(`상대 ${a.number} ${a.name}`);
    await expect(dataRows(page).nth(0).locator("> td").nth(COL.execution)).toHaveText("1,000,000");

    await openProject(page, a);
    const ownItem = dataRows(page).nth(0).locator("> td").nth(COL.itemName);
    await ownItem.focus();
    await page.keyboard.press("Delete");
    await expect(ownItem).toContainText("삭제 예정");
    await expect(ownItem).toContainText("상대 줄도 삭제");
    await page.screenshot({ path: "test-results/07.2-12/pair-pending-1280.png", fullPage: true });
    await saveAndWait(page);
    await expect.poll(async () => (await liveAdjustments(b.revisionId)).length).toBe(0);
    expect(await liveAdjustments(a.revisionId)).toHaveLength(0);
  });

  // QA(#372) — 실행가 편집기가 `0` 끝에 캐럿을 두고 열려 키보드로 친 `-`가 버려졌다(`-7000` → `07,000` → 부호가 뒤집힌 짝).
  // fill이 아니라 키를 하나씩 친다. 편집기는 열릴 때 값을 전체 선택해 친 글자가 값을 바꾼다.
  test("경영관리 — 새 조정 줄 실행가에 키보드로 -7000 → -7,000 · 다시 Enter 후 -5 → -5 · 저장하면 A −5 · B +5", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team, "E2E 쌍 PM");
    const a = await makeProject(team, pm.userId, "A");
    const b = await makeProject(team, pm.userId, "B");
    await login(page, await makeAdjuster(team));
    await openProject(page, a);

    await page.getByRole("button", { name: "조정 줄 추가" }).click();
    const dialog = page.getByRole("dialog", { name: "상대 프로젝트 고르기" });
    await dialog.getByRole("searchbox").or(dialog.getByRole("textbox")).first().fill(b.name);
    await dialog.getByRole("option", { name: new RegExp(b.name) }).click();
    await dialog.getByRole("button", { name: /이 프로젝트로/ }).click();
    const execution = page.getByRole("textbox", { name: "실행가" });
    await expect(execution).toBeFocused();
    await page.keyboard.type("-7000");
    await expect(execution).toHaveValue("-7,000");
    await page.keyboard.press("Enter");
    const executionCell = dataRows(page).nth(0).locator("> td").nth(COL.execution);
    await expect(executionCell).toHaveText("-7,000");

    await executionCell.focus();
    await page.keyboard.press("Enter");
    await expect(execution).toBeFocused();
    await page.keyboard.type("-5");
    await expect(execution).toHaveValue("-5");
    await page.keyboard.press("Enter");
    const itemCell = dataRows(page).nth(0).locator("> td").nth(COL.itemName);
    await itemCell.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("부호 확인용 조정");
    await page.keyboard.press("Enter");
    await saveAndWait(page);

    await expect.poll(async () => (await liveAdjustments(a.revisionId)).map((line) => line.executionAmountKrw)).toEqual([-5]);
    expect((await liveAdjustments(b.revisionId)).map((line) => line.executionAmountKrw)).toEqual([5]);
  });

  test("390 — 쌍 줄은 보기 전용 · 항목 2행 `상대 {번호} {이름}` · 「조정 줄 추가」 없음", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team, "E2E 쌍 PM");
    const a = await makeProject(team, pm.userId, "폰A");
    const b = await makeProject(team, pm.userId, "폰B");
    await saveQuoteLines(SYSTEM_VIEWER, a.revisionId, {
      rows: [
        {
          id: randomUUID(),
          isNew: true,
          lineKind: "adjustment",
          subcategory: "",
          itemName: "폰 쌍 조정",
          counterpartProjectId: b.id,
          unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
          execution: { currency: "KRW", amount: -50_000, fxRate: 1 },
        },
      ],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, await makeAdjuster(team));
    await page.goto(`/projects/${a.id}`);
    await expect(page.getByRole("heading", { name: a.name })).toBeVisible();
    await expect(page.getByText(`상대 ${b.number} ${b.name}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "조정 줄 추가" })).toHaveCount(0);
    await page.screenshot({ path: "test-results/07.2-12/pair-a-390.png", fullPage: true });
  });
});
