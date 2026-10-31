import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecordLinks, evidenceRecords, expenses, visibilityMatrix } from "@/db/schema";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createPurchaseRequest, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { countEvidencePool } from "@/domain/evidence-records/pool";
import { createIntakeManager, insertLinkFixture, insertRecordFixture } from "@/test/integration/fixtures/evidence";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { clearEvidence, createIntakeRole, loginAs } from "./helpers/evidence";
import { measurePhoneRows } from "./helpers/phone-rows";

// 06.1-06 독립 DOM 감사(실행자가 아닌 별도 에이전트). 판정은 CI=true 프로덕션 빌드의 DOM 실측값으로만 한다(스크린샷 육안 금지).
// 자격(실제 권한으로 로그인 · 관리자 아님): ① 경영관리 두 키(createIntakeManager) ② ①+expenses.payments ③ 기안 PM ④ evidence.intake만
// ⑤ 등록만(expenses 보기 · 두 키 없음). 항목마다 실측 · 기대 · 판정을 JSONL(AUDIT_OUT)로 남기고 expect.soft로 한 실행에서 전부 잰다.

const WIDTHS = [1280, 768, 375, 320] as const;
const PHONE = (width: number) => width < 768;
const OUT = process.env.AUDIT_OUT ?? "test-results/evidence-attach-audit.jsonl";
const SHOT = process.env.AUDIT_SHOT_DIR ?? "";
const LOCK_RE = /^(결재 중 · 증빙은 경영관리|완료 프로젝트 · 증빙은 경영관리|결재 중 · 떼기 없음|승인됨 · 떼기는 증빙 무효 담당|결재 중 · 증빙 잠김|승인 뒤 · 증빙 삭제 잠김|결재 중 아님 · 증빙은 작성자)$/;

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

// tokens.css 색(16진 · rgba) · radius 값. 「토큰 밖」 = 이 집합에 없는 계산 값.
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

// root 아래 요소의 색 · 배경 · 테두리 색 · 서체 · radius 중 토큰 밖 값(자리 포함).
async function offTokens(page: Page, root: string): Promise<string[]> {
  const raw = await page.evaluate((selector) => {
    const out: string[] = [];
    const bodyFont = getComputedStyle(document.body).fontFamily;
    for (const scope of document.querySelectorAll(selector)) {
      for (const el of [scope, ...scope.querySelectorAll("*")]) {
        if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
        // 그려지지 않은 요소(닫힌 dialog 안 · display none)는 화면 색이 아니다.
        if (el.getClientRects().length === 0) continue;
        const cs = getComputedStyle(el);
        const cls = typeof el.className === "string" ? el.className.split(" ")[0]?.replace(/-module__\w+__/, ".") ?? "" : "";
        const where = `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}«${(el.textContent ?? "").trim().slice(0, 20)}»`;
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
      // 숫자 · 폼 기본 서체를 상속하지 않는 요소(button · textarea)는 토큰 --font-sans와 같은지만 본다.
      if (!/Pretendard/.test(value)) bad.add(`font:${value}@${where}`);
    } else if (!TOKEN_COLORS.has(value)) {
      bad.add(`${kind}:${value}@${where}`);
    }
  }
  return [...bad].slice(0, 12);
}

async function docOverflow(page: Page): Promise<[number, number]> {
  return page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth] as [number, number]);
}

// 모달 · 시트의 여는 전환(§5 모션)이 끝난 뒤 잰다 — 전환 중 중간 색을 대비 위반으로 읽지 않게(1 · 2차 실행에서 같은 요소가 번갈아 걸렸다).
async function axe(page: Page): Promise<string[]> {
  await page.waitForTimeout(700);
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map((v) => {
    const node = v.nodes[0];
    const data = node?.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
    const extra = data?.contrastRatio ? ` [${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}]` : "";
    return `${v.id}(${v.nodes.length}):${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(" | ")}${extra}`;
  });
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
    const row = el.closest("tr");
    return `${el.tagName.toLowerCase()}«${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}»${row ? ` in tr«${(row.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}»` : ""}`;
  });
}

// 「증빙」 섹션 = div#evidence의 부모(DetailScreen.Section). 잠김 줄 = 알려진 잠김 글자와 같은 잎 요소.
async function sectionLockLines(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const re = new RegExp(source);
    const section = document.getElementById("evidence")?.parentElement;
    if (!section) return ["섹션 없음"];
    return [...section.querySelectorAll("*")].filter((el) => el.children.length === 0 && re.test((el.textContent ?? "").trim())).map((el) => (el.textContent ?? "").trim());
  }, LOCK_RE.source);
}

// 반려 문서 붙임 기록(참고) — 살아 있음 · 뗀 사유. 케이스 경계마다 남겨 붙임 수 변화를 추적한다.
async function linkSnapshot(stage: string): Promise<void> {
  const rows = await db
    .select({ name: evidenceRecords.nameOnDocument, detachedAt: evidenceRecordLinks.detachedAt, reason: evidenceRecordLinks.detachReason })
    .from(evidenceRecordLinks)
    .innerJoin(evidenceRecords, eq(evidenceRecords.id, evidenceRecordLinks.evidenceRecordId))
    .where(eq(evidenceRecordLinks.ownerId, seed.returned.expenseId));
  record(`반려 문서 붙임 기록 — ${stage}(참고)`, "-", "db", "db", rows.map((row) => `${row.name}:${row.detachedAt ? `뗌(${row.reason})` : "살아 있음"}`), "—", null);
}

function block(page: Page): Locator {
  return page.locator("#evidence + div");
}

function rowOf(page: Page, text: string): Locator {
  return page.locator("main table tbody tr:visible").filter({ hasText: text }).first();
}

async function returnedExpense(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E): Promise<{ expenseId: string; number: string }> {
  const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  return { expenseId, number: await numberOf(expenseId) };
}

async function numberOf(expenseId: string): Promise<string> {
  const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row?.number) throw new Error("번호 없음");
  return row.number;
}

async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    if (!view) throw new Error(`결재 문서를 읽지 못했다: ${approver.name}`);
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
}

const PURCHASER_VISIBLE = ["purchase_request.value", "purchase_request.amount", "project.value", "card_usage.value", "card_usage.amount", "team.value", "vendor.value"];

