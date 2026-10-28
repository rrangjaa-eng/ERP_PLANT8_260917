import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCards, corpCardUsages, evidenceImportBatches, evidenceRecords, orgUnits, teams } from "@/db/schema";
import { createTeamExpenseDraft } from "@/domain/expenses";
import { seoulToday } from "@/lib/dates";
import type { Viewer } from "@/domain/viewer";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { createCardUsageFixture, createPmInTeam, insertLinkFixture } from "@/test/integration/fixtures/evidence";
import {
  addLotteCard,
  attachRecordFixture,
  bumpRecordVersion,
  clearEvidence,
  EVIDENCE_COL,
  evidenceCell,
  evidenceRows,
  evidenceTable,
  focusGridCell,
  loginAs,
  loginIntake,
  lotteLines,
  recordIdsOf,
  registerFile,
  teamIdByName,
  uploadFixture,
  uploadFixtures,
  waitForServerAction,
} from "./helpers/evidence";

// 06.1-05 Task 4 ② — 독립 DOM 감사(실행자가 아닌 별도 에이전트). 판정은 CI=true 프로덕션 빌드의 DOM 실측값으로만 한다(스크린샷 육안 금지).
// 자격 둘: 등록 계급(evidence.intake 쓰기 — 이 화면을 쓰는 사람)과 기획 PM · 팀장(권한 없음 — 404가 판정 대상). 「없다」는 그 권한을 가진 자격으로만 잰다.
// 항목마다 실측 · 기대 · 판정을 한 줄씩 JSONL로 남기고(AUDIT_OUT) expect.soft로 한 실행에서 전부 잰다 — 06.1-05-DOM-AUDIT.md의 원자료다.

const WIDTHS = [1280, 1024, 768, 700, 375, 320] as const;
const OUT = process.env.AUDIT_OUT ?? "test-results/evidence-list-audit.jsonl";
const LONG_MERCHANT = "가맹점".repeat(20);
const LONG_FILE = `${"가".repeat(76)}.xls`;
const KIND_OF_WORD: Record<string, string> = {
  미공개: "accent",
  "확인 필요": "warning",
  "카드 미등록": "danger",
  붙음: "success",
  "팀 공개": "muted",
  "본부 공개": "muted",
  보관됨: "muted",
};

type Verdict = boolean | null;
function record(item: string, width: number | string, role: string, url: string, measured: unknown, expected: unknown, pass: Verdict): void {
  mkdirSync(dirname(OUT), { recursive: true });
  const line = { item, width, role, url, measured: typeof measured === "string" ? measured : JSON.stringify(measured), expected: typeof expected === "string" ? expected : JSON.stringify(expected), pass };
  appendFileSync(OUT, `${JSON.stringify(line)}\n`);
  if (pass !== null) expect.soft(pass, `${item} @${width} ${role} ${url}: measured ${line.measured} / expected ${line.expected}`).toBe(true);
}

// ── 시험 자료 ────────────────────────────────────────────────────────────────
// 롯데 4줄(실제 등록 경로 — 팀 카드 2(60자 가맹점 하나) · 확인 필요 1 · 카드 미등록 1) + 홈택스 6줄(기록 직접 — 미공개 · 팀 공개 · 본부 공개 · 음수 · 붙음 · 보관).
type Rich = { lotteBatch: string; hometaxBatch: string; lotte: string[]; hometax: string[]; team1: string; division: { id: string; name: string } };

async function insertHometax(viewer: Viewer): Promise<{ batchId: string; ids: string[] }> {
  const batchId = randomUUID();
  const today = seoulToday();
  await db.insert(evidenceImportBatches).values({
    id: batchId,
    format: "hometax-tax-invoice",
    originalName: "홈택스_감사.xls",
    fileSha256: createHash("sha256").update(batchId).digest("hex"),
    rowCount: 6,
    registeredCount: 6,
    skippedDuplicateCount: 0,
    uploadedBy: viewer.id,
  });
  const ids = Array.from({ length: 6 }, () => randomUUID());
  await db.insert(evidenceRecords).values(
    ids.map((id, index) => ({
      id,
      batchId,
      format: "hometax-tax-invoice",
      evidenceType: "tax_invoice",
      approvalNo: `${today.replaceAll("-", "")}-4100000${index}-0000000${index}`,
      dedupeKey: `audit:${randomUUID()}`,
      issuedOn: today,
      supplyKrw: 100_000 * (index + 1),
      vatKrw: 10_000 * (index + 1),
      totalKrw: 110_000 * (index + 1),
      nameOnDocument: `감사공급사${index + 1}`,
      businessNoDigits: "1234567890",
      createdBy: viewer.id,
    })),
  );
  return { batchId, ids };
}

async function seedRich(viewer: Viewer): Promise<Rich> {
  const team1 = await teamIdByName("기획1팀");
  const teamCard = await addLotteCard({ kind: "team", teamId: team1 });
  const sharedCard = await addLotteCard({ kind: "shared" });
  const lotteBatch = await registerFile(
    viewer,
    lotteFixture([...lotteLines(teamCard, 1, { 가맹점명: LONG_MERCHANT }), ...lotteLines(teamCard, 1, {}, 2), ...lotteLines(sharedCard, 1, { 현지거래금액: "12.50" }, 3), ...lotteLines("0999", 1, {}, 4)]),
    "롯데_감사.xls",
  );
  // 승인번호 = 카드 끝 4자리 + 순번(lotteLines) — 정렬 순서는 카드 번호에 따라 달라 이름으로 고른다. [60자 · 팀 카드 일반 · 확인 필요 · 카드 미등록]
  const rows = await db.select({ id: evidenceRecords.id, approvalNo: evidenceRecords.approvalNo }).from(evidenceRecords).where(eq(evidenceRecords.batchId, lotteBatch));
  const idOf = (approvalNo: string) => rows.find((row) => row.approvalNo?.trim() === approvalNo)?.id ?? "";
  const lotte = [idOf(`${teamCard}0001`), idOf(`${teamCard}0002`), idOf(`${sharedCard}0003`), idOf("09990004")];
  if (lotte.some((id) => id === "") || (await recordIdsOf(lotteBatch)).length !== 4) throw new Error(`롯데 줄 id 매칭 실패 ${JSON.stringify(rows)}`);
  const { batchId: hometaxBatch, ids: hometax } = await insertHometax(viewer);
  const [division] = await db.select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits).where(eq(orgUnits.name, "기획본부"));
  if (!division) throw new Error("기획본부 없음");
  const now = new Date();
  await db.update(evidenceRecords).set({ visibility: "team", visibleTeamId: team1, visibilitySavedAt: now }).where(eq(evidenceRecords.id, hometax[1]!));
  await db.update(evidenceRecords).set({ visibility: "division", visibleOrgUnitId: division.id, visibilitySavedAt: now }).where(eq(evidenceRecords.id, hometax[2]!));
  await db.update(evidenceRecords).set({ supplyKrw: -300_000, vatKrw: -30_000, totalKrw: -330_000, originalApprovalNo: "20260101-41000000-00000099" }).where(eq(evidenceRecords.id, hometax[3]!));
  await attachRecordFixture(hometax[4]!, viewer.id);
  await db.update(evidenceRecords).set({ archivedAt: now, archivedBy: viewer.id }).where(eq(evidenceRecords.id, hometax[5]!));
  return { lotteBatch, hometaxBatch, lotte, hometax, team1, division };
}

// ── 실측 도우미 ──────────────────────────────────────────────────────────────

async function goto(page: Page, width: number, url: string): Promise<number | undefined> {
  await page.setViewportSize({ width, height: 900 });
  const response = await page.goto(url);
  await page.waitForLoadState("networkidle");
  return response?.status();
}

async function docOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
}

// 토큰 식(`var(--x)`)을 같은 부모 안의 같은 태그 탐침에 걸어 그 자리의 computed 값을 얻고, 실제 요소 computed 값과 견준다.
async function vsTokens(target: Locator, pairs: readonly (readonly [string, string])[]): Promise<{ prop: string; expr: string; got: string; exp: string }[]> {
  return target.evaluate((element, list) => {
    const parent = element.parentElement ?? document.body;
    return list.map(([prop, expr]) => {
      const probe = document.createElement(element.tagName);
      probe.style.setProperty(prop, expr);
      probe.style.visibility = "hidden";
      parent.appendChild(probe);
      const exp = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return { prop, expr, got: getComputedStyle(element).getPropertyValue(prop), exp };
    });
  }, pairs);
}

async function literal(target: Locator, props: readonly string[]): Promise<Record<string, string>> {
  return target.evaluate((element, list) => Object.fromEntries(list.map((prop) => [prop, getComputedStyle(element).getPropertyValue(prop)])), props);
}

function moduleClass(page: Page, name: string): Locator {
  // 이름 토큰 끝이 정확히 맞아야 한다(`restoreAction`이 `restoreActions`에 걸리지 않게).
  return page.locator(`[class*="evidence-table-module__"][class$="__${name}"], [class*="evidence-table-module__"][class*="__${name} "]`);
}

async function tokenProbe(page: Page, prop: string, expr: string): Promise<string> {
  return page.evaluate(
    ([p, e]) => {
      const probe = document.createElement("span");
      probe.style.setProperty(p, e);
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).getPropertyValue(p);
      probe.remove();
      return value;
    },
    [prop, expr] as const,
  );
}

async function classAudit(page: Page, name: string, width: number, url: string, tokenPairs: readonly (readonly [string, string])[], literals: Record<string, string>): Promise<void> {
  const target = moduleClass(page, name).first();
  const count = await moduleClass(page, name).count();
  if (count === 0) {
    record(`클래스 .${name} 존재`, width, "intake", url, "DOM 0", "≥1", false);
    return;
  }
  for (const row of await vsTokens(target, tokenPairs)) record(`클래스 .${name} ${row.prop}`, width, "intake", url, row.got, `${row.expr} = ${row.exp}`, row.got === row.exp);
  const got = await literal(target, Object.keys(literals));
  for (const [prop, value] of Object.entries(literals)) record(`클래스 .${name} ${prop}`, width, "intake", url, got[prop], value, got[prop] === value);
}

// 한 요소 안 글자가 몇 줄로 그려졌나(Range 사각형의 서로 다른 top 수).
async function textLines(target: Locator): Promise<number> {
  return target.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)));
    return tops.size;
  });
}

function filterSelect(page: Page, name: "상태" | "종류" | "기간"): Locator {
  return page.getByRole("combobox", { name, exact: true });
}

function primaryButtons(page: Page): Locator {
  return page.locator('main button[class*="Button-module__"][class*="__primary"]');
}

function hintRow(page: Page): Locator {
  return page.locator('main div[class*="__hintRow"]');
}

function dropZone(page: Page): Locator {
  return page.locator('[data-variant="bulk-import"]');
}

function resultRow(page: Page): Locator {
  return page.locator('[data-variant="bulk-import"] li[data-state="result"]');
}

function rowActionButtons(page: Page): Locator {
  return evidenceTable(page).locator("tbody").getByRole("button", { name: /^(보관|되살리기)$/ });
}

