import { randomBytes, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { files, quoteLines } from "@/db/schema";
import { getSettingValue, setSettingValue, type SettingDef } from "@/domain/settings/registry";
import { PRINT_COMPANY_ADDRESS, PRINT_COMPANY_BUSINESS_NO, PRINT_COMPANY_NAME, PRINT_COMPANY_PHONE, PRINT_COMPANY_REPRESENTATIVE } from "@/domain/settings/keys";
import { COMPANY_LOGO_OWNER_ID, COMPANY_LOGO_OWNER_KIND } from "@/domain/settings/company-logo";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { kstToday } from "@/lib/kst-date";
import { createFixtureUser } from "./fixtures";

// 07.2-10 Task 3 (PU4 · DC-6 · S9) — 설정 「회사 정보」 `로고` 한 칸(올리기 · 바꾸기 · 삭제 · 되돌리기)과 고객 견적서 머리 로고.
// 공용 설정 행(회사명)과 로고 파일 행을 바꾸므로 desktop-settings 한 워커에서만 돈다(playwright.config.ts DESKTOP_SETTINGS_SPECS) — 끝나면 원래대로 되돌린다.
// 순서: 로고 없는 상태(워드마크) → 올리기 → 로고 있는 종이 → 삭제 · 되돌리기 → 크기 초과 → 깨진 로고.

test.describe.configure({ mode: "serial" });

const GROUP = "회사 정보";
const FIVE: readonly SettingDef<string>[] = [PRINT_COMPANY_NAME, PRINT_COMPANY_ADDRESS, PRINT_COMPANY_BUSINESS_NO, PRINT_COMPANY_REPRESENTATIVE, PRINT_COMPANY_PHONE];
const TODAY = kstToday(new Date());
const COMPANY = "플랜트에이트 로고시험";
const MM_TO_PX = 96 / 25.4;

let originals: string[] = [];
let pm: { email: string; password: string };
let revisionId: string;

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

// 단색 RGB PNG — 가로가 긴 그림이라 인쇄 틀의 최대 폭 · 높이가 실제로 걸린다.
function solidPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x33)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// 압축이 안 되는 무작위 RGB PNG — 실제로 디코딩되는 2MB 넘는 그림(줄이지 않는 로고 업로드가 원본 크기로 걸리는지 본다).
function noisePng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), randomBytes(width * 3)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 0 })), chunk("IEND", Buffer.alloc(0))]);
}

const LOGO_PNG = solidPng(400, 200);

async function aliveLogoRows(): Promise<number> {
  const rows = await db.select({ id: files.id, removedAt: files.removedAt }).from(files).where(and(eq(files.ownerKind, COMPANY_LOGO_OWNER_KIND), eq(files.ownerId, COMPANY_LOGO_OWNER_ID)));
  return rows.filter((row) => row.removedAt === null).length;
}

async function clearLogoRows(): Promise<void> {
  await db.delete(files).where(and(eq(files.ownerKind, COMPANY_LOGO_OWNER_KIND), eq(files.ownerId, COMPANY_LOGO_OWNER_ID)));
}

