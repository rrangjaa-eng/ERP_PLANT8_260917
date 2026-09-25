import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, quoteRevisions } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { kstToday } from "@/lib/kst-date";

// 04-24(PROJ-07 · PROJ-05 · UX-04) — 상세의 차수 화면: 「복사해 새 차수」 · 고객 승인 표시와 취소 · 차수 섹션 ·
// 이전 차수 읽기 섹션 · 이전 차수 보관본 복원 줄. 준비는 도메인 함수와 DB로 하고(상태 · 승인일), 화면 동작만 브라우저로 본다.
const TODAY = kstToday(new Date());

type Account = { userId: string; email: string; password: string };
type SeedLine = { itemName: string; unitPrice: number; execution: number; lineKind?: "quote" | "adjustment" };

async function makeTeam(): Promise<{ id: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  return createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
}

async function makeAccount(roleId: string, teamId: string, name = "E2E 차수 PM"): Promise<Account> {
  const email = `e2e-rev-${randomUUID()}@example.test`;
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

// 줄은 수주중(생성 직후)에 도메인 함수로 넣고 그 뒤 상태를 DB에 둔다(quote-line-kinds.spec.ts와 같은 준비).
async function makeProject(input: { teamId: string; pmUserId: string; status?: string; lines: SeedLine[] }) {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E차수거래처-${randomUUID()}`, normalizedName: `e2e차수거래처-${randomUUID()}` });
  const name = `E2E차수-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: input.teamId, pmUserId: input.pmUserId, name });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("소분류 코드가 없습니다");
  if (input.lines.length > 0) {
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: input.lines.map((line) => ({
        id: randomUUID(),
        isNew: true as const,
        lineKind: line.lineKind ?? "quote",
        subcategory: line.lineKind === "adjustment" ? "" : subcategory.value,
        itemName: line.itemName,
        quantity: 1,
        unitPrice: { currency: "KRW" as const, amount: line.lineKind === "adjustment" ? 0 : line.unitPrice, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: line.execution, fxRate: 1 },
      })),
    });
  }
  if (input.status) await db.update(projects).set({ status: input.status }).where(eq(projects.id, created.id));
  return { id: created.id, number: created.number, name, revisionId: revision.id };
}

function quoteTable(page: Page): Locator {
  return page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) });
}

function quoteRows(page: Page): Locator {
  return quoteTable(page).locator('tbody tr:has(td[role="gridcell"])');
}

function quoteCell(page: Page, rowIndex: number, colIndex: number): Locator {
  return quoteRows(page).nth(rowIndex).getByRole("gridcell").nth(colIndex);
}

