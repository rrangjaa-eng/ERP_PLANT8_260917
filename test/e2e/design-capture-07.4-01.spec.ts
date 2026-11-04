import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { getSettingValue, setSettingValue, type SettingDef } from "@/domain/settings/registry";
import { PRINT_COMPANY_ADDRESS, PRINT_COMPANY_BUSINESS_NO, PRINT_COMPANY_NAME, PRINT_COMPANY_PHONE, PRINT_COMPANY_REPRESENTATIVE } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { makeEvidenceManagerE2E, setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { loginPage, type Person } from "./leave-org";

// 07.4-01 디자인 검토 증거: Codex 경로 캡처가 닿지 못하는 상태(F-E2 승인 · F-E3 반려 · F-E4 금액 못 봄 · F-C 회사 정보 세 가지 · F-X 404)를
// 폭마다(375 · 320 · 768 · 1280 + 화면 바는 700도) 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`으로 DESIGN_CAPTURE_DIR에 남긴다.
// print 미디어는 A4(794×1123) PNG `state-<이름>-print.png`와 page.pdf 쪽 수. 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 독립 DOM 감사 몫.
// F-C 세 상태가 공용 설정 `print.company_*`를 바꾸므로 desktop-settings 한 워커에서 돌고(playwright.config.ts DESKTOP_SETTINGS_SPECS) 끝나면 값을 되돌린다.
// 로딩 경계(loading.tsx)는 느린 응답 없이는 안정적으로 잡히지 않아 이 스펙은 찍지 않는다(보고서에 이유 한 줄).

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.4-01)");

test.describe.configure({ mode: "serial" });

const COMPANY_DEFS: readonly SettingDef<string>[] = [PRINT_COMPANY_NAME, PRINT_COMPANY_ADDRESS, PRINT_COMPANY_BUSINESS_NO, PRINT_COMPANY_REPRESENTATIVE, PRINT_COMPANY_PHONE];
const COMPANY_FULL = ["플랜트에이트 주식회사", "서울특별시 성동구 왕십리로 10", "123-45-67890", "김대표", "02-123-4567"];
const WIDTHS = [...VIEWPORTS, { width: 700, height: 900 }] as const;

let fx: ExpenseE2E;
let inReviewId: string;
let approvedId: string;
let rejectedId: string;
let blind: Person;
let originals: string[] = [];

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  originals = await Promise.all(COMPANY_DEFS.map((def) => getSettingValue(def)));
  await setCompany(COMPANY_FULL);
  fx = await setupExpenseE2E();
  inReviewId = await submitLineExpense(browser, baseURL, fx, "tracer");
  approvedId = await submitLineExpense(browser, baseURL, fx, "retry");
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: approvedId });
    if (!view) throw new Error(`결재 문서를 읽지 못했다: ${approver.name}`);
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
  rejectedId = await submitLineExpense(browser, baseURL, fx, "phone");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: rejectedId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  blind = await makeEvidenceManagerE2E();
  if (!blind.viewer.roleId) throw new Error("계급 없음");
  await upsertVisibility(SYSTEM_VIEWER, { roleId: blind.viewer.roleId, infoItem: "expense.amount", visible: false });
});

test.afterAll(async () => {
  try {
    await Promise.all(COMPANY_DEFS.map((def, index) => setSettingValue(SYSTEM_VIEWER, def, originals[index] ?? "")));
  } catch (error) {
    // 복원 실패가 다음 스펙의 머리를 흔들지 않게 한 번 더 시도하고 원래 오류를 올린다.
    await Promise.all(COMPANY_DEFS.map((def) => setSettingValue(SYSTEM_VIEWER, def, "")));
    throw error;
  }
});

