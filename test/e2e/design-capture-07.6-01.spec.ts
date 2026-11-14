import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { revenueEntries } from "@/db/schema";
import { countLines, VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { runSeed, type SeedResult } from "../../scripts/codex-design-review/seeds";

// 07.6-01 디자인 검토 증거: Codex 경로 캡처는 화면을 열자마자 찍어 지우기 뒤 상태(결과 줄 · 행 실패 · 대기 중 1차 · 10분 뒤)에 닿지 못한다.
// 이 스펙이 그 상태에 닿은 뒤 폭마다(375 · 320 · 768 · 1280 + 1024) 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`을
// DESIGN_CAPTURE_DIR에 남긴다. 준비는 Codex 시드 revenue-archive-rows(scripts/codex-design-review/seeds.ts)를 그대로 부른다 — 지우는 상태마다 새 시드.
// 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 E2E와 독립 DOM 감사 몫. DESIGN_CAPTURE_DIR이 없으면(CI E2E) 건너뛴다.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.6-01)");

test.describe.configure({ mode: "serial" });

const WIDTHS = [...VIEWPORTS, { width: 1024, height: 900 }] as const;

const revenueSection = (page: Page) => page.locator("section", { has: page.getByRole("heading", { name: "매출", exact: true }) });
const revenueTable = (page: Page, caption: "발행 줄" | "입금 줄") =>
  page.locator("table", { has: page.locator("caption", { hasText: new RegExp(`^${caption}$`) }) });
const liveDelete = (page: Page, caption: "발행 줄" | "입금 줄") =>
  revenueTable(page, caption).locator('button:not([aria-disabled="true"])', { hasText: "삭제" });
const blockedDelete = (page: Page) => revenueTable(page, "발행 줄").locator('button[aria-disabled="true"]', { hasText: "삭제" });
const resultLine = (page: Page) => revenueSection(page).locator('div[role="status"] p');

async function openAs(browser: Browser, baseURL: string | undefined, seed: SeedResult, path: string, clock = false): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  if (clock) await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(seed.viewer.email);
  await page.getByLabel("비밀번호").fill(seed.viewer.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto(path);
  return page;
}

async function measure(page: Page, width: number, surface: Locator) {
  const page_ = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  const tables = await page
    .locator("table:has(caption)")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        // 표를 감싼 가로 스크롤 상자(overflow-x auto · scroll)의 넘침 — 없으면 문서.
        let box: HTMLElement | null = node.parentElement;
        while (box && !["auto", "scroll"].includes(getComputedStyle(box).overflowX)) box = box.parentElement;
        const target = box ?? document.documentElement;
        return { caption: node.querySelector("caption")?.textContent ?? "", scrollWidth: target.scrollWidth, clientWidth: target.clientWidth };
      }),
    );
  let found: { absent: true } | { absent: false; box: { x: number; y: number; width: number; height: number } | null; lines: number | null } = { absent: true };
  if ((await surface.count()) > 0 && (await surface.first().isVisible())) {
    const rects = await surface.first().evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect): [number, number] => [rect.top, rect.bottom]);
    });
    found = { absent: false, box: await surface.first().boundingBox(), lines: countLines(rects) };
  }
  return { width, ...page_, tables, surface: found };
}

async function captureAll(page: Page, name: string, surface: Locator): Promise<void> {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  const rows: unknown[] = [];
  for (const viewport of WIDTHS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(OUT_DIR, `state-${name}-${viewport.width}.png`), fullPage: true });
    rows.push(await measure(page, viewport.width, surface));
  }
  writeFileSync(join(OUT_DIR, `measurements-state-${name}.json`), JSON.stringify(rows, null, 2));
}

