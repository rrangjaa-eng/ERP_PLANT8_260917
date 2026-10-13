import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteRevisions } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { customerApprovalColumns } from "@/domain/quotes/revisions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
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
