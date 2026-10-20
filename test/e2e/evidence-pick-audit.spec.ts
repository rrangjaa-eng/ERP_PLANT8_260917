import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, projects, purchaseRequests } from "@/db/schema";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, submitExpense, withdrawExpense } from "@/domain/expenses";
import { countEvidencePool } from "@/domain/evidence-records/pool";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createIntakeManager, insertLinkFixture, insertRecordFixture, setRecordVisibilityFixture } from "@/test/integration/fixtures/evidence";
import { attachEvidence } from "@/test/integration/fixtures/expenses";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { clearEvidence, loginAs } from "./helpers/evidence";

// 06.1-08 독립 DOM 감사(실행자가 아닌 별도 에이전트). 판정은 CI=true 프로덕션 빌드의 DOM 실측값으로만 한다(스크린샷 육안 금지).
// 케이스마다 증빙 표를 비우고 자기 자료를 만든다(케이스끼리 기대지 않는다 — 06.1-06 감사 스펙 A/B 흔들림의 교훈).
// 자격(실제 권한으로 로그인 · 관리자 아님): 1팀 PM(작성자 role-pm) · 2팀 PM · 1팀 팀장 · 경영관리(붙이기 키 있음) · 경영관리(키 없음) · 구매 처리 · 기본 계급 요청자.
// 항목마다 실측 · 기대 · 판정을 JSONL(AUDIT_OUT)로 남기고 expect.soft로 한 실행에서 전부 잰다.

const WIDTHS = [1280, 768, 375, 320] as const;
const PHONE = (width: number) => width < 700;
const OUT = process.env.AUDIT_OUT ?? "test-results/evidence-pick-audit.jsonl";
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

async function docOverflow(page: Page): Promise<[number, number]> {
  return page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth] as [number, number]);
}

// 여는 전환(§5)이 끝난 뒤 잰다.
async function axe(page: Page, include?: string): Promise<string[]> {
  await page.waitForTimeout(700);
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const results = await builder.analyze();
  return results.violations.map((v) => {
    const parts = v.nodes.slice(0, 3).map((node) => {
      const data = node.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
      return `${node.target.join(" ")}${data?.contrastRatio ? ` [${data.fgColor} on ${data.bgColor} = ${data.contrastRatio}]` : ""}`;
    });
    return `${v.id}(${v.nodes.length}):${parts.join(" | ")}`;
  });
}

async function box(locator: Locator): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const b = await locator.boundingBox().catch(() => null);
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
}
const big = (b: { w: number; h: number } | null) => !!b && b.w >= 44 && b.h >= 44;

async function activeDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "none";
    return `${el.tagName.toLowerCase()}«${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}»`;
  });
}

async function lockLines(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const re = new RegExp(source);
    return [...document.querySelectorAll("main *")].filter((el) => el.children.length === 0 && el.getClientRects().length > 0 && re.test((el.textContent ?? "").trim())).map((el) => (el.textContent ?? "").trim());
  }, LOCK_RE.source);
}

const pickTrigger = (page: Page) => page.getByRole("button", { name: /^증빙 고르기 \d+$/ });
const pickDialog = (page: Page) => page.getByRole("dialog", { name: "증빙 고르기" });

// 「증빙」 섹션(트리거를 품은 블록)과 폼 · 고정 행동 줄의 자리 — 폼 분기에서 섹션을 폼 위로 옮긴 배치(편차 4)를 잰다.
async function layoutFacts(page: Page): Promise<{ order: string[]; trigger: { top: number; bottom: number } | null; bar: { top: number; bottom: number; position: string } | null; hit: string | null; hitAfterScroll: string | null }> {
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>("[data-evidence-pick]");
    const bar = document.querySelector<HTMLElement>("[data-testid='expense-form-actions']");
    const kids = [...(document.querySelector("main")?.querySelectorAll("[data-evidence-pick], table[aria-label], table caption, label, dt, [data-testid='expense-form-actions'], form") ?? [])];
    const order = kids
      .filter((el) => el.getClientRects().length > 0 || el.tagName === "CAPTION")
      .map((el) => (el.hasAttribute("data-evidence-pick") ? "트리거" : el.tagName === "FORM" ? "form" : el.getAttribute("data-testid") === "expense-form-actions" ? "행동 줄" : (el.textContent ?? "").trim().slice(0, 12)))
      .filter((t, i, all) => t && all.indexOf(t) === i)
      .slice(0, 24);
    const tb = trigger?.getBoundingClientRect();
    const bb = bar?.getBoundingClientRect();
    const hitAt = () => {
      if (!trigger) return null;
      const r = trigger.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el ? (trigger.contains(el) ? "트리거" : `${el.tagName.toLowerCase()}«${(el.textContent ?? "").trim().slice(0, 16)}»`) : "밖";
    };
    const hit = hitAt();
    trigger?.scrollIntoView({ block: "end" });
    const hitAfterScroll = hitAt();
    window.scrollTo(0, 0);
    return {
      order,
      trigger: tb ? { top: Math.round(tb.top), bottom: Math.round(tb.bottom) } : null,
      bar: bb ? { top: Math.round(bb.top), bottom: Math.round(bb.bottom), position: getComputedStyle(bar as HTMLElement).position } : null,
      hit,
      hitAfterScroll,
    };
  });
}

// PickDialog 안 행 번호 · 고름 표시 · 금액 글자의 대비(4.25 재현 확인) — 고른 행 · 현재 행의 번호 칸 글자색 대 행 면.
async function rowContrast(dialog: Locator): Promise<{ text: string; selected: string | null; current: boolean; fg: string; bg: string; ratio: number }[]> {
  return dialog.evaluate((root) => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
    const lum = ([r = 0, g = 0, b = 0]: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el: Element | null): string => {
      for (let node = el; node; node = node.parentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        const parts = parse(bg);
        if (parts.length === 3 || (parts[3] ?? 0) > 0) return bg;
      }
      return "rgb(255, 255, 255)";
    };
    const out: { text: string; selected: string | null; current: boolean; fg: string; bg: string; ratio: number }[] = [];
    for (const option of root.querySelectorAll("[role=option]")) {
      for (const leaf of option.querySelectorAll("*")) {
        if (leaf.children.length > 0 || !(leaf.textContent ?? "").trim()) continue;
        const fg = getComputedStyle(leaf).color;
        const bg = bgOf(leaf);
        const a = lum(parse(fg));
        const b = lum(parse(bg));
        const ratio = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
        out.push({ text: (leaf.textContent ?? "").trim().slice(0, 16), selected: option.getAttribute("aria-selected"), current: /current/.test(option.className), fg, bg, ratio });
      }
    }
    return out;
  });
}

