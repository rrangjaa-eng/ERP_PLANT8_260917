import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, quoteLines, quoteRevisions } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { createRevisionFromCurrent, customerApprovalColumns } from "@/domain/quotes/revisions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { addDays, kstToday } from "@/lib/kst-date";

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
  const clientName = `E2E차수거래처-${randomUUID()}`;
  const client = { ...(await insertVendor(SYSTEM_VIEWER, { name: clientName, normalizedName: clientName.toLowerCase() })), name: clientName };
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
  return { id: created.id, number: created.number, name, revisionId: revision.id, clientId: client.id, clientName: client.name };
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

const COL = { subcategory: 1, itemName: 2, quantity: 4, unitPrice: 5, execution: 7 } as const;

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

  test("다른 탭이 먼저 새 차수를 만들었으면 서버 거부 `다른 사람이 먼저 새 차수를 만듦 · 새로 고침`이 1차 왼쪽 막힘 자리에(B-02 · 검토 S3a)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "선점 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(quoteRows(page)).toHaveCount(1);
    await copyRevision(project.id, project.revisionId);

    await page.getByRole("button", { name: "복사해 새 차수" }).click();
    const dialog = page.getByRole("dialog", { name: "복사해 새 차수" });
    await submitAndWait(page, dialog.getByRole("button", { name: /새 차수 만들기/ }));
    await expect(dialog.getByText("다른 사람이 먼저 새 차수를 만듦 · 새로 고침", { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "새 차수 만들기" })).toHaveCount(0);
    expect(await revisionCount(project.id)).toBe(2);
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

// 04-24 Task 2 — 승인 상태는 도메인 쓰기 함수가 쓰는 같은 컬럼 값(customerApprovalColumns)으로 준비한다.
async function approveInDb(revisionId: string, userId: string, approvedOn = TODAY) {
  await db.update(quoteRevisions).set(customerApprovalColumns(userId, approvedOn)).where(eq(quoteRevisions.id, revisionId));
}

const APPROVAL_FORMAT_ERROR = "날짜 형식이 아닙니다 · 2026-09-18처럼 적어 주세요";
const APPROVED_REASON = "1차 고객 승인됨 · 고치려면 새 차수";
const PM_NAME = "E2E 차수 PM";

function approvalDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "고객 승인 표시", exact: true });
}

async function openApprovalDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "고객 승인 표시", exact: true }).click();
  const dialog = approvalDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function submitAndWait(page: Page, primary: Locator) {
  const answered = page.waitForResponse((response) => isServerAction(response.request()));
  await primary.click();
  await answered;
}