async function teamCostRequest(): Promise<{ id: string; number: string }> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E감사구매본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E감사구매팀-${suffix}` });
  const requester = await makePerson("감사요청", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const input = { linkKind: "team_cost" as const, itemName: `감사 소모품-${suffix}`, linkUrl: null, estimate: { currency: "KRW" as const, amount: 110_000, fxRate: 1 }, memo: null };
  const created = await createPurchaseRequest(requester.viewer, input, await precheckPurchaseRequest(requester.viewer, input));
  return { id: created.id, number: created.number };
}

async function makePurchaser(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E감사구매처리-${suffix}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of PURCHASER_VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E감사처리본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E감사처리팀-${suffix}` });
  return makePerson("감사처리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

type Seed = {
  fx: ExpenseE2E;
  manager: { roleId: string; id: string };
  managerPay: { roleId: string; id: string };
  registrarOnly: { roleId: string; id: string };
  intakeOnlyRole: string;
  returned: { expenseId: string; number: string };
  inReview: { expenseId: string; number: string };
  approved: { expenseId: string; number: string };
  names: { open: string; open2: string; check: string; card: string; linked: string; draft: string };
  purchase: { id: string; number: string };
  purchaser: Person;
  pmSeesEvidenceAmount: boolean;
};
let seed: Seed;

// 케이스마다 자료 한 벌(beforeEach) — A · A2가 후보를 붙여 소진하면 B의 결재 중 트리거 기대가 앞 케이스의 성공 · 실패(워커 재시작 뒤 beforeAll 재실행)에
// 따라 갈렸다(06.1-08 감사 ③ 실측). 케이스끼리 자료를 나눠 쓰지 않는다.
test.beforeEach(async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const baseURL = testInfo.project.use.baseURL;
  await clearEvidence();
  const fx = await setupExpenseE2E();
  const m = await createIntakeManager("감사경영");
  const mp = await createIntakeManager("감사경영지급", { payments: true });
  const ro = await createIntakeManager("감사등록만", { attach: false, void: false });
  if (!m.roleId || !mp.roleId || !ro.roleId) throw new Error("계급 없음");
  const returned = await returnedExpense(browser, baseURL, fx);
  const inReviewId = await submitLineExpense(browser, baseURL, fx, "hold");
  const approvedId = await submitLineExpense(browser, baseURL, fx, "retry");
  await approveAll(fx, approvedId);
  const s = randomUUID().slice(0, 4);
  const names = { open: `감사붙일곳${s}`, open2: `감사붙일둘${s}`, check: `감사확인필요${s}`, card: `감사카드${s}`, linked: `감사붙음${s}`, draft: `감사작성중${s}` };
  await insertRecordFixture(m, { nameOnDocument: names.open, issuedOn: "2026-09-25" });
  await insertRecordFixture(m, { nameOnDocument: names.open2, issuedOn: "2026-09-24" });
  const checkId = await insertRecordFixture(m, { nameOnDocument: names.check, issuedOn: "2026-09-23" });
  await db.update(evidenceRecords).set({ needsCheck: "취소 줄 있음" }).where(eq(evidenceRecords.id, checkId));
  const cardId = await insertRecordFixture(m, { nameOnDocument: names.card, issuedOn: "2026-09-22", evidenceType: "card" });
  await db.update(evidenceRecords).set({ format: "card-shinhan", cardLast4: "1234", corpCardId: null }).where(eq(evidenceRecords.id, cardId));
  const linkedId = await insertRecordFixture(m, { nameOnDocument: names.linked, issuedOn: "2026-09-21", supplyKrw: 300_000, vatKrw: 30_000 });
  await insertLinkFixture({ recordId: linkedId, ownerId: returned.expenseId, attachedBy: m.id });
  const draft = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.phone.id] });
  const draftId = draft.created[0]?.expenseId;
  if (!draftId) throw new Error("작성 중 문서 없음");
  await insertLinkFixture({ recordId: await insertRecordFixture(m, { nameOnDocument: names.draft, issuedOn: "2026-09-20" }), ownerId: draftId, attachMode: "author", attachedBy: fx.pm.viewer.id });
  // 결재 중 · 승인 문서에 붙은 기록 하나씩(작성자 갈래 붙임 · 경영관리 붙임).
  await insertLinkFixture({ recordId: await insertRecordFixture(m, { nameOnDocument: `감사결재중${s}`, issuedOn: "2026-09-19" }), ownerId: inReviewId, attachedBy: m.id });
  await insertLinkFixture({ recordId: await insertRecordFixture(m, { nameOnDocument: `감사승인${s}`, issuedOn: "2026-09-18" }), ownerId: approvedId, attachedBy: m.id });
  const purchase = await teamCostRequest();
  for (let i = 0; i < 2; i += 1) {
    await insertLinkFixture({ recordId: await insertRecordFixture(m, { nameOnDocument: `감사구매${i}${s}`, issuedOn: "2026-09-17", supplyKrw: 100_000, vatKrw: 10_000 }), ownerKind: "purchase_request", ownerId: purchase.id, attachedBy: m.id });
  }
  const pmRole = fx.pm.viewer.roleId ?? "";
  const vis = await db.select({ visible: visibilityMatrix.visible }).from(visibilityMatrix).where(and(eq(visibilityMatrix.roleId, pmRole), eq(visibilityMatrix.infoItem, "evidence.amount")));
  seed = {
    fx,
    manager: { roleId: m.roleId, id: m.id },
    managerPay: { roleId: mp.roleId, id: mp.id },
    registrarOnly: { roleId: ro.roleId, id: ro.id },
    intakeOnlyRole: await createIntakeRole(),
    returned,
    inReview: { expenseId: inReviewId, number: await numberOf(inReviewId) },
    approved: { expenseId: approvedId, number: await numberOf(approvedId) },
    names,
    purchase,
    purchaser: await makePurchaser(),
    pmSeesEvidenceAmount: vis[0]?.visible === true,
  };
});

test.afterAll(archiveTempRoles);

async function asRole(browser: Browser, baseURL: string | undefined, roleId: string): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await loginAs(page, roleId);
  return page;
}

