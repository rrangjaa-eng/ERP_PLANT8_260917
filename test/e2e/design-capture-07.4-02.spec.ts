import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { LEAVE_DOCUMENT_KIND, LeaveValidationError, submitLeave } from "@/domain/leave";
import { setHireDate } from "@/domain/people";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { leaveWeekdayRange } from "./leave-dates";
import { loginPage, makePerson, setupLeaveOrg, type LeaveOrg, type Person } from "./leave-org";

// 07.4-02 디자인 검토 증거: Codex 경로 캡처가 닿지 못하는 상태(F-L1 결재 중 · F-L2 비고 10줄 + 잔여 초과 · F-L3 승인 완료 · F-X 404)를
// 폭마다(375 · 320 · 768 · 1280 + 화면 바는 700도) 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`으로 DESIGN_CAPTURE_DIR에 남긴다.
// print 미디어는 A4(794×1123) PNG `state-<이름>-print.png`와 page.pdf 쪽 수. 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 독립 DOM 감사 몫.
// 이 스펙은 공용 설정(print.company_*)을 바꾸지 않아 desktop 프로젝트에서 돈다. 로딩 경계(loading.tsx)는 느린 응답 없이는 안정적으로 잡히지 않아 찍지 않는다.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.4-02)");

test.describe.configure({ mode: "serial" });

const WIDTHS = [...VIEWPORTS, { width: 700, height: 900 }] as const;
const DAY_MS = 86_400_000;
const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso: string, days: number): string => isoOf(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS);
const isWeekend = (iso: string): boolean => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

let org: LeaveOrg;
let drafterB: Person;
let stranger: Person;
let inProgressId: string;
let overdrawnId: string;
let approvedId: string;

// 휴일이면 서버가 거절한다(LeaveValidationError) — 다음 영업일을 시도한다. 실행일에 따라 깨지지 않게 입사일 뒤 상대 날짜를 쓴다.
async function halfDayFrom(drafter: Person, from: string, note: string): Promise<string> {
  for (let offset = 0; offset < 60; offset += 1) {
    const startDate = addDays(from, offset);
    if (isWeekend(startDate)) continue;
    try {
      return (await submitLeave(drafter.viewer, { kind: "half_day", startDate, endDate: "", half: "am", note })).leaveId;
    } catch (error) {
      if (!(error instanceof LeaveValidationError)) throw error;
    }
  }
  throw new Error(`반차를 제출할 수 있는 날짜가 없습니다: ${from}`);
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const today = seoulToday();
  const year = Number(today.slice(0, 4));
  const yearStart = `${year}-01-01`;
  org = await setupLeaveOrg(today);
  stranger = await makePerson("무관", "role-pm", org.teamId, yearStart);
  // A(입사 3년 전 · 그해 연차 부여 있음): F-L1 결재 중 · F-L3 승인 완료.
  await setHireDate(SYSTEM_VIEWER, org.drafter.viewer.id, `${year - 3}-01-01`);
  inProgressId = (await submitLeave(org.drafter.viewer, { kind: "full_day", half: "", ...leaveWeekdayRange(today, { week: 24, weekdays: 2 }) })).leaveId;
  approvedId = (await submitLeave(org.drafter.viewer, { kind: "full_day", half: "", ...leaveWeekdayRange(today, { week: 26, weekdays: 2 }) })).leaveId;
  for (const approver of [org.teamLead, org.divisionHead, org.mgmt, org.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: approvedId });
    if (!view) throw new Error(`결재 문서를 읽지 못했다: ${approver.name}`);
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
  // B(입사 10일 전 — 그해 부여 없음 · 첫 월차 적립 전): F-L2 반차 · 비고 10줄.
  drafterB = await makePerson("기안B", "role-pm", org.teamId, yearStart);
  const hireB = addDays(today, -10) < yearStart ? yearStart : addDays(today, -10);
  await setHireDate(SYSTEM_VIEWER, drafterB.viewer.id, hireB);
  const note = Array.from({ length: 10 }, (_, index) => `${index + 1}. 행사 준비로 현장 일정이 겹쳐 반차를 신청합니다`).join("\n");
  overdrawnId = await halfDayFrom(drafterB, addDays(hireB, 1), note);
});

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

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

