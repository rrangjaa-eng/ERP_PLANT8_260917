import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { loginAsSysadmin, tokenNumber } from "./row-actions-helpers";
import { setupLeaveOrg } from "./leave-org";
import { onStableSeoulDay } from "./leave-dates";
import { recordAction } from "@/domain/action-log/record";
import { createOrgUnit } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { db } from "@/db/client";
import { teams, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// 04.6 웨이브 5 디자인 검토(04.6-W5-design-review.md) 결함 고침의 DOM 실측 — PC 1280 · 1024 · 768.
// 판정은 계산값으로만 한다. 스크린샷 육안 판정 없음.

async function ensureActionLogRow(): Promise<void> {
  await recordAction(SYSTEM_VIEWER, {
    actionType: "document_create",
    entity: "code_items",
    detail: { memo: `w5-${randomUUID()}`, 구분: "열 폭 배분 확인용 상세 값", padding: "가".repeat(200) },
  });
}

// D-2 — 행동 로그 머리글이 한 줄이다(main 32 · 브랜치 67), 「상세」 칸이 폭을 독차지하지 않는다.
for (const width of [1280, 1024, 768]) {
  test.describe(`행동 로그 ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test(`D-2 머리글이 한 줄이고 상세 칸이 폭을 독차지하지 않는다 (${width})`, async ({ page }) => {
      await ensureActionLogRow();
      await loginAsSysadmin(page);
      await page.goto("/admin/action-log?actionType=document_create");
      const headers = page.locator("table thead th").filter({ visible: true });
      const boxes = await headers.evaluateAll((cells) =>
        cells.map((cell) => {
          const rect = cell.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(cell);
          const lines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
          return { text: cell.textContent ?? "", width: rect.width, height: rect.height, lines };
        }),
      );
      expect(boxes.length).toBeGreaterThan(3);
      for (const box of boxes) expect(box.lines, `${box.text} 머리글 줄 수`).toBe(1);
      const total = boxes.reduce((sum, box) => sum + box.width, 0);
      const detail = boxes.find((box) => box.text.trim() === "상세");
      expect(detail, "상세 열").toBeDefined();
      expect(detail!.width / total, "상세 열 폭 비율").toBeLessThan(0.5);
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scroll, "문서 가로 넘침").toBeLessThanOrEqual(0);
    });
  });
}

// 행동 로그 0건 이유 글자 색 — 정상 상태 이유라 `--text-muted`(SYSTEM §7-1 ⑦ · §7-7), 막힘 색(`--status-danger`)이 아니다.
test("행동 로그 정리 0건 이유 글자가 --text-muted다 (--status-danger 아님)", async ({ page }) => {
  await loginAsSysadmin(page);
  const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.goto(`/admin/action-log?from=${tomorrow}`);
  const reason = page.getByText("정리할 행이 없습니다", { exact: true });
  await expect(reason).toBeVisible();
  const colors = await page.evaluate(() => {
    const probe = (token: string) => {
      const element = document.createElement("span");
      element.style.color = `var(${token})`;
      document.body.appendChild(element);
      const value = getComputedStyle(element).color;
      element.remove();
      return value;
    };
    return { muted: probe("--text-muted"), danger: probe("--status-danger") };
  });
  const actual = await reason.evaluate((element) => getComputedStyle(element).color);
  expect(actual).not.toBe(colors.danger);
  expect(actual).toBe(colors.muted);
});

// D-4 — 조직 행동 줄이 목록과 같은 720 기둥이다(SYSTEM §3 · §6-1).
for (const width of [1280, 768]) {
  test(`D-4 /admin/people/org 「본부 추가」가 목록 720 기둥 안에 있다 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID().slice(0, 8)}` });
    await loginAsSysadmin(page);
    await page.goto("/admin/people/org");
    const primary = page.locator('[data-ui="primary-button"]');
    await expect(primary).toBeVisible();
    const list = page.locator("ul").filter({ has: page.getByRole("link", { name: "팀 추가" }).first() }).first();
    const listBox = await list.boundingBox();
    const primaryBox = await primary.boundingBox();
    expect(listBox).not.toBeNull();
    expect(primaryBox).not.toBeNull();
    expect(listBox!.width).toBeLessThanOrEqual(720);
    expect(primaryBox!.x + primaryBox!.width).toBeLessThanOrEqual(listBox!.x + listBox!.width + 0.5);
  });
}

async function seedProject(): Promise<void> {
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2Ew5-${randomUUID().slice(0, 8)}`, normalizedName: `e2ew5-${randomUUID()}` });
  const email = (await createFixtureUser({ roleId: SYSADMIN_ROLE_ID })).email;
  const [team] = await db.select().from(teams).limit(1);
  const [pm] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!team || !pm) throw new Error("팀 또는 PM 없음");
  await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: pm.id, name: `E2Ew5 프로젝트 ${randomUUID().slice(0, 6)}` });
}

