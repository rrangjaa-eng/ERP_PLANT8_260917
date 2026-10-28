import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecords, expenses, projects } from "@/db/schema";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertTempRole } from "./temp-roles";
import { createIntakeManager, insertLinkFixture, insertRecordFixture } from "@/test/integration/fixtures/evidence";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { loginPage } from "./leave-org";
import { clearEvidence, evidenceTable, focusGridCell, loginAs } from "./helpers/evidence";

// 06.1-07 독립 DOM 감사(실행자가 아닌 별도 에이전트). S3 증빙 패널(≥1024 옆 패널) · 1024 미만 읽기 시트를 CI=true 프로덕션 빌드의 DOM 실측값으로만 판정한다.
// 자격(실제 권한으로 로그인 · 관리자 아님): ① 경영관리(createIntakeManager) ② 금액 못 보는 등록 계급(evidence.amount 없음) ③ 기안 PM(/expenses/evidence 404).
// 상태 여섯: S1 안 붙음 · S2 확인 필요 · S3 결재 중 붙음 · S4 승인 붙음 · S5 완료 프로젝트 반려 문서 붙음 · S6 작성 중 문서 붙음 + 60자 거래처 · 충돌.
// 항목마다 실측 · 기대 · 판정을 JSONL(AUDIT_OUT)로 남기고 expect.soft로 한 실행에서 전부 잰다.

const WIDTHS = [1280, 1024, 768, 700, 375, 320] as const;
const PANEL = (width: number) => width >= 1024;
const PHONE = (width: number) => width < 700;
const OUT = process.env.AUDIT_OUT ?? "test-results/evidence-panel-audit.jsonl";
const SHOT = process.env.AUDIT_SHOT_DIR ?? "";
const LOCK_RE = /문서에 붙음 · 금액 잠김$/;
const WARNING_RGB = "rgb(138, 90, 0)"; // tokens.css --status-warning = --amber-700 #8A5A00

function record(item: string, width: number | string, role: string, url: string, measured: unknown, expected: unknown, pass: boolean | null): void {
  mkdirSync(dirname(OUT), { recursive: true });
  const line = { item, width, role, url, measured: typeof measured === "string" ? measured : JSON.stringify(measured), expected: typeof expected === "string" ? expected : JSON.stringify(expected), pass };
  appendFileSync(OUT, `${JSON.stringify(line)}\n`);
  if (pass !== null) expect.soft(pass, `${item} @${width} ${role} ${url}: measured ${line.measured} / expected ${line.expected}`).toBe(true);
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT) return;
  mkdirSync(SHOT, { recursive: true });
  await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: false }).catch(() => undefined);
}

const TOKENS_CSS = readFileSync("docs/design/tokens.css", "utf8");
const TOKEN_COLORS = new Set([
  ...[...TOKENS_CSS.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => {
    const hex = m[1] ?? "000000";
    return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
  }),
  ...[...TOKENS_CSS.matchAll(/rgba\(([^)]+)\)/g)].map((m) => `rgba(${(m[1] ?? "").split(",").map((part) => String(Number(part.trim()))).join(", ")})`),
  "rgba(0, 0, 0, 0)",
  "rgb(0, 0, 0)",
  "rgb(255, 255, 255)",
]);
const TOKEN_RADII = new Set(["0px", ...[...TOKENS_CSS.matchAll(/--radius-[a-z-]+:\s*([0-9.]+px)/g)].map((m) => m[1] ?? "")]);

async function offTokens(page: Page, root: string): Promise<string[]> {
  const raw = await page.evaluate((selector) => {
    const out: string[] = [];
    const bodyFont = getComputedStyle(document.body).fontFamily;
    for (const scope of document.querySelectorAll(selector)) {
      for (const el of [scope, ...scope.querySelectorAll("*")]) {
        if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
        if (el.getClientRects().length === 0) continue;
        const cs = getComputedStyle(el);
        const cls = typeof el.className === "string" ? el.className.split(" ")[0]?.replace(/-module__\w+__/, ".") ?? "" : "";
        const where = `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}«${(el.textContent ?? "").trim().slice(0, 20)}»`;
        out.push(`color|${cs.color}|${where}`, `bg|${cs.backgroundColor}|${where}`, `border|${cs.borderTopColor}|${where}`, `radius|${cs.borderRadius}|${where}`);
        if (cs.fontFamily !== bodyFont) out.push(`font|${cs.fontFamily}|${where}`);
      }
    }
    return out;
  }, root);
  const bad = new Set<string>();
  for (const entry of raw) {
    const [kind, value = "", where = ""] = entry.split("|");
    if (kind === "radius") {
      if (!value.split(" ").every((part) => TOKEN_RADII.has(part) || part.endsWith("%"))) bad.add(`radius:${value}@${where}`);
    } else if (kind === "font") {
      if (!/Pretendard/.test(value)) bad.add(`font:${value}@${where}`);
    } else if (!TOKEN_COLORS.has(value)) {
      bad.add(`${kind}:${value}@${where}`);
    }
  }
  return [...bad].slice(0, 12);
}