// 같은 viewer가 연 연차 상세 화면의 `잔고` 값 — 종이 잔고와 같은 글자인지 대조한다(없으면 null).
async function screenBalance(page: Page, id: string): Promise<string | null> {
  await page.goto(`/leave/${id}`);
  await expect(page.locator('h1[data-ui="screen-title"]')).toHaveCount(1, { timeout: 20_000 });
  const dd = page.locator("dt", { hasText: /^잔고$/ }).locator("xpath=following-sibling::dd[1]");
  return (await dd.count()) === 0 ? null : normalize(await dd.innerText());
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
      const approval = [...(sheet?.querySelectorAll("section") ?? [])].find((section) => section.querySelector("h2")?.textContent === "결재") ?? null;
      const boxes = approval ? [...approval.querySelectorAll("[data-state]")] : [];
      const subLine = sheet?.querySelector(":scope > p") ?? null;
      const rows = [...(sheet?.querySelectorAll("dl > div") ?? [])];
      const balanceRow = rows.find((row) => row.querySelector("dt")?.textContent === "잔고");
      const balanceDd = balanceRow?.querySelector("dd") ?? null;
      const daysRow = rows.find((row) => row.querySelector("dt")?.textContent === "일수");
      return {
        width: w,
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollX: window.scrollX,
        sheet: boxOf(sheet),
        sheetComputedWidth: sheet ? getComputedStyle(sheet).width : null,
        bar: boxOf(barEl),
        barDisplay: barEl ? getComputedStyle(barEl).display : null,
        buttons: buttons.map((button) => ({ text: button.textContent, box: boxOf(button) })),
        dtList: rows.map((row) => row.querySelector("dt")?.textContent ?? ""),
        hireLabelCount: [...(sheet?.querySelectorAll("dt") ?? [])].filter((dt) => dt.textContent === "입사일").length,
        daysValue: daysRow?.querySelector("dd")?.textContent ?? null,
        balanceValue: balanceDd ? balanceDd.innerText.replace(/\s+/g, " ").trim() : null,
        balanceLineCount: balanceDd ? balanceDd.querySelectorAll("br").length + 1 : 0,
        aside: sheet?.querySelector(":scope > div > span")?.textContent ?? null,
        approvalBoxes: boxes.length,
        approvalStates: boxes.map((el) => el.getAttribute("data-state")),
        statusTextCount: subLine ? subLine.querySelectorAll("span").length - 1 : 0,
        subLine: subLine?.textContent ?? null,
        rowBreaks: rows.map((row) => ({ label: row.querySelector("dt")?.textContent ?? "", breakInside: getComputedStyle(row).breakInside })),
        noteOverflow: (() => {
          const noteDd = rows.find((row) => row.querySelector("dt")?.textContent === "비고")?.querySelector("dd");
          return noteDd ? { scrollWidth: noteDd.scrollWidth, clientWidth: noteDd.clientWidth } : null;
        })(),
        grayscaleStatusNode: subLine ? subLine.querySelectorAll("span").length >= 1 : false,
      };
    },
    width,
  );
}

async function capturePaper(browser: Browser, baseURL: string | undefined, person: Person, name: string, id: string, widths = WIDTHS as readonly { width: number; height: number }[]): Promise<void> {
  const page = await loginPage(browser, baseURL, person);
  try {
    const screen = await screenBalance(page, id);
    const rows: unknown[] = [];
    for (const viewport of widths) {
      await page.setViewportSize(viewport);
      await page.goto(`/print/leaves/${id}`);
      await expect(page.locator("main[data-ready]")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
      await shot(page, name, viewport.width);
      rows.push({ ...(await measurePaper(page, viewport.width)), screenBalance: screen });
    }
    // print 미디어 A4 — PNG와 PDF 쪽 수. 회색조에서도 상태 글자가 DOM에 남는지(backstop)를 같이 잰다.
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: "print" });
    await shot(page, name, "print");
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    await page.evaluate(() => {
      document.documentElement.style.filter = "grayscale(1)";
    });
    const grayscale = await page.evaluate(() => ({
      filter: document.documentElement.style.filter,
      subLine: document.querySelector("article > p")?.textContent ?? null,
    }));
    rows.push({ print: { barDisplay: await page.locator("main > div").first().evaluate((el) => getComputedStyle(el).display), pdfPages: pages, pdfBytes: pdf.length, grayscale } });
    save(name, rows);
  } finally {
    await page.context().close();
  }
}

test("F-L1 결재 중 · 잔고 한 줄 · 폭 4 + 화면 바 700 · print", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  await capturePaper(browser, baseURL, org.teamLead, "f-l1", inProgressId);
});

test("F-L2 비고 10줄 · 반차 · 그해 부여 없음(잔고 여러 줄)", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  await capturePaper(browser, baseURL, org.teamLead, "f-l2-note", overdrawnId);
});

test("F-L3 승인 완료 · 잔고 「—」 · 상태 글자 없음", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  await capturePaper(browser, baseURL, org.teamLead, "f-l3-approved", approvedId);
});

test("F-X 404 · 없는 id · 형식 아닌 id · 남의 연차", async ({ browser, baseURL }) => {
  const page = await loginPage(browser, baseURL, stranger);
  try {
    const rows: unknown[] = [];
    for (const id of ["00000000-0000-4000-8000-000000000000", "abc", inProgressId]) {
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        const response = await page.goto(`/print/leaves/${id}`);
        await expect(page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
        if (id === "abc") await shot(page, "f-x-404", viewport.width);
        rows.push({
          id: id === inProgressId ? "others-leave" : id,
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

test("연차 상세 머리 줄 actions는 1280 · 768에서 넘치지 않는다(backstop)", async ({ browser, baseURL }) => {
  const page = await loginPage(browser, baseURL, org.teamLead);
  try {
    const rows: unknown[] = [];
    for (const viewport of [VIEWPORTS[3], VIEWPORTS[2]]) {
      await page.setViewportSize(viewport);
      await page.goto(`/leave/${inProgressId}`);
      await expect(page.locator('h1[data-ui="screen-title"]')).toHaveCount(1, { timeout: 20_000 });
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