// D-6 · D-7 — /projects select는 입력 radius 토큰, 768 1차 버튼은 한 줄.
for (const width of [768, 1280]) {
  test(`D-6 · D-7 /projects select radius가 입력 토큰이고 1차 버튼 글자가 한 줄이다 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedProject();
    await loginAsSysadmin(page);
    await page.goto("/projects");
    const radius = await tokenNumber(page, "--radius-control");
    const selects = page.locator("#main-content select").filter({ visible: true });
    await expect(selects.first()).toBeVisible();
    for (const value of await selects.evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).borderTopLeftRadius)))) {
      expect(value).toBe(radius);
    }
    const primary = page.locator('[data-ui="primary-button"]');
    await expect(primary).toBeVisible();
    const metrics = await primary.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const lines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
      const box = element.getBoundingClientRect();
      return { lines, width: box.width, height: box.height, whiteSpace: getComputedStyle(element).whiteSpace, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    expect(metrics.whiteSpace).toBe("nowrap");
    expect(metrics.lines).toBe(1);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(metrics.width).toBeGreaterThanOrEqual(96);
    expect(metrics.height).toBe(await tokenNumber(page, "--control-h"));
  });
}

// D-8 — /pnl 「리저브 대장」 줄 아래 간격이 척도 12(--s-3)다.
for (const width of [1280, 768]) {
  test(`D-8 /pnl 「리저브 대장」 줄과 빈 화면 사이가 --s-3이다 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await loginAsSysadmin(page);
    await page.goto("/pnl");
    const link = page.getByRole("link", { name: "리저브 대장", exact: true });
    await expect(link).toBeVisible();
    const gap = await page.evaluate(() => {
      const anchor = Array.from(document.querySelectorAll("a")).find((a) => a.textContent?.trim() === "리저브 대장");
      const empty = document.querySelector('[data-ui="empty-state"]');
      if (!anchor || !empty) return null;
      return empty.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom;
    });
    expect(gap).toBe(await tokenNumber(page, "--s-3"));
  });
}

// 연차 잔고 — 면(테두리·radius·바탕)을 걷고 텍스트 한 줄(SYSTEM:435 · §6-2 「네 숫자 한 줄」).
async function balanceSurface(page: Page): Promise<{ border: string; radius: string; bg: string; text: boolean }> {
  return page.getByTestId("leave-balance").evaluate((element) => {
    const holder = element.parentElement as HTMLElement;
    const style = getComputedStyle(holder);
    return { border: style.borderTopWidth, radius: style.borderTopLeftRadius, bg: style.backgroundColor, text: (element.textContent ?? "").includes("남음") };
  });
}

async function loginDrafter(browser: Browser, baseURL: string | undefined, creds: { email: string; password: string }, viewport: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(creds.email);
  await page.getByLabel("비밀번호").fill(creds.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

test("연차 /leave 잔고가 면 없이 텍스트 한 줄이다 (1280)", async ({ browser, baseURL }) => {
  await onStableSeoulDay(async (today) => {
    const org = await setupLeaveOrg(today);
    const page = await loginDrafter(browser, baseURL, org.drafter, { width: 1280, height: 900 });
    await page.goto("/leave");
    await expect(page.getByTestId("leave-balance")).toBeVisible();
    const surface = await balanceSurface(page);
    expect(surface.text).toBe(true);
    expect(surface.border).toBe("0px");
    expect(surface.radius).toBe("0px");
    expect(surface.bg).toBe("rgba(0, 0, 0, 0)");
    await page.context().close();
  });
});

// PC 편집은 그대로 — 첫 렌더(JS 끔)부터 입력이 보인다.
test("PC 1280 계급 · 코드표는 첫 렌더(JS 끔)부터 편집 입력이 보인다", async ({ browser, page }) => {
  await loginAsSysadmin(page);
  const state = await page.context().storageState();
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", storageState: state, javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
  const noJs = await context.newPage();
  for (const path of ["/admin/people/roles", "/admin/code-tables?tableKey=evidence_type"]) {
    await noJs.goto(path);
    const visibleInputs: Locator = noJs.locator("table input, table select").filter({ visible: true });
    expect(await visibleInputs.count(), `${path} 보이는 입력`).toBeGreaterThan(0);
  }
  await context.close();
});
