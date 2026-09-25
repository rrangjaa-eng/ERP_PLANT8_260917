import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";

// 04-30(D-78 · 사용자 D10·D12 · UI-SPEC rev 5 S4) — 견적 표의 편집 범위가 서버 셀 단계(DTO cellEditability)와
// 구조 판정(structuralEditability)대로 그려지는지. 날짜는 전부 오늘(KST)에서 더해 만든다(A-18). 계급 권한·정보
// 노출은 손으로 켜지 않는다(ENG-D2 — 시드만).
const TODAY = kstToday(new Date());

// 열 순서(quote-table.tsx) — 번호 · 소분류 · 항목 · 거래처 · 수량 · 단가 · 견적가 · 실행가 · 차익 · 상태 · 비고.
const COL = { subcategory: 1, itemName: 2, vendor: 3, quantity: 4, unitPrice: 5, quoteAmount: 6, execution: 7, note: 10 } as const;

type Account = { userId: string; email: string; password: string };

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

async function makeAccount(roleId: string, teamId: string, name = "E2E 편집범위"): Promise<Account> {
  const email = `e2e-scope-${randomUUID()}@example.test`;
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

type SeedLine = { itemName: string; unitPrice: number; execution: number };

// 줄은 수주중(생성 직후)일 때 도메인 함수로 넣고, 그 뒤 상태를 DB에 둔다(project-period.spec.ts와 같은 준비).
async function makeProject(input: {
  teamId: string;
  pmUserId: string;
  status: string;
  endDate: string;
  lines?: SeedLine[];
}): Promise<{ id: string; name: string }> {
  const vendor = await insertVendor(SYSTEM_VIEWER, {
    name: `E2E범위클라이언트-${randomUUID()}`,
    normalizedName: `e2e범위클라이언트-${randomUUID()}`,
  });
  const name = `E2E범위-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: input.teamId,
    pmUserId: input.pmUserId,
    name,
    startDate: addDays(input.endDate, -10),
    endDate: input.endDate,
  });
  if (input.lines && input.lines.length > 0) {
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("소분류 코드가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: input.lines.map((line) => ({
        id: randomUUID(),
        isNew: true as const,
        subcategory: subcategory.value,
        itemName: line.itemName,
        quantity: 1,
        unitPrice: { currency: "KRW" as const, amount: line.unitPrice, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: line.execution, fxRate: 1 },
      })),
    });
  }
  await db.update(projects).set({ status: input.status }).where(eq(projects.id, created.id));
  return { id: created.id, name };
}

// 서버 액션(일괄 저장) 요청·응답.
function isSaveAction(method: string, headers: Record<string, string>): boolean {
  return method === "POST" && headers["next-action"] !== undefined;
}

function waitForSaveResponse(page: Page) {
  return page.waitForResponse((response) => isSaveAction(response.request().method(), response.request().headers()));
}

// 격자의 데이터 행(그룹 머리글 행·폰 접힌 줄 제외).
function dataRows(page: Page): Locator {
  return page.locator('tbody tr:has(> td[role="gridcell"])');
}

function cell(page: Page, rowIndex: number, colIndex: number): Locator {
  return dataRows(page).nth(rowIndex).getByRole("gridcell").nth(colIndex);
}

async function itemNames(page: Page): Promise<string[]> {
  return dataRows(page).locator("td:nth-child(3)").allTextContents();
}

async function pasteIntoFocusedCell(page: Page, text: string) {
  await page.evaluate((clipboardText) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", clipboardText);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

// 편집기를 열어 값을 적고 Enter로 커밋한다.
async function typeInto(page: Page, target: Locator, label: string, value: string) {
  await target.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: label, exact: true }).fill(value);
  await page.keyboard.press("Enter");
}

// 셀로 포커스를 돌려 Control+s — 서버 액션 응답까지 기다린다.
async function saveWithKeyboard(page: Page, focusTarget: Locator) {
  const saved = waitForSaveResponse(page);
  await focusTarget.focus();
  await page.keyboard.press("Control+s");
  await saved;
}

const SETTLING_REASON = "정산 · 실행가와 새 줄만";
const EMPTY_MESSAGE = "이 프로젝트에 견적 줄이 없습니다";

async function openAsPm(page: Page, status: string, endDate: string, lines: SeedLine[]) {
  const team = await makeTeam();
  const pm = await makeAccount(DEFAULT_ROLE_ID, team);
  const project = await makeProject({ teamId: team, pmUserId: pm.userId, status, endDate, lines });
  await login(page, pm);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  return { team, pm, project };
}

test.describe("견적 표 편집 범위 — 서버 셀 단계 · 구조 (04-30, PROJ-02 · UX-04 · UX-05)", () => {
  test("트레이서 — 정산 PM의 기존 줄은 실행가만 편집에 들어가고 나머지 칸은 aria-readonly이며, 실행가를 고쳐 저장하면 새로 고쳐도 남는다", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [
      { itemName: "정산 줄 하나", unitPrice: 1_000_000, execution: 600_000 },
      { itemName: "정산 줄 둘", unitPrice: 500_000, execution: 300_000 },
    ]);

    await expect(page.getByRole("grid")).toBeVisible();
    await expect(dataRows(page)).toHaveCount(2);
    // 04-12 DOM 감사 FAIL(모든 칸 편집 가능 — 한 boolean으로 뭉갬)을 닫는다: 실행가 밖 편집기 칸은 전부 잠김이다.
    for (const col of [COL.subcategory, COL.itemName, COL.vendor, COL.quantity, COL.unitPrice, COL.note]) {
      await expect(cell(page, 0, col)).toHaveAttribute("aria-readonly", "true");
    }
    await expect(cell(page, 0, COL.execution)).toHaveAttribute("aria-readonly", "false");

    // 단가 칸 Enter — 편집기가 열리지 않는다.
    await cell(page, 0, COL.unitPrice).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "단가", exact: true })).toHaveCount(0);

    // 실행가 칸 Enter — 편집기가 열린다.
    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Enter");
    const input = page.getByRole("textbox", { name: "실행가" });
    await expect(input).toBeVisible();
    await input.fill("750000");
    await page.keyboard.press("Enter");

    const saved = waitForSaveResponse(page);
    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(cell(page, 0, COL.execution)).toHaveText("750,000");
    await expect(cell(page, 0, COL.unitPrice)).toHaveText("1,000,000");
  });

  test("완료 프로젝트를 PM이 열면 견적 표가 캡션 있는 읽기 표(격자 아님)이고 1차 「일괄 저장」이 없다", async ({ page }) => {
    await openAsPm(page, "completed", addDays(TODAY, -20), [{ itemName: "완료 줄", unitPrice: 1_000_000, execution: 600_000 }]);

    const table = page.getByRole("table", { name: "견적 줄" });
    await expect(table).toBeVisible();
    await expect(table.getByText("완료 줄")).toBeVisible();
    await expect(page.getByRole("grid")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /일괄 저장/ })).toHaveCount(0);
  });

  test("(e2) 진행 프로젝트 세 줄 중 둘째 줄의 실행가만 고쳐 저장해도 새로 고치기 전에 줄이 셋이다", async ({ page }) => {
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "첫째 줄", unitPrice: 100_000, execution: 50_000 },
      { itemName: "둘째 줄", unitPrice: 200_000, execution: 100_000 },
      { itemName: "셋째 줄", unitPrice: 300_000, execution: 150_000 },
    ]);
    await expect(dataRows(page)).toHaveCount(3);

    await cell(page, 1, COL.execution).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "실행가" }).fill("120000");
    await page.keyboard.press("Enter");
    // Enter 커밋 뒤 편집기가 내려가면 포커스가 <body>로 빠진다(04-04 격자 — 실측, 이 플랜 범위 밖) — 셀로 돌아가 저장한다.
    const saved = waitForSaveResponse(page);
    await cell(page, 1, COL.execution).focus();
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await expect(dataRows(page)).toHaveCount(3);
    await expect(cell(page, 1, COL.execution)).toHaveText("120,000");
  });

  test("(e3) 실행가 편집기를 연 채(Enter·Tab 없이) Control+s — 요청 본문과 새로 고친 뒤 값이 마지막으로 친 값이다", async ({ page }) => {
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "활성 셀 줄", unitPrice: 2_000_000, execution: 1_000_000 },
    ]);

    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Enter");
    const input = page.getByRole("textbox", { name: "실행가" });
    await expect(input).toBeVisible();
    await input.fill("987654");

    const request = page.waitForRequest((req) => isSaveAction(req.method(), req.headers()));
    const saved = waitForSaveResponse(page);
    await page.keyboard.press("Control+s");
    expect((await request).postData() ?? "").toContain("987654");
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(cell(page, 0, COL.execution)).toHaveText("987,654");
  });

  test("(e3) 실행가 편집기를 연 채 1차 「일괄 저장」을 눌러도 요청 본문과 새로 고친 뒤 값이 마지막으로 친 값이다", async ({ page }) => {
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "1차 경로 줄", unitPrice: 2_000_000, execution: 1_000_000 },
    ]);

    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Enter");
    const input = page.getByRole("textbox", { name: "실행가" });
    await expect(input).toBeVisible();
    await input.fill("123456");

    const request = page.waitForRequest((req) => isSaveAction(req.method(), req.headers()));
    const saved = waitForSaveResponse(page);
    // 편집기가 열린 동안은 dirty 0이라 1차가 aria-disabled(「바뀐 칸 없음」)다 — Playwright의 enabled 대기를 건너뛰고
    // 사람이 누르는 것과 같은 마우스 이벤트를 보낸다(누르는 순간 편집기가 blur로 커밋된다).
    await page.getByRole("button", { name: /일괄 저장/ }).click({ force: true });
    expect((await request).postData() ?? "").toContain("123456");
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(cell(page, 0, COL.execution)).toHaveText("123,456");
  });

  test("(a) 정산 PM 화면에 줄 삭제·이동·복제 컨트롤이 없고 Delete·Alt+ArrowDown·Control+d 뒤 줄 수·순서가 그대로다", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [
      { itemName: "정산 가 줄", unitPrice: 100_000, execution: 50_000 },
      { itemName: "정산 나 줄", unitPrice: 200_000, execution: 100_000 },
    ]);
    await expect(dataRows(page)).toHaveCount(2);

    await expect(page.getByRole("button", { name: /삭제|복제|줄 이동/ })).toHaveCount(0);
    await expect(page.locator("kbd", { hasText: "Alt+↑↓" })).toHaveCount(0);
    await expect(page.locator("kbd", { hasText: "Ctrl+D" })).toHaveCount(0);

    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Delete");
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Control+d");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(dataRows(page)).toHaveCount(2);
    expect(await itemNames(page)).toEqual(["정산 가 줄", "정산 나 줄"]);
  });

  test("(b) 정산 PM이 「줄 추가」로 만든 새 줄은 수량 1 · 단가 0이 잠겨 있고, 항목·실행가만 적어 저장하면 견적가 0으로 남는다", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [{ itemName: "정산 기존 줄", unitPrice: 300_000, execution: 200_000 }]);

    await page.getByRole("button", { name: "줄 추가" }).click();
    await expect(dataRows(page)).toHaveCount(2);
    const last = dataRows(page).last();
    const lastCell = (col: number) => last.getByRole("gridcell").nth(col);
    await expect(lastCell(COL.quantity)).toHaveAttribute("aria-readonly", "true");
    await expect(lastCell(COL.unitPrice)).toHaveAttribute("aria-readonly", "true");
    await expect(lastCell(COL.quantity)).toHaveText("1");
    await expect(lastCell(COL.unitPrice)).toHaveText("0");
    await expect(lastCell(COL.itemName)).toHaveAttribute("aria-readonly", "false");
    await expect(lastCell(COL.execution)).toHaveAttribute("aria-readonly", "false");

    await typeInto(page, lastCell(COL.itemName), "항목", "늦은 비용");
    await typeInto(page, lastCell(COL.execution), "실행가", "45000");
    await saveWithKeyboard(page, lastCell(COL.execution));
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    const saved = dataRows(page).filter({ hasText: "늦은 비용" });
    await expect(saved).toHaveCount(1);
    await expect(saved.getByRole("gridcell").nth(COL.quantity)).toHaveText("1");
    await expect(saved.getByRole("gridcell").nth(COL.quoteAmount)).toHaveText("0");
    await expect(saved.getByRole("gridcell").nth(COL.execution)).toHaveText("45,000");
  });

  test("(c) 정산 PM — 표 위 한 줄 「정산 · 실행가와 새 줄만」, 힌트 줄에 새 줄 Ctrl+Enter만 있고 줄 이동·줄 복제·저장이 없다", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [{ itemName: "정산 힌트 줄", unitPrice: 100_000, execution: 50_000 }]);

    await expect(page.getByText(SETTLING_REASON, { exact: true })).toBeVisible();
    const hint = page.locator("p", { has: page.locator("kbd", { hasText: "Ctrl+V" }) });
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("새 줄 Ctrl+Enter");
    await expect(hint).not.toContainText("줄 이동");
    await expect(hint).not.toContainText("줄 복제");
    await expect(hint).not.toContainText("저장");
  });

  test("(c2) 정산 PM이 잠긴 단가 칸에서 Enter — 편집기 없이 셀 아래 이유 한 줄, 옮기면 사라지고, 붙여넣기는 같은 이유의 오류 셀", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [{ itemName: "정산 이유 줄", unitPrice: 100_000, execution: 50_000 }]);
    const unitPrice = cell(page, 0, COL.unitPrice);

    await unitPrice.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "단가", exact: true })).toHaveCount(0);
    await expect(unitPrice.getByText(SETTLING_REASON, { exact: true })).toBeVisible();
    await expect(unitPrice).not.toHaveAttribute("aria-invalid", "true");

    await page.keyboard.press("ArrowRight");
    await expect(unitPrice.getByText(SETTLING_REASON, { exact: true })).toHaveCount(0);

    await unitPrice.focus();
    await pasteIntoFocusedCell(page, "1000");
    await expect(unitPrice).toHaveAttribute("aria-invalid", "true");
    await expect(unitPrice.getByText(SETTLING_REASON, { exact: true })).toBeVisible();
  });

  test("(c3) 완료 프로젝트를 PM이 열면 표 위 잠김 줄과 힌트 줄이 없다", async ({ page }) => {
    await openAsPm(page, "completed", addDays(TODAY, -20), [{ itemName: "완료 힌트 줄", unitPrice: 100_000, execution: 50_000 }]);
    await expect(page.getByRole("table", { name: "견적 줄" }).getByText("완료 힌트 줄")).toBeVisible();
    await expect(page.getByText("완료 · 견적 줄 잠김")).toHaveCount(0);
    await expect(page.locator("kbd", { hasText: "Ctrl+V" })).toHaveCount(0);
  });

  test("(d) 정산 상세에 발행 요청·마감 버튼이 없다(D-77)", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [{ itemName: "정산 D77 줄", unitPrice: 100_000, execution: 50_000 }]);
    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /발행 요청|마감/ })).toHaveCount(0);
  });

  test("(e) 수주중에서 저장된 줄 삭제 → 확인 모달 → 일괄 저장 1 → 새로 고쳐도 없다", async ({ page }) => {
    await openAsPm(page, "bidding", addDays(TODAY, 30), [
      { itemName: "남길 줄", unitPrice: 100_000, execution: 50_000 },
      { itemName: "지울 줄", unitPrice: 200_000, execution: 100_000 },
    ]);

    await cell(page, 1, COL.itemName).focus();
    await page.keyboard.press("Delete");
    const dialog = page.getByRole("dialog", { name: "견적 줄 삭제" });
    await expect(dialog.getByText("보관함으로 옮겨짐 · 복원은 관리자")).toBeVisible();
    await dialog.getByRole("button", { name: "견적 줄 삭제" }).click();
    await expect(dialog).toBeHidden();
    expect(await itemNames(page)).toEqual(["남길 줄"]);

    const saved = waitForSaveResponse(page);
    await page.getByRole("button", { name: "일괄 저장 1" }).click();
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(dataRows(page)).toHaveCount(1);
    expect(await itemNames(page)).toEqual(["남길 줄"]);
  });

  test("(f) 진행에서 셋째 줄을 Alt+ArrowUp으로 옮겨 저장하면 새로 고쳐도 그 순서이고, 실행가만 고친 저장은 순서를 바꾸지 않는다", async ({ page }) => {
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "순서 1", unitPrice: 100_000, execution: 10_000 },
      { itemName: "순서 2", unitPrice: 100_000, execution: 20_000 },
      { itemName: "순서 3", unitPrice: 100_000, execution: 30_000 },
    ]);

    await cell(page, 2, COL.itemName).focus();
    await page.keyboard.press("Alt+ArrowUp");
    expect(await itemNames(page)).toEqual(["순서 1", "순서 3", "순서 2"]);
    await saveWithKeyboard(page, cell(page, 0, COL.itemName));
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    expect(await itemNames(page)).toEqual(["순서 1", "순서 3", "순서 2"]);

    await typeInto(page, cell(page, 0, COL.execution), "실행가", "11000");
    await saveWithKeyboard(page, cell(page, 0, COL.execution));
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();
    await page.reload();
    expect(await itemNames(page)).toEqual(["순서 1", "순서 3", "순서 2"]);
  });

  test("(g) 0줄 정산 표 — PM은 「첫 줄 만들기」, 팀장은 「기간 바꾸기」(종료일 칸 포커스), 0줄 완료 표는 사실만", async ({ page }) => {
    const { team, project } = await openAsPm(page, "settling", addDays(TODAY, -3), []);
    const table = page.getByRole("table", { name: "견적 줄" });
    await expect(table.getByText(EMPTY_MESSAGE)).toBeVisible();
    await expect(table.getByRole("button", { name: /첫 줄 만들기/ })).toBeVisible();
    await expect(table.getByRole("button", { name: "기간 바꾸기" })).toHaveCount(0);

    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    await page.context().clearCookies();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(table.getByText(EMPTY_MESSAGE)).toBeVisible();
    await expect(table.getByRole("button", { name: /첫 줄 만들기/ })).toHaveCount(0);
    await table.getByRole("button", { name: "기간 바꾸기" }).click();
    await expect(page.getByLabel("종료일")).toBeFocused();

    const completed = await makeProject({ teamId: team, pmUserId: lead.userId, status: "completed", endDate: addDays(TODAY, -20) });
    await page.goto(`/projects/${completed.id}`);
    await expect(page.getByRole("heading", { name: completed.name })).toBeVisible();
    await expect(table).toContainText(EMPTY_MESSAGE);
    await expect(table.getByRole("button")).toHaveCount(0);
    await expect(table).not.toContainText("담당 PM");
  });

  test("(h) 진행 세 줄에서 가운데 줄을 지우고 「줄 추가」로 새 줄을 더해 저장하면 새로 고쳐도 새 줄이 마지막이다", async ({ page }) => {
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "끝 1", unitPrice: 100_000, execution: 10_000 },
      { itemName: "끝 2", unitPrice: 100_000, execution: 20_000 },
      { itemName: "끝 3", unitPrice: 100_000, execution: 30_000 },
    ]);

    await cell(page, 1, COL.itemName).focus();
    await page.keyboard.press("Delete");
    await page.getByRole("dialog", { name: "견적 줄 삭제" }).getByRole("button", { name: "견적 줄 삭제" }).click();
    await page.getByRole("button", { name: "줄 추가" }).click();
    await typeInto(page, dataRows(page).last().getByRole("gridcell").nth(COL.itemName), "항목", "새 끝 줄");
    await saveWithKeyboard(page, cell(page, 0, COL.itemName));
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    expect(await itemNames(page)).toEqual(["끝 1", "끝 3", "새 끝 줄"]);
  });

  test("(i) 새 줄 저장 응답을 잃고(서버는 커밋) 다시 저장해도 그 줄은 하나다(ENG-D10)", async ({ page }) => {
    const { project } = await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "재전송 기존 줄", unitPrice: 100_000, execution: 10_000 },
    ]);

    await page.getByRole("button", { name: "줄 추가" }).click();
    await typeInto(page, dataRows(page).last().getByRole("gridcell").nth(COL.itemName), "항목", "재전송 새 줄");

    let dropped = false;
    await page.route(`**/projects/${project.id}`, async (route) => {
      const request = route.request();
      if (dropped || !isSaveAction(request.method(), request.headers())) return route.fallback();
      dropped = true;
      await route.fetch(); // 서버까지 보내 커밋시킨다.
      await route.abort(); // 응답은 버린다.
    });
    const failed = page.waitForEvent("requestfailed", (request) => isSaveAction(request.method(), request.headers()));
    await cell(page, 0, COL.itemName).focus();
    await page.keyboard.press("Control+s");
    await failed;
    // 실패가 화면에 남는다 — 저장됨이 없고 새 줄이 여전히 저장 대상이다.
    await expect(page.getByRole("button", { name: "일괄 저장 1" })).toBeVisible();
    await expect(page.locator("tfoot").getByText(/저장됨/)).toHaveCount(0);

    await saveWithKeyboard(page, cell(page, 0, COL.itemName));
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();
    await page.reload();
    await expect(dataRows(page).filter({ hasText: "재전송 새 줄" })).toHaveCount(1);
  });

  test("(j) 정산에서 셀 하나를 고친 채 새로 고치면 복원 줄이 잠김 줄보다 앞에 있다(DR-31)", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [{ itemName: "정산 복원 줄", unitPrice: 100_000, execution: 50_000 }]);
    await typeInto(page, cell(page, 0, COL.execution), "실행가", "70000");
    await page.reload();

    const restore = page.locator("p", { hasText: "저장 안 한 편집 1칸" }); // dev 수화 오류 오버레이(04-22 기존 불일치)의 diff 글자와 겹치지 않게 배너 문단만
    const lock = page.getByText(SETTLING_REASON, { exact: true });
    await expect(restore).toBeVisible();
    await expect(lock).toBeVisible();
    const restoreFirst = await restore.evaluate(
      (node, other) => Boolean(other && node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING),
      await lock.elementHandle(),
    );
    expect(restoreFirst).toBe(true);
  });
});
