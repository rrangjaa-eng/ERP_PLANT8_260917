import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, quoteLines } from "@/db/schema";
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

type SeedLine = { itemName: string; unitPrice: number; execution: number; unitPriceFx?: { currency: "USD"; fxRate: number } };

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
        unitPrice: line.unitPriceFx
          ? { currency: line.unitPriceFx.currency, amount: line.unitPrice, fxRate: line.unitPriceFx.fxRate }
          : { currency: "KRW" as const, amount: line.unitPrice, fxRate: 1 },
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

// 수화가 끝나기 전에 준 포커스는 React가 받지 못해 격자 포커스(roving tabindex)가 (0,0)에 남고, 그 뒤 붙여넣기·키는
// (0,0)에서 처리된다(300줄 표에서 실측 — (c4)의 간헐 실패도 같은 모양). 그 셀이 탭 정지(tabindex 0)가 될 때까지 포커스를
// 다시 준다 — 고정 대기가 아니라 격자가 포커스를 받은 사실을 확인한다.
async function focusGridCell(target: Locator) {
  await expect(async () => {
    await target.evaluate((element) => (element as HTMLElement).blur());
    await target.focus();
    await expect(target).toHaveAttribute("tabindex", "0", { timeout: 1_000 });
  }).toPass();
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

  test("(S-5) 실행가 편집기를 연 동안 1차 「일괄 저장」은 비활성(「바뀐 칸 없음」)으로 보이지 않는다", async ({ page }) => {
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "보이는 상태 줄", unitPrice: 2_000_000, execution: 1_000_000 },
    ]);
    const primary = page.getByRole("button", { name: /일괄 저장/ });
    await expect(primary).toHaveAttribute("aria-disabled", "true");

    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Enter");
    const input = page.getByRole("textbox", { name: "실행가" });
    await expect(input).toBeVisible();
    await input.fill("555000");

    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("바뀐 칸 없음")).toHaveCount(0);
    // 누르면 열린 편집기가 커밋되고 저장된다(04-30 e3와 같은 동작).
    const saved = waitForSaveResponse(page);
    await primary.click();
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();
  });

  test("(a) 정산 PM 화면에 줄 삭제·이동·복제 컨트롤이 없고 Delete·Alt+ArrowDown·Control+d 뒤 줄 수·순서가 그대로다", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [
      { itemName: "정산 가 줄", unitPrice: 100_000, execution: 50_000 },
      { itemName: "정산 나 줄", unitPrice: 200_000, execution: 100_000 },
    ]);
    await expect(dataRows(page)).toHaveCount(2);

    // 줄 삭제·이동·복제는 버튼이 아니라 키와 힌트 줄 kbd다 — 진행 표에는 이 kbd가 있다.
    await expect(page.locator("kbd", { hasText: "Alt+↑↓" })).toHaveCount(0);
    await expect(page.locator("kbd", { hasText: "Ctrl+D" })).toHaveCount(0);

    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Delete");
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Control+d");
    // 세 키가 처리된 뒤를 긍정 신호로 잡는다 — 실행가 편집기가 열리고 닫힌 다음에야 부정 단언을 한다.
    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "실행가" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "실행가" })).toHaveCount(0);

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(dataRows(page)).toHaveCount(2);
    expect(await itemNames(page)).toEqual(["정산 가 줄", "정산 나 줄"]);
  });

  test("(b) 정산 PM이 「줄 추가」로 만든 새 줄은 수량 1 · 단가 0이 잠겨 있고, 항목·실행가만 적어 저장하면 견적가 0으로 남는다", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [{ itemName: "정산 기존 줄", unitPrice: 300_000, execution: 200_000 }]);

    await page.getByRole("button", { name: "줄 추가", exact: true }).click();
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

  test("(c4) 정산 PM이 표 끝을 넘겨 붙여넣으면 새 줄의 잠긴 수량·단가 칸은 같은 이유의 오류 셀이고 값은 1 · 0 그대로다", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [{ itemName: "정산 붙여넣기 줄", unitPrice: 100_000, execution: 50_000 }]);

    await focusGridCell(cell(page, 0, COL.quantity));
    await pasteIntoFocusedCell(page, "3\t5000\n4\t6000");
    await expect(dataRows(page)).toHaveCount(2);

    const added = dataRows(page).nth(1);
    for (const col of [COL.quantity, COL.unitPrice]) {
      await expect(added.getByRole("gridcell").nth(col)).toHaveAttribute("aria-invalid", "true");
      await expect(added.getByRole("gridcell").nth(col).getByText(SETTLING_REASON, { exact: true })).toBeVisible();
    }
    // 견적가 열은 저장 전에 다시 계산되지 않는다 — 값은 잠긴 칸 글자 첫머리로 본다(뒤에 이유 줄이 붙는다).
    await expect(added.getByRole("gridcell").nth(COL.quantity)).toHaveText(/^1(?!\d)/);
    await expect(added.getByRole("gridcell").nth(COL.unitPrice)).toHaveText(/^0(?!\d)/);
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
    const moved = page.waitForRequest((req) => isSaveAction(req.method(), req.headers()));
    await saveWithKeyboard(page, cell(page, 0, COL.itemName));
    expect((await moved).postData() ?? "").toMatch(/"order":\[/);
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    expect(await itemNames(page)).toEqual(["순서 1", "순서 3", "순서 2"]);

    await typeInto(page, cell(page, 0, COL.execution), "실행가", "11000");
    const editOnly = page.waitForRequest((req) => isSaveAction(req.method(), req.headers()));
    await saveWithKeyboard(page, cell(page, 0, COL.execution));
    expect((await editOnly).postData() ?? "").not.toMatch(/"order":\[/);
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
    await page.getByRole("button", { name: "줄 추가", exact: true }).click();
    await typeInto(page, dataRows(page).last().getByRole("gridcell").nth(COL.itemName), "항목", "새 끝 줄");
    const appended = page.waitForRequest((req) => isSaveAction(req.method(), req.headers()));
    await saveWithKeyboard(page, cell(page, 0, COL.itemName));
    expect((await appended).postData() ?? "").not.toMatch(/"order":\[/);
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    expect(await itemNames(page)).toEqual(["끝 1", "끝 3", "새 끝 줄"]);
  });

  test("(i) 새 줄 저장 응답을 잃고(서버는 커밋) 다시 저장해도 그 줄은 하나다(ENG-D10)", async ({ page }) => {
    const { project } = await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "재전송 기존 줄", unitPrice: 100_000, execution: 10_000 },
    ]);

    await page.getByRole("button", { name: "줄 추가", exact: true }).click();
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

  test("(k) 진행에서 적어 둔 새 줄(수량 3 · 단가 5,000)을 정산이 된 뒤 복원하면 잠긴 수량·단가는 1 · 0이다", async ({ page }) => {
    const { project } = await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "복원 기존 줄", unitPrice: 100_000, execution: 50_000 },
    ]);
    await page.getByRole("button", { name: "줄 추가", exact: true }).click();
    const added = () => dataRows(page).nth(1).getByRole("gridcell");
    await typeInto(page, added().nth(COL.itemName), "항목", "복원 새 줄");
    await typeInto(page, added().nth(COL.quantity), "수량", "3");
    await typeInto(page, added().nth(COL.unitPrice), "단가", "5000");
    await expect(added().nth(COL.quantity)).toHaveText("3");
    await expect(added().nth(COL.unitPrice)).toHaveText("5,000");

    await db.update(projects).set({ status: "settling" }).where(eq(projects.id, project.id));
    await page.reload();
    await page.getByRole("button", { name: "복원" }).click();

    await expect(dataRows(page)).toHaveCount(2);
    await expect(added().nth(COL.itemName)).toHaveText("복원 새 줄");
    await expect(added().nth(COL.quantity)).toHaveText("1");
    await expect(added().nth(COL.unitPrice)).toHaveText("0");
  });

  test("(g2) 0줄 정산 표에서 PM이 「첫 줄 만들기」를 누르면 표 위 잠김 줄이 나타난다(DR-2)", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), []);
    await expect(page.getByText(SETTLING_REASON, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByText(SETTLING_REASON, { exact: true })).toBeVisible();
  });

  test("(p7) 저장 요청 중 「줄 추가」·「견적 외 비용 줄 추가」는 aria-disabled이고 일괄 저장 버튼을 가리키며 눌러도 줄이 늘지 않는다(/design-review P-7)", async ({ page }) => {
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [{ itemName: "잠금 줄", unitPrice: 100_000, execution: 10_000 }]);
    await typeInto(page, cell(page, 0, COL.itemName), "항목", "잠금 줄 고침");

    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (isSaveAction(request.method(), request.headers())) await held;
      await route.continue();
    });
    await primarySave(page).click();
    await expect(primarySave(page)).toContainText("…");

    const saveId = await primarySave(page).getAttribute("id");
    expect(saveId).toBeTruthy();
    for (const name of ["줄 추가", "견적 외 비용 줄 추가"]) {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toHaveAttribute("aria-disabled", "true");
      expect((await button.getAttribute("aria-describedby"))?.split(" ")).toContain(saveId);
      await button.click({ force: true });
      await expect(dataRows(page)).toHaveCount(1);
    }

    release();
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();
    await expect(page.getByRole("button", { name: "줄 추가", exact: true })).not.toHaveAttribute("aria-disabled", "true");
  });
});