// 문서가 넘치면(scrollWidth > clientWidth) 어느 요소가 넘치게 했는지 test-results에 남긴다(단언은 호출한 쪽 그대로 · F-12 진단).
async function docOverflow(page: Page): Promise<[number, number]> {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth] as [number, number]);
  if (sw > cw) {
    const offenders = await page.evaluate((viewport) => {
      const describe = (el: Element): string => {
        const parts: string[] = [];
        for (let node: Element | null = el; node && node !== document.documentElement && parts.length < 4; node = node.parentElement) {
          const id = node.id ? `#${node.id}` : "";
          const ui = node.getAttribute("data-ui") ? `[data-ui=${node.getAttribute("data-ui")}]` : "";
          const role = node.getAttribute("role") ? `[role=${node.getAttribute("role")}]` : "";
          parts.unshift(`${node.tagName.toLowerCase()}${id}${ui}${role}`);
        }
        return parts.join(" > ");
      };
      return [...document.querySelectorAll("*")]
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter(({ el, rect }) => (el.scrollWidth > el.clientWidth && el.clientWidth > 0) || rect.right > viewport + 0.5)
        .slice(0, 40)
        .map(({ el, rect }) => ({ selector: describe(el), text: (el.textContent ?? "").trim().slice(0, 40), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }));
    }, cw);
    await test.info().attach(`doc-overflow-${cw}.json`, { body: JSON.stringify({ url: page.url(), scrollWidth: sw, clientWidth: cw, offenders }, null, 2), contentType: "application/json" });
  }
  return [sw, cw];
}

async function axe(page: Page): Promise<string[]> {
  await page.waitForTimeout(700);
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map((v) => `${v.id}(${v.nodes.length}):${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(" | ")}`);
}

async function box(locator: Locator): Promise<{ w: number; h: number } | null> {
  const b = await locator.boundingBox().catch(() => null);
  return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null;
}
const big = (b: { w: number; h: number } | null) => !!b && b.w >= 44 && b.h >= 44;

