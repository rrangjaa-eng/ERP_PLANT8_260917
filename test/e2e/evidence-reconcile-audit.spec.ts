import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, corpCards, evidenceRecords, projects, purchaseRequests } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { insertLinkFixture, setRecordVisibilityFixture } from "@/test/integration/fixtures/evidence";
import { addBcCard, addLotteCard, clearEvidence, createIntakeRole, evidenceRows, registerFile, teamIdByName, uploadFixture } from "./helpers/evidence";
import { waitForHydration } from "./leave-org";

// 06.1-09 Task 4 독립 DOM 감사(실행자가 아닌 별도 에이전트). 판정은 CI=true 프로덕션 빌드의 DOM 실측값으로만 한다(스크린샷 육안 금지).
// 자격(실제 권한 · 관리자 아님): 경영관리(intake + cards.proxy + expenses.payments + 보임 card_usage.value · amount) · intake만 · 카드 사용을 등록한 사람(role-pm 기획1팀) ·
// 그 팀 팀장(role-team-lead 기획1팀) · 권한 없는 사람(role-pm). 항목마다 실측 · 기대 · 판정을 JSONL(AUDIT_OUT)로 남기고 expect.soft로 한 실행에서 전부 잰다.

const WIDTHS = [1280, 1024, 768, 700, 375, 320] as const;
const PHONE = (width: number) => width < 700;
const OUT = process.env.AUDIT_OUT ?? "test-results/evidence-reconcile-audit.jsonl";
const won = (n: number) => n.toLocaleString("en-US");
const FILE_WINS = "고르면 카드 사용 합계 · 카드가 파일 값으로";

function record(item: string, width: number | string, role: string, url: string, measured: unknown, expected: unknown, pass: boolean | null): void {
  mkdirSync(dirname(OUT), { recursive: true });
  const line = { item, width, role, url, measured: typeof measured === "string" ? measured : JSON.stringify(measured), expected: typeof expected === "string" ? expected : JSON.stringify(expected), pass };
  appendFileSync(OUT, `${JSON.stringify(line)}\n`);
  if (pass !== null) expect.soft(pass, `${item} @${width} ${role} ${url}: measured ${line.measured} / expected ${line.expected}`).toBe(true);
}

async function box(locator: Locator): Promise<{ w: number; h: number } | null> {
  const b = await locator.boundingBox().catch(() => null);
  return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null;
}
const big = (b: { w: number; h: number } | null) => !!b && b.w >= 44 && b.h >= 44;

async function docOverflow(page: Page): Promise<[number, number]> {
  return page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth] as [number, number]);
}

async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

// ── 시드 ────────────────────────────────────────────────────────────────────────────────

