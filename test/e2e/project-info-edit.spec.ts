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
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";
import { insertTempRole } from "./temp-roles";
import { expandProjectInfo, projectInfo } from "./project-info-helpers";

// 07.2-17(S3 · DC-9 · D-7217~7220) — 정보 면 `고치기` 묶음의 기본 정보 4칸(행사명 · 고객사 · 담당 팀 · 담당 PM).
const TODAY = kstToday(new Date());
const SHOTS = "test-results/07.2-17";

type Account = { userId: string; email: string; password: string; name: string };

async function makeTeam(): Promise<{ id: string; name: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const name = `E2E팀-${randomUUID().slice(0, 8)}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name });
  return { id: team.id, name };
}

async function makeAccount(roleId: string, teamId: string, name: string): Promise<Account> {
  const email = `e2e-info-edit-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword, name };
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function setup() {
  const team = await makeTeam();
  const otherTeam = await makeTeam();
  const tag = randomUUID().slice(0, 6);
  const pm = await makeAccount(DEFAULT_ROLE_ID, team.id, `담당PM${tag}`);
  const mate = await makeAccount(DEFAULT_ROLE_ID, team.id, `같은팀${tag}`);
  const outsider = await makeAccount(DEFAULT_ROLE_ID, otherTeam.id, `다른팀${tag}`);
  const lead = await makeAccount("role-team-lead", team.id, `팀장${tag}`);
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E고객사-${randomUUID()}`, normalizedName: `e2e고객사-${randomUUID()}` });
  const name = `E2E기본정보-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: team.id,
    pmUserId: pm.userId,
    name,
    startDate: addDays(TODAY, 2),
    endDate: addDays(TODAY, 20),
  });
  await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, created.id));
  return { team, pm, mate, outsider, lead, project: { id: created.id, name } };
}

function waitForSaveAction(page: Page) {
  return page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST" && request.headers()["next-action"] !== undefined && (request.postData() ?? "").includes('"seenStatus":');
  });
}

async function openEdit(page: Page) {
  await expandProjectInfo(page);
  await projectInfo(page).getByRole("button", { name: "고치기", exact: true }).click();
  await expect(projectInfo(page).getByLabel("행사명", { exact: true })).toBeVisible();
}