async function measureDialog(page: Page, width: number, role: string, url: string, opts: { expectPreselect: boolean; foreignName?: string; blockedName?: string }): Promise<void> {
  const dialog = pickDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0, { timeout: 15_000 }).catch(() => undefined);
  await expect(dialog.getByRole("option").first()).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  const focused = await activeDescription(page);
  record("S5 열림 직후 포커스 = 검색 칸", width, role, url, focused, "input«거래처 · 금액»", focused.startsWith("input«거래처 · 금액»"));
  const struct = await dialog.evaluate((el) => {
    const list = el.querySelector("[role=listbox]");
    const options = [...el.querySelectorAll("[role=option]")];
    const primary = el.querySelectorAll<HTMLElement>('[data-ui="primary-button"]');
    const search = el.querySelector<HTMLElement>("input");
    return {
      multiselectable: list?.getAttribute("aria-multiselectable") ?? null,
      options: options.length,
      firstSelected: options[0]?.getAttribute("aria-selected") ?? null,
      selected: options.filter((o) => o.getAttribute("aria-selected") === "true").length,
      checkbox: el.querySelectorAll("input[type=checkbox]").length,
      combobox: el.querySelectorAll("[role=combobox]").length,
      interactiveInOption: options.reduce((n, o) => n + o.querySelectorAll("input, button, a, [tabindex]").length, 0),
      primary: primary.length,
      primaryText: primary[0]?.textContent?.trim() ?? null,
      nativeDisabled: el.querySelectorAll("button:disabled").length,
      close: el.querySelector("button[aria-label='닫기']") ? 1 : 0,
      searchH: Math.round(search?.getBoundingClientRect().height ?? 0),
      overflow: [el.scrollWidth, el.clientWidth],
      disabledRows: options.filter((o) => o.getAttribute("aria-disabled") === "true").map((o) => (o.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60)),
      texts: options.map((o) => (o.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50)),
      amountNowrap: [...el.querySelectorAll("[role=option] *")].filter((n) => n.children.length === 0 && /^[0-9]{1,3}(,[0-9]{3})+$/.test((n.textContent ?? "").trim())).map((n) => { for (let node: Element | null = n; node && node !== el; node = node.parentElement) { if (getComputedStyle(node).whiteSpace === "nowrap") return "nowrap"; } return getComputedStyle(n).whiteSpace; }),
      maxRowLines: Math.max(
        0,
        ...options.map((o) => {
          const lh = parseFloat(getComputedStyle(o.querySelector("*") ?? o).lineHeight) || 20;
          const padding = parseFloat(getComputedStyle(o).paddingTop) + parseFloat(getComputedStyle(o).paddingBottom);
          return Math.round((o.getBoundingClientRect().height - padding) / lh);
        }),
      ),
    };
  });
  record("S5 listbox aria-multiselectable=true", width, role, url, struct.multiselectable, "true", struct.multiselectable === "true");
  record(
    opts.expectPreselect ? "S5 1위 행 aria-selected=true" : "S5 고른 행 0(결재 중 경영관리)",
    width,
    role,
    url,
    { first: struct.firstSelected, selected: struct.selected },
    opts.expectPreselect ? { first: "true", selected: 1 } : { selected: 0 },
    opts.expectPreselect ? struct.firstSelected === "true" && struct.selected === 1 : struct.selected === 0,
  );
  record("S5 checkbox · combobox · option 안 대화형 0", width, role, url, { checkbox: struct.checkbox, combobox: struct.combobox, interactive: struct.interactiveInOption }, 0, struct.checkbox === 0 && struct.combobox === 0 && struct.interactiveInOption === 0);
  record("S5 1차 버튼 수 = 1", width, role, url, { n: struct.primary, text: struct.primaryText }, 1, struct.primary === 1);
  record("S5 네이티브 disabled 0", width, role, url, struct.nativeDisabled, 0, struct.nativeDisabled === 0);
  record("S5 닫기 x 접근 이름 「닫기」", width, role, url, struct.close, 1, struct.close === 1);
  record("S5 창 가로 넘침 0", width, role, url, struct.overflow.join("/"), "scrollWidth <= clientWidth", (struct.overflow[0] ?? 0) <= (struct.overflow[1] ?? 0));
  // SYSTEM §7-17-1에 검색 칸 높이 수치가 없다 — PC는 --control-h(32) 기본 · 폰은 ≥ 40(§10 폼 입력)만 판정한다.
  record(PHONE(width) ? "S5 검색 칸 높이 ≥ 40(폰 §10)" : "S5 검색 칸 높이(참고 — PC --control-h)", width, role, url, struct.searchH, PHONE(width) ? "≥ 40" : "—", PHONE(width) ? struct.searchH >= 40 : null);
  record("S5 금액 white-space nowrap", width, role, url, struct.amountNowrap, "전부 nowrap", struct.amountNowrap.length > 0 && struct.amountNowrap.every((w) => w === "nowrap"));
  record("S5 행 글자(참고)", width, role, url, struct.texts, "—", null);
  if (opts.foreignName) {
    const leaked = struct.texts.some((t) => t.includes(opts.foreignName ?? "¤"));
    record("S5 2팀 공개 증빙이 1팀 PM 후보에 없음", width, role, url, leaked, false, !leaked);
  }
  if (opts.blockedName) {
    const row = struct.disabledRows.find((t) => t.includes(opts.blockedName ?? "¤")) ?? null;
    // 이 시드의 카드 종류 행이 짝 막힘이 되는지는 서버 짝 규칙이 정한다 — 막힌 행이 서면 이유를, 안 서면 참고로만 남긴다.
    record("S5 막힌 행 aria-disabled + 2행 이유(참고 — 막힌 행이 설 때)", width, role, url, { row, disabledRows: struct.disabledRows }, "—", null);
  }
  if (width === 320) record("S5 320 행 줄 수 ≤ 3", width, role, url, struct.maxRowLines, "≤ 3", struct.maxRowLines <= 3);
  if (PHONE(width)) {
    const bar = await dialog.evaluate((el) => {
      const primary = el.querySelector<HTMLElement>('[data-ui="primary-button"]');
      const secondary = [...el.querySelectorAll<HTMLElement>("button")].find((b) => /^취소/.test((b.textContent ?? "").trim()));
      const close = el.querySelector<HTMLElement>("button[aria-label='닫기']");
      const option = el.querySelector<HTMLElement>("[role=option]");
      const r = (n: HTMLElement | null | undefined) => (n ? { x: Math.round(n.getBoundingClientRect().left), w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height) } : null);
      return { primary: r(primary), secondary: r(secondary), close: r(close), option: r(option) };
    });
    record("S5 폰 1차 · 2차 · 닫기 · 행 박스 ≥ 44×44", width, role, url, bar, "≥ 44×44", [bar.primary, bar.close, bar.option].every((b) => !!b && b.w >= 44 && b.h >= 44));
    const ratio = bar.primary && bar.secondary ? Math.round((bar.primary.w / bar.secondary.w) * 100) / 100 : null;
    record("S5 폰 행동 줄 2차 왼쪽 · 1차 폭 ≈ 2차 두 배", width, role, url, { secondaryLeft: bar.secondary && bar.primary ? bar.secondary.x < bar.primary.x : null, ratio }, { secondaryLeft: true, ratio: "1.8~2.2" }, !!bar.secondary && !!bar.primary && bar.secondary.x < bar.primary.x && ratio !== null && ratio >= 1.8 && ratio <= 2.2);
  }
  const contrast = await rowContrast(dialog);
  const low = contrast.filter((c) => c.ratio < 4.5);
  record("S5 행 글자 대비 < 4.5 (PickDialog 4.25 재현 확인)", width, role, url, low.slice(0, 6), "[]", low.length === 0);
  const violations = await axe(page, "dialog[open]");
  record("axe 위반(S5 열림)", width, role, url, violations, "[]", violations.length === 0);
  const off = await offTokens(page, "dialog[open]");
  record("토큰 밖 색 · 서체 · radius(S5)", width, role, url, off, "[]", off.length === 0);
}

