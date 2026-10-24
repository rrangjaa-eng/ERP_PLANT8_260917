import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, settingsSimple } from "@/db/schema";
import { createFixtureUser } from "./fixtures";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { PROJECT_COST_RATE_PCT } from "@/domain/settings/keys";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { findSimpleValue, upsertSimpleValue } from "@/repositories/settings";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 07-24(SC-21 폰 375): P1 세 열(프로젝트 · 남은 예산 · 상태) · 행 탭 → 예산 이력 시트(`예산 바꾸기` 포함) · 가로 넘침 없음.
// 원가율은 전역 설정이라 끝에 원래 값으로 되돌린다(mobile-375는 워커 1 — 그동안 다른 스펙이 원가율을 바꾸지 않는다).

const KEY = PROJECT_COST_RATE_PCT.key;
let original: Awaited<ReturnType<typeof findSimpleValue>> = null;

test.beforeAll(async () => {
  original = await findSimpleValue(SYSTEM_VIEWER, KEY);
});

test.afterAll(async () => {
  if (original) await upsertSimpleValue(SYSTEM_VIEWER, KEY, original.value, original.updatedBy);
  else await db.delete(settingsSimple).where(eq(settingsSimple.key, KEY));
});

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("폰 375 — P1 세 열 · 행 탭 → 이력 시트(예산 바꾸기) · 가로 넘침 없음", async ({ page }) => {
  await upsertSimpleValue(SYSTEM_VIEWER, KEY, 70, null);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰예산본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰예산-${randomUUID().slice(0, 8)}` });
  const lead = await createAccount(SYSTEM_VIEWER, { email: `e2e-mbudget-lead-${randomUUID()}@example.test`, name: "E2E 폰 예산 팀장", roleId: TEAM_LEAD_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId: lead.userId, teamId: team.id, effectiveFrom: "2020-01-01" });
  const pm = await createAccount(SYSTEM_VIEWER, { email: `e2e-mbudget-pm-${randomUUID()}@example.test`, name: "E2E 폰 예산 PM", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId: pm.userId, teamId: team.id, effectiveFrom: "2020-01-01" });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E폰예산거래처-${randomUUID()}`, normalizedName: `e2e폰예산거래처-${randomUUID()}` });
  const name = `E2E폰예산-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.userId, name });
  await saveProjectLedger({ id: lead.userId, roleId: TEAM_LEAD_ROLE_ID }, created.id, { seenStatus: "bidding", preEstimate: { currency: "KRW", amount: 10_000_000, fxRate: 1, fxRateTouched: false } });
  await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, created.id));

  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E폰경영관리-${randomUUID().slice(0, 8)}`, viewScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.budget", action, allowed: true });
  for (const infoItem of ["budget.amount", "quote.amount", "project.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const user = await createFixtureUser({ roleId: role.id, teamId: team.id });

  await login(page, user);
  await page.goto("/projects/budget");
  const table = page.locator("table", { has: page.locator("caption", { hasText: /^예산 현황$/ }) });
  const visibleHeaders = await table.locator("thead th").evaluateAll((cells) =>
    cells.filter((cell) => cell.getClientRects().length > 0 && getComputedStyle(cell).display !== "none").map((cell) => cell.textContent?.trim() ?? ""),
  );
  expect(visibleHeaders).toEqual(["프로젝트", "남은 예산", "상태"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  await table.getByRole("button", { name: new RegExp(`· ${name} 상세 보기$`) }).click();
  const sheet = page.getByRole("dialog", { name: "예산 이력" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "예산 바꾸기" })).toBeVisible();
  await expect(sheet).toContainText("7,000,000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
