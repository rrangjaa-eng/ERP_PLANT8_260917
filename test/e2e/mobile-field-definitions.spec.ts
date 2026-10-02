import { randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { archiveE2EFieldDefinitions } from "./fixtures";
import { expectNoRowOverflow, loginAsSysadmin } from "./row-actions-helpers";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { archive } from "@/domain/archive";
import { insertFieldDefinition } from "@/repositories/field-definitions";
import { insertVisibilityIfAbsent } from "@/repositories/permissions";
import { listRoles } from "@/repositories/roles";

// 04.5-04(UI-SPEC 화면 1 폰 · SYSTEM.md §7-3 칸 접기): 폰(<700)에서 P1 = 이름 · 정렬 · 동작, P2 접힌 줄 = 타입 · 필수 · 선택지.
// 상태 열은 숨고 보관 행은 동작 자리에 「보관됨」이 보인다. 가로 스크롤 없음.
const PREFIX = "E2E폰칸";

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(PREFIX);
});

async function seedSelectField(label: string): Promise<string> {
  const id = `fd-${randomUUID()}`;
  const key = `cf_${randomBytes(4).toString("hex")}`;
  await insertFieldDefinition(SYSTEM_VIEWER, {
    id,
    entity: "vendor",
    key,
    label,
    type: "select",
    options: ["기본", "특약"],
    required: true,
    sortOrder: 3,
  });
  for (const role of await listRoles(SYSTEM_VIEWER, { includeArchived: true })) {
    await insertVisibilityIfAbsent(SYSTEM_VIEWER, { roleId: role.id, infoItem: `cf.vendor.${key}`, visible: true });
  }
  return id;
}

function listRow(page: Page, label: string) {
  return page.locator("tbody tr", { has: page.locator('th[scope="row"]', { hasText: label }) });
}

test("폰 375 화면 항목 목록: 이름 · 정렬 · 동작만 열이고 타입 · 필수 · 선택지는 접힌 줄, 보관 행은 동작 자리에 「보관됨」", async ({ page }) => {
  const active = `${PREFIX}${randomBytes(3).toString("hex")}`;
  const archived = `${PREFIX}${randomBytes(3).toString("hex")}`;
  await seedSelectField(active);
  const archivedId = await seedSelectField(archived);
  await archive(SYSTEM_VIEWER, "field_definitions", archivedId);

  await loginAsSysadmin(page);
  await page.goto("/admin/field-definitions?includeArchived=1");

  const row = listRow(page, active);
  await expect(row.locator('th[scope="row"]')).toBeVisible();
  const visibleCells = row.locator("td:visible");
  await expect(visibleCells).toHaveCount(2);
  await expect(visibleCells.nth(0)).toHaveText("3");
  await expect(row.getByRole("link", { name: `${active} 수정`, exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "삭제" })).toBeVisible();
  await expect(row.locator("+ tr")).toHaveText("선택 · 필수 · 기본, 특약");
  await expect(row.locator("+ tr")).toBeVisible();

  const archivedRow = listRow(page, archived);
  const archivedCells = archivedRow.locator("td:visible");
  await expect(archivedCells).toHaveCount(2);
  await expect(archivedCells.nth(1)).toHaveText("보관됨");
  await expect(archivedRow.getByRole("link")).toHaveCount(0);
  await expect(archivedRow.getByRole("button")).toHaveCount(0);

  await expectNoRowOverflow(page, row, "화면 항목 목록");
});
