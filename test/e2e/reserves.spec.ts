import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { db } from "@/db/client";
import { codeItems, projects, reserveEntries } from "@/db/schema";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { recentFxRate } from "@/domain/money/currency";
import { createProject } from "@/domain/projects";
import { createAccount } from "@/domain/auth/accounts";
import { createOrgUnit, createTeam } from "@/domain/org";
import { eq } from "drizzle-orm";

// 04-42 — 클라이언트별 리저브 대장(S9). 리저브는 회사 전체 원장 하나라 이 스펙만 쓴다 — 케이스마다 비우고 시작한다.
// 계급은 이 스펙이 만든 임시 계급이다(공용 계급의 권한을 바꾸지 않는다).
type Roles = { finance: string; reader: string; hidden: string };

async function createRole(name: string, grants: { menu: string; action: string }[], reserveVisible: boolean, alsoVisible: string[] = []): Promise<string> {
  const id = `role-e2e-rsv-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id, name: `E2E 리저브 ${name} ${id.slice(-8)}`, sortOrder: 99 });
  for (const grant of grants) await upsertPermission(SYSTEM_VIEWER, { roleId: id, menu: grant.menu, action: grant.action, allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: id, infoItem: "reserve.amount", visible: reserveVisible });
  for (const infoItem of alsoVisible) await upsertVisibility(SYSTEM_VIEWER, { roleId: id, infoItem, visible: true });
  return id;
}

async function createRoles(): Promise<Roles> {
  const view = { menu: "pnl", action: "view" };
  return {
    // 04-42 리뷰 B1 — 클라이언트·프로젝트 선택지는 앱의 다른 곳처럼 vendor.value · projects 보기 + project.value를 요구한다.
    finance: await createRole("경영관리", [view, { menu: "pnl", action: "write" }, { menu: "projects", action: "view" }], true, ["vendor.value", "project.value"]),
    reader: await createRole("읽기", [view, { menu: "projects", action: "view" }], true, ["project.value"]),
    hidden: await createRole("노출 꺼짐", [view], false),
  };
}

async function createClient(prefix: string): Promise<{ id: string; name: string }> {
  const name = `${prefix}-${randomUUID().slice(0, 6)}`;
  const vendor = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase() });
  return { id: vendor.id, name };
}

async function login(page: Page, roleId: string) {
  const user = await createFixtureUser({ roleId });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

function isServerAction(request: { method: () => string; headers: () => Record<string, string> }) {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

function waitForSave(page: Page) {
  return page.waitForResponse((response) => isServerAction(response.request()));
}

function ledger(page: Page): Locator {
  return page.getByRole("grid", { name: "리저브 대장" });
}

// 격자의 데이터 행(그룹 머리글 행·폰 접힌 줄 제외).
function dataRows(page: Page): Locator {
  return page.locator('tbody tr:has(> td[role="gridcell"])');
}

// 읽기 표의 데이터 행(그룹 머리글 행 제외) — 날짜로 찾는다.
function readRow(page: Page, date: string): Locator {
  return page.getByRole("table", { name: "리저브 대장" }).locator("tbody tr").filter({ has: page.locator("td", { hasText: new RegExp(`^${date}$`) }) });
}

// 열 순서: 날짜 · 구분 · 금액 · 잔액 · 프로젝트 · 증빙 종류 · 세금계산서 번호 · 메모 · 클라이언트.
const COL = { date: 0, direction: 1, amount: 2, balance: 3, project: 4, evidence: 5, taxInvoice: 6, note: 7, client: 8 } as const;

function cell(page: Page, rowIndex: number, colIndex: number): Locator {
  return dataRows(page).nth(rowIndex).getByRole("gridcell").nth(colIndex);
}

// 수화 전에 준 포커스는 격자가 받지 못한다 — 그 셀이 탭 정지가 될 때까지 다시 준다(quote-edit-scope 선례).
async function focusGridCell(target: Locator) {
  await expect(async () => {
    await target.evaluate((element) => (element as HTMLElement).blur());
    await target.focus();
    await expect(target).toHaveAttribute("tabindex", "0", { timeout: 1_000 });
  }).toPass();
}

async function typeInto(page: Page, target: Locator, label: string, value: string) {
  await focusGridCell(target);
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: label, exact: true }).fill(value);
  await page.keyboard.press("Enter");
}

// 리뷰 S5 — 날짜 칸 편집기는 형식을 잡는 date 입력이다(매출 표 선례 · 사용자 결정 2026-09-26).
async function typeDate(page: Page, target: Locator, value: string) {
  await focusGridCell(target);
  await page.keyboard.press("Enter");
  const input = page.getByLabel("날짜", { exact: true });
  await expect(input).toHaveAttribute("type", "date");
  await input.fill(value);
  await page.keyboard.press("Enter");
}

// 엑셀에서 복사한 글자 붙여넣기(앱 형식 없음) — 포커스한 격자 칸에서 paste 이벤트(ledger-save-flow 선례).
async function pasteText(page: Page, target: Locator, text: string) {
  await focusGridCell(target);
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

// 리뷰 S7 — 「리저브 줄 추가」는 SSR HTML에도 있어 수화 전 클릭이 사라질 수 있다. 새 줄의 클라이언트 칸이 열릴 때까지 다시 누른다.
async function addReserveRow(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: "리저브 줄 추가" }).click();
    await expect(page.getByRole("combobox", { name: "클라이언트", exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

async function saveWithKeyboard(page: Page, focusTarget: Locator) {
  const saved = waitForSave(page);
  await focusGridCell(focusTarget);
  await page.keyboard.press("Control+s");
  await saved;
}

type SeedRow = { date: string; direction: "deposit" | "withdrawal"; amount: number; note?: string };

// 준비 SQL — 줄을 직접 넣는다(순서는 날짜 → 입금 먼저 → created_at). created_at을 줄마다 1초씩 늘려 순서를 고정한다.
async function seedEntries(clientId: string, rows: SeedRow[]): Promise<string[]> {
  const base = Date.UTC(2026, 0, 1);
  const inserted = await db
    .insert(reserveEntries)
    .values(
      rows.map((row, index) => ({
        clientId,
        entryDate: row.date,
        direction: row.direction,
        amountCurrency: "KRW",
        amountForeignAmount: null,
        amountFxRate: "1",
        amountAmountKrw: row.amount,
        note: row.note ?? null,
        createdAt: new Date(base + index * 1000),
      })),
    )
    .returning({ id: reserveEntries.id });
  return inserted.map((row) => row.id);
}

function isoDay(start: string, offset: number): string {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

// 한 클라이언트 51줄 — 1쪽 첫 줄 입금 1,000,000 · 입금 10,000 × 49 · 2쪽 유일한 줄 출금 900,000(최종 잔액 590,000).
function fiftyOneRows(): SeedRow[] {
  return [
    { date: "2026-01-01", direction: "deposit", amount: 1_000_000, note: "첫 입금" },
    ...Array.from({ length: 49 }, (_, index): SeedRow => ({ date: isoDay("2026-02-01", index), direction: "deposit", amount: 10_000 })),
    { date: "2026-12-01", direction: "withdrawal", amount: 900_000 },
  ];
}

// 그룹 머리글 칸(클라이언트) — 오른쪽 칸(span)이 그 클라이언트의 최종 잔액이다(S9 · 리뷰 S3).
function groupHeader(page: Page, clientName: string): Locator {
  return page.locator("main table tbody tr > td[colspan]").filter({ hasText: clientName });
}

async function expectGroupBalance(page: Page, clientName: string, balance: string) {
  const header = groupHeader(page, clientName);
  await expect(header).toBeVisible();
  await expect(header.locator("> span")).toHaveText(`잔액 ${balance}`);
}

function pager(page: Page): Locator {
  return page.getByRole("navigation", { name: "리저브 페이지" });
}

function saveButton(page: Page): Locator {
  return page.getByRole("button", { name: /^일괄 저장/ });
}

async function openLedger(page: Page, roleId: string, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await login(page, roleId);
  await page.goto("/pnl/reserves");
}

test.beforeEach(async () => {
  await db.delete(reserveEntries);
});

test.describe("리저브 대장 트레이서", () => {
  test("경영관리가 /pnl 링크로 대장을 열어 클라이언트를 고른 줄을 저장하고 잔액을 본다 — 저장 뒤 클라이언트 칸은 잠김", async ({ page }) => {
    const roles = await createRoles();
    const clientA = await createClient("E2E리저브A");
    await createClient("E2E리저브B");
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, roles.finance);

    await page.goto("/pnl");
    await page.getByRole("link", { name: "리저브 대장" }).click();
    await expect(page).toHaveURL(/\/pnl\/reserves$/);
    await expect(page.getByText("리저브 기록이 없습니다", { exact: true })).toBeVisible();

    await addReserveRow(page);
    // 새 줄은 클라이언트 칸이 편집 상태로 열린다(사용자 D6).
    await page.getByRole("combobox", { name: "클라이언트", exact: true }).selectOption({ label: clientA.name });
    await typeDate(page, cell(page, 0, COL.date), "2026-09-01");
    await typeInto(page, cell(page, 0, COL.amount), "금액", "1500000");
    await saveWithKeyboard(page, cell(page, 0, COL.amount));

    await expectGroupBalance(page, clientA.name, "1,500,000");
    await expect(cell(page, 0, COL.balance)).toHaveText("1,500,000");
    await expect(cell(page, 0, COL.direction)).toHaveText("입금");

    await page.reload();
    await expect(cell(page, 0, COL.client)).toHaveText(clientA.name);
    await expect(cell(page, 0, COL.client)).toHaveAttribute("aria-readonly", "true");
    await focusGridCell(cell(page, 0, COL.client));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox", { name: "클라이언트", exact: true })).toHaveCount(0);
  });
});

test.describe("리저브 대장 — 쪽 · 오류 · 삭제 · 입력", () => {
  test("51건은 번호 페이지 — 2쪽 맨 위에 같은 머리글·같은 잔액, 범위 밖 쪽은 마지막 쪽", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브쪽");
    await seedEntries(client.id, fiftyOneRows());
    await openLedger(page, roles.finance);

    await expectGroupBalance(page, client.name, "590,000");
    await expect(dataRows(page)).toHaveCount(50);
    await expect(pager(page).getByText("1–50 / 51건")).toBeVisible();
    await pager(page).getByRole("link", { name: "2", exact: true }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expectGroupBalance(page, client.name, "590,000");
    // 2쪽 첫 줄 잔액 = 1쪽 마지막 줄 잔액(1,490,000) − 900,000.
    await expect(cell(page, 0, COL.balance)).toHaveText("590,000");

    await page.goto("/pnl/reserves?page=99");
    await expect(dataRows(page)).toHaveCount(1);
    await expect(cell(page, 0, COL.direction)).toHaveText("출금");
  });

  test("쪽 번호·「이전」으로 넘겨도 저장 안 한 편집이 남고 한 번에 저장된다(DR-18)", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브편집");
    const ids = await seedEntries(client.id, fiftyOneRows());
    await openLedger(page, roles.finance);

    await typeInto(page, cell(page, 0, COL.note), "메모", "1쪽 고친 메모");
    await expect(saveButton(page)).toContainText("일괄 저장 1");
    await pager(page).getByRole("link", { name: "2", exact: true }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(saveButton(page)).toContainText("일괄 저장 1");
    await typeInto(page, cell(page, 0, COL.amount), "금액", "800000");
    await expect(saveButton(page)).toContainText("일괄 저장 2");
    await pager(page).getByRole("link", { name: "이전" }).click();
    await expect(dataRows(page)).toHaveCount(50);
    await expect(cell(page, 0, COL.note)).toHaveText("1쪽 고친 메모");
    await saveWithKeyboard(page, cell(page, 0, COL.note));
    await expect(saveButton(page)).not.toContainText("일괄 저장 2");

    const [first] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, ids[0]!));
    const [last] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, ids[50]!));
    expect(first?.note).toBe("1쪽 고친 메모");
    expect(last?.amountAmountKrw).toBe(800_000);
  });

  test("잔액이 음수가 되는 출금은 그 날짜 마지막 줄 금액 오류 셀 + 전부 거부, 같은 날 입금을 뒤에 적은 배치는 저장된다", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브음수");
    await seedEntries(client.id, [{ date: "2026-03-01", direction: "deposit", amount: 100_000 }]);
    await openLedger(page, roles.finance);

    await addReserveRow(page);
    await page.getByRole("combobox", { name: "클라이언트", exact: true }).selectOption({ label: client.name });
    await typeDate(page, cell(page, 1, COL.date), "2026-03-01");
    await focusGridCell(cell(page, 1, COL.direction));
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "구분", exact: true }).selectOption({ label: "출금" });
    await typeInto(page, cell(page, 1, COL.amount), "금액", "400000");
    await saveWithKeyboard(page, cell(page, 1, COL.amount));

    await expect(cell(page, 1, COL.amount)).toHaveAttribute("aria-invalid", "true");
    await expect(cell(page, 1, COL.amount)).toContainText("이 줄 뒤 잔액 -300,000 · 금액을 줄이거나 입금 줄 먼저");
    await expect(ledger(page).locator("tfoot")).toContainText("전부 거부");

    // 같은 날 입금을 뒤에 적는다 — 그날 마감이 0 이상이면 저장된다(사용자 D19-2).
    await addReserveRow(page);
    await page.getByRole("combobox", { name: "클라이언트", exact: true }).selectOption({ label: client.name });
    await typeDate(page, cell(page, 2, COL.date), "2026-03-01");
    await typeInto(page, cell(page, 2, COL.amount), "금액", "400000");
    // S19 DR-5 — 오류 칸이 남은 채 Ctrl+S는 서버를 부르지 않고 그 칸으로 간다. 그 칸을 다시 확정하면 풀리고 저장된다.
    let actionPosts = 0;
    page.on("request", (request) => {
      if (isServerAction(request)) actionPosts++;
    });
    await focusGridCell(cell(page, 2, COL.amount));
    await page.keyboard.press("Control+s");
    await expect(cell(page, 1, COL.amount)).toBeFocused();
    expect(actionPosts).toBe(0);
    await typeInto(page, cell(page, 1, COL.amount), "금액", "400000");
    await saveWithKeyboard(page, cell(page, 2, COL.amount));
    await expectGroupBalance(page, client.name, "100,000");
    await expect(dataRows(page)).toHaveCount(3);
  });

  test("다른 쪽 줄의 잔액 거부 — 표 위 한 줄과 그 쪽으로 가는 링크, 옮겨도 편집이 남고 두 편집이 함께 저장된다(Codex #7)", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브다른쪽");
    const ids = await seedEntries(client.id, fiftyOneRows());
    await openLedger(page, roles.finance);

    await typeInto(page, cell(page, 0, COL.amount), "금액", "100000");
    await saveWithKeyboard(page, cell(page, 0, COL.amount));
    const banner = page.getByRole("alert").filter({ hasText: "쪽에서 고치기" });
    await expect(banner).toContainText(`2026-12-01 ${client.name} 잔액 -310,000 · 2쪽에서 고치기`);
    await expect(saveButton(page)).toContainText("일괄 저장 1");

    await banner.getByRole("link", { name: "2쪽에서 고치기" }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(cell(page, 0, COL.amount)).toHaveAttribute("aria-invalid", "true");
    await expect(cell(page, 0, COL.amount)).toContainText("이 줄 뒤 잔액 -310,000");
    await expect(saveButton(page)).toContainText("일괄 저장 1");

    await typeInto(page, cell(page, 0, COL.amount), "금액", "50000");
    await saveWithKeyboard(page, cell(page, 0, COL.amount));
    await expect(cell(page, 0, COL.balance)).toHaveText("540,000");
    const [first] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, ids[0]!));
    expect(first?.amountAmountKrw).toBe(100_000);
  });

  test("오류 칸이 남은 채 1차(Ctrl+S)는 서버를 부르지 않고 첫 오류가 있는 쪽의 그 칸으로 간다(S19 DR-5 · 리뷰 S2)", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브오류로");
    await seedEntries(client.id, fiftyOneRows());
    await openLedger(page, roles.finance);
    let actionPosts = 0;
    page.on("request", (request) => {
      if (isServerAction(request)) actionPosts++;
    });

    // 1쪽에 클라이언트 없는 새 줄을 두고 2쪽에서 저장한다 — 서버가 그 줄의 클라이언트 칸을 거부한다.
    await addReserveRow(page);
    await page.keyboard.press("Escape");
    await pager(page).getByRole("link", { name: "2", exact: true }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await saveWithKeyboard(page, cell(page, 0, COL.amount));
    expect(actionPosts).toBe(1);
    await expect(pager(page).getByRole("link", { name: "1쪽, 오류 1칸" })).toBeVisible();

    await focusGridCell(cell(page, 0, COL.amount));
    await page.keyboard.press("Control+s");
    await expect(page).toHaveURL(/page=1/);
    await expect(dataRows(page)).toHaveCount(51);
    const clientCell = cell(page, 50, COL.client);
    await expect(clientCell).toHaveAttribute("aria-invalid", "true");
    await expect(clientCell).toBeFocused();
    await page.keyboard.press("Control+s");
    await page.waitForTimeout(300);
    expect(actionPosts).toBe(1);
  });

  test("삭제는 공용 확인 다이얼로그 뒤 일괄 저장으로 보관되고 잔액이 다시 계산된다 — Esc는 포커스를 셀로 돌린다", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브삭제");
    const ids = await seedEntries(client.id, [
      { date: "2026-04-01", direction: "deposit", amount: 200_000 },
      { date: "2026-04-02", direction: "deposit", amount: 100_000 },
    ]);
    await openLedger(page, roles.finance);

    const trigger = cell(page, 1, COL.date);
    await focusGridCell(trigger);
    await page.keyboard.press("Delete");
    const dialog = page.getByRole("dialog", { name: "리저브 줄 삭제" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`2026-04-02 · ${client.name} · 100,000`);
    await expect(dialog).toContainText("보관함으로 옮겨짐 · 잔액 다시 계산");
    await expect(dialog.getByRole("button", { name: /^리저브 줄 삭제/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Delete");
    await dialog.getByRole("button", { name: /^리저브 줄 삭제/ }).click();
    await expect(saveButton(page)).toContainText("일괄 저장 1");
    // 묶음 ④ /review R2 · R9 — 보관본 키는 보는 사람 id를 앞세우고(quote-ledger:dirty:{사람}:reserves:ledger), 삭제 표시는 본 version이다.
    const drafts = () =>
      page.evaluate(() =>
        Object.keys(window.localStorage)
          .filter((key) => key.startsWith("quote-ledger:dirty:"))
          .map((key) => [key, JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>] as const),
      );
    await expect.poll(async () => (await drafts()).length).toBe(1);
    const [stored] = await drafts();
    expect(stored?.[0]).toMatch(/^quote-ledger:dirty:[^:]+:reserves:ledger$/);
    expect(stored?.[1][`${ids[1]!}:archive`]).toBe(1);
    // DOM 감사 #36 — 확인하면 트리거 줄이 빠지므로 포커스는 같은 열의 다음 줄(마지막 줄이었으면 앞 줄)로 간다(h1이 아니다).
    await expect(dataRows(page)).toHaveCount(1);
    await expect(cell(page, 0, COL.date)).toBeFocused();
    await saveWithKeyboard(page, cell(page, 0, COL.date));
    await expect(dataRows(page)).toHaveCount(1);
    await expectGroupBalance(page, client.name, "200,000");
    const [archived] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, ids[1]!));
    expect(archived?.archivedAt).not.toBeNull();
  });

  test("금액 칸 쉼표 · USD 기본 환율 · 증빙 종류 설명 · 1차 kbd Ctrl+S", async ({ page }) => {
    const roles = await createRoles();
    await createClient("E2E리저브입력");
    await openLedger(page, roles.finance);
    await expect(saveButton(page).locator("kbd")).toHaveText("Ctrl+S");

    await addReserveRow(page);
    await page.keyboard.press("Escape");
    await focusGridCell(cell(page, 0, COL.amount));
    await page.keyboard.press("Enter");
    const amount = page.getByRole("textbox", { name: "금액", exact: true });
    await amount.pressSequentially("1500000");
    await expect(amount).toHaveValue("1,500,000");
    await page.getByRole("combobox", { name: "금액 통화" }).selectOption("USD");
    const rate = await recentFxRate("USD");
    await expect(page.getByRole("textbox", { name: "금액 환율" })).toHaveValue(new RegExp(`^${String(rate).replace(/\B(?=(\d{3})+(?!\d))/g, ",").replace(".", "\\.")}`));
    await page.keyboard.press("Escape");

    await focusGridCell(cell(page, 0, COL.evidence));
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "증빙 종류", exact: true }).selectOption({ label: "세금계산서" });
    await focusGridCell(cell(page, 0, COL.evidence));
    await page.keyboard.press("Enter");
    await expect(cell(page, 0, COL.evidence)).toContainText("과세 거래 · 부가세가 붙는 세금계산서");
  });
});

// 04-42 리뷰 S1 — 보관된 프로젝트에 묶인 줄과 비활성 증빙 종류 줄. 선택지에는 없지만 저장된 값이다.
async function seedLinkedRow(clientId: string): Promise<{ projectName: string; evidenceLabel: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E리저브본부-${randomUUID().slice(0, 8)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E리저브팀-${randomUUID().slice(0, 8)}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `rsv-pm-${randomUUID()}@example.test`, name: "리저브 PM", roleId: DEFAULT_ROLE_ID });
  const projectName = `E2E리저브프로젝트-${randomUUID().slice(0, 6)}`;
  const project = await createProject(SYSTEM_VIEWER, { clientId, teamId: team.id, pmUserId: userId, name: projectName });
  const evidenceLabel = `옛 증빙 ${randomUUID().slice(0, 4)}`;
  const [code] = await db
    .insert(codeItems)
    .values({ tableKey: "evidence_type", value: `old-${randomUUID().slice(0, 8)}`, label: evidenceLabel, active: false })
    .returning({ value: codeItems.value });
  const [id] = await seedEntries(clientId, [{ date: "2026-08-01", direction: "deposit", amount: 10_000 }]);
  await db.update(reserveEntries).set({ projectId: project.id, evidenceType: code!.value }).where(eq(reserveEntries.id, id!));
  await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, project.id));
  return { projectName, evidenceLabel };
}

// Codex #3 — 그 클라이언트의 활성 프로젝트 하나(seedLinkedRow와 같은 네 호출). 선택지는 페이지를 열 때 읽으므로 openLedger 전에 만든다.
async function seedActiveProject(clientId: string): Promise<{ id: string; name: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E리저브본부-${randomUUID().slice(0, 8)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E리저브팀-${randomUUID().slice(0, 8)}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `rsv-pm-${randomUUID()}@example.test`, name: "리저브 PM", roleId: DEFAULT_ROLE_ID });
  const name = `E2E리저브활성프로젝트-${randomUUID().slice(0, 6)}`;
  const project = await createProject(SYSTEM_VIEWER, { clientId, teamId: team.id, pmUserId: userId, name });
  return { id: project.id, name };
}

test.describe("리저브 대장 — 그룹 머리글 오른쪽 굵은 잔액(리뷰 S3 · DOM 감사 #18)", () => {
  for (const width of [1280, 1024, 375]) {
    test(`${width}px — 클라이언트 이름은 왼쪽, 최종 잔액은 머리글 행 오른쪽 끝에 굵게(700) 본문 색`, async ({ page }) => {
      const roles = await createRoles();
      const client = await createClient("E2E리저브머리글");
      await seedEntries(client.id, [
        { date: "2026-09-01", direction: "deposit", amount: 1_200_000 },
        { date: "2026-09-02", direction: "withdrawal", amount: 250_000 },
      ]);
      await openLedger(page, roles.finance, width);
      await expectGroupBalance(page, client.name, "950,000");

      const measured = await groupHeader(page, client.name).evaluate((td) => {
        const aside = td.querySelector(":scope > span");
        const padRight = parseFloat(getComputedStyle(td).paddingRight);
        const tdRect = td.getBoundingClientRect();
        const asideRect = aside?.getBoundingClientRect();
        const fg = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
        const probe = document.createElement("span");
        probe.style.color = fg;
        document.body.append(probe);
        const fgRgb = getComputedStyle(probe).color;
        probe.remove();
        return {
          gapToRight: asideRect ? tdRect.right - padRight - asideRect.right : null,
          asideLeftOfCenter: asideRect ? asideRect.left < tdRect.left + tdRect.width / 2 : null,
          weight: aside ? getComputedStyle(aside).fontWeight : null,
          color: aside ? getComputedStyle(aside).color : null,
          fgRgb,
          nameText: td.firstChild?.textContent ?? "",
        };
      });
      expect(measured.nameText).toBe(client.name);
      expect(measured.gapToRight).not.toBeNull();
      expect(Math.abs(measured.gapToRight ?? 99)).toBeLessThanOrEqual(1);
      expect(measured.asideLeftOfCenter).toBe(false);
      expect(measured.weight).toBe("700");
      expect(measured.color).toBe(measured.fgRgb);
    });
  }
});

test.describe("리저브 대장 — 보관된 프로젝트 · 비활성 증빙 종류(리뷰 S1)", () => {
  test("저장된 이름이 보이고, 셀을 열었다가 바꾸지 않고 떠나면 편집이 생기지 않는다", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브보관");
    const { projectName, evidenceLabel } = await seedLinkedRow(client.id);
    await openLedger(page, roles.finance);

    await expect(cell(page, 0, COL.project)).toHaveText(projectName);
    await expect(cell(page, 0, COL.evidence)).toHaveText(evidenceLabel);

    for (const [col, label] of [
      [COL.project, "프로젝트"],
      [COL.evidence, "증빙 종류"],
    ] as const) {
      await focusGridCell(cell(page, 0, col));
      await page.keyboard.press("Enter");
      await expect(page.getByRole("combobox", { name: label, exact: true })).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("combobox", { name: label, exact: true })).toHaveCount(0);
    }
    await expect(cell(page, 0, COL.project)).toHaveText(projectName);
    await expect(cell(page, 0, COL.evidence)).toHaveText(evidenceLabel);
    await expect(saveButton(page)).toHaveText(/^일괄 저장(?! \d)/);
  });

  test("읽는 사람에게도 보관된 프로젝트 이름이 보인다", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브보관읽기");
    const { projectName } = await seedLinkedRow(client.id);
    await openLedger(page, roles.reader);
    await expect(readRow(page, "2026-08-01").locator("td").nth(COL.project)).toHaveText(projectName);
  });
});

test.describe("리저브 대장 — 붙여넣기 Ctrl+V(리뷰 S4)", () => {
  test("엑셀 글자를 붙이면 날짜 · 구분 · 금액(쉼표·원) · 메모(—는 빈 칸)가 채워지고, 표 끝을 넘는 줄은 새 줄이 된다 · 계산 열의 엑셀 값은 오류 칸", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브붙여넣기");
    await seedEntries(client.id, [{ date: "2026-10-01", direction: "deposit", amount: 500_000, note: "원래 메모" }]);
    await openLedger(page, roles.finance);

    await pasteText(page, cell(page, 0, COL.date), "2026-10-02\t출금\t1,234원");
    await expect(cell(page, 0, COL.date)).toHaveText("2026-10-02");
    await expect(cell(page, 0, COL.direction)).toHaveText("출금");
    await expect(cell(page, 0, COL.amount)).toHaveText("1,234");
    await expect(saveButton(page)).toContainText("일괄 저장 1");

    await pasteText(page, cell(page, 0, COL.note), "—\n둘째 줄 메모");
    await expect(cell(page, 0, COL.note)).toHaveText("—");
    await expect(dataRows(page)).toHaveCount(2);
    await expect(cell(page, 1, COL.note)).toHaveText("둘째 줄 메모");
    await expect(saveButton(page)).toContainText("일괄 저장 2");

    // 잔액(계산 열)에 떨어진 엑셀 값은 조용히 버리지 않고 오류 칸이다.
    await pasteText(page, cell(page, 0, COL.balance), "999");
    await expect(cell(page, 0, COL.balance)).toHaveAttribute("aria-invalid", "true");
  });

  test("1024에서 숨은 증빙 종류 · 세금계산서 번호 열도 붙여넣기 논리 순서에 남는다", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브숨은열");
    const [id] = await seedEntries(client.id, [{ date: "2026-10-01", direction: "deposit", amount: 500_000 }]);
    await openLedger(page, roles.finance, 1024);
    await expect(ledger(page).locator("thead th:visible")).toHaveCount(7);

    await pasteText(page, cell(page, 0, COL.project), "—\t세금계산서\t20261001-0001\t숨은 열 뒤 메모");
    // 숨은 두 열은 접근성 트리에 없어 1024의 메모 칸은 보이는 칸 순서로 여섯째(5)다.
    const noteAt1024 = cell(page, 0, 5);
    await expect(noteAt1024).toHaveText("숨은 열 뒤 메모");
    await saveWithKeyboard(page, noteAt1024);
    await expect(saveButton(page)).not.toContainText("일괄 저장 1");
    const [row] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, id!));
    expect(row).toMatchObject({ projectId: null, evidenceType: "tax_invoice", taxInvoiceNumber: "20261001-0001", note: "숨은 열 뒤 메모" });
  });
});

test.describe("리저브 대장 — 읽기 · 좁은 PC · 저장 중 잠금 · 차단", () => {
  test("쓰기 권한 없는 사람은 흰 머리글 읽기 표 — 0건 문구, 프로젝트 없는 줄은 —, 잔액 셀은 편집되지 않는다", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브읽기");
    await openLedger(page, roles.reader);
    await expect(page.getByText("리저브 기록이 없습니다 · 기록은 경영관리", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "리저브 줄 추가" })).toHaveCount(0);

    await seedEntries(client.id, [{ date: "2026-05-01", direction: "deposit", amount: 70_000 }]);
    await page.reload();
    const table = page.getByRole("table", { name: "리저브 대장" });
    await expect(table).toBeVisible();
    await expect(page.getByRole("grid")).toHaveCount(0);
    await expect(readRow(page, "2026-05-01").locator("td").nth(COL.project)).toHaveText("—");
    await expect(saveButton(page)).toHaveCount(0);
  });

  test("경영관리의 잔액 셀은 Enter로 편집되지 않는다", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브잔액");
    await seedEntries(client.id, [{ date: "2026-05-01", direction: "deposit", amount: 70_000 }]);
    await openLedger(page, roles.finance);
    await focusGridCell(cell(page, 0, COL.balance));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(cell(page, 0, COL.balance)).toHaveAttribute("aria-readonly", "true");
  });

  test("좁은 PC — 1024는 일곱 열 편집, 1000은 여섯 열 보기 전용(추가·1차·EMPTY 버튼 없음)", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브좁은");
    await openLedger(page, roles.finance, 1000);
    await expect(page.getByText("리저브 기록이 없습니다", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "리저브 줄 추가" })).toHaveCount(0);

    await seedEntries(client.id, [{ date: "2026-06-01", direction: "deposit", amount: 50_000 }]);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.reload();
    await expect(ledger(page).locator("thead th:visible")).toHaveCount(7);
    await expect(page.getByRole("button", { name: "리저브 줄 추가" })).toBeVisible();

    await page.setViewportSize({ width: 1000, height: 900 });
    const table = page.getByRole("table", { name: "리저브 대장" });
    await expect(table.locator("thead th:visible")).toHaveCount(6);
    await expect(page.getByRole("grid")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "리저브 줄 추가" })).toHaveCount(0);
    await expect(saveButton(page)).toHaveCount(0);
    await readRow(page, "2026-06-01").locator("td").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("1280에서 고친 편집은 1000으로 줄여도 1차 「일괄 저장 1」로 저장된다(후속 결정 R1)", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브R1");
    const [id] = await seedEntries(client.id, [{ date: "2026-06-01", direction: "deposit", amount: 50_000 }]);
    await openLedger(page, roles.finance);
    await typeInto(page, cell(page, 0, COL.amount), "금액", "60000");
    await page.setViewportSize({ width: 1000, height: 900 });
    await expect(page.getByRole("grid")).toHaveCount(0);
    const saved = waitForSave(page);
    await saveButton(page).filter({ hasText: "일괄 저장 1" }).click();
    await saved;
    await page.reload();
    await expect(readRow(page, "2026-06-01").locator("td").nth(COL.amount)).toHaveText("60,000");
    const [row] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, id!));
    expect(row?.amountAmountKrw).toBe(60_000);
  });

  test("저장 중에는 격자가 aria-busy이고 편집·추가·반복 Ctrl+S가 무반응, 응답 뒤 즉시 풀린다(DR-3)", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브잠금");
    await seedEntries(client.id, [
      { date: "2026-07-01", direction: "deposit", amount: 50_000 },
      { date: "2026-07-02", direction: "deposit", amount: 20_000 },
    ]);
    await openLedger(page, roles.finance);
    await typeInto(page, cell(page, 0, COL.amount), "금액", "55000");

    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let actionPosts = 0;
    await page.route("**/pnl/reserves**", async (route) => {
      if (isServerAction(route.request())) {
        actionPosts++;
        await held;
      }
      await route.continue();
    });

    const saved = waitForSave(page);
    await focusGridCell(cell(page, 0, COL.amount));
    await page.keyboard.press("Control+s");
    await expect(ledger(page)).toHaveAttribute("aria-busy", "true");
    // 리뷰 S8 — 잠긴 동안의 시도와 풀린 뒤의 대조가 같은 포커스 방법(focusGridCell)이어야 잠김 단언이 의미가 있다.
    await focusGridCell(cell(page, 1, COL.note));
    await page.keyboard.press("Enter");
    await page.keyboard.type("x");
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "리저브 줄 추가" })).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Control+s");

    release();
    await saved;
    await expect(ledger(page)).not.toHaveAttribute("aria-busy", "true");
    await expect(cell(page, 0, COL.amount)).toHaveText("55,000");
    await focusGridCell(cell(page, 1, COL.note));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "메모" })).toBeVisible();
    expect(actionPosts).toBe(1);
  });

  test("기획 PM · 노출 꺼진 계급 — /pnl에 링크가 없고 대장은 404(B-13 · B-15)", async ({ page }) => {
    const roles = await createRoles();
    await login(page, DEFAULT_ROLE_ID);
    await page.goto("/pnl");
    await expect(page.getByRole("heading", { name: "손익" })).toBeVisible();
    await expect(page.getByRole("link", { name: "리저브 대장" })).toHaveCount(0);
    expect((await page.goto("/pnl/reserves"))?.status()).toBe(404);

    await page.context().clearCookies();
    await login(page, roles.hidden);
    await page.goto("/pnl");
    await expect(page.getByRole("heading", { name: "손익" })).toBeVisible();
    await expect(page.getByRole("link", { name: "리저브 대장" })).toHaveCount(0);
    expect((await page.goto("/pnl/reserves"))?.status()).toBe(404);
  });
});

// 묶음 ④ /review — 리저브 붙여넣기·복사·환산·보관 요청 오류.
function footerPieces(page: Page): Promise<{ tone: string; text: string }[]> {
  return ledger(page)
    .locator("tfoot [data-tone]")
    .evaluateAll((elements) => elements.map((element) => ({ tone: element.getAttribute("data-tone") ?? "", text: (element.textContent ?? "").trim() })));
}

async function seedUsdEntry(clientId: string, date: string, amount: number, fxRate: number): Promise<string> {
  const [row] = await db
    .insert(reserveEntries)
    .values({
      clientId,
      entryDate: date,
      direction: "deposit",
      amountCurrency: "USD",
      amountForeignAmount: String(amount),
      amountFxRate: String(fxRate),
      amountAmountKrw: Math.round(amount * fxRate),
    })
    .returning({ id: reserveEntries.id });
  return row!.id;
}

test.describe("리저브 대장 — 묶음 ④ 리뷰", () => {
  test("같은 이름 클라이언트가 둘이면 붙여넣은 이름은 오류 칸 「같은 이름 여럿 · 목록에서 고르기」(R1)", async ({ page }) => {
    const roles = await createRoles();
    const base = await createClient("E2E리저브동명기준");
    const duplicate = `E2E리저브동명-${randomUUID().slice(0, 6)}`;
    await insertVendor(SYSTEM_VIEWER, { name: duplicate, normalizedName: duplicate.toLowerCase() });
    await insertVendor(SYSTEM_VIEWER, { name: duplicate, normalizedName: duplicate.toLowerCase() });
    await seedEntries(base.id, [{ date: "2026-10-01", direction: "deposit", amount: 1_000 }]);
    await openLedger(page, roles.finance);

    await pasteText(page, cell(page, 0, COL.note), `첫 줄 메모\n둘째 줄 메모\t${duplicate}`);
    await expect(dataRows(page)).toHaveCount(2);
    const clientCell = cell(page, 1, COL.client);
    await expect(clientCell).toHaveAttribute("aria-invalid", "true");
    await expect(clientCell).toContainText("같은 이름 여럿 · 목록에서 고르기");
  });

  test("외화 줄 금액 칸에 붙이면 원화로 들어가고 합계 행에 「외화 1줄 원화로」(R4 · 견적 원장 D15와 같은 조각)", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브외화붙여넣기");
    await seedUsdEntry(client.id, "2026-10-01", 1_000, 1_350);
    await openLedger(page, roles.finance);

    await pasteText(page, cell(page, 0, COL.amount), "1,000");
    await expect(cell(page, 0, COL.amount)).toHaveText("1,000");
    await expect.poll(() => footerPieces(page)).toEqual([
      { tone: "muted", text: "붙여넣기 1줄" },
      { tone: "warning", text: "외화 1줄 원화로" },
    ]);
  });

  test("표 안 Ctrl+A → Ctrl+C → Ctrl+V는 앱 형식 — 잔액(계산) 칸 무시 · 같은 클라이언트의 잠긴 칸은 그대로, 오류 칸 0(R5)", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브왕복");
    await seedEntries(client.id, [
      { date: "2026-10-01", direction: "deposit", amount: 300_000, note: "첫 줄" },
      { date: "2026-10-02", direction: "withdrawal", amount: 100_000, note: "둘째 줄" },
    ]);
    await openLedger(page, roles.finance);
    await page.evaluate(() => {
      window.addEventListener("copy", (event) => {
        const data = event.clipboardData;
        (window as unknown as { __copied?: Record<string, string> }).__copied = {
          "text/plain": data?.getData("text/plain") ?? "",
          "application/x-plant8-quote-lines+json": data?.getData("application/x-plant8-quote-lines+json") ?? "",
        };
      });
    });
    await focusGridCell(cell(page, 0, COL.date));
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+c");
    const copied = (await (await page.waitForFunction(() => (window as unknown as { __copied?: Record<string, string> }).__copied)).jsonValue()) as Record<string, string>;
    expect(JSON.parse(copied["application/x-plant8-quote-lines+json"] || "[]")).toEqual([{ currency: "KRW" }, { currency: "KRW" }]);

    await focusGridCell(cell(page, 0, COL.date));
    await page.evaluate((data) => {
      const transfer = new DataTransfer();
      for (const [format, value] of Object.entries(data)) transfer.setData(format, value);
      document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, copied);

    await expect.poll(() => footerPieces(page)).toEqual([
      { tone: "muted", text: "붙여넣기 2줄" },
      { tone: "muted", text: "계산 열 2칸 무시" },
    ]);
    await expect(ledger(page).locator('td[aria-invalid="true"]')).toHaveCount(0);
    await expect(cell(page, 1, COL.note)).toHaveText("둘째 줄");
  });

  test("화면 원화 환산은 서버와 같은 정수 환산 — USD 0.35 × 1,350 = 473(R6)", async ({ page }) => {
    const roles = await createRoles();
    await createClient("E2E리저브환산");
    await openLedger(page, roles.finance);

    await addReserveRow(page);
    await page.keyboard.press("Escape");
    await focusGridCell(cell(page, 0, COL.amount));
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "금액 통화" }).selectOption("USD");
    await page.getByRole("textbox", { name: "금액", exact: true }).pressSequentially("0.35");
    const rate = page.getByRole("textbox", { name: "금액 환율" });
    await rate.fill("1350");
    await rate.press("Enter");
    await expect(cell(page, 0, COL.amount)).toContainText("473");
    await expect(cell(page, 0, COL.amount)).not.toContainText("472");
  });

  test("보관 요청의 가장자리 검증 오류는 그 줄을 되살려 날짜 칸 오류로 보인다(R12)", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브보관오류");
    await seedEntries(client.id, [
      { date: "2026-04-01", direction: "deposit", amount: 200_000 },
      { date: "2026-04-02", direction: "deposit", amount: 100_000 },
    ]);
    await openLedger(page, roles.finance);

    await focusGridCell(cell(page, 1, COL.date));
    await page.keyboard.press("Delete");
    await page.getByRole("dialog", { name: "리저브 줄 삭제" }).getByRole("button", { name: /^리저브 줄 삭제/ }).click();
    await expect(dataRows(page)).toHaveCount(1);
    // 손상된 보관본(정수가 아닌 version) — 액션 가장자리 스키마가 거부한다.
    await expect
      .poll(() => page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith("quote-ledger:dirty:")).length))
      .toBe(1);
    await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((candidate) => candidate.startsWith("quote-ledger:dirty:"))!;
      const stored = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      for (const field of Object.keys(stored)) if (field.endsWith(":archive")) stored[field] = 1.5;
      window.localStorage.setItem(key, JSON.stringify(stored));
    });
    await page.reload();
    await page.getByRole("button", { name: "복원" }).click();
    await expect(dataRows(page)).toHaveCount(1);

    const saved = waitForSave(page);
    await saveButton(page).click();
    await saved;
    await expect(dataRows(page)).toHaveCount(2);
    const dateCell = cell(page, 1, COL.date);
    await expect(dateCell).toHaveAttribute("aria-invalid", "true");
    await expect(dateCell).toContainText("줄을 찾을 수 없음 · 새로 고침");
  });
});

// Regression: QA ISSUE-001 — 선택 칸 확정 뒤 포커스가 <body>로 빠져 Ctrl+S가 격자에 닿지 않았다
// Found by /qa on 2026-09-28 · Report: docs/reviews/phase-04/bundle4-qa.md
test.describe("리저브 대장 — 묶음 ④ /qa 포커스", () => {
  test("(QA ISSUE-001) 새 줄 클라이언트 칸에서 ↓로 고르면 포커스가 그 칸에 남는다", async ({ page }) => {
    const roles = await createRoles();
    await createClient("E2E리저브QA선택");
    await openLedger(page, roles.finance);

    await addReserveRow(page);
    const select = page.getByRole("combobox", { name: "클라이언트", exact: true });
    await expect(select).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(select).toHaveCount(0);
    await expect(ledger(page).locator("td[data-grid-focus]")).toBeFocused();
  });
});

// Regression: QA ISSUE-005 (a) — 동명 클라이언트가 목록에서 똑같이 보여 고를 근거가 없었다
// Found by /qa on 2026-09-28 · Report: docs/reviews/phase-04/bundle4-qa.md
test.describe("리저브 대장 — 묶음 ④ /qa 동명 클라이언트", () => {
  test("(QA ISSUE-005) 동명 클라이언트만 옵션에 사업자번호 끝 4자리가 붙고, `이름 · 끝4자리`를 붙이면 그 클라이언트로 들어간다", async ({ page }) => {
    const roles = await createRoles();
    const single = await createClient("E2E리저브단독");
    const duplicate = `E2E리저브QA동명-${randomUUID().slice(0, 6)}`;
    await insertVendor(SYSTEM_VIEWER, { name: duplicate, normalizedName: duplicate.toLowerCase(), businessNo: "123-45-61234" });
    await insertVendor(SYSTEM_VIEWER, { name: duplicate, normalizedName: duplicate.toLowerCase(), businessNo: "987-65-43210" });
    await seedEntries(single.id, [{ date: "2026-10-01", direction: "deposit", amount: 1_000 }]);
    await openLedger(page, roles.finance);

    await pasteText(page, cell(page, 0, COL.note), `메모\n둘째 메모\t${duplicate} · 3210`);
    await expect(dataRows(page)).toHaveCount(2);
    const pasted = ledger(page).locator('td[role="gridcell"]', { hasText: new RegExp(`^${duplicate}$`) });
    await expect(pasted).toHaveCount(1);
    await expect(pasted).not.toHaveAttribute("aria-invalid", "true");

    await focusGridCell(pasted);
    await page.keyboard.press("Enter");
    const select = page.getByRole("combobox", { name: "클라이언트", exact: true });
    await expect(select).toHaveValue(/.+/);
    await expect(select.locator("option:checked")).toHaveText(`${duplicate} · 3210`);
    await expect(select.locator("option", { hasText: new RegExp(`^${single.name}$`) })).toHaveCount(1);
    await expect(select.locator("option", { hasText: new RegExp(`^${duplicate} · 1234$`) })).toHaveCount(1);
  });

  test("(리뷰 P1) 라벨까지 같은 두 클라이언트도 그룹이 둘 — 머리글마다 제 잔액", async ({ page }) => {
    const roles = await createRoles();
    const duplicate = `E2E리저브동명그룹-${randomUUID().slice(0, 6)}`;
    const first = await insertVendor(SYSTEM_VIEWER, { name: duplicate, normalizedName: duplicate.toLowerCase() });
    const second = await insertVendor(SYSTEM_VIEWER, { name: duplicate, normalizedName: duplicate.toLowerCase() });
    await seedEntries(first.id, [{ date: "2026-10-01", direction: "deposit", amount: 1_000 }]);
    await seedEntries(second.id, [{ date: "2026-10-02", direction: "deposit", amount: 2_000 }]);
    await openLedger(page, roles.finance);

    const headers = groupHeader(page, duplicate);
    await expect(headers).toHaveCount(2);
    expect((await headers.locator("> span").allTextContents()).sort()).toEqual(["잔액 1,000", "잔액 2,000"]);
  });
});

// Codex 재검토(PR #85) — #3 이미 보관된 줄의 보관 요청 거부 뒤 큐 정리 · #4 저장당 줄 상한.
test.describe("리저브 대장 — Codex 재검토 #3 · #4", () => {
  test("(Codex #3) 이미 보관된 줄의 보관 요청은 거부 뒤 큐에서 빠지고 다음 저장이 같은 묶음의 다른 편집을 저장한다", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브보관거부");
    const ids = await seedEntries(client.id, [
      { date: "2026-04-01", direction: "deposit", amount: 200_000 },
      { date: "2026-04-02", direction: "deposit", amount: 100_000 },
    ]);
    await openLedger(page, roles.finance);

    await typeInto(page, cell(page, 0, COL.note), "메모", "코덱스3 메모");
    await focusGridCell(cell(page, 1, COL.date));
    await page.keyboard.press("Delete");
    await page.getByRole("dialog", { name: "리저브 줄 삭제" }).getByRole("button", { name: /^리저브 줄 삭제/ }).click();
    await expect(saveButton(page)).toContainText("일괄 저장 2");
    // 다른 탭 · 응답 유실 재시도 재현 — 그 줄은 DB에서 이미 보관됐다.
    await db.update(reserveEntries).set({ archivedAt: new Date() }).where(eq(reserveEntries.id, ids[1]!));

    const rejected = waitForSave(page);
    await saveButton(page).click();
    await rejected;
    await expect(saveButton(page)).toContainText("일괄 저장 1");
    await expect(dataRows(page)).toHaveCount(1);
    await expect(ledger(page).locator("tfoot")).not.toContainText("전부 거부");
    await expect
      .poll(() =>
        page.evaluate((archiveKey) => {
          const key = Object.keys(window.localStorage).find((candidate) => candidate.startsWith("quote-ledger:dirty:"));
          const stored = JSON.parse((key && window.localStorage.getItem(key)) || "{}") as Record<string, unknown>;
          return archiveKey in stored;
        }, `${ids[1]!}:archive`),
      )
      .toBe(false);

    const saved = waitForSave(page);
    await saveButton(page).click();
    await saved;
    await expect
      .poll(async () => (await db.select().from(reserveEntries).where(eq(reserveEntries.id, ids[0]!)))[0]?.note)
      .toBe("코덱스3 메모");
    const [archived] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, ids[1]!));
    expect(archived?.archivedAt).not.toBeNull();
  });

  test("(Codex #3) 같은 응답의 다른 칸 오류는 남고 요약은 남은 칸 수 — 이미 보관된 줄의 보관 요청은 세지 않는다", async ({ page }) => {
    const roles = await createRoles();
    const client = await createClient("E2E리저브혼합거부");
    const ids = await seedEntries(client.id, [
      { date: "2026-04-01", direction: "deposit", amount: 200_000 },
      { date: "2026-04-02", direction: "deposit", amount: 100_000 },
    ]);
    const project = await seedActiveProject(client.id);
    await openLedger(page, roles.finance);

    await focusGridCell(cell(page, 0, COL.project));
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "프로젝트", exact: true }).selectOption({ label: project.name });
    await expect(cell(page, 0, COL.project)).toContainText(project.name);
    await expect(saveButton(page)).toContainText("일괄 저장 1");
    await focusGridCell(cell(page, 1, COL.date));
    await page.keyboard.press("Delete");
    await page.getByRole("dialog", { name: "리저브 줄 삭제" }).getByRole("button", { name: /^리저브 줄 삭제/ }).click();
    await expect(saveButton(page)).toContainText("일괄 저장 2");
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, project.id));
    await db.update(reserveEntries).set({ archivedAt: new Date() }).where(eq(reserveEntries.id, ids[1]!));

    const rejected = waitForSave(page);
    await saveButton(page).click();
    await rejected;
    await expect(saveButton(page)).toContainText("일괄 저장 1");
    await expect(ledger(page).locator("tfoot")).toContainText("오류 1칸 · 전부 거부");
    const projectCell = cell(page, 0, COL.project);
    await expect(projectCell).toHaveAttribute("aria-invalid", "true");
    await expect(projectCell).toContainText("보관된 프로젝트 · 프로젝트 다시 고르기");
    await expect(dataRows(page)).toHaveCount(1);
    const [first] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, ids[0]!));
    expect(first?.projectId).toBeNull();
  });
});