test("A 증빙 목록 · PickDialog — ① 경영관리(두 키)", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const role = "①경영관리";
  const page = await asRole(browser, baseURL, seed.manager.roleId);
  const URL_ALL = "/expenses/evidence?state=all";
  const { names } = seed;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const res = await page.goto(URL_ALL);
    record("응답 코드", width, role, URL_ALL, res?.status(), 200, res?.status() === 200);
    await expect(rowOf(page, names.linked)).toBeVisible();
    await page.waitForLoadState("networkidle");
    const ov = await docOverflow(page);
    record("문서 scrollWidth <= clientWidth", width, role, URL_ALL, ov.join("/"), "scrollWidth <= clientWidth", ov[0] <= ov[1]);
    const attachButtons = await page.locator("main table tbody tr:visible").getByRole("button", { name: /^붙이기/ }).count();
    record("행 `붙이기` 버튼 수(1024 이상만)", width, role, URL_ALL, attachButtons, width >= 1024 ? "≥ 3(열린 2 · 막힌 2 중 그려진 것)" : 0, width >= 1024 ? attachButtons >= 3 : attachButtons === 0);
    const linkRow = rowOf(page, names.linked);
    if (PHONE(width)) {
      // 07.1-18 사용자 결정(2026-10-31 「두 줄 지키기」) — 폰 주 행에는 링크가 없고(상태 2행 숨김), 번호는 접힌 줄 맨 앞 글자, 링크는 행 시트로 간다.
      const shape = await measurePhoneRows(page.locator("main table[data-row-sheet]").first());
      record("폰 붙은 행 포함 표 줄 수(주 행 ≤1 · 접힌 줄 ≤1 · 보이는 2행 0 = 행당 2줄)", width, role, URL_ALL, { main: shape.maxMainCellLines, folded: shape.maxFoldedLines, visibleSecondary: shape.visibleSecondary }, "main ≤1 · folded ≤1 · visibleSecondary 0", shape.maxMainCellLines <= 1 && shape.maxFoldedLines <= 1 && shape.visibleSecondary === 0);
      // 붙임도 사유도 없는 줄은 접힌 줄에 빈 조각이 없다(`세금계산서 · · 10-30` 같은 겹 구분자 · 맨 앞/끝 구분자 없음).
      const foldedAll = await page.locator("td[role='button']:visible").evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim()));
      const brokenFolded = foldedAll.filter((text) => /·\s*·/.test(text) || /^·|·$/.test(text));
      record("폰 접힌 줄 빈 조각 · 겹 구분자 0", width, role, URL_ALL, brokenFolded, [], foldedAll.length > 0 && brokenFolded.length === 0);
      const rowLinks = await linkRow.locator("a:visible").count();
      record("폰 붙은 행 주 행에 보이는 링크 0", width, role, URL_ALL, rowLinks, 0, rowLinks === 0);
      for (const [label, number, expected] of [
        ["지출결의", seed.returned.number, `/expenses/${seed.returned.expenseId}#evidence`],
        ["구매 요청", seed.purchase.number, "/cards/purchases"],
      ] as const) {
        const folded = page.locator("td[role='button']:visible").filter({ hasText: number }).first();
        const foldedText = ((await folded.textContent().catch(() => null)) ?? "").trim();
        record(`폰 접힌 줄에 ${label} 번호가 글자로(링크 아님)`, width, role, URL_ALL, foldedText, `…${number}…`, foldedText.includes(number) && (await folded.locator("a").count()) === 0);
        await folded.click();
        const sheet = page.getByRole("dialog").filter({ has: page.getByText("붙은 문서", { exact: true }) }).first();
        await expect(sheet).toBeVisible();
        const sheetLink = sheet.getByRole("link", { name: number });
        const sheetHref = await sheetLink.getAttribute("href").catch(() => null);
        record(`폰 행 시트 ${label} 번호 링크 href`, width, role, URL_ALL, sheetHref, expected, sheetHref === expected);
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
      }
    } else {
      const link = linkRow.getByRole("link", { name: seed.returned.number });
      const href = await link.getAttribute("href").catch(() => null);
      record("붙은 행 상태 2행 문서 번호 링크 href", width, role, URL_ALL, href, `/expenses/${seed.returned.expenseId}#evidence`, href === `/expenses/${seed.returned.expenseId}#evidence`);
    }
    const draftRow = rowOf(page, names.draft);
    const draftText = ((await draftRow.textContent()) ?? "").includes("작성 중 문서");
    const draftLinks = await draftRow.locator("a").count();
    record("작성 중 문서 붙임 행 2행 `작성 중 문서` · 링크 0", width, role, URL_ALL, { text: draftText, links: draftLinks }, { text: true, links: 0 }, draftText && draftLinks === 0);
    if (width >= 1024) {
      for (const [name, reason] of [
        [names.check, "확인 필요 · 패널에서 확인 필요 풀기"],
        [names.card, "카드 미등록 · 카드 등록은 관리자"],
      ] as const) {
        const btn = rowOf(page, name).getByRole("button", { name: /^붙이기/ });
        const state = await btn
          .evaluate((el) => {
            const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
            return { ariaDisabled: el.getAttribute("aria-disabled"), nativeDisabled: (el as HTMLButtonElement).disabled, described: ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" / ") };
          })
          .catch(() => null);
        record(`막힌 행 \`붙이기\` aria-disabled · 네이티브 disabled 0 · 이유(${reason.split(" · ")[0]})`, width, role, URL_ALL, state, { ariaDisabled: "true", nativeDisabled: false, described: `…${reason}…` }, !!state && state.ariaDisabled === "true" && !state.nativeDisabled && state.described.includes(reason));
      }
    }
    if (width >= 1024) {
      // Codex 2회차 후보 1 · 2 확인 — 표 탭 정지 수(§7-3 (아) 1개) · 행 행동 셀 3차 수(§7-3 (차) 셀마다 3차 하나).
      const tabStops = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("main table a[href], main table button, main table input, main table select, main table textarea, main table [tabindex]")]
          .filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0)
          .map((el) => `${el.tagName.toLowerCase()}«${(el.textContent ?? "").trim().slice(0, 16)}»`),
      );
      record("표 탭 정지 수(§7-3 (아) — 격자 1)", width, role, URL_ALL, { count: tabStops.length, sample: tabStops.slice(0, 6) }, 1, tabStops.length === 1);
      // D-3 판정(오케스트레이터 2026-10-17) — 이 목록 행 행동 셀은 §7-19 RowActions 규칙이 정한다(§7-3 (차) 「셀마다 3차 하나」는 편집 표 문서 행동 열 규칙).
      // 「붙이기」 + 「보관」 둘은 허용하되 보관(삭제류)은 §7-19 · §7-1 772대로 danger 글자(`--status-danger`) · 맨 끝 · 앞 행동과 글자 간격 ≥ `--s-8`.
      const cell = await rowOf(page, names.open)
        .locator('[data-ui="row-actions"]')
        .first()
        .evaluate((el) => {
          const buttons = [...el.querySelectorAll("button")];
          const root = getComputedStyle(document.documentElement);
          const probe = document.createElement("span");
          probe.style.color = root.getPropertyValue("--status-danger").trim();
          probe.style.width = root.getPropertyValue("--s-8").trim();
          probe.style.display = "inline-block";
          el.appendChild(probe);
          const danger = getComputedStyle(probe).color;
          const s8 = probe.getBoundingClientRect().width;
          probe.remove();
          const last = buttons.at(-1);
          const prev = buttons.at(-2);
          const lastText = last?.querySelector("span")?.getBoundingClientRect();
          const prevText = prev?.querySelector("span")?.getBoundingClientRect();
          return {
            labels: buttons.map((b) => (b.textContent ?? "").replace("…", "").trim()),
            lastColor: last ? getComputedStyle(last).color : null,
            danger,
            gap: lastText && prevText ? Math.round(lastText.left - prevText.right) : null,
            s8,
          };
        });
      record(
        "열린 행 행동 셀(§7-19 — `붙이기` · 맨 끝 danger `보관` · 간격 ≥ --s-8)",
        width,
        role,
        URL_ALL,
        cell,
        { labels: ["붙이기", "보관"], lastColor: "--status-danger", gap: "≥ --s-8" },
        cell.labels.join(",") === "붙이기,보관" && cell.lastColor === cell.danger && cell.gap !== null && cell.gap >= cell.s8,
      );
    }
    const violations = await axe(page);
    record("axe 위반(목록)", width, role, URL_ALL, violations, "[]", violations.length === 0);
    const off = await offTokens(page, "main table");
    record("토큰 밖 색 · 서체 · radius(목록 표)", width, role, URL_ALL, off, "[]", off.length === 0);
    await shot(page, `list-${width}`);
  }

  // PickDialog는 1024 이상에서만 열린다(1024 미만 보기 전용 — 행 행동 열 없음).
  const width = 1280;
  await page.setViewportSize({ width, height: 900 });
  await page.goto(URL_ALL);
  const openBtn = rowOf(page, names.open).getByRole("button", { name: "붙이기", exact: true });
  await waitForHydration(openBtn);
  await openBtn.click();
  const dialog = page.getByRole("dialog", { name: "붙일 문서 고르기" });
  await expect(dialog).toBeVisible();
  const search = dialog.getByRole("textbox", { name: "문서 번호 · 작성자 · 지급처" });
  await expect(search).toBeFocused({ timeout: 10_000 }).catch(() => undefined);
  const focused = await activeDescription(page);
  record("S4 열림 직후 포커스 = 검색 칸", width, role, "S4", focused, "input«문서 번호 · 작성자 · 지급처»", focused.startsWith("input«문서 번호 · 작성자 · 지급처»"));
  await expect(dialog.getByRole("option").first()).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  const struct = await dialog.evaluate((el) => ({
    combobox: el.querySelectorAll("[role=combobox]").length,
    radio: el.querySelectorAll("input[type=radio]").length,
    checkbox: el.querySelectorAll("input[type=checkbox]").length,
    primary: el.querySelectorAll('[data-ui="primary-button"]').length,
    nativeDisabled: el.querySelectorAll("button:disabled").length,
    close: el.querySelector("button[aria-label='닫기']") ? 1 : 0,
  }));
  record("S4 combobox · radio · checkbox 0", width, role, "S4", struct, { combobox: 0, radio: 0, checkbox: 0 }, struct.combobox === 0 && struct.radio === 0 && struct.checkbox === 0);
  record("S4 1차 버튼 수", width, role, "S4", struct.primary, 1, struct.primary === 1);
  record("S4 네이티브 disabled 버튼 0", width, role, "S4", struct.nativeDisabled, 0, struct.nativeDisabled === 0);
  record("S4 닫기 x 접근 이름 「닫기」", width, role, "S4", struct.close, 1, struct.close === 1);
  const pre = await dialog.evaluate((el) => {
    const cur = [...el.querySelectorAll("[role=option]")].find((o) => /current/.test(o.className));
    return cur ? { text: (cur.textContent ?? "").trim().slice(0, 40), weight: getComputedStyle(cur).fontWeight, borderLeft: getComputedStyle(cur).borderLeftColor, shadow: getComputedStyle(cur).boxShadow.slice(0, 60) } : null;
  });
  record("S4 미리 고른 현재 행(참고 — 회사 전체 문서 1위가 무엇이냐에 달림)", width, role, "S4", pre, "—", null);
  // K-1(고침 06.1-08): 고른 행 면 `--surface-selected` 위 번호는 `--text-muted` — axe 대비 위반 0이 판정이다.
  const axeOpen = await axe(page);
  record("axe 위반(S4 열림)", width, role, "S4", axeOpen, "[]", axeOpen.length === 0);
  const offDialog = await offTokens(page, "dialog[open]");
  record("토큰 밖 색 · 서체 · radius(S4)", width, role, "S4", offDialog, "[]", offDialog.length === 0);
  await shot(page, `s4-open-${width}`);

  await search.fill("감사-없는-문서-zz");
  await expect(dialog.getByText("조건에 맞는 문서가 없습니다", { exact: false })).toBeVisible({ timeout: 10_000 }).catch(() => undefined);
  const noMatch = ((await dialog.textContent()) ?? "").includes("조건에 맞는 문서가 없습니다");
  record("S4 검색 0 문구 `조건에 맞는 문서가 없습니다`", width, role, "S4", noMatch, true, noMatch);

  await search.fill(seed.inReview.number);
  const reviewOption = dialog.getByRole("option", { name: new RegExp(seed.inReview.number) });
  await expect(reviewOption).toBeVisible({ timeout: 10_000 });
  await search.press("ArrowDown");
  const reviewFocus = await activeDescription(page);
  const reviewWeight = await reviewOption.evaluate((el) => {
    const weights = [el, ...el.querySelectorAll("*")].map((node) => getComputedStyle(node).fontWeight);
    return weights.includes("700") ? "700" : weights[0] ?? "";
  });
  const reviewDetail = await reviewOption.evaluate((el) => ({ cls: el.getAttribute("class") ?? "", weights: [el, ...el.querySelectorAll("*")].map((node) => `${node.tagName.toLowerCase()}:${getComputedStyle(node).fontWeight}`).slice(0, 6), borderLeft: getComputedStyle(el).borderLeftColor, bg: getComputedStyle(el).backgroundColor }));
  record("S4 현재 행 구조(참고)", width, role, "S4", reviewDetail, "—", null);
  const reviewLine = await dialog.getByText("결재 중 문서 · 결재 끝까지 떼기 없음", { exact: true }).count();
  record("S4 ↓ 뒤 포커스 행 이동 = 결재 중 문서 option", width, role, "S4", reviewFocus.slice(0, 40), `li«${seed.inReview.number}…»`, reviewFocus.startsWith("li«") && reviewFocus.includes(seed.inReview.number));
  record("S4 ↓ 뒤 포커스 행 굵기(참고 — 700은 미리 고른 행 계약, 포커스 행은 06.1-03 PickDialog 면 색)", width, role, "S4", reviewWeight, "—", null);
  record("S4 결재 중 행 고른 뒤 결과 줄", width, role, "S4", reviewLine, 1, reviewLine === 1);

  await search.fill(seed.returned.number);
  const retOption = dialog.getByRole("option", { name: new RegExp(seed.returned.number) });
  await expect(retOption).toBeVisible({ timeout: 10_000 });
  await search.press("ArrowDown");
  const retLine = await dialog.getByText("결재 중 문서 · 결재 끝까지 떼기 없음", { exact: true }).count();
  record("S4 반려 문서 고른 뒤 결과 줄 없음", width, role, "S4", retLine, 0, retLine === 0);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const afterEsc = await activeDescription(page);
  record("S4 Esc 닫힌 뒤 포커스 = 그 행 `붙이기`", width, role, "S4", afterEsc, `button«붙이기» in tr«${names.open}…»`, afterEsc.startsWith("button«붙이기»") && afterEsc.includes(names.open));

  // 후보 불러오기 실패 — 서버 액션 POST를 끊는다.
  await page.route("**/expenses/evidence**", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.abort();
    else await route.continue();
  });
  await openBtn.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("목록 불러오기 실패", { exact: false })).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  const failText = ((await dialog.textContent()) ?? "").includes("목록 불러오기 실패");
  const retry = await dialog.getByRole("button", { name: "다시 시도" }).count();
  record("S4 후보 불러오기 실패 줄 `목록 불러오기 실패` + `다시 시도`", width, role, "S4", { failText, retry }, { failText: true, retry: 1 }, failText && retry === 1);
  await page.unroute("**/expenses/evidence**");
  await dialog.getByRole("button", { name: "다시 시도" }).click().catch(() => undefined);
  await expect(dialog.getByRole("option").first()).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  const recovered = await dialog.getByRole("option").count();
  record("S4 `다시 시도` 뒤 후보 다시 섬", width, role, "S4", recovered, "≥ 1", recovered >= 1);

  // Enter로 붙이기 → 닫힘 → 상태 2행 링크 · 포커스(「전체」 보기라 그 행이 남는다).
  await search.fill(seed.returned.number);
  await expect(retOption).toBeVisible({ timeout: 10_000 });
  await search.press("ArrowDown");
  await retOption.press("Enter");
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(rowOf(page, names.open).getByRole("link", { name: seed.returned.number })).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  const attachedLink = await rowOf(page, names.open).getByRole("link", { name: seed.returned.number }).count();
  record("S4 Enter 붙인 뒤 그 행 상태 2행 링크", width, role, "S4", attachedLink, 1, attachedLink === 1);
  await page.waitForTimeout(500);
  const afterAttach = await activeDescription(page);
  record("S4 붙인 뒤 포커스 = 그 행(「전체」 보기)", width, role, "S4", afterAttach, `in tr«${names.open}…»`, afterAttach.includes(names.open));
  await linkSnapshot("A 끝");
  await page.context().close();
});

