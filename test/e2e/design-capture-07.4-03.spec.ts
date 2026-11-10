import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { createOrgUnit, createTeam } from "@/domain/org";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { runSeed, type SeedResult } from "../../scripts/codex-design-review/seeds";
import { makePerson } from "./leave-org";
import { insertTempRole } from "./temp-roles";

// 07.4-03 디자인 검토 증거: Codex 경로 캡처가 닿지 못하는 상태(F-S1 1쪽 · F-S2 pnl 못 보는 계급 · F-S3 여러 쪽 · 결재선 4단계 · F-X 404)를
// 폭마다(375 · 320 · 768 · 1280 + 화면 바는 700도) 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`으로 DESIGN_CAPTURE_DIR에 남긴다.
// print 미디어는 A4(794×1123) PNG `state-<이름>-print.png` · PDF `state-<이름>.pdf`와 쪽 수, pdftotext가 있으면 쪽마다 글자 실측(표 머리 「번호」 · 결재란 라벨 · 「n / N」).
// 준비는 Codex 시드 print-settlement(scripts/codex-design-review/seeds.ts)를 그대로 부른다 — 회사 정보 · 온라인구매 협력사 · 결재선(F-S3 올리는 동안만)을 바꾸므로
// 이 스펙은 다른 스펙과 함께 돌리지 않는다(DESIGN_CAPTURE_DIR이 있을 때만 돌고 CI에는 없다). 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 독립 DOM 감사 몫.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.4-03)");

test.describe.configure({ mode: "serial" });

const WIDTHS = [...VIEWPORTS, { width: 700, height: 900 }] as const;
type Login = { email: string; password: string };

let seed: SeedResult;
let plainViewer: Login;
let stranger: Login;

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  seed = await runSeed("print-settlement", browser, baseURL);
  // F-S2: 금액은 보고 pnl 보기만 없는 전사 범위 계급.
  const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `캡처정산서금액-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  for (const menu of ["projects", "expenses"]) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action: "view", allowed: true });
  for (const item of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: item.key, visible: true });
  const email = `capture-${randomUUID()}@example.test`;
  const { tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: `금액${randomUUID().slice(0, 4)}`, roleId: role.id });
  plainViewer = { email, password: tempPassword };
  // F-X: 팀 하나만 있는 사원 — 기안자 · 결재 관련자가 아니고 프로젝트 행 범위 밖이다.
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처무관본부-${randomUUID().slice(0, 8)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처무관팀-${randomUUID().slice(0, 8)}` });
  stranger = await makePerson("무관", "role-pm", team.id, `${seoulToday().slice(0, 4)}-01-01`);
});

async function loginPage(browser: Browser, baseURL: string | undefined, person: Login): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(person.email);
  await page.getByLabel("비밀번호").fill(person.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

function save(name: string, rows: unknown[]): void {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `measurements-state-${name}.json`), JSON.stringify(rows, null, 2));
}

async function shot(page: Page, name: string, suffix: string | number): Promise<void> {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `state-${name}-${suffix}.png`), fullPage: true });
}