// 04-49(DR-14 · DR-24 · DR-36 · 계약 6 · S18 · 후속 결정 R1) — 폭 규칙. 1024 미만에서 견적 줄 표는 보기 전용이고,
// 1차는 dirty가 하나라도 있으면(복원한 표 칸 포함) 렌더되며, 현재 차수 복원 줄은 모든 폭에서 보인다.
const TWO_LINES: SeedLine[] = [
  { itemName: "폭 첫 줄", unitPrice: 1_000_000, execution: 600_000 },
  { itemName: "폭 둘째 줄", unitPrice: 500_000, execution: 300_000 },
];

// 읽기 표·격자 모두에서 같은 줄의 칸(숨은 열도 DOM에 남아 논리 열 순서 그대로다).
function lineCell(page: Page, itemName: string, colIndex: number): Locator {
  return page.locator("tbody tr").filter({ hasText: itemName }).first().locator("td").nth(colIndex);
}

const hintRow = (page: Page) => page.locator("p", { has: page.locator("kbd", { hasText: "↑↓←→" }) });
const primarySave = (page: Page) => page.getByRole("button", { name: /일괄 저장/ });

async function changePeriodEnd(page: Page, value: string) {
  await page.locator("#period-open").click();
  await page.locator("#period-end").fill(value);
}

