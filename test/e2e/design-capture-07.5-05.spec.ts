import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { runSeed, type SeedResult } from "../../scripts/codex-design-review/seeds";

// 07.5-05 디자인 검토 증거(S1 · S7 · design B4): Codex 경로 캡처가 놓치는 상태 넷 — (a) 대상 「프로젝트」 목록 (b) 대상 링크로 「견적 줄」 고름
// (c) 수정 패널 제목 (d) 정보 노출표(커스텀 칸 60행 + 기존 항목) · 폰 「계급 고르기 → 항목 목록」, 1280 · 768 · 375 · 320마다.
// 시드 custom-fields-scale(대상마다 20자 이름 칸 20개, 전 계급 보임)을 부른다. 폭마다 전체 화면 PNG `state-<이름>-<폭>.png`와
// DOM 표 `measurements-state-<이름>.json`을 DESIGN_CAPTURE_DIR에 남긴다. 단언은 상태 도달 · 문서 가로 넘침 0(backstop)뿐 — 판정은 독립 DOM 감사 몫.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.5-05)");

test.describe.configure({ mode: "serial" });

const WIDTHS = [1280, 768, 375, 320] as const;
const FIELD_CAPTION = "화면 항목";
const VISIBILITY_CAPTION = "계급별 정보 노출표";

function save(name: string, rows: unknown[]): void {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `measurements-state-${name}.json`), JSON.stringify(rows, null, 2));
}

async function shot(page: Page, name: string, width: number): Promise<void> {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `state-${name}-${width}.png`), fullPage: true });
}

async function login(browser: Browser, baseURL: string | undefined, account: { email: string; password: string }): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

// 화면 항목 관리: 대상 링크 줄 상자 · 링크마다 글자 굵기 · aria-current · 표 행 수 · 이름 칸 줄 수 · 패널 제목.
async function measureFieldDefinitions(page: Page, width: number) {
  return page.evaluate(
    ({ w, caption }) => {
      const r1 = (n: number) => Math.round(n * 10) / 10;
      const box = (el: Element | null) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: r1(rect.x), y: r1(rect.y), width: r1(rect.width), height: r1(rect.height) };
      };
      const lines = (el: Element) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
      };
      const nav = document.querySelector("nav[aria-label='대상']");
      const table = [...document.querySelectorAll("table")].find((node) => node.querySelector("caption")?.textContent?.trim() === caption) ?? null;
      const dialog = document.querySelector("dialog[open], [role='dialog']");
      return {
        width: w,
        innerWidth: window.innerWidth,
        doc: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
        targetNav: nav
          ? {
              box: box(nav),
              links: [...nav.querySelectorAll("a")].map((a) => ({
                text: (a.textContent ?? "").trim(),
                current: a.getAttribute("aria-current"),
                fontWeight: getComputedStyle(a).fontWeight,
                textDecoration: getComputedStyle(a).textDecorationLine,
                box: box(a),
              })),
            }
          : null,
        table: table ? { box: box(table), rowCount: table.querySelectorAll("tbody tr").length } : null,
        firstNameLines: table ? [...table.querySelectorAll("tbody tr")].slice(0, 5).map((tr) => (tr.firstElementChild ? lines(tr.firstElementChild) : 0)) : [],
        dialog: dialog ? { name: dialog.getAttribute("aria-label") ?? document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent ?? null, box: box(dialog) } : null,
      };
    },
    { w: width, caption: FIELD_CAPTION },
  );
}

// 정보 노출표: 격자(데스크톱) — 스크롤 상자 · 항목 열 폭 · 커스텀 칸 행 수 · 행 이름 줄 수 · 세로 스크롤 뒤 sticky 머리글 위치.
// 폰 — 계급 select 상자 · KvList 항목 수 · 라벨 줄 수 · 체크박스 상자.
async function measureVisibility(page: Page, width: number) {
  return page.evaluate(
    ({ w, caption }) => {
      const r1 = (n: number) => Math.round(n * 10) / 10;
      const box = (el: Element | null) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: r1(rect.x), y: r1(rect.y), width: r1(rect.width), height: r1(rect.height) };
      };
      const lines = (el: Element) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
      };
      const shown = (el: Element | null) => Boolean(el) && getComputedStyle(el as Element).display !== "none" && (el as Element).getBoundingClientRect().width > 0;
      const table = [...document.querySelectorAll("table")].find((node) => node.querySelector("caption")?.textContent?.trim() === caption) ?? null;
      let scroller: HTMLElement | null = table?.parentElement ?? null;
      while (scroller && !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY) && !["auto", "scroll"].includes(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
      const corner = table?.querySelector("thead th") ?? null;
      const customRows = table ? [...table.querySelectorAll("tbody th[scope='row']")].filter((th) => /(거래처|프로젝트|견적 줄) · /.test(th.textContent ?? "")) : [];
      const headerTop = () => {
        const th = table?.querySelector("thead th:nth-child(2)") ?? null;
        if (!th || !scroller) return null;
        return r1(th.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
      };
      const before = headerTop();
      if (scroller) scroller.scrollTop = 1200;
      const after = headerTop();
      const scrolledBy = scroller?.scrollTop ?? 0;
      if (scroller) scroller.scrollTop = 0;
      const select = [...document.querySelectorAll("select")].find((node) => node.closest("label")?.textContent?.startsWith("계급")) ?? null;
      const kv = select?.closest("label")?.parentElement ?? null;
      const kvLabels = kv ? [...kv.querySelectorAll("dt")] : [];
      const kvCustom = kvLabels.filter((dt) => /(거래처|프로젝트|견적 줄) · /.test(dt.textContent ?? ""));
      return {
        width: w,
        innerWidth: window.innerWidth,
        doc: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
        grid: shown(table)
          ? {
              scroller: scroller ? { box: box(scroller), scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight } : null,
              itemColumn: box(corner),
              customRowCount: customRows.length,
              customRowLines: customRows.map((th) => lines(th)),
              maxCustomRowLines: Math.max(0, ...customRows.map((th) => lines(th))),
              stickyHeader: { topBefore: before, topAfterScroll: after, scrolledBy },
            }
          : null,
        phone: shown(select)
          ? {
              select: box(select),
              selectedRole: select ? select.selectedOptions[0]?.textContent ?? null : null,
              itemCount: kvLabels.length,
              customItemCount: kvCustom.length,
              maxCustomLabelLines: Math.max(0, ...kvCustom.map((dt) => lines(dt))),
              firstCustom: kvCustom.slice(0, 3).map((dt) => ({ text: (dt.textContent ?? "").trim(), box: box(dt), lines: lines(dt) })),
              checkboxes: [...(kv?.querySelectorAll("input[type='checkbox']") ?? [])].slice(0, 3).map((input) => box(input)),
            }
          : null,
      };
    },
    { w: width, caption: VISIBILITY_CAPTION },
  );
}

