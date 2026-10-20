import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceImportBatches, evidenceRecordLinks, evidenceRecords, expenseEvidenceReviews, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06.1-10 독립 DOM 감사(실행자가 아닌 별도 에이전트). 판정은 CI=true 프로덕션 빌드의 DOM 실측값으로만 한다(스크린샷 육안 금지).
// 자격 둘: wide = 전사 업무 · 전사 보는 범위 지급 계급, narrow = 06.2 행 범위가 팀인 지급 계급(팀 1 발령). EMPTY는 팀 3(붙임 있는 문서만) narrow 계급.
// 항목마다 실측 · 기대 · 판정을 JSONL(AUDIT_OUT)로 남기고 expect.soft로 한 실행에서 전부 잰다 — 06.1-10-DOM-AUDIT.md의 원자료다.

const WIDTHS = [1280, 1024, 768, 700, 375, 320] as const;
const OUT = process.env.AUDIT_OUT ?? "test-results/evidence-file-only-audit.jsonl";
const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];
const EXPECTED_OPTIONS = ["증빙 전체", "확인 전", "증빙 없음", "지급 가능", "파일만 있음"];
const PAY_URL = `/expenses?${new URLSearchParams({ status: "지급 대상" }).toString()}`;
const FILE_ONLY_URL = `${PAY_URL}&evidence=file-only`;

function record(item: string, width: number | string, role: string, url: string, measured: unknown, expected: unknown, pass: boolean | null): void {
  mkdirSync(dirname(OUT), { recursive: true });
  const line = { item, width, role, url, measured: typeof measured === "string" ? measured : JSON.stringify(measured), expected: typeof expected === "string" ? expected : JSON.stringify(expected), pass };
  appendFileSync(OUT, `${JSON.stringify(line)}\n`);
  if (pass !== null) expect.soft(pass, `${item} @${width} ${role} ${url}: measured ${line.measured} / expected ${line.expected}`).toBe(true);
}

