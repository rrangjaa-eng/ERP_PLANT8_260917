import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { listArchive } from "@/domain/archive";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { addDays, kstToday } from "@/lib/kst-date";

// 04-23(D-83 · D-48 · D-93 · UI-SPEC rev 5 S4) — 줄 종류(조정 · 견적 외 비용)의 화면. 서버 규칙은 04-13.
// 경영관리는 시드 계급에 없어 이 스펙이 새 계급을 만들어 권한을 준다(04-13 통합 테스트와 같은 준비 — 시드 계급을
// 바꾸지 않아 같은 DB를 쓰는 다른 스펙에 번지지 않는다).
const TODAY = kstToday(new Date());

// 열 순서(quote-table.tsx) — 번호 · 소분류 · 항목 · 거래처 · 수량 · 단가 · 견적가 · 실행가 · 차익 · 상태 · 비고.
const COL = { subcategory: 1, itemName: 2, vendor: 3, quantity: 4, unitPrice: 5, quoteAmount: 6, execution: 7, status: 9, note: 10 } as const;

type Account = { userId: string; email: string; password: string };

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

async function makeAccount(roleId: string, teamId: string, name = "E2E 줄 종류"): Promise<Account> {
  const email = `e2e-kind-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

// 경영관리 — `projects` 보기 · `projects.adjustment` 쓰기만(`projects` 쓰기 없음).
async function makeAdjuster(teamId: string): Promise<Account> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E경영관리-${randomUUID().slice(0, 8)}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.adjustment", action: "write", allowed: true });
  for (const infoItem of ["project.value", "quote.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return makeAccount(role.id, teamId, "E2E 경영관리");
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

type SeedLine = { itemName: string; unitPrice: number; execution: number; lineKind?: "quote" | "adjustment" };

// 줄은 수주중(생성 직후)일 때 도메인 함수로 넣고, 그 뒤 상태를 DB에 둔다(quote-edit-scope.spec.ts와 같은 준비).
// 조정 줄은 시스템 뷰어(모든 권한)로 넣는다 — 줄 순서는 넣은 순서다.
async function makeProject(input: { teamId: string; pmUserId: string; status: string; endDate: string; lines: SeedLine[] }) {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `E2E종류거래처-${randomUUID()}`,
    normalizedName: `e2e종류거래처-${randomUUID()}`,
  });
  const name = `E2E종류-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: input.teamId,
    pmUserId: input.pmUserId,
    name,
    startDate: addDays(input.endDate, -10),
    endDate: input.endDate,
  });
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
  await db.update(projects).set({ status: input.status }).where(eq(projects.id, created.id));
  return { id: created.id, name, clientName: client.name, subcategory };
}

function isSaveAction(method: string, headers: Record<string, string>): boolean {
  return method === "POST" && headers["next-action"] !== undefined;
}

function waitForSaveResponse(page: Page) {
  return page.waitForResponse((response) => isSaveAction(response.request().method(), response.request().headers()));
}

// 표의 데이터 행(그룹 머리글 행·접힌 줄 제외) — 격자면 gridcell, 읽기 표면 td.
function dataRows(page: Page): Locator {
  return page.getByRole("table", { name: "견적 줄" }).or(page.getByRole("grid", { name: "견적 줄" })).locator("tbody tr:not([class*='groupRow']):not([class*='collapsedRow'])");
}

function cell(page: Page, rowIndex: number, colIndex: number): Locator {
  return dataRows(page).nth(rowIndex).locator("> td").nth(colIndex);
}

function groupHeaders(page: Page): Locator {
  return page.locator("tbody tr[class*='groupRow'] td");
}

const CAP_REASON = "300줄 상한 · 상한은 관리자 설정";
const EMPTY_MESSAGE = "이 프로젝트에 견적 줄이 없습니다";

// 수화 전에 준 포커스는 격자가 받지 못한다 — 그 셀이 탭 정지가 될 때까지 다시 준다(quote-edit-scope.spec.ts와 같다).
async function focusGridCell(target: Locator) {
  await expect(async () => {
    await target.evaluate((element) => (element as HTMLElement).blur());
    await target.focus();
    await expect(target).toHaveAttribute("tabindex", "0", { timeout: 1_000 });
  }).toPass();
}