test.describe("07.6-01 디자인 검토 증거 캡처", () => {
  test.setTimeout(600_000);

  test("blocked · blocked-many · completed-lock · archive-row", async ({ browser, baseURL }) => {
    const seed = await runSeed("revenue-archive-rows", browser, baseURL);
    const page = await openAs(browser, baseURL, seed, `/projects/${seed.vars.projectId}`);
    await expect(blockedDelete(page)).toHaveCount(3);
    await captureAll(page, "blocked-many", revenueTable(page, "발행 줄"));
    await page.setViewportSize({ width: 1280, height: 900 });
    await blockedDelete(page).first().focus();
    await captureAll(page, "blocked", blockedDelete(page).first());

    await page.goto(`/projects/${seed.vars.completedProjectId}`);
    const lock = revenueSection(page).getByText("완료 프로젝트 · 삭제 불가", { exact: true });
    await expect(lock).toHaveCount(1);
    await captureAll(page, "completed-lock", lock);

    await page.goto("/admin/archive");
    const row = page.locator("tr", { hasText: "매출 줄" });
    await expect(row.first()).toBeVisible();
    await captureAll(page, "archive-row", row.first());
  });

  test("issued-removed · paid-removed", async ({ browser, baseURL }) => {
    const seed = await runSeed("revenue-archive-rows", browser, baseURL);
    const page = await openAs(browser, baseURL, seed, `/projects/${seed.vars.projectId}`);
    await liveDelete(page, "발행 줄").first().click();
    await expect(resultLine(page).first()).toContainText("삭제됨");
    await captureAll(page, "issued-removed", resultLine(page).first());
    await page.setViewportSize({ width: 1280, height: 900 });
    await liveDelete(page, "입금 줄").first().click();
    await expect(revenueSection(page)).toContainText("입금 줄이 없습니다");
    await captureAll(page, "paid-removed", revenueTable(page, "입금 줄"));
  });

  test("delete-failed — 앞 결과 줄 · 행 실패 이유가 함께", async ({ browser, baseURL }) => {
    const seed = await runSeed("revenue-archive-rows", browser, baseURL);
    const page = await openAs(browser, baseURL, seed, `/projects/${seed.vars.projectId}`);
    await liveDelete(page, "발행 줄").first().click();
    await expect(resultLine(page).first()).toContainText("삭제됨");
    // 입금 줄을 다른 사람이 먼저 바꾼 것처럼 판을 올린다 — 지우기 충돌(도메인 거부).
    await db.update(revenueEntries).set({ version: sql`${revenueEntries.version} + 1` }).where(eq(revenueEntries.projectId, seed.vars.projectId ?? ""));
    await liveDelete(page, "입금 줄").first().click();
    const failed = revenueTable(page, "입금 줄").locator('button[aria-disabled="true"]', { hasText: "삭제" });
    await expect(failed).toHaveCount(1);
    await captureAll(page, "delete-failed", revenueTable(page, "입금 줄"));
  });

  test("undo-expired — 10분 뒤 결과 글자만", async ({ browser, baseURL }) => {
    const seed = await runSeed("revenue-archive-rows", browser, baseURL);
    const page = await openAs(browser, baseURL, seed, `/projects/${seed.vars.projectId}`, true);
    await liveDelete(page, "발행 줄").first().click();
    const undo = revenueSection(page).getByRole("button", { name: "되돌리기" });
    await expect(undo).toHaveCount(1);
    await page.clock.fastForward("10:05");
    await expect(undo).toHaveCount(0);
    await captureAll(page, "undo-expired", resultLine(page).first());
  });

  test("row-pending — 지우기 대기 중 1차 `…`", async ({ browser, baseURL }) => {
    const seed = await runSeed("revenue-archive-rows", browser, baseURL);
    const page = await openAs(browser, baseURL, seed, `/projects/${seed.vars.projectId}`);
    let arrive!: () => void;
    let free!: () => void;
    const arrived = new Promise<void>((resolve) => (arrive = resolve));
    const gate = new Promise<void>((resolve) => (free = resolve));
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() !== "POST" || request.headers()["next-action"] === undefined || !(request.postData() ?? "").includes('"entryId"')) {
        await route.fallback();
        return;
      }
      arrive();
      await gate;
      await route.continue();
    });
    await liveDelete(page, "발행 줄").first().click();
    await arrived;
    const save = page.getByRole("button", { name: /일괄 저장/ });
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await captureAll(page, "row-pending", save);
    free();
    await expect(resultLine(page).first()).toContainText("삭제됨");
  });
});