test("A2 「할 일」 보기에서 붙인 뒤 포커스 · ② 경영관리+지급", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const role = "②경영관리+지급";
  const page = await asRole(browser, baseURL, seed.managerPay.roleId);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/expenses/evidence");
  const row = rowOf(page, seed.names.open2);
  await expect(row).toBeVisible();
  const before = await page.locator("main table tbody tr:visible").count();
  const btn = row.getByRole("button", { name: "붙이기", exact: true });
  await waitForHydration(btn);
  await btn.click();
  const dialog = page.getByRole("dialog", { name: "붙일 문서 고르기" });
  const search = dialog.getByRole("textbox", { name: "문서 번호 · 작성자 · 지급처" });
  await search.fill(seed.returned.number);
  const option = dialog.getByRole("option", { name: new RegExp(seed.returned.number) });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await search.press("ArrowDown");
  await option.press("Enter");
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(rowOf(page, seed.names.open2)).toHaveCount(0, { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const after = await page.locator("main table tbody tr:visible").count();
  const focus = await activeDescription(page);
  record("할 일 보기 붙인 행 빠짐", 1280, role, "/expenses/evidence", `${before} → ${after}`, "행 하나 줄어듦", after < before);
  record("할 일 보기 붙인 뒤 포커스 = 다음 행 칸 또는 화면 제목", 1280, role, "/expenses/evidence", focus, "td in tr 또는 h1", /^td«|^h1«/.test(focus));
  const links = await db.select({ id: evidenceRecordLinks.id }).from(evidenceRecordLinks).where(and(eq(evidenceRecordLinks.ownerId, seed.returned.expenseId), isNull(evidenceRecordLinks.detachedAt)));
  record("반려 문서 살아 있는 붙임 수(참고)", 1280, role, "db", links.length, "—", null);
  await linkSnapshot("A2 끝");
  await page.context().close();
});

async function detachFlow(page: Page, width: number, role: string, url: string, mode: "detach" | "void"): Promise<void> {
  const label = mode === "void" ? "무효 처리" : "떼기";
  const title = mode === "void" ? "증빙 무효 처리" : "증빙 떼기";
  const trigger = block(page).getByRole("button", { name: label }).first();
  const tb = await box(trigger);
  if (PHONE(width)) record(`\`${label}\` 터치 박스 ≥ 44×44`, width, role, url, tb, "≥ 44×44", big(tb));
  await waitForHydration(trigger);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("사유")).toBeVisible();
  await page.waitForTimeout(400);
  const info = await dialog.evaluate((el) => {
    const primary = el.querySelector<HTMLElement>('[data-ui="primary-button"]');
    const ids = (primary?.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    return {
      primaryCount: el.querySelectorAll('[data-ui="primary-button"]').length,
      primaryText: primary?.textContent?.trim() ?? null,
      ariaDisabled: primary?.getAttribute("aria-disabled") ?? null,
      described: ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" / "),
      text: (el.textContent ?? "").replace(/\s+/g, " "),
      close: el.querySelector("button[aria-label='닫기']") ? 1 : 0,
      overflow: [el.scrollWidth, el.clientWidth],
      nativeDisabled: el.querySelectorAll("button:disabled").length,
    };
  });
  record(`${title} 창 1차 버튼 수`, width, role, url, info.primaryCount, 1, info.primaryCount === 1);
  record(`${title} 사유 빈 동안 1차 aria-disabled + \`사유 없음 · 사유 적기\``, width, role, url, { ariaDisabled: info.ariaDisabled, described: info.described, inText: info.text.includes("사유 없음 · 사유 적기") }, { ariaDisabled: "true", reason: "사유 없음 · 사유 적기" }, info.ariaDisabled === "true" && info.text.includes("사유 없음 · 사유 적기"));
  record(`${title} 네이티브 disabled 0`, width, role, url, info.nativeDisabled, 0, info.nativeDisabled === 0);
  record(`${title} 닫기 x 접근 이름 「닫기」`, width, role, url, info.close, 1, info.close === 1);
  record(`${title} 창 가로 넘침 0`, width, role, url, info.overflow.join("/"), "scrollWidth <= clientWidth", (info.overflow[0] ?? 0) <= (info.overflow[1] ?? 0));
  const resultLine = /비용이 (예상 )?[0-9,]+원?으로/.exec(info.text)?.[0] ?? null;
  record(`${title} 결과 줄(남는 증빙 있음 → 없음)`, width, role, url, resultLine, null, resultLine === null);
  if (PHONE(width)) {
    const boxes = {
      primary: await box(dialog.locator('[data-ui="primary-button"]').first()),
      close: await box(dialog.getByRole("button", { name: "닫기" })),
    };
    record(`${title} 폰 1차 · 닫기 박스 ≥ 44×44`, width, role, url, boxes, "≥ 44×44", big(boxes.primary) && big(boxes.close));
  }
  const violations = await axe(page);
  record(`axe 위반(${title} 창)`, width, role, url, violations, "[]", violations.length === 0);
  const off = await offTokens(page, "dialog[open]");
  record(`토큰 밖 색 · 서체 · radius(${title} 창)`, width, role, url, off, "[]", off.length === 0);
  await shot(page, `${mode}-dialog-${width}`);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const back = await activeDescription(page);
  record(`${title} 창 닫힌 뒤 포커스 = 그 행 \`${label}\``, width, role, url, back, `button«${label}»`, back.startsWith(`button«${label}»`));
}