test.describe("폭 규칙 — 1024 미만 보기 전용 · 좁은 PC 열 접기 · 복원 줄 모든 폭 (04-49)", () => {
  test("(k) 1000 — 견적 줄 표가 캡션 있는 읽기 표이고 줄 추가·힌트 줄·편집이 없으며, 1차는 기간 칸을 바꾸면 생긴다", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);

    await expect(page.getByRole("table", { name: "견적 줄" })).toBeVisible();
    await expect(page.getByRole("grid", { name: "견적 줄" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "줄 추가", exact: true })).toHaveCount(0);
    await expect(hintRow(page)).toHaveCount(0);
    await lineCell(page, "폭 첫 줄", COL.execution).click();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "실행가" })).toHaveCount(0);

    await expect(primarySave(page)).toHaveCount(0);
    await changePeriodEnd(page, addDays(TODAY, 12));
    await expect(primarySave(page)).toContainText("일괄 저장 1");
  });

  // 사용자 결정 2026-09-26(VERDICT.md M-6) — DR-14 정의(700~1023 = P1 + P2 다섯 열)를 정본으로 삼는다:
  // 소분류(P3)는 숨고, 수량·단가·견적가(P2)는 보인다.
  test("(k) 1000 — 소분류 열은 숨고 수량·단가·견적가 열은 보인다 (DR-14)", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);

    await expect(page.getByRole("columnheader", { name: "소분류" })).not.toBeVisible();
    await expect(page.getByRole("columnheader", { name: "수량" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "단가" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "견적가" })).toBeVisible();
  });

  // /review R-6 — DR-14로 700~1023 표가 7열이 됐다. 가장 좁은 700에서도 문서가 가로로 넘치지 않고,
  // 견적가 열이 뷰포트 안에 있다.
  test("(k2) 700 — 7열 견적 표가 문서를 가로로 넘치게 하지 않고 견적가 열이 화면 안에 있다 (DR-14)", async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);

    const amountHeader = page.getByRole("columnheader", { name: "견적가" });
    await expect(amountHeader).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await amountHeader.boundingBox();
    expect(box ? box.x + box.width <= 700 : false).toBe(true);
  });

  test("(k) 1000 — 0줄 진행 표의 EMPTY에 「첫 줄 만들기」가 없다", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), []);
    await expect(page.getByText(EMPTY_MESSAGE)).toBeVisible();
    await expect(page.getByRole("button", { name: /첫 줄 만들기/ })).toHaveCount(0);
  });

  test("(l) 375 — 줄 추가가 없고 dirty 0이면 1차가 없으며, 기간 칸을 바꾸면 1차가 생긴다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);

    await expect(page.getByRole("grid", { name: "견적 줄" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "줄 추가", exact: true })).toHaveCount(0);
    await expect(primarySave(page)).toHaveCount(0);
    await changePeriodEnd(page, addDays(TODAY, 12));
    await expect(primarySave(page)).toContainText("일괄 저장 1");
  });

  test("(l2) 375 — 기간 칸 편집을 남기고 새로 고치면 복원 줄(두 버튼 같은 줄 · 44px 이상), 「복원」 뒤 기간 칸과 1차 1", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    const newEnd = addDays(TODAY, 10 + 10);
    await changePeriodEnd(page, newEnd);
    await expect(primarySave(page)).toContainText("일괄 저장 1");

    await page.reload();
    await expect(page.locator("p").getByText("저장 안 한 편집 1칸")).toBeVisible();
    const restore = page.getByRole("button", { name: "복원", exact: true });
    const discard = page.getByRole("button", { name: "버림", exact: true });
    const restoreBox = await restore.boundingBox();
    const discardBox = await discard.boundingBox();
    expect(restoreBox && discardBox ? restoreBox.y === discardBox.y : false).toBe(true);
    expect(restoreBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(discardBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await restore.click();
    await expect(page.locator("#period-end")).toHaveValue(newEnd);
    await expect(primarySave(page)).toContainText("일괄 저장 1");
  });

  // 사용자 결정 2026-09-26(VERDICT.md C-1) — 「버림」은 확인 없이 즉시 지우되, 몇 초간
  // 「편집을 버렸습니다 · 되돌리기」 토스트를 띄우고 「되돌리기」로 되살릴 수 있다.
  test("(l2c) 375 — 「버림」 뒤 되돌리기 토스트로 버린 편집을 되살린다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    const newEnd = addDays(TODAY, 10 + 10);
    await changePeriodEnd(page, newEnd);
    await expect(primarySave(page)).toContainText("일괄 저장 1");

    await page.reload();
    await expect(page.locator("p").getByText("저장 안 한 편집 1칸")).toBeVisible();
    await page.getByRole("button", { name: "버림", exact: true }).click();
    await expect(page.locator("p").getByText("저장 안 한 편집 1칸")).toHaveCount(0);

    const toast = page.getByRole("status").filter({ hasText: "편집을 버렸습니다" });
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "되돌리기" }).click();
    await expect(page.locator("#period-end")).toHaveValue(newEnd);
    await expect(primarySave(page)).toContainText("일괄 저장 1");
  });

  // /review R-1 — 「되돌리기」로 되살린 편집은 보관본에도 돌아가, 새로 고쳐도 복원 줄로 남는다.
  test("(l2d) 375 — 「되돌리기」 뒤 새로 고치면 복원 줄이 다시 뜬다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    await changePeriodEnd(page, addDays(TODAY, 10 + 10));
    await expect(primarySave(page)).toContainText("일괄 저장 1");

    await page.reload();
    await page.getByRole("button", { name: "버림", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "편집을 버렸습니다" }).getByRole("button", { name: "되돌리기" }).click();
    await expect(primarySave(page)).toContainText("일괄 저장 1");

    await page.reload();
    await expect(page.locator("p").getByText("저장 안 한 편집 1칸")).toBeVisible();
  });

  // /review R-2 — 저장을 시작하면 되돌리기 토스트를 치운다(저장 중·저장 뒤 옛 편집을 덮어쓰지 않게).
  test("(l2e) 375 — 「버림」 뒤 새 편집을 저장하면 되돌리기 토스트가 바로 사라진다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    await changePeriodEnd(page, addDays(TODAY, 10 + 10));
    await expect(primarySave(page)).toContainText("일괄 저장 1");

    await page.reload();
    await page.getByRole("button", { name: "버림", exact: true }).click();
    const toast = page.getByRole("status").filter({ hasText: "편집을 버렸습니다" });
    await expect(toast).toBeVisible();
    await changePeriodEnd(page, addDays(TODAY, 10 + 5));
    await primarySave(page).click();
    // 자동 소멸(4초)보다 짧게 본다 — 저장이 치운 것만 통과한다.
    await expect(toast).toHaveCount(0, { timeout: 1000 });
  });

  test("(l2) 표 칸만 — 1280에서 실행가만 고친 채 375로 새로 고치면 「복원」 뒤 1차 1이 렌더되고 저장된다(R1)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    await typeInto(page, cell(page, 0, COL.execution), "실행가", "654000");
    await expect(primarySave(page)).toContainText("일괄 저장 1");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.locator("p").getByText("저장 안 한 편집 1칸")).toBeVisible();
    await expect(primarySave(page)).toHaveCount(0);
    await page.getByRole("button", { name: "복원", exact: true }).click();
    await expect(primarySave(page)).toContainText("일괄 저장 1");
    const saved = waitForSaveResponse(page);
    await primarySave(page).click();
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/).first()).toBeVisible();

    await page.reload();
    await expect(lineCell(page, "폭 첫 줄", COL.execution)).toHaveText("654,000");
  });

  test("(l3) 1000 — 1280에서 고친 셀을 1000에서 복원하면 읽기 표에 dirty 인셋, 1차 1로 저장된다(R1)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    await typeInto(page, cell(page, 0, COL.execution), "실행가", "611000");
    await expect(primarySave(page)).toContainText("일괄 저장 1");

    await page.setViewportSize({ width: 1000, height: 800 });
    await page.reload();
    await expect(page.locator("p").getByText("저장 안 한 편집 1칸")).toBeVisible();
    await page.getByRole("button", { name: "복원", exact: true }).click();
    const restored = lineCell(page, "폭 첫 줄", COL.execution);
    await expect(restored).toHaveText("611,000");
    await expect(restored).toHaveCSS("box-shadow", /inset/);
    await expect(page.getByRole("grid", { name: "견적 줄" })).toHaveCount(0);
    await expect(primarySave(page)).toContainText("일괄 저장 1");

    const saved = waitForSaveResponse(page);
    await primarySave(page).click();
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/).first()).toBeVisible();
    await page.reload();
    await expect(lineCell(page, "폭 첫 줄", COL.execution)).toHaveText("611,000");
  });

  test("(l4) 375 — 셀을 눌러도 편집 입력이 생기지 않고, 행을 탭하면 행 시트로 읽는다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);

    const table = page.getByRole("table", { name: "견적 줄" });
    await lineCell(page, "폭 첫 줄", COL.execution).click();
    await expect(table.locator("input, textarea, select, [contenteditable='true']")).toHaveCount(0);

    await page.locator('[role="button"][aria-label*="상세 보기"]').first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("input, textarea, select, [contenteditable='true']")).toHaveCount(0);
    await expect(table.locator("input, textarea, select, [contenteditable='true']")).toHaveCount(0);
  });

  test("(m) 1100 — 번호·차익 열이 숨고, 실행가에서 → 는 숨은 차익을 건너뛰어 상태로 가며, 합계 행에 차익 합계가 있다", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);

    await expect(page.getByRole("columnheader", { name: "번호" })).toBeHidden();
    await expect(page.getByRole("columnheader", { name: "차익" })).toBeHidden();
    await expect(page.getByRole("columnheader", { name: "실행가" })).toBeVisible();

    // 숨은 칸은 접근성 트리에서 빠진다 — DOM 위치(td)로 고른다.
    await lineCell(page, "폭 첫 줄", COL.execution).focus();
    await page.keyboard.press("ArrowRight");
    await expect(lineCell(page, "폭 첫 줄", 9)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(lineCell(page, "폭 첫 줄", COL.execution)).toBeFocused();
    await expect(page.locator("tfoot").getByText(/차익 \d/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("(n) 1024 — 외화 단가 2행은 두 묶음 사이에서만 줄바꾸고 단가 열이 원화만 있을 때 폭 근처로 묶인다 (DR-14)", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    const krwWidth = await page.getByRole("columnheader", { name: "단가" }).evaluate((el) => el.getBoundingClientRect().width);

    await page.context().clearCookies();
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      ...TWO_LINES,
      { itemName: "외화 줄", unitPrice: 4400, execution: 3_000_000, unitPriceFx: { currency: "USD", fxRate: 1318.1818 } },
    ]);

    const fxWidth = await page.getByRole("columnheader", { name: "단가" }).evaluate((el) => el.getBoundingClientRect().width);
    // 두 묶음(`USD 4,400.00` · `@1,318.1818`)이 같은 줄이면 열이 그 합친 길이로 넓어진다 — 감사 FAIL(253px 대 145px).
    const [group1, group2] = await lineCell(page, "외화 줄", COL.unitPrice)
      .locator(`span > span`)
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(group1).not.toEqual(group2);
    expect(fxWidth).toBeLessThanOrEqual(krwWidth + 40);
  });

  test("(o) 1280에서 실행가 편집기에 친 값은 1000으로 줄어도 사라지지 않고 Enter로 커밋된다(리뷰 B-1)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    await lineCell(page, "폭 첫 줄", COL.execution).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "실행가", exact: true }).fill("555000");

    await page.setViewportSize({ width: 1000, height: 800 });
    await page.keyboard.press("Enter");
    await expect(lineCell(page, "폭 첫 줄", COL.execution)).toHaveText("555,000");
    await expect(primarySave(page)).toContainText("일괄 저장 1");
    await expect(page.getByRole("grid", { name: "견적 줄" })).toHaveCount(0);
  });

  test("(o2) 1280에서 비고 편집기에 친 값은 1000에서 비고 열이 숨어도 커밋된다(리뷰 B-1)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    await lineCell(page, "폭 첫 줄", COL.note).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "비고", exact: true }).fill("폭 전환 비고");

    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(primarySave(page)).toContainText("일괄 저장 1");
    await expect(page.getByRole("grid", { name: "견적 줄" })).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(lineCell(page, "폭 첫 줄", COL.note)).toHaveText("폭 전환 비고");
  });
});

