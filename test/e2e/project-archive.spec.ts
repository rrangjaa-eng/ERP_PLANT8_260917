import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projectBudgetEntries, projects } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";

// 07.2-17(S1 · D-7210~7213) — 상세 머리 `프로젝트 삭제`(확인 창 없음) → `/projects?deleted=` 토스트 `되돌리기` · `보관함` 링크 → 보관함 `프로젝트` 행 복원.
const TODAY = kstToday(new Date());
const SHOTS = "test-results/07.2-17";

type Account = { userId: string; email: string; password: string };

async function makeAccount(roleId: string, teamId: string): Promise<Account> {
  const email = `e2e-project-archive-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: `E2E삭제${randomUUID().slice(0, 6)}`, roleId });
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

async function setup() {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
  const lead = await makeAccount("role-team-lead", team.id);
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E삭제고객사-${randomUUID()}`, normalizedName: `e2e삭제고객사-${randomUUID()}` });
  const name = `E2E삭제-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: pm.userId, name, startDate: addDays(TODAY, 2), endDate: addDays(TODAY, 20) });
  const [row] = await db.select({ number: projects.number }).from(projects).where(eq(projects.id, created.id));
  return { pm, lead, project: { id: created.id, name, number: row?.number ?? "" } };
}

async function archivedAt(projectId: string): Promise<Date | null> {
  const [row] = await db.select({ archivedAt: projects.archivedAt }).from(projects).where(eq(projects.id, projectId));
  return row?.archivedAt ?? null;
}

test.describe("프로젝트 삭제 · 되살리기 (S1)", () => {
  test("팀장: 돈 문서 0건이면 확인 창 없이 지우고 토스트 `되돌리기`로 바로 되살린다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/projects/${project.id}`);
    const remove = page.getByRole("button", { name: "프로젝트 삭제", exact: true });
    await expect(remove).toBeVisible();
    // 카드 11/12 — PC 머리 행동 줄 맨 끝: 1차 `일괄 저장`의 오른쪽에 떨어져 선다(붙어 있지 않다 — 간격 --s-8 = 32).
    const saveBox = await page.getByRole("button", { name: /일괄 저장/ }).boundingBox();
    const removeBox = await remove.boundingBox();
    expect(saveBox && removeBox).toBeTruthy();
    expect(removeBox!.x - (saveBox!.x + saveBox!.width), "프로젝트 삭제는 일괄 저장 오른쪽 · 떨어져").toBeGreaterThanOrEqual(30);
    await page.screenshot({ path: `${SHOTS}/delete-entry-1280.png` });
    await remove.click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/projects\\?deleted=${project.id}$`));
    await expect(page.getByText(`프로젝트 삭제 · ${project.number}`)).toBeVisible();
    expect(await archivedAt(project.id)).not.toBeNull();
    await page.screenshot({ path: `${SHOTS}/delete-toast-1280.png` });

    // DOM 감사 ② — 착지 첫 포커스가 `되돌리기`(키보드 사용자도 4초 안에 Enter 한 번).
    const undo = page.getByRole("button", { name: "되돌리기", exact: true });
    await expect(undo).toBeFocused();
    await undo.click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect.poll(() => archivedAt(project.id)).toBeNull();
  });

  test("팀장(admin.archive 없음): `보관함` 링크 → 자기 범위 `프로젝트` 행만 · 복원", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "프로젝트 삭제", exact: true }).click();
    await expect(page).toHaveURL(/deleted=/);

    await page.getByRole("link", { name: "보관함", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/archive$/);
    const row = page.locator("tr", { hasText: `${project.number} ${project.name}` });
    await expect(row).toHaveCount(1);
    // admin.archive가 없는 팀장 — 다른 종류 행이 없다(복원 버튼은 이 프로젝트 행 하나뿐).
    await expect(page.getByRole("button", { name: "복원", exact: true })).toHaveCount(1);
    await page.screenshot({ path: `${SHOTS}/archive-project-row.png`, fullPage: true });
    await row.getByRole("button", { name: "복원" }).click();
    await expect(row).toHaveCount(0);
    await expect.poll(() => archivedAt(project.id)).toBeNull();
  });

  test("돈 문서가 붙으면 `프로젝트 삭제`가 aria-disabled + 이유 `돈 문서 1건 연결 · 삭제 불가`", async ({ page }) => {
    const { lead, project } = await setup();
    await db.insert(projectBudgetEntries).values({ projectId: project.id, reason: "manual", deltaKrw: 1000, memo: "E2E 수동 조정", createdBy: lead.userId });
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    const remove = page.getByRole("button", { name: "프로젝트 삭제", exact: true });
    await expect(remove).toHaveAttribute("aria-disabled", "true");
    await expect(remove).toHaveAccessibleDescription("돈 문서 1건 연결 · 삭제 불가");
    // aria-disabled 버튼은 탭 순서에 남아 눌린다 — 눌러도 아무 일이 없다.
    await remove.dispatchEvent("click");
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
    expect(await archivedAt(project.id)).toBeNull();
  });

  test("/review #2 — 화면을 연 뒤 돈 문서가 붙어 서버가 거부하면 그 사유를 토스트에 그대로 싣는다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    const remove = page.getByRole("button", { name: "프로젝트 삭제", exact: true });
    await expect(remove).not.toHaveAttribute("aria-disabled", "true");
    await db.insert(projectBudgetEntries).values({ projectId: project.id, reason: "manual", deltaKrw: 1000, memo: "E2E 수동 조정", createdBy: lead.userId });
    await remove.click();
    await expect(page.getByText("돈 문서 1건 연결 · 삭제 불가", { exact: true })).toBeVisible();
    await expect(page.getByText("삭제 실패 · 다시 시도")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}$`));
    expect(await archivedAt(project.id)).toBeNull();
  });

  test("직원(projects.delete 없음): 삭제 입구 · 보관함 링크 0 · /admin/archive 404", async ({ page }) => {
    const { pm, project } = await setup();
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(page.getByRole("button", { name: "프로젝트 삭제", exact: true })).toHaveCount(0);
    await page.goto("/projects");
    await expect(page.getByRole("link", { name: "보관함", exact: true })).toHaveCount(0);
    const response = await page.goto("/admin/archive");
    expect(response?.status()).toBe(404);
  });

  test("375: `더보기` 펼친 줄 끝 `프로젝트 삭제` 높이 44 · 앞 행동과 떨어짐", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/projects/${project.id}`);
    // 아래 탭의 `더보기`가 아니라 머리 행동 묶음의 `더보기`. 수화 전 누름은 무동작이라 펼쳐질 때까지 다시 누른다.
    const more = page.getByRole("main").getByRole("button", { name: "더보기", exact: true });
    const remove = page.getByRole("button", { name: "프로젝트 삭제", exact: true });
    await expect(async () => {
      if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
      await expect(remove).toBeVisible({ timeout: 1_000 });
    }).toPass();
    const box = await remove.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `${SHOTS}/delete-entry-375.png` });
  });
  test("375: 보관함 긴 프로젝트 이름(40자)은 한 줄 말줄임 · 전체 이름은 title (카드 11/12)", async ({ page }) => {
    const { lead, project } = await setup();
    const longName = `${project.name}-${"가".repeat(40)}`.slice(0, 40);
    await db.update(projects).set({ name: longName, archivedAt: new Date() }).where(eq(projects.id, project.id));
    await login(page, lead);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin/archive");
    const cell = page.locator("tr", { hasText: project.number }).locator("[data-cell-text]");
    await expect(cell).toHaveCount(1);
    await expect(cell).toHaveAttribute("title", `${project.number} ${longName}`);
    const metrics = await cell.evaluate((node) => ({ height: node.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(node).lineHeight) }));
    // 한 줄: 높이가 줄 높이의 1.5배 미만(두 줄이면 2배 이상). 40자는 375 칸에 안 들어가 잘린다.
    expect(metrics.height, "이름 칸 한 줄").toBeLessThan(metrics.lineHeight * 1.5);
    await page.screenshot({ path: `${SHOTS}/archive-ellipsis-375.png` });
  });
});