async function precedesAll(locators: readonly (readonly [string, Locator])[]): Promise<{ order: string[]; ok: boolean; missing: string[] }> {
  const present: [string, Locator][] = [];
  const missing: string[] = [];
  for (const [label, locator] of locators) {
    if ((await locator.count()) > 0) present.push([label, locator.first()]);
    else missing.push(label);
  }
  let ok = missing.length === 0;
  for (let index = 0; index + 1 < present.length; index++) {
    const [, a] = present[index]!;
    const [, b] = present[index + 1]!;
    const handle = await b.elementHandle();
    const before = await a.evaluate((first, second) => Boolean(second && first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING), handle);
    if (!before) ok = false;
  }
  return { order: present.map(([label]) => label), ok, missing };
}

function krw(text: string): number {
  const digits = text.replace(/[^\d-]/g, "");
  return digits === "" || digits === "-" ? 0 : Number(digits);
}

test.beforeEach(async () => {
  await clearEvidence();
});

// ── 1. 등록 계급 × 폭 × 경로 — 정적 DOM ─────────────────────────────────────
test("① intake × 6폭 × 기본 · state=all · state=all&batch — 머리글 · 1차 · aria-disabled · 열 숨김 · 보기 전용 · 폰 필터 · 금액 · 상태 색 · 넘침 · 행 행동 · 거래처 · 순서 · 합계 · 모듈 클래스", async ({ page }) => {
  test.setTimeout(900_000);
  const viewer = await loginIntake(page, { expenses: "write" }, await teamIdByName("기획1팀"));
  const rich = await seedRich(viewer);
  const urls = ["/expenses/evidence", "/expenses/evidence?state=all", `/expenses/evidence?state=all&batch=${rich.lotteBatch}`] as const;
  const role = "intake";

  for (const width of WIDTHS) {
    for (const url of urls) {
      const status = await goto(page, width, url);
      record("응답 코드", width, role, url, status, 200, status === 200);
      await expect(evidenceTable(page)).toBeVisible();
      const editable = width >= 1024;
      const phone = width < 700;

      // 넘침(T9)
      const overflow = await docOverflow(page);
      record("문서 scrollWidth <= clientWidth", width, role, url, `${overflow.scrollWidth}/${overflow.clientWidth}`, "scrollWidth <= clientWidth", overflow.scrollWidth <= overflow.clientWidth);

      // 머리글 색(편집 표 — 1024 이상)
      const th = evidenceTable(page).locator("thead th").first();
      const head = await th.evaluate((element) => {
        let node: Element | null = element;
        let bg = "rgba(0, 0, 0, 0)";
        while (node && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
          bg = getComputedStyle(node).backgroundColor;
          node = node.parentElement;
        }
        return { bg, color: getComputedStyle(element).color };
      });
      if (editable) {
        record("머리글 background-color", width, role, url, head.bg, "rgb(228, 234, 231)", head.bg === "rgb(228, 234, 231)");
        record("머리글 color", width, role, url, head.color, "rgb(0, 33, 28)", head.color === "rgb(0, 33, 28)");
      } else {
        const surfaceHead = await tokenProbe(page, "background-color", "var(--surface-head)");
        record("머리글 background-color(보기 전용 표 — 참고)", width, role, url, head.bg, `--surface-head = ${surfaceHead}`, null);
      }

      // 1차 수
      const primaries = await primaryButtons(page).count();
      record("1차 버튼 DOM 수", width, role, url, primaries, editable ? 1 : 0, primaries === (editable ? 1 : 0));

      // aria-disabled → aria-describedby 대상 글자
      const disabledReport = await page.locator("main [aria-disabled='true']").evaluateAll((elements) =>
        elements.map((element) => {
          const ids = (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
          const text = ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
          return { tag: element.tagName, text: element.textContent?.trim().slice(0, 20), reason: text };
        }),
      );
      const missingReason = disabledReport.filter((entry) => entry.reason === "");
      record("aria-disabled 요소의 aria-describedby 이유 글자", width, role, url, `${disabledReport.length}개 · 이유 없음 ${missingReason.length} · ${JSON.stringify(disabledReport.map((entry) => entry.reason)).slice(0, 160)}`, "이유 없음 0", missingReason.length === 0);
      const nativeDisabled = await page.locator("main [disabled]").count();
      record("네이티브 disabled 수", width, role, url, nativeDisabled, 0, nativeDisabled === 0);

      // 공급가 · 세액 열
      for (const name of ["공급가", "세액"] as const) {
        const header = evidenceTable(page).locator("thead th", { hasText: new RegExp(`^${name}$`) });
        const display = (await header.count()) > 0 ? await header.first().evaluate((element) => getComputedStyle(element).display) : "DOM 0";
        const expectHidden = width < 1280;
        record(`${name} 열 머리글 display`, width, role, url, display, expectHidden ? "none(DOM 남음)" : "보임(none 아님)", expectHidden ? display === "none" : display !== "none" && display !== "DOM 0");
      }

      // 보기 전용(1024 미만) · 편집 폭 요소
      const tableSelects = await evidenceTable(page).locator("select").count();
      const filterSelects = await page.locator("main select[id^='evidence-filter-']").count();
      const hints = (await hintRow(page).count()) > 0 ? await hintRow(page).first().isVisible() : false;
      const drops = await dropZone(page).count();
      const actions = await rowActionButtons(page).count();
      record("표 안 select 수", width, role, url, tableSelects, 0, tableSelects === 0);
      record("필터 줄 select 수", width, role, url, filterSelects, 3, filterSelects === 3);
      record("힌트 줄 보임", width, role, url, hints, editable, hints === editable);
      record("끌어 놓기 영역 DOM 수", width, role, url, drops, editable ? 1 : 0, drops === (editable ? 1 : 0));
      if (editable) record("행 행동(보관 · 되살리기) 수", width, role, url, actions, "≥1", actions >= 1);
      else record("행 행동(보관 · 되살리기) 수", width, role, url, actions, 0, actions === 0);
      const grid = await page.getByRole("grid", { name: "증빙 목록" }).count();
      record("격자(role=grid) 수", width, role, url, grid, editable ? 1 : 0, grid === (editable ? 1 : 0));

      // 필터 select 높이 · 폰 첫 줄
      const boxes = await Promise.all((["상태", "종류", "기간"] as const).map((name) => filterSelect(page, name).boundingBox()));
      const heights = boxes.map((box) => Math.round((box?.height ?? 0) * 10) / 10);
      if (phone) {
        // SYSTEM §3 터치 목표 — 폼 입력은 40(시트 · 고정 줄 밖). 플랜 문구 「≥ 44」는 SYSTEM에 없다(디자인 검토 P2 · 사용자 카드로 정정).
        record("폰 필터 select 높이 = 40 (SYSTEM §3 폼 입력)", width, role, url, heights, "각 40", heights.every((height) => height === 40));
        const tops = await page.locator("main select[id^='evidence-filter-']").evaluateAll((elements) => elements.map((element) => (element.parentElement as HTMLElement).offsetTop));
        const alone = tops[0] !== undefined && tops[1] !== undefined && tops[2] !== undefined && tops[1] > tops[0] && tops[2] > tops[0];
        record("폰 필터 줄 첫 줄 = 상태 select 홀로(offsetTop)", width, role, url, tops, "상태 < 종류 · 기간", alone);
      } else {
        record("필터 select 높이(참고)", width, role, url, heights, "—", null);
      }

      // 금액 칸 — tabular-nums · 우측 정렬
      const amountCols = width >= 1280 ? [EVIDENCE_COL.supply, EVIDENCE_COL.vat, EVIDENCE_COL.total] : [EVIDENCE_COL.total];
      const amountStyles = await evidenceRows(page).evaluateAll(
        (rows, cols) =>
          rows.flatMap((row) =>
            cols.map((col) => {
              const td = row.querySelectorAll(":scope > td")[col] as HTMLElement | undefined;
              if (!td) return { ok: false, align: "없음", fvn: "없음" };
              const inner = td.querySelector<HTMLElement>("*");
              const fvn = [getComputedStyle(td).fontVariantNumeric, inner ? getComputedStyle(inner).fontVariantNumeric : ""].join("|");
              const align = getComputedStyle(td).textAlign;
              return { ok: fvn.includes("tabular-nums") && align === "right", align, fvn };
            }),
          ),
        amountCols,
      );
      const badAmount = amountStyles.filter((entry) => !entry.ok);
      record("금액 칸 tabular-nums · text-align right", width, role, url, `${amountStyles.length}칸 · 불일치 ${badAmount.length}${badAmount[0] ? ` (${JSON.stringify(badAmount[0])})` : ""}`, "불일치 0", amountStyles.length > 0 && badAmount.length === 0);

      // 상태 글자 색 = kind 토큰
      const tokenColors: Record<string, string> = {};
      for (const kind of ["danger", "warning", "accent", "success", "muted"]) tokenColors[kind] = await tokenProbe(page, "color", `var(--status-${kind})`);
      const statuses = await evidenceRows(page).evaluateAll((rows, col) =>
        rows.map((row) => {
          const td = row.querySelectorAll(":scope > td")[col] as HTMLElement | undefined;
          const tag = td?.querySelector("span") as HTMLElement | null;
          return { word: tag?.textContent?.trim() ?? "", color: tag ? getComputedStyle(tag).color : "" };
        }),
      EVIDENCE_COL.status);
      for (const status of statuses) {
        const kind = KIND_OF_WORD[status.word];
        record(`상태 글자 색 「${status.word}」`, width, role, url, status.color, kind ? `--status-${kind} = ${tokenColors[kind]}` : "낱말 표에 없음", kind !== undefined && status.color === tokenColors[kind]);
      }

      // 행 행동 한 줄
      if (editable) {
        const actionCells = evidenceRows(page).locator(":scope > td").filter({ has: page.getByRole("button", { name: /^(보관|되살리기)$/ }) });
        const cellCount = await actionCells.count();
        let multiLine = 0;
        for (let index = 0; index < cellCount; index++) {
          const cell = actionCells.nth(index);
          const tops = await cell.locator("button, a").evaluateAll((elements) => elements.map((element) => (element as HTMLElement).offsetTop));
          // 글자 span만 잰다 — 버튼 안 빈 pendingSlot 칸(…자리)은 글자 줄이 아니다.
          const lines = await textLines(cell.locator("button > span").first());
          if (new Set(tops).size > 1 || lines > 1) multiLine++;
        }
        record("행 행동 한 줄(offsetTop 같음 · 글자 1줄)", width, role, url, `${cellCount}칸 · 여러 줄 ${multiLine}`, "칸 ≥ 1 · 여러 줄 0", cellCount >= 1 && multiLine === 0);
      }

      // 60자 거래처 — 한 줄 · title 전문 · 높이 = 짧은 줄
      const long = evidenceTable(page).locator(`[title="${LONG_MERCHANT}"]`);
      if ((await long.count()) > 0) {
        const short = evidenceTable(page).locator('[title="가맹점가"]').first();
        const [longBox, shortBox] = await Promise.all([long.first().boundingBox(), short.boundingBox()]);
        const longLines = await textLines(long.first());
        const truncated = await long.first().evaluate((element) => element.scrollWidth > element.clientWidth);
        record("60자 거래처 글자 줄 수", width, role, url, longLines, 1, longLines === 1);
        record("60자 거래처 높이 = 짧은 거래처 높이", width, role, url, `${longBox?.height}/${shortBox?.height}`, "같음", longBox?.height === shortBox?.height);
        record("60자 거래처 title 전문 · 말줄임", width, role, url, `title ${LONG_MERCHANT.length}자 · scrollWidth>clientWidth ${truncated}`, "title 60자 · 말줄임", truncated);
      } else if (!url.includes("state=all") || url.includes("batch")) {
        record("60자 거래처 줄 존재", width, role, url, "DOM 0", "1", url === "/expenses/evidence" ? null : false);
      }

      // 페이지 줄 꺾쇠 글리프 · 순서
      const nav = page.getByRole("navigation", { name: "증빙 페이지" });
      const navText = (await nav.count()) > 0 ? await nav.innerText() : "";
      record("페이지 줄 꺾쇠 글리프 수", width, role, url, (navText.match(/[‹›«»<>]/g) ?? []).length, 0, !/[‹›«»<>]/.test(navText));
      const order = await precedesAll([
        ...(editable ? ([["S1 영역", dropZone(page)]] as const) : []),
        ["필터 상태", filterSelect(page, "상태")],
        ["필터 기간", filterSelect(page, "기간")],
        ...(url.includes("batch") ? ([["batch 표시", page.getByRole("link", { name: "묶음 지우기" })]] as const) : []),
        ...(editable ? ([["1차", primaryButtons(page)]] as const) : []),
        ["머리글", evidenceTable(page).locator("thead")],
        ["그룹 줄", evidenceTable(page).locator("tbody tr[class*='groupRow']")],
        ["행", evidenceRows(page)],
        ["합계 행", evidenceTable(page).locator("tfoot")],
        ...((await nav.count()) > 0 ? ([["페이지 줄", nav]] as const) : []),
        ...(editable ? ([["힌트 줄", hintRow(page)]] as const) : []),
      ]);
      record("요소 순서(compareDocumentPosition)", width, role, url, `${order.order.join(" → ")}${order.missing.length ? ` · 없음: ${order.missing.join(",")}` : ""}`, "S1 → 필터 → (batch) → 1차 → 머리글 → 그룹 → 행 → 합계 → (페이지) → 힌트", order.ok);

      // 합계 행 = 보이는 줄 금액 합(감사가 더한다 — 화면이 아니라) · 그룹 줄 글자 · 면
      const footText = (await evidenceTable(page).locator("tfoot").innerText()).replace(/\s+/g, " ");
      const rowCount = await evidenceRows(page).count();
      const totals = await evidenceRows(page).evaluateAll((rows, col) => rows.map((row) => (row.querySelectorAll(":scope > td")[col] as HTMLElement | undefined)?.textContent ?? ""), EVIDENCE_COL.total);
      const sum = totals.reduce((acc, text) => acc + krw(text), 0);
      if (phone) {
        // SYSTEM §7-3 폰 — 합계 행의 부제(줄 수 · 공급가 · 세액)는 숨기고 합계 금액만 한 줄(디자인 검토 H3).
        const phoneFoot = /^합계 ([\d,-]+)$/.exec(footText.trim());
        const footLines = await evidenceTable(page).locator("tfoot td").evaluate((cell) => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
        });
        record("합계 행 폰 = 한 줄 `합계 {금액}`(부제 숨김)", width, role, url, `${footText.trim()} · ${footLines}줄`, "합계 {금액} · 1줄", phoneFoot !== null && footLines === 1);
        record("합계 행 합계 = 행 합계 칸 합(감사 계산)", width, role, url, `${phoneFoot?.[1]} / ${sum.toLocaleString("en-US")}`, "같음", phoneFoot !== null && krw(phoneFoot[1]!) === sum);
      } else {
        const footMatch = /합계 (\d+)줄 · 공급가 ([\d,-]+) · 세액 ([\d,-]+) · 합계 ([\d,-]+)/.exec(footText);
        record("합계 행 줄 수 = 표 행 수", width, role, url, `${footMatch?.[1]}/${rowCount}`, "같음", footMatch !== null && Number(footMatch[1]) === rowCount);
        record("합계 행 합계 = 행 합계 칸 합(감사 계산)", width, role, url, `${footMatch?.[4]} / ${sum.toLocaleString("en-US")}`, "같음", footMatch !== null && krw(footMatch[4]!) === sum);
      }
      const groupRows = evidenceTable(page).locator("tbody tr[class*='groupRow']");
      const groupTexts = await groupRows.allInnerTexts();
      const groupBg = (await groupRows.count()) > 0 ? await groupRows.first().evaluate((element) => getComputedStyle(element).backgroundColor) : "DOM 0";
      const surfaceGroup = await tokenProbe(page, "background-color", "var(--surface-group)");
      record("그룹 줄 글자 `{서식} · {건수}`", width, role, url, groupTexts.map((text) => text.trim()), "/^.+ · \\d+$/", groupTexts.length > 0 && groupTexts.every((text) => /^.+ · \d+$/.test(text.trim())));
      record("그룹 줄 면 = --surface-group", width, role, url, groupBg, surfaceGroup, groupBg === surfaceGroup);

      // batch 보기
      if (url.includes("batch")) {
        const clear = page.getByRole("link", { name: "묶음 지우기" });
        const href = (await clear.count()) > 0 ? await clear.getAttribute("href") : null;
        const nameShown = await page.locator("main").getByText("롯데_감사.xls", { exact: true }).count();
        record("batch 표시 파일 이름 + 묶음 지우기 href", width, role, url, `이름 ${nameShown} · href ${href}`, "이름 1 · href=/expenses/evidence?state=all", nameShown === 1 && href === "/expenses/evidence?state=all");
        record("batch 보기 줄 수", width, role, url, rowCount, 4, rowCount === 4);
      }
      if (url === "/expenses/evidence?state=all") record("state=all 줄 수(보관 제외)", width, role, url, rowCount, 9, rowCount === 9);

      // 상태 2행(1280 · state=all에서만 — 낱말 · 2행 대조)
      if (width === 1280 && url === "/expenses/evidence?state=all") {
        const details = await evidenceRows(page).evaluateAll((rows, col) => rows.map((row) => (row.querySelectorAll(":scope > td")[col] as HTMLElement | undefined)?.innerText.replace(/\s+/g, " ").trim() ?? ""), EVIDENCE_COL.status);
        record("상태 칸 글자(낱말 + 2행) 전부", width, role, url, details, "보관됨 없음 · 팀 공개 2행 팀 · 본부 공개 2행 `기획본부 공개` · 음수 2행 `음수 · 원거래 문서에 붙이기`", null);
        record("팀 공개 2행 = 팀 이름", width, role, url, details.find((text) => text.startsWith("팀 공개")) ?? "없음", "팀 공개 기획1팀", details.some((text) => text === "팀 공개 기획1팀"));
        record("본부 공개 2행 = `기획본부 공개`", width, role, url, details.find((text) => text.startsWith("본부 공개")) ?? "없음", "본부 공개 기획본부 공개", details.some((text) => text === "본부 공개 기획본부 공개"));
        record("음수 줄 2행", width, role, url, details.filter((text) => text.includes("음수")), "미공개 음수 · 원거래 문서에 붙이기", details.some((text) => text === "미공개 음수 · 원거래 문서에 붙이기"));
        record("보관 줄 state=all에 없음", width, role, url, details.filter((text) => text.startsWith("보관됨")).length, 0, details.every((text) => !text.startsWith("보관됨")));
        const negativeVis = await evidenceRows(page).evaluateAll((rows, cols) => rows.filter((row) => row.textContent?.includes("음수")).map((row) => (row.querySelectorAll(":scope > td")[cols] as HTMLElement).innerText.trim()), EVIDENCE_COL.visibility);
        record("음수 줄 공개 칸 `—`", width, role, url, negativeVis, ["—"], negativeVis.length === 1 && negativeVis[0] === "—");
      }

      // 모듈 클래스(이 화면이 더한 열둘 중 정적으로 서는 여섯)
      if (url === "/expenses/evidence?state=all") {
        await classAudit(page, "filterRow", width, url, [["column-gap", "var(--s-4)"], ["margin-top", "var(--s-4)"], ["margin-bottom", "var(--s-3)"]], { display: "flex", "justify-content": "space-between", "align-items": "flex-end" });
        await classAudit(page, "filters", width, url, [["row-gap", "var(--s-2)"], ["column-gap", "var(--s-3)"]], { display: "flex", "flex-wrap": "wrap", "min-width": "0px" });
        if (editable) await classAudit(page, "primaryAction", width, url, [], { "white-space": "nowrap", "flex-grow": "0", "flex-shrink": "0" });
        await classAudit(page, "counterpartyCell", width, url, [["max-width", "16em"]], { display: "grid" });
        await classAudit(page, "counterpartyText", width, url, [], { overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" });
        await classAudit(page, "footerCell", width, url, [["border-top-color", "var(--border-strong)"], ["color", "var(--text-strong)"], ["font-weight", "var(--fw-bold)"], ["padding-top", "var(--cell-pad-y)"], ["padding-left", "var(--cell-pad-x)"]], { "border-top-style": "solid", "border-top-width": "1px" });
      }
    }
  }
});

// ── 2. 결과 행 · 조각 · 거절 행(편집 폭) ─────────────────────────────────────
test("② intake 1280 · 1024 — 결과 행 조각 · 0 조각 없음 · 80자 파일 이름 넘침 · 등록 n 링크 줄 수 · 확인 필요 n · 거절 행 면", async ({ page }) => {
  test.setTimeout(300_000);
  await loginIntake(page);
  const teamCard = await addLotteCard({ kind: "team", teamId: await teamIdByName("기획1팀") });
  const sharedCard = await addLotteCard({ kind: "shared" });
  const role = "intake";
  for (const width of [1280, 1024] as const) {
    await clearEvidence();
    const url = "/expenses/evidence";
    await goto(page, width, url);
    const start = width === 1280 ? 1 : 11;
    await uploadFixture(page, LONG_FILE, lotteFixture([...lotteLines(teamCard, 2, {}, start), ...lotteLines(sharedCard, 1, { 현지거래금액: "12.50" }, start + 2), ...lotteLines("0998", 1, {}, start + 3)]));
    await expect(resultRow(page)).toBeVisible({ timeout: 30_000 });
    const text = (await resultRow(page).innerText()).replace(/\s+/g, " ");
    record("결과 행 글자", width, role, url, text, "`{파일} · 롯데카드 매입내역` · 등록 4 · 확인 필요 1 · 카드 미등록 1", text.includes("롯데카드 매입내역") && /등록 4/.test(text) && /확인 필요 1/.test(text) && /카드 미등록 1/.test(text));
    const zeroPieces = (text.match(/(등록|확인 필요|이미 등록|상쇄|카드 미등록|거래처 생성|되살림|이름 다름) 0/g) ?? []).length;
    record("0인 조각 글자 수", width, role, url, zeroPieces, 0, zeroPieces === 0);
    const resultOverflow = await resultRow(page).evaluate((element) => ({ sw: element.scrollWidth, cw: element.clientWidth }));
    const doc = await docOverflow(page);
    const titleLines = await textLines(resultRow(page).locator("span").first());
    record("80자 파일 이름 결과 행 넘침", width, role, url, `행 ${resultOverflow.sw}/${resultOverflow.cw} · 문서 ${doc.scrollWidth}/${doc.clientWidth} · 제목 ${titleLines}줄`, "scrollWidth <= clientWidth(행 · 문서)", resultOverflow.sw <= resultOverflow.cw && doc.scrollWidth <= doc.clientWidth);
    const pieceKinds = await resultRow(page).locator("[data-kind]").evaluateAll((elements) => elements.map((element) => ({ kind: element.getAttribute("data-kind"), color: getComputedStyle(element).color })));
    record("결과 행 조각 data-kind · 색(참고)", width, role, url, pieceKinds, "06.1-03 조각 색 표", null);

    // 결과 행은 업로드 응답에서 바로 서고 목록은 router.refresh 뒤에 다시 그려진다 — 줄이 보이기 전에 재면 필터 · 표가 「없음」으로 잡힌다(CI e2e (1) #252).
    await expect(evidenceRows(page).first()).toBeVisible({ timeout: 30_000 });
    const order = await precedesAll([
      ["S1 영역", dropZone(page)],
      ["결과 행", resultRow(page)],
      ["필터 줄", filterSelect(page, "상태")],
      ["1차", primaryButtons(page)],
      ["머리글", evidenceTable(page).locator("thead")],
      ["행", evidenceRows(page)],
      ["합계 행", evidenceTable(page).locator("tfoot")],
      ["힌트 줄", hintRow(page)],
    ]);
    record("요소 순서(결과 행 포함)", width, role, url, order.order.join(" → "), "S1 → 결과 행 → 필터 → 1차 → 머리글 → 행 → 합계 → 힌트", order.ok);

    const needs = resultRow(page).getByRole("link", { name: /^확인 필요 1$/ });
    record("결과 행 `확인 필요 n` 링크(G12)", width, role, url, await needs.count(), 1, (await needs.count()) === 1);
    await resultRow(page).getByRole("link", { name: /^등록 4$/ }).click();
    await expect(page).toHaveURL(/state=all&batch=/);
    await expect(evidenceRows(page).first()).toBeVisible();
    const registered = await evidenceRows(page).count();
    record("`등록 n` 링크로 연 목록 줄 수 = n(G17)", width, role, page.url().replace(/^.*\/expenses/, "/expenses"), registered, 4, registered === 4);
    await page.goBack();
    await expect(resultRow(page)).toBeVisible();
    await resultRow(page).getByRole("link", { name: /^확인 필요 1$/ }).click();
    await expect(page).toHaveURL(/state=needs-check&batch=/);
    await expect(evidenceRows(page).first()).toBeVisible();
    const needsRows = await evidenceRows(page).count();
    record("`확인 필요 n` 링크로 연 목록 줄 수", width, role, page.url().replace(/^.*\/expenses/, "/expenses"), needsRows, 1, needsRows === 1);

    // 거절 행 — 1.4MB(서버 부르지 않음)
    await goto(page, width, url);
    let actions = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) actions++;
    });
    await uploadFixtures(page, [{ name: "큰파일.xls", bytes: new Uint8Array(1_400_000) }]);
    const refused = page.locator('[data-variant="bulk-import"] li[data-state="refused"]');
    await expect(refused).toBeVisible();
    const refusedBg = await refused.evaluate((element) => getComputedStyle(element).backgroundColor);
    const dangerWeak = await tokenProbe(page, "background-color", "var(--status-danger-weak)");
    const refusedButtons = await refused.getByRole("button").count();
    record("거절 행 면 = --status-danger-weak", width, role, url, refusedBg, dangerWeak, refusedBg === dangerWeak);
    record("거절 행 2차 버튼 수", width, role, url, refusedButtons, 0, refusedButtons === 0);
    record("크기 거절 — 서버 액션 호출 수", width, role, url, actions, 0, actions === 0);
    record("거절 행 글자", width, role, url, (await refused.innerText()).replace(/\s+/g, " "), "큰파일.xls · 1.3MB · 1MB 초과 · 기간을 나눠 다시 내려받기 꼴", /1MB 초과/.test(await refused.innerText()));
    page.removeAllListeners("request");
  }
});

