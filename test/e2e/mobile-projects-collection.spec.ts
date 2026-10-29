import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertTempRole } from "./temp-roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { addDays, kstToday } from "@/lib/kst-date";

// 07-22(U15 · SC-20) — 폰(375)은 상태 칸 둘째 줄이 숨으므로 같은 한 값(종료일 지남 > 수금 지연)을 접힌 줄 기간 뒤 ` · `에 둔다.

const LIST_TABLE = "main table:not([aria-hidden='true'])";

async function makeManager(): Promise<{ email: string; password: string }> {
  const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E폰수금-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of ["project.value", "quote.amount", "revenue.issued_amount", "revenue.paid_amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  const email = `e2e-mobile-collect-${randomUUID()}@example.test`;
  const { tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 폰 경영관리", roleId: role.id });
  return { email, password: tempPassword };
}

async function seedLate(name: string, opts: { startDate?: string; endDate?: string; clientName?: string } = {}): Promise<void> {
  const today = kstToday(new Date());
  const { clientName, ...projectOpts } = opts;
  const client = await insertVendor(SYSTEM_VIEWER, { name: clientName ?? `E2E폰수금거래처-${randomUUID()}`, normalizedName: (clientName ?? `e2e폰수금거래처-${randomUUID()}`).toLowerCase() });
  const pm = await createAccount(SYSTEM_VIEWER, { email: `e2e-mobile-collect-pm-${randomUUID()}@example.test`, name: "E2E 폰 PM", roleId: DEFAULT_ROLE_ID });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.userId, name, ...projectOpts });
  await db.update(projects).set({ status: "bidding" }).where(eq(projects.id, project.id));
  await db.insert(revenueEntries).values({
    projectId: project.id,
    kind: "issue",
    entryDate: addDays(today, -70),
    amountCurrency: "KRW",
    amountFxRate: "1.0000",
    amountAmountKrw: 1_000_000,
  });
}

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

function rowGroup(page: Page, name: string) {
  return page.locator(`${LIST_TABLE} tbody`, { has: page.getByRole("link", { name, exact: true }) });
}

test("폰 접힌 줄 기간 뒤에 상태 2행 한 값 — 지연이면 수금 지연, 종료일 지남이면 그것 하나", async ({ page }) => {
  const today = kstToday(new Date());
  const marker = `E2E폰수금-${randomUUID().slice(0, 8)}`;
  await seedLate(`${marker}-지연`);
  await seedLate(`${marker}-종료지남`, { startDate: addDays(today, -80), endDate: addDays(today, -1) });

  await login(page, await makeManager());
  await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all`);

  const late = rowGroup(page, `${marker}-지연`);
  await expect(late).toHaveCount(1);
  const lateCollapsed = late.locator("tr").nth(1);
  await expect(lateCollapsed).toContainText(/^수금 지연 · /);
  await expect(lateCollapsed.getByText("수금 지연", { exact: true })).toHaveCount(1);
  // 상태 칸 2행은 폰에서 숨는다 — 보이는 수금 지연은 접힌 줄 하나뿐.
  await expect(late.locator("tr").first().getByText("수금 지연", { exact: true })).toBeHidden();

  const ended = rowGroup(page, `${marker}-종료지남`);
  const endedCollapsed = ended.locator("tr").nth(1);
  await expect(endedCollapsed.getByText("종료일 지남", { exact: true })).toBeVisible();
  await expect(endedCollapsed.getByText("수금 지연", { exact: true })).toHaveCount(0);
  await expect(ended.getByText("수금 지연", { exact: true })).toHaveCount(0);

  // 가로 넘침 없음.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// 07.1-18 게이트 2차 — 접힌 줄은 한 줄로 잘리므로 경고(종료일 지남 · 수금 지연)는 줄 맨 앞에 와야 긴 클라이언트 이름에 밀려 잘리지 않는다.
for (const width of [375, 320] as const) {
  test(`폰 접힌 줄 경고는 긴 클라이언트 이름에도 잘리지 않는다 (${width})`, async ({ page }) => {
    test.setTimeout(180_000);
    const today = kstToday(new Date());
    const marker = `E2E폰경고-${randomUUID().slice(0, 8)}`;
    const clientName = `E2E 아주 아주 긴 클라이언트 이름 대행사 주식회사 ${randomUUID().slice(0, 6)}`;
    await seedLate(`${marker}-종료지남`, { startDate: addDays(today, -80), endDate: addDays(today, -1), clientName });
    await login(page, await makeManager());
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all`);
    const group = rowGroup(page, `${marker}-종료지남`);
    await expect(group).toHaveCount(1);
    const folded = group.locator("tr").nth(1);
    const warning = folded.getByText("종료일 지남", { exact: true });
    await expect(warning).toBeVisible();
    const box = await warning.evaluate((el) => {
      const clip = el.closest("[data-cell-text]")!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, right: rect.right, clipTop: clip.top, clipBottom: clip.bottom, clipRight: clip.right, text: el.textContent };
    });
    expect(box.top, `경고가 클램프 첫 줄 안 ${JSON.stringify(box)}`).toBeLessThan(box.clipBottom - 1);
    expect(box.bottom).toBeLessThanOrEqual(box.clipBottom + 1);
    expect(box.right).toBeLessThanOrEqual(box.clipRight + 0.5);
    await expect(folded).toContainText(/^종료일 지남 · /);
    // 경고 색 — 접힌 줄 맨 앞 글자도 PC 상태 칸과 같은 --status-warning을 쓴다(색은 잃지 않는다).
    const colors = await warning.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--status-warning)";
      document.body.appendChild(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return { actual: getComputedStyle(el).color, expected };
    });
    expect(colors.actual, "경고 색 = --status-warning").toBe(colors.expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
