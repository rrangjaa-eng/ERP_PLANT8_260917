import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteLines, vendors } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { addDays, kstToday } from "@/lib/kst-date";

// quick 261001-85g DOM 감사 — 등록 폼 선택지가 노출표를 지난 뒤(ADMN-03) 가려진 계급의 화면.
// D: 거래처 정보가 가려진 계급의 견적 표에는 거래처 열이 없다(사용자 결정 2026-10-01). D2: 목록에 없는 거래처(보관)는 편집기를 열었다 닫아도 그대로다.
// A · B: 클라이언트 · 담당 PM 선택지가 0개면 등록 진입점이 없다(팀 0개와 같은 규칙).
const TODAY = kstToday(new Date());
const COL_VENDOR = 3;
const COL_ITEM = 2;

type Account = { userId: string; email: string; password: string };

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

// 프로젝트 보기 · 쓰기와 hiddenItem을 뺀 정보 항목을 가진 회사 범위 계급의 사람.
async function makeWriter(teamId: string, hiddenItem: string): Promise<Account> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E가림-${randomUUID().slice(0, 8)}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "write", allowed: true });
  for (const infoItem of ["project.value", "quote.amount", "vendor.value", "team.value", "person.value"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: infoItem !== hiddenItem });
  }
  const email = `e2e-hidden-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 가림", roleId: role.id });
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

function dataRow(page: Page, rowIndex: number): Locator {
  return page
    .getByRole("table", { name: "견적 줄" })
    .or(page.getByRole("grid", { name: "견적 줄" }))
    .locator("tbody tr:not([class*='groupRow']):not([class*='collapsedRow'])")
    .nth(rowIndex);
}

function vendorCell(page: Page, rowIndex: number): Locator {
  return dataRow(page, rowIndex).locator("> td").nth(COL_VENDOR);
}

test.describe("가려진 참조 정보의 화면(quick 261001-85g)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  // 견적 줄 하나(거래처 있음)를 가진 프로젝트 — 담당 PM은 writer.
  async function makeProjectWithVendorLine(teamId: string, writer: Account) {
    const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E가림거래처-${randomUUID()}`, normalizedName: `e2e가림거래처-${randomUUID()}` });
    const created = await createProject(SYSTEM_VIEWER, {
      clientId: client.id,
      teamId,
      pmUserId: writer.userId,
      name: `E2E가림-${randomUUID().slice(0, 8)}`,
      startDate: addDays(TODAY, -10),
      endDate: addDays(TODAY, 30),
    });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("소분류 코드가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: randomUUID(),
          isNew: true as const,
          lineKind: "quote" as const,
          subcategory: subcategory.value,
          itemName: "가림 거래처 줄",
          vendorId: client.id,
          quantity: 1,
          unitPrice: { currency: "KRW" as const, amount: 100_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 80_000, fxRate: 1 },
        },
      ],
    });
    return { projectId: created.id, client, revisionId: revision.id };
  }

  test("D: 거래처 정보가 가려진 계급의 견적 표에는 거래처 열이 없다(가려진 정보의 열은 그리지 않는다)", async ({ page }) => {
    const teamId = await makeTeam();
    const writer = await makeWriter(teamId, "vendor.value");
    const { projectId, client } = await makeProjectWithVendorLine(teamId, writer);

    await login(page, writer);
    await page.goto(`/projects/${projectId}`);
    const table = page.getByRole("table", { name: "견적 줄" }).or(page.getByRole("grid", { name: "견적 줄" }));
    await expect(table.getByRole("columnheader", { name: "항목" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "거래처" })).toHaveCount(0);
    await expect(table).not.toContainText(client.id);
    // /qa ISSUE-002 — 등록할 수 없는 계급(클라이언트 선택지 0개)에게 「프로젝트 복사」는 막다른 길이라 없다.
    await expect(page.getByRole("link", { name: /프로젝트 복사/ })).toHaveCount(0);
  });

  test("D2: 보관된 거래처 줄은 거래처 칸을 열었다 닫아도 값이 그대로다", async ({ page }) => {
    const teamId = await makeTeam();
    const writer = await makeWriter(teamId, "");
    const { projectId, client } = await makeProjectWithVendorLine(teamId, writer);
    await db.update(vendors).set({ archivedAt: new Date() }).where(eq(vendors.id, client.id));
    // 대조 단언(「프로젝트 복사」 있음)은 클라이언트 선택지가 하나라도 있어야 한다 — 다른 테스트가 남긴 거래처에 기대지 않는다.
    await insertVendor(SYSTEM_VIEWER, { name: `E2E살아있는거래처-${randomUUID()}`, normalizedName: `e2e살아있는거래처-${randomUUID()}` });

    await login(page, writer);
    await page.goto(`/projects/${projectId}`);
    // 대조(/qa ISSUE-002) — 등록할 수 있는 계급에는 「프로젝트 복사」가 있다.
    await expect(page.getByRole("link", { name: /프로젝트 복사/ }).first()).toBeVisible();
    const cell = vendorCell(page, 0);
    const before = await cell.textContent();

    await cell.focus();
    await page.keyboard.press("Enter");
    const select = page.getByRole("combobox", { name: "거래처" });
    await expect(select).toHaveValue(client.id);
    await page.keyboard.press("Tab");

    await expect(select).toHaveCount(0);
    await expect(cell).toHaveText(before ?? "");
  });

  // Codex 리뷰 P1(PR #125) — 거래처 id가 없는 DTO로 그린 줄을 고쳐 저장해도 거부되지 않고, 거래처는 그대로다.
  test("D4: 거래처 정보가 가려진 계급이 기존 줄의 항목을 고쳐 저장하면 저장되고 거래처는 그대로다", async ({ page }) => {
    const teamId = await makeTeam();
    const writer = await makeWriter(teamId, "vendor.value");
    const { projectId, client, revisionId } = await makeProjectWithVendorLine(teamId, writer);

    await login(page, writer);
    await page.goto(`/projects/${projectId}`);
    const itemCell = dataRow(page, 0).getByRole("gridcell").nth(COL_ITEM);
    await expect(itemCell).toHaveText("가림 거래처 줄");
    await itemCell.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "항목", exact: true }).fill("가림 줄 고침");
    await page.keyboard.press("Enter");
    await itemCell.focus();
    await page.keyboard.press("Control+s");
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    const rows = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId));
    expect(rows.map((row) => [row.itemName, row.vendorId])).toEqual([["가림 줄 고침", client.id]]);
  });

  // Codex 리뷰 P1(PR #125) — 바뀌지 않은 원본 줄을 복제해 저장해도 새 줄이 원본 거래처를 받는다.
  test("D5: 거래처 정보가 가려진 계급이 줄을 복제해 저장하면 새 줄도 원본 거래처를 갖는다", async ({ page }) => {
    const teamId = await makeTeam();
    const writer = await makeWriter(teamId, "vendor.value");
    const { projectId, client, revisionId } = await makeProjectWithVendorLine(teamId, writer);

    await login(page, writer);
    await page.goto(`/projects/${projectId}`);
    const itemCell = dataRow(page, 0).getByRole("gridcell").nth(COL_ITEM);
    await expect(itemCell).toHaveText("가림 거래처 줄");
    await itemCell.focus();
    await page.keyboard.press("Control+d");
    await expect(dataRow(page, 1).getByRole("gridcell").nth(COL_ITEM)).toHaveText("가림 거래처 줄");
    await itemCell.focus();
    await page.keyboard.press("Control+s");
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    const rows = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.vendorId)).toEqual([client.id, client.id]);
  });

  test("D6: 저장 전 복제 줄을 다시 복제해도 저장된 원본의 거래처를 갖는다", async ({ page }) => {
    const teamId = await makeTeam();
    const writer = await makeWriter(teamId, "vendor.value");
    const { projectId, client, revisionId } = await makeProjectWithVendorLine(teamId, writer);

    await login(page, writer);
    await page.goto(`/projects/${projectId}`);
    const itemCell = dataRow(page, 0).getByRole("gridcell").nth(COL_ITEM);
    await expect(itemCell).toHaveText("가림 거래처 줄");
    await itemCell.focus();
    await page.keyboard.press("Control+d");
    const copyCell = dataRow(page, 1).getByRole("gridcell").nth(COL_ITEM);
    await expect(copyCell).toHaveText("가림 거래처 줄");
    await copyCell.focus();
    await page.keyboard.press("Control+d");
    await expect(dataRow(page, 2).getByRole("gridcell").nth(COL_ITEM)).toHaveText("가림 거래처 줄");
    await copyCell.focus();
    await page.keyboard.press("Control+s");
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    const rows = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId));
    expect(rows.map((row) => row.vendorId)).toEqual([client.id, client.id, client.id]);
  });

  test("D3: 팀 업무 범위인데 오늘 팀이 없는 계급에게는 「프로젝트 복사」가 없다(목록 등록 진입점과 같은 좁힌 규칙)", async ({ page }) => {
    const teamId = await makeTeam();
    const owner = await makeWriter(teamId, "");
    const { projectId } = await makeProjectWithVendorLine(teamId, owner);
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E팀없음-${randomUUID().slice(0, 8)}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "write", allowed: true });
    for (const infoItem of ["project.value", "quote.amount", "vendor.value", "team.value", "person.value"]) {
      await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    }
    const email = `e2e-noteam-${randomUUID()}@example.test`;
    const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 팀없음", roleId: role.id });
    const noTeam: Account = { userId, email, password: tempPassword };

    await login(page, noTeam);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole("table", { name: "견적 줄" }).or(page.getByRole("grid", { name: "견적 줄" }))).toBeVisible();
    await expect(page.getByRole("link", { name: /프로젝트 복사/ })).toHaveCount(0);
  });

  // /qa ISSUE-001(PR #121) — 보관 거래처는 선택지에 없어 칸 · 편집기 선택지가 UUID를 그렸다. 줄이 실은 이름을 그린다.
  test("D4: 보관된 거래처 줄은 거래처 칸 · 편집기 선택지에 실제 이름이 보인다", async ({ page }) => {
    const teamId = await makeTeam();
    const writer = await makeWriter(teamId, "");
    const { projectId, client } = await makeProjectWithVendorLine(teamId, writer);
    await db.update(vendors).set({ archivedAt: new Date() }).where(eq(vendors.id, client.id));

    await login(page, writer);
    await page.goto(`/projects/${projectId}`);
    const cell = vendorCell(page, 0);
    await expect(cell).toHaveText(client.name);

    await cell.focus();
    await page.keyboard.press("Enter");
    const select = page.getByRole("combobox", { name: "거래처" });
    await expect(select.locator(`option[value="${client.id}"]`)).toHaveText(client.name);
    await page.keyboard.press("Escape");
    await expect(page.locator("main")).not.toContainText(client.id);
  });

  // /review(PR #128) — 줄 복제(Ctrl+D)는 거래처 id만 옮겨 복제 줄이 「—」로 보였다(값은 거래처가 있는데 빈 칸처럼).
  test("D5: 보관된 거래처 줄을 복제해도 복제 줄 거래처 칸에 실제 이름이 보인다", async ({ page }) => {
    const teamId = await makeTeam();
    const writer = await makeWriter(teamId, "");
    const { projectId, client } = await makeProjectWithVendorLine(teamId, writer);
    await db.update(vendors).set({ archivedAt: new Date() }).where(eq(vendors.id, client.id));

    await login(page, writer);
    await page.goto(`/projects/${projectId}`);
    await vendorCell(page, 0).focus();
    await page.keyboard.press("Control+d");
    await expect(vendorCell(page, 1)).toHaveText(client.name);
  });

  test("대조: 셋 다 보이는 계급에는 등록 진입점이 있다", async ({ page }) => {
    const teamId = await makeTeam();
    const writer = await makeWriter(teamId, "");
    await login(page, writer);

    await page.goto("/projects");
    await expect(page.getByRole("link", { name: /프로젝트 등록/ }).first()).toBeVisible();
  });

  for (const hidden of [
    { item: "vendor.value", label: "클라이언트" },
    { item: "person.value", label: "담당 PM" },
  ]) {
    test(`A · B: ${hidden.label} 선택지가 가려진 계급에는 등록 진입점이 없다`, async ({ page }) => {
      const teamId = await makeTeam();
      const writer = await makeWriter(teamId, hidden.item);
      await login(page, writer);

      await page.goto("/projects");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: /프로젝트 등록/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /프로젝트 등록/ })).toHaveCount(0);

      await page.goto("/projects?new=1");
      await expect(page.getByRole("combobox", { name: hidden.label })).toHaveCount(0);
    });
  }
});