async function proxyRole(): Promise<string> {
  const roleId = await createIntakeRole();
  for (const menu of ["cards.proxy", "expenses.payments"]) await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action: "write", allowed: true });
  for (const infoItem of ["card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
  return roleId;
}

// 팀은 이름(시드 팀) 또는 { id }(케이스마다 새로 만든 팀). 팀장처럼 팀당 한 자리인 발령은 새 팀에만 한다 — 시드 팀에 남으면 같은 스펙의
// 다음 반복과 뒤 스펙의 팀장 발령이 「팀장 있음」으로 막힌다(evidence-attach.spec.ts 머리 주석과 같은 까닭).
async function person(roleId: string, team?: string | { id: string }): Promise<{ viewer: Viewer; email: string; password: string }> {
  const email = `e2e-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "감사 사람", roleId });
  if (team) await assignTeam(SYSTEM_VIEWER, { userId, teamId: typeof team === "string" ? await teamIdByName(team) : team.id, effectiveFrom: "2020-01-01" });
  return { viewer: { id: userId, roleId }, email, password: tempPassword };
}

async function login(page: Page, who: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  const email = page.getByLabel("이메일");
  await waitForHydration(email);
  await email.fill(who.email);
  await page.getByLabel("비밀번호").fill(who.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function pageAs(browser: Browser, who: { email: string; password: string }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, who);
  return page;
}

async function cardIdOf(last4: string): Promise<string> {
  const [card] = await db.select({ id: corpCards.id }).from(corpCards).where(eq(corpCards.numberLast4, last4)).limit(1);
  if (!card) throw new Error("카드 없음");
  return card.id;
}

async function usage(holder: Viewer, last4: string, input: { total: number; approvalNo?: string | null; usedOn?: string; lineId?: string }): Promise<{ id: string; number: string }> {
  const corpCardId = await cardIdOf(last4);
  const base = { corpCardId, usedOn: input.usedOn ?? "2026-04-30", merchantVendorId: null, total: { currency: "KRW" as const, amount: input.total, fxRate: 1 }, evidenceTypeCode: "card_receipt" };
  const cardInput: CardUsageInput = input.lineId ? { ...base, linkKind: "quote_line", lineId: input.lineId } : { ...base, linkKind: "team_cost" };
  const created = await createCardUsage(holder, cardInput, await precheckCardUsage(holder, cardInput));
  if (input.approvalNo) await db.update(corpCardUsages).set({ approvalNo: input.approvalNo }).where(eq(corpCardUsages.id, created.id));
  const [row] = await db.select({ number: corpCardUsages.number }).from(corpCardUsages).where(eq(corpCardUsages.id, created.id));
  return { id: created.id, number: row?.number ?? "" };
}

const approval = () => String(10_000_000 + Math.floor(Math.random() * 89_999_999));

async function line(viewer: Viewer, last4: string, input: { total: number; approvalNo?: string; date: string; merchant?: string }): Promise<string> {
  const batchId = await registerFile(
    viewer,
    lotteFixture([{ 카드번호: `999900001111${last4}`, 승인번호: input.approvalNo ?? approval(), 매입금액: won(input.total), 부가세: won(Math.floor(input.total / 11)), 매입일자: input.date, 가맹점명: input.merchant ?? "감사가맹점" }]),
    `감사_${randomUUID().slice(0, 6)}.xls`,
  );
  const [row] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, batchId));
  if (!row) throw new Error("기록 없음");
  return row.id;
}

async function freshTeam(): Promise<{ id: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `감사본부-${randomUUID()}` });
  return createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `감사팀-${randomUUID().slice(0, 8)}` });
}

async function quoteLine(pm: Viewer, execution: number, teamId?: string): Promise<{ projectId: string; lineId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `감사클라-${randomUUID()}`, normalizedName: `감사클라-${randomUUID()}` });
  const project = await createProject(pm, { clientId: client.id, teamId: teamId ?? (await teamIdByName("기획1팀")), pmUserId: pm.id, name: `감사-${randomUUID().slice(0, 8)}`, startDate: "2026-09-01", endDate: "2026-12-31" });
  if (!project.id) throw new Error("프로젝트 없음");
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("차수 없음");
  const lineId = randomUUID();
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [{ id: lineId, isNew: true as const, subcategory: (await firstSelectableSubcategory()).value, itemName: "감사줄", vendorId: null, unitPrice: { currency: "KRW" as const, amount: execution + 500_000, fxRate: 1 }, execution: { currency: "KRW" as const, amount: execution, fxRate: 1 } }],
  });
  return { projectId: project.id, lineId };
}

const total = () => 700_000 + Math.floor(Math.random() * 280_000);
const resultRow = (page: Page) => page.locator('[data-variant="bulk-import"] li[data-state="result"]');

test.use({ actionTimeout: 15_000 });

test.beforeEach(async () => {
  await clearEvidence();
});

// ── S1 결과 행 ──────────────────────────────────────────────────────────────────────────

test("S1 결과 행 — 조각 글자 · 0 조각 부재 · 링크 href · 넘침 · 색 · 탭 높이 × 폭 6 · 경영관리 / intake만", async ({ browser }) => {
  test.setTimeout(600_000);
  const holder = await person(DEFAULT_ROLE_ID, "기획1팀");
  const manager = await person(await proxyRole());
  // cso D2(8ec9fb3) — 값을 바꾸는 대사 짝은 등록자가 두 금액을 다 볼 때만 붙는다. 「intake만」은 메뉴(권한)가 intake뿐이라는 뜻이고,
  // 새 계급은 card_usage.amount 행이 없어 숨김이라 통합 시험(evidence-reconcile setup)처럼 그 보임만 준다(evidence.amount는 createIntakeRole이 준다).
  const intakeOnlyRole = await createIntakeRole();
  await upsertVisibility(SYSTEM_VIEWER, { roleId: intakeOnlyRole, infoItem: "card_usage.amount", visible: true });
  const intakeOnly = await person(intakeOnlyRole);
  const runs: Array<{ role: string; who: typeof manager; width: number }> = [
    ...WIDTHS.map((width) => ({ role: "경영관리", who: manager, width })),
    { role: "intake만", who: intakeOnly, width: 1280 },
    { role: "intake만", who: intakeOnly, width: 375 },
  ];
  for (const run of runs) {
    const page = await pageAs(browser, run.who);
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.viewer.id });
    const base = Number(last4) * 10_000 + Math.floor(Math.random() * 9_000);
    const [a1, a2, a3] = [String(base + 1), String(base + 2), String(base + 3)];
    await usage(holder.viewer, last4, { total: 200_000, approvalNo: a1 });
    await usage(holder.viewer, last4, { total: 50_000 });
    await page.setViewportSize({ width: run.width, height: 900 });
    await page.goto("/expenses/evidence");
    // 끌어 놓기 영역은 편집 폭(≥1024 — useEditableWidth)에서만 선다. 서버 스냅숏은 PC라 1024 미만은 수화 뒤 사라진다 — 그 폭은 영역 부재만 잰다.
    if (run.width < 1024) await expect.poll(() => page.getByTestId("attachments-input").count(), { timeout: 10_000 }).toBe(0).catch(() => undefined);
    const zone = run.width >= 1024 && (await page.getByTestId("attachments-input").waitFor({ state: "attached", timeout: 10_000 }).then(() => true, () => false));
    if (!zone) {
      const left = await page.getByTestId("attachments-input").count();
      record("S1 1024 미만 — 끌어 놓기 영역 DOM 0", run.width, run.role, "/expenses/evidence", left, 0, left === 0);
      await page.context().close();
      continue;
    }
    // 끌어 놓기 입력은 스트리밍으로 숨은 채 먼저 DOM에 붙는다(attached) — 수화 전에 파일을 넣으면 React가 change를 받지 못해 결과 행이 서지 않는다.
    await waitForHydration(page.getByTestId("attachments-input"));
    const card = `999900001111${last4}`;
    await uploadFixture(
      page,
      "감사_대사.xls",
      lotteFixture([
        { 카드번호: card, 승인번호: a1, 매입금액: "204,100", 부가세: "18,554" },
        { 카드번호: card, 승인번호: a2, 매입금액: "50,000", 부가세: "4,545" },
        { 카드번호: card, 승인번호: a3, 매입금액: "77,000", 부가세: "7,000" },
      ]),
    );
    const row = resultRow(page);
    await expect(row).toContainText("등록 3", { timeout: 30_000 });
    const url = "/expenses/evidence(S1)";
    const facts = await row.evaluate((li) => ({
      text: (li.textContent ?? "").replace(/\s+/g, " ").trim(),
      links: [...li.querySelectorAll("a")].map((a) => {
        const num = a.querySelector("[data-kind]");
        return { text: (a.textContent ?? "").trim(), href: a.getAttribute("href") ?? "", color: num ? `${num.getAttribute("data-kind")}:${getComputedStyle(num).color}` : getComputedStyle(a).color, h: Math.round(a.getBoundingClientRect().height), w: Math.round(a.getBoundingClientRect().width) };
      }),
      scroll: [li.scrollWidth, li.clientWidth],
      zero: [...li.querySelectorAll("*")].filter((el) => el.children.length === 0 && /(^|\s)0(쌍)?$/.test((el.textContent ?? "").trim())).map((el) => (el.textContent ?? "").trim()),
    }));
    const matched = facts.links.find((l) => l.text === "카드 사용에 붙음 2");
    const unmatched = facts.links.find((l) => l.text === "짝 없음 1");
    record("S1 조각 글자 `카드 사용에 붙음 2` · `짝 없음 1`", run.width, run.role, url, facts.text, "둘 다 있음", !!matched && !!unmatched);
    record("S1 `카드 미등록` 조각 부재(0)", run.width, run.role, url, /카드 미등록/.test(facts.text), false, !/카드 미등록/.test(facts.text));
    record("S1 0인 조각 부재", run.width, run.role, url, facts.zero, [], facts.zero.length === 0);
    record("S1 href 붙음", run.width, run.role, url, matched?.href ?? null, "?state=attached&batch=<uuid>", /\?state=attached&batch=[0-9a-f-]{36}$/.test(matched?.href ?? ""));
    record("S1 href 짝 없음", run.width, run.role, url, unmatched?.href ?? null, "?state=unmatched&batch=<uuid>", /\?state=unmatched&batch=[0-9a-f-]{36}$/.test(unmatched?.href ?? ""));
    record("S1 결과 행 가로 넘침 없음", run.width, run.role, url, facts.scroll, "scrollWidth ≤ clientWidth", (facts.scroll[0] ?? 0) <= (facts.scroll[1] ?? 0));
    const [sw, cw] = await docOverflow(page);
    record("S1 문서 가로 넘침 없음", run.width, run.role, url, [sw, cw], "≤", sw <= cw);
    if (run.width === 1280) {
      const success = await tokenColor(page, "--status-success");
      const warning = await tokenColor(page, "--status-warning");
      record("S1 `카드 사용에 붙음` 숫자 색 = --status-success", run.width, run.role, url, matched?.color ?? null, `success:${success}`, matched?.color === `success:${success}`);
      record("S1 `짝 없음` 숫자 색 = --status-warning", run.width, run.role, url, unmatched?.color ?? null, `warning:${warning}`, unmatched?.color === `warning:${warning}`);
    }
    if (PHONE(run.width)) {
      record("S1 링크 탭 높이(폰)", run.width, run.role, url, facts.links.map((l) => `${l.text}:${l.w}×${l.h}`), "≥44(정보 — 결과 행 링크는 06.1-05 선례 따름)", null);
    }
    await page.context().close();
  }
});

// ── S2 행 행동 배타 · S8 대리 등록 · 토스트 ─────────────────────────────────────────────────

test("S2 행 행동 배타 · 전부 막힘 이유 글자 · `대리 등록` href × 폭 6 · intake만 · 권한 없음 / S8 패널 × 폭 6 · 저장 토스트(1280 · 375)", async ({ browser }) => {
  test.setTimeout(900_000);
  const holder = await person(DEFAULT_ROLE_ID, "기획1팀");
  const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.viewer.id });
  const manager = await person(await proxyRole());
  const lonely1 = await line(manager.viewer, last4, { total: total(), date: "2026.03.17", merchant: "대리가맹점가" });
  const lonely2T = total();
  const lonely2 = await line(manager.viewer, last4, { total: lonely2T, date: "2026.03.16", merchant: "대리가맹점나" });
  const candP = approval();
  await usage(holder.viewer, last4, { total: 10_000, approvalNo: candP });
  const candidate = await line(manager.viewer, last4, { total: total(), approvalNo: candP, date: "2026.03.18" });
  const heldP = approval();
  const held = await usage(holder.viewer, last4, { total: 11_000, approvalNo: heldP });
  const statement = await line(manager.viewer, last4, { total: total(), date: "2026.03.02" });
  await insertLinkFixture({ recordId: statement, ownerKind: "corp_card_usage", ownerId: held.id, attachedBy: manager.viewer.id });
  const blocked = await line(manager.viewer, last4, { total: total(), approvalNo: heldP, date: "2026.03.03" });
  const expectReason = `증빙 있음 · ${held.number}`;

  const page = await pageAs(browser, manager);
  const url = "/expenses/evidence?state=unmatched";
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    await expect(evidenceRows(page).first()).toBeVisible();
    await waitForHydration(evidenceRows(page).first().locator("td").first());
    const EDIT = width >= 1024;
    // 행 행동 열은 편집 폭(≥1024 — useEditableWidth)에서만 있다. 서버 스냅숏은 PC라 수화 뒤 한 번 바뀐다 — 그 뒤 안정된 DOM을 잰다.
    if (EDIT) await expect.poll(() => page.getByRole("link", { name: "대리 등록", exact: true }).count(), { timeout: 10_000 }).toBeGreaterThan(0).catch(() => undefined);
    else await expect.poll(() => page.getByRole("link", { name: "대리 등록", exact: true }).count(), { timeout: 10_000 }).toBe(0).catch(() => undefined);
    const rows = await evidenceRows(page).evaluateAll((trs, ids) => {
      return trs.map((tr) => {
        const links = [...tr.querySelectorAll("a")].filter((a) => (a.textContent ?? "").trim() === "대리 등록");
        const attach = [...tr.querySelectorAll("button")].filter((b) => (b.textContent ?? "").trim() === "붙이기");
        const visible = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
        const reasonEls = [...tr.querySelectorAll("*")].filter((el) => el.children.length === 0 && (el.textContent ?? "").trim() === ids.reason);
        const reason = reasonEls[0];
        return {
          proxy: links.length,
          proxyVisible: links.filter(visible).length,
          proxyHref: links[0]?.getAttribute("href") ?? null,
          proxyBox: links[0] ? [Math.round(links[0].getBoundingClientRect().width), Math.round(links[0].getBoundingClientRect().height)] : null,
          attach: attach.length,
          attachVisible: attach.filter(visible).length,
          attachBox: attach[0] ? [Math.round(attach[0].getBoundingClientRect().width), Math.round(attach[0].getBoundingClientRect().height)] : null,
          reason: reasonEls.length,
          reasonTag: reason ? `${reason.tagName.toLowerCase()}|role=${reason.getAttribute("role") ?? ""}|inButton=${!!reason.closest("button,a,[role=button]")}` : null,
          reasonFont: reason ? getComputedStyle(reason).fontSize : null,
          siblingActionFont: (() => {
            const other = [...tr.querySelectorAll("button, a")].find((el) => ["보관", "붙이기", "대리 등록"].includes((el.textContent ?? "").trim()));
            return other ? `${(other.textContent ?? "").trim()}:${getComputedStyle(other).fontSize}` : null;
          })(),
          reasonVisible: reason ? visible(reason) : null,
          text: (tr.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
        };
      });
    }, { reason: expectReason });
    record("S2 짝 없는 줄 수", width, "경영관리", url, rows.length, 4, rows.length === 4);
    const proxyRows = rows.filter((r) => r.proxy > 0);
    const attachRows = rows.filter((r) => r.attach > 0);
    const reasonRows = rows.filter((r) => r.reason > 0);
    record("S2 한 행에 둘이 같이 없음", width, "경영관리", url, rows.map((r) => r.proxy + r.attach), "각 ≤1", rows.every((r) => r.proxy + r.attach <= 1));
    if (!EDIT) {
      record("S2 1024 미만 — 행 행동 열 없음(보기 전용 폭 · 06.1-05 기존 설계)", width, "경영관리", url, rows.map((r) => r.proxy + r.attach + r.reason), [0, 0, 0, 0], rows.every((r) => r.proxy + r.attach + r.reason === 0));
    } else {
      record("S2 `대리 등록` 행 수(후보 0 줄 둘)", width, "경영관리", url, proxyRows.length, 2, proxyRows.length === 2);
      record("S2 `붙이기` 행 수(후보 있는 줄 하나)", width, "경영관리", url, attachRows.length, 1, attachRows.length === 1);
      record("S2 전부 막힘 줄 — 이유 글자 하나", width, "경영관리", url, reasonRows.map((r) => `${r.reason}:${r.reasonTag}`), `1행 · ${expectReason}`, reasonRows.length === 1 && reasonRows[0]?.reason === 1);
      record("S2 전부 막힘 줄 — 붙이기 · 대리 등록 DOM 0", width, "경영관리", url, reasonRows.map((r) => r.proxy + r.attach), [0], reasonRows.length === 1 && reasonRows[0]?.proxy === 0 && reasonRows[0]?.attach === 0);
      record("S2 이유 글자가 버튼 · 링크 아님", width, "경영관리", url, reasonRows[0]?.reasonTag ?? null, "inButton=false", reasonRows[0]?.reasonTag?.endsWith("inButton=false") === true);
      record("S2 이유 글자 크기 = --text-aux 13px(같은 행 행동 글자와 같음)", width, "경영관리", url, { reason: reasonRows[0]?.reasonFont ?? null, sibling: reasonRows[0]?.siblingActionFont ?? null, others: rows.map((r) => r.siblingActionFont) }, "13px", reasonRows[0]?.reasonFont === "13px");
      const hrefs = proxyRows.map((r) => r.proxyHref).sort();
      // G-06.1-40: 출발 목록을 싣는다
      const want = [`/cards?new=1&evidence=${lonely1}&from=${encodeURIComponent(url)}`, `/cards?new=1&evidence=${lonely2}&from=${encodeURIComponent(url)}`].sort();
      record("S2 `대리 등록` href", width, "경영관리", url, hrefs, want, JSON.stringify(hrefs) === JSON.stringify(want));
      record("S2 `대리 등록` · `붙이기` 보임", width, "경영관리", url, rows.map((r) => r.proxyVisible + r.attachVisible), "후보 0·있음 줄 각 1", rows.filter((r) => r.proxyVisible + r.attachVisible === 1).length === 3);
      record("S2 행 행동 크기", width, "경영관리", url, rows.map((r) => r.proxyBox ?? r.attachBox), "정보(PC — 3차 링크)", null);
    }
    const [sw, cw] = await docOverflow(page);
    record("S2 문서 가로 넘침 없음", width, "경영관리", url, [sw, cw], "≤", sw <= cw);
  }
  void candidate;
  void blocked;

  // intake만 — 대리 등록 0 · /cards?new=1&evidence= 404.
  const intakeOnly = await person(await createIntakeRole());
  const intakePage = await pageAs(browser, intakeOnly);
  await intakePage.setViewportSize({ width: 1280, height: 900 });
  await intakePage.goto(url);
  await expect(evidenceRows(intakePage).first()).toBeVisible();
  const intakeProxy = await intakePage.getByRole("link", { name: "대리 등록", exact: true }).count();
  record("S2 intake만 — `대리 등록` DOM 0", 1280, "intake만", url, intakeProxy, 0, intakeProxy === 0);
  const intakeAttach = await intakePage.getByRole("button", { name: "붙이기", exact: true }).count();
  record("S2 intake만 — `붙이기` 수(정보)", 1280, "intake만", url, intakeAttach, "정보", null);
  const intakeS8 = await intakePage.goto(`/cards?new=1&evidence=${lonely1}`);
  record("S8 intake만 — 대리 등록 주소 응답", 1280, "intake만", "/cards?new=1&evidence=", intakeS8?.status() ?? null, 404, intakeS8?.status() === 404);
  await intakePage.context().close();

  // 권한 없음(role-pm) — 증빙 목록 · 대리 등록 주소 404.
  const plain = await person(DEFAULT_ROLE_ID, "기획1팀");
  const plainPage = await pageAs(browser, plain);
  const plainList = await plainPage.goto(url);
  record("S2 권한 없음 — 증빙 목록 응답", 1280, "PM(권한 없음)", url, plainList?.status() ?? null, 404, plainList?.status() === 404);
  const plainS8 = await plainPage.goto(`/cards?new=1&evidence=${lonely1}`);
  record("S8 권한 없음 — 대리 등록 주소 응답", 1280, "PM(권한 없음)", "/cards?new=1&evidence=", plainS8?.status() ?? null, 404, plainS8?.status() === 404);
  await plainPage.context().close();

  // S8 패널 × 폭 6 — 읽기 텍스트 다섯 · 입력 0 · 넘침.
  const s8url = `/cards?new=1&evidence=${lonely2}`;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto(s8url);
    record("S8 패널 응답", width, "경영관리", s8url, response?.status() ?? null, 200, response?.status() === 200);
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    await expect(sheet).toBeVisible();
    const facts = await sheet.evaluate((root) => {
      const rows = [...root.querySelectorAll("[data-ui='field-row']")].map((r) => {
        const label = (r.querySelector("span, label")?.textContent ?? "").trim();
        const inputs = r.querySelectorAll("input:not([type=hidden]):not([type=radio]), select, textarea, [role=combobox]").length;
        return { label, value: (r.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50), inputs, scroll: [r.scrollWidth, r.clientWidth] };
      });
      return { rows, scroll: [root.scrollWidth, root.clientWidth], usedOn: root.querySelectorAll("#card-usage-used-on").length, amount: root.querySelectorAll("input[inputmode], input[name='amount']").length, merchantBtn: [...root.querySelectorAll("button")].filter((b) => /가맹점/.test(b.textContent ?? "")).length };
    });
    const readOnly = ["카드", "사용일", "가맹점", "결제 합계", "증빙 종류"].map((label) => facts.rows.find((r) => r.label === label));
    record("S8 읽기 행 다섯(입력 0)", width, "경영관리", s8url, readOnly.map((r) => (r ? `${r.label}=${r.inputs}` : "없음")), "다섯 다 있음 · 입력 0", readOnly.every((r) => r !== undefined && r.inputs === 0));
    record("S8 합계 · 가맹점 글자", width, "경영관리", s8url, readOnly.slice(2, 4).map((r) => r?.value ?? null), [`가맹점대리가맹점나`, `결제 합계${won(lonely2T)}`], readOnly[2]?.value === "가맹점대리가맹점나" && readOnly[3]?.value === `결제 합계${won(lonely2T)}`);
    record("S8 사용일 · 금액 입력 · 가맹점 바꾸기 DOM 0", width, "경영관리", s8url, [facts.usedOn, facts.amount, facts.merchantBtn], [0, 0, 0], facts.usedOn === 0 && facts.amount === 0 && facts.merchantBtn === 0);
    record("S8 패널 가로 넘침 없음", width, "경영관리", s8url, facts.scroll, "≤", (facts.scroll[0] ?? 0) <= (facts.scroll[1] ?? 0));
    const rowOver = facts.rows.filter((r) => (r.scroll[0] ?? 0) > (r.scroll[1] ?? 0)).map((r) => `${r.label}:${r.scroll[0]}/${r.scroll[1]}`);
    record("S8 행 넘침 없음", width, "경영관리", s8url, rowOver, [], rowOver.length === 0);
    const primary = sheet.getByRole("button", { name: /^카드 사용 등록/ });
    const pb = await box(primary);
    record("S8 1차 버튼 탭 높이", width, "경영관리", s8url, pb, PHONE(width) ? "≥44" : "정보", PHONE(width) ? big(pb) : null);
    const [sw, cw] = await docOverflow(page);
    record("S8 문서 가로 넘침 없음", width, "경영관리", s8url, [sw, cw], "≤", sw <= cw);
  }

  // 저장 → 토스트(375 · 1280).
  for (const [width, id] of [[375, lonely2], [1280, lonely1]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/cards?new=1&evidence=${id}`);
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    const team = sheet.getByRole("radio", { name: "팀 비용" });
    await waitForHydration(team);
    await team.check();
    await sheet.getByRole("button", { name: /^카드 사용 등록/ }).click();
    await expect(page).toHaveURL(/\/expenses\/evidence\?state=unmatched&registered=[0-9a-f-]{36}$/, { timeout: 20_000 });
    const toast = page.getByRole("status").filter({ hasText: /^카드 사용 등록 · / });
    await expect(toast).toBeVisible();
    const t = await toast.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent ?? "").trim(), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), vw: window.innerWidth, vh: window.innerHeight, live: el.getAttribute("aria-live") };
    });
    record("S8 토스트 글자", width, "경영관리", "/expenses/evidence?…&registered=", t.text, /^카드 사용 등록 · [\d,]+/.source, /^카드 사용 등록 · [\d,]+/.test(t.text));
    record("S8 토스트 화면 안", width, "경영관리", "/expenses/evidence?…&registered=", t, "0 ≤ left · right ≤ vw · bottom ≤ vh", t.left >= 0 && t.right <= t.vw && t.bottom <= t.vh);
    record("S8 토스트 aria-live polite", width, "경영관리", "", t.live, "polite", t.live === "polite");
    const rowsAfter = await evidenceRows(page).count();
    record("S8 저장 뒤 짝 없는 줄 수", width, "경영관리", "/expenses/evidence?state=unmatched", rowsAfter, width === 375 ? 3 : 2, rowsAfter === (width === 375 ? 3 : 2));
  }
  await page.context().close();
});