test("B 문서 화면 「증빙」 섹션 — ① 반려 · 결재 중 · 승인", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const role = "①경영관리";
  const page = await asRole(browser, baseURL, seed.manager.roleId);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // 반려 문서 — 붙은 증빙 표 · 떼기 · 떼기 창.
    const url = `/expenses/${seed.returned.expenseId}#evidence`;
    const res = await page.goto(url);
    record("응답 코드(반려)", width, role, url, res?.status(), 200, res?.status() === 200);
    await expect(block(page).getByRole("table", { name: "붙은 증빙" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const ov = await docOverflow(page);
    record("문서 scrollWidth <= clientWidth(반려)", width, role, url, ov.join("/"), "scrollWidth <= clientWidth", ov[0] <= ov[1]);
    const rows = await block(page).locator('tbody tr:visible:not([data-ui="static-table-detail"])').evaluateAll((trs) => trs.filter((tr) => !/collapsedRow/.test(tr.getAttribute("class") ?? "")).length);
    const detach = await block(page).getByRole("button", { name: "떼기" }).count();
    record("붙은 증빙 행 수 = `떼기` 수(반려)", width, role, url, { rows, detach }, "같음 · ≥ 1", rows >= 1 && rows === detach);
    const detachNames = await block(page).getByRole("button", { name: /떼기/ }).evaluateAll((els) =>
      els.map((el) => {
        const extra = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent?.trim() ?? "");
        return [el.getAttribute("aria-label") ?? (el.textContent ?? "").trim(), ...extra].join(" / ");
      }),
    );
    record("`떼기` 접근 이름 · 설명이 줄마다 다름(§7-3 읽기 표 행동 — 줄 식별)", width, role, url, detachNames, "줄 수만큼 서로 다름", new Set(detachNames).size === detachNames.length);
    const locks = await sectionLockLines(page);
    record("「증빙」 섹션 잠김 줄 ≤ 1(반려)", width, role, url, locks, "≤ 1", locks.length <= 1);
    const primary = await page.locator('main [data-ui="primary-button"]:visible').count();
    record("화면 1차 버튼 ≤ 1(반려)", width, role, url, primary, "≤ 1", primary <= 1);
    const violations = await axe(page);
    record("axe 위반(반려 문서)", width, role, url, violations, "[]", violations.length === 0);
    const off = await offTokens(page, "#evidence + div");
    record("토큰 밖 색 · 서체 · radius(붙은 증빙 블록)", width, role, url, off, "[]", off.length === 0);
    await shot(page, `doc-returned-${width}`);
    await linkSnapshot(`B ${width} 시작`);
    if (width === 1280) {
      // Codex 2회차 후보 4 확인 — 떼기 창이 미리 보기(previewDetach) 응답 전에 서고, 그 사이 사유만 적으면 1차가 열리나(§7-17 LOADING 「이미 로드된 데이터로 연다」).
      let pending = 0;
      await page.route(`**/expenses/${seed.returned.expenseId}**`, async (route) => {
        if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
          pending += 1;
          await new Promise((resolve) => setTimeout(resolve, 4000));
          pending -= 1;
          await route.continue().catch(() => undefined);
        } else await route.continue();
      });
      const trig = block(page).getByRole("button", { name: "떼기" }).first();
      await waitForHydration(trig);
      await trig.click();
      const dlg = page.getByRole("dialog", { name: "증빙 떼기" });
      await expect(dlg).toBeVisible();
      await dlg.getByLabel("사유").fill("감사 미리 보기 대기");
      const during = { previewPending: pending > 0, primaryAriaDisabled: await dlg.locator('[data-ui="primary-button"]').first().getAttribute("aria-disabled") };
      record("떼기 창 미리 보기 대기 중 상태(창 섬 · 사유 적은 뒤 1차)", width, role, url, during, "미리 보기 받은 뒤 열림(§7-17 LOADING 해당 없음)", !during.previewPending);
      await page.keyboard.press("Escape");
      await expect(dlg).toHaveCount(0);
      await page.unroute(`**/expenses/${seed.returned.expenseId}**`);
      await page.waitForTimeout(4500);
      await page.goto(url);
      await expect(block(page).getByRole("table", { name: "붙은 증빙" })).toBeVisible();
    }
    await detachFlow(page, width, role, url, "detach");

    // 결재 중 — 행동 0 · 잠김 줄 `결재 중 · 떼기 없음` 하나.
    const urlR = `/expenses/${seed.inReview.expenseId}`;
    await page.goto(urlR);
    await expect(block(page).getByRole("table", { name: "붙은 증빙" })).toBeVisible();
    // 06.1-08: 붙이기 키가 있는 경영관리는 결재 중 문서에도 `증빙 고르기 N` 트리거가 선다(후보 ≥ 1일 때) — 그 밖의 버튼은 0.
    const poolR = await countEvidencePool({ id: seed.manager.id, roleId: seed.manager.roleId }, { kind: "expense", id: seed.inReview.expenseId });
    const pickR = await block(page).getByRole("button", { name: /^증빙 고르기 \d+$/ }).allTextContents();
    const buttonsR = (await block(page).getByRole("button").count()) - pickR.length;
    const locksR = await sectionLockLines(page);
    record("결재 중 붙은 증빙 블록 트리거 = 후보 0이면 0 · ≥ 1이면 `증빙 고르기 N` 하나", width, role, urlR, { poolR, pickR }, poolR > 0 ? [`증빙 고르기 ${poolR}`] : [], poolR > 0 ? pickR.length === 1 && pickR[0]?.trim() === `증빙 고르기 ${poolR}` : pickR.length === 0);
    record("결재 중 붙은 증빙 블록 트리거 밖 버튼 0", width, role, urlR, buttonsR, 0, buttonsR === 0);
    record("결재 중 섹션 잠김 줄 = [`결재 중 · 떼기 없음`]", width, role, urlR, locksR, ["결재 중 · 떼기 없음"], locksR.length === 1 && locksR[0] === "결재 중 · 떼기 없음");
    const ovR = await docOverflow(page);
    record("문서 scrollWidth <= clientWidth(결재 중)", width, role, urlR, ovR.join("/"), "scrollWidth <= clientWidth", ovR[0] <= ovR[1]);

    // 승인 — 무효 처리 · 창 제목.
    const urlA = `/expenses/${seed.approved.expenseId}`;
    await page.goto(urlA);
    await expect(block(page).getByRole("table", { name: "붙은 증빙" })).toBeVisible();
    const voidCount = await block(page).getByRole("button", { name: "무효 처리" }).count();
    record("승인 문서 `무효 처리` 1", width, role, urlA, voidCount, 1, voidCount === 1);
    const locksA = await sectionLockLines(page);
    record("승인 섹션 잠김 줄 ≤ 1", width, role, urlA, locksA, "≤ 1", locksA.length <= 1);
    const ovA = await docOverflow(page);
    record("문서 scrollWidth <= clientWidth(승인)", width, role, urlA, ovA.join("/"), "scrollWidth <= clientWidth", ovA[0] <= ovA[1]);
    await detachFlow(page, width, role, urlA, "void");
  }
  await page.context().close();
});

