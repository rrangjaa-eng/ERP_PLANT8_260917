import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { db } from "@/db/client";
import { reserveEntries } from "@/db/schema";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 04-42 — 클라이언트별 리저브 대장(S9). 리저브는 회사 전체 원장 하나라 이 스펙만 쓴다 — 케이스마다 비우고 시작한다.
// 계급은 이 스펙이 만든 임시 계급이다(공용 계급의 권한을 바꾸지 않는다).
type Roles = { finance: string; reader: string; hidden: string };

async function createRole(name: string, grants: { menu: string; action: string }[], reserveVisible: boolean): Promise<string> {
  const id = `role-e2e-rsv-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id, name: `E2E 리저브 ${name} ${id.slice(-8)}`, sortOrder: 99 });
  for (const grant of grants) await upsertPermission(SYSTEM_VIEWER, { roleId: id, menu: grant.menu, action: grant.action, allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: id, infoItem: "reserve.amount", visible: reserveVisible });
  return id;
}

async function createRoles(): Promise<Roles> {
  const view = { menu: "pnl", action: "view" };
  return {
    finance: await createRole("경영관리", [view, { menu: "pnl", action: "write" }], true),
    reader: await createRole("읽기", [view], true),
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
