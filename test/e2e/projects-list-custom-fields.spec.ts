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

// 07.5-04(S5 · D-7510 · D-7522) — 프로젝트 목록 추가 칸 키워드 검색 · 선택 칸 거르개.
// 목록에는 추가 칸 열을 두지 않는다(사용자 결정 2026-11-14 23:43 KST — 값은 상세 정보 면) — 칸이 있어도 1280 · 1440 가로 넘침 0.
// 칸은 전용 계급(createE2EProjectEditor)에만 보이게 만든다 — 시드 계급 사용자 목록에는 거르개가 없다.
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

async function docOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("프로젝트 목록 추가 칸 (S5)", () => {
  test("텍스트 칸: 1280 · 1440에 추가 칸 머리글 · 값 셀 DOM 0 · 가로 넘침 0 · 같은 값으로 검색 → 그 행만 · 시드 계급 목록도 머리글 0", async ({ page, browser }) => {
    const tag = randomUUID().slice(0, 6);
    const editor = await createE2EProjectEditor();
    const label = `${LABEL_PREFIX}장소${tag}`;
    await createE2EFieldDefinition({ entity: "project", label, type: "text", required: false, onlyRoleId: editor.roleId }).then(async (field) => {
      await projectOf(editor, `E2E목록칸-값-${tag}`, { [field.key]: `E2E-코엑스${tag}` });
    });
    await projectOf(editor, `E2E목록칸-다른-${tag}`);

    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, editor);
    const table = page.getByRole("table", { name: "프로젝트" });
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect((await page.goto("/projects?year=all"))?.status()).toBe(200);
      await expect(table.getByRole("link", { name: `E2E목록칸-값-${tag}` })).toBeVisible();
      await expect(table.locator("th", { hasText: label })).toHaveCount(0);
      await expect(table.getByText(`E2E-코엑스${tag}`)).toHaveCount(0);
      expect(await docOverflow(page), `${width} 문서 가로 넘침`).toBe(0);
    }

    const search = page.locator("#q-wide");
    await search.fill(`E2E-코엑스${tag}`);
    await search.press("Enter");
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(`E2E-코엑스${tag}`)}`));
    await expect(table.getByRole("link", { name: `E2E목록칸-값-${tag}` })).toBeVisible();
    await expect(table.getByRole("link", { name: `E2E목록칸-다른-${tag}` })).toHaveCount(0);

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

  // 07.5-04 독립 DOM 감사 B1 · F1 — 칸 이름 · 선택지는 관리자가 정하는 임의 길이다(이름 ≤ 20자 · 선택지 ≤ 40자). 가장 긴 값으로 잰다.
  test("가장 긴 칸 이름 · 선택지: 폰 320 · 375 요약(닫힘 · 펼침) 문서 넘침 0 · select 폭 상한(1280 = 칸 폭 − s-4 · 폰 = − s-4 − s-1)", async ({ page }) => {
    const tag = randomUUID().slice(0, 6);
    const editor = await createE2EProjectEditor();
    const label = `${LABEL_PREFIX}${tag}가나다라마바사아`;
    expect(label).toHaveLength(20);
    const longOption = "긴선택지".repeat(10);
    expect(longOption).toHaveLength(40);
    const field = await createE2EFieldDefinition({ entity: "project", label, type: "select", options: ["팝업", longOption], required: false, onlyRoleId: editor.roleId });
    await projectOf(editor, `E2E목록칸-긴값-${tag}`, { [field.key]: longOption });

    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, editor);
    const url = `/projects?year=all&cf_${field.key}=${encodeURIComponent(longOption)}`;
    const select = page.getByLabel(label, { exact: true });
    const cap = (minus: string[]) =>
      page.evaluate((names) => {
        const style = getComputedStyle(document.documentElement);
        const px = (name: string) => parseFloat(style.getPropertyValue(name));
        return names.reduce((width, name) => width - px(name), px("--field-w-select"));
      }, minus);

    expect((await page.goto(url))?.status()).toBe(200);
    await expect(select).toHaveValue(longOption);
    const wideWidth = (await select.boundingBox())?.width ?? Infinity;
    expect(wideWidth, "1280 select 폭").toBeLessThanOrEqual(await cap(["--s-4"]));

    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      expect((await page.goto(url))?.status()).toBe(200);
      await expect(page.getByTestId("filter-summary")).toContainText(`${label} ${longOption}`);
      expect(await docOverflow(page), `${width} 닫힘 문서 가로 넘침`).toBe(0);
      await page.getByRole("button", { name: "필터", exact: true }).click();
      await expect(select).toBeVisible();
      expect(await docOverflow(page), `${width} 펼침 문서 가로 넘침`).toBe(0);
      const phoneWidth = (await select.boundingBox())?.width ?? Infinity;
      expect(phoneWidth, `${width} select 폭`).toBeLessThanOrEqual(await cap(["--s-4", "--s-1"]));
    }
  });
});