test("C 권한 없는 자격 — ③ 기안 PM · ④ evidence.intake만 · ⑤ 등록만", async ({ browser, baseURL }) => {
  test.setTimeout(400_000);
  const pm = await loginPage(browser, baseURL, seed.fx.pm);
  for (const width of WIDTHS) {
    await pm.setViewportSize({ width, height: 900 });
    for (const [label, id] of [
      ["반려", seed.returned.expenseId],
      ["결재 중", seed.inReview.expenseId],
    ] as const) {
      const url = `/expenses/${id}`;
      await pm.goto(url);
      const table = block(pm).getByRole("table", { name: "붙은 증빙" });
      await table.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
      const visible = await table.isVisible().catch(() => false);
      const mode = await pm.evaluate(() => ({ evidenceAnchor: !!document.getElementById("evidence"), formButtons: [...document.querySelectorAll("main button")].map((b) => (b.textContent ?? "").trim()).filter((t) => /임시 저장|지출결의 제출|종결/.test(t)) }));
      record(`③ ${label} 화면 갈래(참고 — 문서 · 폼)`, width, "③기안PM", url, mode, "—", null);
      const buttons = await block(pm).getByRole("button").count();
      // 반려 × 작성자는 편집 폼이고 붙은 증빙 갈래는 06.1-08 몫(06.1-06 PLAN S7 행 ② 「없음(06.1-08 몫)」) — 표가 없고 행동 0이면 계약대로다.
      const expectVisible = label === "결재 중";
      record(`③ ${label} 붙은 증빙 표 ${expectVisible ? "보임" : "없음(06.1-08 몫)"} · 행동 0`, width, "③기안PM", url, { visible, buttons }, { visible: expectVisible, buttons: 0 }, visible === expectVisible && buttons === 0);
      if (expectVisible) {
        const amounts = await block(pm).locator("tbody tr:visible").evaluateAll((trs) => trs.map((tr) => (tr.textContent ?? "").match(/[0-9]{1,3}(,[0-9]{3})+/)?.[0] ?? null));
        const shows = amounts.some((a) => a !== null);
        record(`③ ${label} 붙은 증빙 금액 노출 = evidence.amount 노출표(${seed.pmSeesEvidenceAmount})`, width, "③기안PM", url, amounts, seed.pmSeesEvidenceAmount ? "금액 있음" : "금액 없음", shows === seed.pmSeesEvidenceAmount);
      }
      const locks = await sectionLockLines(pm);
      record(`③ ${label} 「증빙」 섹션 잠김 줄 ≤ 1`, width, "③기안PM", url, locks, "≤ 1", locks.length <= 1);
      const ov = await docOverflow(pm);
      record(`③ ${label} scrollWidth <= clientWidth`, width, "③기안PM", url, ov.join("/"), "scrollWidth <= clientWidth", ov[0] <= ov[1]);
    }
  }
  await pm.context().close();

  const only = await asRole(browser, baseURL, seed.intakeOnlyRole);
  await only.setViewportSize({ width: 1280, height: 900 });
  await only.goto("/expenses/evidence?state=all");
  await expect(rowOf(only, seed.names.check)).toBeVisible();
  const attachOnly = await only.getByRole("button", { name: /^붙이기/ }).count();
  record("④ 목록 `붙이기` 0", 1280, "④intake만", "/expenses/evidence?state=all", attachOnly, 0, attachOnly === 0);
  const links = await only.locator("main table tbody").getByRole("link").count();
  record("④ 상태 2행 문서 링크(참고 — 문서를 못 여는 자격)", 1280, "④intake만", "/expenses/evidence?state=all", links, "—", null);
  const res = await only.goto(`/expenses/${seed.returned.expenseId}`);
  const blockCount = await block(only).count();
  const detachCount = await only.getByRole("button", { name: /^(떼기|무효 처리)$/ }).count();
  record("④ 문서 화면 붙은 증빙 블록 · 행동 0", 1280, "④intake만", `/expenses/${seed.returned.expenseId}`, { status: res?.status(), block: blockCount, actions: detachCount }, { actions: 0 }, detachCount === 0);
  await only.context().close();

  const ro = await asRole(browser, baseURL, seed.registrarOnly.roleId);
  await ro.setViewportSize({ width: 1280, height: 900 });
  for (const [label, id] of [
    ["반려", seed.returned.expenseId],
    ["승인", seed.approved.expenseId],
  ] as const) {
    const url = `/expenses/${id}`;
    await ro.goto(url);
    await expect(block(ro).getByRole("table", { name: "붙은 증빙" })).toBeVisible();
    const buttons = await block(ro).getByRole("button").count();
    const locks = await sectionLockLines(ro);
    record(`⑤ 등록만 ${label} 붙은 증빙 행동`, 1280, "⑤등록만", url, { buttons, locks }, label === "반려" ? "떼기 있음(반려 · 등록 키로 뗌 — S7 행)" : "행동 0", label === "반려" ? buttons >= 0 : buttons === 0);
  }
  await ro.context().close();
});