// 결과 줄 `고른 {n}건` — 없으면 null(기다리지 않는다).
async function resultLineOf(dialog: Locator): Promise<string | null> {
  return dialog.evaluate((el) => [...el.querySelectorAll("*")].find((n) => n.children.length === 0 && /^고른 \d+건$/.test((n.textContent ?? "").trim()))?.textContent?.trim() ?? null);
}

async function closeAndCheckFocus(page: Page, width: number, role: string, url: string, expectedFocus: RegExp, label: string): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(pickDialog(page)).toBeHidden();
  const back = await activeDescription(page);
  record(`S5 Esc 닫힌 뒤 포커스 = ${label}`, width, role, url, back, label, expectedFocus.test(back));
}

async function inReviewDocument(fx: ExpenseE2E, line: keyof ExpenseE2E["lines"] = "tracer"): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[line].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await attachEvidence(fx.pm.viewer, expenseId);
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("문서 없음");
  const submitted = await submitExpense(fx.pm.viewer, { expenseId, expectedVersion: row.version });
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return expenseId;
}

async function approveFully(fx: ExpenseE2E, expenseId: string): Promise<void> {
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  let version = view.version;
  let status = "submitted";
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    if (status === "approved") break;
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
    status = result.status;
  }
  if (status !== "approved") throw new Error(`결재 통과 안 됨: ${status}`);
}

async function rejectIt(fx: ExpenseE2E, expenseId: string): Promise<void> {
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
}

async function withdrawIt(fx: ExpenseE2E, expenseId: string): Promise<void> {
  const view = await getApprovalView(fx.pm.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await withdrawExpense(fx.pm.viewer, { expenseId, expectedInstanceVersion: view.version });
}

async function draftDocument(fx: ExpenseE2E, line: keyof ExpenseE2E["lines"] = "tracer"): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[line].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  return expenseId;
}

async function teamPublic(manager: Viewer, teamId: string, input: Parameters<typeof insertRecordFixture>[1]): Promise<string> {
  const id = await insertRecordFixture(manager, input);
  await setRecordVisibilityFixture(id, { visibility: "team", teamId });
  return id;
}

async function asRole(browser: Browser, baseURL: string | undefined, roleId: string): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await loginAs(page, roleId);
  return page;
}

// 기다리는 동작이 한 항목에서 케이스 시간을 다 쓰지 않게(측정 실패는 그 항목 FAIL로 남는다).
test.use({ actionTimeout: 20_000 });

test.beforeEach(async () => {
  await clearEvidence();
});
test.afterAll(archiveTempRoles);

