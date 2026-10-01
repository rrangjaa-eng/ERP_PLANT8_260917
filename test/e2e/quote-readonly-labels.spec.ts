import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { listPermissions, listVisibility, upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { findUserByEmail } from "@/repositories/users";
import { insertCodeItem, setCodeItemActive, setCodeItemArchived } from "@/repositories/code-tables";

// 버그 재현(2026-09-28 스킨 촬영 중 발견): 견적 원장을 보기만 하는 계급(쓰기·조정 권한 없음 — 대표)에게
// 소분류가 이름(무대·시공) 대신 코드값(stage_construction)으로, 거래처가 이름 대신 id로 보였다.
// page.tsx가 이름 목록을 쓰기·조정 권한이 있을 때만 읽었기 때문이다.
// 계급은 대표 권한·노출을 복사하고 프로젝트 쓰기·조정만 끈 임시 계급이다 — role-ceo는 다른 스펙이 쓰기를 켜 두어 순서에 따라 재현이 사라진다.
test("보기만 하는 계급도 견적 원장에서 소분류·거래처를 이름으로 본다", async ({ page }) => {
  const roleId = `role-e2e-readonly-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 보기만 ${roleId.slice(-12)}`, sortOrder: 99, workScope: "company" });
  for (const row of await listPermissions(SYSTEM_VIEWER, { roleId: "role-ceo" })) {
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: row.menu, action: row.action, allowed: row.allowed });
  }
  for (const row of await listVisibility(SYSTEM_VIEWER, { roleId: "role-ceo" })) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: row.infoItem, visible: row.visible });
  }
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "write", allowed: false });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects.adjustment", action: "write", allowed: false });
  const ceo = await createFixtureUser({ roleId, withTeam: true });
  const pm = await createFixtureUser({ roleId: "role-pm", withTeam: true });
  const pmUser = await findUserByEmail(SYSTEM_VIEWER, pm.email);
  if (!pmUser) throw new Error("PM 픽스처가 없습니다");
  const org = await createOrgUnit(SYSTEM_VIEWER, { name: `읽기본부-${randomUUID().slice(0, 8)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: org.id, name: `읽기팀-${randomUUID().slice(0, 6)}` });
  const vendorName = `읽기거래처-${randomUUID().slice(0, 6)}`;
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName });
  const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: pmUser.id, name: `읽기-${randomUUID().slice(0, 6)}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("차수가 없습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
    { id: randomUUID(), isNew: true, subcategory: "stage_construction", itemName: "메인 스테이지", quantity: 1, vendorId: vendor.id,
      unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
  ] });

  await page.goto("/login");
  await page.getByLabel("이메일").fill(ceo.email);
  await page.getByLabel("비밀번호").fill(ceo.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto(`/projects/${project.id}`);

  const table = page.getByRole("table", { name: "견적 줄" });
  await expect(table.getByText("메인 스테이지")).toBeVisible();
  // 폰용 접힌 줄에도 같은 글자가 숨어 있어 셀 역할(숨은 요소 제외)로 찾는다
  await expect(table.getByRole("cell", { name: "무대·시공", exact: true }).first()).toBeVisible();   // 그룹 머리글 + 소분류 칸
  await expect(table.getByText("stage_construction")).toHaveCount(0);
  await expect(table.getByRole("cell", { name: vendorName, exact: true })).toBeVisible();
  await expect(table.getByText(vendor.id)).toHaveCount(0);
});

