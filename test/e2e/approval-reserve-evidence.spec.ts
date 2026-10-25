import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteRevisions, reserveEntries } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { completeEvidenceUpload, requestEvidenceUpload } from "@/domain/evidence";
import { createRevisionFromCurrent, customerApprovalColumns } from "@/domain/quotes/revisions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createMemoryStorage } from "../integration/fakes/memory-storage";
import { createAccount } from "@/domain/auth/accounts";
import { insertTempRole } from "./temp-roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import type { Viewer } from "@/domain/viewer";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { kstToday } from "@/lib/kst-date";

// 06-16(D-56 · D-60 · UI-SPEC S21 · S22): 차수 승인 증빙(동작 칸 3차 + 펼침) · 리저브 줄 증빙. 준비는 도메인 함수와 DB로 하고 화면 동작만 브라우저로 본다.
// 업로드는 05 테스트 모드(브라우저 → 서명 PUT → 완료 통보)를 그대로 지난다.
const TODAY = kstToday(new Date());
const UPLOAD_WAIT = 20_000;
const PM_NAME = "E2E 승인증빙 PM";

type Account = { userId: string; email: string; password: string };

async function makeTeam(): Promise<{ id: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  return createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
}

async function makeAccount(roleId: string, teamId: string, name = PM_NAME): Promise<Account> {
  const email = `e2e-aev-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function makeProject(input: { teamId: string; pmUserId: string }) {
  const clientName = `E2E증빙거래처-${randomUUID()}`;
  const client = await insertVendor(SYSTEM_VIEWER, { name: clientName, normalizedName: clientName.toLowerCase() });
  const name = `E2E증빙-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: input.teamId, pmUserId: input.pmUserId, name });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(and(eq(codeItems.tableKey, "quote_subcategory"), eq(codeItems.active, true), isNull(codeItems.archivedAt))).orderBy(asc(codeItems.sortOrder), asc(codeItems.value)).limit(1);
  if (!subcategory) throw new Error("소분류 코드가 없습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        lineKind: "quote" as const,
        subcategory: subcategory.value,
        itemName: "증빙 줄",
        quantity: 1,
        unitPrice: { currency: "KRW" as const, amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 50_000, fxRate: 1 },
      },
    ],
  });
  return { id: created.id, name, revisionId: revision.id };
}

async function approveInDb(revisionId: string, userId: string, approvedOn = TODAY) {
  await db.update(quoteRevisions).set(customerApprovalColumns(userId, approvedOn)).where(eq(quoteRevisions.id, revisionId));
}

function revisionTable(page: Page): Locator {
  return page.locator("table", { has: page.locator("caption", { hasText: /^차수$/ }) });
}