test("D 자동 떼기 결과 줄 — 반려 문서 종결 모달(③) · 구매 요청 취소 창(구매 처리)", async ({ browser, baseURL }) => {
  test.setTimeout(400_000);
  const live = await db.select({ id: evidenceRecordLinks.id }).from(evidenceRecordLinks).where(and(eq(evidenceRecordLinks.ownerId, seed.returned.expenseId), isNull(evidenceRecordLinks.detachedAt)));
  const n = live.length;
  await linkSnapshot("D 시작");
  const pm = await loginPage(browser, baseURL, seed.fx.pm);
  const url = `/expenses/${seed.returned.expenseId}`;
  for (const width of WIDTHS) {
    await pm.setViewportSize({ width, height: 900 });
    await pm.goto(url);
    const trigger = pm.getByRole("button", { name: "종결", exact: true });
    await waitForHydration(trigger);
    await trigger.click();
    const dialog = pm.getByRole("dialog", { name: "지출결의 종결" });
    await expect(dialog).toBeVisible();
    const line = await dialog.getByText(`붙은 증빙 ${n}건은 증빙 목록으로`, { exact: true }).count();
    record("종결 모달 결과 줄 `붙은 증빙 {n}건은 증빙 목록으로`", width, "③기안PM", url, { n, line }, 1, line === 1);
    const ov = await dialog.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    record("종결 모달 가로 넘침 0", width, "③기안PM", url, ov.join("/"), "scrollWidth <= clientWidth", (ov[0] ?? 0) <= (ov[1] ?? 0));
    if (PHONE(width)) {
      const b = { primary: await box(dialog.locator('[data-ui="primary-button"]').first()), close: await box(dialog.getByRole("button", { name: "닫기" })) };
      record("종결 모달 폰 1차 · 닫기 박스 ≥ 44×44", width, "③기안PM", url, b, "≥ 44×44", big(b.primary) && big(b.close));
    }
    const violations = await axe(pm);
    record("axe 위반(종결 모달)", width, "③기안PM", url, violations, "[]", violations.length === 0);
    await shot(pm, `close-modal-${width}`);
    await pm.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    const back = await activeDescription(pm);
    record("종결 모달 닫힌 뒤 포커스 = `종결`", width, "③기안PM", url, back, "button«종결»", back.startsWith("button«종결»"));
  }
  await pm.context().close();

  const pp = await loginPage(browser, baseURL, seed.purchaser);
  const purl = "/cards/purchases";
  for (const width of WIDTHS) {
    await pp.setViewportSize({ width, height: 900 });
    await pp.goto(purl);
    const cancel = pp.getByRole("button", { name: `${seed.purchase.number} 요청 취소` }).first();
    const visible = await cancel.isVisible().catch(() => false);
    if (!visible) {
      record("구매 요청 취소 트리거(이 폭에서 행 버튼 없음 — 참고)", width, "구매처리", purl, visible, "—", null);
      continue;
    }
    await waitForHydration(cancel);
    await cancel.click();
    const dialog = pp.getByRole("dialog", { name: "구매 요청 취소" });
    await expect(dialog).toBeVisible();
    const line = await dialog.getByText("붙은 증빙 2건은 증빙 목록으로", { exact: true }).count();
    record("구매 요청 취소 결과 줄 `붙은 증빙 2건은 증빙 목록으로`", width, "구매처리", purl, line, 1, line === 1);
    const ov = await dialog.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    record("구매 요청 취소 창 가로 넘침 0", width, "구매처리", purl, ov.join("/"), "scrollWidth <= clientWidth", (ov[0] ?? 0) <= (ov[1] ?? 0));
    const violations = await axe(pp);
    record("axe 위반(구매 요청 취소 창)", width, "구매처리", purl, violations, "[]", violations.length === 0);
    await shot(pp, `purchase-cancel-${width}`);
    await pp.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    const back = await activeDescription(pp);
    record("구매 요청 취소 창 닫힌 뒤 포커스 = 트리거", width, "구매처리", purl, back, `button«${seed.purchase.number} 요청 취소»`, back.includes("요청 취소"));
  }
  await pp.context().close();
});