test.describe("고객 승인 표시와 취소 (04-24 Task 2 — ENG-D4 · D7 · D9 · DR-20)", () => {
  test("담당 PM에게 수주중·정산에서 「고객 승인 표시」가 있다(CEO-D19)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const bidding = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "수주중 줄", unitPrice: 100_000, execution: 50_000 }] });
    const settling = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "settling",
      lines: [{ itemName: "정산 줄", unitPrice: 100_000, execution: 50_000 }],
    });
    await login(page, pm);
    for (const project of [bidding, settling]) {
      await page.goto(`/projects/${project.id}`);
      await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
      await expect(page.getByRole("button", { name: "고객 승인 표시", exact: true })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "승인 표시 취소", exact: true })).toHaveCount(0);
    }
  });

  test("담당이 아닌 팀장에게는 두 버튼이 없고, 승인된 차수의 승인일은 보인다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount(TEAM_LEAD_ROLE_ID, team.id, "E2E 차수 팀장");
    const open = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "미승인 줄", unitPrice: 100_000, execution: 50_000 }] });
    const approved = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "승인 줄", unitPrice: 100_000, execution: 50_000 }] });
    await approveInDb(approved.revisionId, pm.userId);
    await login(page, lead);

    await page.goto(`/projects/${open.id}`);
    await expect(page.getByRole("heading", { name: open.name })).toBeVisible();
    await expect(page.getByRole("button", { name: "고객 승인 표시", exact: true })).toHaveCount(0);

    await page.goto(`/projects/${approved.id}`);
    await expect(page.getByText(`고객 승인 ${TODAY} ${PM_NAME}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "승인 표시 취소", exact: true })).toHaveCount(0);
  });

  test("완료 프로젝트에는 두 버튼이 없고 승인일은 부제에 보인다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "completed",
      lines: [{ itemName: "완료 줄", unitPrice: 100_000, execution: 50_000 }],
    });
    await approveInDb(project.revisionId, pm.userId);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText(`고객 승인 ${TODAY} ${PM_NAME}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "고객 승인 표시", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "승인 표시 취소", exact: true })).toHaveCount(0);
  });

  test("승인일 칸이 첫 포커스·기본 오늘 · 비우면 칸 아래 형식 오류로 막힘 · 내일은 서버 거부 · 오늘로 고쳐 통과하면 토스트 없이 제목 포커스·부제", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "승인 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);

    const dialog = await openApprovalDialog(page);
    const date = dialog.getByLabel("승인일");
    const primary = dialog.getByRole("button", { name: /고객 승인 표시/ });
    await expect(date).toBeFocused();
    await expect(date).toHaveValue(TODAY);
    await expect(dialog.getByText(`상세 견적 1차 · 1,000,000`, { exact: true })).toBeVisible();

    await date.fill("");
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.getByText(APPROVAL_FORMAT_ERROR, { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expectDescribedBy(page, primary, APPROVAL_FORMAT_ERROR);

    await date.fill(addDays(TODAY, 1));
    await expect(dialog.getByText(APPROVAL_FORMAT_ERROR, { exact: true })).toHaveCount(0);
    await submitAndWait(page, primary);
    const future = "승인일이 오늘보다 늦음 · 날짜를 고쳐 주세요";
    await expect(dialog.getByText(future, { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(dialog).toBeVisible();

    await date.fill(TODAY);
    await expect(dialog.getByText(future, { exact: true })).toHaveCount(0);
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await submitAndWait(page, primary);

    await expect(dialog).toBeHidden();
    await expect(page.getByText(`고객 승인 ${TODAY} ${PM_NAME}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "승인 표시 취소", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "고객 승인" })).toHaveCount(0);
  });

  test("미저장 편집이 있으면 승인 1차가 aria-disabled + 이유, 저장 뒤 켜진다(ENG-D9)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "막힘 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await editTextCell(page, 0, COL.itemName, "고친 항목");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    let dialog = await openApprovalDialog(page);
    const primary = dialog.getByRole("button", { name: /고객 승인 표시/ });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.getByText("저장 안 한 편집 1칸 · 먼저 일괄 저장", { exact: true }).filter({ visible: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await quoteCell(page, 0, COL.itemName).focus();
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/저장됨/)).toBeVisible();
    dialog = await openApprovalDialog(page);
    await expect(dialog.getByRole("button", { name: /고객 승인 표시/ })).not.toHaveAttribute("aria-disabled", "true");
  });

  test("자기 저장 바로 뒤 승인 제출은 새 기준값으로 통과한다 — 저장이 다시 그린 합계·토큰을 싣는다(ENG-D9 · 검토 S3b)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "저장 뒤 승인 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await editTextCell(page, 0, COL.quantity, "2");
    await quoteCell(page, 0, COL.quantity).focus();
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/저장됨/)).toBeVisible();

    const dialog = await openApprovalDialog(page);
    await expect(dialog.getByText("상세 견적 1차 · 2,000,000", { exact: true })).toBeVisible();
    await submitAndWait(page, dialog.getByRole("button", { name: /고객 승인 표시/ }));
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`고객 승인 ${TODAY} ${PM_NAME}`, { exact: true })).toBeVisible();
  });

  test("견적 금액(quote.amount)을 볼 수 없는 담당 PM에게는 「고객 승인 표시」가 없다(ENG-D9 · 검토 S3c)", async ({ page }) => {
    const team = await makeTeam();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E금액없음-${randomUUID().slice(0, 8)}`, workScope: "company" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "write", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "quote.amount", visible: false });
    const pm = await makeAccount(role.id, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "금액 숨김 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(page.getByText("금액 숨김 줄")).toBeVisible();
    await expect(page.getByRole("button", { name: "고객 승인 표시", exact: true })).toHaveCount(0);
  });

  test("견적 금액(quote.amount)을 볼 수 없으면 차수 표에 「견적 합계」 열이 없다(/design-review P-6 · SYSTEM 정보 노출 — 열이 빠진다)", async ({ page }) => {
    const team = await makeTeam();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E금액없음-${randomUUID().slice(0, 8)}`, workScope: "company" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "quote.amount", visible: false });
    const pm = await makeAccount(role.id, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "차수 금액 숨김 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    const revisions = page.locator("table", { has: page.locator("caption", { hasText: /^차수$/ }) });
    await expect(revisions.getByRole("columnheader", { name: "생성일", exact: true })).toHaveCount(1);
    await expect(revisions.getByRole("columnheader", { name: "견적 합계", exact: true })).toHaveCount(0);
  });

  test("다른 사람이 그새 수량을 바꿔 저장하면 `견적이 바뀜 · 새로 고침`, 승인일 없음 → 새로 고친 뒤 통과(ENG-D9)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "옛 기준 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(quoteRows(page)).toHaveCount(1);

    const [line] = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, project.revisionId));
    if (!line) throw new Error("견적 줄이 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, project.revisionId, {
      rows: [
        {
          id: line.id,
          version: line.version,
          subcategory: line.subcategory,
          itemName: line.itemName,
          quantity: 3,
          unitPrice: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 400_000, fxRate: 1 },
        },
      ],
    });

    let dialog = await openApprovalDialog(page);
    await submitAndWait(page, dialog.getByRole("button", { name: /고객 승인 표시/ }));
    await expect(dialog.getByText("견적이 바뀜 · 새로 고침", { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(page.getByText(`고객 승인 ${TODAY} ${PM_NAME}`, { exact: true })).toHaveCount(0);

    await page.reload();
    dialog = await openApprovalDialog(page);
    await submitAndWait(page, dialog.getByRole("button", { name: /고객 승인 표시/ }));
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`고객 승인 ${TODAY} ${PM_NAME}`, { exact: true })).toBeVisible();
  });

  test("서버 거부가 아닌 실패(요청 끊김)는 세 다이얼로그 모두 1차 왼쪽 막힘 자리에 `처리하지 못함 · 닫고 다시 시도`(검토 S5)", async ({ page }) => {
    const FAILED = "처리하지 못함 · 닫고 다시 시도";
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "끊김 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await login(page, pm);
    await page.route(`**/projects/${project.id}`, async (route) => {
      if (isServerAction(route.request())) await route.abort();
      else await route.continue();
    });
    await page.goto(`/projects/${project.id}`);
    await expect(quoteRows(page)).toHaveCount(1);

    await page.getByRole("button", { name: "복사해 새 차수" }).click();
    let dialog = page.getByRole("dialog", { name: "복사해 새 차수" });
    await dialog.getByRole("button", { name: /새 차수 만들기/ }).click();
    await expect(dialog.getByText(FAILED, { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    dialog = await openApprovalDialog(page);
    await dialog.getByRole("button", { name: /고객 승인 표시/ }).click();
    await expect(dialog.getByText(FAILED, { exact: true }).filter({ visible: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await approveInDb(project.revisionId, pm.userId);
    await page.reload();
    await page.getByRole("button", { name: "승인 표시 취소", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "고객 승인 표시 취소" });
    await dialog.getByRole("button", { name: /승인 표시 취소/ }).click();
    await expect(dialog.getByText(FAILED, { exact: true }).filter({ visible: true })).toHaveCount(1);
    expect(await revisionCount(project.id)).toBe(1);
  });

  test("견적 줄 0개 차수의 승인은 `승인할 견적 줄이 없음 · 첫 줄 만들기`로 막힌다(ENG-D4)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [] });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);

    const dialog = await openApprovalDialog(page);
    await submitAndWait(page, dialog.getByRole("button", { name: /고객 승인 표시/ }));
    await expect(dialog.getByText("승인할 견적 줄이 없음 · 첫 줄 만들기", { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(dialog).toBeVisible();
  });

  test("승인 차수: 수량·소분류는 이유 한 줄로 막히고 표 위 줄도 같은 글자 · 실행가는 저장 · 새 줄의 수량·단가는 잠김(ENG-D7)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "잠김 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await approveInDb(project.revisionId, pm.userId);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText(APPROVED_REASON, { exact: true })).toHaveCount(1);

    for (const col of [COL.quantity, COL.subcategory]) {
      const cell = quoteCell(page, 0, col);
      await expect(async () => {
        await cell.focus();
        await page.keyboard.press("Enter");
        await expect(cell.getByText(APPROVED_REASON, { exact: true })).toBeVisible({ timeout: 1000 });
      }).toPass();
      await expect(cell.locator("input, select")).toHaveCount(0);
    }

    await editTextCell(page, 0, COL.execution, "450000");
    const saved = page.waitForResponse((response) => isServerAction(response.request()));
    await quoteCell(page, 0, COL.execution).focus();
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.getByText(/저장됨/)).toBeVisible();
    await page.reload();
    await expect(quoteCell(page, 0, COL.execution)).toHaveText(/^450,000/);

    await page.getByRole("button", { name: "줄 추가", exact: true }).click();
    await expect(quoteRows(page)).toHaveCount(2);
    const added = quoteRows(page).last();
    await expect(added.getByRole("gridcell").nth(COL.quantity)).toHaveAttribute("aria-readonly", "true");
    await expect(added.getByRole("gridcell").nth(COL.unitPrice)).toHaveAttribute("aria-readonly", "true");
    await expect(added.getByRole("gridcell").nth(COL.itemName)).toHaveAttribute("aria-readonly", "false");
  });

  test("「승인 표시 취소」 다이얼로그는 rev 5 글자이고, 취소하면 승인일이 사라지고 수량이 다시 편집된다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "취소 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await approveInDb(project.revisionId, pm.userId);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(quoteCell(page, 0, COL.quantity)).toHaveAttribute("aria-readonly", "true");

    await page.getByRole("button", { name: "승인 표시 취소", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "고객 승인 표시 취소" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`상세 견적 1차 · 승인일 ${TODAY}`, { exact: true })).toBeVisible();
    await expect(dialog.getByText("승인일 지워짐 · 이 차수의 지출결의가 다시 막힘", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^닫기/ }).filter({ hasText: "Esc" })).toBeVisible();

    await submitAndWait(page, dialog.getByRole("button", { name: /승인 표시 취소/ }));
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`고객 승인 ${TODAY} ${PM_NAME}`, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "고객 승인 표시", exact: true })).toBeVisible();
    await expect(quoteCell(page, 0, COL.quantity)).toHaveAttribute("aria-readonly", "false");
    await expect(page.getByText(APPROVED_REASON, { exact: true })).toHaveCount(0);
  });
});

// 04-24 Task 3 — 차수 준비. 줄이 없는 차수는 DB 행으로(준비 SQL), 줄을 복사하는 차수는 도메인 함수로 만든다.
async function addEmptyRevision(projectId: string, seq: number): Promise<string> {
  const [row] = await db.insert(quoteRevisions).values({ projectId, seq }).returning({ id: quoteRevisions.id });
  if (!row) throw new Error("차수를 넣지 못했습니다");
  return row.id;
}

async function copyRevision(projectId: string, fromRevisionId: string): Promise<string> {
  return (await createRevisionFromCurrent(SYSTEM_VIEWER, { projectId, fromRevisionId })).revisionId;
}

function revisionTable(page: Page): Locator {
  return page.locator("table", { has: page.locator("caption", { hasText: /^차수$/ }) });
}

function previousTable(page: Page, seq: number): Locator {
  return page.locator("table", { has: page.locator("caption", { hasText: new RegExp(`^상세 견적 ${seq}차 견적 줄$`) }) });
}

// 데이터 행(칸이 둘 이상)의 칸 글자. 그룹 머리·폰 접힌 줄(칸 하나)은 뺀다.
async function dataRowTexts(table: Locator): Promise<string[][]> {
  return table.locator("tbody tr").evaluateAll((rows) =>
    rows
      .filter((row) => (row as HTMLTableRowElement).cells.length > 1)
      .map((row) => Array.from((row as HTMLTableRowElement).cells).map((cell) => (cell.textContent ?? "").trim())),
  );
}

test.describe("차수 섹션과 이전 차수 읽기 섹션 (04-24 Task 3 — S5 · U-2 · DR-13)", () => {
  test("차수 셋(1차 승인 · 2차 · 3차 최신) → 3차·2차·1차, 상태 현재·빈 칸·승인, 3차 동작 빈 칸 · 차수 하나면 「차수 열기」 없음", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "차수 줄", unitPrice: 100_000, execution: 50_000 }] });
    await approveInDb(project.revisionId, pm.userId);
    await addEmptyRevision(project.id, 2);
    await addEmptyRevision(project.id, 3);
    const single = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "한 차수 줄", unitPrice: 100_000, execution: 50_000 }] });
    await login(page, pm);

    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: "차수", exact: true })).toBeVisible();
    const table = revisionTable(page);
    await expect(table).toBeVisible();
    await expect(table).not.toHaveAttribute("role", "grid");
    const rows = await dataRowTexts(table);
    expect(rows.map((cells) => cells[0])).toEqual(["3차", "2차", "1차"]);
    expect(rows.map((cells) => cells[4])).toEqual(["현재", "", "승인"]);
    expect(rows[0]?.[5]).toBe("");
    const openButtons = table.getByRole("button", { name: "차수 열기" });
    await expect(openButtons).toHaveCount(2);
    await expect(openButtons.first()).toHaveAttribute("aria-expanded", "false");

    await page.goto(`/projects/${single.id}`);
    await expect(revisionTable(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "차수 열기" })).toHaveCount(0);
  });

  test("U-2 ⓐ·ⓑ — 최신이면서 승인된 2차는 `승인`만, 1차는 빈 칸 · 폰 접힌 줄이 빈 상태 자리를 건너뛴다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "U-2 줄", unitPrice: 100_000, execution: 50_000 }] });
    const second = await addEmptyRevision(project.id, 2);
    await approveInDb(second, pm.userId);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);

    const table = revisionTable(page);
    const rows = await dataRowTexts(table);
    expect(rows.map((cells) => cells[4])).toEqual(["승인", ""]);
    expect(rows[0]?.[5]).toBe("");
    await expect(table.getByText("현재", { exact: true })).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.reload();
    const folded = await revisionTable(page)
      .locator("tbody tr")
      .evaluateAll((trs) =>
        trs.filter((row) => (row as HTMLTableRowElement).cells.length === 1).map((row) => (row.textContent ?? "").trim()),
      );
    expect(folded.every((text) => !text.startsWith("·"))).toBe(true);
    expect(folded).toContain(`${TODAY} · 1줄`);
  });

  test("「차수 열기」 → 버튼 토글 · 제목 포커스 · 캡션 읽기 표(편집·저장 없음) · 머리글 순서 · 한 번에 하나 · 닫으면 버튼 포커스 · 다시 열어도 요청 없음", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      lines: [
        { itemName: "1차 무대", unitPrice: 1_000_000, execution: 600_000 },
        { itemName: "1차 조명", unitPrice: 500_000, execution: 300_000 },
      ],
    });
    const second = await copyRevision(project.id, project.revisionId);
    await copyRevision(project.id, second);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(quoteRows(page)).toHaveCount(2);

    const table = revisionTable(page);
    const rowOf = (seq: number) => table.locator("tbody tr").filter({ has: page.getByRole("cell", { name: `${seq}차`, exact: true }) });
    let requests = 0;
    page.on("request", (request) => {
      if (isServerAction(request)) requests++;
    });

    const open1 = rowOf(1).getByRole("button");
    await open1.click();
    await expect(open1).toHaveAttribute("aria-expanded", "true");
    await expect(open1).toHaveText("차수 닫기");
    const heading1 = page.getByRole("heading", { name: "상세 견적 1차", exact: true });
    await expect(heading1).toBeFocused();
    const readTable = previousTable(page, 1);
    await expect(readTable).toBeVisible();
    await expect(readTable).not.toHaveAttribute("role", "grid");
    await expect(readTable.getByText("1차 무대", { exact: true })).toBeVisible();
    const controls = await open1.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const section = page.locator(`[id="${controls}"]`).locator("xpath=ancestor-or-self::section[1]");
    await expect(section.locator("input, select, textarea")).toHaveCount(0);
    await expect(section.getByRole("button")).toHaveCount(0);
    await expect(section.getByText("조정", { exact: true })).toHaveCount(0);
    const currentHeaders = await quoteTable(page).locator("thead th").allTextContents();
    expect(await readTable.locator("thead th").allTextContents()).toEqual(currentHeaders);
    expect(requests).toBe(1);

    const open2 = rowOf(2).getByRole("button");
    await open2.click();
    await expect(page.getByRole("heading", { name: "상세 견적 2차", exact: true })).toBeFocused();
    await expect(heading1).toHaveCount(0);
    await expect(open1).toHaveText("차수 열기");
    await expect(open1).toHaveAttribute("aria-expanded", "false");

    await open2.click();
    await expect(page.getByRole("heading", { name: "상세 견적 2차", exact: true })).toHaveCount(0);
    await expect(open2).toBeFocused();
    await expect(open2).toHaveText("차수 열기");

    const before = requests;
    await open1.click();
    await expect(previousTable(page, 1)).toBeVisible();
    await expect(readTable.getByText("1차 무대", { exact: true })).toBeVisible();
    expect(requests).toBe(before);
  });

  test("현재 표 셀 하나를 고친 채 차수를 열고 닫아도 「일괄 저장 1」 · 고친 값 · URL 그대로(DR-13)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "원장 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await copyRevision(project.id, project.revisionId);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await editTextCell(page, 0, COL.itemName, "고친 원장 줄");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    const url = page.url();

    // 라벨이 「차수 닫기」로 바뀌므로 이름이 아니라 1차 행의 버튼으로 잡는다(이전 차수가 하나뿐이다).
    const toggle = revisionTable(page).locator("tbody").getByRole("button");
    await expect(toggle).toHaveText("차수 열기");
    await toggle.click();
    await expect(previousTable(page, 1)).toBeVisible();
    await toggle.click();
    await expect(previousTable(page, 1)).toHaveCount(0);

    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    await expect(quoteCell(page, 0, COL.itemName)).toHaveText(/^고친 원장 줄/);
    expect(page.url()).toBe(url);
  });

  test("줄을 받는 동안 이전 차수 읽기 섹션은 aria-busy이고, 받으면 풀린다(검토 N3)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "받는 중 섹션 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await copyRevision(project.id, project.revisionId);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(quoteRows(page)).toHaveCount(1);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/projects/${project.id}`, async (route) => {
      if (isServerAction(route.request())) await held;
      await route.continue();
    });

    await revisionTable(page).getByRole("button", { name: "차수 열기" }).click();
    const section = page.locator("section", { has: page.getByRole("heading", { name: "상세 견적 1차", exact: true }) });
    await expect(section).toHaveAttribute("aria-busy", "true");
    release();
    await expect(previousTable(page, 1)).toBeVisible();
    await expect(section).not.toHaveAttribute("aria-busy", "true");
  });

  test("첫 요청이 끊기면 섹션 자리에 `1차 불러오지 못함` + 「다시 시도」, 원장 무영향 → 다시 시도하면 읽기 표", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "오류 확인 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await copyRevision(project.id, project.revisionId);
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(quoteRows(page)).toHaveCount(1);

    let aborted = false;
    await page.route(`**/projects/${project.id}`, async (route) => {
      if (!aborted && isServerAction(route.request())) {
        aborted = true;
        await route.abort();
        return;
      }
      await route.continue();
    });

    await revisionTable(page).getByRole("button", { name: "차수 열기" }).click();
    await expect(page.getByText("1차 불러오지 못함", { exact: true })).toBeVisible();
    await expect(previousTable(page, 1)).toHaveCount(0);
    await expect(quoteRows(page)).toHaveCount(1);

    await page.getByRole("button", { name: "다시 시도" }).click();
    await expect(previousTable(page, 1)).toBeVisible();
    await expect(page.getByText("1차 불러오지 못함", { exact: true })).toHaveCount(0);
  });

  test("31줄 이전 차수는 합계 행 `31줄` · 번호 1~30 · 2쪽 31 · 0줄 이전 차수는 `이 차수에 견적 줄이 없습니다`(버튼 없음)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lines = Array.from({ length: 31 }, (_, index) => ({ itemName: `긴 차수 ${index + 1}`, unitPrice: 10_000, execution: 5_000 }));
    const long = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines });
    await copyRevision(long.id, long.revisionId);
    const empty = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [] });
    await addEmptyRevision(empty.id, 2);
    await login(page, pm);

    await page.goto(`/projects/${long.id}`);
    await revisionTable(page).getByRole("button", { name: "차수 열기" }).click();
    const readTable = previousTable(page, 1);
    await expect(readTable.locator("tfoot")).toContainText("합계 (공급가액 · 31줄)");
    // 04-19(W2) — 30줄 쪽 나눔: 1쪽 1~30, 2쪽 31(번호는 이어 센다).
    const numbers = (await dataRowTexts(readTable)).map((cells) => cells[0]);
    expect(numbers).toEqual(Array.from({ length: 30 }, (_, index) => String(index + 1)));
    await page.getByRole("navigation", { name: "상세 견적 1차 견적 줄 페이지", exact: true }).getByRole("button", { name: "2", exact: true }).click();
    await expect(readTable.locator("tbody tr").first()).toBeVisible();
    await expect.poll(async () => (await dataRowTexts(readTable)).map((cells) => cells[0])).toEqual(["31"]);
    await expect(readTable.locator("tfoot")).toContainText("합계 (공급가액 · 31줄)");

    await page.goto(`/projects/${empty.id}`);
    await revisionTable(page).getByRole("button", { name: "차수 열기" }).click();
    await expect(page.getByText("이 차수에 견적 줄이 없습니다", { exact: true })).toBeVisible();
    const heading = page.getByRole("heading", { name: "상세 견적 1차", exact: true });
    await expect(heading).toBeFocused();
    await expect(page.locator("section", { has: heading }).getByRole("button")).toHaveCount(0);
  });
});

