import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { db } from "@/db/client";
import { reserveEntries } from "@/db/schema";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { recentFxRate } from "@/domain/money/currency";
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

    await page.getByRole("button", { name: "리저브 줄 추가" }).click();
    // 새 줄은 클라이언트 칸이 편집 상태로 열린다(사용자 D6).
    await page.getByRole("combobox", { name: "클라이언트", exact: true }).selectOption({ label: clientA.name });
    await typeInto(page, cell(page, 0, COL.date), "날짜", "2026-09-01");
    await typeInto(page, cell(page, 0, COL.amount), "금액", "1500000");
    await saveWithKeyboard(page, cell(page, 0, COL.amount));

    await expect(ledger(page).getByText(`${clientA.name} · 잔액 1,500,000`, { exact: true })).toBeVisible();
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

    const header = `${client.name} · 잔액 590,000`;
    await expect(ledger(page).getByText(header, { exact: true })).toBeVisible();
    await expect(dataRows(page)).toHaveCount(50);
    await expect(pager(page).getByText("1–50 / 51건")).toBeVisible();
    await pager(page).getByRole("link", { name: "2", exact: true }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(ledger(page).getByText(header, { exact: true })).toBeVisible();
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

    await page.getByRole("button", { name: "리저브 줄 추가" }).click();
    await page.getByRole("combobox", { name: "클라이언트", exact: true }).selectOption({ label: client.name });
    await typeInto(page, cell(page, 1, COL.date), "날짜", "2026-03-01");
    await focusGridCell(cell(page, 1, COL.direction));
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "구분", exact: true }).selectOption({ label: "출금" });
    await typeInto(page, cell(page, 1, COL.amount), "금액", "400000");
    await saveWithKeyboard(page, cell(page, 1, COL.amount));

    await expect(cell(page, 1, COL.amount)).toHaveAttribute("aria-invalid", "true");
    await expect(cell(page, 1, COL.amount)).toContainText("이 줄 뒤 잔액 -300,000 · 금액을 줄이거나 입금 줄 먼저");
    await expect(ledger(page).locator("tfoot")).toContainText("전부 거부");

    // 같은 날 입금을 뒤에 적는다 — 그날 마감이 0 이상이면 저장된다(사용자 D19-2).
    await page.getByRole("button", { name: "리저브 줄 추가" }).click();
    await page.getByRole("combobox", { name: "클라이언트", exact: true }).selectOption({ label: client.name });
    await typeInto(page, cell(page, 2, COL.date), "날짜", "2026-03-01");
    await typeInto(page, cell(page, 2, COL.amount), "금액", "400000");
    await saveWithKeyboard(page, cell(page, 2, COL.amount));
    await expect(ledger(page).getByText(`${client.name} · 잔액 100,000`, { exact: true })).toBeVisible();
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
    await saveWithKeyboard(page, cell(page, 0, COL.date));
    await expect(dataRows(page)).toHaveCount(1);
    await expect(ledger(page).getByText(`${client.name} · 잔액 200,000`, { exact: true })).toBeVisible();
    const [archived] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, ids[1]!));
    expect(archived?.archivedAt).not.toBeNull();
  });

  test("금액 칸 쉼표 · USD 기본 환율 · 증빙 종류 설명 · 1차 kbd Ctrl+S", async ({ page }) => {
    const roles = await createRoles();
    await createClient("E2E리저브입력");
    await openLedger(page, roles.finance);
    await expect(saveButton(page).locator("kbd")).toHaveText("Ctrl+S");

    await page.getByRole("button", { name: "리저브 줄 추가" }).click();
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
    await cell(page, 1, COL.note).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("x");
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "리저브 줄 추가" })).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Control+s");
    expect(actionPosts).toBe(1);

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