// ── 3. 키보드 · 공개 select · 저장 · cellSelect ─────────────────────────────
test("③ intake 1280 — Ctrl+U 파일 선택 · 방향키 → Enter 편집 → Esc 취소 → Delete 무동작 → Ctrl+S · select 선택지 순서 · .cellSelect", async ({ page }) => {
  test.setTimeout(300_000);
  const viewer = await loginIntake(page, { expenses: "write" }, await teamIdByName("기획1팀"));
  await seedRich(viewer);
  const url = "/expenses/evidence?state=all";
  const role = "intake";
  await goto(page, 1280, url);

  // Ctrl+U
  const chooser = page.waitForEvent("filechooser", { timeout: 5_000 }).then(() => true).catch(() => false);
  await page.locator("main h1").click();
  await page.keyboard.press("Control+u");
  const opened = await chooser;
  record("Ctrl+U 파일 선택 열림(filechooser 이벤트)", 1280, role, url, opened, true, opened);

  const primary = primaryButtons(page);
  const nBefore = (await primary.innerText()).replace(/\s+/g, " ");

  // 공개 칸 위치(팀 카드 일반 줄 — 「가맹점가」)
  const rowIndex = await evidenceRows(page).evaluateAll((rows, title) => rows.findIndex((row) => row.querySelector(`[title="${title}"]`)), LONG_MERCHANT);
  const cell = evidenceCell(page, rowIndex, EVIDENCE_COL.visibility);
  const before = (await cell.innerText()).trim();
  await focusGridCell(evidenceCell(page, rowIndex, EVIDENCE_COL.date));
  await page.keyboard.press("ArrowRight");
  const focusAfterRight = await page.evaluate(() => (document.activeElement as HTMLTableCellElement | null)?.cellIndex ?? -1);
  record("방향키 → 오른쪽 칸으로 초점(날짜 오른쪽 = 며칠째)", 1280, role, url, focusAfterRight, EVIDENCE_COL.ageDays, focusAfterRight === EVIDENCE_COL.ageDays);
  await page.keyboard.press("ArrowDown");
  const focusRowAfterDown = await page.evaluate(() => ((document.activeElement as HTMLElement | null)?.parentElement as HTMLTableRowElement | null)?.rowIndex ?? -1);
  record("방향키 ↓ 아래 행으로 초점(rowIndex 증가)", 1280, role, url, focusRowAfterDown, "> 0", focusRowAfterDown > 0);

  await focusGridCell(cell);
  await page.keyboard.press("Delete");
  const afterDelete = (await cell.innerText()).trim();
  const nAfterDelete = (await primary.innerText()).replace(/\s+/g, " ");
  record("Delete 무동작(값 · N 그대로)", 1280, role, url, `${afterDelete} · ${nAfterDelete}`, `${before} · ${nBefore}`, afterDelete === before && nAfterDelete === nBefore);

  await page.keyboard.press("Enter");
  const editor = page.getByRole("combobox", { name: "공개", exact: true });
  await expect(editor).toBeFocused();
  record("Enter → 공개 select 초점", 1280, role, url, await editor.evaluate((element) => element === document.activeElement), true, true);
  const options = await editor.evaluate((element) =>
    [...(element as HTMLSelectElement).children].map((child) => (child.tagName === "OPTGROUP" ? `[${(child as HTMLOptGroupElement).label}: ${[...child.children].map((option) => option.textContent).join(", ")}]` : child.textContent ?? "")),
  );
  const choices = options.filter((option) => option !== "—");
  record("공개 select 선택지 순서(DA-1 — 자리표시 `—` 뺌)", 1280, role, url, choices, "기획1팀 공개 → 기획본부 공개 → 미공개 → [다른 팀: …(기획1팀 제외)]", choices[0] === "기획1팀 공개" && choices[1] === "기획본부 공개" && choices[2] === "미공개" && String(choices[3]).startsWith("[다른 팀:") && !String(choices[3]).includes("기획1팀 공개"));
  // F7(디자인 검토 P3 · 사용자 결정 2026-10-17 「이 칸만 끄기」) — 공개 칸만 `hideEmptyOption`으로 `—`를 끈다. 첫 선택지가 제안 팀이다.
  record("공개 select 첫 선택지 = 제안 팀(F7 — `—` 없음)", 1280, role, url, options[0], "기획1팀 공개(맨 위 · 기본)", options[0] === "기획1팀 공개" && !options.includes("—"));
  // 07 개정 11 — 초점 잡힌 공개 select = 흰 바탕 + 안쪽 2px --accent 선(초록 면 · 바깥 포커스 링 없음).
  await classAudit(page, "cellSelect", 1280, url, [["height", "var(--control-h)"], ["border-bottom-color", "var(--accent)"], ["background-color", "var(--surface-base)"], ["outline-color", "var(--accent)"], ["color", "var(--text-strong)"], ["font-size", "var(--text-body)"], ["padding-left", "var(--s-1)"]], { "border-bottom-style": "solid", "border-bottom-width": "1px", "border-top-width": "0px", "outline-style": "solid", "outline-width": "2px", "outline-offset": "-2px" });
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  const afterEsc = (await cell.innerText()).trim();
  record("Esc → 편집 전 값으로 닫힘", 1280, role, url, afterEsc, before, afterEsc === before);

  // Ctrl+S
  const saved = waitForServerAction(page);
  await focusGridCell(evidenceCell(page, rowIndex, EVIDENCE_COL.date));
  await page.keyboard.press("Control+s");
  await saved;
  const foot = evidenceTable(page).locator("tfoot");
  await expect(foot).toContainText(/공개 범위 저장 · \d+줄 · \d{2}:\d{2}/);
  record("Ctrl+S → 합계 행 `공개 범위 저장 · n줄 · HH:mm`", 1280, role, url, (await foot.innerText()).replace(/\s+/g, " "), "/공개 범위 저장 · \\d+줄 · HH:mm/", true);
  const toasts = await page.locator("[role='status'][class*='Toast'], [class*='Toast-module__']").count();
  record("저장 성공 토스트 수", 1280, role, url, toasts, 0, toasts === 0);
});

