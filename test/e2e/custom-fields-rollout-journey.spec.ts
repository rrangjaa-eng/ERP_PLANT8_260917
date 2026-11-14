import { randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions, quoteLines } from "@/db/schema";
import { archiveE2EFieldDefinitions, createE2EProjectEditor, createFixtureUser, waitForCardUsageSection } from "./fixtures";
import { expandProjectInfo, projectInfo } from "./project-info-helpers";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { findRoleById } from "@/repositories/roles";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { findVisibility, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";

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

    // ③ PM 등록 패널에 그 칸이 선다(02 등록 폼). 패널은 고를 클라이언트가 하나라도 있어야 열린다(canCreateProject) — 스펙 단독 실행에도 하나 둔다.
    await insertVendor(SYSTEM_VIEWER, { name: `E2E여정고객-${tail}`, normalizedName: `e2e여정고객-${tail}` });
    const pmPage = await loginInNewContext(browser, pm);
    expect((await pmPage.goto("/projects?new=1"))?.status()).toBe(200);
    const group = pmPage.locator("#project-form").getByTestId("project-custom-fields");
    await expect(group.getByLabel(place, { exact: true })).toBeVisible();
    await pmPage.context().close();
  } finally {
    await archiveE2EFieldDefinitions(PREFIX);
  }
});

async function readKey(entity: "project" | "quote_line", label: string): Promise<string> {
  const [row] = await db
    .select({ key: fieldDefinitions.key })
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.entity, entity), eq(fieldDefinitions.label, label)));
  if (!row) throw new Error(`칸 없음: ${entity} ${label}`);
  return row.key;
}

function listRow(page: Page, label: string): Locator {
  return page.locator("tbody tr", { has: page.locator('th[scope="row"]', { hasText: label }) });
}

function quoteTable(page: Page): Locator {
  return page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) });
}

async function quoteHeaderIndex(page: Page, name: string): Promise<number> {
  const all = (await quoteTable(page).locator("thead th").allInnerTexts()).map((text) => text.trim());
  const index = all.indexOf(name);
  if (index === -1) throw new Error(`머리글 ${name} 없음: ${all.join(" | ")}`);
  return index;
}

// 정보 면 「기본」 구획에 칸 줄(이름 · 값)이 있는지 — 없으면 이름 · 값 둘 다 HTML에 없다.
async function expectInfoFace(page: Page, projectId: string, label: string, value: string, shown: boolean): Promise<void> {
  expect((await page.goto(`/projects/${projectId}`))?.status()).toBe(200);
  await expandProjectInfo(page);
  const basic = projectInfo(page).getByRole("group", { name: "기본", exact: true });
  if (shown) {
    await expect(basic.getByText(label)).toBeVisible();
    await expect(basic.getByText(value)).toBeVisible();
  } else {
    await expect(basic.getByText("PO 번호")).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(label);
    expect(html).not.toContain(value);
  }
}

// 목록 검색(q)이 칸 값으로 그 프로젝트를 찾는지 — 칸이 안 보이면 값으로는 찾지 못한다.
async function expectSearchHit(page: Page, value: string, projectName: string, hit: boolean): Promise<void> {
  expect((await page.goto(`/projects?year=all&q=${encodeURIComponent(value)}`))?.status()).toBe(200);
  const link = page.getByRole("table", { name: "프로젝트" }).getByRole("link", { name: projectName });
  if (hit) await expect(link).toBeVisible();
  else {
    await expect(page.getByText("조건에 맞는 프로젝트가 없습니다")).toBeVisible();
    await expect(link).toHaveCount(0);
  }
}

async function expectRegisterField(page: Page, label: string, shown: boolean): Promise<void> {
  expect((await page.goto("/projects?new=1"))?.status()).toBe(200);
  const form = page.locator("#project-form");
  await expect(form.getByLabel("프로젝트명")).toBeVisible();
  await expect(form.getByLabel(label, { exact: true })).toHaveCount(shown ? 1 : 0);
}