// 04-24 Task 4 — 이전 차수 보관본(D-68 모양: `{줄 id}:{열}` → 값). 준비는 같은 보관소 키에 직접 쓴다.
async function lineIdsOf(revisionId: string): Promise<string[]> {
  return (await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.revisionId, revisionId))).map((row) => row.id);
}

async function seedDraft(page: Page, projectId: string, revisionId: string, edits: Record<string, unknown>) {
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`quote-ledger:dirty:${projectId}:${revisionId}`, JSON.stringify(edits)] as const,
  );
}

async function storedDraftKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith("quote-ledger:dirty:")));
}

// 앱의 「복사」가 쓰는 두 형식을 window의 copy 리스너로 읽는다(클립보드 권한 불필요).
async function captureCopies(page: Page) {
  await page.evaluate(() => {
    const target = window as unknown as { __copies: { text: string; json: string }[] };
    target.__copies = [];
    window.addEventListener("copy", (event) => {
      target.__copies.push({
        text: event.clipboardData?.getData("text/plain") ?? "",
        json: event.clipboardData?.getData("application/x-plant8-quote-lines+json") ?? "",
      });
    });
  });
}

async function copiesOf(page: Page): Promise<{ text: string; json: string }[]> {
  return page.evaluate(() => (window as unknown as { __copies: { text: string; json: string }[] }).__copies);
}

