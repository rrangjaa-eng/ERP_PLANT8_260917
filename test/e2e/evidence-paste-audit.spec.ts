import { appendFileSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecords } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { assignTeam } from "@/domain/org";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { setRecordVisibilityFixture } from "@/test/integration/fixtures/evidence";
import {
  addLotteCard,
  attachRecordFixture,
  clearEvidence,
  createIntakeRole,
  EVIDENCE_COL,
  evidenceCell,
  evidenceRows,
  evidenceTable,
  focusGridCell,
  isServerAction,
  lotteLines,
  precedes,
  registerFile,
  teamIdByName,
} from "./helpers/evidence";
import { waitForHydration } from "./leave-org";

// 06.1-13 Task 4 ② 독립 DOM 감사(실행자가 아닌 별도 에이전트). 판정은 CI=true 프로덕션 빌드의 DOM 실측값으로만 한다(스크린샷 육안 금지).
// 자격(관리자 아님): intake 계급(공개 칸을 편집하는 자격 — 플랜이 정한 자격) · 경영관리(intake + cards.proxy + expenses.payments) ·
// intake인데 금액 노출 없음(내려받기 「같은 노출」) · 권한 없는 사람(role-pm) · 팀장(role-team-lead). 항목마다 JSONL(AUDIT_OUT)에 남기고
// expect.soft로 한 실행에서 전부 잰다.

const WIDTHS = [1280, 1024, 768, 700, 375, 320] as const;
const EDITABLE = (width: number) => width >= 1024;
const OUT = process.env.AUDIT_OUT ?? "test-results/evidence-paste-audit.jsonl";

function record(item: string, width: number | string, role: string, url: string, measured: unknown, expected: unknown, pass: boolean | null): void {
  mkdirSync(dirname(OUT), { recursive: true });
  const line = { item, width, role, url, measured: typeof measured === "string" ? measured : JSON.stringify(measured), expected: typeof expected === "string" ? expected : JSON.stringify(expected), pass };
  appendFileSync(OUT, `${JSON.stringify(line)}\n`);
  if (pass !== null) expect.soft(pass, `${item} @${width} ${role} ${url}: measured ${line.measured} / expected ${line.expected}`).toBe(true);
}

type Who = { viewer: Viewer; email: string; password: string };

