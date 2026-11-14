import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions } from "@/db/schema";
import { countLines } from "../../scripts/codex-design-review/lib";
import { runSeed, type SeedResult } from "../../scripts/codex-design-review/seeds";
import { waitForCardUsageSection } from "./fixtures";

// 07.5-03 디자인 검토 증거(S4 · design F19): Codex 경로 캡처는 화면을 열자마자 찍어 편집 · 오류 · 행 시트 상태에 닿지 못한다.
// 시드 custom-fields-filled-pm(담당 PM 프로젝트 · 견적 줄 넷 · 견적 줄 칸 넷 + 보관 칸)을 부르고 상태마다 폭에 맞춰
// 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`을 DESIGN_CAPTURE_DIR에 남긴다.
// (a) 3열 읽기 = 1280 · 1024 · 768 · 375 · 320 · (a0) 칸 0 기준선 = 1280 · 1024 · (b) 셀 편집 중 (c) 날짜 붙여넣기 오류 셀 (d) 새 줄 필수 오류 + 합계 행 = 1280 · 1024만 ·
// (e) 폰 행 시트 열림 = 375 · 320만. 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 독립 DOM 감사 몫(스크린샷 육안 금지).

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.5-03)");

test.describe.configure({ mode: "serial" });

const SPEC = "장비 규격과 설치 조건 현장 메모 칸";
const KIND = "설치 구분";
const ARRIVAL = "장비 반입 예정일과 현장 도착 확인일";
const HEIGHT = "설치 높이";
const READ_WIDTHS = [1280, 1024, 768, 375, 320] as const;
const EDIT_WIDTHS = [1280, 1024] as const;
const PHONE_WIDTHS = [375, 320] as const;

const quoteTable = (page: Page) => page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) });
const dataRows = (page: Page) => quoteTable(page).locator('tbody tr:has(td[role="gridcell"])');
// 머리글 색인과 맞추려고 td로 센다 — 1024에서 접힌 열(display: none)은 접근성 트리의 gridcell에서 빠진다.
const cell = (page: Page, row: number, col: number) => dataRows(page).nth(row).locator("td").nth(col);