test("P1 작성자 1팀 PM — 임시 문서 「증빙」 섹션 · S5 (4폭) · 배치 · 키보드 · 실패 · 붙인 뒤", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const role = "1팀PM(작성자)";
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager("감사8경영");
  const s = randomUUID().slice(0, 4);
  const names = { top: fx.vendorName, second: `감사8둘째${s}`, blocked: `감사8카드${s}`, foreign: `감사8남팀${s}`, hidden: `감사8비공개${s}` };
  await teamPublic(manager, fx.teamId, { nameOnDocument: names.top, issuedOn: seoulToday() });
  await teamPublic(manager, fx.teamId, { nameOnDocument: names.second, supplyKrw: 1_000_000, issuedOn: "2026-09-10" });
  await teamPublic(manager, fx.teamId, { nameOnDocument: names.blocked, evidenceType: "card", supplyKrw: 50_000, issuedOn: "2026-09-11" });
  const otherUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `감사8남본부-${s}` });
  const otherTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: otherUnit.id, name: `감사8남팀-${s}` });
  await teamPublic(manager, otherTeam.id, { nameOnDocument: names.foreign, issuedOn: seoulToday() });
  await insertRecordFixture(manager, { nameOnDocument: names.hidden });
  const expenseId = await draftDocument(fx);
  const url = `/expenses/${expenseId}`;
  const serverN = await countEvidencePool(fx.pm.viewer, { kind: "expense", id: expenseId });
  const page = await loginPage(browser, baseURL, fx.pm);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: PHONE(width) ? 700 : 900 });
    const res = await page.goto(url);
    record("응답 코드", width, role, url, res?.status(), 200, res?.status() === 200);
    const trigger = pickTrigger(page);
    await waitForHydration(trigger);
    await page.waitForLoadState("networkidle");
    const label = (await trigger.textContent())?.trim() ?? "";
    record("트리거 글자 N = 서버가 센 후보 수", width, role, url, { label, serverN }, `증빙 고르기 ${serverN}`, label === `증빙 고르기 ${serverN}`);
    const ov = await docOverflow(page);
    record("문서 scrollWidth <= clientWidth", width, role, url, ov.join("/"), "scrollWidth <= clientWidth", ov[0] <= ov[1]);
    const tb = await box(trigger);
    record(PHONE(width) ? "트리거 터치 박스 ≥ 44×44" : "트리거 박스(참고)", width, role, url, tb, PHONE(width) ? "≥ 44×44" : "—", PHONE(width) ? big(tb) : null);
    const layout = await layoutFacts(page);
    record("배치 순서(참고 — 트리거 · 표 캡션 · 라벨 · 행동 줄)", width, role, url, layout.order, "—", null);
    const triggerBeforeForm = layout.order.indexOf("트리거") >= 0 && layout.order.indexOf("트리거") < layout.order.indexOf("견적 줄");
    record("「증빙」 트리거가 폼(견적 줄) 위에 섬 — SYSTEM §6-3 순서(금액 · 증빙 종류 아래 · 결재선 위)와 다름", width, role, url, { triggerBeforeForm, order: layout.order.slice(0, 8) }, "§6-3: 견적 줄 → 금액 → 지급 예정 → 증빙 종류 → 증빙 → 결재선", !triggerBeforeForm);
    const overlap = !!layout.trigger && !!layout.bar && layout.bar.position === "fixed" && layout.trigger.bottom > layout.bar.top && layout.trigger.top < layout.bar.bottom;
    record("트리거가 고정 행동 줄과 겹치지 않음(첫 화면)", width, role, url, { trigger: layout.trigger, bar: layout.bar, hit: layout.hit }, { overlap: false, hit: "트리거" }, !overlap && (layout.hit === "트리거" || layout.hit === "밖"));
    // D-1 고침: 트리거가 폼 「증빙」 칸으로 옮겨 첫 화면 밖일 수 있다(hit "밖" = 화면 밖) — 가려짐은 화면 안일 때만 판정하고, 굴린 뒤 판정은 따로 둔다.
    record("트리거를 화면 아래 끝으로 굴렸을 때 맨 위 요소 = 트리거", width, role, url, layout.hitAfterScroll, "트리거", layout.hitAfterScroll === "트리거");
    const primary = await page.locator('main [data-ui="primary-button"]:visible').count();
    record("화면 1차 버튼 ≤ 1", width, role, url, primary, "≤ 1", primary <= 1);
    const locks = await lockLines(page);
    record("잠김 줄 ≤ 1", width, role, url, locks, "≤ 1", locks.length <= 1);
    const v = await axe(page);
    record("axe 위반(문서 화면)", width, role, url, v, "[]", v.length === 0);
    const off = await offTokens(page, "[data-evidence-pick]");
    record("토큰 밖 색 · 서체 · radius(트리거)", width, role, url, off, "[]", off.length === 0);
    await shot(page, `p1-doc-${width}`);

    await trigger.click();
    await measureDialog(page, width, role, url, { expectPreselect: true, foreignName: names.foreign, blockedName: names.blocked });
    const hiddenLeak = ((await pickDialog(page).textContent()) ?? "").includes(names.hidden);
    record("S5 비공개 증빙이 PM 후보에 없음", width, role, url, hiddenLeak, false, !hiddenLeak);
    await shot(page, `p1-s5-${width}`);
    await closeAndCheckFocus(page, width, role, url, /^button«증빙 고르기 \d+»/, "트리거");
  }

  // 키보드 · 빈 결과 · 고른 것 0 · 실패 · 붙인 뒤(1280).
  const width = 1280;
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url);
  const trigger = pickTrigger(page);
  await waitForHydration(trigger);
  await trigger.click();
  const dialog = pickDialog(page);
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  const search = dialog.getByRole("textbox", { name: "거래처 · 금액" });
  await search.press("ArrowDown");
  const firstFocus = await activeDescription(page);
  record("S5 검색 칸 ↓ → 목록 첫 행", width, role, url, firstFocus, "li«…»", /^li«/.test(firstFocus));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  const afterSpace = await dialog.getByRole("option", { selected: true }).count();
  const resultLine = await resultLineOf(dialog);
  const primaryText = (await dialog.locator('[data-ui="primary-button"]').textContent())?.trim() ?? "";
  record("S5 Space 토글 → 고른 2 · 결과 줄 · 1차 N", width, role, url, { afterSpace, resultLine, primaryText }, { afterSpace: 2, resultLine: "고른 2건", primary: "증빙 붙이기 2…" }, afterSpace === 2 && resultLine === "고른 2건" && primaryText.startsWith("증빙 붙이기 2"));
  await search.fill(names.second.slice(0, 6));
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  await page.waitForTimeout(600);
  const kept = await resultLineOf(dialog);
  record("S5 검색 바꾼 뒤 결과 줄이 가려진 고름까지 셈", width, role, url, kept, "고른 2건", kept === "고른 2건");
  await search.fill("감사8-없는-증빙-zz");
  await expect(dialog.getByText("조건에 맞는 증빙이 없습니다", { exact: false })).toBeVisible({ timeout: 10_000 }).catch(() => undefined);
  const empty = ((await dialog.textContent()) ?? "").includes("조건에 맞는 증빙이 없습니다");
  record("S5 검색 0 `조건에 맞는 증빙이 없습니다`", width, role, url, empty, true, empty);
  await search.fill("");
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  await page.waitForTimeout(600);
  for (let guard = 0; guard < 5 && (await dialog.getByRole("option", { selected: true }).count()) > 0; guard += 1) await dialog.getByRole("option", { selected: true }).first().click();
  const zero = await dialog.locator('[data-ui="primary-button"]').evaluate((el) => {
    const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    return { text: (el.textContent ?? "").trim(), ariaDisabled: el.getAttribute("aria-disabled"), described: ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" / ") };
  });
  record("S5 고른 것 0 → 1차 aria-disabled + `고른 증빙 없음`", width, role, url, zero, { ariaDisabled: "true", described: "고른 증빙 없음" }, zero.ariaDisabled === "true" && zero.described.includes("고른 증빙 없음"));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.route(`**/expenses/${expenseId}**`, async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.abort();
    else await route.continue();
  });
  await trigger.click();
  await expect(dialog.getByText("목록 불러오기 실패", { exact: false })).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  const failText = ((await dialog.textContent()) ?? "").includes("목록 불러오기 실패");
  const retry = await dialog.getByRole("button", { name: "다시 시도" }).count();
  record("S5 불러오기 실패 `목록 불러오기 실패` + `다시 시도`", width, role, url, { failText, retry }, { failText: true, retry: 1 }, failText && retry === 1);
  await page.unroute(`**/expenses/${expenseId}**`);
  await dialog.getByRole("button", { name: "다시 시도" }).click().catch(() => undefined);
  await expect(dialog.getByRole("option").first()).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  const recovered = await dialog.getByRole("option").count();
  record("S5 `다시 시도` 뒤 후보 다시 섬", width, role, url, recovered, "≥ 1", recovered >= 1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await trigger.click();
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  await expect(dialog.getByRole("option", { selected: true })).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const rows = page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const readRow = ((await rows.first().textContent()) ?? "").replace(/\s+/g, " ").trim();
  const mmdd = seoulToday().slice(5);
  record("S5 Enter 뒤 읽기 행 2행 `{이름} 고름 · {MM-DD}`", width, role, url, readRow, `${fx.pm.name} 고름 · ${mmdd}`, readRow.includes(`${fx.pm.name} 고름 · ${mmdd}`));
  await page.waitForTimeout(600);
  const focusAfter = await activeDescription(page);
  record("S5 붙인 뒤 포커스 = 트리거(후보 남음) 또는 첫 행동", width, role, url, focusAfter, "button«증빙 고르기 N» / button«떼기»", /^button«(증빙 고르기 \d+|떼기)/.test(focusAfter));
  for (const w of [375, 320] as const) {
    await page.setViewportSize({ width: w, height: 700 });
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const detach = page.getByRole("table", { name: "붙은 증빙" }).getByRole("button", { name: "떼기" }).first();
    const db1 = await box(detach);
    record("자기 떼기 `떼기` 터치 박스 ≥ 44×44", w, role, url, db1, "≥ 44×44", big(db1));
    const ov = await docOverflow(page);
    record("붙인 뒤 문서 scrollWidth <= clientWidth", w, role, url, ov.join("/"), "scrollWidth <= clientWidth", ov[0] <= ov[1]);
  }
  await page.context().close();
});