// ── 4. 서버 거부 줄 ─────────────────────────────────────────────────────────
test("④ intake 1280 — 서버 거부: version 바뀐 줄 + 보관된 팀 → `오류 n칸 · 전부 거부` · 칸 오류 글자 · 저장 0줄", async ({ page }) => {
  test.setTimeout(300_000);
  const viewer = await loginIntake(page, { expenses: "write" }, await teamIdByName("기획1팀"));
  const rich = await seedRich(viewer);
  const url = "/expenses/evidence?state=all";
  const role = "intake";
  await goto(page, 1280, url);
  // 고칠 줄 = 60자 가맹점 줄(유일 · 미공개 팀 카드) — 「가맹점가」 줄은 셋(미공개 · 확인 필요 · 카드 미등록)이라 고르지 않는다.
  const shortIndex = await evidenceRows(page).evaluateAll((rows, title) => rows.findIndex((row) => row.querySelector(`[title="${title}"]`)), LONG_MERCHANT);
  const longIndex = shortIndex;

  // 다른 팀 고르기 → 그 팀을 보관
  await focusGridCell(evidenceCell(page, shortIndex, EVIDENCE_COL.visibility));
  await page.keyboard.press("Enter");
  const editor = page.getByRole("combobox", { name: "공개", exact: true });
  const otherLabel = await editor.locator('optgroup[label="다른 팀"] option').first().innerText();
  const otherTeam = otherLabel.replace(/ 공개$/, "");
  await editor.selectOption({ label: otherLabel });
  const otherTeamId = await teamIdByName(otherTeam);
  await db.update(teams).set({ archivedAt: new Date() }).where(eq(teams.id, otherTeamId));
  await bumpRecordVersion(rich.lotte[1]!); // 팀 카드 일반 줄(제안 줄)
  try {
    const saved = waitForServerAction(page);
    await focusGridCell(evidenceCell(page, longIndex, EVIDENCE_COL.date));
    await page.keyboard.press("Control+s");
    await saved;
    const foot = evidenceTable(page).locator("tfoot");
    await expect(foot).toContainText(/전부 거부/);
    const footText = (await foot.innerText()).replace(/\s+/g, " ");
    record("거부 합계 행 글자", 1280, role, url, footText, "`오류 2칸 · 전부 거부`", /오류 2칸 · 전부 거부/.test(footText));
    const shortCell = (await evidenceCell(page, shortIndex, EVIDENCE_COL.visibility).innerText()).replace(/\s+/g, " ");
    record("보관된 팀 칸 오류 글자", 1280, role, url, shortCell, `없는 팀 · ${otherTeam}`, shortCell.includes(`없는 팀 · ${otherTeam}`));
    const errorCells = await evidenceTable(page).locator("td[class*='errorCell'], td[aria-invalid='true'], td:has([aria-invalid='true'])").count();
    const dangerColor = await tokenProbe(page, "color", "var(--status-danger)");
    const errorShadow = await evidenceCell(page, shortIndex, EVIDENCE_COL.visibility).evaluate((element) => getComputedStyle(element).boxShadow);
    record("오류 칸 수(errorCell · aria-invalid)", 1280, role, url, errorCells, 2, errorCells === 2);
    record("오류 칸 box-shadow(참고 — --inset-error)", 1280, role, url, errorShadow, `inset 2px 0 0 ${dangerColor}`, null);
    const savedRows = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.id, rich.lotte[0]!));
    const [row] = await db.select({ saved: evidenceRecords.visibilitySavedAt }).from(evidenceRecords).where(eq(evidenceRecords.id, rich.lotte[0]!));
    record("전부 거부 — 저장된 줄 0(DB visibility_saved_at)", 1280, role, url, `${savedRows.length}행 · saved_at ${row?.saved ? row.saved.toISOString() : "null"}`, "null", row?.saved === null);
    const toasts = await page.locator("[class*='Toast-module__']").count();
    record("거부 토스트 수", 1280, role, url, toasts, 0, toasts === 0);
  } finally {
    await db.update(teams).set({ archivedAt: null }).where(eq(teams.id, otherTeamId));
  }
});

