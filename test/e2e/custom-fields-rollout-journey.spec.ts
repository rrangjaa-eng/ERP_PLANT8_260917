import { randomBytes } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions } from "@/db/schema";
import { archiveE2EFieldDefinitions, createE2EProjectEditor, createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 07.5-05 여정(ADMN-07 · D-7502 · D-7503): 관리자가 대상 「프로젝트」 · 「견적 줄」을 골라 만든 칸이 01~04가 만든 화면에 선다.
// desktop-settings 워커 1에서 돈다(playwright.config.ts DESKTOP_SETTINGS_SPECS) — 관리 화면에서 만든 칸은 전 계급 보임이라
// 병렬 desktop 스펙의 폼 칸 · 표 열 · Tab 순서를 흔든다(eng C-5). 칸은 필수 아님 · 이름에 무작위 접미 · 끝에 보관.
// 칸 이름에 「이름」 · 「프로젝트명」 같은 글자를 넣지 않는다(다른 스펙의 getByLabel 부분 일치).
const PREFIX = "E2E여정대상";

type Account = { email: string; password: string };

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(PREFIX);
});

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loginInNewContext(browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  return page;
}

async function readEntity(label: string): Promise<string | undefined> {
  const rows = await db.select({ entity: fieldDefinitions.entity }).from(fieldDefinitions).where(eq(fieldDefinitions.label, label));
  return rows.length === 1 ? rows[0]?.entity : `행 ${rows.length}개`;
}

async function createTextField(page: Page, target: "project" | "quote_line", label: string): Promise<void> {
  await page.goto("/admin/field-definitions");
  const targetLabel = target === "project" ? "프로젝트" : "견적 줄";
  await page.getByRole("navigation", { name: "대상" }).getByRole("link", { name: targetLabel }).click();
  await expect(page).toHaveURL(new RegExp(`target=${target}`));
  await page.getByRole("link", { name: "화면 항목 추가", exact: true }).first().click();
  const panel = page.getByRole("dialog", { name: `${targetLabel} 화면 항목 추가`, exact: true });
  await expect(panel).toBeVisible();
  await panel.getByLabel("이름", { exact: true }).fill(label);
  await panel.getByLabel("타입", { exact: true }).selectOption({ label: "텍스트" });
  await panel.getByLabel("필수", { exact: true }).setChecked(false);
  await panel.getByRole("button", { name: "화면 항목 추가" }).click();
  await expect(page.getByRole("status").filter({ hasText: `화면 항목 추가 · ${label} 추가됨` })).toBeVisible();
}

test("관리자가 대상 「프로젝트」로 만든 칸: DB 대상 · 수정 패널 제목 · 「새 화면 항목 추가」 대상 유지 · PM 등록 패널에 칸", async ({ page, browser }) => {
  // ⓪ 전용 계급(기획 PM 복사)을 칸 추가보다 먼저 만든다 — 생성 경로가 이 계급에도 보임 행을 준다(D-7508).
  const pm = await createE2EProjectEditor();
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  const tail = randomBytes(3).toString("hex");
  const place = `${PREFIX}장소${tail}`;

  try {
    await login(page, admin);

    // ① 대상 「프로젝트」에서 텍스트 칸 — 행 entity = project(대상이 빠지면 vendor가 된다, critical gap 2).
    await createTextField(page, "project", place);
    expect(await readEntity(place)).toBe("project");

    // ② 수정 패널 제목 · 「새 화면 항목 추가」가 같은 대상을 싣는다(eng C-4).
    await page.goto("/admin/field-definitions?target=project");
    await page.getByRole("link", { name: `${place} 수정`, exact: true }).click();
    await expect(page.getByRole("dialog", { name: "프로젝트 화면 항목 수정", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "새 화면 항목 추가" }).click();
    await expect(page).toHaveURL(/target=project/);
    await expect(page.getByRole("dialog", { name: "프로젝트 화면 항목 추가", exact: true })).toBeVisible();

    // ③ PM 등록 패널에 그 칸이 선다(02 등록 폼).
    const pmPage = await loginInNewContext(browser, pm);
    expect((await pmPage.goto("/projects?new=1"))?.status()).toBe(200);
    const group = pmPage.locator("#project-form").getByTestId("project-custom-fields");
    await expect(group.getByLabel(place, { exact: true })).toBeVisible();
    await pmPage.context().close();
  } finally {
    await archiveE2EFieldDefinitions(PREFIX);
  }
});