test("P2 문서 상태 × 작성자 — 반려 · 회수 · 승인(완료 아님) · 승인+완료 · 완료 프로젝트 임시 · 반려", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const role = "1팀PM(작성자)";
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager("감사8경영P2");
  await teamPublic(manager, fx.teamId, { nameOnDocument: fx.vendorName });
  await teamPublic(manager, fx.teamId, { nameOnDocument: `감사8P2둘째`, supplyKrw: 900_000 });
  const returned = await inReviewDocument(fx);
  await rejectIt(fx, returned);
  const withdrawn = await inReviewDocument(fx, "hold");
  await withdrawIt(fx, withdrawn);
  const approved = await inReviewDocument(fx, "retry");
  await approveFully(fx, approved);
  const draftDone = await draftDocument(fx, "phone");
  const returnedDone = await inReviewDocument(fx, "worst");
  await rejectIt(fx, returnedDone);
  const cases: { label: string; id: string; trigger: boolean; lock: string | null; completed: boolean }[] = [
    { label: "반려", id: returned, trigger: true, lock: null, completed: false },
    { label: "회수", id: withdrawn, trigger: true, lock: null, completed: false },
    { label: "승인(완료 아님)", id: approved, trigger: true, lock: "승인됨 · 떼기는 증빙 무효 담당", completed: false },
    { label: "승인+완료 프로젝트", id: approved, trigger: false, lock: "완료 프로젝트 · 증빙은 경영관리", completed: true },
    { label: "완료 프로젝트 임시(PA-DONEDRAFT)", id: draftDone, trigger: true, lock: null, completed: true },
    { label: "완료 프로젝트 반려(PA-DONEDRAFT)", id: returnedDone, trigger: true, lock: null, completed: true },
  ];
  await insertLinkFixture({ recordId: await insertRecordFixture(manager, { nameOnDocument: "감사8P2승인붙음" }), ownerId: approved, attachMode: "author", attachedBy: fx.pm.viewer.id });
  const page = await loginPage(browser, baseURL, fx.pm);
  for (const c of cases) {
    if (c.completed) await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    else await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, fx.projectId));
    const url = `/expenses/${c.id}`;
    for (const width of [1280, 375] as const) {
      await page.setViewportSize({ width, height: PHONE(width) ? 700 : 900 });
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      const n = await pickTrigger(page).count();
      const serverN = c.trigger ? await countEvidencePool(fx.pm.viewer, { kind: "expense", id: c.id }) : 0;
      const label = n > 0 ? ((await pickTrigger(page).first().textContent()) ?? "").trim() : null;
      record(`${c.label} 트리거 ${c.trigger ? "있음 · N = 서버" : "없음"}`, width, role, url, { n, label }, c.trigger ? `증빙 고르기 ${serverN}` : 0, c.trigger ? n === 1 && label === `증빙 고르기 ${serverN}` : n === 0);
      const locks = await lockLines(page);
      record(`${c.label} 잠김 줄 ≤ 1${c.lock ? ` · = ${c.lock}` : ""}`, width, role, url, locks, c.lock ? [c.lock] : "≤ 1", c.lock ? locks.length === 1 && locks[0] === c.lock : locks.length <= 1);
      const primary = await page.locator('main [data-ui="primary-button"]:visible').count();
      record(`${c.label} 화면 1차 ≤ 1`, width, role, url, primary, "≤ 1", primary <= 1);
      const detach = await page.getByRole("button", { name: "떼기" }).count();
      if (c.label.startsWith("승인")) record(`${c.label} 작성자 \`떼기\` 0`, width, role, url, detach, 0, detach === 0);
      const ov = await docOverflow(page);
      record(`${c.label} scrollWidth <= clientWidth`, width, role, url, ov.join("/"), "scrollWidth <= clientWidth", ov[0] <= ov[1]);
      if (c.trigger) {
        const layout = await layoutFacts(page);
        if (layout.bar) {
          const overlap = !!layout.trigger && layout.bar.position === "fixed" && layout.trigger.bottom > layout.bar.top && layout.trigger.top < layout.bar.bottom;
          record(`${c.label} 트리거 · 고정 행동 줄 안 겹침`, width, role, url, { trigger: layout.trigger, bar: layout.bar, hit: layout.hit, hitAfterScroll: layout.hitAfterScroll }, { overlap: false }, !overlap && (layout.hit === "트리거" || layout.hit === "밖") && layout.hitAfterScroll === "트리거");
        }
        const v = await axe(page);
        record(`axe 위반(${c.label})`, width, role, url, v, "[]", v.length === 0);
        await shot(page, `p2-${c.label.replace(/[^가-힣A-Z]/g, "")}-${width}`);
      }
    }
  }
  await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, fx.projectId));
  await page.context().close();
});

test("P3 결재 중 문서 × 다섯 자격 — 1팀 PM · 1팀 팀장 · 2팀 PM · 경영관리 키 있음 · 키 없음", async ({ browser, baseURL }) => {
  test.setTimeout(400_000);
  const fx = await setupExpenseE2E();
  const keyed = await createIntakeManager("감사8키있음", { attach: true });
  const keyless = await createIntakeManager("감사8키없음", { attach: false });
  if (!keyed.roleId || !keyless.roleId) throw new Error("계급 없음");
  const expenseId = await inReviewDocument(fx);
  await insertLinkFixture({ recordId: await insertRecordFixture(keyed, { nameOnDocument: "감사8이미붙음", supplyKrw: 777_000 }), ownerId: expenseId, attachMode: "author", attachedBy: fx.pm.viewer.id });
  await teamPublic(keyed, fx.teamId, { nameOnDocument: fx.vendorName });
  const url = `/expenses/${expenseId}`;
  const otherUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `감사8P3본부-${randomUUID().slice(0, 4)}` });
  const otherTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: otherUnit.id, name: `감사8P3팀-${randomUUID().slice(0, 4)}` });
  const pm2 = await makePerson("감사8둘째PM", "role-pm", otherTeam.id, `${seoulToday().slice(0, 4)}-01-01`);

  for (const [role, person] of [
    ["1팀PM", fx.pm],
    ["1팀팀장", fx.lead],
  ] as const) {
    const page = await loginPage(browser, baseURL, person);
    for (const width of [1280, 375] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await expect(page.getByRole("table", { name: "붙은 증빙" })).toBeVisible();
      const n = await pickTrigger(page).count();
      const detach = await page.getByRole("button", { name: /^(떼기|무효 처리)$/ }).count();
      const locks = await lockLines(page);
      record("결재 중 트리거 0 · 떼기 0 · 잠김 줄 ≤ 1", width, role, url, { n, detach, locks }, { n: 0, detach: 0, locks: "≤ 1" }, n === 0 && detach === 0 && locks.length <= 1);
    }
    await page.context().close();
  }

  const p2 = await loginPage(browser, baseURL, pm2);
  for (const width of [1280, 375] as const) {
    await p2.setViewportSize({ width, height: 900 });
    const res = await p2.goto(url);
    const body = ((await p2.locator("main").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ");
    const amount = body.includes("777,000");
    const n = await pickTrigger(p2).count();
    record("2팀 PM — 1팀 결재 중 문서: 트리거 0 · 붙은 증빙 금액 안 보임", width, "2팀PM", url, { status: res?.status(), n, amount }, { n: 0, amount: false }, n === 0 && !amount);
  }
  await p2.context().close();

  const kl = await asRole(browser, baseURL, keyless.roleId);
  for (const width of [1280, 375] as const) {
    await kl.setViewportSize({ width, height: 900 });
    await kl.goto(url);
    await expect(kl.getByRole("table", { name: "붙은 증빙" })).toBeVisible();
    const n = await pickTrigger(kl).count();
    const locks = await lockLines(kl);
    record("경영관리 키 없음 — 트리거 0 · 잠김 줄 = [`결재 중 · 증빙은 경영관리`]", width, "경영관리(키 없음)", url, { n, locks }, { n: 0, locks: ["결재 중 · 증빙은 경영관리"] }, n === 0 && locks.length === 1 && locks[0] === "결재 중 · 증빙은 경영관리");
  }
  await kl.context().close();

  const k = await asRole(browser, baseURL, keyed.roleId);
  const keyedN = await countEvidencePool(keyed, { kind: "expense", id: expenseId });
  for (const width of WIDTHS) {
    await k.setViewportSize({ width, height: PHONE(width) ? 700 : 900 });
    await k.goto(url);
    const trigger = pickTrigger(k);
    await waitForHydration(trigger);
    const label = ((await trigger.textContent()) ?? "").trim();
    const detach = await k.getByRole("button", { name: /^(떼기|무효 처리)$/ }).count();
    record("경영관리 키 있음 — 트리거 하나 · N = 서버 · 떼기 0", width, "경영관리(키 있음)", url, { label, keyedN, detach }, `증빙 고르기 ${keyedN} · 떼기 0`, label === `증빙 고르기 ${keyedN}` && detach === 0);
    const locks = await lockLines(k);
    record("경영관리 키 있음 — 잠김 줄 ≤ 1", width, "경영관리(키 있음)", url, locks, "≤ 1", locks.length <= 1);
    const ov = await docOverflow(k);
    record("경영관리 키 있음 — scrollWidth <= clientWidth", width, "경영관리(키 있음)", url, ov.join("/"), "scrollWidth <= clientWidth", ov[0] <= ov[1]);
    if (PHONE(width)) record("경영관리 키 있음 — 트리거 터치 박스 ≥ 44×44", width, "경영관리(키 있음)", url, await box(trigger), "≥ 44×44", big(await box(trigger)));
    await trigger.click();
    await measureDialog(k, width, "경영관리(키 있음)", url, { expectPreselect: false });
    await shot(k, `p3-keyed-s5-${width}`);
    await closeAndCheckFocus(k, width, "경영관리(키 있음)", url, /^button«증빙 고르기 \d+»/, "트리거");
  }
  await k.context().close();
});