// 05 테스트 모드 업로드가 해시로 중복을 가르므로 호출마다 다른 PDF 바이트를 만든다.
function uniquePdf(name = "고객 승인 메일.pdf"): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${randomUUID()}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`) };
}

test.describe("차수 승인 증빙 (06-16 Task 1 — D-56 · S21)", () => {
  test("승인 증빙 한 장: 승인된 최신 차수 동작 칸 3차 `승인 증빙` → 펼침 제목 포커스 → PDF 업로드 → 파일 행 · 3차 `승인 증빙 1` · 두 번째 → 승인 증빙 2 (G-06-J)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId });
    await approveInDb(project.revisionId, pm.userId);
    await login(page, pm);

    await page.goto(`/projects/${project.id}`);
    const table = revisionTable(page);
    const toggle = table.getByRole("button", { name: "1차 승인 증빙", exact: true });
    await expect(toggle).toHaveText("승인 증빙");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(table.getByRole("button", { name: "차수 열기" })).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const heading = page.getByRole("heading", { name: "상세 견적 1차 승인 증빙", exact: true });
    await expect(heading).toBeFocused();
    await expect(page.getByText(`승인 ${TODAY}`, { exact: true })).toBeVisible();

    const pdf = uniquePdf();
    await page.getByTestId("attachments-input").setInputFiles(pdf);
    const row = page.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name });
    await expect(row).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(table.getByRole("button", { name: "1차 승인 증빙 1", exact: true })).toHaveText("승인 증빙 1", { timeout: UPLOAD_WAIT });

    // G-06-J(UAT 45) — 두 번째 업로드 뒤에도 새로 고침 없이 3차 라벨 개수가 파일 행 수를 따른다(1 → 2).
    const second = uniquePdf("고객 승인 메일 2.pdf");
    await page.getByTestId("attachments-input").setInputFiles(second);
    await expect(page.locator('[data-ui="attachments"] li').filter({ hasText: second.name })).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(table.getByRole("button", { name: "1차 승인 증빙 2", exact: true })).toHaveText("승인 증빙 2", { timeout: UPLOAD_WAIT });
  });
});

function revisionActionCell(page: Page, seq: number): Locator {
  return revisionTable(page).locator("tbody tr", { hasText: new RegExp(`^${seq}차`) }).first().getByRole("cell").last();
}

// 준비용 — 도메인 경로로 파일 행 하나(메모리 가짜 저장소). 화면 동작은 브라우저로 따로 본다.
async function seedApprovalFile(account: Account, revisionId: string, name = "고객 승인 메일.pdf") {
  const storage = createMemoryStorage();
  const viewer = { id: account.userId, roleId: DEFAULT_ROLE_ID };
  const file = uniquePdf(name);
  const declared = { size: file.buffer.length, contentType: file.mimeType, sha256: (await import("node:crypto")).createHash("sha256").update(file.buffer).digest("hex"), name };
  const intent = await requestEvidenceUpload(viewer, { ownerKind: "quote_revision", ownerId: revisionId, ...declared }, { storage });
  storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
  return completeEvidenceUpload(viewer, { intentId: intent.intentId }, { storage });
}

test.describe("차수 승인 증빙 마감 (06-16 Task 2 — F10 · 04 S5 개정 ⒝ ⒞)", () => {
  test("파일 삭제 → 펼침 위 결과 줄 `증빙 삭제 · {파일명}` + 포커스 `되돌리기` → 누르면 파일 행이 돌아오고 줄이 사라진다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId });
    await approveInDb(project.revisionId, pm.userId);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await revisionTable(page).getByRole("button", { name: "1차 승인 증빙", exact: true }).click();

    const pdf = uniquePdf("삭제할 메일.pdf");
    await page.getByTestId("attachments-input").setInputFiles(pdf);
    const row = page.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name });
    await expect(row).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(page.getByText("증빙 삭제 ·")).toHaveCount(0);

    await row.getByRole("button", { name: /^삭제/ }).click();
    const line = page.locator('p[role="status"]', { hasText: `증빙 삭제 · ${pdf.name}` });
    await expect(line).toBeVisible({ timeout: UPLOAD_WAIT });
    const undo = line.getByRole("button", { name: "되돌리기" });
    await expect(undo).toBeFocused();
    await expect(row).toHaveCount(0);

    await undo.click();
    await expect(page.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name })).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(line).toHaveCount(0);
    // DOM 감사 D-1: 결과 줄이 사라져도 포커스는 화면 안(펼침 제목)에 남는다.
    await expect(page.locator('h2[tabindex="-1"]')).toBeFocused();
  });

  test("이전 차수(승인된 채 새 차수가 생김): 동작 칸에 3차 없음 · 「차수 열기」 제목 아래 같은 블록, 견적 줄 표는 편집 · 저장 없는 읽기 (⒝)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId });
    await approveInDb(project.revisionId, pm.userId);
    await createRevisionFromCurrent(SYSTEM_VIEWER, { projectId: project.id, fromRevisionId: project.revisionId });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);

    await expect(revisionTable(page).getByRole("button", { name: /승인 증빙/ })).toHaveCount(0);
    await expect(revisionActionCell(page, 1).getByRole("button")).toHaveText("차수 열기");
    await revisionActionCell(page, 1).getByRole("button", { name: "차수 열기" }).click();
    await expect(page.getByRole("heading", { name: "상세 견적 1차", exact: true })).toBeFocused();
    const nested = page.getByRole("heading", { name: "상세 견적 1차 승인 증빙", exact: true });
    await expect(nested).toBeVisible();

    const lines = page.locator("table", { has: page.locator("caption", { hasText: /^상세 견적 1차 견적 줄$/ }) });
    await expect(lines.locator("input, select, textarea")).toHaveCount(0);
    await expect(lines.getByRole("button")).toHaveCount(0);

    const pdf = uniquePdf("이전 차수 메일.pdf");
    await page.getByTestId("attachments-input").setInputFiles(pdf);
    const row = page.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name });
    await expect(row).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(row.getByRole("button", { name: /^삭제/ })).toBeVisible();
    await expect(lines.getByRole("button", { name: /삭제/ })).toHaveCount(0);
  });

  test("승인 표시 취소 뒤: 파일 0이면 3차 없음 · 파일이 있으면 3차가 남고 펼치면 파일 행만(올리기 · 삭제 없음)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const empty = await makeProject({ teamId: team.id, pmUserId: pm.userId });
    const kept = await makeProject({ teamId: team.id, pmUserId: pm.userId });
    await approveInDb(kept.revisionId, pm.userId);
    await seedApprovalFile(pm, kept.revisionId, "남은 메일.pdf");
    await db.update(quoteRevisions).set({ customerApprovedAt: null, customerApprovedBy: null }).where(eq(quoteRevisions.id, kept.revisionId));
    await login(page, pm);

    await page.goto(`/projects/${empty.id}`);
    await expect(revisionTable(page)).toBeVisible();
    await expect(revisionTable(page).getByRole("button", { name: /승인 증빙/ })).toHaveCount(0);

    await page.goto(`/projects/${kept.id}`);
    const toggle = revisionTable(page).getByRole("button", { name: "1차 승인 증빙 1", exact: true });
    await expect(toggle).toHaveText("승인 증빙 1");
    await toggle.click();
    await expect(page.locator('[data-ui="attachments"] li').filter({ hasText: "남은 메일.pdf" })).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(page.getByTestId("attachments-input")).toHaveCount(0);
    await expect(page.locator('[data-ui="attachments"]').getByRole("button", { name: /^삭제/ })).toHaveCount(0);
  });

  test("읽기 계정 · 파일 0: 3차를 펼치면 `승인 증빙 없음 · 올리기는 담당 PM {이름}`(버튼 없음)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount(TEAM_LEAD_ROLE_ID, team.id, "E2E 승인증빙 팀장");
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId });
    await approveInDb(project.revisionId, pm.userId);
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);

    await revisionTable(page).getByRole("button", { name: "1차 승인 증빙", exact: true }).click();
    await expect(page.getByText(`승인 증빙 없음 · 올리기는 담당 PM ${PM_NAME}`, { exact: true })).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(page.getByTestId("attachments-input")).toHaveCount(0);
  });

  test("승인 증빙과 「차수 열기」는 번갈아 열린다 · 열리면 포커스 = 제목 · 닫히면 그 3차, 라벨은 그대로 aria-expanded만 바뀐다 (⒞)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId });
    const second = await createRevisionFromCurrent(SYSTEM_VIEWER, { projectId: project.id, fromRevisionId: project.revisionId });
    await approveInDb(second.revisionId, pm.userId);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);

    const evidence = revisionTable(page).getByRole("button", { name: "2차 승인 증빙", exact: true });
    const lines = revisionActionCell(page, 1).getByRole("button");
    // DOM 감사 O-2: 닫힌 동안 aria-controls는 없는 id를 가리키지 않는다 — 펼치면 제목 id를 가리킨다.
    await expect(evidence).not.toHaveAttribute("aria-controls");
    await evidence.click();
    await expect(evidence).toHaveText("승인 증빙");
    await expect(evidence).toHaveAttribute("aria-expanded", "true");
    const controls = await evidence.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    await expect(page.locator(`[id="${controls}"]`)).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "상세 견적 2차 승인 증빙", exact: true })).toBeFocused();

    await lines.click();
    await expect(lines).toHaveText("차수 닫기");
    await expect(evidence).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("heading", { name: "상세 견적 2차 승인 증빙", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "상세 견적 1차", exact: true })).toBeFocused();

    await evidence.click();
    await expect(page.getByRole("heading", { name: "상세 견적 1차", exact: true })).toHaveCount(0);
    await expect(lines).toHaveText("차수 열기");
    await evidence.click();
    await expect(evidence).toHaveAttribute("aria-expanded", "false");
    await expect(evidence).toBeFocused();
    await expect(evidence).not.toHaveAttribute("aria-controls");
  });

  test("저장 안 한 견적 편집이 있어도 업로드가 되고 상세의 `일괄 저장` N은 그대로다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId });
    const second = await createRevisionFromCurrent(SYSTEM_VIEWER, { projectId: project.id, fromRevisionId: project.revisionId });
    await approveInDb(second.revisionId, pm.userId);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    const itemCell = page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) }).locator('tbody tr:has(td[role="gridcell"])').first().getByRole("gridcell").nth(2);
    await expect(async () => {
      await itemCell.focus();
      await page.keyboard.press("Enter");
      await expect(itemCell.locator("input")).toBeFocused({ timeout: 1000 });
    }).toPass();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("고친 줄");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    await revisionTable(page).getByRole("button", { name: "2차 승인 증빙", exact: true }).click();
    const pdf = uniquePdf("편집 중 메일.pdf");
    await page.getByTestId("attachments-input").setInputFiles(pdf);
    await expect(page.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name })).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
  });
});

// ---- Task 3 · D-60 리저브 줄 증빙 (S22) ----
// 리저브는 회사 전체 원장 하나라 케이스마다 비우고 시작한다(reserves.spec과 같다). 계급은 이 스펙이 만든 임시 계급이다.
type ReserveSeed = { date: string; direction: "deposit" | "withdrawal"; amount: number };

async function financeRole(): Promise<string> {
  const id = `role-e2e-aev-${randomUUID()}`;
  await insertTempRole(SYSTEM_VIEWER, { id, name: `E2E 리저브 증빙 ${id.slice(-8)}`, sortOrder: 99, viewScope: "company" });
  for (const grant of [
    { menu: "pnl", action: "view" },
    { menu: "pnl", action: "write" },
    { menu: "projects", action: "view" },
  ]) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: id, menu: grant.menu, action: grant.action, allowed: true });
  }
  for (const infoItem of ["reserve.amount", "vendor.value", "project.value", "expense.value"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: id, infoItem, visible: true });
  }
  return id;
}

async function seedReserve(rows: ReserveSeed[]): Promise<{ clientName: string; ids: string[] }> {
  const clientName = `E2E증빙리저브-${randomUUID().slice(0, 6)}`;
  const client = await insertVendor(SYSTEM_VIEWER, { name: clientName, normalizedName: clientName.toLowerCase() });
  const base = Date.UTC(2026, 0, 1);
  const inserted = await db
    .insert(reserveEntries)
    .values(
      rows.map((row, index) => ({
        clientId: client.id,
        entryDate: row.date,
        direction: row.direction,
        amountCurrency: "KRW",
        amountForeignAmount: null,
        amountFxRate: "1",
        amountAmountKrw: row.amount,
        createdAt: new Date(base + index * 1000),
      })),
    )
    .returning({ id: reserveEntries.id });
  return { clientName, ids: inserted.map((row) => row.id) };
}

async function seedReserveFile(viewer: Viewer, entryId: string, name = "세금계산서.pdf") {
  const storage = createMemoryStorage();
  const file = uniquePdf(name);
  const declared = { size: file.buffer.length, contentType: file.mimeType, sha256: (await import("node:crypto")).createHash("sha256").update(file.buffer).digest("hex"), name };
  const intent = await requestEvidenceUpload(viewer, { ownerKind: "reserve_entry", ownerId: entryId, ...declared }, { storage });
  storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
  return completeEvidenceUpload(viewer, { intentId: intent.intentId }, { storage });
}

// 열 순서: 날짜 · 구분 · 금액 · 잔액 · 프로젝트 · 증빙 종류 · 세금계산서 번호 · 메모 · 클라이언트 · 증빙(맨 끝).
const EVIDENCE_COL = 9;

function reserveDataRows(page: Page): Locator {
  return page.locator('tbody tr:has(> td[role="gridcell"])');
}

function reserveCell(page: Page, rowIndex: number, colIndex: number): Locator {
  return reserveDataRows(page).nth(rowIndex).getByRole("gridcell").nth(colIndex);
}

// 수화 전에 준 포커스는 격자가 받지 못한다 — 그 셀이 탭 정지가 될 때까지 다시 준다(reserves.spec 선례).
async function focusReserveCell(target: Locator) {
  await expect(async () => {
    await target.evaluate((element) => (element as HTMLElement).blur());
    await target.focus();
    await expect(target).toHaveAttribute("tabindex", "0", { timeout: 1_000 });
  }).toPass();
}

async function openReserves(page: Page, roleId: string, width = 1280) {
  const team = await makeTeam();
  const account = await makeAccount(roleId, team.id, "E2E 리저브 증빙");
  await page.setViewportSize({ width, height: 900 });
  await login(page, account);
  await page.goto("/pnl/reserves");
  return { viewer: { id: account.userId, roleId }, account };
}

test.describe("리저브 줄 증빙 (06-16 Task 3 — D-60 · S22)", () => {
  test.beforeEach(async () => {
    await db.delete(reserveEntries);
  });

  test("1280: 맨 끝 `증빙` 3차 → 표 아래 펼침(제목 포커스) → 업로드 → `증빙 1` · 일괄 저장 N 그대로 · 새 줄 `—` · 셀 Enter = 펼치기(한 번에 하나)", async ({ page }) => {
    const roleId = await financeRole();
    const seeded = await seedReserve([
      { date: "2026-04-01", direction: "deposit", amount: 200_000 },
      { date: "2026-04-02", direction: "deposit", amount: 100_000 },
    ]);
    await openReserves(page, roleId);

    await expect(page.getByRole("columnheader", { name: "증빙", exact: true })).toBeVisible();
    const first = page.getByRole("button", { name: `2026-04-01 ${seeded.clientName} 증빙`, exact: true });
    const second = page.getByRole("button", { name: `2026-04-02 ${seeded.clientName} 증빙`, exact: true });
    await expect(first).toHaveText("증빙");
    await expect(first).toHaveAttribute("aria-expanded", "false");

    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("heading", { name: `2026-04-01 ${seeded.clientName} 입금 200,000 증빙`, exact: true })).toBeFocused();

    const pdf = uniquePdf("세금계산서.pdf");
    await page.getByTestId("attachments-input").setInputFiles(pdf);
    await expect(page.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name })).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(page.getByRole("button", { name: `2026-04-01 ${seeded.clientName} 증빙 1`, exact: true })).toHaveText("증빙 1", { timeout: UPLOAD_WAIT });
    await expect(page.getByRole("button", { name: /^일괄 저장/ })).toHaveText(/^일괄 저장\s*(Ctrl\+S)?$/);

    // 업로드 뒤 router.refresh가 표를 다시 그리는 동안 누른 Enter는 사라질 수 있다 — 포커스를 다시 주고 펼쳐질 때까지 되풀이한다.
    await expect(async () => {
      await focusReserveCell(reserveCell(page, 1, EVIDENCE_COL));
      await page.keyboard.press("Enter");
      await expect(second).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
    }).toPass();
    await expect(page.getByRole("heading", { name: `2026-04-02 ${seeded.clientName} 입금 100,000 증빙`, exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: `2026-04-01 ${seeded.clientName} 증빙 1`, exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("heading", { name: /증빙$/ })).toHaveCount(1);

    await page.getByRole("button", { name: "리저브 줄 추가" }).click();
    await expect(reserveCell(page, 2, EVIDENCE_COL)).toHaveText("—");
  });

  test("폭 1100: `증빙` 열이 보이고 업로드가 된다 / 900: 펼침에 파일 행만(올리기 영역 · 삭제 0)", async ({ page }) => {
    const roleId = await financeRole();
    const seeded = await seedReserve([{ date: "2026-05-01", direction: "deposit", amount: 300_000 }]);
    const { viewer } = await openReserves(page, roleId, 1100);
    const toggleName = `2026-05-01 ${seeded.clientName} 증빙`;

    await expect(page.getByRole("columnheader", { name: "증빙", exact: true })).toBeVisible();
    await page.getByRole("button", { name: toggleName, exact: true }).click();
    const pdf = uniquePdf("1100 계산서.pdf");
    await page.getByTestId("attachments-input").setInputFiles(pdf);
    await expect(page.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name })).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(page.getByRole("button", { name: `${toggleName} 1`, exact: true })).toHaveText("증빙 1", { timeout: UPLOAD_WAIT });

    await seedReserveFile(viewer, seeded.ids[0] ?? "", "900 계산서.pdf");
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/pnl/reserves");
    await page.getByRole("button", { name: `${toggleName} 2`, exact: true }).click();
    await expect(page.locator('[data-ui="attachments"] li')).toHaveCount(2);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="attachments"]').getByRole("button", { name: /^삭제/ })).toHaveCount(0);
  });

  test("폰 390: 접힌 줄 `증빙 {N}` 글자 · 행 시트의 첨부 행에 파일 행만 — 올리기 · 삭제 요소 0", async ({ page }) => {
    const roleId = await financeRole();
    const seeded = await seedReserve([{ date: "2026-06-01", direction: "deposit", amount: 400_000 }]);
    const { viewer } = await openReserves(page, roleId, 390);
    await seedReserveFile(viewer, seeded.ids[0] ?? "", "폰 계산서.pdf");
    await page.goto("/pnl/reserves");

    const tap = page.getByRole("button", { name: `2026-06-01 ${seeded.clientName} 상세 보기` });
    await expect(tap).toContainText("증빙 1");
    await expect(page.getByRole("table", { name: "리저브 대장" }).getByRole("button", { name: /증빙( \d+)?$/ })).toHaveCount(0);
    await tap.click();
    const sheet = page.getByRole("dialog", { name: "2026-06-01 입금" });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-ui="attachments"] li').filter({ hasText: "폰 계산서.pdf" })).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(sheet.locator('input[type="file"]')).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: /^삭제/ })).toHaveCount(0);
  });

  test("증빙 있는 줄 삭제 모달에는 `증빙 {N}개 함께 보관`, 없는 줄에는 그 줄이 없다", async ({ page }) => {
    const roleId = await financeRole();
    const seeded = await seedReserve([
      { date: "2026-07-01", direction: "deposit", amount: 500_000 },
      { date: "2026-07-02", direction: "deposit", amount: 100_000 },
    ]);
    const { viewer } = await openReserves(page, roleId);
    await seedReserveFile(viewer, seeded.ids[0] ?? "", "보관될 계산서.pdf");
    await page.goto("/pnl/reserves");

    const dialog = page.getByRole("dialog", { name: "리저브 줄 삭제" });
    await focusReserveCell(reserveCell(page, 0, 0));
    await page.keyboard.press("Delete");
    await expect(dialog).toContainText("보관함으로 옮겨짐 · 잔액 다시 계산");
    await expect(dialog).toContainText("증빙 1개 함께 보관");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await focusReserveCell(reserveCell(page, 1, 0));
    await page.keyboard.press("Delete");
    await expect(dialog).toContainText("보관함으로 옮겨짐 · 잔액 다시 계산");
    await expect(dialog).not.toContainText("함께 보관");
  });

  test("펼침에서 파일 삭제 → 결과 줄 `증빙 삭제 · {파일명}` + 포커스 `되돌리기` → 누르면 파일 행이 돌아온다", async ({ page }) => {
    const roleId = await financeRole();
    const seeded = await seedReserve([{ date: "2026-08-01", direction: "deposit", amount: 600_000 }]);
    const { viewer } = await openReserves(page, roleId);
    await seedReserveFile(viewer, seeded.ids[0] ?? "", "지울 계산서.pdf");
    await page.goto("/pnl/reserves");

    await page.getByRole("button", { name: `2026-08-01 ${seeded.clientName} 증빙 1`, exact: true }).click();
    const row = page.locator('[data-ui="attachments"] li').filter({ hasText: "지울 계산서.pdf" });
    await expect(row).toBeVisible({ timeout: UPLOAD_WAIT });
    await row.getByRole("button", { name: /^삭제/ }).click();
    const line = page.locator('p[role="status"]', { hasText: "증빙 삭제 · 지울 계산서.pdf" });
    await expect(line).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(line.getByRole("button", { name: "되돌리기" })).toBeFocused();

    await line.getByRole("button", { name: "되돌리기" }).click();
    await expect(page.locator('[data-ui="attachments"] li').filter({ hasText: "지울 계산서.pdf" })).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(line).toHaveCount(0);
    // DOM 감사 D-1: 결과 줄이 사라져도 포커스는 화면 안(펼침 제목)에 남는다.
    await expect(page.locator('h2[tabindex="-1"]')).toBeFocused();
  });
});