let seed: SeedResult;

test.beforeAll(async ({ browser, baseURL }) => {
  seed = await runSeed("custom-fields-scale", browser, baseURL);
});

test("S1 화면 항목 관리 — 대상 프로젝트 목록 · 견적 줄로 바꿈 · 수정 패널(1280 · 768 · 375 · 320)", async ({ browser, baseURL }) => {
  const page = await login(browser, baseURL, seed.viewer);
  const listRows: unknown[] = [];
  const switchRows: unknown[] = [];
  const editRows: unknown[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });

    // (a) 대상 「프로젝트」 목록
    expect((await page.goto("/admin/field-definitions?target=project"))?.status()).toBe(200);
    await expect(page.getByRole("navigation", { name: "대상" }).getByRole("link", { name: "프로젝트" })).toHaveAttribute("aria-current", "page");
    await shot(page, "target-project", width);
    const list = await measureFieldDefinitions(page, width);
    expect(list.doc.scrollWidth - list.doc.clientWidth, `target-project ${width} 문서 가로 넘침`).toBe(0);
    listRows.push(list);

    // (b) 대상 링크로 「견적 줄」을 고른 뒤
    await page.getByRole("navigation", { name: "대상" }).getByRole("link", { name: "견적 줄" }).click();
    await expect(page).toHaveURL(/target=quote_line/);
    await expect(page.getByRole("navigation", { name: "대상" }).getByRole("link", { name: "견적 줄" })).toHaveAttribute("aria-current", "page");
    await shot(page, "target-quote-line", width);
    const switched = await measureFieldDefinitions(page, width);
    expect(switched.doc.scrollWidth - switched.doc.clientWidth, `target-quote-line ${width} 문서 가로 넘침`).toBe(0);
    switchRows.push(switched);

    // (c) 수정 패널 제목 — 첫 칸의 「수정」
    await page.getByRole("link", { name: /^견적줄규모 칸01 .* 수정$/ }).click();
    await expect(page.getByRole("dialog", { name: "견적 줄 화면 항목 수정", exact: true })).toBeVisible();
    await shot(page, "edit-panel", width);
    const edit = await measureFieldDefinitions(page, width);
    expect(edit.doc.scrollWidth - edit.doc.clientWidth, `edit-panel ${width} 문서 가로 넘침`).toBe(0);
    editRows.push(edit);
  }
  save("target-project", listRows);
  save("target-quote-line", switchRows);
  save("edit-panel", editRows);
  await page.context().close();
});

test("S7 정보 노출표 — 커스텀 칸 60행 격자 · 폰 계급 고르기 → 항목 목록(1280 · 768 · 375 · 320)", async ({ browser, baseURL }) => {
  const page = await login(browser, baseURL, seed.viewer);
  const rows: unknown[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    expect((await page.goto("/admin/visibility"))?.status()).toBe(200);
    await expect(page.getByText(VISIBILITY_CAPTION, { exact: true }).first()).toBeAttached();
    await shot(page, "visibility", width);
    const measured = await measureVisibility(page, width);
    expect(measured.doc.scrollWidth - measured.doc.clientWidth, `visibility ${width} 문서 가로 넘침`).toBe(0);
    rows.push({ state: "default", ...measured });

    // 폰: 계급을 「사원」(role-pm)으로 바꾼 뒤 항목 목록
    if (measured.phone) {
      await page.getByRole("combobox", { name: /^계급/ }).selectOption({ label: "사원" });
      await shot(page, "visibility-role-picked", width);
      rows.push({ state: "role-picked", ...(await measureVisibility(page, width)) });
    }
  }
  save("visibility", rows);
  await page.context().close();
});