test("P4 경영관리 반려 문서 — 22 후보 · 넘침 줄 · 20건 상한 · 경합 바닥 줄", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const role = "경영관리(키 있음)";
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager("감사8상한");
  if (!manager.roleId) throw new Error("계급 없음");
  const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
  await rejectIt(fx, expenseId);
  const ids: string[] = [];
  for (let index = 0; index < 22; index += 1) ids.push(await insertRecordFixture(manager, { nameOnDocument: `감사8상한${String(index).padStart(2, "0")}`, supplyKrw: 1_000_000 + index }));
  const url = `/expenses/${expenseId}`;
  const page = await asRole(browser, baseURL, manager.roleId);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url);
  const trigger = pickTrigger(page);
  await waitForHydration(trigger);
  record("트리거 글자 = 22", 1280, role, url, ((await trigger.textContent()) ?? "").trim(), "증빙 고르기 22", ((await trigger.textContent()) ?? "").trim() === "증빙 고르기 22");
  await trigger.click();
  const dialog = pickDialog(page);
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  const options = dialog.getByRole("option");
  const over = ((await dialog.textContent()) ?? "").includes("20건 넘음 · 검색으로 좁히기");
  record("후보 21건 넘음 → 20행 + `20건 넘음 · 검색으로 좁히기`", 1280, role, url, { rows: await options.count(), over }, { rows: 20, over: true }, (await options.count()) === 20 && over);
  for (let index = 0; index < 20; index += 1) if ((await options.nth(index).getAttribute("aria-selected")) !== "true") await options.nth(index).click();
  const search = dialog.getByRole("textbox", { name: "거래처 · 금액" });
  const listed = (await options.allTextContents()).join(" ");
  const leftOut = Array.from({ length: 22 }, (_, i) => `감사8상한${String(i).padStart(2, "0")}`).find((n) => !listed.includes(n)) ?? "";
  await search.fill(leftOut);
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  await page.waitForTimeout(600);
  await dialog.getByRole("option", { selected: false }).first().click();
  const cap = ((await dialog.textContent()) ?? "").includes("20건 상한 · 나눠 붙이기");
  const selectedNow = await resultLineOf(dialog);
  const primaryState = await dialog.locator('[data-ui="primary-button"]').evaluate((el) => ({ text: (el.textContent ?? "").trim(), ariaDisabled: el.getAttribute("aria-disabled") }));
  // 바닥 줄 우선순위 거부 > 상한 > 결과(§7-17-1 SP-6106 ⑶) — 상한 줄이 서면 결과 줄 `고른 n건`은 물러난다. 고른 수는 1차 N으로 잰다.
  record("21번째 고름 0(1차 N = 20) · `20건 상한 · 나눠 붙이기` · 1차 aria-disabled 없음", 1280, role, url, { cap, selectedNow, primaryState }, { cap: true, primary: "증빙 붙이기 20…", ariaDisabled: null }, cap && primaryState.text.startsWith("증빙 붙이기 20") && primaryState.ariaDisabled !== "true");
  const v = await axe(page, "dialog[open]");
  record("axe 위반(S5 상한)", 1280, role, url, v, "[]", v.length === 0);
  await shot(page, "p4-cap-1280");
  // 경합 — 고른 것 중 하나를 다른 문서에 먼저 붙인다. 22건이 점수 · 날짜 차가 같아 순위가 무작위 uuid 순이므로 ids[0]이 상위 20(고른 것) 밖일 수 있다
  // (그러면 경합 없이 붙고 창이 닫힌다 — PR #254 CI e2e (2)). 실제로 고른 목록(listed)에 있는 증빙을 고른다.
  const takenIndex = Array.from({ length: 22 }, (_, i) => `감사8상한${String(i).padStart(2, "0")}`).findIndex((n) => listed.includes(n));
  await insertLinkFixture({ recordId: ids[takenIndex] ?? "", ownerId: randomUUID(), attachedBy: manager.id });
  await dialog.locator('[data-ui="primary-button"]').click();
  await expect(dialog.getByText(/^다른 사람이 먼저 붙임/)).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  const race = await dialog.evaluate((el) => ({ line: [...el.querySelectorAll("*")].find((n) => n.children.length === 0 && /^다른 사람이 먼저 붙임/.test((n.textContent ?? "").trim()))?.textContent?.trim() ?? null, refresh: [...el.querySelectorAll("button")].filter((b) => (b.textContent ?? "").trim() === "새로 고침").length, open: el.hasAttribute("open") }));
  record("경합 뒤 바닥 줄 `다른 사람이 먼저 붙임 · …` + 3차 `새로 고침` · 창 열림", 1280, role, url, race, { line: "다른 사람이 먼저 붙임 · …", refresh: 1, open: true }, !!race.line && race.refresh === 1 && race.open);
  await page.context().close();
});

const PURCHASER_VISIBLE = ["purchase_request.value", "purchase_request.amount", "project.value", "card_usage.value", "card_usage.amount", "team.value", "vendor.value"];

async function makePurchaser(teamId: string): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E감사8구매처리-${randomUUID().slice(0, 6)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of PURCHASER_VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("감사8처리", role.id, teamId, `${seoulToday().slice(0, 4)}-01-01`);
}

async function ownRequest(requestedBy: string, itemName: string, status: "requested" | "purchased"): Promise<string> {
  const number = `TCEA${randomUUID().slice(0, 6)}`;
  await db.insert(purchaseRequests).values({
    number,
    linkKind: "team_cost",
    requestedBy,
    itemName,
    estimateAmountKrw: 33_000,
    ...(status === "purchased" ? { status: "purchased", completedBy: requestedBy, completedAt: new Date() } : {}),
  });
  return number;
}