async function measurePaper(page: Page, width: number) {
  return page.evaluate((w) => {
    const round = (n: number) => Math.round(n * 10) / 10;
    const boxOf = (el: Element | null) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height), right: round(rect.right) };
    };
    const sheet = document.querySelector("article");
    const barEl = document.querySelector("main > div");
    const clientWidth = document.documentElement.clientWidth;
    const buttons = [...document.querySelectorAll("main > div button")];
    const approval = [...(sheet?.querySelectorAll("section") ?? [])].find((section) => section.querySelector("h2")?.textContent === "결재") ?? null;
    const boxesEl = approval?.querySelector("[data-cols]") ?? null;
    const boxes = approval ? [...approval.querySelectorAll("[data-state]")] : [];
    const subLine = sheet?.querySelector(":scope > p") ?? null;
    const tables = [...(sheet?.querySelectorAll("table") ?? [])];
    const rows = [...(sheet?.querySelectorAll("dl > div") ?? [])];
    const metricLabels = ["매출 기준", "확정 실행가", "수익금", "수익률"];
    return {
      width: w,
      innerWidth: window.innerWidth,
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
      sheet: boxOf(sheet),
      sheetComputedWidth: sheet ? getComputedStyle(sheet).width : null,
      bar: boxOf(barEl),
      barDisplay: barEl ? getComputedStyle(barEl).display : null,
      buttons: buttons.map((button) => ({ text: button.textContent, box: boxOf(button), rightWithinClient: button.getBoundingClientRect().right <= clientWidth })),
      sectionHeadings: [...(sheet?.querySelectorAll("h2") ?? [])].map((h2) => h2.textContent),
      dtList: rows.map((row) => row.querySelector("dt")?.textContent ?? ""),
      rowBreaks: rows.map((row) => ({ label: row.querySelector("dt")?.textContent ?? "", breakInside: getComputedStyle(row).breakInside })),
      profitLabelCount: [...(sheet?.querySelectorAll("span") ?? [])].filter((span) => metricLabels.includes(span.textContent ?? "")).length,
      profitCells: [...(sheet?.querySelectorAll("span") ?? [])]
        .filter((span) => metricLabels.includes(span.textContent ?? ""))
        .map((span) => ({ label: span.textContent, value: span.nextElementSibling?.textContent ?? null })),
      emptyDashUnderSections: [...(sheet?.querySelectorAll("h2") ?? [])].map((h2) => ({ heading: h2.textContent, nextIsDash: h2.nextElementSibling?.tagName === "P" && h2.nextElementSibling.textContent === "—" })),
      tables: tables.map((table) => {
        const heads = [...table.querySelectorAll("thead th")];
        const bodyRows = [...table.querySelectorAll("tbody tr")];
        return {
          captions: [...table.querySelectorAll("caption")].map((caption) => ({ text: caption.textContent, box: boxOf(caption), clip: getComputedStyle(caption).clip })),
          heads: heads.map((th) => ({ text: th.textContent, width: round(th.getBoundingClientRect().width) })),
          theadDisplay: table.tHead ? getComputedStyle(table.tHead).display : null,
          rowCount: bodyRows.length,
          rowBreakInside: [...new Set(bodyRows.map((tr) => getComputedStyle(tr).breakInside))],
          tfootCount: table.querySelectorAll("tfoot").length,
          // 첫 행(긴 항목 · 품목 · 지급처)의 셀마다 상자 폭 ≤ 같은 열 머리 폭 · 넘침 없음.
          firstRowCells: [...(bodyRows[0]?.querySelectorAll("td") ?? [])].map((td, index) => ({
            text: (td.textContent ?? "").slice(0, 80),
            width: round(td.getBoundingClientRect().width),
            headWidth: heads[index] ? round(heads[index].getBoundingClientRect().width) : null,
            scrollWidth: td.scrollWidth,
            clientWidth: td.clientWidth,
          })),
        };
      }),
      approvalBoxes: boxes.length,
      approvalCols: boxesEl?.getAttribute("data-cols") ?? null,
      approvalBreakInside: approval ? getComputedStyle(approval).breakInside : null,
      approvalStates: boxes.map((el) => el.getAttribute("data-state")),
      approvalBoxText: boxes.map((box) => {
        const rect = box.getBoundingClientRect();
        return {
          label: box.querySelector("span")?.textContent ?? null,
          texts: [...box.querySelectorAll("span")].map((span) => span.textContent),
          boxWidth: round(rect.width),
          maxChildWidth: round(Math.max(0, ...[...box.querySelectorAll("span")].map((span) => span.getBoundingClientRect().width))),
          scrollWidth: (box as HTMLElement).scrollWidth,
          clientWidth: (box as HTMLElement).clientWidth,
        };
      }),
      statusTextCount: subLine ? subLine.querySelectorAll("span").length - 1 : 0,
      subLine: subLine?.textContent ?? null,
    };
  }, width);
}

// pdftotext가 있으면 쪽마다 글자를 센다(없으면 null — CI 러너에는 없을 수 있다).
function pdfTextAudit(pdfPath: string, approvalLabels: readonly string[]) {
  const which = spawnSync("which", ["pdftotext"]);
  if (which.status !== 0) return null;
  const run = spawnSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
  if (run.status !== 0) return { error: run.stderr };
  const pages = run.stdout.split("\f").filter((text, index, all) => index < all.length - 1 || text.trim() !== "");
  return {
    pageCount: pages.length,
    pages: pages.map((text, index) => {
      const lines = text.split("\n").map((line) => line.trim());
      return {
        page: index + 1,
        headerNumberLines: lines.filter((line) => /^번호\s/.test(line)).length,
        hasExpenseHead: lines.some((line) => /^번호\s+항목\s+지급처/.test(line)),
        hasPurchaseHead: lines.some((line) => /^번호\s+요청일\s+품목/.test(line)),
        approvalHeading: lines.includes("결재"),
        approvalLabels: approvalLabels.filter((label) => lines.some((line) => line.split(/\s{2,}/).includes(label))),
        footer: lines.filter((line) => /^\d+\s*\/\s*\d+$/.test(line) || /\s\d+\s*\/\s*\d+$/.test(line)).map((line) => line.replace(/\s+/g, " ")),
      };
    }),
  };
}