test.describe("기본 정보 4칸 (S3)", () => {
  test("담당 PM이 행사명을 고치고 PM을 같은 팀 사람으로 바꾸면 일괄 저장 2 → 제목 갱신 · 다른 팀 사람은 고를 수 없다", async ({ page }) => {
    const { pm, mate, outsider, project } = await setup();
    await login(page, pm);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/projects/${project.id}`);
    await openEdit(page);
    const panel = projectInfo(page);

    const newName = `${project.name} 겨울`;
    await panel.getByLabel("행사명", { exact: true }).fill(newName);
    await panel.locator("#info-pm").click();
    const dialog = page.getByRole("dialog", { name: "담당 PM 바꾸기" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "담당 PM 검색" }).fill(outsider.name);
    const blocked = dialog.getByRole("option", { name: new RegExp(outsider.name) });
    await expect(blocked).toHaveAttribute("aria-disabled", "true");
    await expect(blocked).toContainText("담당 팀 소속 아님");
    await dialog.getByRole("textbox", { name: "담당 PM 검색" }).fill(mate.name);
    await dialog.getByRole("option", { name: new RegExp(mate.name) }).click();
    await dialog.getByRole("button", { name: /이 사람으로/ }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.getByText(mate.name, { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/info-edit-1280-dirty.png`, fullPage: true });

    const saved = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 2/ }).click();
    await saved;
    await expect(page.getByRole("heading", { name: newName })).toBeVisible();
    const [row] = await db.select({ name: projects.name, pmUserId: projects.pmUserId }).from(projects).where(eq(projects.id, project.id));
    expect(row).toEqual({ name: newName, pmUserId: mate.userId });
  });

  test("DOM 감사 ① — 키보드로 `바꾸기` → 행 Enter로 고르면 창이 닫히고 포커스가 그 `바꾸기`로 돌아온다", async ({ page }) => {
    const { pm, mate, project } = await setup();
    await login(page, pm);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/projects/${project.id}`);
    await openEdit(page);
    const panel = projectInfo(page);
    const trigger = panel.locator("#info-pm");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "담당 PM 바꾸기" });
    const search = dialog.getByRole("textbox", { name: "담당 PM 검색" });
    await expect(search).toBeFocused();
    await search.fill(mate.name);
    // 검색 결과가 그 한 사람으로 좁혀진 뒤에 ↓(첫 행) → Enter.
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: new RegExp(mate.name) })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(panel.getByText(mate.name, { exact: true })).toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("돈 문서가 붙으면 고객사 · 담당 팀 `바꾸기`가 없고 잠김 한 줄이 선다(편집 중에만)", async ({ page }) => {
    const { lead, project } = await setup();
    await db.insert(projectBudgetEntries).values({ projectId: project.id, reason: "manual", deltaKrw: 1000, memo: "E2E 수동 조정", createdBy: lead.userId });
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expandProjectInfo(page);
    const panel = projectInfo(page);
    await expect(panel.getByText("고객사 · 담당 팀 잠김 · 돈 문서 연결")).toHaveCount(0);
    await panel.getByRole("button", { name: "고치기", exact: true }).click();
    await expect(panel.getByText("고객사 · 담당 팀 잠김 · 돈 문서 연결")).toHaveCount(1);
    await expect(panel.locator("#info-client")).toHaveCount(0);
    await expect(panel.locator("#info-team")).toHaveCount(0);
    await expect(panel.locator("#info-pm")).toHaveCount(1);
    await page.screenshot({ path: `${SHOTS}/info-edit-locked.png`, fullPage: true });
  });

  test("projects.info가 없는 계급은 4칸을 읽기만 한다(편집 칸 0)", async ({ page }) => {
    const { team, project } = await setup();
    const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E정보읽기-${randomUUID().slice(0, 8)}`, workScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    for (const infoItem of ["project.value", "vendor.value", "team.value", "person.value"]) {
      await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    }
    const reader = await makeAccount(role.id, team.id, `읽기${randomUUID().slice(0, 6)}`);
    await login(page, reader);
    await page.goto(`/projects/${project.id}`);
    await expandProjectInfo(page);
    const panel = projectInfo(page);
    await expect(panel.getByText("행사명", { exact: true })).toBeVisible();
    await expect(panel.getByText(team.name, { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "고치기", exact: true })).toHaveCount(0);
    await expect(panel.getByLabel("행사명", { exact: true })).toHaveCount(0);
  });

  test("두 화면이 같은 version에서 저장하면 두 번째에 `다른 사람이 … 바꿈` + 3차 `새로 고침`", async ({ page, browser }) => {
    const { pm, lead, project } = await setup();
    const other = await browser.newPage();
    await login(page, pm);
    await login(other, lead);
    await page.goto(`/projects/${project.id}`);
    await other.goto(`/projects/${project.id}`);
    await openEdit(page);
    await openEdit(other);

    await other.getByLabel("행사명", { exact: true }).fill(`${project.name} 먼저`);
    const first = waitForSaveAction(other);
    await other.getByRole("button", { name: /일괄 저장 1/ }).click();
    await first;
    await expect(other.getByRole("heading", { name: `${project.name} 먼저` })).toBeVisible();

    await page.getByLabel("행사명", { exact: true }).fill(`${project.name} 늦게`);
    const second = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await second;
    const panel = projectInfo(page);
    await expect(panel.getByText(/^다른 사람이 \d{2}:\d{2}에 바꿈/)).toBeVisible();
    await expect(panel.getByRole("button", { name: "새로 고침", exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/info-edit-conflict.png`, fullPage: true });
    const [row] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, project.id));
    expect(row?.name).toBe(`${project.name} 먼저`);
    await other.close();
  });

  test("충돌 뒤 `새로 고침`은 내가 바꾼 칸만 남기고 동료가 바꾼 칸은 새 값으로 — 다시 저장해도 동료의 PM이 그대로", async ({ page, browser }) => {
    const { pm, mate, lead, project } = await setup();
    const other = await browser.newPage();
    await login(page, pm);
    await login(other, lead);
    await page.goto(`/projects/${project.id}`);
    await other.goto(`/projects/${project.id}`);
    await openEdit(page);
    await openEdit(other);

    const myName = `${project.name} 내편집`;
    await page.getByLabel("행사명", { exact: true }).fill(myName);

    // 동료(팀장)는 담당 PM만 바꿔 먼저 저장한다.
    await projectInfo(other).locator("#info-pm").click();
    const dialog = other.getByRole("dialog", { name: "담당 PM 바꾸기" });
    await dialog.getByRole("textbox", { name: "담당 PM 검색" }).fill(mate.name);
    await dialog.getByRole("option", { name: new RegExp(mate.name) }).click();
    await dialog.getByRole("button", { name: /이 사람으로/ }).click();
    const first = waitForSaveAction(other);
    await other.getByRole("button", { name: /일괄 저장 1/ }).click();
    await first;

    const second = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await second;
    const panel = projectInfo(page);
    await expect(panel.getByText(/^다른 사람이 \d{2}:\d{2}에 바꿈/)).toBeVisible();

    const refreshed = page.waitForResponse((response) => response.request().headers()["rsc"] === "1" && response.url().includes(project.id));
    await panel.getByRole("button", { name: "새로 고침", exact: true }).click();
    await refreshed;
    await expect(panel.getByText(mate.name, { exact: true })).toBeVisible();
    await expect(page.getByLabel("행사명", { exact: true })).toHaveValue(myName);

    const third = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 \d/ }).click();
    await third;
    await expect(page.getByRole("heading", { name: myName })).toBeVisible();
    const [row] = await db.select({ name: projects.name, pmUserId: projects.pmUserId }).from(projects).where(eq(projects.id, project.id));
    expect(row).toEqual({ name: myName, pmUserId: mate.userId });
    await other.close();
  });
});
