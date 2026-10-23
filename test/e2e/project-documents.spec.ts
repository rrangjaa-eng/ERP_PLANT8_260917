import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteRevisions } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { customerApprovalColumns } from "@/domain/quotes/revisions";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { hasProjectDocument } from "@/repositories/project-documents";
import { addDays, kstToday } from "@/lib/kst-date";
import { expandProjectInfo, projectInfo } from "./project-info-helpers";

// 07-22(W3 · SC-20) — 상세 「서류」 섹션: EMPTY `서류 없음` + `서류 붙이기` → 종류 기본 `발주서` → 파일 → 줄(이름 · 종류 · 올린 사람 · 날짜) ·
// 07-18 `발주서 파일 없음` 사라짐 · 지우기(확인 창) → EMPTY. 업로드는 05 테스트 모드(브라우저 → 서명 PUT → 완료 통보)를 그대로 지난다.
const TODAY = kstToday(new Date());
const UPLOAD_WAIT = 20_000;
const PM_NAME = "E2E 서류 PM";

type Account = { userId: string; email: string; password: string };

async function makePm(): Promise<{ pm: Account; teamId: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const email = `e2e-docs-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: PM_NAME, roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: TODAY });
  return { pm: { userId, email, password: tempPassword }, teamId: team.id };
}

async function makeProject(teamId: string, pmUserId: string): Promise<{ id: string }> {
  const name = `E2E서류거래처-${randomUUID()}`;
  const client = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase() });
  return createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId, name: `E2E서류-${randomUUID().slice(0, 8)}`, startDate: TODAY, endDate: addDays(TODAY, 10) });
}

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

function documentsSection(page: Page) {
  return page.locator("section", { has: page.getByRole("heading", { name: "서류", exact: true }) });
}

function uniquePdf(name: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${randomUUID()}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`) };
}

test("서류 없음 → 서류 붙이기 → 발주서 한 줄 · 발주서 파일 없음 사라짐 · 지우기(확인 창) → 서류 없음", async ({ page }) => {
  const { pm, teamId } = await makePm();
  const project = await makeProject(teamId, pm.userId);
  // 07-18 — 근거가 발주서인 고객 승인 → 서류가 없으면 정보 면에 `발주서 파일 없음`.
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  await db.update(quoteRevisions).set({ ...customerApprovalColumns(pm.userId, TODAY), customerApprovalBasis: "purchase_order" }).where(eq(quoteRevisions.id, revision.id));

  await login(page, pm);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/projects/${project.id}`);
  await expandProjectInfo(page);
  await expect(projectInfo(page).getByText("발주서 파일 없음", { exact: true })).toBeVisible();

  const section = documentsSection(page);
  await expect(section.getByText("서류 없음", { exact: true })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await section.getByRole("button", { name: "서류 붙이기", exact: true }).click();
  await expect(section.getByLabel("종류", { exact: true })).toHaveValue("purchase_order");
  const pdf = uniquePdf("발주서-2026.pdf");
  await (await chooser).setFiles(pdf);

  const row = section.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name });
  await expect(row).toBeVisible({ timeout: UPLOAD_WAIT });
  const [, month, day] = TODAY.split("-");
  await expect(row).toContainText(`발주서 · ${PM_NAME}`, { timeout: UPLOAD_WAIT });
  await expect(row).toContainText(`${month}-${day}`);
  await expandProjectInfo(page);
  await expect(projectInfo(page).getByText("발주서 파일 없음", { exact: true })).toHaveCount(0, { timeout: UPLOAD_WAIT });

  await row.getByRole("button", { name: "삭제" }).click();
  const confirm = page.getByRole("dialog", { name: "서류 삭제" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText("되돌릴 수 없음", { exact: true })).toBeVisible();
  await confirm.getByRole("button", { name: /^서류 삭제/ }).click();
  await expect(section.getByText("서류 없음", { exact: true })).toBeVisible({ timeout: UPLOAD_WAIT });
  expect(await hasProjectDocument(SYSTEM_VIEWER, project.id, "purchase_order")).toBe(false);
});

test("확인 창에서 취소하면 서류가 남는다", async ({ page }) => {
  const { pm, teamId } = await makePm();
  const project = await makeProject(teamId, pm.userId);
  await login(page, pm);
  await page.goto(`/projects/${project.id}`);
  const section = documentsSection(page);
  const chooser = page.waitForEvent("filechooser");
  await section.getByRole("button", { name: "서류 붙이기", exact: true }).click();
  await section.getByLabel("종류", { exact: true }).selectOption("other");
  const pdf = uniquePdf("현장 사진.pdf");
  await (await chooser).setFiles(pdf);
  const row = section.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name });
  await expect(row).toContainText(`기타 · ${PM_NAME}`, { timeout: UPLOAD_WAIT });

  await row.getByRole("button", { name: "삭제" }).click();
  const confirm = page.getByRole("dialog", { name: "서류 삭제" });
  await confirm.getByRole("button", { name: /^취소/ }).click();
  await expect(confirm).toBeHidden();
  await expect(row).toBeVisible();
  expect(await hasProjectDocument(SYSTEM_VIEWER, project.id, "other")).toBe(true);
});

test("보기만 하는 계급에게는 붙이기 · 지우기가 없다", async ({ page }) => {
  const { pm, teamId } = await makePm();
  const project = await makeProject(teamId, pm.userId);
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E서류읽기-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
  const email = `e2e-docs-reader-${randomUUID()}@example.test`;
  const reader = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 서류 읽기", roleId: role.id });

  await login(page, { email, password: reader.tempPassword });
  await page.goto(`/projects/${project.id}`);
  const section = documentsSection(page);
  await expect(section.getByText("서류 없음", { exact: true })).toBeVisible();
  await expect(section.getByRole("button", { name: "서류 붙이기" })).toHaveCount(0);
  await expect(section.getByLabel("종류")).toHaveCount(0);
});

test("(감사 P2 #2 · #3) 키보드: 처음 올리면 포커스가 새 목록 안에 남고, 마지막 서류를 지우면 서류 붙이기로 간다", async ({ page }) => {
  const { pm, teamId } = await makePm();
  const project = await makeProject(teamId, pm.userId);
  await login(page, pm);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/projects/${project.id}`);
  const section = documentsSection(page);
  const chooser = page.waitForEvent("filechooser");
  await section.getByRole("button", { name: "서류 붙이기", exact: true }).focus();
  await page.keyboard.press("Enter");
  const pdf = uniquePdf("포커스.pdf");
  await (await chooser).setFiles(pdf);
  const row = section.locator('[data-ui="attachments"] li').filter({ hasText: pdf.name });
  await expect(row).toBeVisible({ timeout: UPLOAD_WAIT });
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName), { timeout: UPLOAD_WAIT }).not.toBe("BODY");
  expect(await section.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  await row.getByRole("button", { name: "삭제" }).focus();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("dialog", { name: "서류 삭제" });
  await expect(confirm).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(section.getByText("서류 없음", { exact: true })).toBeVisible({ timeout: UPLOAD_WAIT });
  await expect(section.getByRole("button", { name: "서류 붙이기", exact: true })).toBeFocused();
});