test("관리 화면에서 만든 프로젝트 · 견적 줄 칸: 등록 → 정보 면 · 검색 · 견적 표 → 계급별 끔 → 보관 → 복원", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const pm = await createE2EProjectEditor();
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  const role = await findRoleById(SYSTEM_VIEWER, pm.roleId);
  if (!role) throw new Error("전용 계급 없음");
  const tail = randomBytes(3).toString("hex");
  const place = `${PREFIX}장소${tail}`;
  const spec = `${PREFIX}규격${tail}`;
  const placeValue = `여정코엑스${tail}`;
  const specValue = `여정규격값${tail}`;
  const projectName = `E2E여정프로젝트-${tail}`;
  const cell = `${role.name} · 프로젝트 · ${place}`;
  let placeInfo: string | null = null;
  const pmPage = await loginInNewContext(browser, pm);

  try {
    await login(page, admin);

    // ① 관리자가 대상 「프로젝트」 · 「견적 줄」에 칸 하나씩.
    await createTextField(page, "project", place);
    await createTextField(page, "quote_line", spec);
    expect(await readEntity(spec)).toBe("quote_line");
    placeInfo = customFieldInfoItem("project", await readKey("project", place));
    const specKey = await readKey("quote_line", spec);

    // ② PM이 등록 패널에서 칸 값과 함께 등록한다.
    const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E여정고객-${tail}`, normalizedName: `e2e여정고객-${tail}` });
    expect((await pmPage.goto("/projects?new=1"))?.status()).toBe(200);
    const form = pmPage.locator("#project-form");
    await form.getByLabel("클라이언트").selectOption({ label: client.name });
    await form.getByLabel("프로젝트명").fill(projectName);
    await form.getByTestId("project-custom-fields").getByLabel(place, { exact: true }).fill(placeValue);
    await form.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(pmPage).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const projectId = new URL(pmPage.url()).pathname.split("/").pop() ?? "";

    // ③ 정보 면 「기본」 구획 · ④ 목록 검색.
    await expectInfoFace(pmPage, projectId, place, placeValue, true);
    await expectSearchHit(pmPage, placeValue, projectName, true);

    // ⑤ 견적 표: 칸 열에 값을 넣고 「일괄 저장」 → DB 줄의 칸 값.
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, projectId);
    if (!revision) throw new Error("1차 차수 없음");
    const lineId = randomUUID();
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: lineId,
          isNew: true as const,
          subcategory: "stage_construction",
          itemName: `여정줄${tail}`,
          unitPrice: { currency: "KRW" as const, amount: 1000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 0, fxRate: 1 },
        },
      ],
    });
    await pmPage.goto(`/projects/${projectId}`);
    await waitForCardUsageSection(pmPage);
    const column = await quoteHeaderIndex(pmPage, spec);
    const target = quoteTable(pmPage).locator('tbody tr:has(td[role="gridcell"])').first().getByRole("gridcell").nth(column);
    await expect(async () => {
      await target.focus();
      await pmPage.keyboard.press("Enter");
      await expect(target.locator("input")).toBeFocused({ timeout: 1000 });
    }).toPass();
    await pmPage.keyboard.press("Control+a");
    await pmPage.keyboard.type(specValue);
    await pmPage.keyboard.press("Enter");
    const saved = pmPage.waitForResponse((response) => response.request().method() === "POST" && response.request().headers()["next-action"] !== undefined);
    await pmPage.getByRole("button", { name: /일괄 저장/ }).click();
    await saved;
    await expect
      .poll(async () => {
        const [line] = await db.select({ customFields: quoteLines.customFields }).from(quoteLines).where(eq(quoteLines.id, lineId));
        return (line?.customFields as Record<string, unknown> | null | undefined)?.[specKey];
      })
      .toBe(specValue);

    // ⑥ 관리자가 PM 계급의 프로젝트 칸 보임을 끈다 → 등록 패널 · 정보 면 · 검색에서 사라진다.
    await page.goto("/admin/visibility");
    await page.getByRole("checkbox", { name: cell, exact: true }).uncheck();
    await expect.poll(async () => (await findVisibility(SYSTEM_VIEWER, pm.roleId, placeInfo ?? ""))?.visible).toBe(false);
    await expectRegisterField(pmPage, place, false);
    await expectInfoFace(pmPage, projectId, place, placeValue, false);
    await expectSearchHit(pmPage, placeValue, projectName, false);

    // ⑦ 다시 켠다.
    await page.goto("/admin/visibility");
    await page.getByRole("checkbox", { name: cell, exact: true }).check();
    await expect.poll(async () => (await findVisibility(SYSTEM_VIEWER, pm.roleId, placeInfo ?? ""))?.visible).toBe(true);
    await expectInfoFace(pmPage, projectId, place, placeValue, true);

    // ⑧ 목록 「삭제」(대상 프로젝트)로 보관 → 등록 패널 · 정보 면 · 검색에서 사라진다.
    await page.goto("/admin/field-definitions?target=project");
    const row = listRow(page, place);
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(row.getByText(`${place} 삭제 · 보관함으로 이동합니다 · 관리자가 복원할 수 있습니다`)).toBeVisible();
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(listRow(page, place)).toHaveCount(0);
    await expectRegisterField(pmPage, place, false);
    await expectInfoFace(pmPage, projectId, place, placeValue, false);
    await expectSearchHit(pmPage, placeValue, projectName, false);

    // ⑨ 보관함 「프로젝트 · 이름」 행 복원 → 값이 돌아온다.
    await page.goto("/admin/archive");
    const archiveRow = page.locator("tr", { hasText: `프로젝트 · ${place}` });
    await expect(archiveRow).toContainText("화면 항목");
    await archiveRow.getByRole("button", { name: "복원" }).click();
    await expect(page.getByText(`복원 · 프로젝트 · ${place} 복원됨`)).toBeVisible({ timeout: 15000 });
    await expectRegisterField(pmPage, place, true);
    await expectInfoFace(pmPage, projectId, place, placeValue, true);
    await expectSearchHit(pmPage, placeValue, projectName, true);
  } finally {
    await pmPage.context().close();
    if (placeInfo) await upsertVisibility(SYSTEM_VIEWER, { roleId: pm.roleId, infoItem: placeInfo, visible: true });
    await archiveE2EFieldDefinitions(PREFIX);
  }
});