async function activeDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "none";
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}«${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}»`;
  });
}

// 활성 요소가 그 행 거래처 칸(행 이름 버튼 또는 그 칸 td)인가.
async function focusOnOpener(opener: Locator): Promise<boolean> {
  return opener.evaluate((el) => {
    const active = document.activeElement;
    return active === el || active === el.closest("td");
  });
}

// 클릭 → dialog[open] 이 서기까지(페이지 안 performance.now) · 시트는 상세(「이력」 줄)가 오기까지도.
async function armTimer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __audit: { click?: number; open?: number; detail?: number } };
    w.__audit = {};
    document.addEventListener("pointerdown", () => (w.__audit.click ??= performance.now()), { capture: true, once: true });
    const obs = new MutationObserver(() => {
      const dialog = document.querySelector("dialog[open]");
      if (dialog && w.__audit.open === undefined) w.__audit.open = performance.now();
      if (dialog && w.__audit.detail === undefined && [...dialog.querySelectorAll("dt")].some((dt) => dt.textContent?.trim() === "이력")) {
        w.__audit.detail = performance.now();
        obs.disconnect();
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
  });
}
async function readTimer(page: Page): Promise<{ open: number | null; detail: number | null }> {
  return page.evaluate(() => {
    const t = (window as unknown as { __audit: { click?: number; open?: number; detail?: number } }).__audit;
    const ms = (v?: number) => (v !== undefined && t.click !== undefined ? Math.round(v - t.click) : null);
    return { open: ms(t.open), detail: ms(t.detail) };
  });
}

async function lockLines(dialog: Locator): Promise<string[]> {
  return dialog.evaluate((root, source) => {
    const re = new RegExp(source);
    return [...root.querySelectorAll("*")].filter((el) => el.children.length === 0 && re.test((el.textContent ?? "").trim())).map((el) => (el.textContent ?? "").trim());
  }, LOCK_RE.source);
}

async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    if (!view) throw new Error(`결재 문서를 읽지 못했다: ${approver.name}`);
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
}

const fmt = (n: number) => n.toLocaleString("en-US");

type StateKey = "s1" | "s2" | "s3" | "s4" | "s5" | "s6";
const STATES: { key: StateKey; label: string; primary: number; lock: string | null; editable: boolean; dirty: boolean }[] = [
  { key: "s1", label: "S1 안 붙음 · dirty", primary: 1, lock: null, editable: true, dirty: true },
  { key: "s2", label: "S2 확인 필요", primary: 1, lock: null, editable: true, dirty: false },
  { key: "s3", label: "S3 결재 중 붙음", primary: 0, lock: "결재 중 문서에 붙음 · 금액 잠김", editable: false, dirty: false },
  { key: "s4", label: "S4 승인 붙음", primary: 0, lock: "승인됨 문서에 붙음 · 금액 잠김", editable: false, dirty: false },
  { key: "s5", label: "S5 완료 프로젝트 반려 문서 붙음 · dirty", primary: 1, lock: null, editable: true, dirty: true },
  { key: "s6", label: "S6 작성 중 문서 붙음", primary: 0, lock: "작성 중 문서에 붙음 · 금액 잠김", editable: false, dirty: false },
];

type Seed = { fx: ExpenseE2E; managerRole: string; noAmountRole: string; names: Record<StateKey | "long", string>; ids: Record<StateKey | "long", string> };
let seed: Seed;

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const baseURL = testInfo.project.use.baseURL;
  await clearEvidence();
  const fx = await setupExpenseE2E();
  const m = await createIntakeManager("감사경영07");
  if (!m.roleId) throw new Error("계급 없음");
  // ② 금액 못 보는 등록 계급 — evidence.intake 쓰기 · evidence 보기 · evidence.value만(evidence.amount 없음).
  const noAmountRole = `role-e2e-audit07-${randomUUID()}`;
  await insertTempRole(SYSTEM_VIEWER, { id: noAmountRole, name: `E2E 감사 금액없음 ${noAmountRole.slice(-8)}`, sortOrder: 99, viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: noAmountRole, menu: "evidence.intake", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: noAmountRole, menu: "evidence", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: noAmountRole, infoItem: "evidence.value", visible: true });

  const returned = await submitLineExpense(browser, baseURL, fx, "tracer");
  const inReview = await submitLineExpense(browser, baseURL, fx, "hold");
  const approved = await submitLineExpense(browser, baseURL, fx, "retry");
  await approveAll(fx, approved);
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: returned });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  // 완료 프로젝트는 새 지출결의를 못 만든다 — 작성 중 문서를 먼저 만들고 완료로 바꾼다.
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.phone.id] });
  const draftId = created.created[0]?.expenseId;
  if (!draftId) throw new Error("작성 중 문서 없음");
  await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
  const [draft] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, draftId));
  if (draft?.number) throw new Error("작성 중 문서에 번호가 있다");

  const s = randomUUID().slice(0, 4);
  const names = {
    s1: `감사안붙음${s}`,
    s2: `감사확인필요${s}`,
    s3: `감사결재중${s}`,
    s4: `감사승인${s}`,
    s5: `감사반려완료${s}`,
    s6: `감사작성중${s}`,
    long: `감사긴거래처${s}`.padEnd(60, "가나다라마바사아자차카타파하"),
  };
  const amounts = { supplyKrw: 1_000_000, vatKrw: 100_000 };
  const ids = {
    s1: await insertRecordFixture(m, { ...amounts, nameOnDocument: names.s1, issuedOn: "2026-09-27" }),
    s2: await insertRecordFixture(m, { ...amounts, nameOnDocument: names.s2, issuedOn: "2026-09-26" }),
    s3: await insertRecordFixture(m, { ...amounts, nameOnDocument: names.s3, issuedOn: "2026-09-25" }),
    s4: await insertRecordFixture(m, { ...amounts, nameOnDocument: names.s4, issuedOn: "2026-09-24" }),
    s5: await insertRecordFixture(m, { ...amounts, nameOnDocument: names.s5, issuedOn: "2026-09-23" }),
    s6: await insertRecordFixture(m, { ...amounts, nameOnDocument: names.s6, issuedOn: "2026-09-22" }),
    long: await insertRecordFixture(m, { ...amounts, nameOnDocument: names.long, issuedOn: "2026-09-21" }),
  };
  await db.update(evidenceRecords).set({ needsCheck: "사업자번호 틀림 · 거래처 확인" }).where(eq(evidenceRecords.id, ids.s2));
  await insertLinkFixture({ recordId: ids.s3, ownerId: inReview, attachedBy: m.id });
  await insertLinkFixture({ recordId: ids.s4, ownerId: approved, attachedBy: m.id });
  await insertLinkFixture({ recordId: ids.s5, ownerId: returned, attachedBy: m.id });
  await insertLinkFixture({ recordId: ids.s6, ownerId: draftId, attachMode: "author", attachedBy: fx.pm.viewer.id });
  seed = { fx, managerRole: m.roleId, noAmountRole, names, ids };
});

function opener(page: Page, name: string): Locator {
  return evidenceTable(page).locator('[role="button"][aria-haspopup="dialog"]', { hasText: name }).first();
}

async function serverAmounts(id: string): Promise<{ supply: number; vat: number; total: number }> {
  const [row] = await db.select({ supply: evidenceRecords.supplyKrw, vat: evidenceRecords.vatKrw }).from(evidenceRecords).where(eq(evidenceRecords.id, id));
  if (!row) throw new Error("기록 없음");
  return { supply: Number(row.supply), vat: Number(row.vat), total: Number(row.supply) + Number(row.vat) };
}

const URL = "/expenses/evidence?state=all";
const ROLE = "①경영관리";

for (const width of WIDTHS) {
  test(`${width} — 목록 · 상태 여섯 · 60자 · 충돌(①경영관리)`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width, height: 900 });
    await loginAs(page, seed.managerRole);
    const response = await page.goto(URL);
    record("응답 코드", width, ROLE, URL, response?.status() ?? null, 200, response?.status() === 200);
    await expect(opener(page, seed.names.s1)).toBeVisible();
    const [sw, cw] = await docOverflow(page);
    record("문서 scrollWidth <= clientWidth(목록)", width, ROLE, URL, `${sw}/${cw}`, "scrollWidth <= clientWidth", sw <= cw);
    { const v = await axe(page); record("axe 위반(목록)", width, ROLE, URL, v, [], v.length === 0); }
    await shot(page, `list-${width}`);

    // 행 이름 버튼(거래처 칸) 크기 · 1024 미만 행 탭 대상(접힌 줄).
    const nameBox = await box(opener(page, seed.names.s1));
    const collapsedTap = page.locator(`td[role="button"][aria-label*="${seed.names.s1}"]`);
    const tapBox = (await collapsedTap.count()) > 0 ? await box(collapsedTap.first()) : null;
    if (PHONE(width)) {
      record("폰 행 탭 대상(접힌 줄 td) ≥ 44×44", width, ROLE, URL, tapBox, "≥ 44×44", big(tapBox));
      record("폰 거래처 칸 행 이름 버튼 크기(같은 시트를 여는 둘째 대상)", width, ROLE, URL, nameBox, "≥ 44 높이(§3 행 탭 대상)", !!nameBox && nameBox.h >= 44);
    } else if (!PANEL(width)) {
      record("700~1023 행 이름 버튼 크기(시트로 가는 유일한 길 · 참고)", width, ROLE, URL, { name: nameBox, collapsedTap: tapBox }, "—", null);
    } else {
      record("행 이름 버튼 크기(참고)", width, ROLE, URL, nameBox, "—", null);
    }

    for (const state of STATES) {
      const name = seed.names[state.key];
      const where = `${URL} ${state.label}`;
      const open = opener(page, name);
      await armTimer(page);
      await open.click();
      if (PANEL(width)) {
        const panel = page.getByRole("dialog", { name: `세금계산서 · ${name}` });
        await expect(panel).toBeVisible();
        await expect(panel.locator("dt", { hasText: /^이력$/ })).toHaveCount(1);
        const t = await readTimer(page);
        record("패널 열림 지연 ms(클릭 → dialog[open])", width, ROLE, where, t.open, "≤ 300(§7-7 지연 표시 없음)", t.open !== null && t.open <= 300);
        const primary = panel.locator('[data-ui="primary-button"]');
        record("패널 1차 버튼 수", width, ROLE, where, await primary.count(), state.primary, (await primary.count()) === state.primary);
        // 패널은 showModal — 뒤 목록은 비활성이다. 뒤 목록의 1차(공개 범위 저장)는 다른 면이라 참고로만 적는다.
        const behind = await page.evaluate(() => [...document.querySelectorAll('[data-ui="primary-button"]')].filter((e) => e.getClientRects().length > 0 && !e.closest("dialog")).map((e) => (e.textContent ?? "").trim()));
        record("뒤 목록에 보이는 1차(참고 — 모달 뒤 비활성 면)", width, ROLE, where, behind, "—", null);
        const locks = await lockLines(panel);
        record("잠김 줄 글자", width, ROLE, where, locks, state.lock ? [state.lock] : [], JSON.stringify(locks) === JSON.stringify(state.lock ? [state.lock] : []));
        const inputs = await panel.locator("input:not([type=hidden])").count();
        const supplyInput = panel.getByRole("textbox", { name: "공급가" });
        const supplyTag = (await supplyInput.count()) > 0 ? "input" : (await panel.locator("dt", { hasText: /^공급가$/ }).count()) > 0 ? "text" : "none";
        record("공급가 칸 태그", width, ROLE, where, { supplyTag, inputs }, state.editable ? "input" : "text", supplyTag === (state.editable ? "input" : "text"));
        const nativeDisabled = await panel.locator("button[disabled]").count();
        record("패널 네이티브 disabled 버튼 0", width, ROLE, where, nativeDisabled, 0, nativeDisabled === 0);
        const close = panel.getByRole("button", { name: "닫기", exact: true });
        record("닫기 x 접근 이름 「닫기」", width, ROLE, where, await close.count(), 1, (await close.count()) === 1);
        const initial = await activeDescription(page);
        record("열린 직후 포커스(편집이면 공급가 칸)", width, ROLE, where, initial, state.editable ? "input#evidence-panel-supply" : "패널 안", state.editable ? initial.startsWith("input#evidence-panel-supply") : await panel.evaluate((el) => el.contains(document.activeElement)));
        const pw = await panel.evaluate((el) => [el.scrollWidth, el.clientWidth, Math.round(el.getBoundingClientRect().width)]);
        record("패널 가로 넘침 0 · 폭(480)", width, ROLE, where, pw, "scrollWidth <= clientWidth · 480", (pw[0] ?? 0) <= (pw[1] ?? 0) && pw[2] === 480);
        { const v = await axe(page); record("axe 위반(패널)", width, ROLE, where, v, [], v.length === 0); }
        const off = await offTokens(page, "dialog[open]");
        record("토큰 밖 색 · 서체 · radius(패널)", width, ROLE, where, off, [], off.length === 0);
        const expenseLinks = await panel.locator('a[href*="/expenses/"]').count();
        if (state.key === "s6") record("작성 중 문서 붙음 — 패널 a[href*=/expenses/] 0 · `작성 중 문서`", width, ROLE, where, { links: expenseLinks, text: (await panel.textContent())?.includes("작성 중 문서") }, { links: 0, text: true }, expenseLinks === 0 && !!(await panel.textContent())?.includes("작성 중 문서"));
        else if (state.key !== "s1" && state.key !== "s2") record("붙은 문서 링크 수(참고)", width, ROLE, where, expenseLinks, "—", null);

        const server = await serverAmounts(seed.ids[state.key]);
        if (state.editable) {
          const preview = panel.locator("#evidence-panel-preview");
          const expectPreview = `세액 ${fmt(server.vat)} · 합계 ${fmt(server.total)}`;
          await expect.soft(preview).toHaveText(expectPreview);
          record("입력 아래 줄 = 서버 값(열 때)", width, ROLE, where, (await preview.textContent())?.trim() ?? null, expectPreview, (await preview.textContent())?.trim() === expectPreview);
          const style = await supplyInput.evaluate((el) => ({ numeric: getComputedStyle(el).fontVariantNumeric, align: getComputedStyle(el).textAlign, h: Math.round(el.getBoundingClientRect().height) }));
          record("공급가 칸 tabular-nums · text-align right", width, ROLE, where, style, { numeric: "tabular-nums", align: "right" }, style.numeric.includes("tabular-nums") && style.align === "right");
          const previewNum = await preview.locator("span", { hasText: /^[\d,]+$/ }).first().evaluate((el) => ({ numeric: getComputedStyle(el).fontVariantNumeric })).catch(() => null);
          record("입력 아래 줄 금액 tabular-nums", width, ROLE, where, previewNum, "tabular-nums", !!previewNum && previewNum.numeric.includes("tabular-nums"));
          // 입력 아래 줄 낱말 간격 — 텍스트 노드 · 금액 요소 사이 x 간격(px).
          const gaps = await preview.evaluate((el) => {
            const parts: { text: string; left: number; right: number }[] = [];
            // 글자를 한 덩이(안쪽 span 하나)로 감쌌으면 그 안의 조각 사이를 잰다(06.1-07 D-3 고침 뒤 — 겉 조각 하나만 재면 빈 판정이다).
            const root = el.childNodes.length === 1 && el.firstElementChild ? el.firstElementChild : el;
            for (const node of root.childNodes) {
              const range = document.createRange();
              range.selectNodeContents(node);
              const rects = [...range.getClientRects()].filter((r) => r.width > 0);
              const first = rects[0];
              const last = rects[rects.length - 1];
              if (!first || !last) continue;
              parts.push({ text: (node.textContent ?? "").trim(), left: first.left, right: last.right });
            }
            const style = getComputedStyle(el);
            return { display: style.display, gap: style.columnGap, parts: parts.map((p) => p.text), gaps: parts.slice(1).map((p, i) => Math.round(p.left - (parts[i]?.right ?? 0))) };
          });
          record("입력 아래 줄 간격(세액 · 금액 · 「· 합계」 · 금액 사이 px — 낱말 간격 ≈ 4)", width, ROLE, where, gaps, "모든 간격 ≤ 6(한 칸 띄움)", gaps.gaps.every((g) => g <= 6));
          if (state.key === "s1") {
            const reasonId = await panel.locator('[data-ui="primary-button"]').getAttribute("aria-describedby");
            const ariaDisabled = await panel.locator('[data-ui="primary-button"]').getAttribute("aria-disabled");
            const reason = reasonId ? await page.locator(`[id="${reasonId}"]`).textContent() : null;
            record("바뀐 칸 없음 — 1차 aria-disabled + describedby 글자", width, ROLE, where, { ariaDisabled, reason }, { ariaDisabled: "true", reason: "바뀐 칸 없음" }, ariaDisabled === "true" && reason?.trim() === "바뀐 칸 없음");
          }
        }
        if (state.key === "s2") {
          const primaryText = (await primary.textContent())?.trim() ?? "";
          record("확인 필요 1차 글자", width, ROLE, where, primaryText, "확인 필요 풀기…", primaryText.startsWith("확인 필요 풀기"));
          const word = panel.locator("dd").first();
          const wordInfo = await word.evaluate((dd) => {
            const leaf = [...dd.querySelectorAll("*")].find((el) => el.children.length === 0 && el.textContent?.trim() === "확인 필요");
            return { text: (dd.textContent ?? "").trim(), color: leaf ? getComputedStyle(leaf).color : null };
          });
          record("확인 필요 줄 글자 · 낱말 computed 색 = --status-warning", width, ROLE, where, wordInfo, { text: "확인 필요 · 사업자번호 틀림 · 거래처 확인", color: WARNING_RGB }, wordInfo.text === "확인 필요 · 사업자번호 틀림 · 거래처 확인" && wordInfo.color === WARNING_RGB);
          const ariaDisabled = await primary.getAttribute("aria-disabled");
          record("확인 필요 1차 열림(aria-disabled 없음)", width, ROLE, where, ariaDisabled, null, ariaDisabled !== "true");
        }
        await shot(page, `panel-${state.key}-${width}`);

        if (state.dirty) {
          const next = server.supply - 10_000;
          await supplyInput.fill(fmt(next));
          const preview = panel.locator("#evidence-panel-preview");
          const expectPreview = `세액 ${fmt(server.total - next)} · 합계 ${fmt(server.total)}`;
          await expect.soft(preview).toHaveText(expectPreview, { timeout: 5_000 });
          record("고친 뒤 입력 아래 줄 = 서버 미리 보기(합계 − 공급가)", width, ROLE, where, (await preview.textContent())?.trim() ?? null, expectPreview, (await preview.textContent())?.trim() === expectPreview);
          const ariaDisabled = await primary.getAttribute("aria-disabled");
          record("dirty 1차 열림", width, ROLE, where, ariaDisabled, null, ariaDisabled !== "true");
          await shot(page, `panel-${state.key}-dirty-${width}`);
          await page.keyboard.press("Escape");
          const discard = page.getByRole("dialog", { name: "입력 버리기" });
          const discardVisible = await discard.waitFor({ timeout: 3_000 }).then(() => true).catch(() => false);
          record("dirty 닫기 → 「입력 버리기」 창", width, ROLE, where, discardVisible, true, discardVisible);
          if (discardVisible) {
            await discard.getByRole("button", { name: /^입력 버리기/ }).click();
          }
        } else {
          await page.keyboard.press("Escape");
        }
        await expect(panel).toBeHidden();
        const back = await focusOnOpener(open);
        record("패널 닫힌 뒤 포커스 = 연 칸", width, ROLE, where, await activeDescription(page), "거래처 칸(행 이름 버튼 · td)", back);
      } else {
        const sheet = page.getByRole("dialog", { name });
        await expect(sheet).toBeVisible();
        await expect(sheet.locator("dt", { hasText: /^이력$/ })).toHaveCount(1);
        const t = await readTimer(page);
        record("시트 열림 지연 ms(클릭 → dialog[open] / 상세 줄)", width, ROLE, where, t, "열림 ≤ 300", t.open !== null && t.open <= 300);
        const primary = await sheet.locator('[data-ui="primary-button"]').count();
        record("시트 1차 버튼 수(1024 미만 = 0)", width, ROLE, where, primary, 0, primary === 0);
        const inputs = await sheet.locator("input, textarea, select").count();
        record("시트 입력 칸 0 · 공급가 글자", width, ROLE, where, { inputs, supplyText: (await sheet.locator("dt", { hasText: /^공급가$/ }).count()) > 0 }, { inputs: 0, supplyText: true }, inputs === 0 && (await sheet.locator("dt", { hasText: /^공급가$/ }).count()) > 0);
        const locks = await lockLines(sheet);
        record("시트 잠김 줄 ≤ 1(참고 — 읽기 시트)", width, ROLE, where, locks, "≤ 1", locks.length <= 1);
        const closeBtn = sheet.getByRole("button", { name: "닫기", exact: true });
        const closeBox = await box(closeBtn.first());
        if (PHONE(width)) record("폰 시트 닫기 x ≥ 44×44", width, ROLE, where, closeBox, "≥ 44×44", big(closeBox));
        else record("시트 닫기 x 크기(참고)", width, ROLE, where, closeBox, "—", null);
        const sw2 = await sheet.evaluate((el) => [el.scrollWidth, el.clientWidth]);
        record("시트 가로 넘침 0", width, ROLE, where, sw2, "scrollWidth <= clientWidth", (sw2[0] ?? 0) <= (sw2[1] ?? 0));
        const [dsw, dcw] = await docOverflow(page);
        record("문서 scrollWidth <= clientWidth(시트 열림)", width, ROLE, where, `${dsw}/${dcw}`, "scrollWidth <= clientWidth", dsw <= dcw);
        { const v = await axe(page); record("axe 위반(시트)", width, ROLE, where, v, [], v.length === 0); }
        const off = await offTokens(page, "dialog[open]");
        record("토큰 밖 색 · 서체 · radius(시트)", width, ROLE, where, off, [], off.length === 0);
        if (state.key === "s6") {
          const links = await sheet.locator('a[href*="/expenses/"]').count();
          record("작성 중 문서 붙음 — 시트 a[href*=/expenses/] 0", width, ROLE, where, links, 0, links === 0);
        }
        await shot(page, `sheet-${state.key}-${width}`);
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        const active = await activeDescription(page);
        record("시트 닫힌 뒤 포커스 = 연 칸", width, ROLE, where, active, "거래처 칸(행 이름 버튼 · td)", await focusOnOpener(open));
      }
    }

    // 60자 거래처.
    {
      const name = seed.names.long;
      const where = `${URL} 60자 거래처`;
      await opener(page, name).click();
      const dialog = PANEL(width) ? page.getByRole("dialog", { name: `세금계산서 · ${name}` }) : page.getByRole("dialog", { name });
      await expect(dialog).toBeVisible();
      const m = await dialog.evaluate((el) => {
        const title = el.querySelector("h1, h2, h3");
        return { dialog: [el.scrollWidth, el.clientWidth], title: title ? [title.scrollWidth, title.clientWidth] : null };
      });
      record("60자 거래처 — 패널 · 시트 scrollWidth <= clientWidth", width, ROLE, where, m, "넘침 없음", (m.dialog[0] ?? 0) <= (m.dialog[1] ?? 0) && (!m.title || (m.title[0] ?? 0) <= (m.title[1] ?? 0)));
      const [dsw, dcw] = await docOverflow(page);
      record("60자 거래처 — 문서 scrollWidth <= clientWidth", width, ROLE, where, `${dsw}/${dcw}`, "scrollWidth <= clientWidth", dsw <= dcw);
      await shot(page, `long-${width}`);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }

    if (PANEL(width)) {
      // 키보드 경로: 거래처 칸 Enter → 패널 → Esc → 포커스 = 그 칸.
      const cell = opener(page, seed.names.s4).locator("xpath=ancestor::td[1]");
      await focusGridCell(cell);
      await cell.press("Enter");
      const panel = page.getByRole("dialog", { name: `세금계산서 · ${seed.names.s4}` });
      await expect(panel).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      record("Enter로 연 패널 닫힌 뒤 포커스 = 그 td", width, ROLE, `${URL} S4 Enter`, await activeDescription(page), "td(거래처 칸)", await cell.evaluate((el) => document.activeElement === el));

      // 충돌: 다른 세션이 먼저 바꿈 → FormAlert · 꼬리 새로 고침 · 누른 뒤 서버 값 · 포커스.
      const id = seed.ids.s1;
      const before = await serverAmounts(id);
      await opener(page, seed.names.s1).click();
      const c = page.getByRole("dialog", { name: `세금계산서 · ${seed.names.s1}` });
      await expect(c).toBeVisible();
      const supply = c.getByRole("textbox", { name: "공급가" });
      await supply.fill(fmt(before.supply - 10_000));
      const bumped = before.supply - 50_000;
      await db
        .update(evidenceRecords)
        .set({ supplyKrw: bumped, vatKrw: before.total - bumped, version: sql`${evidenceRecords.version} + 1`, updatedAt: sql`(now() at time zone 'UTC')` })
        .where(eq(evidenceRecords.id, id));
      await c.locator('[data-ui="primary-button"]').click();
      const alert = c.getByRole("alert");
      await expect.soft(alert).toContainText(/다른 사람이/, { timeout: 10_000 });
      const where = `${URL} 충돌`;
      const alertText = ((await alert.textContent().catch(() => null)) ?? "").trim();
      record("충돌 FormAlert 글자 `다른 사람이 {HH:mm}에 바꿈 · 새로 고침`", width, ROLE, where, alertText, "다른 사람이 HH:mm에 바꿈 · 새로 고침", /^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/.test(alertText));
      record("충돌 뒤 패널 열림 · 입력 값 유지", width, ROLE, where, { visible: await c.isVisible(), value: await supply.inputValue() }, { visible: true, value: fmt(before.supply - 10_000) }, (await c.isVisible()) && (await supply.inputValue()) === fmt(before.supply - 10_000));
      const refresh = alert.getByRole("button", { name: "새로 고침" });
      record("충돌 꼬리 `새로 고침` 버튼 수", width, ROLE, where, await refresh.count(), 1, (await refresh.count()) === 1);
      await shot(page, `panel-conflict-${width}`);
      const refreshBox = await box(refresh.first());
      record("충돌 `새로 고침` 크기(참고)", width, ROLE, where, refreshBox, "—", null);
      // 느린 러너 재현(PR #254 CI e2e (2)) — CPU를 늦추면 rAF가 React 커밋보다 먼저 돌아 포커스가 body로 떨어졌다(로컬 10/10). 새로 고침 · 포커스 실측 동안만 늦춘다.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
      await refresh.first().click();
      await expect.soft(c.getByRole("textbox", { name: "공급가" })).toHaveValue(fmt(bumped));
      const after = await c.getByRole("textbox", { name: "공급가" }).inputValue();
      record("새로 고침 뒤 입력 = 새 서버 값 · 알림 0", width, ROLE, where, { value: after, alerts: await c.getByRole("alert").count() }, { value: fmt(bumped), alerts: 0 }, after === fmt(bumped) && (await c.getByRole("alert").count()) === 0);
      await page.waitForTimeout(200);
      const active = await activeDescription(page);
      record("새로 고침 뒤 포커스 = 공급가 칸", width, ROLE, where, active, "input#evidence-panel-supply", active.startsWith("input#evidence-panel-supply"));
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await cdp.detach();
      await page.keyboard.press("Escape");
      await expect(c).toBeHidden();
    }
  });
}

test("권한 — ② 금액 못 보는 등록 계급 패널 · ③ 기안 PM 404", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  for (const width of [1280, 375] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.context().clearCookies();
    await loginAs(page, seed.noAmountRole);
    const response = await page.goto(URL);
    const role = "②금액 못 보는 등록";
    record("응답 코드", width, role, URL, response?.status() ?? null, 200, response?.status() === 200);
    await expect(opener(page, seed.names.s1)).toBeVisible();
    const tableText = (await evidenceTable(page).textContent()) ?? "";
    record("목록에 금액(1,000,000 · 1,100,000) 안 보임", width, role, URL, { supply: tableText.includes("1,000,000"), total: tableText.includes("1,100,000") }, { supply: false, total: false }, !tableText.includes("1,000,000") && !tableText.includes("1,100,000"));
    await opener(page, seed.names.s1).click();
    const dialog = PANEL(width) ? page.getByRole("dialog", { name: `세금계산서 · ${seed.names.s1}` }) : page.getByRole("dialog", { name: seed.names.s1 });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("dt", { hasText: /^이력$/ })).toHaveCount(1);
    const text = (await dialog.textContent()) ?? "";
    const m = { inputs: await dialog.locator("input:not([type=hidden])").count(), primary: await dialog.locator('[data-ui="primary-button"]').count(), amount: /1,000,000|1,100,000|100,000/.test(text) };
    record("패널 · 시트 금액 · 입력 · 1차 0", width, role, `${URL} S1`, m, { inputs: 0, primary: 0, amount: false }, m.inputs === 0 && m.primary === 0 && !m.amount);
    await shot(page, `noamount-${width}`);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  const pm = await loginPage(browser, baseURL, seed.fx.pm);
  for (const width of [1280, 375] as const) {
    await pm.setViewportSize({ width, height: 900 });
    const response = await pm.goto(URL);
    const status = response?.status() ?? null;
    const buttons = await pm.locator('[role="button"][aria-haspopup="dialog"]').count();
    record("③기안PM /expenses/evidence 404 · 행 열기 0", width, "③기안PM", URL, { status, buttons }, { status: 404, buttons: 0 }, status === 404 && buttons === 0);
  }
  await pm.context().close();
});