// 04-26(D-86 · A-17) — 전역 상한 설정을 바꾸지 않는다. 기본 상한 300 그대로 준비 단계에서 SQL 한 문장으로 그 차수에
// 줄을 채운다(병렬 스펙이 낮은 상한에 걸리지 않고, 실패해도 설정이 테스트 DB에 남지 않는다).
const CAP_REASON = "300줄 상한 · 상한은 관리자 설정";

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

// 300줄 표에서는 Playwright의 `:has()` 엔진(dataRows)이 행 수 한 번에 약 49초가 걸린다(브라우저 querySelectorAll은
// 6ms — 실측). 상한 케이스는 브라우저가 직접 평가하는 XPath로 행·칸을 찾는다(같은 행·같은 칸 순서).
function capRows(page: Page): Locator {
  return page.locator('xpath=//tbody/tr[td[@role="gridcell"]]');
}

function capCell(page: Page, rowIndex: number, colIndex: number): Locator {
  return capRows(page).nth(rowIndex).locator('xpath=./td[@role="gridcell"]').nth(colIndex);
}

async function openCappedAsPm(page: Page, lineCount: number) {
  const team = await makeTeam();
  const pm = await makeAccount(DEFAULT_ROLE_ID, team);
  const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "in_progress", endDate: addDays(TODAY, 10) });
  await fillLinesBySql(project.id, lineCount);
  await login(page, pm);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await expect(capRows(page)).toHaveCount(lineCount);
  return project;
}