// ── S4 카드 사용 후보 ────────────────────────────────────────────────────────────────────

test("S4 카드 사용 후보 — 값 바뀜 2행 · 막힌 행 aria-disabled + 이유 넷 · 맨 뒤 · combobox 0 · 결과 줄 × 폭 6", async ({ browser }) => {
  test.setTimeout(600_000);
  const holder = await person(DEFAULT_ROLE_ID, "기획1팀");
  const cardA = await addLotteCard({ kind: "personal", holderUserId: holder.viewer.id });
  const cardB = await addLotteCard({ kind: "personal", holderUserId: holder.viewer.id });
  const cardBc = await addBcCard({ kind: "personal", holderUserId: holder.viewer.id });
  const manager = await person(await proxyRole());
  const P = approval();
  // 줄 합계는 케이스마다 새로 — 완화 후보는 「승인번호 같음 또는 사용일 · 합계 같음」이라 고정 합계면 앞 반복(같은 DB)의 u2 · u3 꼴 카드 사용이
  // 반복마다 둘씩 후보에 쌓이고, 고를 수 있는 그 행들이 앞에 서서 상한(20)에서 이 케이스의 막힌 행이 잘린다. 실행가(150,000)보다 커야 한다.
  const T = 200_001 + Math.floor(Math.random() * 99_999);
  const u1 = await usage(holder.viewer, cardA, { total: 200_000, approvalNo: P, usedOn: "2026-04-30" });
  const u2 = await usage(holder.viewer, cardB, { total: T, usedOn: "2026-04-10" });
  const u3 = await usage(holder.viewer, cardA, { total: T, usedOn: "2026-04-10" });
  const statement = await line(manager.viewer, cardA, { total: 1_000, date: "2026.04.10" });
  await insertLinkFixture({ recordId: statement, ownerKind: "corp_card_usage", ownerId: u3.id, attachedBy: manager.viewer.id });
  const cap = await quoteLine(holder.viewer, 150_000);
  const u4 = await usage(holder.viewer, cardA, { total: 100_000, approvalNo: P, usedOn: "2026-04-20", lineId: cap.lineId });
  const u5 = await usage(holder.viewer, cardBc, { total: 120_000, approvalNo: P, usedOn: "2026-04-22" });
  const done = await quoteLine(holder.viewer, 3_000_000);
  const u6 = await usage(holder.viewer, cardA, { total: 90_000, approvalNo: P, usedOn: "2026-04-21", lineId: done.lineId });
  await db.update(projects).set({ status: "completed" }).where(eq(projects.id, done.projectId));
  const recordId = await line(manager.viewer, cardA, { total: T, approvalNo: P, date: "2026.04.10" });
  void recordId;
  const expected = new Map<string, { selectable: boolean; text: string }>([
    [u1.number, { selectable: true, text: `합계 200,000 → ${won(T)}` }],
    [u2.number, { selectable: true, text: `카드 ${cardB} → ${cardA}` }],
    [u3.number, { selectable: false, text: `증빙 있음 · ${u3.number}` }],
    [u4.number, { selectable: false, text: `합계 100,000 → ${won(T)} · 실행가 초과` }],
    [u5.number, { selectable: false, text: `카드 다름 · ${cardBc}` }],
    [u6.number, { selectable: false, text: `합계 90,000 → ${won(T)} · 완료 프로젝트` }],
  ]);

  const page = await pageAs(browser, manager);
  const url = "/expenses/evidence?state=unmatched → 붙이기";
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/expenses/evidence?state=unmatched");
    await expect(evidenceRows(page)).toHaveCount(1); // 줄 L 하나(카드 명세는 u3에 붙어 짝 없는 보기에서 빠진다)
    const attach = page.getByRole("button", { name: "붙이기", exact: true });
    await waitForHydration(evidenceRows(page).first().locator("td").first());
    if (!PHONE(width) && width >= 1024) await expect.poll(() => attach.count(), { timeout: 10_000 }).toBeGreaterThan(0).catch(() => undefined);
    const count = await attach.count();
    record("S4 트리거 `붙이기` 수", width, "경영관리", url, count, width >= 1024 ? 1 : "0(1024 미만 보기 전용)", width >= 1024 ? count === 1 : count === 0);
    if (width < 1024) {
      record("S4 폰 — 붙이기 보임(행 행동 p3 숨김 · 정보)", width, "경영관리", url, await attach.first().isVisible().catch(() => false), "정보", null);
      continue;
    }
    await waitForHydration(attach.first());
    await attach.first().click();
    const dialog = page.getByRole("dialog", { name: "붙일 문서 고르기" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
    const options = await dialog.getByRole("option").evaluateAll((els) =>
      els.map((el) => ({ text: (el.textContent ?? "").replace(/\s+/g, " ").trim(), disabled: el.getAttribute("aria-disabled") === "true", h: Math.round(el.getBoundingClientRect().height) })),
    );
    const cardOptions = options.filter((o) => [...expected.keys()].some((n) => n && o.text.includes(n)));
    for (const [number, want] of expected) {
      const option = cardOptions.find((o) => o.text.includes(number));
      record(`S4 후보 ${want.selectable ? "고를 수 있음" : "막힘"} — ${want.text}`, width, "경영관리", url, option ? `${option.disabled ? "disabled" : "enabled"} · ${option.text.slice(0, 90)}` : "없음", `${want.selectable ? "enabled" : "disabled"} · …${want.text}`, !!option && option.disabled === !want.selectable && option.text.includes(want.text));
    }
    const firstBlocked = options.findIndex((o) => o.disabled);
    const lastEnabled = options.map((o) => o.disabled).lastIndexOf(false);
    record("S4 막힌 행 맨 뒤", width, "경영관리", url, { firstBlocked, lastEnabled, n: options.length }, "firstBlocked > lastEnabled", firstBlocked > lastEnabled);
    const combos = await dialog.locator("[role=combobox]").count();
    record("S4 combobox 0", width, "경영관리", url, combos, 0, combos === 0);
    const pick = dialog.getByRole("option").filter({ hasText: u1.number });
    await pick.click();
    const fileWins = await dialog.getByText(FILE_WINS, { exact: true }).count();
    record("S4 값 바뀜 행 고름 → 결과 줄", width, "경영관리", url, fileWins, 1, fileWins === 1);
    const scroll = await dialog.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    record("S4 모달 가로 넘침 없음", width, "경영관리", url, scroll, "≤", (scroll[0] ?? 0) <= (scroll[1] ?? 0));
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  await page.context().close();
});

// ── S5 카드 사용 수정 패널 ────────────────────────────────────────────────────────────────

test("S5 카드 사용 수정 패널 — 작성자 막힌 행 · 결과 줄 DOM 0 × 폭 6 / 팀장 · 구매 카드 사용 트리거 0 / 경영관리 registrar 결과 줄", async ({ browser }) => {
  test.setTimeout(600_000);
  // 새 팀 — 아래 팀장 발령이 팀당 한 자리라 시드 팀(기획1팀)을 쓰면 반복 · 뒤 스펙에서 막힌다.
  const team = await freshTeam();
  const teamId = team.id;
  const holder = await person(DEFAULT_ROLE_ID, team);
  const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.viewer.id });
  const u = await usage(holder.viewer, last4, { total: 200_000 });
  const manager = await person(await proxyRole());
  const same = await line(manager.viewer, last4, { total: 200_000, date: "2026.04.11" });
  const differ = await line(manager.viewer, last4, { total: 204_100, date: "2026.04.12" });
  for (const id of [same, differ]) await setRecordVisibilityFixture(id, { visibility: "team", teamId });
  const blockedText = "합계 200,000 → 204,100 · 붙이기는 경영관리";

  const page = await pageAs(browser, holder);
  const url = `/cards?editId=<작성자 카드 사용>`;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/cards?editId=${u.id}`);
    // 수정 패널은 SSR에서 닫힌 <dialog>로 오고 하이드레이션 뒤 showModal()로 열린다 — 열리기 전에는 안의 트리거가 접근성 트리에 없어
    // getByRole이 0을 센다(첫 폭 = 첫 JS 적재가 가장 느리다). 패널이 열린 뒤에 잰다.
    await expect(page.locator('dialog[data-ui="side-panel"]')).toBeVisible();
    const trigger = page.getByRole("button", { name: /^증빙 고르기 \d+$/ });
    const n = await trigger.count();
    record("S5 작성자 트리거 `증빙 고르기 N`", width, "작성자(PM)", url, n ? await trigger.first().textContent() : null, "증빙 고르기 1(N = 작성자가 고를 수 있는 후보 수 — 같은 합계 줄 하나)", n === 1 && (await trigger.first().textContent())?.trim() === "증빙 고르기 1");
    if (n === 0) continue;
    const tb = await box(trigger.first());
    record("S5 트리거 탭 높이", width, "작성자(PM)", url, tb, PHONE(width) ? "≥44" : "정보", PHONE(width) ? big(tb) : null);
    await waitForHydration(trigger.first());
    await trigger.first().click();
    const dialog = page.getByRole("dialog", { name: "증빙 고르기" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
    const options = await dialog.getByRole("option").evaluateAll((els) => els.map((el) => ({ text: (el.textContent ?? "").replace(/\s+/g, " ").trim(), disabled: el.getAttribute("aria-disabled") === "true", h: Math.round(el.getBoundingClientRect().height) })));
    const blocked = options.find((o) => o.text.includes(blockedText));
    record("S5 막힌 행 `합계 a → b · 붙이기는 경영관리` aria-disabled", width, "작성자(PM)", url, blocked ? `${blocked.disabled}` : "없음", "true", blocked?.disabled === true);
    record("S5 고를 수 있는 행 수", width, "작성자(PM)", url, options.filter((o) => !o.disabled).length, 1, options.filter((o) => !o.disabled).length === 1);
    if (PHONE(width)) {
      record("S5 행 탭 높이(폰)", width, "작성자(PM)", url, options.map((o) => o.h), "≥44", options.every((o) => o.h >= 44));
      // Codex 후보 — 폰 시트가 내용과 무관하게 최대 높이(88dvh)로 서는가(SYSTEM §7-8 「높이 내용 따라 최대 --sheet-max-h」).
      const sheet = await dialog.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const opts = [...el.querySelectorAll("[role=option]")];
        const last = opts.at(-1)?.getBoundingClientRect();
        const primary = [...el.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("이 증빙 붙이기"))?.getBoundingClientRect();
        return { h: Math.round(r.height), vh: window.innerHeight, height: getComputedStyle(el).height, lastOptionBottom: last ? Math.round(last.bottom) : null, primaryTop: primary ? Math.round(primary.top) : null };
      });
      const gap = sheet.lastOptionBottom !== null && sheet.primaryTop !== null ? sheet.primaryTop - sheet.lastOptionBottom : null;
      record("S5 폰 시트 높이 — 내용 따라(빈 공간)", width, "작성자(PM)", url, { ...sheet, gap }, "높이 ≤ 88dvh · 내용 따라(SYSTEM §7-8)", null);
    }
    await dialog.getByRole("option").filter({ hasNotText: "붙이기는 경영관리" }).first().click();
    const resultLine = await page.getByText(FILE_WINS).count();
    record("S5 작성자 — 결과 줄 `고르면 카드 사용 합계…` DOM 0", width, "작성자(PM)", url, resultLine, 0, resultLine === 0);
    const primary = dialog.getByRole("button", { name: "이 증빙 붙이기" });
    record("S5 1차 `이 증빙 붙이기`", width, "작성자(PM)", url, await primary.count(), 1, (await primary.count()) === 1);
    const scroll = await dialog.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    record("S5 모달 가로 넘침 없음", width, "작성자(PM)", url, scroll, "≤", (scroll[0] ?? 0) <= (scroll[1] ?? 0));
    const [sw, cw] = await docOverflow(page);
    record("S5 문서 가로 넘침 없음", width, "작성자(PM)", url, [sw, cw], "≤", sw <= cw);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }

  // 구매에서 생긴 카드 사용(registered_via=purchase) — 등록한 사람에게 트리거 DOM 0.
  const { projectId, lineId } = await quoteLine(holder.viewer, 3_000_000, teamId);
  const pu = await usage(holder.viewer, last4, { total: 200_000, lineId });
  const [request] = await db.insert(purchaseRequests).values({ number: `26001-C${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId, quoteLineId: lineId, requestedBy: holder.viewer.id, itemName: "감사현수막", estimateAmountKrw: 200_000 }).returning({ id: purchaseRequests.id });
  if (!request) throw new Error("구매 요청 없음");
  await db.update(corpCardUsages).set({ registeredVia: "purchase", purchaseRequestId: request.id }).where(eq(corpCardUsages.id, pu.id));
  await page.setViewportSize({ width: 1280, height: 900 });
  const purchaseResponse = await page.goto(`/cards?editId=${pu.id}`);
  const purchaseTrigger = await page.locator("[data-evidence-pick]").count();
  record("S5 구매 카드 사용 — `증빙 고르기` DOM 0", 1280, "작성자(PM)", "/cards?editId=<구매 카드 사용>", { status: purchaseResponse?.status(), trigger: purchaseTrigger }, 0, purchaseTrigger === 0);
  await page.context().close();

  // 팀장 — 작성자 모드 없음(트리거 0).
  const lead = await person(TEAM_LEAD_ROLE_ID, team);
  const leadPage = await pageAs(browser, lead);
  const leadResponse = await leadPage.goto(`/cards?editId=${u.id}`);
  const leadTrigger = await leadPage.locator("[data-evidence-pick]").count();
  const leadPanel = await leadPage.getByRole("dialog").count();
  record("S5 팀장 — `증빙 고르기` DOM 0", 1280, "팀장", url, { status: leadResponse?.status(), panel: leadPanel, trigger: leadTrigger }, "trigger 0", leadTrigger === 0);
  await leadPage.context().close();

  // 경영관리(registrar) — 값 바뀜 줄을 고르면 결과 줄.
  const managerPage = await pageAs(browser, manager);
  await managerPage.setViewportSize({ width: 1280, height: 900 });
  const mResponse = await managerPage.goto(`/cards?editId=${u.id}`);
  await expect(managerPage.locator('dialog[data-ui="side-panel"]')).toBeVisible();
  const mTrigger = managerPage.getByRole("button", { name: /^증빙 고르기 \d+$/ });
  const mCount = await mTrigger.count();
  record("S5 경영관리 — 트리거", 1280, "경영관리", url, { status: mResponse?.status(), trigger: mCount ? await mTrigger.first().textContent() : null }, "정보(registrar 풀 = 같은 카드 줄)", null);
  if (mCount > 0) {
    await waitForHydration(mTrigger.first());
    await mTrigger.first().click();
    const dialog = managerPage.getByRole("dialog", { name: "증빙 고르기" });
    await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
    const changing = dialog.getByRole("option").filter({ hasText: "204,100" });
    if ((await changing.count()) > 0) {
      await changing.first().click();
      const line1 = await dialog.getByText(FILE_WINS, { exact: true }).count();
      record("S5 경영관리 — 값 바뀜 줄 고름 → 결과 줄", 1280, "경영관리", url, line1, 1, line1 === 1);
    } else {
      record("S5 경영관리 — 값 바뀜 줄 후보", 1280, "경영관리", url, await dialog.getByRole("option").allTextContents(), "204,100 줄 있음", false);
    }
  }
  await managerPage.context().close();
});