// ── 5. 보관 · 되돌리기 · 되돌리기 실패 · 되살리기 ───────────────────────────
test("⑤ intake 1280 — 보관 → `증빙 보관됨` + 되돌리기(초점 · 확인 창 0) → 되돌리기 → 다시 보관 · 되돌리기 실패 · 보관됨 보기 되살리기 · .undoLine · .undoFailed", async ({ page }) => {
  test.setTimeout(300_000);
  const viewer = await loginIntake(page, { expenses: "write" }, await teamIdByName("기획1팀"));
  await seedRich(viewer);
  const url = "/expenses/evidence?state=all";
  const role = "intake";
  await goto(page, 1280, url);
  let dialogs = 0;
  page.on("dialog", (dialog) => {
    dialogs++;
    void dialog.accept();
  });
  const before = await evidenceRows(page).count();
  const shortRow = evidenceRows(page).filter({ has: page.locator(`[title="${LONG_MERCHANT}"]`) });
  const archived = waitForServerAction(page);
  await shortRow.getByRole("button", { name: "보관", exact: true }).click();
  await archived;
  const line = page.locator("main p[role='status']");
  await expect(line).toContainText("증빙 보관됨");
  await expect(evidenceRows(page)).toHaveCount(before - 1);
  const undo = line.getByRole("button", { name: "되돌리기" }).or(line.getByRole("link", { name: "되돌리기" }));
  const undoFocused = await undo.first().evaluate((element) => element === document.activeElement);
  record("보관 → 결과 줄 `증빙 보관됨` + 되돌리기", 1280, role, url, (await line.innerText()).replace(/\s+/g, " "), "증빙 보관됨 되돌리기", /증빙 보관됨/.test(await line.innerText()));
  record("되돌리기 초점", 1280, role, url, undoFocused, true, undoFocused);
  record("확인 창(dialog) 수", 1280, role, url, dialogs + (await page.getByRole("dialog").count()) + (await page.getByRole("alertdialog").count()), 0, dialogs === 0);
  record("보관 뒤 줄 수", 1280, role, url, await evidenceRows(page).count(), before - 1, true);
  const order = await precedesAll([["결과 줄", line], ["머리글", evidenceTable(page).locator("thead")]]);
  record("결과 줄이 표 위", 1280, role, url, order.order.join(" → "), "결과 줄 → 머리글", order.ok);
  await classAudit(page, "undoLine", 1280, url, [["font-size", "var(--text-aux)"], ["color", "var(--text-muted)"], ["column-gap", "var(--s-2)"], ["margin-bottom", "var(--s-3)"]], { display: "flex", "flex-wrap": "wrap", "overflow-wrap": "anywhere" });

  const restored = waitForServerAction(page);
  await undo.first().click();
  await restored;
  await expect(evidenceRows(page)).toHaveCount(before);
  record("되돌리기 → 줄 돌아옴", 1280, role, url, await evidenceRows(page).count(), before, (await evidenceRows(page).count()) === before);

  // 되돌리기 실패 — 액션 요청을 끊는다
  const again = waitForServerAction(page);
  await shortRow.getByRole("button", { name: "보관", exact: true }).click();
  await again;
  await expect(line).toContainText("증빙 보관됨");
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.abort("failed");
    else await route.continue();
  });
  await line.getByRole("button", { name: "되돌리기" }).or(line.getByRole("link", { name: "되돌리기" })).first().click();
  await expect(line).toContainText("되돌리기 실패 · 다시 시도");
  record("되돌리기 실패 글자", 1280, role, url, (await line.innerText()).replace(/\s+/g, " "), "되돌리기 실패 · 다시 시도 + 되돌리기 남음", /되돌리기 실패 · 다시 시도/.test(await line.innerText()) && (await undo.count()) > 0);
  await classAudit(page, "undoFailed", 1280, url, [["color", "var(--status-danger)"]], {});
  await page.unroute("**/*");

  // 보관됨 보기 — 되살리기만
  await goto(page, 1280, "/expenses/evidence?state=archived");
  const archivedUrl = "/expenses/evidence?state=archived";
  const labels = await rowActionButtons(page).allInnerTexts();
  record("보관됨 보기 행 행동 = 되살리기만", 1280, role, archivedUrl, labels, "전부 `되살리기`", labels.length >= 1 && labels.every((label) => label.trim() === "되살리기"));
  const statusWords = await evidenceRows(page).evaluateAll((rows, col) => rows.map((row) => (row.querySelectorAll(":scope > td")[col] as HTMLElement).querySelector("span")?.textContent ?? ""), EVIDENCE_COL.status);
  record("보관됨 보기 상태 낱말", 1280, role, archivedUrl, statusWords, "전부 보관됨", statusWords.every((word) => word === "보관됨"));
  const countBefore = await evidenceRows(page).count();
  const revive = waitForServerAction(page);
  await rowActionButtons(page).first().click();
  await revive;
  await expect(evidenceRows(page)).toHaveCount(countBefore - 1);
  record("되살리기 → 보관됨 보기에서 빠짐", 1280, role, archivedUrl, await evidenceRows(page).count(), countBefore - 1, true);
});

// ── 6. 저장 안 한 편집 복원 줄(.restoreBanner · .restoreActions · .restoreAction) ──
test("⑥ intake 1280 · 375 — 사람이 바꾼 칸 → 떠났다 돌아오면 `저장 안 한 편집 1칸` 복원 · 버림 · 모듈 클래스 · 폰 터치", async ({ page }) => {
  test.setTimeout(300_000);
  const viewer = await loginIntake(page, { expenses: "write" }, await teamIdByName("기획1팀"));
  await seedRich(viewer);
  const url = "/expenses/evidence?state=all";
  const role = "intake";
  page.on("dialog", (dialog) => void dialog.accept());
  await goto(page, 1280, url);
  const shortIndex = await evidenceRows(page).evaluateAll((rows, title) => rows.findIndex((row) => row.querySelector(`[title="${title}"]`)), LONG_MERCHANT);
  await focusGridCell(evidenceCell(page, shortIndex, EVIDENCE_COL.visibility));
  await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: "공개", exact: true }).selectOption({ label: "미공개" });
  await page.goto("/expenses");
  for (const width of [1280, 375] as const) {
    await goto(page, width, url);
    const banner = moduleClass(page, "restoreBanner");
    await expect(banner).toContainText("저장 안 한 편집 1칸");
    record("복원 줄 글자", width, role, url, (await banner.innerText()).replace(/\s+/g, " "), "저장 안 한 편집 1칸 복원 버림", /저장 안 한 편집 1칸/.test(await banner.innerText()));
    await classAudit(page, "restoreBanner", width, url, [["color", "var(--text-muted)"], ["font-size", "var(--text-aux)"], ["column-gap", "var(--s-2)"], ["margin-top", "var(--s-2)"]], { display: "flex", "flex-wrap": "wrap", "word-break": "keep-all" });
    // 부모 .restoreBanner가 flex라 자식 inline-flex는 CSS 규칙대로 flex로 blockify된다 — computed `flex`가 선언 `inline-flex`의 결과다.
    await classAudit(page, "restoreActions", width, url, [["column-gap", "var(--s-2)"]], { display: "flex", "flex-wrap": "nowrap" });
    await classAudit(page, "restoreAction", width, url, [["color", "var(--text-link)"], ["font-size", "var(--text-aux)"], ["font-weight", "var(--fw-medium)"]], { "text-decoration-line": "underline" });
    const boxes = await moduleClass(page, "restoreAction").evaluateAll((elements) => elements.map((element) => ({ w: Math.round(element.getBoundingClientRect().width), h: Math.round(element.getBoundingClientRect().height) })));
    if (width < 700) record("폰 복원 · 버림 버튼 ≥ 44×44", width, role, url, boxes, "각 ≥ 44×44", boxes.length === 2 && boxes.every((box) => box.w >= 44 && box.h >= 44));
    else record("복원 · 버림 버튼 크기(참고)", width, role, url, boxes, "—", null);
  }
  await goto(page, 1280, url);
  await page.getByRole("button", { name: "복원" }).click();
  const dirty = await evidenceTable(page).locator("td[class*='dirtyCell']").count();
  record("복원 → dirty 칸 생김", 1280, role, url, dirty, "≥1", dirty >= 1);
});