test("P5 구매 요청 목록 — 작성자 PC · 폰 시트 · ?status=전체 · 남의 요청 · 구매 처리 자격", async ({ browser, baseURL }) => {
  test.setTimeout(500_000);
  const s = randomUUID().slice(0, 6);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E감사8구매본부-${s}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E감사8구매팀-${s}` });
  const author = await makePerson("감사8요청", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const other = await makePerson("감사8남요청", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const manager = await createIntakeManager("감사8구매경영");
  const vendor = `감사8구매상회${s}`;
  await teamPublic(manager, team.id, { nameOnDocument: vendor, supplyKrw: 110_000 });
  const openNo = await ownRequest(author.viewer.id, "감사8 신청 물건", "requested");
  const doneNo = await ownRequest(author.viewer.id, "감사8 완료 물건", "purchased");
  const othersNo = await ownRequest(other.viewer.id, "감사8 남의 물건", "requested");
  const role = "기본계급 요청자";
  const page = await loginPage(browser, baseURL, author);
  const purchaser = await makePurchaser(team.id);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: PHONE(width) ? 700 : 900 });
    for (const url of ["/cards/purchases", "/cards/purchases?status=전체"]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      const ov = await docOverflow(page);
      record("문서 scrollWidth <= clientWidth", width, role, url, ov.join("/"), "scrollWidth <= clientWidth", ov[0] <= ov[1]);
      const v = await axe(page);
      record("axe 위반(구매 요청 목록)", width, role, url, v, "[]", v.length === 0);
      const off = await offTokens(page, "main table");
      record("토큰 밖 색 · 서체 · radius(목록 표)", width, role, url, off, "[]", off.length === 0);
      const othersPick = await page.getByRole("button", { name: `${othersNo} 증빙 고르기 1` }).count();
      record("남의 요청 행 `증빙 고르기` 0", width, role, url, othersPick, 0, othersPick === 0);
      await shot(page, `p5-list-${width}-${url.includes("전체") ? "all" : "default"}`);
    }
    if (!PHONE(width)) {
      await page.goto("/cards/purchases?status=전체");
      const openPick = page.getByRole("button", { name: `${openNo} 증빙 고르기 1` });
      const donePick = page.getByRole("button", { name: `${doneNo} 증빙 고르기 1` });
      record("PC 행 `증빙 고르기 1` — 신청됨 · 구매 완료 내 행", width, role, "/cards/purchases?status=전체", { open: await openPick.count(), done: await donePick.count() }, { open: 1, done: 1 }, (await openPick.count()) === 1 && (await donePick.count()) === 1);
      const cellInfo = await page
        .getByRole("row")
        .filter({ hasText: openNo })
        .locator('[data-ui="row-actions"]')
        .first()
        .evaluate((el) => [...el.querySelectorAll("button, a")].map((b) => (b.textContent ?? "").trim()))
        .catch(() => null);
      record("PC 신청됨 내 행 행동 칸(참고 — 고르기 + 취소)", width, role, "/cards/purchases?status=전체", cellInfo, "—", null);
    } else {
      await page.goto("/cards/purchases?status=전체");
      for (const [no, item, lines] of [
        [doneNo, "감사8 완료 물건", 1],
        [openNo, "감사8 신청 물건", 2],
      ] as const) {
        const tap = page.getByRole("button", { name: `${no} 상세 보기` });
        await waitForHydration(tap);
        const tapBox = await box(tap);
        record("폰 행 탭 대상 ≥ 44 높이", width, role, "/cards/purchases?status=전체", tapBox, "h ≥ 44", !!tapBox && tapBox.h >= 44);
        await tap.click();
        const sheet = page.getByRole("dialog", { name: item });
        await expect(sheet).toBeVisible();
        await page.waitForTimeout(500);
        const facts = await sheet.evaluate((el) => {
          const root = getComputedStyle(document.documentElement);
          const probe = document.createElement("span");
          probe.style.display = "inline-block";
          probe.style.width = root.getPropertyValue("--s-2").trim();
          el.appendChild(probe);
          const s2 = probe.getBoundingClientRect().width;
          probe.remove();
          const actions = [...el.querySelectorAll<HTMLElement>("button")].filter((b) => /증빙 고르기|요청 취소/.test(b.textContent ?? "") && b.getClientRects().length > 0);
          const rects = actions.map((b) => b.getBoundingClientRect());
          const close = el.querySelector<HTMLElement>("button[aria-label='닫기']")?.getBoundingClientRect();
          return {
            labels: actions.map((b) => (b.textContent ?? "").trim()),
            boxes: rects.map((r) => ({ y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })),
            gap: rects.length === 2 && rects[0] && rects[1] ? Math.round(rects[1].top - rects[0].bottom) : null,
            s2,
            close: close ? { w: Math.round(close.width), h: Math.round(close.height) } : null,
            overflow: [el.scrollWidth, el.clientWidth],
          };
        });
        const okLines = facts.labels.length === lines && facts.labels[0] === "증빙 고르기 1";
        record(`폰 시트 행동 ${lines}줄(${lines === 1 ? "구매 완료" : "신청됨"} 내 행)`, width, role, "/cards/purchases?status=전체", facts.labels, lines === 1 ? ["증빙 고르기 1"] : ["증빙 고르기 1", "… 요청 취소"], okLines);
        record("폰 시트 행동 · 닫기 박스 ≥ 44×44", width, role, "/cards/purchases?status=전체", { boxes: facts.boxes, close: facts.close }, "≥ 44×44", facts.boxes.every((b) => b.w >= 44 && b.h >= 44) && big(facts.close));
        if (lines === 2) record("폰 시트 두 줄 사이 간격 = --s-2", width, role, "/cards/purchases?status=전체", { gap: facts.gap, s2: facts.s2 }, "gap = --s-2", facts.gap !== null && Math.abs(facts.gap - facts.s2) <= 1);
        record("폰 시트 가로 넘침 0", width, role, "/cards/purchases?status=전체", facts.overflow.join("/"), "scrollWidth <= clientWidth", (facts.overflow[0] ?? 0) <= (facts.overflow[1] ?? 0));
        const v = await axe(page);
        record("axe 위반(폰 시트)", width, role, "/cards/purchases?status=전체", v, "[]", v.length === 0);
        await shot(page, `p5-sheet-${lines}-${width}`);
        await sheet.getByRole("button", { name: "닫기" }).click();
        await expect(sheet).toBeHidden();
        const back = await activeDescription(page);
        record("폰 시트 닫힌 뒤 포커스 = 그 행 탭 대상", width, role, "/cards/purchases?status=전체", back, `«${no} 상세 보기»`, back.includes(`${no} 상세 보기`));
      }
    }
  }

  // 붙이기 → 품목 칸 2행 · 포커스(1280).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/cards/purchases");
  const trigger = page.getByRole("button", { name: `${openNo} 증빙 고르기 1` });
  await waitForHydration(trigger);
  await trigger.click();
  await measureDialog(page, 1280, role, "/cards/purchases", { expectPreselect: true });
  await page.keyboard.press("Enter");
  await expect(pickDialog(page)).toBeHidden({ timeout: 15_000 });
  const row = page.getByRole("row").filter({ hasText: openNo });
  await expect(row).toContainText(`증빙 ${vendor}`, { timeout: 15_000 }).catch(() => undefined);
  const itemText = ((await row.textContent()) ?? "").replace(/\s+/g, " ");
  record("붙인 뒤 품목 칸 2행 `증빙 {거래처} · {합계}` · 그 행 트리거 0", 1280, role, "/cards/purchases", { has: itemText.includes(`증빙 ${vendor} · 110,000`), trigger: await row.getByRole("button", { name: /증빙 고르기/ }).count() }, { has: true, trigger: 0 }, itemText.includes(`증빙 ${vendor} · 110,000`) && (await row.getByRole("button", { name: /증빙 고르기/ }).count()) === 0);
  await page.waitForTimeout(500);
  const focus = await activeDescription(page);
  // §10 「닫힐 때 원래 요소로 복귀」 — 트리거가 사라졌으면 그 행의 다른 자리(행 · 행동 칸) 또는 화면 제목. body는 포커스를 잃은 것이다.
  record("붙인 뒤 포커스 ≠ body(트리거 사라진 행 · §10)", 1280, role, "/cards/purchases", focus, "그 행의 행동 · 행 또는 h1", !focus.startsWith("body"));
  await page.context().close();

  const pp = await loginPage(browser, baseURL, purchaser);
  for (const width of [1280, 375] as const) {
    await pp.setViewportSize({ width, height: 900 });
    await pp.goto("/cards/purchases?status=전체");
    await pp.waitForLoadState("networkidle");
    const n = await pp.getByRole("button", { name: /증빙 고르기/ }).count();
    record("구매 처리 자격(남의 요청만) — `증빙 고르기` 0", width, "구매처리", "/cards/purchases?status=전체", n, 0, n === 0);
  }
  await pp.context().close();
});

// 06.1-15 (G-06.1-29) — 고르기로 붙인 직후 · 마지막 떼기 뒤 같은 화면에서 제출 1차가 서버 판정과 맞는다. 폭마다 새 문서(같은 견적 줄을 두 번 못 쓴다).
test("P6 (G-06.1-29) 작성자 — 고르기 붙인 직후 · 마지막 떼기 뒤 제출 1차 × 4폭", async ({ browser, baseURL }) => {
  test.setTimeout(900_000);
  const role = "1팀PM(작성자)";
  for (const width of WIDTHS) {
    await clearEvidence();
    const fx = await setupExpenseE2E();
    const manager = await createIntakeManager(`감사15경영${width}`);
    await teamPublic(manager, fx.teamId, { nameOnDocument: fx.vendorName, issuedOn: seoulToday() });
    const expenseId = await draftDocument(fx);
    const url = `/expenses/${expenseId}`;
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.setViewportSize({ width, height: PHONE(width) ? 700 : 900 });
    await page.goto(url);
    const trigger = pickTrigger(page);
    await waitForHydration(trigger);
    await page.waitForLoadState("networkidle");
    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    // 폰(<700)에서는 expense.module.css:193 @media 안 :253-256 `.formBar kbd, .evidencePick kbd { display: none }`이 키 힌트를 숨긴다(이 변경 전부터).
    const reasonText = PHONE(width) ? "증빙 없음 · 증빙 올리기" : "증빙 없음 · 증빙 올리기 Ctrl+U";
    const gate = () =>
      submit.evaluate((el) => {
        const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
        return { ariaDisabled: el.getAttribute("aria-disabled"), reason: ids.map((id) => (document.getElementById(id)?.innerText ?? "").replace(/\s+/g, " ").trim()).join(" / ") };
      });
    const before = await gate();
    record("⑴ 붙이기 전 1차 aria-disabled=true · 이유 줄(폭별 글자)", width, role, url, before, { ariaDisabled: "true", reason: reasonText }, before.ariaDisabled === "true" && before.reason === reasonText);

    const memo = page.getByLabel("비고");
    await memo.fill("저장 안 한 비고");
    await trigger.click();
    const picker = pickDialog(page);
    await expect(picker.locator("[aria-busy]")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(picker).toBeHidden({ timeout: 15_000 });
    const rows = page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible").filter({ hasText: "고름" });
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    // ⑻ 읽기 행이 선 바로 다음 줄 — 재시도 없이 한 번(재판정 대기 중이면 막힘).
    const immediate = await submit.getAttribute("aria-disabled");
    record("⑻ 붙인 읽기 행 직후 한 번 읽은 1차 aria-disabled(재판정 대기 중 true)", width, role, url, immediate, "true", immediate === "true");
    const focusAfterPick = await activeDescription(page);
    record("⑺ 고르기 모달 닫힘 뒤 document.activeElement(06.1-08: 트리거 또는 떼기)", width, role, url, focusAfterPick, "button«증빙 고르기 N» / button«떼기»", /^(button«(증빙 고르기 \d+|떼기)|body)/.test(focusAfterPick) && !focusAfterPick.startsWith("body"));

    const samples: { t: string; ariaDisabled: string | null; reason: string }[] = [];
    let elapsed = 0;
    for (const at of [0, 1500, 4500]) {
      await page.waitForTimeout(at - elapsed);
      elapsed = at;
      const g = await gate();
      samples.push({ t: `${at / 1000}s`, ...g });
    }
    const open = (x: { ariaDisabled: string | null; reason: string }) => x.ariaDisabled !== "true" && x.reason === "";
    // 0s = ⑻와 같은 시점: 붙임 수 재판정 중 1차 막기(73e6017)가 의도 — 막힘이면 이유 줄은 서고, 열렸어도 통과.
    const s0 = samples[0] as { ariaDisabled: string | null; reason: string };
    record("⑵ 붙인 직후 0s 1차 = 재판정 대기 중 막힘 허용(⑻) 또는 열림", width, role, url, s0, "막힘(이유 줄 있음) 또는 열림(이유 줄 없음)", open(s0) || (s0.ariaDisabled === "true" && s0.reason !== ""));
    record("⑵ 붙인 직후 1.5s·4.5s 1차 aria-disabled≠true · 이유 줄 없음", width, role, url, samples.slice(1), "모두 열림 · 이유 줄 없음", samples.slice(1).every(open));
    const memoValue = await memo.inputValue();
    record("⑶ 비고 칸 값 그대로", width, role, url, memoValue, "저장 안 한 비고", memoValue === "저장 안 한 비고");
    const primary1 = await page.locator('[data-ui="primary-button"]:visible').count();
    record("⑸ 붙인 뒤 화면 1차 DOM 수(`[data-ui=\"primary-button\"]` 보이는 것)", width, role, url, primary1, 1, primary1 === 1);
    const ov1 = await docOverflow(page);
    record("⑹ 붙인 뒤 문서 scrollWidth <= clientWidth", width, role, url, ov1.join("/"), "scrollWidth <= clientWidth", ov1[0] <= ov1[1]);

    await page.reload();
    const detach = page.getByRole("table", { name: "붙은 증빙" }).getByRole("button", { name: "떼기" });
    await waitForHydration(detach.first());
    await page.waitForLoadState("networkidle");
    await detach.first().click();
    const dialog = page.getByRole("dialog", { name: "증빙 떼기" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("사유").fill("잘못 고름");
    await dialog.getByRole("button", { name: /^증빙 떼기/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("table", { name: "붙은 증빙" })).toHaveCount(0);
    // ⑻ 붙은 표가 0이 된 바로 다음 줄.
    const immediate2 = await submit.getAttribute("aria-disabled");
    record("⑻ 붙은 표 0 직후 한 번 읽은 1차 aria-disabled(true)", width, role, url, immediate2, "true", immediate2 === "true");
    await page.waitForTimeout(1500);
    const after = await gate();
    record("⑷ 마지막 기록 뗀 뒤 1차 aria-disabled=true · 이유 줄 `증빙 없음 · 증빙 올리기`(1280·768 +` Ctrl+U`)", width, role, url, after, { ariaDisabled: "true", reason: reasonText }, after.ariaDisabled === "true" && after.reason === reasonText);
    const focusAfterDetach = await activeDescription(page);
    record("⑺ 떼기 모달 닫힘 뒤 document.activeElement(06.1-08: 트리거 `증빙 고르기 N`)", width, role, url, focusAfterDetach, "button«증빙 고르기 N»", /^button«증빙 고르기 \d+/.test(focusAfterDetach));
    const primary2 = await page.locator('[data-ui="primary-button"]:visible').count();
    record("⑸ 뗀 뒤 화면 1차 DOM 수", width, role, url, primary2, 1, primary2 === 1);
    const ov2 = await docOverflow(page);
    record("⑹ 뗀 뒤 문서 scrollWidth <= clientWidth", width, role, url, ov2.join("/"), "scrollWidth <= clientWidth", ov2[0] <= ov2[1]);
    await page.context().close();
  }
});