test.describe("줄 수 상한 (04-26, D-86 · UX-04 · UX-05)", () => {
  test("(cap1) 줄 300(기본 상한) — 「줄 추가」가 aria-disabled이고 이유 한 줄을 aria-describedby로 가리킨다", async ({ page }) => {
    await openCappedAsPm(page, 300);

    const addButton = page.getByRole("button", { name: "줄 추가", exact: true });
    await expect(addButton).toHaveAttribute("aria-disabled", "true");
    const reason = page.getByText(CAP_REASON, { exact: true });
    await expect(reason).toBeVisible();
    const reasonId = await reason.getAttribute("id");
    expect(reasonId).toBeTruthy();
    expect((await addButton.getAttribute("aria-describedby"))?.split(" ")).toContain(reasonId);
  });

  test("(cap2) 줄 300에서 Ctrl+Enter·Ctrl+D는 줄을 만들지 않고 합계 행에 상한 이유를 적으며, 다음 저장 시도 뒤 그 글자가 없다", async ({ page }) => {
    await openCappedAsPm(page, 300);
    const footerNotice = page.locator("tfoot").getByText(CAP_REASON, { exact: true });

    await focusGridCell(capCell(page, 0, COL.itemName));
    await page.keyboard.press("Control+Enter");
    await expect(footerNotice).toBeVisible();
    await expect(capRows(page)).toHaveCount(300);

    // 저장 시도는 상한 글자를 지운다(위 attemptSave/onSave 주석) — Ctrl+D의 단언을 Ctrl+Enter의 잔상과 분리한다.
    await saveWithKeyboard(page, capCell(page, 0, COL.itemName));
    await expect(footerNotice).toHaveCount(0);

    await focusGridCell(capCell(page, 0, COL.itemName));
    await page.keyboard.press("Control+d");
    await expect(footerNotice).toBeVisible();
    await expect(capRows(page)).toHaveCount(300);
    await expect(primarySave(page)).toHaveAttribute("aria-disabled", "true");

    await typeInto(page, capCell(page, 0, COL.execution), "실행가", "700");
    await saveWithKeyboard(page, capCell(page, 0, COL.itemName));
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();
    await expect(footerNotice).toHaveCount(0);
  });

  test("(cap3) 줄 299의 마지막 줄에 세 줄짜리 TSV를 붙여 넣으면 한 칸도 바뀌지 않고 합계 행에 전부 거부 이유가 나오며, 다음 붙여넣기 때 사라진다", async ({ page }) => {
    await openCappedAsPm(page, 299);
    const lastItem = capCell(page, 298, COL.itemName);
    await expect(lastItem).toHaveText("상한 줄 299");
    const pasteNotice = page.locator("tfoot").getByText("붙여넣기 전부 거부 · 300줄 상한을 1줄 넘음", { exact: true });

    await focusGridCell(lastItem);
    await pasteIntoFocusedCell(page, "붙인 1\n붙인 2\n붙인 3");
    await expect(pasteNotice).toBeVisible();
    await expect(capRows(page)).toHaveCount(299);
    await expect(lastItem).toHaveText("상한 줄 299");
    await expect(primarySave(page)).toHaveAttribute("aria-disabled", "true");

    await focusGridCell(lastItem);
    await pasteIntoFocusedCell(page, "붙인 하나");
    await expect(lastItem).toHaveText("붙인 하나");
    await expect(pasteNotice).toHaveCount(0);
  });
});