async function pasteIntoFocusedCell(page: Page, text: string) {
  await page.evaluate((clipboardText) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", clipboardText);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

// 조정 줄과 견적 줄이 있는 프로젝트를 담당 PM 또는 경영관리로 연다.
async function openProject(page: Page, input: { as: "pm" | "adjuster"; status: string; endDate: string; lines: SeedLine[] }) {
  const team = await makeTeam();
  const pm = await makeAccount(DEFAULT_ROLE_ID, team);
  const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: input.status, endDate: input.endDate, lines: input.lines });
  await login(page, input.as === "pm" ? pm : await makeAdjuster(team));
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  return project;
}

async function fillLinesBySql(projectId: string, count: number) {
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, projectId);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("소분류 코드가 없습니다");
  await db.execute(sql`
    INSERT INTO quote_lines (revision_id, sort_order, subcategory, item_name, unit_price_amount_krw, execution_amount_krw, quote_amount_krw, profit_krw)
    SELECT ${revision.id}, g, ${subcategory.value}, '상한 줄 ' || g, 1000, 500, 1000, 500 FROM generate_series(1, ${count}) AS g
  `);
}

test.describe("견적 줄 종류 — 조정 · 견적 외 비용 화면 (04-23, PROJ-02 · D-83 · D-48)", () => {
  test("트레이서 — 조정 권한만 있는 경영관리가 완료 프로젝트에 거래처를 고른 조정 줄을 넣으면 맨 아래 조정 그룹 · 합계 · 목록에 반영된다", async ({ page }) => {
    // 1100 — 합계 행에 차익 합계가 보이는 폭(1024 이상이라 편집 폭이다).
    await page.setViewportSize({ width: 1100, height: 800 });
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const adjuster = await makeAdjuster(team);
    const project = await makeProject({
      teamId: team,
      pmUserId: pm.userId,
      status: "completed",
      endDate: addDays(TODAY, -20),
      lines: [
        { itemName: "완료 가 줄", unitPrice: 100_000, execution: 50_000 },
        { itemName: "완료 나 줄", unitPrice: 200_000, execution: 100_000 },
      ],
    });

    await login(page, adjuster);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    const footer = page.locator("tfoot");
    await expect(footer).toContainText("차익 150,000");

    await page.getByRole("button", { name: "조정 줄 추가" }).click();
    // 새 줄의 실행가 편집기가 열린다.
    const execution = page.getByRole("textbox", { name: "실행가" });
    await expect(execution).toBeFocused();
    await execution.fill("120000");
    await page.keyboard.press("Enter");

    await expect(dataRows(page)).toHaveCount(3);
    await expect(groupHeaders(page).last()).toHaveText("조정");
    const adjustmentRow = 2;
    await expect(cell(page, adjustmentRow, COL.subcategory)).toHaveText("조정");

    await cell(page, adjustmentRow, COL.itemName).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "항목", exact: true }).fill("외화 송금 수수료");
    await page.keyboard.press("Enter");

    // B-23 — 조정 권한만 있어도 거래처 목록이 비어 있지 않다.
    await cell(page, adjustmentRow, COL.vendor).focus();
    await page.keyboard.press("Enter");
    const vendorSelect = page.getByRole("combobox", { name: "거래처" });
    await expect(vendorSelect.locator("option", { hasText: project.clientName })).toHaveCount(1);
    await vendorSelect.selectOption({ label: project.clientName });

    const saved = waitForSaveResponse(page);
    await cell(page, adjustmentRow, COL.execution).focus();
    await page.keyboard.press("Control+s");
    await saved;
    await expect(footer.getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(groupHeaders(page).last()).toHaveText("조정");
    await expect(dataRows(page)).toHaveCount(3);
    await expect(cell(page, adjustmentRow, COL.itemName)).toHaveText("외화 송금 수수료");
    await expect(cell(page, adjustmentRow, COL.vendor)).toHaveText(project.clientName);
    await expect(cell(page, adjustmentRow, COL.execution)).toHaveText("120,000");
    // 실행가 +120,000 → 차익(견적 − 실행가) −120,000.
    await expect(footer).toContainText("차익 30,000");

    await page.goto(`/projects?q=${encodeURIComponent(project.name)}`);
    await expect(page.getByText(/실행가 270,000/)).toBeVisible();
  });
  test("PM — 완료 프로젝트의 조정 행이 같은 표 맨 아래 조정 그룹에 보이고 「조정 줄 추가」가 없다(T-04-66)", async ({ page }) => {
    await openProject(page, {
      as: "pm",
      status: "completed",
      endDate: addDays(TODAY, -20),
      lines: [
        { itemName: "완료 견적 줄", unitPrice: 100_000, execution: 50_000 },
        { itemName: "완료 조정 줄", unitPrice: 0, execution: 30_000, lineKind: "adjustment" },
      ],
    });
    await expect(dataRows(page)).toHaveCount(2);
    await expect(groupHeaders(page).last()).toHaveText("조정");
    await expect(cell(page, 1, COL.itemName)).toHaveText("완료 조정 줄");
    await expect(cell(page, 1, COL.execution)).toHaveText("30,000");
    await expect(cell(page, 1, COL.quantity)).toHaveText("—");
    await expect(cell(page, 1, COL.unitPrice)).toHaveText("—");
    await expect(cell(page, 1, COL.quoteAmount)).toHaveText("0");
    await expect(cell(page, 1, COL.status)).toHaveText("—");
    await expect(page.getByRole("button", { name: "조정 줄 추가" })).toHaveCount(0);
  });

  test("PM — 진행 프로젝트의 조정 행(권한 밖 줄)은 Enter·클릭·Delete·Alt+↑↓에 아무 일도 없고 이유 글자·오류 표시가 없다(DR-22 · B-31)", async ({ page }) => {
    await openProject(page, {
      as: "pm",
      status: "in_progress",
      endDate: addDays(TODAY, 10),
      lines: [
        { itemName: "진행 견적 줄", unitPrice: 100_000, execution: 50_000 },
        { itemName: "진행 조정 줄", unitPrice: 0, execution: 70_000, lineKind: "adjustment" },
      ],
    });
    await expect(page.getByRole("grid")).toBeVisible();
    const adjustmentRow = dataRows(page).nth(1);

    await focusGridCell(cell(page, 1, COL.execution));
    await page.keyboard.press("Enter");
    await cell(page, 1, COL.itemName).click();
    await focusGridCell(cell(page, 1, COL.execution));
    await page.keyboard.press("Delete");
    // 견적 줄을 아래로 옮겨도 조정 그룹을 넘지 않는다(고정 그룹).
    await focusGridCell(cell(page, 0, COL.execution));
    await page.keyboard.press("Alt+ArrowDown");
    // 키가 처리된 뒤를 긍정 신호로 잡는다 — 견적 줄 실행가 편집기가 열리고 닫힌 다음에 부정 단언을 한다.
    await focusGridCell(cell(page, 0, COL.execution));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "실행가" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "실행가" })).toHaveCount(0);

    await expect(page.getByRole("grid", { name: "견적 줄" }).getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(dataRows(page)).toHaveCount(2);
    await expect(cell(page, 0, COL.itemName)).toHaveText("진행 견적 줄");
    await expect(cell(page, 1, COL.itemName)).toHaveText("진행 조정 줄");
    await expect(adjustmentRow.locator("[class*='issueReason']")).toHaveCount(0);
    await expect(adjustmentRow.locator("[aria-invalid='true']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /일괄 저장 \d/ })).toHaveCount(0);
  });

  test("PM — 정산 붙여넣기는 조정 칸을 건너뛰어 요약에만 세고, 같은 붙여넣기의 정산 잠긴 칸은 이유가 붙은 오류 셀이다(DR-22 · DR-35)", async ({ page }) => {
    await openProject(page, {
      as: "pm",
      status: "settling",
      endDate: addDays(TODAY, -3),
      lines: [
        { itemName: "정산 견적 줄", unitPrice: 100_000, execution: 50_000 },
        { itemName: "정산 조정 줄", unitPrice: 0, execution: 40_000, lineKind: "adjustment" },
      ],
    });
    await focusGridCell(cell(page, 0, COL.quantity));
    await pasteIntoFocusedCell(page, "2\t3000\n4\t5000");

    await expect(cell(page, 0, COL.quantity)).toHaveAttribute("aria-invalid", "true");
    await expect(cell(page, 0, COL.quantity)).toContainText("정산 · 실행가와 새 줄만");
    await expect(cell(page, 1, COL.quantity)).not.toHaveAttribute("aria-invalid", "true");
    await expect(cell(page, 1, COL.unitPrice)).not.toHaveAttribute("aria-invalid", "true");
    await expect(cell(page, 1, COL.quantity)).toHaveText("—");
    await expect(cell(page, 1, COL.execution)).toHaveText("40,000");
    await expect(dataRows(page).nth(1).locator("[class*='issueReason']")).toHaveCount(0);
    await expect(page.locator("tfoot")).toContainText("조정 줄 2칸 건너뜀");
  });

  test("경영관리 — 조정 행 Delete는 `ui/confirm-dialog` 조정 줄 삭제 확인이고, 1차 뒤 저장하면 보관함에 견적 줄로 간다(DR-12)", async ({ page }) => {
    const itemName = `삭제할 조정 줄 ${randomUUID().slice(0, 6)}`;
    await openProject(page, {
      as: "adjuster",
      status: "in_progress",
      endDate: addDays(TODAY, 10),
      lines: [
        { itemName: "남는 견적 줄", unitPrice: 100_000, execution: 50_000 },
        { itemName, unitPrice: 0, execution: 45_000, lineKind: "adjustment" },
      ],
    });
    const trigger = cell(page, 1, COL.execution);
    await focusGridCell(trigger);
    await page.keyboard.press("Delete");
    const dialog = page.getByRole("dialog", { name: "조정 줄 삭제" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`${itemName} · 45,000`);
    await expect(dialog).toContainText("보관함으로 옮겨짐 · 복원은 관리자");
    const primary = dialog.getByRole("button", { name: "조정 줄 삭제" });
    await expect(primary).toBeFocused();
    await expect(dialog.getByRole("button", { name: /취소/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Delete");
    await dialog.getByRole("button", { name: "조정 줄 삭제" }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    const saved = waitForSaveResponse(page);
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    const archived = await listArchive(SYSTEM_VIEWER);
    expect(archived.find((entry) => entry.name === itemName)?.label).toBe("견적 줄");
  });

  test("경영관리 — 줄 수가 상한(300)이면 「조정 줄 추가」가 aria-disabled이고 상한 이유를 aria-describedby로 가리킨다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "completed", endDate: addDays(TODAY, -20), lines: [] });
    await fillLinesBySql(project.id, 300);
    await login(page, await makeAdjuster(team));
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();

    const addButton = page.getByRole("button", { name: "조정 줄 추가" });
    await expect(addButton).toHaveAttribute("aria-disabled", "true");
    const reason = page.getByText(CAP_REASON, { exact: true });
    await expect(reason).toBeVisible();
    const reasonId = await reason.getAttribute("id");
    expect(reasonId).toBeTruthy();
    expect((await addButton.getAttribute("aria-describedby"))?.split(" ")).toContain(reasonId);
  });

  test("경영관리 — 0줄 완료 표의 EMPTY는 1000에서 사실만, 1280에서 「조정 줄 추가」이고 누르면 조정 줄 실행가 칸이 열린다", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await openProject(page, { as: "adjuster", status: "completed", endDate: addDays(TODAY, -20), lines: [] });
    await expect(page.getByText(EMPTY_MESSAGE)).toBeVisible();
    await expect(page.getByRole("button", { name: "조정 줄 추가" })).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "조정 줄 추가" }).click();
    await expect(page.getByRole("textbox", { name: "실행가" })).toBeFocused();
    await expect(groupHeaders(page).last()).toHaveText("조정");
    // 조정 행이 편집 셀인 격자 — 완료 표 위 잠김 줄이 나타난다(P0).
    await expect(page.getByText("완료 · 견적 줄 잠김", { exact: true })).toBeVisible();
  });

  test("경영관리 — 저장 안 한 새 조정 줄을 새로 고친 뒤 「복원」하면 조정 그룹에 조정 줄로 돌아온다", async ({ page }) => {
    await openProject(page, {
      as: "adjuster",
      status: "completed",
      endDate: addDays(TODAY, -20),
      lines: [{ itemName: "복원 견적 줄", unitPrice: 100_000, execution: 50_000 }],
    });
    await page.getByRole("button", { name: "조정 줄 추가" }).click();
    await page.getByRole("textbox", { name: "실행가" }).fill("88000");
    await page.keyboard.press("Enter");
    await expect(cell(page, 1, COL.execution)).toHaveText("88,000");

    await page.reload();
    await page.getByRole("button", { name: "복원" }).click();
    await expect(dataRows(page)).toHaveCount(2);
    await expect(groupHeaders(page).last()).toHaveText("조정");
    await expect(cell(page, 1, COL.subcategory)).toHaveText("조정");
    await expect(cell(page, 1, COL.execution)).toHaveText("88,000");
  });
  test("PM — 진행에서 「견적 외 비용 줄 추가」로 만든 줄은 견적 외 비용 그룹 · 견적가 0 · 실행가 −50,000으로 저장되고, 복제해도 같은 그룹이다(D-48)", async ({ page }) => {
    await openProject(page, {
      as: "pm",
      status: "in_progress",
      endDate: addDays(TODAY, 10),
      lines: [{ itemName: "진행 견적 줄", unitPrice: 100_000, execution: 50_000 }],
    });
    await page.getByRole("button", { name: "견적 외 비용 줄 추가" }).click();
    // 새 줄의 항목 칸이 열린다.
    const itemInput = page.getByRole("textbox", { name: "항목", exact: true });
    await expect(itemInput).toBeFocused();
    await itemInput.fill("현장 식대 환급");
    await page.keyboard.press("Enter");
    await expect(groupHeaders(page).last()).toHaveText("견적 외 비용");
    await expect(cell(page, 1, COL.subcategory)).toHaveText("견적 외 비용");
    await expect(cell(page, 1, COL.quantity)).toHaveText("—");
    await expect(cell(page, 1, COL.unitPrice)).toHaveText("—");
    await expect(cell(page, 1, COL.quantity)).toHaveAttribute("aria-readonly", "true");

    await focusGridCell(cell(page, 1, COL.execution));
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "실행가" }).fill("-50000");
    await page.keyboard.press("Enter");

    const saved = waitForSaveResponse(page);
    await focusGridCell(cell(page, 1, COL.execution));
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(groupHeaders(page).last()).toHaveText("견적 외 비용");
    await expect(cell(page, 1, COL.itemName)).toHaveText("현장 식대 환급");
    await expect(cell(page, 1, COL.quoteAmount)).toHaveText("0");
    await expect(cell(page, 1, COL.execution)).toHaveText("-50,000");

    // 복제(Ctrl+D)도 견적 외 비용 줄이다.
    await focusGridCell(cell(page, 1, COL.execution));
    await page.keyboard.press("Control+d");
    await expect(dataRows(page)).toHaveCount(3);
    await expect(groupHeaders(page)).toHaveCount(2);
    await expect(cell(page, 2, COL.subcategory)).toHaveText("견적 외 비용");
  });

  test("PM — 정산에서도 「견적 외 비용 줄 추가」가 있고 만든 줄은 수량·단가 「—」 · 실행가 −30,000으로 저장된다(사용자 D10·D12)", async ({ page }) => {
    await openProject(page, {
      as: "pm",
      status: "settling",
      endDate: addDays(TODAY, -3),
      lines: [{ itemName: "정산 견적 줄", unitPrice: 100_000, execution: 50_000 }],
    });
    await page.getByRole("button", { name: "견적 외 비용 줄 추가" }).click();
    await page.getByRole("textbox", { name: "항목", exact: true }).fill("정산 추가 비용");
    await page.keyboard.press("Enter");
    await expect(cell(page, 1, COL.quantity)).toHaveText("—");
    await expect(cell(page, 1, COL.unitPrice)).toHaveText("—");
    await focusGridCell(cell(page, 1, COL.execution));
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "실행가" }).fill("-30000");
    await page.keyboard.press("Enter");

    const saved = waitForSaveResponse(page);
    await focusGridCell(cell(page, 1, COL.execution));
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(groupHeaders(page).last()).toHaveText("견적 외 비용");
    await expect(cell(page, 1, COL.execution)).toHaveText("-30,000");
    await expect(cell(page, 1, COL.quoteAmount)).toHaveText("0");
  });

  test("PM — 완료 프로젝트에는 「견적 외 비용 줄 추가」가 없다", async ({ page }) => {
    await openProject(page, {
      as: "pm",
      status: "completed",
      endDate: addDays(TODAY, -20),
      lines: [{ itemName: "완료 견적 줄", unitPrice: 100_000, execution: 50_000 }],
    });
    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "견적 외 비용 줄 추가" })).toHaveCount(0);
  });

  test("소분류 칸을 편집하는 동안 고른 소분류의 코드표 설명이 셀 아래 한 줄로 보이고, 편집을 끝내면 사라진다(D-93)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const project = await makeProject({
      teamId: team,
      pmUserId: pm.userId,
      status: "in_progress",
      endDate: addDays(TODAY, 10),
      lines: [{ itemName: "설명 견적 줄", unitPrice: 100_000, execution: 50_000 }],
    });
    const description = project.subcategory.description;
    expect(description).toBeTruthy();
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();

    await expect(page.getByText(description ?? "", { exact: true })).toHaveCount(0);
    await focusGridCell(cell(page, 0, COL.subcategory));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox", { name: "소분류" })).toBeVisible();
    await expect(cell(page, 0, COL.subcategory).getByText(description ?? "", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox", { name: "소분류" })).toHaveCount(0);
    await expect(page.getByText(description ?? "", { exact: true })).toHaveCount(0);
  });
});