async function person(roleId: string, teamName?: string): Promise<Who> {
  const email = `e2e-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "감사 사람", roleId });
  if (teamName) await assignTeam(SYSTEM_VIEWER, { userId, teamId: await teamIdByName(teamName), effectiveFrom: "2020-01-01" });
  return { viewer: { id: userId, roleId }, email, password: tempPassword };
}

async function pageAs(browser: Browser, who: Who, width: number): Promise<Page> {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto("/login");
  const email = page.getByLabel("이메일");
  await waitForHydration(email);
  await email.fill(who.email);
  await page.getByLabel("비밀번호").fill(who.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

async function managerRole(): Promise<string> {
  const roleId = await createIntakeRole();
  for (const menu of ["cards.proxy", "expenses.payments"]) await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action: "write", allowed: true });
  for (const infoItem of ["card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
  return roleId;
}

// intake 쓰기 · evidence 보기 · 증빙 내용만 보임(금액 노출 행 없음 = 거짓).
async function noAmountRole(): Promise<string> {
  const roleId = `role-e2e-evidence-noamt-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 증빙 금액없음 ${roleId.slice(-8)}`, sortOrder: 99, viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "evidence.value", visible: true });
  return roleId;
}

async function displayOrderIds(batchId: string): Promise<string[]> {
  const rows = await db
    .select({ id: evidenceRecords.id })
    .from(evidenceRecords)
    .where(eq(evidenceRecords.batchId, batchId))
    .orderBy(asc(evidenceRecords.format), desc(evidenceRecords.issuedOn), asc(evidenceRecords.id));
  return rows.map((row) => row.id);
}

/** 미공개로 한 번 저장한 줄 n개 — 묶음 id와 목록 차례 id. */
async function privateRows(viewer: Viewer, count: number): Promise<{ batchId: string; ids: string[] }> {
  const card = await addLotteCard({ kind: "shared" });
  const batchId = await registerFile(viewer, lotteFixture(lotteLines(card, count)), `감사_붙여넣기_${randomUUID().slice(0, 6)}.xls`);
  const ids = await displayOrderIds(batchId);
  for (const id of ids) await setRecordVisibilityFixture(id, { visibility: "private" });
  return { batchId, ids };
}

async function pasteAtFocus(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", value);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, text);
}

const dirtyCells = (page: Page) => evidenceTable(page).locator("td[class*='dirtyCell']");
const footer = (page: Page) => evidenceTable(page).locator("tfoot");
const primary = (page: Page) => page.locator('main [data-ui="primary-button"]');
const exportButton = (page: Page) => page.getByRole("button", { name: "파일 받기", exact: true });

async function docOverflow(page: Page): Promise<[number, number]> {
  return page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth] as [number, number]);
}

async function nativeDisabled(scope: Locator): Promise<string[]> {
  return scope.evaluate((root) => [...root.querySelectorAll("[disabled]")].map((el) => `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 20)}`));
}

async function describedText(cell: Locator): Promise<string | null> {
  return cell.evaluate((td) => {
    const ids = (td.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    if (ids.length === 0) return null;
    return ids.map((id) => (document.getElementById(id)?.textContent ?? "").trim()).join(" | ");
  });
}

async function divisionLabel(page: Page): Promise<string> {
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
  await page.keyboard.press("Enter");
  const select = page.getByRole("combobox", { name: "공개", exact: true });
  const labels = await select.locator(":scope > option").allTextContents();
  await page.keyboard.press("Escape");
  await expect(select).toHaveCount(0);
  const label = labels.find((text) => text !== "미공개" && text.endsWith(" 공개"));
  if (!label) throw new Error(`본부 선택지 없음: ${labels.join(", ")}`);
  return label;
}

/** 그 줄 공개 select를 열어 값(`team:{id}` 꼴)과 고른 라벨을 읽고 닫는다. */
async function selectValueAt(page: Page, rowIndex: number): Promise<{ value: string; label: string }> {
  await focusGridCell(evidenceCell(page, rowIndex, EVIDENCE_COL.visibility));
  await page.keyboard.press("Enter");
  const select = page.getByRole("combobox", { name: "공개", exact: true });
  const value = await select.inputValue();
  const label = await select.evaluate((el) => (el instanceof HTMLSelectElement ? (el.selectedOptions[0]?.textContent ?? "") : ""));
  await page.keyboard.press("Escape");
  await expect(select).toHaveCount(0);
  return { value, label };
}

async function settle(page: Page, width: number): Promise<void> {
  // 서버 스냅숏은 편집 폭이라 1024 미만은 수화 뒤 격자가 사라진다 — 그 폭은 격자 0을 기다린다.
  if (EDITABLE(width)) await expect(page.getByRole("grid", { name: "증빙 목록" })).toHaveCount(1);
  else await expect.poll(() => page.getByRole("grid", { name: "증빙 목록" }).count(), { timeout: 10_000 }).toBe(0);
}

async function phoneRowFacts(row: Locator): Promise<unknown> {
  return row.evaluate((tr) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== "none" && st.visibility !== "hidden";
    };
    const tds = [...tr.querySelectorAll(":scope > td")];
    const shown = tds.filter(visible).map((td) => {
      const r = td.getBoundingClientRect();
      const reasonIds = (td.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      const reasons = reasonIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
      return { text: (td.textContent ?? "").trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), reasonVisibleInCell: reasons.some((el) => td.contains(el) && visible(el)) };
    });
    const next = tr.nextElementSibling;
    const folded = next && next.querySelectorAll(":scope > td").length === 1 && !next.querySelector("th") ? (next.textContent ?? "").trim().slice(0, 80) : null;
    return { shownCells: shown.length, shown, foldedRow: folded };
  });
}

test.use({ actionTimeout: 15_000 });

test.beforeEach(async () => {
  await clearEvidence();
});

// ── P 붙여넣기 × 폭 6 · intake 계급 ─────────────────────────────────────────────────────────

test("P 붙여넣기 — dirty = 1차 N · 오류 이유 · 다른 팀 값 · 잠긴 줄 불변 · 요약 조각 · 0 조각 부재 · 전부 거부 · 1024 미만 변화 0 × 폭 6", async ({ browser }) => {
  test.setTimeout(900_000);
  const intake = await person(await createIntakeRole());
  const otherTeamId = await teamIdByName("경영관리팀");
  const role = "intake";
  for (const width of WIDTHS) {
    await clearEvidence();
    const { ids } = await privateRows(intake.viewer, 6);
    const [, , , needsCheck, attached] = ids;
    if (!needsCheck || !attached) throw new Error("증빙 줄 없음");
    await db.update(evidenceRecords).set({ needsCheck: "해외 이용 · 원화 확인" }).where(eq(evidenceRecords.id, needsCheck));
    await attachRecordFixture(attached, intake.viewer.id);
    const page = await pageAs(browser, intake, width);
    const url = "/expenses/evidence?state=all";
    await page.goto(url);
    await expect(evidenceRows(page)).toHaveCount(6);
    await settle(page, width);
    const main = page.locator("main");

    if (!EDITABLE(width)) {
      const comboInTable = await evidenceTable(page).getByRole("combobox").count();
      record("P 1024 미만 — 표 안 공개 편집 select 0", width, role, url, comboInTable, 0, comboInTable === 0);
      const before = await evidenceTable(page).evaluate((t) => t.outerHTML);
      await evidenceCell(page, 0, EVIDENCE_COL.visibility).evaluate((cell) => {
        const transfer = new DataTransfer();
        transfer.setData("text/plain", "기획1팀 공개\n없는값\n기획1팀 공개");
        cell.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(300);
      const after = await evidenceTable(page).evaluate((t) => t.outerHTML);
      record("P 1024 미만 — 붙여넣기 뒤 표 DOM 변화 0(outerHTML 같음)", width, role, url, before === after ? "같음" : `다름(${before.length}→${after.length})`, "같음", before === after);
      const dirty = await dirtyCells(page).count();
      record("P 1024 미만 — dirty 칸 0", width, role, url, dirty, 0, dirty === 0);
      const invalid = await evidenceTable(page).locator('[aria-invalid="true"]').count();
      record("P 1024 미만 — 오류 칸 0", width, role, url, invalid, 0, invalid === 0);
      const prim = await primary(page).count();
      record("P 1024 미만 — 1차 DOM 0(보기 전용)", width, role, url, prim, 0, prim === 0);
      if (width < 700) {
        const facts = await phoneRowFacts(evidenceRows(page).nth(3));
        record("P 폰 — 확인 필요 줄 주 행 칸 · 상태 2행 이유 · 접힌 줄(정보 — Codex 후보 3·4 대조)", width, role, url, facts, "§7-3 853·855", null);
      }
      const disabled = await nativeDisabled(main);
      record("P 네이티브 disabled 0(main)", width, role, url, disabled, [], disabled.length === 0);
      const [sw, cw] = await docOverflow(page);
      record("P 문서 가로 넘침 없음", width, role, url, [sw, cw], "scrollWidth ≤ clientWidth", sw <= cw);
      await page.context().close();
      continue;
    }

    const lockedBefore = [await evidenceCell(page, 3, EVIDENCE_COL.visibility).textContent(), await evidenceCell(page, 4, EVIDENCE_COL.visibility).textContent()];
    const primBefore = await primary(page).count();

    // (가) 한 열 세 줄 · 잠긴 줄 없음 — 0인 조각 부재.
    const division = await divisionLabel(page);
    await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
    await pasteAtFocus(page, `${division}\n미공개\n기획1팀 공개`);
    await expect(evidenceCell(page, 2, EVIDENCE_COL.visibility)).toHaveText("기획1팀 공개");
    const dirtyA = await dirtyCells(page).count();
    const primTextA = ((await primary(page).textContent()) ?? "").replace(/\s+/g, " ").trim();
    const nA = Number(primTextA.match(/공개 범위 저장 (\d+)/)?.[1] ?? "NaN");
    record("P(가) dirty 칸 수 = 1차 글자의 N", width, role, url, { dirty: dirtyA, primary: primTextA }, "dirty === N (=2)", dirtyA === nA && dirtyA === 2);
    const footA = ((await footer(page).textContent()) ?? "").replace(/\s+/g, " ").trim();
    record("P(가) 조각 0인 붙여넣기 — 요약 머리 `붙여넣기 3줄`도 안 보임(composeFooterNotice · 정보)", width, role, url, footA, "붙여넣기 글자 없음", null);
    const zeroA = ["모르는 값", "건너뜀", "버림"].filter((word) => footA.includes(word));
    record("P(가) 0인 조각 부재(모르는 값 · 건너뜀 · 버림)", width, role, url, zeroA, [], zeroA.length === 0);
    const zeroNum = /\b0(칸|개|줄)/.test(footA.replace(/합계 \d+줄/, ""));
    record("P(가) 요약에 0 숫자 조각 없음", width, role, url, footA, "0칸/0개/0줄 없음", !zeroNum);

    // (나) 두 열 붙여넣기 — `오른쪽 n칸 버림` 조각.
    await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
    await pasteAtFocus(page, `${division}\t덤`);
    await expect(footer(page)).toContainText("붙여넣기 1줄");
    const footB = ((await footer(page).textContent()) ?? "").replace(/\s+/g, " ").trim();
    record("P(나) 두 열 붙여넣기 → `오른쪽 1칸 버림`", width, role, url, footB, "오른쪽 1칸 버림 포함", footB.includes("오른쪽 1칸 버림"));

    // (다) 여섯 줄 — 모르는 값 · 없는 팀 · 잠긴 줄 둘 · 다른 팀.
    await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
    await pasteAtFocus(page, `${division}\n없는값\n기획9팀 공개\n${division}\n미공개\n경영관리팀 공개`);
    await expect(evidenceCell(page, 5, EVIDENCE_COL.visibility)).toHaveText("경영관리팀 공개");
    const invalidCells = evidenceTable(page).locator('td[aria-invalid="true"]');
    const invalidCount = await invalidCells.count();
    record("P(다) 오류 셀 수", width, role, url, invalidCount, 2, invalidCount === 2);
    const reason1 = await describedText(evidenceCell(page, 1, EVIDENCE_COL.visibility));
    const reason2 = await describedText(evidenceCell(page, 2, EVIDENCE_COL.visibility));
    record("P(다) 오류 셀 aria-describedby 이유 = `목록에 없는 값 · 없는값`", width, role, url, reason1, "목록에 없는 값 · 없는값", reason1 === "목록에 없는 값 · 없는값");
    record("P(다) 오류 셀 aria-describedby 이유 = `목록에 없는 값 · 기획9팀 공개`", width, role, url, reason2, "목록에 없는 값 · 기획9팀 공개", reason2 === "목록에 없는 값 · 기획9팀 공개");
    const lockedAfter = [await evidenceCell(page, 3, EVIDENCE_COL.visibility).textContent(), await evidenceCell(page, 4, EVIDENCE_COL.visibility).textContent()];
    record("P(다) 잠긴 줄(확인 필요 · 붙음) 칸 값 불변", width, role, url, lockedAfter, lockedBefore, JSON.stringify(lockedAfter) === JSON.stringify(lockedBefore));
    const lockedInvalid = [await evidenceCell(page, 3, EVIDENCE_COL.visibility).getAttribute("aria-invalid"), await evidenceCell(page, 4, EVIDENCE_COL.visibility).getAttribute("aria-invalid")];
    record("P(다) 잠긴 줄은 오류 아님", width, role, url, lockedInvalid, [null, null], lockedInvalid.every((v) => v === null));
    const dirtyC = await dirtyCells(page).count();
    const primTextC = ((await primary(page).textContent()) ?? "").replace(/\s+/g, " ").trim();
    const nC = Number(primTextC.match(/공개 범위 저장 (\d+)/)?.[1] ?? "NaN");
    record("P(다) dirty 칸 수 = 1차 글자의 N", width, role, url, { dirty: dirtyC, primary: primTextC }, "dirty === N (=2)", dirtyC === nC && dirtyC === 2);
    const row2 = { text: ((await evidenceCell(page, 2, EVIDENCE_COL.visibility).textContent()) ?? "").trim(), invalid: await evidenceCell(page, 2, EVIDENCE_COL.visibility).getAttribute("aria-invalid") };
    record("P(다) 앞 붙여넣기로 편집된 칸(2행)에 모르는 값을 다시 붙인 뒤 칸 글자 · 오류(정보 — N 어긋남 원인 확인)", width, role, url, row2, "오류 칸 · 앞 편집은 1차 N에서 빠져야 함", null);
    const footC = ((await footer(page).textContent()) ?? "").replace(/\s+/g, " ").trim();
    const expectC = "붙여넣기 6줄 · 공개 칸 2개 모르는 값 · 잠긴 줄 2칸 건너뜀";
    record("P(다) 합계 행 요약 조각 글자", width, role, url, footC, expectC, footC.includes(expectC));
    record("P(다) `버림` 조각 부재(0)", width, role, url, footC.includes("버림"), false, !footC.includes("버림"));
    const other = await selectValueAt(page, 5);
    record("P(다) 다른 팀 라벨 줄의 select 값 = 그 팀", width, role, url, other, { value: `team:${otherTeamId}`, label: "경영관리팀 공개" }, other.value === `team:${otherTeamId}` && other.label === "경영관리팀 공개");

    // (라) 오류가 남은 저장 — 서버 0 · `오류 2칸 · 전부 거부`.
    const actions: string[] = [];
    page.on("request", (request) => {
      if (isServerAction(request)) actions.push(request.url());
    });
    await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
    await page.keyboard.press("Control+s");
    await expect(footer(page)).toContainText("전부 거부");
    const footD = ((await footer(page).textContent()) ?? "").replace(/\s+/g, " ").trim();
    record("P(라) 오류 남은 저장 → 합계 행 `오류 2칸 · 전부 거부`", width, role, url, footD, "오류 2칸 · 전부 거부 포함", footD.includes("오류 2칸 · 전부 거부"));
    await page.waitForTimeout(500);
    record("P(라) 오류 남은 저장 → 서버 액션 호출 0", width, role, url, actions.length, 0, actions.length === 0);
    const focusedInvalid = await page.evaluate(() => document.activeElement?.closest("td")?.getAttribute("aria-invalid") ?? null);
    record("P(라) 저장 막힘 뒤 초점 = 오류 칸(정보)", width, role, url, focusedInvalid, "true", null);

    const primAfter = await primary(page).count();
    record("P 1차 DOM 수 그대로(붙여넣기 전후)", width, role, url, [primBefore, primAfter], [1, 1], primBefore === 1 && primAfter === 1);
    const disabled = await nativeDisabled(main);
    record("P 네이티브 disabled 0(main)", width, role, url, disabled, [], disabled.length === 0);
    const [sw, cw] = await docOverflow(page);
    record("P 문서 가로 넘침 없음", width, role, url, [sw, cw], "scrollWidth ≤ clientWidth", sw <= cw);
    const tableBox = await evidenceTable(page).evaluate((t) => {
      const scroller = t.parentElement;
      return scroller ? [scroller.scrollWidth, scroller.clientWidth] : null;
    });
    record("P 표 감싼 칸 가로 넘침(정보)", width, role, url, tableBox, "scrollWidth ≤ clientWidth", null);
    await page.context().close();
  }
});

// ── E 필터 줄 `파일 받기` × 폭 6 · intake 계급 ─────────────────────────────────────────────

test("E 필터 줄 — 순서 · 2차 꼴 · 1024 미만 0 · 거르개 select 유지 · 1차 수 · 키보드 내려받기 · 같은 열 × 폭 6", async ({ browser }) => {
  test.setTimeout(900_000);
  const intake = await person(await createIntakeRole());
  const role = "intake";
  for (const width of WIDTHS) {
    await clearEvidence();
    const { batchId, ids } = await privateRows(intake.viewer, 3);
    // 1차가 서게 공개 제안 하나(미공개 → 편집 1)는 화면에서 만든다 — 여기선 batch 필터로 결과 글자(파일 이름)를 세운다.
    const page = await pageAs(browser, intake, width);
    const url = `/expenses/evidence?state=all&batch=${batchId}`;
    await page.goto(url);
    await expect(evidenceRows(page)).toHaveCount(ids.length);
    await settle(page, width);
    const filterSelects = await Promise.all(["상태", "종류", "기간"].map((name) => page.getByRole("combobox", { name, exact: true }).count()));
    record("E 필터 줄 거르개 select 셋 그대로(G9a)", width, role, url, filterSelects, [1, 1, 1], filterSelects.every((n) => n === 1));
    const buttons = await exportButton(page).count();
    const [sw, cw] = await docOverflow(page);
    record("E 문서 가로 넘침 없음", width, role, url, [sw, cw], "scrollWidth ≤ clientWidth", sw <= cw);
    const row = page.locator("[class*='filterRow']").first();
    const rowScroll = await row.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    record("E 필터 줄 가로 넘침 없음", width, role, url, rowScroll, "scrollWidth ≤ clientWidth", (rowScroll[0] ?? 0) <= (rowScroll[1] ?? 0));
    if (!EDITABLE(width)) {
      record("E 1024 미만 `파일 받기` 버튼 0(G9b)", width, role, url, buttons, 0, buttons === 0);
      await page.context().close();
      continue;
    }
    record("E `파일 받기` 버튼 1", width, role, url, buttons, 1, buttons === 1);

    // 1차를 세운다 — 첫 줄 공개 칸을 본부로(편집 1).
    const division = await divisionLabel(page);
    await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
    await pasteAtFocus(page, division);
    await expect(primary(page)).toHaveCount(1);
    const primBefore = await primary(page).count();

    const lastSelect = page.getByRole("combobox", { name: "기간", exact: true });
    const batchText = row.locator("[class*='batchResult']");
    const order = {
      selectsBeforeExport: await precedes(lastSelect, exportButton(page)),
      exportBeforeBatch: (await batchText.count()) === 1 ? await precedes(exportButton(page), batchText) : null,
      batchBeforePrimary: (await batchText.count()) === 1 ? await precedes(batchText, primary(page)) : null,
    };
    record("E 필터 줄 순서 선택 칸 → `파일 받기` → 결과 글자 → 1차", width, role, url, order, { selectsBeforeExport: true, exportBeforeBatch: true, batchBeforePrimary: true }, order.selectsBeforeExport && order.exportBeforeBatch === true && order.batchBeforePrimary === true);
    const geometry = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "파일 받기");
      const prim = document.querySelector('main [data-ui="primary-button"]');
      const filterRow = document.querySelector("[class*='filterRow']");
      const r = (el: Element | null | undefined) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) };
      };
      return { button: r(button), primary: r(prim), row: r(filterRow) };
    });
    const rightEnd = geometry.primary && geometry.row ? Math.abs(geometry.primary.right - geometry.row.right) <= 1 : false;
    record("E 1차 = 필터 줄 오른쪽 끝", width, role, url, geometry, "|primary.right - row.right| ≤ 1", rightEnd);
    const look = await exportButton(page).evaluate((el) => ({ className: el.getAttribute("class") ?? "", dataUi: el.getAttribute("data-ui"), height: Math.round(el.getBoundingClientRect().height) }));
    record("E `파일 받기` = 2차 꼴(class secondary · primary 표식 없음)", width, role, url, look, "className ⊃ secondary · data-ui ≠ primary-button", /secondary/.test(look.className) && look.dataUi !== "primary-button");
    const secondaryRef = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "파일 받기");
      if (!button) return null;
      const s = getComputedStyle(button);
      return { bg: s.backgroundColor, color: s.color, border: s.borderTopColor, radius: s.borderTopLeftRadius, font: s.fontSize };
    });
    record("E `파일 받기` 계산 스타일(정보)", width, role, url, secondaryRef, "2차 버튼 토큰", null);

    // 키보드만 — 기간 select에서 Tab → `파일 받기` → Enter → 내려받기 하나.
    await lastSelect.focus();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => (document.activeElement?.textContent ?? "").trim());
    record("E Tab 한 번 → 초점 `파일 받기`", width, role, url, focused, "파일 받기", focused === "파일 받기");
    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    const downloading = page.waitForEvent("download", { timeout: 20_000 });
    await page.keyboard.press("Enter");
    const download = await downloading.catch(() => null);
    await page.waitForTimeout(1_000);
    record("E 키보드(Tab → Enter) 내려받기 이벤트 하나", width, role, url, downloads, "evidence-records-*.csv 1개", downloads.length === 1 && /^evidence-records-.+\.csv$/.test(downloads[0] ?? ""));
    const primAfter = await primary(page).count();
    record("E 1차 DOM 수 그대로(내려받기 전후)", width, role, url, [primBefore, primAfter], [1, 1], primBefore === 1 && primAfter === 1);
    const pendingKept = ((await primary(page).textContent()) ?? "").replace(/\s+/g, " ").trim();
    record("E 내려받기 뒤 편집 그대로(1차 N)", width, role, url, pendingKept, "공개 범위 저장 1", /공개 범위 저장 1(?!\d)/.test(pendingKept));
    if (download && width === 1280) {
      const body = await readFile((await download.path()) ?? "", "utf8");
      const lines = body.replace(/^﻿/, "").split("\r\n").filter((one) => one !== "");
      const headers = (await evidenceTable(page).locator("thead th").allTextContents()).map((text) => text.trim()).filter((text) => text !== "" && text !== "행동");
      record("E CSV 머리줄 = 목록 열 순서", width, role, url, lines[0], headers.join(","), lines[0] === headers.join(","));
      const domRows = await evidenceRows(page).evaluateAll((trs) =>
        trs.map((tr) => {
          const tds = [...tr.querySelectorAll(":scope > td")];
          const first = (td: Element | undefined) => {
            if (!td) return "";
            const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
            const node = walker.nextNode();
            return (node?.textContent ?? "").trim();
          };
          return [first(tds[0]), first(tds[1]), ...tds.slice(2, 5).map((td) => (td.textContent ?? "").replace(/,/g, "").trim())];
        }),
      );
      const csvRows = lines.slice(1).map((one) => one.split(",").slice(0, 5));
      const sameRows = csvRows.length === domRows.length && csvRows.every((csv, i) => {
        const dom = domRows[i] ?? [];
        return (csv[0] ?? "").endsWith(dom[0] ?? "@") && csv[1] === dom[1] && csv[2] === dom[2] && csv[3] === dom[3] && csv[4] === dom[4];
      });
      record("E CSV 줄(날짜 끝 · 거래처 첫 줄 · 금액 셋) = 화면 줄", width, role, url, { csv: csvRows, dom: domRows }, "같음(CSV 날짜는 연도까지 — 화면은 MM-DD)", sameRows);
      record("E CSV BOM", width, role, url, body.startsWith("﻿"), true, body.startsWith("﻿"));
    }
    const disabled = await nativeDisabled(page.locator("main"));
    record("E 네이티브 disabled 0(main)", width, role, url, disabled, [], disabled.length === 0);
    await page.context().close();
  }
});

// ── 자격별 ───────────────────────────────────────────────────────────────────────────────

test("자격 — 경영관리 1280 붙여넣기 · 내려받기 / 금액 노출 없음 CSV 금액 빈 칸 / 권한 없음 · 팀장 404", async ({ browser }) => {
  test.setTimeout(600_000);
  const manager = await person(await managerRole());
  {
    const { ids } = await privateRows(manager.viewer, 2);
    const page = await pageAs(browser, manager, 1280);
    const url = "/expenses/evidence?state=all";
    await page.goto(url);
    await expect(evidenceRows(page)).toHaveCount(ids.length);
    await settle(page, 1280);
    const division = await divisionLabel(page);
    await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
    await pasteAtFocus(page, `${division}\n기획1팀 공개`);
    await expect(evidenceCell(page, 1, EVIDENCE_COL.visibility)).toHaveText("기획1팀 공개");
    const dirty = await dirtyCells(page).count();
    const prim = ((await primary(page).textContent()) ?? "").replace(/\s+/g, " ").trim();
    record("자격 경영관리 — 붙여넣기 dirty = 1차 N", 1280, "경영관리", url, { dirty, prim }, "2 · 공개 범위 저장 2", dirty === 2 && /공개 범위 저장 2(?!\d)/.test(prim));
    const buttons = await exportButton(page).count();
    record("자격 경영관리 — `파일 받기` 1", 1280, "경영관리", url, buttons, 1, buttons === 1);
    const downloading = page.waitForEvent("download", { timeout: 20_000 });
    await exportButton(page).click();
    const download = await downloading.catch(() => null);
    record("자격 경영관리 — 내려받기 하나", 1280, "경영관리", url, download?.suggestedFilename() ?? null, "evidence-records-*.csv", /^evidence-records-.+\.csv$/.test(download?.suggestedFilename() ?? ""));
    await page.context().close();
  }
  {
    await clearEvidence();
    const noAmount = await person(await noAmountRole());
    const { ids } = await privateRows(noAmount.viewer, 2);
    const page = await pageAs(browser, noAmount, 1280);
    const url = "/expenses/evidence?state=all";
    await page.goto(url);
    await expect(evidenceRows(page)).toHaveCount(ids.length);
    await settle(page, 1280);
    const domAmounts = await evidenceRows(page).evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll(":scope > td")].slice(2, 5).map((td) => (td.textContent ?? "").trim())));
    record("자격 금액 노출 없음 — 화면 금액 칸 글자(정보)", 1280, "intake·금액없음", url, domAmounts, "보이지 않음", null);
    const buttons = await exportButton(page).count();
    record("자격 금액 노출 없음 — `파일 받기` 1(문 = intake 쓰기)", 1280, "intake·금액없음", url, buttons, 1, buttons === 1);
    if (buttons === 1) {
      const downloading = page.waitForEvent("download", { timeout: 20_000 });
      await exportButton(page).click();
      const download = await downloading.catch(() => null);
      const body = download ? await readFile((await download.path()) ?? "", "utf8") : "";
      const csvAmounts = body.replace(/^﻿/, "").split("\r\n").filter((one) => one !== "").slice(1).map((one) => one.split(",").slice(2, 5));
      record("자격 금액 노출 없음 — CSV 금액 셋 빈 칸", 1280, "intake·금액없음", url, csvAmounts, "전부 빈 칸", csvAmounts.length === ids.length && csvAmounts.every((cells) => cells.every((cell) => cell === "")));
    }
    await page.context().close();
  }
  for (const [label, roleId, team] of [["권한 없음(role-pm)", DEFAULT_ROLE_ID, "기획1팀"], ["팀장(role-team-lead)", TEAM_LEAD_ROLE_ID, "기획1팀"]] as const) {
    const who = await person(roleId, team);
    const page = await pageAs(browser, who, 1280);
    const response = await page.goto("/expenses/evidence?state=all");
    const status = response?.status() ?? null;
    record(`자격 ${label} — /expenses/evidence 404`, 1280, label, "/expenses/evidence?state=all", status, 404, status === 404);
    const buttons = await exportButton(page).count();
    record(`자격 ${label} — \`파일 받기\` 0`, 1280, label, "/expenses/evidence?state=all", buttons, 0, buttons === 0);
    await page.context().close();
  }
});