// 검토 8(UI-SPEC S18 · §7-3 (나)) — 「복원」은 보관할 때의 줄 version·기간 기준값으로 저장한다. 그 사이 동료가
// 같은 칸을 저장했으면 복원 뒤 저장은 충돌로 거부되고 동료 값이 남는다(조용히 덮지 않는다).
test.describe("복원 뒤 저장 — 그 사이 동료 저장은 충돌 (검토 8)", () => {
  test("실행가: 복원한 칸이 충돌 셀이 되고 DB에는 동료 값이 남는다", async ({ page }) => {
    const { project } = await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    await typeInto(page, cell(page, 0, COL.execution), "실행가", "654000");
    await expect(primarySave(page)).toContainText("일괄 저장 1");

    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("차수가 없습니다");
    const theirs = and(eq(quoteLines.revisionId, revision.id), eq(quoteLines.itemName, "폭 첫 줄"));
    await db
      .update(quoteLines)
      .set({ executionAmountKrw: 700_000, profitKrw: 300_000, version: sql`${quoteLines.version} + 1`, updatedAt: new Date() })
      .where(theirs);

    await page.reload();
    await page.getByRole("button", { name: "복원", exact: true }).click();
    await expect(cell(page, 0, COL.execution)).toHaveText("654,000");
    await saveWithKeyboard(page, cell(page, 0, COL.execution));

    await expect(cell(page, 0, COL.execution)).toContainText(/다른 사람이 \d{2}:\d{2}에 700,000으로 바꿈 · 덮어쓰기 \/ 그 값으로/);
    const [saved] = await db.select().from(quoteLines).where(theirs);
    expect(saved?.executionAmountKrw).toBe(700_000);
  });

  test("기간: 복원한 종료일 저장은 기간 충돌이 되고 DB에는 동료 종료일이 남는다", async ({ page }) => {
    const { project } = await openAsPm(page, "in_progress", addDays(TODAY, 10), TWO_LINES);
    await changePeriodEnd(page, addDays(TODAY, 30));
    await expect(primarySave(page)).toContainText("일괄 저장 1");

    const theirEnd = addDays(TODAY, 20);
    await db.update(projects).set({ endDate: theirEnd }).where(eq(projects.id, project.id));

    await page.reload();
    await page.getByRole("button", { name: "복원", exact: true }).click();
    await expect(page.locator("#period-end")).toHaveValue(addDays(TODAY, 30));
    await saveWithKeyboard(page, page.locator("#period-end"));

    await expect(page.getByText("다른 사람이 먼저 기간을 바꿈 · 새로 고침")).toBeVisible();
    const [saved] = await db.select({ endDate: projects.endDate }).from(projects).where(eq(projects.id, project.id));
    expect(saved?.endDate).toBe(theirEnd);
  });
});
