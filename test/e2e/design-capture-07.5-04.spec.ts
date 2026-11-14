import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions, projects } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import { upsertVisibility } from "@/repositories/permissions";
import { runSeed, type SeedResult } from "../../scripts/codex-design-review/seeds";
import { createE2EProjectEditor } from "./fixtures";

// 07.5-04 디자인 검토 증거(S5): Codex 경로 캡처가 놓치는 상태 넷 — (a) 기본 목록(`year=all`) (b) 선택 칸 거르개 고름 (c) 「행사 장소」 값 검색 결과
// (d) 맞는 행 없는 거르개 → 필터 중 EMPTY, 1440 · 1280 · 1024 · 768 · 375 · 320마다. 덧붙여 추가 칸 열 0 · 1 · 3개를 1280 · 768에서 잰다(열 눌림 비교).
// 시드 custom-fields-filled-pm(02 — 프로젝트 칸 7 + 보관 칸, 전 계급 보임)을 부르고, 칸 키는 DB에서 칸 이름으로 찾는다(시드 파일은 고치지 않는다).
// 폭마다 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`을 DESIGN_CAPTURE_DIR에 남긴다.
// 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 독립 DOM 감사 몫(스크린샷 육안 금지).

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.5-04)");

test.describe.configure({ mode: "serial" });

const PLACE = "행사 장소";
const CONTACT = "고객사 담당자 연락처와 직함 메모 칸";
const COUNT = "예상 참석 인원과 초청 인원 합계 수";
const KIND = "행사 구분";
const REGION = "지역";
const CUSTOM_HEADERS = [PLACE, CONTACT, COUNT];
const WIDTHS = [1440, 1280, 1024, 768, 375, 320] as const;
const SQUEEZE_WIDTHS = [1280, 768] as const;

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

async function keyOf(label: string): Promise<string> {
  const [row] = await db
    .select({ key: fieldDefinitions.key })
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.entity, "project"), eq(fieldDefinitions.label, label)));
  if (!row) throw new Error(`시드 칸 없음: ${label}`);
  return row.key;
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

// 표 넘침(가로 스크롤 상자 · 문서) · 보이는 머리글 순서 · 이름 열 폭 · 추가 칸 머리글 줄 수 · 셀 실측 폭 · 숫자 셀 정렬 · 거르개 select · 폰 「필터」 펼침 안 select 위치.
async function measure(page: Page, width: number) {
  return page.evaluate(
    ({ w, labels }) => {
      const r1 = (n: number) => Math.round(n * 10) / 10;
      const box = (el: Element | null) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: r1(rect.x), y: r1(rect.y), width: r1(rect.width), height: r1(rect.height) };
      };
      const shown = (el: Element) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
      const lines = (el: Element) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        return tops.size;
      };
      const table = [...document.querySelectorAll("table")].find((node) => node.querySelector("caption")?.textContent?.trim() === "프로젝트") ?? null;
      let scroller: HTMLElement | null = table?.parentElement ?? null;
      while (scroller && !["auto", "scroll"].includes(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
      const ths = table ? [...table.querySelectorAll("thead th")] : [];
      const visibleHeaders = ths.filter(shown).map((th) => (th.textContent ?? "").trim());
      const nameIndex = ths.findIndex((th) => (th.textContent ?? "").trim() === "프로젝트명");
      const firstRow = table?.querySelector("tbody tr:has(td)") ?? null;
      const cellsOfColumn = (index: number) =>
        table ? [...table.querySelectorAll("tbody tr")].map((tr) => tr.children[index] as HTMLElement | undefined).filter((td): td is HTMLElement => Boolean(td) && td?.tagName === "TD" && !td?.hasAttribute("colspan")) : [];
      const padX = (el: Element) => {
        const style = getComputedStyle(el);
        return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      };
      const detail = document.getElementById("project-filter-fields");
      return {
        width: w,
        innerWidth: window.innerWidth,
        doc: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
        tableBox: scroller ? { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth, overflowX: getComputedStyle(scroller).overflowX } : null,
        table: table ? { width: r1(table.getBoundingClientRect().width), scrollWidth: table.scrollWidth, clientWidth: table.clientWidth } : null,
        visibleHeaders,
        customHeadersInDom: labels.filter((label) => ths.some((th) => (th.textContent ?? "").trim() === label)),
        nameColumn: nameIndex >= 0 ? { th: box(ths[nameIndex] ?? null), cellWidths: cellsOfColumn(nameIndex).map((td) => r1(td.getBoundingClientRect().width - padX(td))) } : null,
        customHeaders: labels.map((label) => {
          const index = ths.findIndex((th) => (th.textContent ?? "").trim() === label);
          const th = index >= 0 ? (ths[index] as HTMLElement) : null;
          return {
            label,
            visible: th ? shown(th) : false,
            box: th && shown(th) ? box(th) : null,
            lines: th && shown(th) ? lines(th) : null,
            textOverflow: th ? getComputedStyle(th).textOverflow : null,
            sortLink: th ? th.querySelector("a") !== null : null,
            cells: th && shown(th)
              ? cellsOfColumn(index).map((td) => {
                  const inner = td.querySelector("span") ?? td;
                  return {
                    text: (td.textContent ?? "").trim().slice(0, 24),
                    tdWidth: r1(td.getBoundingClientRect().width),
                    contentWidth: r1(td.getBoundingClientRect().width - padX(td)),
                    spanWidth: inner === td ? null : r1(inner.getBoundingClientRect().width),
                    spanMaxWidth: inner === td ? null : getComputedStyle(inner).maxWidth,
                    textAlign: getComputedStyle(td).textAlign,
                    lines: lines(td),
                    textOverflow: getComputedStyle(inner).textOverflow,
                  };
                })
              : [],
          };
        }),
        rowCount: table ? table.querySelectorAll("tbody tr:has(td a[data-row-link])").length : 0,
        firstRowText: (firstRow?.textContent ?? "").trim().slice(0, 80),
        empty: document.body.textContent?.includes("조건에 맞는 프로젝트가 없습니다") ?? false,
        filters: [...document.querySelectorAll("form[aria-label='프로젝트 필터'] select")].map((select) => ({
          id: select.id,
          name: select.getAttribute("name"),
          label: document.querySelector(`label[for="${CSS.escape(select.id)}"]`)?.textContent ?? null,
          visible: shown(select),
          box: shown(select) ? box(select) : null,
        })),
        detailOpen: detail?.getAttribute("data-open") ?? null,
        summary: (document.querySelector("[data-testid='filter-summary']")?.textContent ?? "").trim(),
        primaryButtons: [...document.querySelectorAll("a, button")].filter((el) => shown(el) && /primary/.test(el.className)).map((el) => (el.textContent ?? "").trim()),
        downloadButtons: [...document.querySelectorAll("a, button")].filter((el) => (el.textContent ?? "").includes("파일 받기")).length,
      };
    },
    { w: width, labels: CUSTOM_HEADERS },
  );
}