test.beforeAll(async () => {
  originals = await Promise.all(FIVE.map((def) => getSettingValue(def)));
  await clearLogoRows();
  const unit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: unit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const email = `e2e-logo-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 로고 PM", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: TODAY });
  pm = { email, password: tempPassword };
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E고객사-${randomUUID().slice(0, 8)}`, normalizedName: `e2e-${randomUUID()}` });
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: userId, name: `E2E로고-${randomUUID().slice(0, 8)}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  revisionId = revision.id;
  await db.insert(quoteLines).values({ revisionId, subcategory: "기타", itemName: "무대 설치", sortOrder: 0, unitPriceAmountKrw: 100_000, quoteAmountKrw: 100_000, executionAmountKrw: 80_000, profitKrw: 20_000 });
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_NAME, COMPANY);
});

test.afterAll(async () => {
  for (const [index, def] of FIVE.entries()) await setSettingValue(SYSTEM_VIEWER, def, originals[index] ?? "");
  await clearLogoRows();
});

async function login(browser: Browser, baseURL: string | undefined, person: { email: string; password: string }, viewport = { width: 1280, height: 900 }): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(person.email);
  await page.getByLabel("비밀번호").fill(person.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

let adminPerson: { email: string; password: string };

async function openSettings(browser: Browser, baseURL: string | undefined, viewport?: { width: number; height: number }): Promise<Page> {
  adminPerson ??= await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  const page = await login(browser, baseURL, adminPerson, viewport);
  await page.goto(`/admin/settings?group=${encodeURIComponent(GROUP)}`);
  await expect(page.getByRole("heading", { name: GROUP, exact: true })).toBeVisible();
  return page;
}

async function openPaper(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const page = await login(browser, baseURL, pm);
  await page.goto(`/print/quotes/${revisionId}`);
  await expect(page.locator("main[data-ready]")).toHaveCount(1);
  await expect(page.locator("article header")).toBeVisible();
  return page;
}

const logoGroup = (page: Page) => page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^로고$/ }) });

test("로고 없음: 다섯 칸은 이 순서 그대로이고 로고 칸은 이 묶음에만 하나, 종이 머리는 회사명 글자다", async ({ browser, baseURL }) => {
  const page = await openSettings(browser, baseURL);
  try {
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: GROUP, exact: true }) });
    const labels = (await section.locator("label").allInnerTexts()).map((text) => text.trim()).filter((text) => FIVE.some((def) => def.label === text));
    expect(labels).toEqual(FIVE.map((def) => def.label));
    await expect(logoGroup(page)).toHaveCount(1);
    await expect(logoGroup(page).getByRole("button", { name: "파일을 끌어 놓거나 눌러 고르기 · PNG·JPG 2MB" })).toBeVisible();
    await expect(logoGroup(page).locator("img")).toHaveCount(0);
  } finally {
    await page.context().close();
  }

  const otherGroup = await openSettings(browser, baseURL);
  try {
    const groups = await otherGroup.locator("a[href*='group=']").evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
    const other = groups.find((href) => !href.includes(encodeURIComponent(GROUP)));
    if (other) {
      await otherGroup.goto(other);
      await expect(otherGroup.locator("fieldset").filter({ has: otherGroup.locator("legend", { hasText: /^로고$/ }) })).toHaveCount(0);
    }
  } finally {
    await otherGroup.context().close();
  }

  const paper = await openPaper(browser, baseURL);
  try {
    const header = paper.locator("article header");
    await expect(header.locator("img")).toHaveCount(0);
    await expect(header.locator("span").first()).toHaveText(COMPANY);
  } finally {
    await paper.context().close();
  }
});

test("회사명이 비면 로고가 없는 종이 머리는 PLANT8 글자다", async ({ browser, baseURL }) => {
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_NAME, "");
  const paper = await openPaper(browser, baseURL);
  try {
    const header = paper.locator("article header");
    await expect(header.locator("img")).toHaveCount(0);
    await expect(header.locator("span").first()).toHaveText("PLANT8");
  } finally {
    await paper.context().close();
    await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_NAME, COMPANY);
  }
});

test("PNG를 올리면 미리보기 1 · 파일 행 · 살아 있는 DB 행 1이다", async ({ browser, baseURL }) => {
  const page = await openSettings(browser, baseURL);
  try {
    await page.getByTestId("attachments-input").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: LOGO_PNG });
    const group = logoGroup(page);
    await expect(group.locator("img")).toHaveCount(1);
    await expect(group.getByText("logo.png")).toBeVisible();
    await expect.poll(async () => (await db.select({ contentType: files.contentType, originalName: files.originalName, sizeBytes: files.sizeBytes }).from(files).where(and(eq(files.ownerKind, COMPANY_LOGO_OWNER_KIND), eq(files.ownerId, COMPANY_LOGO_OWNER_ID), isNull(files.removedAt))))[0]).toEqual({ contentType: "image/png", originalName: "logo.png", sizeBytes: LOGO_PNG.length });
    await expect(group.getByRole("button", { name: "바꾸기" })).toBeVisible();
    await expect(group.getByRole("button", { name: "삭제" })).toBeVisible();
    await expect.poll(aliveLogoRows).toBe(1);
  } finally {
    await page.context().close();
  }
});

test("로고가 있으면 머리 그림은 1개, 50mm · 14mm 안, 필터 없음, B줄 맨 앞은 회사명이고 회사명 글자는 한 번뿐이다", async ({ browser, baseURL }) => {
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_ADDRESS, "서울특별시 성동구 왕십리로 10");
  const paper = await openPaper(browser, baseURL);
  try {
    const header = paper.locator("article header");
    const image = header.locator("img");
    await expect(image).toHaveCount(1);
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const box = await image.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height, filter: getComputedStyle(el).filter };
    });
    expect(box.height).toBeGreaterThan(0);
    expect(box.height).toBeLessThanOrEqual(14 * MM_TO_PX + 0.5);
    expect(box.width).toBeLessThanOrEqual(50 * MM_TO_PX + 0.5);
    expect(box.filter).toBe("none");
    const line = header.locator("p");
    await expect(line).toHaveCount(1);
    expect((await line.innerText()).startsWith(COMPANY)).toBe(true);
    await expect(header.getByText(COMPANY, { exact: false })).toHaveCount(1);
  } finally {
    await paper.context().close();
    await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_ADDRESS, originals[FIVE.indexOf(PRINT_COMPANY_ADDRESS)] ?? "");
  }
});

test("삭제는 확인 없이 즉시 `로고 삭제됨` + `되돌리기`이고 되돌리면 파일 행이 돌아온다", async ({ browser, baseURL }) => {
  const page = await openSettings(browser, baseURL);
  try {
    const group = logoGroup(page);
    await expect(group.locator("img")).toHaveCount(1);
    await group.getByRole("button", { name: "삭제" }).click();
    const notice = group.getByRole("status");
    await expect(notice).toContainText("로고 삭제됨");
    await expect(group.locator("img")).toHaveCount(0);
    await expect.poll(aliveLogoRows).toBe(0);
    await notice.getByRole("button", { name: "되돌리기" }).click();
    await expect(group.getByRole("status")).toHaveCount(0);
    await expect(group.getByRole("button", { name: "바꾸기" })).toBeVisible();
    await expect.poll(aliveLogoRows).toBe(1);
  } finally {
    await page.context().close();
  }
});

test("3MB 파일은 `3.0MB · 2MB 초과 · 줄여 다시`로 막히고 로고는 그대로다", async ({ browser, baseURL }) => {
  const page = await openSettings(browser, baseURL);
  try {
    const group = logoGroup(page);
    await page.getByTestId("attachments-input").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(3 * 1024 * 1024, 7) });
    await expect(group.getByRole("alert")).toHaveText("3.0MB · 2MB 초과 · 줄여 다시");
    await expect.poll(aliveLogoRows).toBe(1);
  } finally {
    await page.context().close();
  }
});

test("디코딩되는 실제 2MB 넘는 그림도 줄지 않고 `2MB 초과`로 막히며 로고는 그대로다", async ({ browser, baseURL }) => {
  const page = await openSettings(browser, baseURL);
  try {
    const group = logoGroup(page);
    const big = noisePng(1000, 700);
    expect(big.length).toBeGreaterThan(2 * 1024 * 1024);
    await page.getByTestId("attachments-input").setInputFiles({ name: "real-big.png", mimeType: "image/png", buffer: big });
    await expect(group.getByRole("alert")).toHaveText(`${(big.length / (1024 * 1024)).toFixed(1)}MB · 2MB 초과 · 줄여 다시`);
    await expect.poll(aliveLogoRows).toBe(1);
  } finally {
    await page.context().close();
  }
});

test("읽기 권한만 있는 사람에게는 설정 화면이 열리지 않는다", async ({ browser, baseURL }) => {
  const page = await login(browser, baseURL, pm);
  try {
    const response = await page.goto(`/admin/settings?group=${encodeURIComponent(GROUP)}`);
    expect(response?.status()).toBe(404);
  } finally {
    await page.context().close();
  }
});

test("폰 320에서 로고 칸이 가로로 넘치지 않는다", async ({ browser, baseURL }) => {
  const page = await openSettings(browser, baseURL, { width: 320, height: 700 });
  try {
    await expect(logoGroup(page)).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  } finally {
    await page.context().close();
  }
});

test("로고를 못 읽으면 머리는 회사명 글자 하나로 돌아가고 그림은 없다", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.route("**/api/storage-local/**", (route) => route.abort());
    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/print/quotes/${revisionId}`);
    await expect(page.locator("main[data-ready]")).toHaveCount(1);
    const header = page.locator("article header");
    await expect(header.locator("img")).toHaveCount(0);
    await expect(header.locator("span").first()).toHaveText(COMPANY);
    await expect(header.getByText(COMPANY, { exact: false })).toHaveCount(1);
  } finally {
    await context.close();
  }
});
