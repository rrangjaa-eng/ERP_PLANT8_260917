import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, quoteLines, quoteRevisions } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { customerApprovalColumns } from "@/domain/quotes/revisions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
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