async function setCompany(values: string[]): Promise<void> {
  for (const [index, def] of COMPANY_DEFS.entries()) await setSettingValue(SYSTEM_VIEWER, def, values[index] ?? "");
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
  return page.evaluate(
    (w) => {
      const boxOf = (el: Element | null) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10, width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 };
      };
      const sheet = document.querySelector("article");
      const barEl = document.querySelector("main > div");
      const buttons = [...document.querySelectorAll("main > div button")];
      const header = sheet?.querySelector("header") ?? null;
      const approval = [...(sheet?.querySelectorAll("section") ?? [])].find((section) => section.querySelector("h2")?.textContent === "결재") ?? null;
      const boxes = approval ? [...approval.querySelectorAll("[data-state]")] : [];
      const subLine = sheet?.querySelector(":scope > p") ?? null;
      return {
        width: w,
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollX: window.scrollX,
        sheet: boxOf(sheet),
        bar: boxOf(barEl),
        barDisplay: barEl ? getComputedStyle(barEl).display : null,
        buttons: buttons.map((button) => ({ text: button.textContent, box: boxOf(button) })),
        headerA: boxOf(header?.firstElementChild ?? null),
        headerB: boxOf(header?.querySelector("p") ?? null),
        approvalBoxes: boxes.length,
        approvalStates: boxes.map((el) => el.getAttribute("data-state")),
        statusTextCount: subLine ? subLine.querySelectorAll("span").length - 1 : 0,
        subLine: subLine?.textContent ?? null,
        amountHeader: [...(sheet?.querySelectorAll("thead th") ?? [])].some((th) => th.textContent?.trim() === "금액"),
        captionCount: sheet?.querySelectorAll("caption").length ?? 0,
        theadDisplay: sheet?.querySelector("thead") ? getComputedStyle(sheet.querySelector("thead") as Element).display : null,
        rowBreaks: [...(sheet?.querySelectorAll("dl > div") ?? [])].map((row) => ({ label: row.querySelector("dt")?.textContent ?? "", breakInside: getComputedStyle(row).breakInside })),
        rejectReasonRows: [...(sheet?.querySelectorAll("b") ?? [])].filter((b) => b.textContent === "반려 사유").length,
      };
    },
    width,
  );
}

async function capturePaper(browser: Browser, baseURL: string | undefined, person: Person, name: string, path: string, widths = VIEWPORTS as readonly { width: number; height: number }[]): Promise<void> {
  const page = await loginPage(browser, baseURL, person);
  try {
    const rows: unknown[] = [];
    for (const viewport of widths) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      await expect(page.locator("main[data-ready]")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
      await shot(page, name, viewport.width);
      rows.push(await measurePaper(page, viewport.width));
    }
    // print 미디어 A4 — PNG와 PDF 쪽 수.
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: "print" });
    await shot(page, name, "print");
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    rows.push({ print: { barDisplay: await page.locator("main > div").first().evaluate((el) => getComputedStyle(el).display), pdfPages: pages, pdfBytes: pdf.length } });
    save(name, rows);
  } finally {
    await page.context().close();
  }
}

test("F-E1 결재 중 · 폭 4 + 화면 바 700 · print", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  await capturePaper(browser, baseURL, fx.pm, "f-e1", `/print/expenses/${inReviewId}`, WIDTHS);
});

test("F-E2 승인 완료 · F-E3 반려 · F-E4 금액 못 보는 계급", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  await capturePaper(browser, baseURL, fx.pm, "f-e2-approved", `/print/expenses/${approvedId}`);
  await capturePaper(browser, baseURL, fx.pm, "f-e3-rejected", `/print/expenses/${rejectedId}`);
  await capturePaper(browser, baseURL, blind, "f-e4-no-amount", `/print/expenses/${inReviewId}`);
});

test("F-C 회사 정보 세 가지 — 다섯 채움은 F-E1, 회사명만 · 전부 비움", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  try {
    await setCompany(["플랜트에이트 주식회사", "", "", "", ""]);
    await capturePaper(browser, baseURL, fx.pm, "f-c-name-only", `/print/expenses/${inReviewId}`);
    await setCompany(["", "", "", "", ""]);
    await capturePaper(browser, baseURL, fx.pm, "f-c-empty", `/print/expenses/${inReviewId}`);
  } finally {
    await setCompany(COMPANY_FULL);
  }
});

test("F-X 404 · 볼 수 없는 id", async ({ browser, baseURL }) => {
  const page = await loginPage(browser, baseURL, fx.pm);
  try {
    const rows: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/print/expenses/00000000-0000-4000-8000-000000000000");
      await expect(page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
      await shot(page, "f-x-404", viewport.width);
      rows.push({
        width: viewport.width,
        status: response?.status(),
        title: await page.title(),
        innerWidth: await page.evaluate(() => window.innerWidth),
        scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
      });
    }
    save("f-x-404", rows);
  } finally {
    await page.context().close();
  }
});

test("상세 화면 머리 줄 actions는 1280 · 768에서 넘치지 않는다(backstop)", async ({ browser, baseURL }) => {
  const page = await loginPage(browser, baseURL, fx.pm);
  try {
    const rows: unknown[] = [];
    for (const viewport of [VIEWPORTS[3], VIEWPORTS[2]]) {
      await page.setViewportSize(viewport);
      await page.goto(`/expenses/${inReviewId}`);
      await expect(page.locator('h1[data-ui="screen-title"]')).toBeVisible();
      await shot(page, "detail-entry", viewport.width);
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
            printLinkTarget: link?.getAttribute("target") ?? null,
            printLinkRel: link?.getAttribute("rel") ?? null,
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          };
        }, viewport.width),
      );
    }
    save("detail-entry", rows);
  } finally {
    await page.context().close();
  }
});