// ── M10 ────────────────────────────────────────────────────────────────────────────────

test("M10 `등록한 카드와 다름` — 2행 안 글자 · 색 = 2행 색 · 새 요소 0 × 폭 6", async ({ browser }) => {
  test.setTimeout(400_000);
  const holder = await person(DEFAULT_ROLE_ID, "기획1팀");
  const cardA = await addLotteCard({ kind: "personal", holderUserId: holder.viewer.id });
  const cardB = await addLotteCard({ kind: "personal", holderUserId: holder.viewer.id });
  const manager = await person(await proxyRole());
  const P = approval();
  await usage(holder.viewer, cardA, { total: 300_000, approvalNo: P });
  await line(manager.viewer, cardB, { total: 300_000, approvalNo: P, date: "2026.04.30" });
  const page = await pageAs(browser, manager);
  const url = "/expenses/evidence?state=attached";
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url);
    await expect(evidenceRows(page)).toHaveCount(1);
    const facts = await evidenceRows(page).first().evaluate((tr) => {
      const link = [...tr.querySelectorAll("a")].find((a) => /-K\d{4}$/.test((a.textContent ?? "").trim()));
      const parent = link?.parentElement ?? null;
      const textNodes = parent ? [...parent.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "") : [];
      const markerEl = [...tr.querySelectorAll("*")].filter((el) => el.children.length === 0 && /등록한 카드와 다름/.test(el.textContent ?? ""));
      return {
        link: link ? (link.textContent ?? "").trim() : null,
        linkHref: link?.getAttribute("href") ?? null,
        parentText: parent ? (parent.textContent ?? "").replace(/\s+/g, " ").trim() : null,
        markerInParentTextNode: textNodes.some((t) => t.includes("등록한 카드와 다름")),
        ownElements: markerEl.length,
        parentColor: parent ? getComputedStyle(parent).color : null,
        visible: parent ? parent.getClientRects().length > 0 : false,
        scroll: parent ? [parent.scrollWidth, parent.clientWidth] : null,
      };
    });
    record("M10 2행 글자 ` · 등록한 카드와 다름`", width, "경영관리", url, facts.parentText, "<K번호> · 등록한 카드와 다름", !!facts.parentText && /-K\d{4} · 등록한 카드와 다름$/.test(facts.parentText));
    record("M10 표식 = 2행 텍스트 노드(자기 요소 · 색 0)", width, "경영관리", url, { textNode: facts.markerInParentTextNode, ownElements: facts.ownElements }, { textNode: true, ownElements: 0 }, facts.markerInParentTextNode && facts.ownElements === 0);
    record("M10 링크 href /cards?editId=", width, "경영관리", url, facts.linkHref, "/cards?editId=<uuid>", /^\/cards\?editId=[0-9a-f-]{36}$/.test(facts.linkHref ?? ""));
    record("M10 보임", width, "경영관리", url, facts.visible, PHONE(width) ? "정보(폰 상태 열)" : true, PHONE(width) ? null : facts.visible);
    const [sw, cw] = await docOverflow(page);
    record("M10 문서 가로 넘침 없음", width, "경영관리", url, [sw, cw], "≤", sw <= cw);
  }
  await page.context().close();
});