async function capturePaper(browser: Browser, baseURL: string | undefined, person: Login, name: string, id: string, widths = WIDTHS as readonly { width: number; height: number }[]): Promise<void> {
  const page = await loginPage(browser, baseURL, person);
  try {
    const rows: unknown[] = [];
    for (const viewport of widths) {
      await page.setViewportSize(viewport);
      await page.goto(`/print/settlements/${id}`);
      await expect(page.locator("main[data-ready]")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("article").getByRole("heading", { level: 1, name: "프로젝트 정산서" })).toBeVisible();
      await shot(page, name, viewport.width);
      rows.push(await measurePaper(page, viewport.width));
    }
    // print 미디어 A4 — PNG(전 쪽이 이어진 한 장) · PDF와 쪽 수 · pdftotext 실측.
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: "print" });
    await shot(page, name, "print");
    const printMeasure = await measurePaper(page, 794);
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    let text: ReturnType<typeof pdfTextAudit> = null;
    if (OUT_DIR) {
      const pdfPath = join(OUT_DIR, `state-${name}.pdf`);
      writeFileSync(pdfPath, pdf);
      text = pdfTextAudit(pdfPath, printMeasure.approvalBoxText.flatMap((box) => (box.label ? [box.label] : [])));
    }
    rows.push({ print: { barDisplay: await page.locator("main > div").first().evaluate((el) => getComputedStyle(el).display), pdfPages: pages, pdfBytes: pdf.length, measure: printMeasure, pdfText: text } });
    save(name, rows);
  } finally {
    await page.context().close();
  }
}

test("F-S1 결재 중 · 두 합 · 손익 네 칸 · 지출결의 3 · 구매 요청 2 · 1쪽 — 폭 4 + 화면 바 700 · print", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  await capturePaper(browser, baseURL, seed.viewer, "f-s1", seed.vars.projectId ?? "");
});

test("F-S2 pnl 못 보는 계급 · 같은 건 — 손익 절 없음", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  await capturePaper(browser, baseURL, plainViewer, "f-s2-no-pnl", seed.vars.projectId ?? "");
});

test("F-S3 지출결의 45 · 구매 요청 12 · 결재선 4단계 — 여러 쪽", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  await capturePaper(browser, baseURL, seed.viewer, "f-s3-multipage", seed.vars.projectId2 ?? "");
});

test("F-X 404 · 없는 id · 형식 아닌 id · 볼 수 없는 프로젝트", async ({ browser, baseURL }) => {
  const page = await loginPage(browser, baseURL, stranger);
  const projectId = seed.vars.projectId ?? "";
  try {
    const rows: unknown[] = [];
    for (const id of ["00000000-0000-4000-8000-000000000000", "abc", projectId]) {
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        const response = await page.goto(`/print/settlements/${id}`);
        await expect(page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
        if (id === "abc") await shot(page, "f-x-404", viewport.width);
        rows.push({
          id: id === projectId ? "out-of-scope-project" : id,
          width: viewport.width,
          status: response?.status(),
          title: await page.title(),
          innerWidth: await page.evaluate(() => window.innerWidth),
          scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
        });
      }
    }
    save("f-x-404", rows);
  } finally {
    await page.context().close();
  }
});

test("정산 결재 화면 머리 줄 actions는 1280 · 768에서 넘치지 않는다(backstop)", async ({ browser, baseURL }) => {
  const page = await loginPage(browser, baseURL, seed.viewer);
  try {
    const rows: unknown[] = [];
    for (const viewport of [VIEWPORTS[3], VIEWPORTS[2]]) {
      await page.setViewportSize(viewport);
      await page.goto(`/projects/${seed.vars.projectId ?? ""}/settlement`);
      await expect(page.locator('h1[data-ui="screen-title"]')).toHaveCount(1, { timeout: 20_000 });
      await shot(page, "settlement-entry", viewport.width);
      rows.push(
        await page.locator('h1[data-ui="screen-title"]').evaluate((title, width) => {
          const head = (title.parentElement as HTMLElement).parentElement as HTMLElement;
          const actions = head.children[1] as HTMLElement | undefined;
          const link = [...document.querySelectorAll("a")].find((a) => a.textContent?.trim() === "인쇄");
          return {
            width,
            headHeight: head.getBoundingClientRect().height,
            actionsScrollWidth: actions?.scrollWidth ?? null,
            actionsClientWidth: actions?.clientWidth ?? null,
            printLinkHref: link?.getAttribute("href") ?? null,
            printLinkTarget: link?.getAttribute("target") ?? null,
            printLinkRel: link?.getAttribute("rel") ?? null,
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          };
        }, viewport.width),
      );
    }
    save("settlement-entry", rows);
  } finally {
    await page.context().close();
  }
});