let seed: SeedResult;
let keys: { kind: string; region: string; place: string; contact: string; count: string };

test.beforeAll(async ({ browser, baseURL }) => {
  seed = await runSeed("custom-fields-filled-pm", browser, baseURL);
  keys = { kind: await keyOf(KIND), region: await keyOf(REGION), place: await keyOf(PLACE), contact: await keyOf(CONTACT), count: await keyOf(COUNT) };
});

async function capture(page: Page, name: string, path: string, opts: { openPhoneFilter?: boolean; expectRows?: boolean } = {}) {
  const rows: unknown[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    expect((await page.goto(path))?.status()).toBe(200);
    if (opts.expectRows === false) await expect(page.getByText("조건에 맞는 프로젝트가 없습니다")).toBeVisible();
    else await expect(page.getByRole("table", { name: "프로젝트" })).toBeVisible();
    await shot(page, name, width);
    rows.push({ state: "closed", ...(await measure(page, width)) });
    if (opts.openPhoneFilter && width < 700) {
      await page.getByRole("button", { name: "필터" }).click();
      await expect(page.locator("#project-filter-fields")).toHaveAttribute("data-open", "true");
      await shot(page, `${name}-filter-open`, width);
      rows.push({ state: "filter-open", ...(await measure(page, width)) });
    }
  }
  save(name, rows);
}

test("S5 상태 넷 — 기본 · 거르개 · 검색 · 필터 중 EMPTY(1440 · 1280 · 1024 · 768 · 375 · 320)", async ({ browser, baseURL }) => {
  const page = await login(browser, baseURL, seed.viewer);
  await capture(page, "default", "/projects?year=all", { openPhoneFilter: true });
  // 시드 프로젝트의 「행사 구분」 값은 보관 선택지(로드쇼)라 활성 선택지로 고르면 맞는 행이 없다 — 맞는 거르개는 「지역」 서울.
  await capture(page, "filter", `/projects?year=all&cf_${keys.region}=${encodeURIComponent("서울")}`, { openPhoneFilter: true });
  await capture(page, "search", `/projects?year=all&q=${encodeURIComponent("코엑스")}`);
  await capture(page, "filter-empty", `/projects?year=all&cf_${keys.kind}=${encodeURIComponent("팝업")}`, { expectRows: false, openPhoneFilter: true });
  await page.context().close();
});

// 추가 칸 열 0 · 1 · 3개 — 같은 프로젝트를 보는 다른 계급(칸 노출 행 수만 다름)으로 1280 · 768 열 폭을 잰다.
test("열 눌림 비교 — 추가 칸 열 0 · 1 · 3개(1280 · 768)", async ({ browser, baseURL }) => {
  const [project] = await db.select({ id: projects.id, teamId: projects.teamId }).from(projects).where(eq(projects.id, seed.vars.projectId ?? ""));
  if (!project) throw new Error("시드 프로젝트 없음");
  // createE2EProjectEditor는 role-pm 권한 · 노출을 복사하되 cf.* 노출 행은 복사하지 않는다 — 시드 뒤에 만든 계급이라 칸 0개.
  const none = await createE2EProjectEditor({ teamId: project.teamId });
  const one = await createE2EProjectEditor({ teamId: project.teamId });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: one.roleId, infoItem: customFieldInfoItem("project", keys.place), visible: true });
  // 담당 PM이 아니어도 같은 팀 업무 범위(role-pm 복사)로 시드 프로젝트가 보인다 — 아래 표 행 단언이 확인한다.
  const rows: unknown[] = [];
  for (const [columns, account] of [
    [0, none],
    [1, one],
    [3, seed.viewer],
  ] as const) {
    const page = await login(browser, baseURL, account);
    for (const width of SQUEEZE_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      expect((await page.goto("/projects?year=all"))?.status()).toBe(200);
      await expect(page.getByRole("table", { name: "프로젝트" }).getByRole("link", { name: /캡처추가칸-/ })).toBeVisible();
      await shot(page, `columns-${columns}`, width);
      rows.push({ columns, ...(await measure(page, width)) });
    }
    await page.context().close();
  }
  save("columns", rows);
});