async function openAs(browser: Browser, baseURL: string | undefined, seed: SeedResult): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(seed.viewer.email);
  await page.getByLabel("비밀번호").fill(seed.viewer.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

// 상태마다 깨끗한 표 — 앞 상태의 미저장 보관본(localStorage)이 복원 줄을 띄우지 않게 비우고 연다.
async function openProject(page: Page, projectId: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/projects/${projectId}`);
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`/projects/${projectId}`);
  await expect(quoteTable(page)).toBeVisible();
  await waitForCardUsageSection(page);
}

async function columnOf(page: Page, name: string): Promise<number> {
  const all = (await quoteTable(page).locator("thead th").allInnerTexts()).map((text) => text.trim());
  const index = all.indexOf(name);
  if (index === -1) throw new Error(`머리글 ${name} 없음: ${all.join(" | ")}`);
  return index;
}

// 표 넘침(가로 스크롤 상자) · 머리글 순서 · 보이는 머리글 · 추가 칸 머리글 줄 수 · 셀 폭(계산 width · 실측 내용 폭) · 상태 신호 · 행 시트 항목.
async function measure(page: Page, width: number) {
  const lineRects = async (selector: string) =>
    page.locator(selector).evaluateAll((nodes) =>
      nodes.map((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return { text: (node.textContent ?? "").trim(), rects: [...range.getClientRects()].filter((r) => r.width > 0).map((r): [number, number] => [r.top, r.bottom]) };
      }),
    );
  const dom = await page.evaluate((labels) => {
    const table = [...document.querySelectorAll("table")].find((node) => node.querySelector("caption")?.textContent?.trim() === "견적 줄") ?? null;
    let box: HTMLElement | null = table?.parentElement ?? null;
    while (box && !["auto", "scroll"].includes(getComputedStyle(box).overflowX)) box = box.parentElement;
    const target = box ?? document.documentElement;
    const ths = table ? [...table.querySelectorAll("thead th")] : [];
    const headerTexts = ths.map((th) => (th.textContent ?? "").trim());
    const visible = ths.filter((th) => getComputedStyle(th).display !== "none").map((th) => (th.textContent ?? "").trim());
    const customIndexes = labels.map((label) => headerTexts.indexOf(label));
    const firstRow = table?.querySelector("tbody tr:has(td)") ?? null;
    const rows = table ? [...table.querySelectorAll("tbody tr:has(td[role='gridcell'])")] : [];
    const cellsOf = (index: number) =>
      rows.map((row) => {
        const td = row.querySelectorAll("td")[index] as HTMLElement | undefined;
        if (!td) return null;
        const style = getComputedStyle(td);
        const rect = td.getBoundingClientRect();
        const lineHeight = parseFloat(style.lineHeight);
        return {
          text: (td.textContent ?? "").trim().slice(0, 60),
          height: Math.round(rect.height * 10) / 10,
          lines: Number.isFinite(lineHeight) && lineHeight > 0 ? Math.round((rect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / lineHeight) : null,
          scrollWidth: td.scrollWidth,
          clientWidth: td.clientWidth,
          width: style.width,
          maxWidth: style.maxWidth,
          contentWidth: Math.round((rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) * 10) / 10,
          textAlign: style.textAlign,
          textOverflow: style.textOverflow,
          display: style.display,
        };
      });
    const root = getComputedStyle(document.documentElement);
    return {
      innerWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      tableBox: { scrollWidth: target.scrollWidth, clientWidth: target.clientWidth },
      headers: headerTexts,
      visibleHeaders: visible,
      customHeaderIndexes: customIndexes,
      headerBoxes: ths
        .filter((th) => getComputedStyle(th).display !== "none")
        .map((th) => ({ text: (th.textContent ?? "").trim().slice(0, 20), width: Math.round(th.getBoundingClientRect().width * 10) / 10, height: Math.round(th.getBoundingClientRect().height * 10) / 10, scrollWidth: th.scrollWidth, clientWidth: th.clientWidth, whiteSpace: getComputedStyle(th).whiteSpace })),
      customCells: Object.fromEntries(labels.map((label, i) => [label, customIndexes[i] === -1 ? null : cellsOf(customIndexes[i] ?? -1)])),
      firstRowCells: firstRow ? firstRow.querySelectorAll("td").length : 0,
      dirtyCells: table ? [...table.querySelectorAll("td")].filter((td) => getComputedStyle(td).backgroundImage.includes("gradient")).length : 0,
      invalidCells: table ? [...table.querySelectorAll('td[aria-invalid="true"]')].map((td) => (td.textContent ?? "").trim()) : [],
      readonlyCells: table ? table.querySelectorAll('td[aria-readonly="true"]').length : 0,
      footer: table?.querySelector("tfoot")?.textContent?.trim() ?? null,
      primaryButtons: document.querySelectorAll('[data-ui="primary-button"]').length,
      fieldWSelect: root.getPropertyValue("--field-w-select").trim(),
      sheet: (() => {
        const dialog = document.querySelector('dialog[open], [role="dialog"]');
        if (!dialog) return null;
        return { title: dialog.getAttribute("aria-label") ?? dialog.querySelector("h2")?.textContent ?? null, text: (dialog.textContent ?? "").replace(/\s+/g, " ").trim(), scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth };
      })(),
    };
  }, [SPEC, KIND, ARRIVAL, HEIGHT]);
  const headerLines = (await lineRects(`table:has(caption) thead th`))
    .filter((entry) => [SPEC, KIND, ARRIVAL].includes(entry.text))
    .map((entry) => ({ text: entry.text, lines: countLines(entry.rects) }));
  return { width, ...dom, customHeaderLines: headerLines };
}

async function capture(page: Page, name: string, width: number, rows: unknown[]): Promise<void> {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT_DIR, `state-${name}-${width}.png`), fullPage: true });
  rows.push(await measure(page, width));
}

function save(name: string, rows: unknown[]): void {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `measurements-state-${name}.json`), JSON.stringify(rows, null, 2));
}

test("견적 줄 추가 칸 상태 — 3열 읽기 · 셀 편집 · 날짜 붙여넣기 오류 · 새 줄 필수 오류 · 폰 행 시트", async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const seed = await runSeed("custom-fields-filled-pm", browser, baseURL);
  const projectId = seed.vars.projectId ?? "";
  const page = await openAs(browser, baseURL, seed);
  try {
    // (a) 3열 읽기 — 머리글은 앞 셋, 넷째 「설치 높이」는 없다.
    const readRows: unknown[] = [];
    for (const width of READ_WIDTHS) {
      await openProject(page, projectId, width);
      if (width >= 700) {
        await expect(quoteTable(page).getByRole("columnheader", { name: SPEC })).toBeVisible();
        await expect(quoteTable(page).getByRole("columnheader", { name: HEIGHT })).toHaveCount(0);
      } else {
        await expect(quoteTable(page).getByRole("columnheader", { name: SPEC })).toHaveCount(0);
      }
      await capture(page, "read", width, readRows);
    }
    save("read", readRows);

    // (a0) 같은 줄 · 추가 칸 0 — 칸 넷을 잠시 보관하고 1280 · 1024에서 잰다(이 브랜치의 칸 0 화면 = main 기준선 · 열 눌림 비교).
    const activeLabels = [SPEC, KIND, ARRIVAL, HEIGHT];
    const activeDefs = and(eq(fieldDefinitions.entity, "quote_line"), inArray(fieldDefinitions.label, activeLabels));
    await db.update(fieldDefinitions).set({ archivedAt: new Date() }).where(activeDefs);
    const baseRows: unknown[] = [];
    try {
      for (const width of EDIT_WIDTHS) {
        await openProject(page, projectId, width);
        await expect(quoteTable(page).getByRole("columnheader", { name: SPEC })).toHaveCount(0);
        await capture(page, "read-no-fields", width, baseRows);
      }
    } finally {
      await db.update(fieldDefinitions).set({ archivedAt: null }).where(activeDefs);
    }
    save("read-no-fields", baseRows);

    // (b) 셀 편집 중 — 첫 줄 텍스트 칸 편집기 열림 + 둘째 줄 날짜 칸 고친(dirty) 셀.
    const editRows: unknown[] = [];
    for (const width of EDIT_WIDTHS) {
      await openProject(page, projectId, width);
      const arrival = await columnOf(page, ARRIVAL);
      await cell(page, 1, arrival).focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Control+a");
      await page.keyboard.type("2026-11-20");
      await page.keyboard.press("Enter");
      const spec = await columnOf(page, SPEC);
      await expect(async () => {
        await cell(page, 0, spec).focus();
        await page.keyboard.press("Enter");
        await expect(cell(page, 0, spec).locator("input")).toBeFocused({ timeout: 1000 });
      }).toPass();
      await capture(page, "edit", width, editRows);
      await page.keyboard.press("Escape");
    }
    save("edit", editRows);

    // (c) 날짜 붙여넣기 2026-02-31 → 오류 셀(셋째 줄 — 빈 칸).
    const pasteRows: unknown[] = [];
    for (const width of EDIT_WIDTHS) {
      await openProject(page, projectId, width);
      const arrival = await columnOf(page, ARRIVAL);
      const target = cell(page, 2, arrival);
      await target.focus();
      await expect(target).toHaveAttribute("data-grid-focus", "");
      await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.setData("text/plain", "2026-02-31");
        document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
      });
      await expect(target).toHaveAttribute("aria-invalid", "true");
      await capture(page, "paste-error", width, pasteRows);
    }
    save("paste-error", pasteRows);

    // (d) 새 줄 필수 오류 + 합계 행 — 이 상태만 첫 칸을 필수로 켠다.
    await db.update(fieldDefinitions).set({ required: true }).where(and(eq(fieldDefinitions.entity, "quote_line"), eq(fieldDefinitions.label, SPEC)));
    const requiredRows: unknown[] = [];
    try {
      for (const width of EDIT_WIDTHS) {
        await openProject(page, projectId, width);
        await cell(page, 3, 2).focus();
        await page.keyboard.press("Control+Enter");
        await expect(dataRows(page)).toHaveCount(5);
        const name = cell(page, 4, 2);
        await expect(async () => {
          await name.focus();
          await page.keyboard.press("Enter");
          await expect(name.locator("input")).toBeFocused({ timeout: 1000 });
        }).toPass();
        await page.keyboard.type("필수 빈 새 줄");
        await page.keyboard.press("Enter");
        await page.getByRole("button", { name: /일괄 저장/ }).click();
        await expect(quoteTable(page).locator("tfoot")).toContainText("오류 1칸 · 전부 거부");
        await capture(page, "required-error", width, requiredRows);
      }
    } finally {
      await db.update(fieldDefinitions).set({ required: false }).where(and(eq(fieldDefinitions.entity, "quote_line"), eq(fieldDefinitions.label, SPEC)));
    }
    save("required-error", requiredRows);

    // (e) 폰 행 시트 열림 — 첫 줄(값 넷 · 보관 칸 값은 없음).
    const sheetRows: unknown[] = [];
    for (const width of PHONE_WIDTHS) {
      await openProject(page, projectId, width);
      await page.getByRole("button", { name: "LED 스크린 상세 보기" }).click();
      const sheet = page.getByRole("dialog", { name: "LED 스크린" });
      await expect(sheet).toContainText(SPEC);
      await capture(page, "row-sheet", width, sheetRows);
      await page.keyboard.press("Escape");
    }
    save("row-sheet", sheetRows);
  } finally {
    await page.context().close();
  }
});