// quick 261001-hfi(MAST-04) — 견적 분류를 코드표 화면에서 끄면 그 분류를 쓰던 줄이 코드값으로 보였다(이름 목록이 활성 항목만 실었다).
// 편집 계정 · 보기 전용 계정 모두 이름으로 읽고, 끈 분류는 편집 선택지에 나오지 않는다.
test("비활성 견적 분류를 쓰던 줄도 편집 · 보기 전용 계정 모두 이름으로 보고, 선택지엔 그 분류가 없다", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const item = await insertCodeItem(SYSTEM_VIEWER, { tableKey: "quote_subcategory", value: `e2e_off_${suffix}`, label: `끈분류-${suffix}` });
  const viewerRoleId = `role-e2e-readonly-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: viewerRoleId, name: `E2E 보기만 ${viewerRoleId.slice(-12)}`, sortOrder: 99, workScope: "company" });
  for (const row of await listPermissions(SYSTEM_VIEWER, { roleId: "role-ceo" })) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: viewerRoleId, menu: row.menu, action: row.action, allowed: row.allowed });
  }
  for (const row of await listVisibility(SYSTEM_VIEWER, { roleId: "role-ceo" })) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: viewerRoleId, infoItem: row.infoItem, visible: row.visible });
  }
  await upsertPermission(SYSTEM_VIEWER, { roleId: viewerRoleId, menu: "projects", action: "write", allowed: false });
  await upsertPermission(SYSTEM_VIEWER, { roleId: viewerRoleId, menu: "projects.adjustment", action: "write", allowed: false });
  const reader = await createFixtureUser({ roleId: viewerRoleId, withTeam: true });
  const pm = await createFixtureUser({ roleId: "role-pm", withTeam: true });
  const pmUser = await findUserByEmail(SYSTEM_VIEWER, pm.email);
  if (!pmUser) throw new Error("PM 픽스처가 없습니다");
  const org = await createOrgUnit(SYSTEM_VIEWER, { name: `분류본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: org.id, name: `분류팀-${suffix}` });
  const vendorName = `분류거래처-${suffix}`;
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName });
  const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: pmUser.id, name: `분류-${suffix}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("차수가 없습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
    { id: randomUUID(), isNew: true, subcategory: item.value, itemName: "끈 분류 줄", quantity: 1, vendorId: vendor.id,
      unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
    { id: randomUUID(), isNew: true, subcategory: "stage_construction", itemName: "켠 분류 줄", quantity: 1, vendorId: vendor.id,
      unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
  ] });
  // 끈 분류는 지난 차수에 가장 자주 남는다 — 2차를 만들어 1차(이전 차수 읽기 섹션)도 이름으로 보는지 본다(/review 2차 testing).
  await createRevisionFromCurrent(SYSTEM_VIEWER, { projectId: project.id, fromRevisionId: revision.id });
  await setCodeItemActive(SYSTEM_VIEWER, item.id, false);

  try {
    for (const account of [pm, reader]) {
      await page.context().clearCookies();
      await page.goto("/login");
      await page.getByLabel("이메일").fill(account.email);
      await page.getByLabel("비밀번호").fill(account.password);
      await page.getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL(/\/account$/);
      await page.goto(`/projects/${project.id}`);

      // 편집 계정은 격자(grid), 보기 전용은 표(table) 역할이라 캡션으로 찾는다.
      const table = page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) });
      await expect(table.getByText("끈 분류 줄")).toBeVisible();
      await expect(table.getByText(item.label, { exact: true }).first()).toBeVisible();   // 그룹 머리글 + 소분류 칸
      await expect(table.getByText(item.value)).toHaveCount(0);

      const revisions = page.locator("table", { has: page.locator("caption", { hasText: /^차수$/ }) });
      await revisions.locator("tbody").getByRole("button", { name: "차수 열기" }).click();
      const previous = page.locator("table", { has: page.locator("caption", { hasText: /^상세 견적 1차 견적 줄$/ }) });
      await expect(previous.getByText("끈 분류 줄")).toBeVisible();
      await expect(previous.getByText(item.label, { exact: true }).first()).toBeVisible();
      await expect(previous.getByText(item.value)).toHaveCount(0);
    }

    // 편집 계정(PM)의 소분류 선택지 — 켠 분류 줄의 소분류 칸을 열어 본다.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/projects/${project.id}`);
    const table = page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) });
    const row = table.locator('tbody tr:has(td[role="gridcell"])', { hasText: "켠 분류 줄" });
    const cell = row.getByRole("gridcell").nth(1);
    await expect(async () => {
      await cell.focus();
      await page.keyboard.press("Enter");
      await expect(cell.locator("select")).toBeFocused({ timeout: 1000 });
    }).toPass();
    const optionValues = await cell.locator("select option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    expect(optionValues).toContain("stage_construction");
    expect(optionValues).not.toContain(item.value);
    await page.keyboard.press("Escape");

    // 독립 검토(#138) — 끈 분류 줄의 소분류 칸을 열었다 나가기만 해도 값이 비면 안 된다(현재 값은 그대로 남는다).
    const offRow = table.locator('tbody tr:has(td[role="gridcell"])', { hasText: "끈 분류 줄" });
    const offCell = offRow.getByRole("gridcell").nth(1);
    await expect(async () => {
      await offCell.focus();
      await page.keyboard.press("Enter");
      await expect(offCell.locator("select")).toBeFocused({ timeout: 1000 });
    }).toPass();
    await expect(offCell.locator("select")).toHaveValue(item.value);
    await page.keyboard.press("Tab");   // 칸을 나가며 커밋 — 다음 칸(항목)이 편집으로 열리므로 Escape로 닫는다
    await page.keyboard.press("Escape");
    await expect(offCell).toHaveText(item.label);
    await expect(page.getByText("소분류 필요")).toHaveCount(0);

    // /review red team — 끈 분류 줄에서 Ctrl+Enter로 만든 새 줄은 끈 분류를 물려받지 않는다(새 입력엔 끈 분류를 고를 수 없다).
    const dataRows = table.locator('tbody tr:has(td[role="gridcell"])');
    const offLabelRows = dataRows.filter({ has: page.getByRole("gridcell", { name: item.label, exact: true }) });
    const before = await dataRows.count();
    await page.keyboard.press("Control+Enter");
    await expect(dataRows).toHaveCount(before + 1);
    await expect(offLabelRows).toHaveCount(1);
    // 복제(Ctrl+D)도 같다 — 항목 · 금액은 복사하되 끈 분류는 물려받지 않는다.
    await page.keyboard.press("Escape");
    await offRow.getByRole("gridcell").nth(2).focus();
    await page.keyboard.press("Control+d");
    await expect(dataRows).toHaveCount(before + 2);
    await expect(offLabelRows).toHaveCount(1);
    await expect(dataRows.filter({ hasText: "끈 분류 줄" })).toHaveCount(2);
  } finally {
    await setCodeItemArchived(SYSTEM_VIEWER, item.id, true);
  }
});