// ── 7. 폰 RowSheet · ListEmpty 버튼 · 빈 상태 ─────────────────────────────
test("⑦ intake 375 · 320 — 행 탭 칸 · 시트 닫기 · 시트 줄 ≥ 44 · 빈 상태 ListEmpty 버튼 ≥ 44 · 빈 상태 1차 0(6폭)", async ({ page }) => {
  test.setTimeout(300_000);
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 1)), "롯데_폰감사.xls");
  const role = "intake";
  const url = "/expenses/evidence";
  for (const width of [375, 320] as const) {
    await goto(page, width, url);
    const tap = evidenceTable(page).getByRole("button", { name: /상세 보기$/ }).first();
    const tapBox = await tap.boundingBox();
    record("폰 행 탭 칸 ≥ 44×44", width, role, url, `${Math.round(tapBox?.width ?? 0)}×${Math.round(tapBox?.height ?? 0)}`, "≥ 44×44", (tapBox?.width ?? 0) >= 44 && (tapBox?.height ?? 0) >= 44);
    await tap.click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet).toBeVisible();
    const close = sheet.getByRole("button", { name: "닫기" });
    const closeBox = await close.boundingBox();
    record("RowSheet 닫기 ≥ 44×44", width, role, url, `${Math.round(closeBox?.width ?? 0)}×${Math.round(closeBox?.height ?? 0)}`, "≥ 44×44", (closeBox?.width ?? 0) >= 44 && (closeBox?.height ?? 0) >= 44);
    const rows = await sheet.locator("dt").evaluateAll((elements) => elements.map((element) => {
      const row = (element.parentElement?.tagName === "DIV" ? element.parentElement : element) as HTMLElement;
      return Math.round(row.getBoundingClientRect().height);
    }));
    // KvList 줄은 누르는 자리가 아니다(읽기 전용 — 터치 대상 아님). 「RowSheet 행」의 44 판정은 행 탭 칸 · 닫기가 맡고 여기는 참고로 적는다.
    record("RowSheet KvList 줄 높이(참고 — 터치 대상 아님)", width, role, url, rows, "—", null);
    const sheetText = (await sheet.innerText()).replace(/\s+/g, " ");
    record("RowSheet 글자(참고)", width, role, url, sheetText.slice(0, 160), "날짜 · 공급가 · 세액 · 합계 · 공개 · 상태", null);
    const sheetActions = await sheet.getByRole("button").count();
    record("RowSheet 행동 버튼 수(닫기 제외)", width, role, url, sheetActions - 1, 0, sheetActions - 1 === 0);
    const sheetOverflow = await docOverflow(page);
    record("RowSheet 열린 채 넘침", width, role, url, `${sheetOverflow.scrollWidth}/${sheetOverflow.clientWidth}`, "<=", sheetOverflow.scrollWidth <= sheetOverflow.clientWidth);
    await close.click();
  }
  // 빈 상태 — 짝 없는 카드 줄 0(전체 보기) · 조건 0(필터 지우기)
  await clearEvidence();
  const { batchId } = await insertHometax(viewer);
  void batchId;
  for (const width of WIDTHS) {
    for (const [emptyUrl, message, action] of [
      ["/expenses/evidence?state=unmatched", "짝 없는 카드 줄이 없습니다", "전체 보기"],
      ["/expenses/evidence?state=card-unknown&type=card", "조건에 맞는 증빙이 없습니다", "필터 지우기"],
    ] as const) {
      await goto(page, width, emptyUrl);
      const empty = page.locator('[data-ui="empty-state"]');
      const text = (await empty.innerText()).replace(/\s+/g, " ").trim();
      record("빈 상태 글자", width, role, emptyUrl, text, `${message} ${action}`, text === `${message} ${action}`);
      const button = empty.getByRole("link", { name: action });
      const box = await button.boundingBox();
      if (width < 700) record("폰 ListEmpty 버튼 ≥ 44×44", width, role, emptyUrl, `${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)}`, "≥ 44×44", (box?.width ?? 0) >= 44 && (box?.height ?? 0) >= 44);
      else record("ListEmpty 버튼 크기(참고)", width, role, emptyUrl, `${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)}`, "—", null);
      const primaries = await primaryButtons(page).count();
      record("빈 상태 1차 DOM 수", width, role, emptyUrl, primaries, 0, primaries === 0);
      const overflow = await docOverflow(page);
      record("빈 상태 넘침", width, role, emptyUrl, `${overflow.scrollWidth}/${overflow.clientWidth}`, "<=", overflow.scrollWidth <= overflow.clientWidth);
    }
  }
});

// ── 8. 101줄 페이지 줄 ──────────────────────────────────────────────────────
test("⑧ intake 6폭 — 101줄 2쪽: 페이지 줄 범위 글자 · 이전/다음 · 꺾쇠 0 · 힌트 줄이 페이지 줄 뒤 · 넘침 · 합계 101줄", async ({ page }) => {
  test.setTimeout(600_000);
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 101)), "롯데_101감사.xls");
  const role = "intake";
  const url = "/expenses/evidence?page=2";
  for (const width of WIDTHS) {
    await goto(page, width, url);
    const nav = page.getByRole("navigation", { name: "증빙 페이지" });
    const text = (await nav.innerText()).replace(/\s+/g, " ");
    record("페이지 줄 글자", width, role, url, text, "51–100 / 101건 · 이전 · 1 2 · 다음(글리프 없음)", /51–100 \/ 101건/.test(text) && /이전/.test(text) && /다음/.test(text) && !/[‹›«»<>]/.test(text));
    const rows = await evidenceRows(page).count();
    record("2쪽 줄 수", width, role, url, rows, 50, rows === 50);
    const foot = (await evidenceTable(page).locator("tfoot").innerText()).replace(/\s+/g, " ");
    // 폰은 부제(줄 수)가 숨어 합계 금액만 남는다(H3) — 101줄 합은 PC 폭에서 글자로, 폰은 금액 한 줄로 본다.
    if (width < 700) record("합계 행 = 필터 결과 전체(폰: 합계 금액만)", width, role, url, foot.slice(0, 80), "합계 {금액}", /^합계 [\d,-]+$/.test(foot.trim()));
    else record("합계 행 = 필터 결과 전체(101줄)", width, role, url, foot.slice(0, 80), "합계 101줄", /합계 101줄/.test(foot));
    if (width >= 1024) {
      const order = await precedesAll([["합계 행", evidenceTable(page).locator("tfoot")], ["페이지 줄", nav], ["힌트 줄", hintRow(page)]]);
      record("페이지 줄 → 힌트 줄 순서", width, role, url, order.order.join(" → "), "합계 → 페이지 → 힌트", order.ok);
      const primary = (await primaryButtons(page).innerText()).replace(/\s+/g, " ");
      record("1차 N = 필터 결과 전체 제안 수", width, role, url, primary, "공개 범위 저장 101", /공개 범위 저장 101/.test(primary));
    }
    const links = await nav.getByRole("link").evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().height)));
    if (width < 700) record("폰 페이지 줄 링크 높이 ≥ 44", width, role, url, links, "각 ≥ 44", links.every((height) => height >= 44));
    const overflow = await docOverflow(page);
    record("넘침", width, role, url, `${overflow.scrollWidth}/${overflow.clientWidth}`, "<=", overflow.scrollWidth <= overflow.clientWidth);
  }
});

// ── 9. /expenses 진입 링크(등록 계급) ───────────────────────────────────────
test("⑨ intake 6폭 — /expenses 필터 줄 끝 `증빙 {N}`(N = 할 일 줄 수) · href · 넘침 · 폰 터치", async ({ page }) => {
  test.setTimeout(600_000);
  const team1 = await teamIdByName("기획1팀");
  const viewer = await loginIntake(page, { expenses: "write" }, team1);
  await createTeamExpenseDraft(viewer, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", usageDate: seoulToday(), content: "증빙 감사 진입 링크" } });
  await seedRich(viewer);
  const role = "intake";
  await goto(page, 1280, "/expenses/evidence");
  const todo = await evidenceRows(page).count();
  for (const width of WIDTHS) {
    const url = "/expenses";
    await goto(page, width, url);
    const link = page.getByRole("main").getByRole("link", { name: /^증빙( \d+)?$/ });
    const count = await link.count();
    const label = count > 0 ? (await link.first().innerText()).trim() : "DOM 0";
    record("진입 링크 글자 = `증빙 {할 일 줄 수}`", width, role, url, label, `증빙 ${todo}`, label === `증빙 ${todo}`);
    const href = count > 0 ? await link.first().getAttribute("href") : null;
    record("진입 링크 href", width, role, url, href, "/expenses/evidence", href === "/expenses/evidence");
    const form = page.getByRole("form", { name: "지출결의 보기" });
    if ((await form.count()) > 0 && count > 0) {
      const inside = await form.evaluate((element, target) => element.contains(target), await link.first().elementHandle());
      const ordered = await precedesAll([["필터 폼 첫 칸", form.locator("select, input").first()], ["진입 링크", link]]);
      record("진입 링크 = 필터 줄 끝(폼 안 · 필터 뒤)", width, role, url, `폼 안 ${inside} · ${ordered.order.join(" → ")}`, "폼 안 true · 필터 → 링크", inside && ordered.ok);
    }
    const box = count > 0 ? await link.first().boundingBox() : null;
    if (width < 700) record("폰 진입 링크 ≥ 44 높이", width, role, url, `${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)}`, "높이 ≥ 44", (box?.height ?? 0) >= 44);
    const overflow = await docOverflow(page);
    record("/expenses 넘침", width, role, url, `${overflow.scrollWidth}/${overflow.clientWidth}`, "<=", overflow.scrollWidth <= overflow.clientWidth);
  }
});

// ── 10. 권한 없는 자격(PM · 팀장) ───────────────────────────────────────────
for (const [roleId, roleName] of [
  ["role-pm", "pm"],
  ["role-team-lead", "team-lead"],
] as const) {
  test(`⑩ ${roleName} 6폭 — /expenses/evidence · ?state=all · ?batch= 404 · /expenses 진입 링크 DOM 0`, async ({ page }) => {
    test.setTimeout(300_000);
    await loginAs(page, roleId, await teamIdByName("기획1팀"));
    for (const width of WIDTHS) {
      for (const url of ["/expenses/evidence", "/expenses/evidence?state=all", `/expenses/evidence?state=all&batch=${randomUUID()}`]) {
        const status = await goto(page, width, url);
        record("권한 없음 응답 코드", width, roleName, url, status, 404, status === 404);
        const leaked = await page.locator("table caption", { hasText: /^증빙 목록$/ }).count();
        record("권한 없음 — 증빙 표 DOM", width, roleName, url, leaked, 0, leaked === 0);
      }
      await goto(page, width, "/expenses");
      const link = await page.getByRole("main").getByRole("link", { name: /^증빙( \d+)?$/ }).count();
      record("권한 없음 — /expenses 진입 링크 DOM", width, roleName, "/expenses", link, 0, link === 0);
    }
  });
}

// ── 11. 07.1-01 며칠째 열(D-7102 · W8) · 잠김 한 줄(D-7105 · W9) · 확인 필요 연결 문서(U-16) ──────────────────────

const DAY_MS = 86_400_000;

// 며칠째 열 시험 자료 — 홈택스 6줄 중 [0] 오늘 등록 미공개 · [1] 120일 전 등록 팀 공개 · [2] 오늘 본부 공개 · [3] 음수 미공개 · [4] 붙음.
async function seedAging(viewer: Viewer): Promise<{ ids: string[]; names: string[] }> {
  const { ids } = await insertHometax(viewer);
  const team1 = await teamIdByName("기획1팀");
  await db
    .update(evidenceRecords)
    .set({ visibility: "team", visibleTeamId: team1, visibilitySavedAt: new Date(), createdAt: new Date(Date.now() - 120 * DAY_MS) })
    .where(eq(evidenceRecords.id, ids[1]!));
  await db.update(evidenceRecords).set({ supplyKrw: -300_000, vatKrw: -30_000, totalKrw: -330_000, originalApprovalNo: "20260101-41000000-00000099" }).where(eq(evidenceRecords.id, ids[3]!));
  await attachRecordFixture(ids[4]!, viewer.id);
  return { ids, names: ids.map((_, index) => `감사공급사${index + 1}`) };
}

function rowByName(page: Page, name: string): Locator {
  return evidenceRows(page).filter({ hasText: name });
}

async function rowIndexByName(page: Page, name: string): Promise<number> {
  const texts = await evidenceRows(page).evaluateAll((rows) => rows.map((row) => row.textContent ?? ""));
  return texts.findIndex((text) => text.includes(name));
}

// 글자(Range) 폭 — 칸 폭이 머리글 · 가장 넓은 값 중 큰 쪽에 맞는지(3회차 R3-3) 잴 때 쓴다.
async function textWidth(target: Locator): Promise<number> {
  return target.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect().width;
  });
}