async function payer(fx: ExpenseE2E, scope: "company" | "team", prefix: string): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E감사${prefix}-${randomUUID().slice(0, 8)}`, workScope: scope, viewScope: scope });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const [project] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!project?.teamId) throw new Error("프로젝트 팀 없음");
  return makePerson(prefix, role.id, project.teamId, `${seoulToday().slice(0, 4)}-01-01`);
}

async function insertLink(ownerId: string, by: string): Promise<void> {
  const [batch] = await db
    .insert(evidenceImportBatches)
    .values({ format: "hometax-tax-invoice", originalName: "감사 세금계산서.xls", fileSha256: randomBytes(32).toString("hex"), rowCount: 1, registeredCount: 1, skippedDuplicateCount: 0, uploadedBy: by })
    .returning({ id: evidenceImportBatches.id });
  if (!batch) throw new Error("등록 묶음 없음");
  const [rec] = await db
    .insert(evidenceRecords)
    .values({ batchId: batch.id, format: "hometax-tax-invoice", evidenceType: "tax_invoice", dedupeKey: `audit:${randomUUID()}`, issuedOn: "2026-09-20", supplyKrw: 12_400_000, vatKrw: 0, totalKrw: 12_400_000, createdBy: by })
    .returning({ id: evidenceRecords.id });
  if (!rec) throw new Error("증빙 기록 없음");
  await db.insert(evidenceRecordLinks).values({ evidenceRecordId: rec.id, ownerKind: "expense", ownerId, attachMode: "registrar", attachedBy: by });
}

// 줄 하나 → 파일 붙여 제출 → 결재선 넷 승인(지급 대상 · 확인 전). mode: link = 증빙 기록 붙임 1 · waived = 확인 기록 면제.
async function approvedTarget(fx: ExpenseE2E, key: LineKey, mode: "plain" | "link" | "waived"): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const submitted = await submitReadyDraft(fx.pm.viewer, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
  }
  if (mode === "link") await insertLink(expenseId, fx.mgmt.viewer.id);
  if (mode === "waived") await db.insert(expenseEvidenceReviews).values({ expenseId, status: "waived", waiveReason: "감사 — 면제 문서", reviewedBy: fx.mgmt.viewer.id });
  return expenseId;
}

type Seed = { fx1: ExpenseE2E; fx2: ExpenseE2E; fx3: ExpenseE2E; wide: Person; narrow: Person; empty: Person };
let seed: Seed;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const fx1 = await setupExpenseE2E();
  await approvedTarget(fx1, "tracer", "plain"); // A — 든다
  await approvedTarget(fx1, "hold", "link"); // B — 붙임 있음, 빠진다
  await approvedTarget(fx1, "retry", "waived"); // C — 면제, 빠진다
  const fx2 = await setupExpenseE2E();
  await approvedTarget(fx2, "tracer", "plain"); // A2 — 다른 팀, narrow 범위 밖
  const fx3 = await setupExpenseE2E();
  await approvedTarget(fx3, "tracer", "link"); // EMPTY 팀 — B 꼴만
  seed = { fx1, fx2, fx3, wide: await payer(fx1, "company", "넓음"), narrow: await payer(fx1, "team", "좁음"), empty: await payer(fx3, "team", "빈팀") };
});

test.afterAll(archiveTempRoles);

// 행 = 표 본문의 주 행(그룹 줄 · 이유 줄 · 접힌 줄 · 상세 줄 제외). 이름은 항목 글자로 판정한다.
async function dataRows(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("main table tbody tr")]
      .filter((tr) => !/groupRow|reasonRow|collapsedRow/.test(tr.className) && tr.getAttribute("data-ui") !== "static-table-detail" && tr.querySelector("td"))
      .map((tr) => (tr.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
}

function has(rows: string[], name: string): boolean {
  return rows.some((row) => row.includes(name));
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const select = document.getElementById("expense-filter-evidence") as HTMLSelectElement | null;
    const form = select?.closest("form") ?? null;
    const holder = select?.parentElement ?? null;
    const s = select?.getBoundingClientRect();
    const f = form?.getBoundingClientRect();
    return {
      doc: [doc.scrollWidth, doc.clientWidth] as const,
      form: form ? ([form.scrollWidth, form.clientWidth] as const) : null,
      select: s && f ? { left: Math.round(s.left), right: Math.round(s.right), width: Math.round(s.width), formLeft: Math.round(f.left), formRight: Math.round(f.right), holderW: holder?.clientWidth ?? 0 } : null,
    };
  });
}

// 새 색 · 서체 · radius 확인용 — 화면의 계산된 값 집합.
async function styleSet(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      const where = `${el.tagName.toLowerCase()}${el.getAttribute("data-ui") ? `[${el.getAttribute("data-ui")}]` : ""}${el.getAttribute("aria-label") ? `[aria-label=${el.getAttribute("aria-label")}]` : ""} «${(el.textContent ?? "").trim().slice(0, 30)}»`;
      for (const key of [`color:${cs.color}`, `bg:${cs.backgroundColor}`, `font:${cs.fontFamily}`, `radius:${cs.borderRadius}`]) out[key] ??= where;
    }
    return out;
  });
}

// tokens.css에 정의된 색(16진) → rgb 글자. 「새 색」 = 토큰에 없는 색.
const TOKEN_RGB = new Set(
  [...readFileSync("docs/design/tokens.css", "utf8").matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => {
    const hex = m[1] ?? "000000";
    return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
  }),
);

async function counts(page: Page) {
  return page.evaluate(() => ({
    primary: [...document.querySelectorAll('[data-ui="primary-button"]')].filter((el) => !el.closest("dialog")).length,
    notice: document.querySelectorAll('[data-ui="banner"], [data-ui="toast"], [data-ui*="badge"], [data-ui="next-turn"]').length,
  }));
}

async function measureRole(page: Page, role: "wide" | "narrow", width: number): Promise<void> {
  const { fx1, fx2 } = seed;
  const A = fx1.lines.tracer.itemName;
  const B = fx1.lines.hold.itemName;
  const C = fx1.lines.retry.itemName;
  const A2 = fx2.lines.tracer.itemName;
  await page.setViewportSize({ width, height: 900 });

  const res = await page.goto(PAY_URL);
  record("응답 코드(필터 없음)", width, role, PAY_URL, res?.status(), 200, res?.status() === 200);
  const select = page.getByLabel("증빙", { exact: true });
  await waitForHydration(select);
  const noneRows = await dataRows(page);
  record("필터 없음 행에 A · B · C", width, role, PAY_URL, { A: has(noneRows, A), B: has(noneRows, B), C: has(noneRows, C) }, "모두 true", has(noneRows, A) && has(noneRows, B) && has(noneRows, C));
  record("필터 없음 행에 A2(다른 팀)", width, role, PAY_URL, has(noneRows, A2), role === "wide" ? true : false, has(noneRows, A2) === (role === "wide"));
  const labels = (await select.locator("option").allTextContents()).map((t) => t.trim());
  record("선택지 순서", width, role, PAY_URL, labels, EXPECTED_OPTIONS, JSON.stringify(labels) === JSON.stringify(EXPECTED_OPTIONS));
  record("마지막 선택지 글자", width, role, PAY_URL, labels.at(-1), "파일만 있음", labels.at(-1) === "파일만 있음");
  const values = await select.locator("option").evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
  record("마지막 선택지 value", width, role, PAY_URL, values.at(-1), "file-only", values.at(-1) === "file-only");
  const ov0 = await overflow(page);
  record("문서 scrollWidth <= clientWidth(필터 없음)", width, role, PAY_URL, ov0.doc.join("/"), "scrollWidth <= clientWidth", ov0.doc[0] <= ov0.doc[1]);
  const c0 = await counts(page);
  const style0 = await styleSet(page);

  // 키보드만: 포커스 → Alt+ArrowDown(열기) → End → Enter.
  await select.focus();
  const focused = await page.evaluate(() => document.activeElement?.id ?? "");
  record("선택 칸 포커스", width, role, PAY_URL, focused, "expense-filter-evidence", focused === "expense-filter-evidence");
  await Promise.all([page.waitForURL(/evidence=file-only/, { timeout: 15_000 }).catch(() => undefined), (async () => {
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
  })()]);
  await page.waitForLoadState("networkidle");
  const url = new URL(page.url());
  record("키보드 고름 뒤 URL evidence", width, role, "keyboard", url.searchParams.get("evidence"), "file-only", url.searchParams.get("evidence") === "file-only");
  await waitForHydration(page.getByLabel("증빙", { exact: true }));
  const fileRows = await dataRows(page);
  const expectA2 = role === "wide";
  record("file-only 행 = A(+wide면 A2)", width, role, FILE_ONLY_URL, { A: has(fileRows, A), B: has(fileRows, B), C: has(fileRows, C), A2: has(fileRows, A2) }, { A: true, B: false, C: false, A2: expectA2 }, has(fileRows, A) && !has(fileRows, B) && !has(fileRows, C) && has(fileRows, A2) === expectA2);
  const totalText = (await page.locator("main section[aria-label='합계'] p").first().textContent())?.trim() ?? "";
  const n = Number(/· (\d+)건\)/.exec(totalText)?.[1] ?? NaN);
  record("합계 줄 건수 = 보이는 행 수", width, role, FILE_ONLY_URL, `${totalText} / 행 ${fileRows.length}`, "같음", n === fileRows.length);
  const ov1 = await overflow(page);
  record("문서 scrollWidth <= clientWidth(file-only)", width, role, FILE_ONLY_URL, ov1.doc.join("/"), "scrollWidth <= clientWidth", ov1.doc[0] <= ov1.doc[1]);
  record("필터 폼 scrollWidth <= clientWidth", width, role, FILE_ONLY_URL, ov1.form?.join("/"), "scrollWidth <= clientWidth", !!ov1.form && ov1.form[0] <= ov1.form[1]);
  const sel = ov1.select;
  record("선택 칸이 폼 · 부모 폭 안", width, role, FILE_ONLY_URL, sel, "left >= formLeft · right <= formRight · width <= 부모", !!sel && sel.left >= sel.formLeft && sel.right <= sel.formRight && sel.width <= sel.holderW + 1);
  const selectText = await page.getByLabel("증빙", { exact: true }).evaluate((el) => { const s = el as HTMLSelectElement; return { shown: s.options[s.selectedIndex]?.text ?? "", sw: s.scrollWidth, cw: s.clientWidth }; });
  record("고른 글자 `파일만 있음` 안 넘침", width, role, FILE_ONLY_URL, selectText, "shown 파일만 있음 · scrollWidth <= clientWidth", selectText.shown === "파일만 있음" && selectText.sw <= selectText.cw);
  const c1 = await counts(page);
  record("1차 버튼 DOM 수(필터 전 = 후)", width, role, FILE_ONLY_URL, `${c0.primary} → ${c1.primary}`, width >= 1024 ? "1 → 1" : "0 → 0", c0.primary === c1.primary && c1.primary === (width >= 1024 ? 1 : 0));
  record("알림 · 배지 요소 수", width, role, FILE_ONLY_URL, `${c0.notice} → ${c1.notice}`, "0 → 0", c0.notice === 0 && c1.notice === 0);
  const style1 = await styleSet(page);
  const added = Object.keys(style1).filter((value) => !(value in style0));
  record("필터 전에 없던 계산 값(참고 · 자리)", width, role, FILE_ONLY_URL, added.map((value) => `${value} @ ${style1[value]}`), "—", null);
  const offToken = added.filter((value) => (value.startsWith("color:") || value.startsWith("bg:")) && !value.endsWith("rgba(0, 0, 0, 0)") && !TOKEN_RGB.has(value.replace(/^(color|bg):/, "")));
  const otherNew = added.filter((value) => value.startsWith("font:") || value.startsWith("radius:"));
  record("토큰 밖 새 색 · 새 서체 · 새 radius", width, role, FILE_ONLY_URL, [...offToken, ...otherNew], "[]", offToken.length === 0 && otherNew.length === 0);

  await page.reload();
  await waitForHydration(page.getByLabel("증빙", { exact: true }));
  const kept = await page.getByLabel("증빙", { exact: true }).inputValue();
  const reRows = await dataRows(page);
  const reTotal = (await page.locator("main section[aria-label='합계'] p").first().textContent())?.trim() ?? "";
  // wide는 전사 지급 대상을 본다 — desktop의 다른 워커가 그사이 지급 대상 문서를 만들면 전체 건수가 는다(PR #254 CI e2e (1): 3건 → 4건).
  // 그래서 건수는 이 감사가 만든 행(A · B · C · A2)으로 견주고, 합계 줄은 새로 고친 화면의 행 수와 맞는지만 본다.
  const seeded = (rows: string[]) => [A, B, C, A2].map((name) => has(rows, name));
  const reN = Number(/· (\d+)건\)/.exec(reTotal)?.[1] ?? NaN);
  record("새로 고침 뒤 값 · 건수 유지", width, role, FILE_ONLY_URL, { kept, seeded: seeded(reRows), totalRows: reN === reRows.length }, { kept: "file-only", seeded: seeded(fileRows), totalRows: true }, kept === "file-only" && JSON.stringify(seeded(reRows)) === JSON.stringify(seeded(fileRows)) && reN === reRows.length);
}

for (const role of ["wide", "narrow"] as const) {
  test(`파일만 있음 감사 — ${role}`, async ({ browser, baseURL }) => {
    test.setTimeout(600_000);
    const page = await loginPage(browser, baseURL, role === "wide" ? seed.wide : seed.narrow);
    for (const width of WIDTHS) await measureRole(page, role, width);
    await page.context().close();
  });
}

test("파일만 있음 감사 — EMPTY(붙임 있는 문서만인 팀)", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const page = await loginPage(browser, baseURL, seed.empty);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const res = await page.goto(FILE_ONLY_URL);
    record("응답 코드", width, "empty", FILE_ONLY_URL, res?.status(), 200, res?.status() === 200);
    await waitForHydration(page.getByLabel("증빙", { exact: true }));
    const empty = page.locator('[data-ui="empty-state"]');
    const text = ((await empty.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    record("EMPTY 글자", width, "empty", FILE_ONLY_URL, text, "조건에 맞는 건이 없습니다 · 필터 지우기", text.includes("조건에 맞는 건이 없습니다"));
    const href = await page.getByRole("link", { name: "필터 지우기" }).getAttribute("href").catch(() => null);
    record("필터 지우기 href", width, "empty", FILE_ONLY_URL, href, PAY_URL, href === PAY_URL);
    const rows = await dataRows(page);
    record("EMPTY 행 수", width, "empty", FILE_ONLY_URL, rows.length, 0, rows.length === 0);
    const value = await page.getByLabel("증빙", { exact: true }).inputValue();
    record("EMPTY에서 선택 칸 값 유지", width, "empty", FILE_ONLY_URL, value, "file-only", value === "file-only");
    const ov = await overflow(page);
    record("문서 scrollWidth <= clientWidth", width, "empty", FILE_ONLY_URL, ov.doc.join("/"), "scrollWidth <= clientWidth", ov.doc[0] <= ov.doc[1]);
  }
  await page.context().close();
});
