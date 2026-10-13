import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteRevisions } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { completeEvidenceUpload, requestEvidenceUpload } from "@/domain/evidence";
import { createRevisionFromCurrent, customerApprovalColumns } from "@/domain/quotes/revisions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createMemoryStorage } from "../integration/fakes/memory-storage";
import { createAccount } from "@/domain/auth/accounts";
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
  test("승인 증빙 한 장: 승인된 최신 차수 동작 칸 3차 `승인 증빙` → 펼침 제목 포커스 → PDF 업로드 → 파일 행 · 3차 `승인 증빙 1`", async ({ page }) => {
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
    await evidence.click();
    await expect(evidence).toHaveText("승인 증빙");
    await expect(evidence).toHaveAttribute("aria-expanded", "true");
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