test("⑪ intake 1280 · 1024 · 768 · 700 — 며칠째 열: 날짜 바로 뒤 · 우측 정렬 · 붙은 줄 `—` · 오늘 `0일` · 한 줄 · 폭 = max(머리글, 값) · 거래처 칸 하한 9em · 가로 넘침 0 · Ctrl+C `0`", async ({ page }) => {
  test.setTimeout(600_000);
  const viewer = await loginIntake(page);
  const { names } = await seedAging(viewer);
  const role = "intake";
  const url = "/expenses/evidence?state=all";

  for (const width of [1280, 1024, 768, 700] as const) {
    await goto(page, width, url);
    await expect(evidenceTable(page)).toBeVisible();
    await expect(rowByName(page, names[0]!)).toHaveCount(1);

    const heads = await evidenceTable(page).locator("thead th").evaluateAll((elements) => elements.map((element) => ({ text: (element.textContent ?? "").trim(), display: getComputedStyle(element).display })));
    const dateAt = heads.findIndex((head) => head.text === "날짜");
    const ageAt = heads.findIndex((head) => head.text === "며칠째");
    record("며칠째 머리글 = 날짜 바로 뒤", width, role, url, `날짜 ${dateAt} · 며칠째 ${ageAt}`, "며칠째 = 날짜 + 1", dateAt >= 0 && ageAt === dateAt + 1);
    record("며칠째 머리글 보임(display)", width, role, url, heads[ageAt]?.display ?? "DOM 0", "none 아님", (heads[ageAt]?.display ?? "none") !== "none");

    const header = evidenceTable(page).locator("thead th", { hasText: /^며칠째$/ });
    // 사용자 결정 2026-10-27 — 태블릿(768 · 700)과 1024 · 1280 모두 며칠째 열이 실제로 보인다(폭 > 0).
    await expect(header).toBeVisible();
    record("며칠째 머리글 글자 줄 수", width, role, url, await textLines(header), 1, (await textLines(header)) === 1);

    const fresh = evidenceCell(page, await rowIndexByName(page, names[0]!), EVIDENCE_COL.ageDays);
    const old = evidenceCell(page, await rowIndexByName(page, names[1]!), EVIDENCE_COL.ageDays);
    const attached = evidenceCell(page, await rowIndexByName(page, names[4]!), EVIDENCE_COL.ageDays);
    record("오늘 등록 안 붙은 줄", width, role, url, (await fresh.innerText()).trim(), "0일", (await fresh.innerText()).trim() === "0일");
    record("120일 전 등록 안 붙은 줄(세 자리)", width, role, url, (await old.innerText()).trim(), "120일", (await old.innerText()).trim() === "120일");
    record("붙은 줄", width, role, url, (await attached.innerText()).trim(), "—", (await attached.innerText()).trim() === "—");

    const align = await old.evaluate((element) => getComputedStyle(element).textAlign);
    record("값 칸 text-align", width, role, url, align, "right", align === "right");
    const valueLines = await textLines(old.locator("span").first());
    record("값 글자 줄 수(120일)", width, role, url, valueLines, 1, valueLines === 1);

    // 폭 = max(머리글 글자 폭, 가장 넓은 값 글자 폭) + 칸 좌우 padding. 줄바꿈 · 잘림 0.
    const valueWidth = await textWidth(old.locator("span").first());
    const headerWidth = await textWidth(header);
    const pad = await old.evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft) + parseFloat(getComputedStyle(element).paddingRight));
    const cellWidth = (await old.boundingBox())?.width ?? 0;
    record("며칠째 칸 폭 ≥ max(머리글, 값) + padding", width, role, url, `칸 ${cellWidth.toFixed(1)} · 머리글 ${headerWidth.toFixed(1)} · 값 ${valueWidth.toFixed(1)} · padding ${pad}`, "칸 ≥ max + padding", cellWidth + 0.5 >= Math.max(headerWidth, valueWidth) + pad);

    // 거래처 칸 하한 — `.counterpartyCell` min-width가 9em px로 실제 걸렸다(auto · 0px이면 실패).
    const counterparty = moduleClass(page, "counterpartyCell").first();
    const minWidth = await counterparty.evaluate((element) => {
      const probe = document.createElement("div");
      probe.style.minWidth = "9em";
      element.appendChild(probe);
      const expected = getComputedStyle(probe).minWidth;
      probe.remove();
      return { got: getComputedStyle(element).minWidth, expected, width: element.getBoundingClientRect().width };
    });
    record("거래처 칸 computed min-width = 9em", width, role, url, JSON.stringify(minWidth), "got = 9em px · width ≥ got", minWidth.got === minWidth.expected && minWidth.got !== "auto" && minWidth.got !== "0px" && minWidth.width + 0.5 >= parseFloat(minWidth.got));

    const overflow = await docOverflow(page);
    record("문서 가로 넘침 없음", width, role, url, `${overflow.scrollWidth}/${overflow.clientWidth}`, "scrollWidth <= clientWidth", overflow.scrollWidth <= overflow.clientWidth);

    if (width >= 1024) {
      await page.evaluate(() => {
        window.addEventListener("copy", (event) => {
          (window as unknown as { __copied?: string }).__copied = event.clipboardData?.getData("text/plain") ?? "";
        });
      });
      await focusGridCell(fresh);
      await page.keyboard.press("Control+c");
      const copied = await page.waitForFunction(() => (window as unknown as { __copied?: string }).__copied);
      const text = (await copied.jsonValue()) as string;
      record("며칠째 칸 Ctrl+C 글자", width, role, url, text, "0", text === "0");
    }
  }
});

test("⑫ intake 375 · 320 — 며칠째 머리글 숨김(DOM 남음) · 행 탭 시트에 `며칠째 {n}일` 줄 · 붙음 줄 시트에는 그 줄 없음", async ({ page }) => {
  test.setTimeout(300_000);
  const viewer = await loginIntake(page);
  const { names } = await seedAging(viewer);
  const role = "intake";
  const url = "/expenses/evidence?state=all";

  for (const width of [375, 320] as const) {
    await goto(page, width, url);
    const header = evidenceTable(page).locator("thead th", { hasText: /^며칠째$/ });
    await expect(header).toHaveCount(1);
    await expect(header).toBeHidden();
    record("폰 며칠째 머리글 숨김(DOM 남음)", width, role, url, await header.evaluate((element) => getComputedStyle(element).display), "none", (await header.evaluate((element) => getComputedStyle(element).display)) === "none");

    for (const [name, expectLine] of [
      [names[0]!, "0일"],
      [names[1]!, "120일"],
      [names[4]!, null],
    ] as const) {
      await page.getByRole("button", { name: new RegExp(`${name}.*상세 보기$`) }).first().click();
      const sheet = page.locator("dialog[open]");
      await expect(sheet).toBeVisible();
      await expect(sheet.locator("dt").first()).toBeVisible();
      // 상세를 받아 시트 항목이 바뀐 뒤에 읽는다 — 상세에만 있는 `이력` 줄이 보이면 로드가 끝난 것이다.
      await expect(sheet.locator("dt", { hasText: /^이력$/ })).toBeVisible();
      const pairs = await sheet.locator("dt").evaluateAll((elements) => elements.map((element) => [(element.textContent ?? "").trim(), (element.nextElementSibling?.textContent ?? "").trim()]));
      const line = pairs.find(([label]) => label === "며칠째");
      record(`시트 며칠째 줄 — ${name}`, width, role, url, JSON.stringify(pairs), expectLine === null ? "며칠째 줄 없음" : `며칠째 ${expectLine}`, expectLine === null ? line === undefined : line?.[1] === expectLine);
      await sheet.getByRole("button", { name: "닫기" }).click();
      await expect(sheet).toBeHidden();
    }
  }
});

