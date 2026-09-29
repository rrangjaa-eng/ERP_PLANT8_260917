import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { and, eq, isNull, sql, sum } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteLines, teams } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { parseTsv } from "@/ui/table/parse-tsv";
import {
  REAL_EXCEL_WINDOWS_20260923,
  REAL_EXCEL_WINDOWS_20260928_SIX_COL,
  REAL_EXCEL_WINDOWS_20260928_FORTY_FIVE,
  buildFortyFiveLineCapture,
} from "@/test/fixtures/excel-clipboard";

// 04-31 Task 1 — 04-04 뒤에 바뀐 최종 견적 표(쪽 나눔 04-19 · 계산 열 무시·외화 경고·
// 합계 행 한 줄·끝 줄바꿈 04-47 · 줄 수 상한 04-26)에서도 실제 엑셀 캡처 원문이 그대로
// 재생되는지 다시 본다(사용자 D21, OV-7). 원문은 test/fixtures/excel-clipboard.ts
// 하나뿐이다 — 손으로 만든 문자열이 아니다(2026-09-23 사용자 승인 — 04-04 방식).

const COL = { subcategory: 1, itemName: 2, vendor: 3, quantity: 4, unitPrice: 5, quoteAmount: 6, execution: 7, note: 10 } as const;

type Account = { userId: string; email: string; password: string };

async function makeTeam(): Promise<string> {
  const [team] = await db.select().from(teams).limit(1);
  if (team) return team.id;
  throw new Error("시드된 팀이 없습니다");
}

