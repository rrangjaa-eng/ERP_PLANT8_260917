import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteLines } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { kstToday } from "@/lib/kst-date";

// 04-15(D-70 · PROJ-05 · UI-SPEC rev 5 S2 복사 등록 · S4 「조정 줄과 복사」 · DR-27) — 상세의 2차 「프로젝트 복사」 →
// 미리 채운 등록 폼(출처 한 줄) → Ctrl+Enter 등록 → 새 상세에 견적 줄만. 복사 범위의 DB 단언은 통합 테스트
// (project-copy.test.ts)가 한다.
const TODAY = kstToday(new Date());

type Account = { userId: string; email: string; password: string };

async function makeAccount(): Promise<{ account: Account; teamId: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E복사본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E복사팀-${randomUUID().slice(0, 8)}` });
  const email = `e2e-copy-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 복사 PM", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: TODAY });
  return { account: { userId, email, password: tempPassword }, teamId: team.id };
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 견적 줄 둘 + 조정 줄 하나(조정은 복사되지 않는다 — 출처 한 줄의 줄 수에도 없다).
async function makeOriginal(teamId: string, pmUserId: string) {
  const clientName = `E2E복사거래처-${randomUUID()}`;
  const client = await insertVendor(SYSTEM_VIEWER, { name: clientName, normalizedName: clientName.toLowerCase() });
  const name = `E2E원본-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId, name });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("소분류 코드가 없습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: ["무대 설치", "음향 장비"].map((itemName) => ({
      id: randomUUID(),
      isNew: true as const,
      lineKind: "quote" as const,
      subcategory: subcategory.value,
      itemName,
      quantity: 1,
      unitPrice: { currency: "KRW" as const, amount: 500_000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount: 200_000, fxRate: 1 },
    })),
  });
  await db.insert(quoteLines).values({
    revisionId: revision.id,
    lineKind: "adjustment",
    subcategory: "adjustment",
    itemName: "원가 보정",
    unitPriceAmountKrw: 0,
    quoteAmountKrw: 0,
    executionAmountKrw: 30_000,
    profitKrw: -30_000,
    sortOrder: 10,
  });
  return { id: created.id, number: created.number, name, clientId: client.id };
}

function quoteRows(page: Page): Locator {
  return page
    .locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) })
    .locator('tbody tr:has(td[role="gridcell"])');
}

function groupHeaders(page: Page): Locator {
  return page.locator("tbody tr[class*='groupRow'] td");
}

async function openCopyForm(page: Page, original: { id: string }) {
  await page.goto(`/projects/${original.id}`);
  await page.getByRole("link", { name: "프로젝트 복사" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects\\?new=1&copyFrom=${original.id}`));
  // 키보드 단축키(Ctrl+Enter · Esc)는 하이드레이션 뒤에 배선된다(project-register.spec.ts와 같은 대기).
  await page.waitForLoadState("networkidle");
}

test.describe("프로젝트 복사 등록 (04-15, PROJ-05 · D-70)", () => {
  test("트레이서 — 상세의 「프로젝트 복사」가 원본 값으로 채운 폼과 출처 한 줄을 열고, Ctrl+Enter 등록 뒤 새 상세에 견적 줄 둘만 있다", async ({ page }) => {
    const { account, teamId } = await makeAccount();
    const original = await makeOriginal(teamId, account.userId);
    await login(page, account);

    await openCopyForm(page, original);

    await expect(page.getByText(`${original.number} ${original.name}에서 복사 · 2줄`, { exact: true })).toBeVisible();
    await expect(page.getByLabel("클라이언트")).toHaveValue(original.clientId);
    await expect(page.getByLabel("담당 PM")).toHaveValue(account.userId);
    await expect(page.getByLabel("팀")).toHaveValue(teamId);
    const nameField = page.getByLabel("프로젝트명");
    await expect(nameField).toHaveValue(original.name);
    // S2 — 폼이 열려 있으면 목록 필터 줄의 1차 「프로젝트 등록」이 없다(복사 등록 포함).
    await expect(page.getByRole("link", { name: "프로젝트 등록" })).toHaveCount(0);

    const copyName = `E2E복사본-${randomUUID().slice(0, 8)}`;
    await nameField.fill(copyName);
    await nameField.press("Control+Enter");

    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: copyName })).toBeVisible();
    const subtitle = page.getByText(/^\d{5} · 상세 견적 1차/);
    await expect(subtitle).toBeVisible();
    await expect(subtitle).not.toContainText(original.number);
    await expect(page.getByText("수주중", { exact: true }).first()).toBeVisible();
    await expect(quoteRows(page)).toHaveCount(2);
    await expect(quoteRows(page).nth(0)).toContainText("무대 설치");
    await expect(quoteRows(page).nth(1)).toContainText("음향 장비");
    // UI Considerations S4 해소 — 원본에 조정 줄이 있어도 복사본 표에 「조정」 그룹이 없다.
    await expect(groupHeaders(page).filter({ hasText: /^조정$/ })).toHaveCount(0);
  });

  test("DR-27 — 손대지 않은 복사 폼의 Esc는 확인 없이 목록으로, 프로젝트명을 바꾼 뒤의 Esc는 「입력 버리기」 확인이고 2차 취소면 값이 남는다", async ({ page }) => {
    const { account, teamId } = await makeAccount();
    const original = await makeOriginal(teamId, account.userId);
    await login(page, account);

    await openCopyForm(page, original);
    await page.getByLabel("프로젝트명").focus();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toHaveCount(0);

    await openCopyForm(page, original);
    const nameField = page.getByLabel("프로젝트명");
    const changed = `${original.name}-바꿈`;
    await nameField.fill(changed);
    await page.keyboard.press("Escape");
    const dialog = page.getByRole("dialog", { name: "입력 버리기" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("프로젝트 등록 · 1칸")).toBeVisible();

    await dialog.getByRole("button", { name: /취소/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`copyFrom=${original.id}`));
    await expect(nameField).toHaveValue(changed);
  });
});
