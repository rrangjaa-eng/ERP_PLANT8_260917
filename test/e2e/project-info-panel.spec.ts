import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";
import { cancelProjectInfoEdit, expandProjectInfo, openProjectInfoEdit, projectInfo } from "./project-info-helpers";

// 07-18 (SC-19 · K22 · N1 · D-737 · D-P2-3 · D-P3-2) — 프로젝트 상세 정보 면.
const TODAY = kstToday(new Date());

type Account = { userId: string; email: string; password: string };

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

async function makeAccount(roleId: string, teamId: string, name = "E2E 정보 면"): Promise<Account> {
  const email = `e2e-info-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
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

async function setup(): Promise<{ lead: Account; project: { id: string; name: string } }> {
  const team = await makeTeam();
  const pm = await makeAccount(DEFAULT_ROLE_ID, team);
  const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E정보클라이언트-${randomUUID()}`, normalizedName: `e2e정보클라이언트-${randomUUID()}` });
  const name = `E2E정보-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: team,
    pmUserId: pm.userId,
    name,
    startDate: addDays(TODAY, 2),
    endDate: addDays(TODAY, 20),
  });
  await db.update(projects).set({ status: "bidding" }).where(eq(projects.id, created.id));
  return { lead, project: { id: created.id, name } };
}

function waitForSaveAction(page: Page) {
  return page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST" && request.headers()["next-action"] !== undefined && (request.postData() ?? "").includes('"seenStatus":');
  });
}

test.describe("정보 면 접힘 · 펼치기 (K22)", () => {
  test("첫 렌더는 접힌 한 줄 `PO 금액 · 없음`이고 펼치기는 Enter와 Space 둘 다 되며 포커스가 버튼에 남는다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();

    const panel = projectInfo(page);
    const toggle = panel.getByRole("button", { name: "펼치기", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "project-info-body");
    await expect(panel.getByText("PO 금액 · 없음", { exact: true })).toBeVisible();
    await expect(page.locator("#project-info-body")).toBeHidden();

    await toggle.focus();
    await toggle.press("Enter");
    const collapse = panel.getByRole("button", { name: "접기", exact: true });
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await expect(collapse).toBeFocused();
    await expect(page.locator("#project-info-body")).toBeVisible();

    await collapse.press("Space");
    await expect(panel.getByRole("button", { name: "펼치기", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(panel.getByRole("button", { name: "펼치기", exact: true })).toBeFocused();
    await expect(panel.getByText("PO 금액 · 없음", { exact: true })).toBeVisible();

    await panel.getByRole("button", { name: "펼치기", exact: true }).press("Space");
    await expect(panel.getByRole("button", { name: "접기", exact: true })).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("PO 번호 · 고치기 하나 (N1 · D-737)", () => {
  test("펼친 면에 `고치기`가 하나이고, PO 번호를 입력하면 일괄 저장 1 → 저장 → 새로고침 뒤에도 값이 있다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expandProjectInfo(page);

    const panel = projectInfo(page);
    await expect(panel.getByText("없음", { exact: true }).first()).toBeVisible();
    await expect(panel.getByRole("button", { name: /고치기/ })).toHaveCount(1);
    await panel.getByRole("button", { name: "고치기", exact: true }).click();
    const poNumber = panel.getByLabel("PO 번호", { exact: true });
    await poNumber.fill("PO-2026-001");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    const saving = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await saving;

    await expect(panel.getByLabel("PO 번호", { exact: true })).toHaveCount(0);
    await expect(panel.getByText("PO-2026-001", { exact: true })).toBeVisible();
    await page.reload();
    await expandProjectInfo(page);
    await expect(projectInfo(page).getByText("PO-2026-001", { exact: true })).toBeVisible();
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.poNumber).toBe("PO-2026-001");
  });

  test("`고치기 취소`는 원래 값으로 돌리고 칸을 닫고 포커스가 `고치기`로 온다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await openProjectInfoEdit(page);

    const panel = projectInfo(page);
    await panel.getByLabel("PO 번호", { exact: true }).fill("PO-CANCEL");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    await cancelProjectInfoEdit(page);

    await expect(panel.getByLabel("PO 번호", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /일괄 저장 \d/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /일괄 저장/ })).toHaveAttribute("aria-disabled", "true");
    await expect(panel.getByText("PO-CANCEL")).toHaveCount(0);
  });

  test("첫 Esc는 원래 값으로 돌리고 칸은 열려 있으며, 두 번째 Esc가 닫고 포커스가 `고치기`로 온다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await openProjectInfoEdit(page);

    const panel = projectInfo(page);
    const poNumber = panel.getByLabel("PO 번호", { exact: true });
    await poNumber.fill("PO-ESC");
    await poNumber.press("Escape");
    await expect(poNumber).toHaveValue("");
    await poNumber.press("Escape");
    await expect(panel.getByLabel("PO 번호", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "고치기", exact: true })).toBeFocused();
  });

  test("저장 없이 새로고침하면 복원 줄이 뜨고 복원하면 면이 펼쳐지며 그 값이 다시 일괄 저장 1로 돌아온다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await openProjectInfoEdit(page);

    await projectInfo(page).getByLabel("PO 번호", { exact: true }).fill("PO-RESTORE");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    await page.reload();

    await expect(page.getByText("저장 안 한 편집 1칸", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "복원", exact: true }).click();
    await expect(projectInfo(page).getByRole("button", { name: "접기", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(projectInfo(page).getByLabel("PO 번호", { exact: true })).toHaveValue("PO-RESTORE");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
  });
});