async function makeAccount(name = "E2E 엑셀최종"): Promise<Account> {
  const email = `e2e-excel-final-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId: DEFAULT_ROLE_ID });
  return { userId, email, password: tempPassword };
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

type SeedLine = { subcategory: string; itemName: string; amount: number; currency?: "KRW" | "USD"; fxRate?: number; vendorId?: string };

async function makeProject(pmUserId: string, name: string): Promise<{ id: string; name: string }> {
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `${name}클라이언트`, normalizedName: `${name}클라이언트`.toLowerCase() });
  const teamId = await makeTeam();
  const created = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId, pmUserId, name });
  return { id: created.id, name };
}

async function seedLines(revisionId: string, rows: SeedLine[]) {
  if (rows.length === 0) return;
  await saveQuoteLines(SYSTEM_VIEWER, revisionId, {
    rows: rows.map((row) => ({
      id: randomUUID(),
      isNew: true as const,
      subcategory: row.subcategory,
      itemName: row.itemName,
      vendorId: row.vendorId ?? null,
      unitPrice: { currency: row.currency ?? ("KRW" as const), amount: row.amount, fxRate: row.fxRate ?? 1 },
      execution: { currency: "KRW" as const, amount: 0, fxRate: 1 },
    })),
  });
}

async function quoteTotalKrw(revisionId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(quoteLines.quoteAmountKrw) })
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)));
  return Number(row?.total ?? 0);
}

function quoteTable(page: Page): Locator {
  return page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) });
}

function quoteDataRows(page: Page): Locator {
  return quoteTable(page).locator('tbody tr:has(td[role="gridcell"])');
}

function quoteCell(page: Page, rowIndex: number, colIndex: number): Locator {
  return quoteDataRows(page).nth(rowIndex).getByRole("gridcell").nth(colIndex);
}

// 수화가 끝나기 전에 준 포커스는 React가 받지 못해 격자 포커스(roving tabindex)가
// (0,0)에 남고, 그 뒤 붙여넣기·키는 (0,0)에서 처리된다(quote-edit-scope.spec.ts와
// 같은 함정). 쪽 전환 버튼 클릭(changePage)은 그 자체로 새 쪽 첫 줄에 포커스 요청을
// 내는 비동기 효과를 건다 — 그 효과가 먼저 자리 잡을 때까지(격자 안에 tabindex=0인
// 칸이 정확히 하나로 안정될 때까지) 기다린 뒤에야 우리 쪽 포커스로 덮어써야
// 레이스(우리가 준 포커스를 그 효과가 뒤늦게 되돌리는 것)가 없다.
async function focusGridCell(page: Page, target: Locator) {
  await expect(quoteTable(page).locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
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

async function pasteWithFormats(page: Page, formats: Record<string, string>) {
  await page.evaluate((data) => {
    const transfer = new DataTransfer();
    for (const [format, value] of Object.entries(data)) transfer.setData(format, value);
    const event = new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(event);
  }, formats);
}

function isServerAction(request: { method: () => string; headers: () => Record<string, string> }) {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

async function saveAndWait(page: Page) {
  const saved = page.waitForResponse((response) => isServerAction(response.request()));
  await page.getByRole("button", { name: /일괄 저장/ }).click();
  await saved;
}

const invalidCells = (page: Page) => quoteTable(page).locator('td[aria-invalid="true"]');

async function footerPieces(page: Page): Promise<{ tone: string; text: string }[]> {
  return quoteTable(page)
    .locator("tfoot [data-tone]")
    .evaluateAll((elements) => elements.map((element) => ({ tone: element.getAttribute("data-tone") ?? "", text: (element.textContent ?? "").trim() })));
}

async function expectLineTotal(page: Page, lineCount: number) {
  await expect(page.locator("tfoot", { hasText: "합계 (공급가액" })).toContainText(`합계 (공급가액 · ${lineCount}줄)`);
}

test.describe("실제 엑셀 캡처 원문 — 최종 견적 표 재생(04-31 Task 1, 사용자 D21 · OV-7)", () => {
  test("(a) 3×3 캡처가 쪽 나눔이 있는 표(2쪽)에서도 그대로 재생되고 저장·새로고침 뒤 같다 — 45줄 조립 문자열은 46번째 빈 줄 없이 전부 들어간다", async ({ page }) => {
    // Part A — 33줄(2쪽 — 1쪽 30줄 · 2쪽 3줄) 프로젝트의 2쪽 기존 세 줄에 3×3 캡처를
    // 재생한다. 세 줄을 미리 저장해 두어 붙여넣기가 새 줄을 만들지 않는다 — 페이지
    // 전환 직후 "새 줄 고정"(pinNewRows) 재계산과 겹치는 붙여넣기 레이스를 피한다.
    const account = await makeAccount();
    const pagedProject = await makeProject(account.userId, `E2E엑셀최종쪽-${Date.now()}`);
    const pagedRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, pagedProject.id);
    if (!pagedRevision) throw new Error("1차 차수가 없습니다");
    await seedLines(
      pagedRevision.id,
      Array.from({ length: 33 }, (_, index) => ({ subcategory: "stage_construction", itemName: `쪽확인${index + 1}`, amount: 1000 })),
    );

    await login(page, account);
    await page.goto(`/projects/${pagedProject.id}`);
    await expect(page.getByRole("heading", { name: pagedProject.name })).toBeVisible();
    await expect(quoteDataRows(page)).toHaveCount(30);

    await page.getByRole("navigation", { name: "견적 줄 페이지", exact: true }).getByRole("button", { name: "2", exact: true }).click();
    await expect(quoteDataRows(page)).toHaveCount(3);
    const pagedUrl = page.url();

    // 04-04(g)와 같은 매핑 — 항목(2)과 수량·단가(4·5)는 거래처 select 칸(3)이
    // 사이에 있어 두 번에 나눠 주입한다. 캡처를 손으로 다시 타이핑하지 않고
    // REAL_EXCEL_WINDOWS_20260923을 직접 parseTsv로 읽어 열을 나눈다 — 캡처가
    // 바뀌면 이 스펙도 같이 바뀐다. 줄바꿈이 있는 칸만 다시 인용한다(실제 엑셀 규칙).
    const capturedDataRows = parseTsv(REAL_EXCEL_WINDOWS_20260923).slice(1); // 헤더 행 제거 — [번호, 항목, 수량, 단가][]
    const quoteIfMultiline = (value: string) => (value.includes("\n") ? `"${value.replace(/\n/g, "\r\n")}"` : value);
    const itemNamePaste = capturedDataRows.map((row) => quoteIfMultiline(row[1] ?? "")).join("\n");
    const numberPaste = capturedDataRows.map((row) => `${row[2]}\t${row[3]}`).join("\n");

    await focusGridCell(page, quoteCell(page, 0, COL.itemName));
    await pasteIntoFocusedCell(page, itemNamePaste);
    // 04-19 힌트 줄의 실제 이동 키(ArrowRight)로 거래처(3)를 지나 수량(4)까지 옮긴다 —
    // 우리 쪽 raw .focus() 재호출 대신 격자 자신의 키보드 경로를 그대로 탄다.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await pasteIntoFocusedCell(page, numberPaste);

    async function assertPagedValues() {
      await expect(quoteCell(page, 0, COL.itemName)).toHaveText("무대 설치");
      expect(await quoteCell(page, 1, COL.itemName).textContent()).toBe('"대형" 현수막');
      const row3Text = await quoteCell(page, 2, COL.itemName).textContent();
      expect(row3Text).not.toContain("\r");
      expect(row3Text).toBe("비고 첫 줄\n둘째 줄");

      await expect(quoteCell(page, 0, COL.quantity)).toHaveText("2");
      await expect(quoteCell(page, 0, COL.unitPrice)).toHaveText("1,200,000");
      await expect(quoteCell(page, 1, COL.quantity)).toHaveText("5");
      await expect(quoteCell(page, 1, COL.unitPrice)).toHaveText("35,000");
      await expect(quoteCell(page, 2, COL.quantity)).toHaveText("1");
      await expect(quoteCell(page, 2, COL.unitPrice)).toHaveText("450,000");
    }

    await assertPagedValues();
    await expect(invalidCells(page)).toHaveCount(0);

    await saveAndWait(page);
    await expect(page.getByText(/저장됨/)).toBeVisible();

    // 04-47(§7-3 (자)) — 쪽 번호는 URL이 아니라 화면 상태다(다른 04-19 테스트가 이미
    // 확인: 쪽을 바꿔도 URL은 그대로다). 새로고침은 그 상태를 지우고 1쪽으로
    // 돌아간다 — 재확인 전에 2쪽으로 다시 옮긴다(안 그러면 1쪽 값과 비교하게 된다).
    await page.reload();
    expect(page.url()).toBe(pagedUrl);
    await expect(quoteDataRows(page)).toHaveCount(30);
    await page.getByRole("navigation", { name: "견적 줄 페이지", exact: true }).getByRole("button", { name: "2", exact: true }).click();
    await expect(quoteDataRows(page).first()).toBeVisible();
    await assertPagedValues();

    // Part B — 10줄 표 첫 셀에 45줄 조립 문자열(두 변형)을 붙이면 46번째
    // 빈 줄 없이 정확히 45줄이 들어가고 오류 칸이 없다(C-05).
    const tenLineProject = await makeProject(account.userId, `E2E엑셀최종10줄-${Date.now()}`);
    const tenLineRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, tenLineProject.id);
    if (!tenLineRevision) throw new Error("1차 차수가 없습니다");
    await seedLines(
      tenLineRevision.id,
      Array.from({ length: 10 }, (_, index) => ({ subcategory: "stage_construction", itemName: `10줄${index + 1}`, amount: 1000 })),
    );
    await page.goto(`/projects/${tenLineProject.id}`);
    await expect(page.getByRole("heading", { name: tenLineProject.name })).toBeVisible();
    await expect(quoteDataRows(page)).toHaveCount(10);

    await focusGridCell(page, quoteCell(page, 0, COL.itemName));
    await pasteIntoFocusedCell(page, buildFortyFiveLineCapture({ trailingNewline: false }));
    await expectLineTotal(page, 45);
    await expect(invalidCells(page)).toHaveCount(0);

    // 끝 줄바꿈이 있는 변형도 46번째 빈 줄을 만들지 않는다 — 여전히 45줄.
    await focusGridCell(page, quoteCell(page, 0, COL.itemName));
    await pasteIntoFocusedCell(page, buildFortyFiveLineCapture({ trailingNewline: true }));
    await expectLineTotal(page, 45);
    await expect(invalidCells(page)).toHaveCount(0);
  });

  test("(a2, ENG-D5) 앱 형식 없는 엑셀 6열(소분류·항목·거래처·수량·단가·실행가)을 소분류 칸에 붙이면 실행가 값이 떨어지는 견적가 칸이 오류다", async ({ page }) => {
    const account = await makeAccount();
    const project = await makeProject(account.userId, `E2E엑셀6열-${Date.now()}`);
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E엑셀6열거래처-${Date.now()}`, normalizedName: `e2e엑셀6열거래처-${Date.now()}` });
    await seedLines(revision.id, [
      { subcategory: "stage_construction", itemName: "엑셀6열앞줄1", amount: 1000 },
      { subcategory: "stage_construction", itemName: "엑셀6열앞줄2", amount: 1000 },
    ]);

    await login(page, account);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();

    // text/plain만 실은(앱 전용 형식 없는) 실제 엑셀 붙여넣기 흉내 — 계산 열 무시는
    // 앱 복사일 때만 적용된다(04-47). 끝 CRLF 하나(실제 엑셀 관례)를 둔다.
    await focusGridCell(page, quoteCell(page, 0, COL.subcategory));
    await pasteWithFormats(page, {
      "text/plain": `무대·시공\t엑셀6열항목1\t${vendor.name}\t2\t1000\t800\r\n무대·시공\t엑셀6열항목2\t${vendor.name}\t3\t2000\t900\r\n`,
    });

    await expect(quoteCell(page, 0, COL.itemName)).toHaveText("엑셀6열항목1");
    await expect(invalidCells(page)).toHaveCount(2);
    await expect(quoteCell(page, 0, COL.quoteAmount)).toHaveAttribute("aria-invalid", "true");
    await expect(quoteCell(page, 1, COL.quoteAmount)).toHaveAttribute("aria-invalid", "true");
    await expect(quoteCell(page, 0, COL.quoteAmount)).toContainText("읽기 전용·잠김 셀에 값 떨어짐");
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "danger", text: "오류 2칸" }]);
    // 앱 형식이 없으므로 계산 열 무시 조각은 나오지 않는다(ENG-D5 — 조용히 사라지지 않는다).
    expect((await footerPieces(page)).some((piece) => piece.text.includes("계산 열"))).toBe(false);

    // 04-47(DR-5) — 오류가 남아도 1차는 살아 있다(옛 오류 게이트로 비활성하지 않는다).
    // 저장은 거부 경로(서버 전부 저장/전부 거부)를 탄다 — 클릭이 막히는 게 아니다.
    const saveButton = page.getByRole("button", { name: /일괄 저장/ });
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).not.toHaveAttribute("aria-disabled", "true");
  });

  test("(b) 60줄 표 29번째 줄부터 5줄을 붙이면 29~33번째가 바뀌고 화면은 1쪽에 머물며 합계 행에 「2쪽까지」가 보인다", async ({ page }) => {
    const account = await makeAccount();
    const project = await makeProject(account.userId, `E2E엑셀쪽경계-${Date.now()}`);
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    await seedLines(
      revision.id,
      Array.from({ length: 60 }, (_, index) => ({ subcategory: "stage_construction", itemName: `쪽경계${index + 1}`, amount: 1000 })),
    );

    await login(page, account);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(quoteDataRows(page)).toHaveCount(30);
    const url = page.url();

    // 29번째 줄(0-based 28) — 5줄 붙여넣기로 29~33번째까지 채운다(31~33은 2쪽).
    await focusGridCell(page, quoteCell(page, 28, COL.itemName));
    await pasteIntoFocusedCell(page, "쪽경계새29\n쪽경계새30\n쪽경계새31\n쪽경계새32\n쪽경계새33");

    // 화면은 1쪽 그대로.
    expect(page.url()).toBe(url);
    await expect(quoteDataRows(page)).toHaveCount(30);
    await expect(quoteCell(page, 28, COL.itemName)).toHaveText("쪽경계새29");
    await expect(quoteCell(page, 29, COL.itemName)).toHaveText("쪽경계새30");
    await expect.poll(() => footerPieces(page)).toContainEqual({ tone: "muted", text: "2쪽까지" });

    // 2쪽의 31~33번째 줄도 바뀌었다(쪽을 넘는 채우기, 04-47).
    await page.getByRole("navigation", { name: "견적 줄 페이지", exact: true }).getByRole("button", { name: "2", exact: true }).click();
    await expect(quoteCell(page, 0, COL.itemName)).toHaveText("쪽경계새31");
    await expect(quoteCell(page, 1, COL.itemName)).toHaveText("쪽경계새32");
    await expect(quoteCell(page, 2, COL.itemName)).toHaveText("쪽경계새33");
  });

  test("(c, C-03·C-19) 두 그룹·USD 1줄·45줄을 Ctrl+A → Ctrl+C(네이티브 복사)로 옮기면 오류 0·계산 열 무시·외화 경고가 보이고 원화 합계가 같다", async ({ page }) => {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 6)}`;
    const account = await makeAccount("E2E Roundtrip Final");
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E최종왕복-${stamp}`, normalizedName: `e2e최종왕복-${stamp}` });
    const teamId = await makeTeam();
    const source = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId, pmUserId: account.userId, name: `E2E최종왕복원본-${stamp}` });
    const target = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId, pmUserId: account.userId, name: `E2E최종왕복대상-${stamp}` });
    const sourceRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, source.id);
    const targetRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, target.id);
    if (!sourceRevision || !targetRevision) throw new Error("1차 차수가 없습니다");
    await seedLines(sourceRevision.id, [
      ...Array.from({ length: 20 }, (_, index) => ({ subcategory: "stage_construction", itemName: `최종왕복A${index + 1}`, amount: 1000 * (index + 1), vendorId: vendor.id })),
      { subcategory: "print_production", itemName: "최종왕복USD", amount: 100, currency: "USD" as const, fxRate: 1300, vendorId: vendor.id },
      ...Array.from({ length: 24 }, (_, index) => ({ subcategory: "print_production", itemName: `최종왕복B${index + 1}`, amount: 2500, vendorId: vendor.id })),
    ]);

    await login(page, account);
    await page.goto(`/projects/${source.id}`);
    await expect(quoteDataRows(page)).toHaveCount(30);
    await page.evaluate(() => {
      window.addEventListener("copy", (event) => {
        const data = event.clipboardData;
        (window as unknown as { __copied?: Record<string, string> }).__copied = {
          "text/plain": data?.getData("text/plain") ?? "",
          "application/x-plant8-quote-lines+json": data?.getData("application/x-plant8-quote-lines+json") ?? "",
        };
      });
    });
    await expect(async () => {
      await quoteCell(page, 3, COL.itemName).focus();
      await page.keyboard.press("Control+a");
      await expect(quoteCell(page, 29, COL.itemName)).toHaveClass(/selectedCell/, { timeout: 1000 });
    }).toPass();
    await page.keyboard.press("Control+c");
    const copied = (await (await page.waitForFunction(() => (window as unknown as { __copied?: Record<string, string> }).__copied)).jsonValue()) as Record<string, string>;
    expect(JSON.parse(copied["application/x-plant8-quote-lines+json"] ?? "[]")).toHaveLength(45);

    await page.goto(`/projects/${target.id}`);
    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    await focusGridCell(page, quoteCell(page, 0, 0));
    await pasteWithFormats(page, copied);

    // 저장 전(수화·서버 재조회 전)이라 쪽이 다시 나뉘지 않는다 — 45줄이 한 쪽에 그대로 있다(04-47과 같은 관찰).
    await expect(quoteDataRows(page)).toHaveCount(45);
    await expectLineTotal(page, 45);
    await expect(invalidCells(page)).toHaveCount(0);
    await expect.poll(() => footerPieces(page)).toEqual([
      { tone: "muted", text: "붙여넣기 45줄" },
      { tone: "warning", text: "외화 1줄 원화로" },
      { tone: "muted", text: "계산 열 180칸 무시" },
    ]);

    await saveAndWait(page);
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "success", text: expect.stringMatching(/^저장됨 45줄 \d{2}:\d{2}$/) }]);
    expect(await quoteTotalKrw(targetRevision.id)).toBe(await quoteTotalKrw(sourceRevision.id));
  });

  test("(d, C-05×상한) 줄 수 상한(기본 300)에서 남은 수와 정확히 같은 줄은 끝 줄바꿈이 있어도 전부 들어가고, 하나 더 넘치면 통째로 거부된다", async ({ page }) => {
    const account = await makeAccount("E2E 상한최종");
    const project = await makeProject(account.userId, `E2E상한최종-${Date.now()}`);
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("소분류 코드가 없습니다");
    await db.execute(sql`
      INSERT INTO quote_lines (revision_id, sort_order, subcategory, item_name, unit_price_amount_krw, execution_amount_krw, quote_amount_krw, profit_krw)
      SELECT ${revision.id}, g, ${subcategory.value}, '상한최종 줄 ' || g, 1000, 500, 1000, 500 FROM generate_series(1, 299) AS g
    `);

    await login(page, account);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await page.getByRole("navigation", { name: "견적 줄 페이지", exact: true }).getByRole("button", { name: "10", exact: true }).click();
    const lastItem = quoteCell(page, 28, COL.itemName); // 299줄 = 10쪽, 마지막 쪽 29번째 줄이 299번째 줄.
    await expect(lastItem).toHaveText("상한최종 줄 299");

    // 남은 자리(1)보다 하나 더(2줄 새로 필요) — 끝 줄바꿈이 있어도 전부 거부되고 한 칸도 안 바뀐다.
    const pasteNotice = page.locator("tfoot").getByText(/붙여넣기 전부 거부 · 300줄 상한을 \d+줄 넘음/);
    await focusGridCell(page, lastItem);
    await pasteIntoFocusedCell(page, "상한최종넘침덮기\r\n상한최종넘침300\r\n상한최종넘침301\r\n");
    await expect(pasteNotice).toBeVisible();
    await expectLineTotal(page, 299);
    await expect(lastItem).toHaveText("상한최종 줄 299");
    await expect(page.getByRole("button", { name: /일괄 저장/ })).toHaveAttribute("aria-disabled", "true");

    // 남은 자리와 정확히 같은 수(1줄 새로 필요) — 끝 줄바꿈이 있어도 46번째(여기선 301번째) 빈 줄을 만들지 않고 그대로 들어간다.
    await focusGridCell(page, lastItem);
    await pasteIntoFocusedCell(page, "상한최종덮기\r\n상한최종새300\r\n");
    await expect(pasteNotice).toHaveCount(0);
    await expect(lastItem).toHaveText("상한최종덮기");
    await expectLineTotal(page, 300);
    await expect(quoteCell(page, 29, COL.itemName)).toHaveText("상한최종새300");
  });

  test("(e, 캡처 A) PR #85 실제 6열 캡처(헤더 행 포함) — 앱 열 순서와 어긋나 견적가 칸들이 ENG-D5 오류다", async ({ page }) => {
    // 04-31 Task 2 인간 확인(2026-09-28, PR #85 댓글 5861946973) — 사람 눈 재확인 대신
    // 원문(REAL_EXCEL_WINDOWS_20260928_SIX_COL, 헤더 행 A..F + 데이터 2행)을 손대지
    // 않고 그대로 붙인다. 캡처의 6열(항목류·항목·거래처·수량·단가·실행가)과 앱 열
    // (소분류·항목·거래처·수량·단가·견적가) 순서가 어긋나 6번째 값(실행가)이 잠긴
    // 견적가 칸에 떨어진다 — 값이 헤더 글자 "F"든 실제 금액이든, 잠긴 칸은 값이
    // 무엇이든 무조건 오류다(ENG-D5, applyPaste의 `!editable` 분기가 kind보다 먼저다).
    const account = await makeAccount();
    const project = await makeProject(account.userId, `E2E엑셀캡처A-${Date.now()}`);
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    await seedLines(
      revision.id,
      Array.from({ length: 3 }, (_, index) => ({ subcategory: "stage_construction", itemName: `캡처A${index + 1}`, amount: 1000 })),
    );

    await login(page, account);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();

    await focusGridCell(page, quoteCell(page, 0, COL.subcategory));
    await pasteWithFormats(page, { "text/plain": REAL_EXCEL_WINDOWS_20260928_SIX_COL });

    await expect(quoteCell(page, 0, COL.itemName)).toHaveText("B");
    const row1Text = await quoteCell(page, 1, COL.itemName).textContent();
    expect(row1Text).not.toContain("\r");
    expect(row1Text).toBe("무대 설치\n2일차");
    expect(await quoteCell(page, 2, COL.itemName).textContent()).toBe('"대형" 현수막');

    for (const rowIndex of [0, 1, 2]) {
      await expect(quoteCell(page, rowIndex, COL.quoteAmount)).toHaveAttribute("aria-invalid", "true");
      await expect(quoteCell(page, rowIndex, COL.quoteAmount)).toContainText("읽기 전용·잠김 셀에 값 떨어짐");
    }

    // 04-47(DR-5) — 오류가 남아도 저장 버튼은 눌린다(거부 경로는 서버가 판단).
    await expect(page.getByRole("button", { name: /일괄 저장/ })).toBeEnabled();
  });

  test("(f, 캡처 B) PR #85 실제 45줄 캡처 — 저장·새로고침 뒤에도 10번째 줄 빈 비고를 포함해 그대로다", async ({ page }) => {
    // 04-31 Task 2 인간 확인(2026-09-28, PR #85 댓글 5861989538) — 원문
    // (REAL_EXCEL_WINDOWS_20260928_FORTY_FIVE, 45줄·10번째 줄만 비고 칸이 빈 캡처)을
    // 항목·거래처(사이) 때문에 04-04(g)와 같은 이유로 세 번(항목 · 수량+단가 ·
    // 비고)에 나눠 붙인다. 저장·새로고침 뒤에도 값이 같은지 본다(고정 대기 없이
    // page.waitForResponse로 서버 액션 응답을 기다린다).
    const account = await makeAccount();
    const project = await makeProject(account.userId, `E2E엑셀캡처B-${Date.now()}`);
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    await seedLines(revision.id, [{ subcategory: "stage_construction", itemName: "캡처B시작", amount: 1000 }]);

    await login(page, account);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(quoteDataRows(page)).toHaveCount(1);

    const capturedRows = parseTsv(REAL_EXCEL_WINDOWS_20260928_FORTY_FIVE);
    expect(capturedRows).toHaveLength(45);
    const itemNamePaste = capturedRows.map((row) => row[0]).join("\n");
    const numberPaste = capturedRows.map((row) => `${row[1]}\t${row[2]}`).join("\n");
    const notePaste = capturedRows.map((row) => row[3]).join("\n");

    await focusGridCell(page, quoteCell(page, 0, COL.itemName));
    await pasteIntoFocusedCell(page, itemNamePaste);
    await focusGridCell(page, quoteCell(page, 0, COL.quantity));
    await pasteIntoFocusedCell(page, numberPaste);
    await focusGridCell(page, quoteCell(page, 0, COL.note));
    await pasteIntoFocusedCell(page, notePaste);

    await expectLineTotal(page, 45);
    await expect(invalidCells(page)).toHaveCount(0);

    await saveAndWait(page);
    await expect(page.getByText(/저장됨/)).toBeVisible();

    // 새로고침은 쪽 상태를 지우고 1쪽으로 돌아간다(04-47 §7-3 (자)).
    await page.reload();
    await expect(quoteDataRows(page)).toHaveCount(30);

    await expect(quoteCell(page, 0, COL.itemName)).toHaveText("항목1");
    await expect(quoteCell(page, 0, COL.quantity)).toHaveText("2");
    await expect(quoteCell(page, 0, COL.unitPrice)).toHaveText("10,000");
    await expect(quoteCell(page, 0, COL.note)).toHaveText("비고");

    // 10번째 줄(0-based 9) — 캡처에서 비고 칸이 비어 있던 줄. 빈 비고의 읽기 표시는 "—"다.
    await expect(quoteCell(page, 9, COL.itemName)).toHaveText("항목10");
    await expect(quoteCell(page, 9, COL.note)).toHaveText("—");

    await page.getByRole("navigation", { name: "견적 줄 페이지", exact: true }).getByRole("button", { name: "2", exact: true }).click();
    await expect(quoteDataRows(page)).toHaveCount(15);
    await expect(quoteCell(page, 14, COL.itemName)).toHaveText("항목45");
    await expect(quoteCell(page, 14, COL.quantity)).toHaveText("2");
    await expect(quoteCell(page, 14, COL.unitPrice)).toHaveText("10,000");
    await expect(quoteCell(page, 14, COL.note)).toHaveText("비고");
  });
});