function previousDraftRow(page: Page, seq: number): Locator {
  return page.locator("p", { hasText: new RegExp(`^${seq}차 저장 안 한 편집`) });
}

test.describe("이전 차수 보관본 복원 줄 (04-24 Task 4 — DR-4 · DR-31)", () => {
  test("두 탭: A의 미저장 편집이 B의 새 차수로 밀려나면 A에 `1차 저장 안 한 편집 1칸 · 복사 / 버림` → 복사 → 2차 표에 붙여넣기 → 버림", async ({ page, context }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "1차 항목", unitPrice: 1_000_000, execution: 400_000 }] });
    await db.update(quoteLines).set({ vendorId: project.clientId }).where(eq(quoteLines.revisionId, project.revisionId));
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await editTextCell(page, 0, COL.itemName, "고친 1차 항목");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    await expect.poll(() => storedDraftKeys(page)).toEqual([`quote-ledger:dirty:${project.id}:${project.revisionId}`]);

    const tabB = await context.newPage();
    await tabB.goto(`/projects/${project.id}`);
    await tabB.getByRole("button", { name: "복사해 새 차수" }).click();
    const created = tabB.waitForResponse((response) => isServerAction(response.request()));
    await tabB.getByRole("dialog", { name: "복사해 새 차수" }).getByRole("button", { name: /새 차수 만들기/ }).click();
    await created;
    await expect(tabB.getByText(`${project.number} · 상세 견적 2차`, { exact: true })).toBeVisible();
    await tabB.close();

    await page.reload();
    await expect(page.getByText(`${project.number} · 상세 견적 2차`, { exact: true })).toBeVisible();
    const row = previousDraftRow(page, 1);
    await expect(row).toHaveText(/^1차 저장 안 한 편집 1칸/);
    // 복원 줄이 보이면 그 차수 줄을 한 번 받아 둔다(「복사」가 클릭 안에서 동기로 쓴다) — 받는 동안 「복사」는 진행 중이다(검토 S2).
    await expect(row.getByRole("button", { name: "복사" })).not.toHaveAttribute("aria-disabled", "true");
    await expect(row.getByRole("button", { name: "버림" })).toBeVisible();

    await captureCopies(page);
    await row.getByRole("button", { name: "복사" }).click();
    await expect(row.getByText("복사됨 1칸", { exact: true })).toBeVisible();
    await expect(row).toBeVisible();
    const [copied] = await copiesOf(page);
    expect(copied).toBeDefined();
    expect(JSON.parse(copied!.json)).toEqual([{ currency: "KRW" }]);
    const lines = copied!.text.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    const cells = lines[0]!.split("\t");
    expect(cells[2]).toBe("고친 1차 항목");

    // 입력 열(소분류 → 단가)만 text/plain으로 — 계산 열 무시 규칙(04-47)에 기대지 않는다.
    await quoteCell(page, 0, COL.subcategory).focus();
    await page.evaluate((text) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, cells.slice(1, 6).join("\t"));
    await expect(quoteCell(page, 0, COL.itemName)).toHaveText(/^고친 1차 항목/);
    await expect(page.getByRole("button", { name: /일괄 저장 [1-9]/ })).toBeVisible();
    await expect(quoteTable(page).locator('[aria-invalid="true"]')).toHaveCount(0);

    await row.getByRole("button", { name: "버림" }).click();
    await expect(previousDraftRow(page, 1)).toHaveCount(0);
    expect(await storedDraftKeys(page)).not.toContain(`quote-ledger:dirty:${project.id}:${project.revisionId}`);
  });

  test("execCommand가 거짓이면 「복사」 옆 `복사하지 못함`, 줄·보관본 그대로 · 이전 차수 읽기 섹션에는 복원 줄이 없다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "실패 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await copyRevision(project.id, project.revisionId);
    const [lineId] = await lineIdsOf(project.revisionId);
    await login(page, pm);
    await seedDraft(page, project.id, project.revisionId, { [`${lineId}:itemName`]: "보관된 항목" });
    await page.goto(`/projects/${project.id}`);

    const row = previousDraftRow(page, 1);
    await expect(row).toHaveText(/^1차 저장 안 한 편집 1칸/);
    // 줄을 받은 뒤라야 실패가 execCommand 때문임을 본다(받는 동안 「복사」는 진행 중 — 검토 S2).
    await expect(row.getByRole("button", { name: "복사" })).not.toHaveAttribute("aria-disabled", "true");
    await page.evaluate(() => {
      document.execCommand = () => false;
    });
    await row.getByRole("button", { name: "복사" }).click();
    await expect(row.getByText("복사하지 못함", { exact: true })).toBeVisible();
    await expect(row.getByText("복사됨", { exact: false })).toHaveCount(0);
    expect(await storedDraftKeys(page)).toContain(`quote-ledger:dirty:${project.id}:${project.revisionId}`);

    await revisionTable(page).locator("tbody").getByRole("button").click();
    const heading = page.getByRole("heading", { name: "상세 견적 1차", exact: true });
    await expect(previousTable(page, 1)).toBeVisible();
    await expect(page.locator("section", { has: heading }).getByText(/저장 안 한 편집/)).toHaveCount(0);
  });

  test("차수와 무관한 기간 칸만 든 이전 차수 보관본은 이전 차수 줄이 아니라 현재 차수 복원 줄로 돌아온다(검토 B1)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "기간 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await copyRevision(project.id, project.revisionId);
    const end = addDays(TODAY, 40);
    await login(page, pm);
    // 검토 8 — 기간 칸 보관본은 보관 시점 기준값(`period:base`)과 함께 쓰인다(기준값 없는 옛 보관본은 복원하지 않는다).
    await seedDraft(page, project.id, project.revisionId, { "period:end": end, "period:base": { startDate: null, endDate: null } });
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText(`${project.number} · 상세 견적 2차`, { exact: true })).toBeVisible();

    const current = page.locator("p", { hasText: /^저장 안 한 편집 1칸/ });
    await expect(current).toBeVisible();
    await expect(previousDraftRow(page, 1)).toHaveCount(0);
    await current.getByRole("button", { name: "복원" }).click();
    await expect(page.getByLabel("종료일")).toHaveValue(end);
  });

  test("이전 차수 보관본의 줄이 그 차수에 하나도 없으면 「복사」는 `복사하지 못함` — 빈 복사를 성공으로 보이지 않는다(검토 B1)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "남은 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await copyRevision(project.id, project.revisionId);
    await login(page, pm);
    await seedDraft(page, project.id, project.revisionId, { [`${randomUUID()}:itemName`]: "없는 줄의 편집" });
    await page.goto(`/projects/${project.id}`);

    const row = previousDraftRow(page, 1);
    await expect(row).toHaveText(/^1차 저장 안 한 편집 1칸/);
    const copy = row.getByRole("button", { name: "복사" });
    await expect(copy).not.toHaveAttribute("aria-disabled", "true");
    await copy.click();
    await expect(row.getByText("복사하지 못함", { exact: true })).toBeVisible();
    await expect(row.getByText(/복사됨/)).toHaveCount(0);
  });

  test("그 차수 줄을 받는 동안 「복사」는 진행 중(`…` · aria-disabled)이고 눌러도 `복사하지 못함`이 없다 — 받으면 켜진다(검토 S2)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "받는 중 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    await copyRevision(project.id, project.revisionId);
    const [lineId] = await lineIdsOf(project.revisionId);
    await login(page, pm);
    await seedDraft(page, project.id, project.revisionId, { [`${lineId}:itemName`]: "보관된 항목" });
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/projects/${project.id}`, async (route) => {
      if (isServerAction(route.request())) await held;
      await route.continue();
    });
    await page.goto(`/projects/${project.id}`);

    const row = previousDraftRow(page, 1);
    await expect(row).toHaveText(/^1차 저장 안 한 편집 1칸/);
    const copy = row.getByRole("button", { name: "복사" });
    await expect(copy).toHaveAttribute("aria-disabled", "true");
    await expect(copy).toHaveText("복사…");
    // aria-disabled 버튼은 Playwright가 기다리므로 강제로 누른다 — 누름이 무시되는지 본다.
    await copy.click({ force: true });
    await expect(row.getByText("복사하지 못함", { exact: true })).toHaveCount(0);

    release();
    await expect(copy).not.toHaveAttribute("aria-disabled", "true");
    await captureCopies(page);
    await copy.click();
    await expect(row.getByText("복사됨 1칸", { exact: true })).toBeVisible();
  });

  test("다른 차수 보관본이 둘(1차·2차, 현재 3차)이면 `2차 …` 하나 · 순서 현재 복원 → 이전 차수 → 잠김 · 버리면 `1차 …`", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const project = await makeProject({ teamId: team.id, pmUserId: pm.userId, lines: [{ itemName: "셋째 차수 줄", unitPrice: 1_000_000, execution: 400_000 }] });
    const second = await copyRevision(project.id, project.revisionId);
    const third = await copyRevision(project.id, second);
    await approveInDb(third, pm.userId);
    const [first1] = await lineIdsOf(project.revisionId);
    const [second1] = await lineIdsOf(second);
    const [third1] = await lineIdsOf(third);
    await login(page, pm);
    await seedDraft(page, project.id, project.revisionId, { [`${first1}:itemName`]: "1차 보관" });
    await seedDraft(page, project.id, second, { [`${second1}:itemName`]: "2차 보관", [`${second1}:note`]: "2차 비고" });
    await seedDraft(page, project.id, third, { [`${third1}:execution`]: 500_000 });
    await page.goto(`/projects/${project.id}`);

    const current = page.locator("p", { hasText: /^저장 안 한 편집 1칸/ });
    const previous = previousDraftRow(page, 2);
    const lock = page.getByText("3차 고객 승인됨 · 고치려면 새 차수", { exact: true });
    await expect(current).toBeVisible();
    await expect(previous).toHaveText(/^2차 저장 안 한 편집 2칸/);
    await expect(previousDraftRow(page, 1)).toHaveCount(0);
    await expect(lock).toBeVisible();
    const order = await page.evaluate(
      ([a, b, c]) => {
        const find = (text: string) => Array.from(document.querySelectorAll("p")).find((node) => node.textContent?.startsWith(text));
        const [x, y, z] = [find(a), find(b), find(c)];
        if (!x || !y || !z) return false;
        return Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(y.compareDocumentPosition(z) & Node.DOCUMENT_POSITION_FOLLOWING);
      },
      ["저장 안 한 편집 1칸", "2차 저장 안 한 편집", "3차 고객 승인됨"] as const,
    );
    expect(order).toBe(true);

    await previous.getByRole("button", { name: "버림" }).click();
    await expect(previousDraftRow(page, 2)).toHaveCount(0);
    await expect(previousDraftRow(page, 1)).toHaveText(/^1차 저장 안 한 편집 1칸/);
  });
});