test("⑮ intake 1280 · 768 · 375 · 320 — 팀 공개 줄의 패널 · 시트에는 `상태` 줄이 없고(공개 줄과 같은 말) 사유가 있는 미공개(음수) 줄에는 `상태 미공개 · 음수…`가 있다 (#312 N-1)", async ({ page }) => {
  test.setTimeout(600_000);
  const viewer = await loginIntake(page);
  const { names } = await seedAging(viewer);
  const role = "intake";
  const url = "/expenses/evidence?state=all";

  for (const width of [1280, 768, 375, 320] as const) {
    await goto(page, width, url);
    for (const [name, expectStatusRow] of [
      [names[1]!, false],
      [names[3]!, true],
    ] as const) {
      const opener = width >= 700 ? evidenceTable(page).locator('[role="button"][aria-haspopup="dialog"]', { hasText: name }).first() : page.getByRole("button", { name: new RegExp(`${name}.*상세 보기$`) }).first();
      await opener.click();
      const dialog = width >= 1024 ? page.getByRole("dialog", { name: new RegExp(`${name}$`) }) : page.locator("dialog[open]");
      await expect(dialog).toBeVisible();
      // 상세를 받아 항목이 바뀐 뒤에 읽는다 — 상세에만 있는 `이력` 줄이 보이면 로드가 끝난 것이다.
      await expect(dialog.locator("dt", { hasText: /^이력$/ })).toBeVisible();
      const pairs = await dialog.locator("dt").evaluateAll((elements) => elements.map((element) => [(element.textContent ?? "").trim(), (element.nextElementSibling?.textContent ?? "").replace(/\s+/g, " ").trim()]));
      const status = pairs.find(([label]) => label === "상태");
      if (expectStatusRow) {
        record(`읽기 줄 상태 — 사유 있는 미공개 ${name}`, width, role, url, JSON.stringify(pairs), "상태 줄 = 미공개 · 음수…", status !== undefined && status[1]!.startsWith("미공개 · 음수"));
      } else {
        record(`읽기 줄 상태 — 팀 공개 ${name}`, width, role, url, JSON.stringify(pairs), "상태 줄 없음 · 공개 줄 있음", status === undefined && pairs.some(([label]) => label === "공개"));
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
});

async function cardRecordIds(viewer: Viewer, count: number): Promise<string[]> {
  const card = await addLotteCard({ kind: "shared" });
  const batch = await registerFile(viewer, lotteFixture(lotteLines(card, count)), "롯데_잠김.xls");
  return recordIdsOf(batch);
}

test("⑬ 대리 등록 없는 등록 계급 1280 — 짝 없는 카드 줄 행동 칸: 붙이기 · 대리 등록 컨트롤 0 · 글자 `대리 등록 · 경영관리` · 보관 행동 그대로 · Ctrl+E 무동작", async ({ page }) => {
  test.setTimeout(300_000);
  const viewer = await loginIntake(page);
  const [recordId] = await cardRecordIds(viewer, 1);
  const role = "intake";
  const url = "/expenses/evidence";
  await goto(page, 1280, url);
  await expect(evidenceRows(page)).toHaveCount(1);
  const cell = evidenceCell(page, 0, EVIDENCE_COL.actions);

  const controls = await cell.locator("button, a").evaluateAll((elements) => elements.map((element) => (element.textContent ?? "").trim()));
  const blocked = controls.filter((text) => text === "붙이기" || text === "대리 등록");
  record("행동 칸 붙이기 · 대리 등록 컨트롤 수", 1280, role, url, JSON.stringify(controls), "붙이기 · 대리 등록 0", blocked.length === 0);
  const reason = (await cell.locator('[class*="selectReason"]').allInnerTexts()).map((text) => text.trim());
  record("행동 칸 잠김 한 줄", 1280, role, url, JSON.stringify(reason), '["대리 등록 · 경영관리"]', reason.length === 1 && reason[0] === "대리 등록 · 경영관리");
  record("보관 행 행동은 그대로", 1280, role, url, JSON.stringify(controls), "보관 포함", controls.includes("보관"));

  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
  await page.keyboard.press("Control+e");
  await page.waitForTimeout(500);
  const dialogs = await page.locator("dialog[open], [role=dialog]").count();
  record("Ctrl+E 뒤 열린 대화상자 수", 1280, role, url, dialogs, 0, dialogs === 0 && new URL(page.url()).pathname === "/expenses/evidence");
  void recordId;
});

test("⑯ 대리 등록 없는 등록 계급 768 · 375 · 320 — 짝 없는 카드 줄 행 시트 행동 자리에 잠김 한 줄 `대리 등록 · 경영관리` 하나 · 붙이기 · 대리 등록 컨트롤 0 (#312 B-1 · UI-SPEC W9)", async ({ page }) => {
  test.setTimeout(300_000);
  const viewer = await loginIntake(page);
  await cardRecordIds(viewer, 1);
  const role = "intake";
  const url = "/expenses/evidence";

  for (const width of [768, 375, 320] as const) {
    await goto(page, width, url);
    await expect(evidenceRows(page)).toHaveCount(1);
    const opener = width >= 700 ? evidenceTable(page).locator('[role="button"][aria-haspopup="dialog"]').first() : page.getByRole("button", { name: /상세 보기$/ }).first();
    await opener.click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("dt", { hasText: /^이력$/ })).toBeVisible();
    const lock = sheet.locator('[class*="selectReason"]');
    const texts = (await lock.allInnerTexts()).map((text) => text.trim());
    record("시트 행동 자리 잠김 한 줄", width, role, url, JSON.stringify(texts), '["대리 등록 · 경영관리"]', texts.length === 1 && texts[0] === "대리 등록 · 경영관리");
    const controls = (await sheet.locator("button, a").allInnerTexts()).map((text) => text.trim());
    record("시트 붙이기 · 대리 등록 컨트롤 수", width, role, url, JSON.stringify(controls), "0", controls.filter((text) => text === "붙이기" || text === "대리 등록").length === 0);
    const overflow = await docOverflow(page);
    record("문서 가로 넘침 없음", width, role, url, `${overflow.scrollWidth}/${overflow.clientWidth}`, "scrollWidth <= clientWidth", overflow.scrollWidth <= overflow.clientWidth);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  }
});

test("⑭ 확인 필요 줄 1280 — 번호 없는 카드 사용에 붙은 줄은 2행에 사유만(`작성 중 문서` 없음), 번호 없는 작성 중 지출결의에 붙은 줄은 `작성 중 문서` 그대로(U-16)", async ({ page }) => {
  test.setTimeout(300_000);
  const manager = await loginIntake(page);
  const team1 = await teamIdByName("기획1팀");
  const pm = await createPmInTeam(team1);
  const last4 = await addLotteCard({ kind: "personal", holderUserId: pm.id });
  const [card] = await db
    .select({ id: corpCards.id })
    .from(corpCards)
    .where(and(eq(corpCards.numberLast4, last4), eq(corpCards.issuer, "롯데카드"), isNull(corpCards.archivedAt)));
  if (!card) throw new Error("카드 없음");
  const usage = await createCardUsageFixture(pm, { corpCardId: card.id, usedOn: seoulToday(), totalKrw: 55_000 });
  await db.update(corpCardUsages).set({ number: null }).where(eq(corpCardUsages.id, usage.id));
  const { ids } = await insertHometax(manager);
  await insertLinkFixture({ recordId: ids[0]!, ownerKind: "corp_card_usage", ownerId: usage.id, attachedBy: manager.id });
  await insertLinkFixture({ recordId: ids[1]!, ownerKind: "expense", ownerId: randomUUID(), attachedBy: manager.id });
  await db.update(evidenceRecords).set({ needsCheck: "카드 사용 사유" }).where(eq(evidenceRecords.id, ids[0]!));
  await db.update(evidenceRecords).set({ needsCheck: "지출결의 사유" }).where(eq(evidenceRecords.id, ids[1]!));
  const role = "intake";
  const url = "/expenses/evidence?state=all";
  await goto(page, 1280, url);

  const usageStatus = (await evidenceCell(page, await rowIndexByName(page, "감사공급사1"), EVIDENCE_COL.status).innerText()).replace(/\s+/g, " ").trim();
  record("번호 없는 카드 사용에 붙은 확인 필요 줄 상태 칸", 1280, role, url, usageStatus, "작성 중 문서 없음 · 사유 `카드 사용 사유`", !usageStatus.includes("작성 중 문서") && usageStatus.includes("카드 사용 사유"));
  const draftStatus = (await evidenceCell(page, await rowIndexByName(page, "감사공급사2"), EVIDENCE_COL.status).innerText()).replace(/\s+/g, " ").trim();
  record("번호 없는 작성 중 지출결의에 붙은 줄 상태 칸", 1280, role, url, draftStatus, "작성 중 문서 · 사유 `지출결의 사유`", draftStatus.includes("작성 중 문서") && draftStatus.includes("지출결의 사유"));
});

// ── 07.1-05 W13 — 파일 받기 5,000건 상한 (D-7113 · E-P2-20) ─────────────────────────────────────────────────────────
// 고유 묶음 하나에 5,001건을 넣고 `?state=all&batch=<묶음>`으로만 연다 — 공유 E2E DB의 다른 화면에는 보이지 않고, 끝에 그 묶음의 행을 지운다.
// 버튼 상태를 정하는 건수는 목록 합계 건수(서버 countEvidenceRecords와 같은 집합)다. 렌더 시간(goto → 버튼 보임 ms)을 SUMMARY용으로 남긴다.
const EXPORT_LIMIT_REASON = "5,000건 넘음 · 필터나 검색으로 줄이기";

async function insertLimitBatch(viewer: Viewer, count: number): Promise<string> {
  const batchId = randomUUID();
  await db.insert(evidenceImportBatches).values({
    id: batchId,
    format: "hometax-tax-invoice",
    originalName: "상한_시험.xls",
    fileSha256: createHash("sha256").update(batchId).digest("hex"),
    rowCount: count,
    registeredCount: count,
    skippedDuplicateCount: 0,
    uploadedBy: viewer.id,
  });
  const values = Array.from({ length: count }, (_, index) => ({
    batchId,
    format: "hometax-tax-invoice",
    evidenceType: "tax_invoice",
    dedupeKey: `limit:${batchId}:${index}`,
    issuedOn: seoulToday(),
    supplyKrw: 1000,
    vatKrw: 0,
    totalKrw: 1000,
    nameOnDocument: "상한 시험",
    createdBy: viewer.id,
  }));
  for (let at = 0; at < values.length; at += 1000) await db.insert(evidenceRecords).values(values.slice(at, at + 1000));
  return batchId;
}

test("W13 증빙 파일 받기 — 5,001건이면 비활성 + 이유 줄(aria-describedby), 5,000건이면 활성 (1280 · 1024)", async ({ page }) => {
  test.setTimeout(120_000);
  const manager = await loginIntake(page);
  const batchId = await insertLimitBatch(manager, 5_001);
  const timings: Record<string, number> = {};
  try {
    for (const width of [1280, 1024] as const) {
      const started = Date.now();
      await goto(page, width, `/expenses/evidence?state=all&batch=${batchId}`);
      const button = page.getByRole("button", { name: "파일 받기" });
      await expect(button).toBeVisible();
      timings[`5001@${width}`] = Date.now() - started;
      await expect(button).toHaveAttribute("aria-disabled", "true");
      const describedBy = await button.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`[id="${describedBy ?? ""}"]`)).toHaveText(EXPORT_LIMIT_REASON);
    }
    // 한 행을 지우면 5,000건 — 활성, 이유 줄 없음.
    const [one] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, batchId)).limit(1);
    await db.delete(evidenceRecords).where(eq(evidenceRecords.id, one!.id));
    for (const width of [1280, 1024] as const) {
      const started = Date.now();
      await goto(page, width, `/expenses/evidence?state=all&batch=${batchId}`);
      const button = page.getByRole("button", { name: "파일 받기" });
      await expect(button).toBeVisible();
      timings[`5000@${width}`] = Date.now() - started;
      await expect(button).not.toHaveAttribute("aria-disabled", "true");
      await expect(page.getByText(EXPORT_LIMIT_REASON)).toHaveCount(0);
      const overflow = await docOverflow(page);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    }
    record("W13 렌더 시간(ms) goto → 파일 받기 보임", "1280/1024", "intake", "/expenses/evidence?state=all&batch=<5001>", timings, "참고값(통과 기준 없음)", null);
  } finally {
    await db.delete(evidenceRecords).where(eq(evidenceRecords.batchId, batchId));
    await db.delete(evidenceImportBatches).where(eq(evidenceImportBatches.id, batchId));
  }
});
