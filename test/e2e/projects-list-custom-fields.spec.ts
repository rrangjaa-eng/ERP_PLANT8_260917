import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, users } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createProject } from "@/domain/projects";
import { insertVendor } from "@/repositories/vendors";
import { archiveE2EFieldDefinitions, createE2EFieldDefinition, createE2EProjectEditor, createFixtureUser } from "./fixtures";

// 07.5-04(S5 · D-7509 · D-7510 · D-7522) — 프로젝트 목록 추가 칸 열 · 키워드 검색 · 선택 칸 거르개.
// 칸은 전용 계급(createE2EProjectEditor)에만 보이게 만든다 — 시드 계급 사용자 목록에는 열 · 거르개가 없다.
const LABEL_PREFIX = "E2E목록칸";

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(LABEL_PREFIX);
});

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 그 사람이 담당 PM인 자기 팀 프로젝트 하나(행 범위 안) — 추가 칸 값은 저장값으로 바로 심는다.
async function projectOf(account: { email: string; teamId: string | null }, name: string, customFields: Record<string, unknown> = {}): Promise<string> {
  if (!account.teamId) throw new Error("팀 없는 계정");
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, account.email));
  if (!user) throw new Error("사용자를 찾지 못했습니다");
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E목록칸고객-${randomUUID().slice(0, 8)}`, normalizedName: `e2e목록칸고객-${randomUUID()}` });
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: account.teamId, pmUserId: user.id, name });
  await db.update(projects).set({ customFields, endDate: "2026-06-30" }).where(eq(projects.id, created.id));
  return created.id;
}

async function headers(page: Page): Promise<string[]> {
  return (await page.getByRole("table", { name: "프로젝트" }).getByRole("columnheader").allInnerTexts()).map((text) => text.trim());
}

test.describe("프로젝트 목록 추가 칸 (S5)", () => {
  test("텍스트 칸: 1280에서 금액 열 뒤 · 「상태」 앞 열(정렬 링크 없음) · 같은 값으로 검색 → 그 행만 · 1024에서 보이는 머리글 0 · 시드 계급에는 머리글 DOM 0", async ({ page, browser }) => {
    const tag = randomUUID().slice(0, 6);
    const editor = await createE2EProjectEditor();
    const label = `${LABEL_PREFIX}장소${tag}`;
    await createE2EFieldDefinition({ entity: "project", label, type: "text", required: false, onlyRoleId: editor.roleId }).then(async (field) => {
      await projectOf(editor, `E2E목록칸-값-${tag}`, { [field.key]: `E2E-코엑스${tag}` });
    });
    await projectOf(editor, `E2E목록칸-다른-${tag}`);

    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, editor);
    expect((await page.goto("/projects?year=all"))?.status()).toBe(200);

    const table = page.getByRole("table", { name: "프로젝트" });
    const header = table.getByRole("columnheader", { name: label, exact: true });
    await expect(header).toBeVisible();
    const names = await headers(page);
    expect(names.at(-1)).toBe("상태");
    expect(names.at(-2)).toBe(label);
    await expect(header.getByRole("link")).toHaveCount(0);
    await expect(table.getByRole("row").filter({ hasText: `E2E목록칸-값-${tag}` }).getByRole("cell", { name: `E2E-코엑스${tag}` })).toBeVisible();

    const search = page.locator("#q-wide");
    await search.fill(`E2E-코엑스${tag}`);
    await search.press("Enter");
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(`E2E-코엑스${tag}`)}`));
    await expect(table.getByRole("link", { name: `E2E목록칸-값-${tag}` })).toBeVisible();
    await expect(table.getByRole("link", { name: `E2E목록칸-다른-${tag}` })).toHaveCount(0);

    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(table.getByRole("columnheader", { name: label, exact: true })).toHaveCount(0);

    const seeded = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, withTeam: true });
    await projectOf(seeded, `E2E목록칸-시드-${tag}`);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const other = await context.newPage();
    await login(other, seeded);
    expect((await other.goto("/projects?year=all"))?.status()).toBe(200);
    await expect(other.getByRole("table", { name: "프로젝트" })).toBeVisible();
    await expect(other.locator("th", { hasText: label })).toHaveCount(0);
    await context.close();
  });

  test("선택 칸 거르개: 고르면 즉시 제출 · URL cf_<key> · 그 행만 · 정렬 링크가 같은 파라미터 · 필터 지우기 · 맞는 행 없음 EMPTY · 375 「필터」 접힘 안 · 요약 조각", async ({ page }) => {
    const tag = randomUUID().slice(0, 6);
    const editor = await createE2EProjectEditor();
    const label = `${LABEL_PREFIX}구분${tag}`;
    const field = await createE2EFieldDefinition({ entity: "project", label, type: "select", options: ["행사", "전시", "프로모션"], required: false, onlyRoleId: editor.roleId });
    await projectOf(editor, `E2E목록칸-행사-${tag}`, { [field.key]: "행사" });
    await projectOf(editor, `E2E목록칸-전시-${tag}`, { [field.key]: "전시" });

    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, editor);
    expect((await page.goto("/projects?year=all"))?.status()).toBe(200);
    const table = page.getByRole("table", { name: "프로젝트" });
    const select = page.getByLabel(label, { exact: true });
    await expect(select.locator("option").first()).toHaveText(`전체 ${label}`);
    await select.selectOption("행사");
    await expect(page).toHaveURL(new RegExp(`cf_${field.key}=${encodeURIComponent("행사")}`));
    await expect(table.getByRole("link", { name: `E2E목록칸-행사-${tag}` })).toBeVisible();
    await expect(table.getByRole("link", { name: `E2E목록칸-전시-${tag}` })).toHaveCount(0);
    const sortHref = await table.getByRole("columnheader", { name: "프로젝트명" }).getByRole("link").getAttribute("href");
    expect(new URL(sortHref ?? "", "http://x").searchParams.get(`cf_${field.key}`)).toBe("행사");

    await page.getByRole("link", { name: "필터 지우기" }).first().click();
    await expect(page).toHaveURL(/\/projects$/);

    expect((await page.goto(`/projects?year=all&cf_${field.key}=${encodeURIComponent("프로모션")}`))?.status()).toBe(200);
    await expect(page.getByText("조건에 맞는 프로젝트가 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "필터 지우기" }).first()).toBeVisible();

    await page.setViewportSize({ width: 375, height: 800 });
    expect((await page.goto(`/projects?year=all&cf_${field.key}=${encodeURIComponent("행사")}`))?.status()).toBe(200);
    await expect(page.getByTestId("filter-summary")).toContainText(`${label} 행사`);
    await expect(page.getByLabel(label, { exact: true })).toBeHidden();
    await page.getByRole("button", { name: "필터" }).click();
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    await expect(page.getByLabel(label, { exact: true })).toHaveValue("행사");
  });
});