// ── 쇼케이스 표본 × 폭 6 ─────────────────────────────────────────────────────────────────

test("쇼케이스 select 붙여넣기 표본 — 오류 셀 · 이유 · 요약 글자 · dirty · disabled 0 · 넘침 × 폭 6", async ({ browser }) => {
  test.setTimeout(600_000);
  const who = await person(DEFAULT_ROLE_ID);
  const url = "/dev/components";
  for (const width of WIDTHS) {
    const page = await pageAs(browser, who, width);
    await page.goto(url);
    const sample = page.locator('[data-gallery="table-select-paste"]');
    await expect(sample).toHaveCount(1);
    await page.waitForTimeout(500);
    const grid = await sample.locator('[role="grid"]').count();
    record("S 표본 격자(role=grid) 수(정보 — 1024 미만은 표 보기 전용일 수 있음)", width, "role-pm", url, grid, EDITABLE(width) ? 1 : "0 또는 1", null);
    const invalid = sample.locator('[aria-invalid="true"]');
    const invalidCount = await invalid.count();
    record("S 오류 셀 1", width, "role-pm", url, invalidCount, 1, invalidCount === 1);
    const reason = invalidCount === 1 ? await describedText(invalid.first()) : null;
    record("S 오류 셀 aria-describedby 이유 = `목록에 없는 값 · 전체 공개`", width, "role-pm", url, reason, "목록에 없는 값 · 전체 공개", reason === "목록에 없는 값 · 전체 공개");
    const foot = ((await sample.locator("tfoot").textContent()) ?? "").replace(/\s+/g, " ").trim();
    const expected = "붙여넣기 3줄 · 공개 칸 1개 모르는 값 · 잠긴 줄 1칸 건너뜀";
    record("S 합계 행 요약 글자", width, "role-pm", url, foot, expected, foot.includes(expected));
    const dirty = await sample.locator("td[class*='dirtyCell']").count();
    record("S dirty 칸 1", width, "role-pm", url, dirty, 1, dirty === 1);
    const disabled = await nativeDisabled(sample);
    record("S 네이티브 disabled 0(표본)", width, "role-pm", url, disabled, [], disabled.length === 0);
    const sampleScroll = await sample.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    record("S 표본 가로 넘침 없음", width, "role-pm", url, sampleScroll, "scrollWidth ≤ clientWidth", (sampleScroll[0] ?? 0) <= (sampleScroll[1] ?? 0));
    const [sw, cw] = await docOverflow(page);
    record("S 문서 가로 넘침 없음", width, "role-pm", url, [sw, cw], "scrollWidth ≤ clientWidth", sw <= cw);
    if (width < 700) {
      const facts = await phoneRowFacts(sample.locator("tbody tr").filter({ hasText: "표본 나" }).first());
      record("S 폰 — 표본 나 주 행 칸 수 · 오류 이유가 P1 칸 안에 보임 · 접힌 줄(정보 — Codex 후보 1·2 대조)", width, "role-pm", url, facts, "§7-3 853 P1 ≤ 항목+금액+상태/행동 · 855 P1 칸 안 오류 이유는 폰에서 숨김", null);
    }
    const pieceColors = await sample.locator("tfoot").evaluate((el) => [...el.querySelectorAll("*")].filter((n) => n.children.length === 0 && /모르는 값|건너뜀|붙여넣기/.test(n.textContent ?? "")).map((n) => `${(n.textContent ?? "").trim()}:${getComputedStyle(n).color}`));
    record("S 요약 조각 색(정보 — warning/muted 토큰)", width, "role-pm", url, pieceColors, "모르는 값 = warning · 나머지 muted", null);
    await page.context().close();
  }
});
