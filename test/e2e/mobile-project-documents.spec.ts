import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";

// 07-22(W3 · SC-20) — 폰(375) 「서류」 섹션: 세로 한 기둥 · 붙이기 → 파일 줄 · 종류 칸 · 붙이기 영역 터치 44 이상 · 가로 넘침 없음.
const TODAY = kstToday(new Date());

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("폰 서류 섹션 — 붙이기 → 줄 · 터치 44 · 가로 넘침 없음", async ({ page }) => {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const email = `e2e-mdocs-${randomUUID()}@example.test`;
  const pm = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 폰 서류 PM", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId: pm.userId, teamId: team.id, effectiveFrom: TODAY });
  const clientName = `E2E폰서류거래처-${randomUUID()}`;
  const client = await insertVendor(SYSTEM_VIEWER, { name: clientName, normalizedName: clientName.toLowerCase() });
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.userId, name: `E2E폰서류-${randomUUID().slice(0, 8)}`, startDate: TODAY, endDate: addDays(TODAY, 10) });

  await login(page, { email, password: pm.tempPassword });
  await page.goto(`/projects/${project.id}`);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "서류", exact: true }) });
  await expect(section.getByText("서류 없음", { exact: true })).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await section.getByRole("button", { name: "서류 붙이기", exact: true }).click();
  const pdf = { name: "발주서.pdf", mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${randomUUID()}\n%%EOF\n`) };
  await (await chooser).setFiles(pdf);
  await expect(section.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name })).toBeVisible({ timeout: 20_000 });

  const touchMin = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--touch-min")));
  const kind = section.getByLabel("종류", { exact: true });
  expect((await kind.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(touchMin);
  const more = section.getByRole("button", { name: "하나 더" });
  expect((await more.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(touchMin);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