async function editTextCell(page: Page, rowIndex: number, colIndex: number, text: string) {
  const cell = quoteCell(page, rowIndex, colIndex);
  // 편집 입력이 실제로 열렸는지 확인한다 — 수화 전에 누른 Enter는 사라진다.
  await expect(async () => {
    await cell.focus();
    await page.keyboard.press("Enter");
    await expect(cell.locator("input")).toBeFocused({ timeout: 1000 });
  }).toPass();
  await page.keyboard.press("Control+a");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

function isServerAction(request: { method: () => string; headers: () => Record<string, string> }) {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

async function expectDescribedBy(page: Page, button: Locator, text: string) {
  const ids = ((await button.getAttribute("aria-describedby")) ?? "").split(" ").filter(Boolean);
  const texts = await Promise.all(ids.map((id) => page.locator(`[id="${id}"]`).textContent()));
  expect(texts).toContain(text);
}

async function revisionCount(projectId: string): Promise<number> {
  return (await db.select().from(quoteRevisions).where(eq(quoteRevisions.projectId, projectId))).length;
}

const COL = { itemName: 2, execution: 7 } as const;

test.describe("복사해 새 차수 (04-24 Task 1 — B-02 · B-03 · DR-6)", () => {
  test("담당 PM이 줄 둘인 수주중 프로젝트에서 1차를 두 번 빠르게 눌러도 2차 하나 · 토스트 · 부제 · 표", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      lines: [
        { itemName: "무대 설치", unitPrice: 1_000_000, execution: 600_000 },
        { itemName: "조명 임차", unitPrice: 500_000, execution: 300_000 },
      ],
    });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();

    await page.getByRole("button", { name: "복사해 새 차수" }).click();
    const dialog = page.getByRole("dialog", { name: "복사해 새 차수" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("상세 견적 1차 · 2줄", { exact: true })).toBeVisible();
    await expect(dialog.getByText("1차 2줄을 복사해 2차 · 되돌리기 없음", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /취소/ })).toContainText("취소");

    let actionRequests = 0;
    page.on("request", (request) => {
      if (isServerAction(request)) actionRequests++;
    });
    const created = page.waitForResponse((response) => isServerAction(response.request()));
    await dialog.getByRole("button", { name: /새 차수 만들기/ }).dblclick();
    await created;

    await expect(page.getByRole("status").filter({ hasText: "새 차수 만들기 · 상세 견적 2차" })).toHaveCount(1);
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`${project.number} · 상세 견적 2차`, { exact: true })).toBeVisible();
    await expect(quoteRows(page)).toHaveCount(2);
    expect(await revisionCount(project.id)).toBe(2);
    // 새로 고침(router.refresh)이 서버 액션 POST를 하나 더 보낼 수 있어 차수 수로 한 번임을 본다.
    expect(actionRequests).toBeGreaterThanOrEqual(1);
  });

  test("미저장 편집이 있으면 1차가 aria-disabled + 이유(aria-describedby), Esc로 트리거 복귀, 저장 뒤 켜진다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      lines: [{ itemName: "막힘 확인 줄", unitPrice: 1_000_000, execution: 400_000 }],
    });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await editTextCell(page, 0, COL.itemName, "고친 항목");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    const trigger = page.getByRole("button", { name: "복사해 새 차수" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "복사해 새 차수" });
    const primary = dialog.getByRole("button", { name: /새 차수 만들기/ });
    await expect(primary).toBeFocused();
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    // 막힘 이유는 1차 왼쪽 한 자리에 보이고, 1차의 aria-describedby는 같은 글자의 설명 요소를 가리킨다(04-46 계약 2).
    await expect(dialog.getByText("저장 안 한 편집 1칸 · 먼저 일괄 저장", { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expectDescribedBy(page, primary, "저장 안 한 편집 1칸 · 먼저 일괄 저장");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await quoteCell(page, 0, COL.itemName).focus();
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/저장됨/)).toBeVisible();
    await trigger.click();
    await expect(primary).toBeVisible();
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    expect(await revisionCount(project.id)).toBe(1);
  });

  test("견적 줄 0개(조정 줄 하나)인 차수는 서버 거부가 1차 왼쪽 막힘 자리에, 다이얼로그 유지 · 토스트 없음", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      lines: [{ itemName: "송금 수수료", unitPrice: 0, execution: 20_000, lineKind: "adjustment" }],
    });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);

    await page.getByRole("button", { name: "복사해 새 차수" }).click();
    const dialog = page.getByRole("dialog", { name: "복사해 새 차수" });
    await expect(dialog.getByText("상세 견적 1차 · 0줄", { exact: true })).toBeVisible();
    await expect(dialog.getByText("조정 1줄은 2차에도 그대로", { exact: true })).toBeVisible();
    const rejected = page.waitForResponse((response) => isServerAction(response.request()));
    await dialog.getByRole("button", { name: /새 차수 만들기/ }).click();
    await rejected;
    await expect(dialog.getByText("복사할 견적 줄 없음 · 첫 줄 만들기", { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "새 차수 만들기" })).toHaveCount(0);
    expect(await revisionCount(project.id)).toBe(1);
  });

  test("정산 프로젝트에는 「복사해 새 차수」가 없다(CEO-D10)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "settling",
      lines: [{ itemName: "정산 줄", unitPrice: 1_000_000, execution: 400_000 }],
    });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(quoteRows(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "복사해 새 차수" })).toHaveCount(0);
  });
});
