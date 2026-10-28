import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, corpCards, evidenceRecordLinks, evidenceRecords } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { assignTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { addLotteCard, attachRecordFixture, clearEvidence, createIntakeRole, EVIDENCE_COL, evidenceCell, evidenceRows, focusGridCell, loginAs, registerFile, teamIdByName, uploadFixture } from "./helpers/evidence";
import { waitForHydration } from "./leave-org";

// 06.1-09 — 카드 파일 등록 → 1 · 2단계 대사 → S1 결과 행 `카드 사용에 붙음 n · 짝 없음 n`(UI-SPEC S1 카드 서식 추가 줄).
// 판정은 CI=true 프로덕션 빌드에서 한다(CLAUDE.md §5).

test.beforeEach(async () => {
  await clearEvidence();
});

function resultRow(page: Page) {
  return page.locator('[data-variant="bulk-import"] li[data-state="result"]');
}

async function cardHolder(): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `e2e-holder-${randomUUID()}@example.test`, name: "카드 보유자", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId: await teamIdByName("기획1팀"), effectiveFrom: "2020-01-01" });
  return { id: userId, roleId: DEFAULT_ROLE_ID };
}

async function cardUsage(holder: Viewer, last4: string, totalKrw: number, approvalNo: string | null): Promise<string> {
  const [card] = await db.select({ id: corpCards.id }).from(corpCards).where(and(eq(corpCards.numberLast4, last4), eq(corpCards.holderUserId, holder.id))).limit(1);
  if (!card) throw new Error("카드 없음");
  const input: CardUsageInput = { corpCardId: card.id, usedOn: "2026-04-30", merchantVendorId: null, total: { currency: "KRW", amount: totalKrw, fxRate: 1 }, evidenceTypeCode: "card_receipt", linkKind: "team_cost" };
  const created = await createCardUsage(holder, input, await precheckCardUsage(holder, input));
  if (approvalNo) await db.update(corpCardUsages).set({ approvalNo }).where(eq(corpCardUsages.id, created.id));
  return created.id;
}

test("카드 사용 둘 + 롯데 3줄 → 결과 행 `카드 사용에 붙음 2 · 짝 없음 1` · 카드 미등록 조각 0 → `짝 없음 1` 누르면 그 묶음의 짝 없는 줄 1행", async ({ page }) => {
  const holder = await cardHolder();
  const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
  const base = Number(last4) * 10_000;
  const [a1, a2, a3] = [String(base + 1), String(base + 2), String(base + 3)];
  await cardUsage(holder, last4, 200_000, a1);
  await cardUsage(holder, last4, 50_000, null);

  // cso D2(8ec9fb3) — 값을 바꾸는 대사 짝(200,000 → 204,100)은 등록자가 두 금액(card_usage.amount · evidence.amount)을 다 볼 때만 붙는다.
  // 새 등록 계급은 card_usage.amount 행이 없어 숨김이라 통합 시험(evidence-reconcile setup)처럼 보임을 준다(evidence.amount는 createIntakeRole이 준다).
  const roleId = await createIntakeRole();
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "card_usage.amount", visible: true });
  await loginAs(page, roleId);
  await page.goto("/expenses/evidence");
  const card = `999900001111${last4}`;
  await uploadFixture(
    page,
    "롯데_대사.xls",
    lotteFixture([
      { 카드번호: card, 승인번호: a1, 매입금액: "204,100", 부가세: "18,554" },
      { 카드번호: card, 승인번호: a2, 매입금액: "50,000", 부가세: "4,545" },
      { 카드번호: card, 승인번호: a3, 매입금액: "77,000", 부가세: "7,000" },
    ]),
  );
  await expect(resultRow(page)).toContainText("등록 3");
  await expect(resultRow(page).getByRole("link", { name: "카드 사용에 붙음 2", exact: true })).toHaveAttribute("href", /\?state=attached&batch=[0-9a-f-]{36}$/);
  await expect(resultRow(page).getByRole("link", { name: "짝 없음 1", exact: true })).toHaveAttribute("href", /\?state=unmatched&batch=[0-9a-f-]{36}$/);
  await expect(resultRow(page).getByText(/카드 미등록/)).toHaveCount(0);
  // design-gate 점검표 근거 — PC 1280 결과 행 · 폰 390 목록(판정은 DOM 단언 · 독립 DOM 감사가 한다). 폭을 바꾸면 끌어 놓기 영역이 다시 그려져 결과 행이 사라진다(기존 동작).
  await page.screenshot({ path: test.info().outputPath("reconcile-result-1280.png") });

  await resultRow(page).getByRole("link", { name: "짝 없음 1", exact: true }).click();
  await expect(page).toHaveURL(/\/expenses\/evidence\?state=unmatched&batch=[0-9a-f-]{36}$/);
  await expect(evidenceRows(page)).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("reconcile-unmatched-390.png") });
});

// 06.1-09 Task 3 — S2 행 행동 배타(DB-9 · E5 · PA-ALLBLOCKED) · S8 대리 등록(완화 후보 0인 짝 없는 카드 줄 → /cards?new=1&evidence=).
test.describe("S8 대리 등록 · S2 행 행동 배타(06.1-09 Task 3)", () => {
  const won = (n: number) => n.toLocaleString("en-US");
  // 다른 스펙이 남긴 카드 사용과 같은 날 · 같은 합계(완화 후보)가 되지 않게 합계를 무작위로 고른다.
  const total = () => 700_000 + Math.floor(Math.random() * 280_000);

  async function proxyRole(): Promise<string> {
    const roleId = await createIntakeRole();
    for (const menu of ["cards.proxy", "expenses.payments"]) await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action: "write", allowed: true });
    for (const infoItem of ["card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
    return roleId;
  }

  async function line(viewer: Viewer, last4: string, input: { total: number; approvalNo?: string; date: string }): Promise<string> {
    const batchId = await registerFile(
      viewer,
      lotteFixture([{ 카드번호: `999900001111${last4}`, 승인번호: input.approvalNo ?? String(10_000_000 + Math.floor(Math.random() * 89_999_999)), 매입금액: won(input.total), 부가세: won(Math.floor(input.total / 11)), 매입일자: input.date, 가맹점명: "대리가맹점" }]),
      `대리_${randomUUID().slice(0, 6)}.xls`,
    );
    const [row] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, batchId));
    if (!row) throw new Error("기록 없음");
    return row.id;
  }

  async function usagesOn(last4: string, holderId: string) {
    const [card] = await db.select({ id: corpCards.id }).from(corpCards).where(and(eq(corpCards.numberLast4, last4), eq(corpCards.holderUserId, holderId))).limit(1);
    if (!card) throw new Error("카드 없음");
    return db.select({ id: corpCardUsages.id }).from(corpCardUsages).where(eq(corpCardUsages.corpCardId, card.id));
  }

  test("후보 0 줄 `대리 등록` → 패널 카드 · 사용일 · 합계 · 가맹점 읽기 텍스트(입력 0) → 팀 비용 · 저장 → 토스트 · 짝 없는 줄에서 빠짐 / 후보 있는 줄은 `붙이기`만 / 한 행에 둘이 같이 없음", async ({ page }) => {
    const holder = await cardHolder();
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const roleId = await proxyRole();
    const manager = await loginAs(page, roleId);
    const t = total();
    const lonely = await line(manager, last4, { total: t, date: "2026.03.17" });
    const approvalNo = String(20_000_000 + Math.floor(Math.random() * 79_999_999));
    await cardUsage(holder, last4, 10_000, approvalNo);
    // D-E1: 카드 사용 사용일(04-30)에서 31일 안이어야 고를 수 있는 후보다(넘으면 `날짜 다름 · N일` 막힌 행).
    await line(manager, last4, { total: total(), approvalNo, date: "2026.04.18" });

    await page.goto("/expenses/evidence?state=unmatched");
    await expect(evidenceRows(page)).toHaveCount(2);
    await expect(page.getByRole("link", { name: "대리 등록", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "붙이기", exact: true })).toHaveCount(1);
    for (const row of await evidenceRows(page).all()) {
      const both = (await row.getByRole("link", { name: "대리 등록", exact: true }).count()) + (await row.getByRole("button", { name: "붙이기", exact: true }).count());
      expect(both).toBe(1);
    }

    const proxy = page.getByRole("link", { name: "대리 등록", exact: true });
    // G-06.1-40: 출발 목록을 싣는다
    await expect(proxy).toHaveAttribute("href", `/cards?new=1&evidence=${lonely}&from=${encodeURIComponent("/expenses/evidence?state=unmatched")}`);
    await waitForHydration(proxy);
    await proxy.click();
    // G-06.1-40: 출발 목록을 싣는다
    await expect(page).toHaveURL(new RegExp(`/cards\\?new=1&evidence=${lonely}&from=${encodeURIComponent("/expenses/evidence?state=unmatched")}$`));
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(won(t), { exact: true })).toBeVisible();
    await expect(sheet.getByText("2026-03-17", { exact: true })).toBeVisible();
    await expect(sheet.getByText("대리가맹점", { exact: true })).toBeVisible();
    await expect(sheet.locator("#card-usage-used-on")).toHaveCount(0);
    await expect(sheet.locator('input[inputmode], input[name="amount"]')).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "가맹점 바꾸기" })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("s8-panel-1280.png") });

    const team = sheet.getByRole("radio", { name: "팀 비용" });
    await waitForHydration(team);
    await team.check();
    await sheet.getByRole("button", { name: /^카드 사용 등록/ }).click();
    await expect(page).toHaveURL(/\/expenses\/evidence\?state=unmatched&registered=[0-9a-f-]{36}$/);
    await expect(page.getByRole("status").filter({ hasText: `카드 사용 등록 · ${won(t)}` })).toBeVisible();
    await expect(evidenceRows(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "대리 등록", exact: true })).toHaveCount(0);
    expect(await usagesOn(last4, holder.id)).toHaveLength(2);
  });

  // PR-D D-1 — 대리 등록 링크는 격자 로빙 밖(tabIndex -1)이라 키보드 경로가 Ctrl+E다(§7-3 (차) · PR-C D-1의 붙이기 · 되살리기와 같은 길).
  // PR-D D-3(판정 P-1 ①) — 증빙 목록에서 연 S8은 Esc · `취소`로 닫아도 저장처럼 출발한 증빙 목록으로 돌아가고 포커스는 연 그 행이다.
  test("(PR-D D-1 · D-3) 키보드만: 격자 칸 Ctrl+E → S8 대리 등록 · 힌트 `대리 등록 Ctrl+E` → Esc → 증빙 목록 · 그 행 / `취소` → 같음", async ({ page }) => {
    const holder = await cardHolder();
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const manager = await loginAs(page, await proxyRole());
    const lonely = await line(manager, last4, { total: total(), date: "2026.03.21" });
    const listUrl = /\/expenses\/evidence\?state=unmatched$/;

    await page.goto("/expenses/evidence?state=unmatched");
    await expect(evidenceRows(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "대리 등록", exact: true })).toHaveCount(1);
    const hint = page.getByRole("main").locator("kbd", { hasText: "Ctrl+E" });
    await expect(hint).toHaveCount(1);
    await expect(hint.locator("xpath=..")).toContainText("대리 등록");

    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    for (const close of ["Escape", "취소"] as const) {
      const cell = evidenceCell(page, 0, EVIDENCE_COL.date);
      await focusGridCell(cell);
      await page.keyboard.press("Control+e");
      // G-06.1-40: 출발 목록을 싣는다
      await expect(page).toHaveURL(new RegExp(`/cards\\?new=1&evidence=${lonely}&from=${encodeURIComponent("/expenses/evidence?state=unmatched")}$`));
      await expect(sheet).toBeVisible();
      await waitForHydration(sheet.getByRole("radio", { name: "팀 비용" }));
      if (close === "Escape") await page.keyboard.press("Escape");
      else await sheet.getByRole("button", { name: /^취소/ }).click();
      await expect(sheet).toBeHidden();
      await expect(page).toHaveURL(listUrl);
      await expect(evidenceRows(page)).toHaveCount(1);
      // 연 요소 = 그 행의 `대리 등록` 링크(목록이 새로 그려져 SidePanel returnFocusTo가 같은 증빙의 링크를 찾는다).
      await expect(evidenceRows(page).first().getByRole("link", { name: "대리 등록", exact: true })).toBeFocused();
    }
    expect(await usagesOn(last4, holder.id)).toHaveLength(0);
  });

  // 06.1 UAT #40 — 출발 목록(거르개 포함)으로 닫힘 · 포커스(.planning/debug/0601-proxy-return-origin.md)
  test("(G-06.1-40) 출발 목록이 기본 할 일 · 전체+카드여도 Esc · `취소`(링크 · Ctrl+E)가 그 주소 그대로 · 그 행 `대리 등록` 포커스로", async ({ page }) => {
    const holder = await cardHolder();
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const manager = await loginAs(page, await proxyRole());
    const lonely = await line(manager, last4, { total: total(), date: "2026.03.22" });
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    const proxyLink = page.locator(`a[href*="evidence=${lonely}"]`);

    for (const origin of ["/expenses/evidence", "/expenses/evidence?state=all&type=card_receipt"]) {
      for (const way of ["link-escape", "ctrl-e-cancel"] as const) {
        await page.goto(origin);
        await expect(proxyLink).toHaveCount(1);
        // G-06.1-40: 출발 목록을 싣는다
        await expect(proxyLink).toHaveAttribute("href", `/cards?new=1&evidence=${lonely}&from=${encodeURIComponent(origin)}`);
        if (way === "link-escape") {
          await waitForHydration(proxyLink);
          await proxyLink.click();
        } else {
          await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
          await page.keyboard.press("Control+e");
        }
        await expect(page).toHaveURL(new RegExp(`/cards\\?new=1&evidence=${lonely}&from=`));
        await expect(sheet).toBeVisible();
        await waitForHydration(sheet.getByRole("radio", { name: "팀 비용" }));
        if (way === "link-escape") await page.keyboard.press("Escape");
        else await sheet.getByRole("button", { name: /^취소/ }).click();
        await expect(sheet).toBeHidden();
        await expect.poll(() => {
          const url = new URL(page.url());
          return url.pathname + url.search;
        }).toBe(origin);
        await expect(proxyLink).toBeFocused();
      }
    }
    expect(await usagesOn(last4, holder.id)).toHaveLength(0);
  });

  // PR #255 Codex 봇 P2 — 주소창의 `%20`을 useSearchParams().toString()이 `+`로 바꿔 SidePanel 정확 일치가 어긋나던 건. 닫으면 replace가 아니라 history back이어야 한다.
  test("(G-06.1-40 공백 거르개) 공백이 든 거르개 값(`%20`)으로 연 목록에서 연 S8을 닫으면 history back으로 돌아간다", async ({ page }) => {
    const holder = await cardHolder();
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const manager = await loginAs(page, await proxyRole());
    const lonely = await line(manager, last4, { total: total(), date: "2026.03.23" });
    const origin = "/expenses/evidence?state=all&type=card_receipt&q=a%20b";
    const proxyLink = page.locator(`a[href*="evidence=${lonely}"]`);
    const entryIndex = () => page.evaluate(() => (window as unknown as { navigation: { currentEntry: { index: number } } }).navigation.currentEntry.index);

    await page.goto(origin);
    await expect(proxyLink).toHaveCount(1);
    // G-06.1-40: 출발 목록을 주소창 글자 그대로 싣는다(`+`로 다시 쓰지 않는다)
    await expect(proxyLink).toHaveAttribute("href", `/cards?new=1&evidence=${lonely}&from=${encodeURIComponent(origin)}`);
    const listIndex = await entryIndex();
    await waitForHydration(proxyLink);
    await proxyLink.click();
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    await expect(sheet).toBeVisible();
    await waitForHydration(sheet.getByRole("radio", { name: "팀 비용" }));
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect.poll(entryIndex).toBe(listIndex);
    await expect.poll(() => {
      const url = new URL(page.url());
      return url.pathname + url.search;
    }).toBe(origin);
    await expect(proxyLink).toBeFocused();
  });

  // 【(a)】 G-06.1-40 결정 — 저장도 출발 목록으로 돌아오고, 토스트가 닫히면 registered만 걷힌다(거르개 그대로).
  test("(G-06.1-40 저장) 전체+카드에서 연 S8 저장 → 출발 + registered · 토스트 `카드 사용 등록 · {합계}` → 토스트 뒤 출발 글자 그대로 · 그 줄 `붙음`", async ({ page }) => {
    const holder = await cardHolder();
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const manager = await loginAs(page, await proxyRole());
    const t = total();
    const lonely = await line(manager, last4, { total: t, date: "2026.03.25" });
    const origin = "/expenses/evidence?state=all&type=card_receipt";
    const proxyLink = page.locator(`a[href*="evidence=${lonely}"]`);

    await page.goto(origin);
    await expect(proxyLink).toHaveCount(1);
    await waitForHydration(proxyLink);
    await proxyLink.click();
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    await expect(sheet).toBeVisible();
    const team = sheet.getByRole("radio", { name: "팀 비용" });
    await waitForHydration(team);
    await team.check();
    await sheet.getByRole("button", { name: /^카드 사용 등록/ }).click();
    await expect(page).toHaveURL(new RegExp(`${origin.replace("?", "\\?")}&registered=[0-9a-f-]{36}$`));
    await expect(page.getByRole("status").filter({ hasText: `카드 사용 등록 · ${won(t)}` })).toBeVisible();
    // 토스트가 4초 뒤 저절로 닫히면 registered만 걷힌다.
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return url.pathname + url.search;
      }, { timeout: 15_000 })
      .toBe(origin);
    await expect(evidenceRows(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "대리 등록", exact: true })).toHaveCount(0);
    expect(await usagesOn(last4, holder.id)).toHaveLength(1);
  });

  // PR #256 Codex 봇 P2 — 토스트를 닫을 때 쿼리를 URLSearchParams로 다시 써 `%20`이 `+`로, 겹친 키 순서가 묶여 바뀌던 건. 날 쿼리에서 registered만 걷어야 한다.
  test("(G-06.1-40 날 쿼리) `%20` · 섞인 겹친 키로 착지해 토스트를 닫으면 — registered만 걷히고 쿼리 글자는 그대로", async ({ page }) => {
    const holder = await cardHolder();
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    await loginAs(page, await proxyRole());
    const registeredId = await cardUsage(holder, last4, 10_000, null);
    const raw = "state=all&q=a%20b&x=1&type=card_receipt&x=2";

    await page.goto(`/expenses/evidence?${raw}&registered=${registeredId}`);
    const toast = page.getByRole("status").filter({ hasText: "카드 사용 등록 · " });
    await expect(toast).toBeVisible();
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return url.pathname + url.search;
      }, { timeout: 15_000 })
      .toBe(`/expenses/evidence?${raw}`);
  });

  // 열린 리디렉션 — 남이 만든 `from`은 증빙 목록이 아니면 지금 닫을 곳으로 떨어진다(T-06.1-16-01).
  test("(G-06.1-40 적대 from) `from=//evil.example/x`로 연 S8을 Esc로 닫으면 같은 출처 `/expenses/evidence?state=unmatched`", async ({ page }) => {
    const holder = await cardHolder();
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const manager = await loginAs(page, await proxyRole());
    const lonely = await line(manager, last4, { total: total(), date: "2026.03.24" });
    await page.goto(`/cards?new=1&evidence=${lonely}&from=${encodeURIComponent("//evil.example/x")}`);
    const appOrigin = new URL(page.url()).origin;
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    await expect(sheet).toBeVisible();
    await waitForHydration(sheet.getByRole("radio", { name: "팀 비용" }));
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/expenses\/evidence\?state=unmatched$/);
    expect(new URL(page.url()).origin).toBe(appOrigin);
  });

  test("완화 후보가 전부 막힌 줄 → `붙이기` · `대리 등록` DOM 0 · 행 행동 자리 `증빙 있음 · {번호}` 글자", async ({ page }) => {
    const holder = await cardHolder();
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const manager = await loginAs(page, await proxyRole());
    const approvalNo = String(30_000_000 + Math.floor(Math.random() * 69_999_999));
    const usageId = await cardUsage(holder, last4, 10_000, approvalNo);
    const statement = await line(manager, last4, { total: total(), date: "2026.03.02" });
    await db.insert(evidenceRecordLinks).values({ evidenceRecordId: statement, ownerKind: "corp_card_usage", ownerId: usageId, attachMode: "registrar", attachedBy: manager.id });
    await line(manager, last4, { total: total(), approvalNo, date: "2026.03.03" });
    const [usage] = await db.select({ number: corpCardUsages.number }).from(corpCardUsages).where(eq(corpCardUsages.id, usageId));

    await page.goto("/expenses/evidence?state=unmatched");
    await expect(evidenceRows(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "대리 등록", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "붙이기", exact: true })).toHaveCount(0);
    await expect(evidenceRows(page).first().getByText(`증빙 있음 · ${usage?.number ?? ""}`, { exact: true })).toBeVisible();
  });

  test("(N1) S8 경합 — 패널을 연 뒤 그 줄이 다른 문서에 붙으면 저장 거부 `다른 사람이 먼저 붙임…`(꼬리 · 새로 고침 버튼 없음) · 카드 사용 0 · 2차 `취소`", async ({ page }) => {
    const holder = await cardHolder();
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const manager = await loginAs(page, await proxyRole());
    const lonely = await line(manager, last4, { total: total(), date: "2026.03.19" });

    await page.goto(`/cards?new=1&evidence=${lonely}`);
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    const team = sheet.getByRole("radio", { name: "팀 비용" });
    await waitForHydration(team);
    await team.check();
    await attachRecordFixture(lonely, manager.id);
    await sheet.getByRole("button", { name: /^카드 사용 등록/ }).click();
    const reason = sheet.locator("#card-usage-form-reason");
    await expect(reason).toContainText("다른 사람이 먼저 붙임");
    await expect(reason).not.toContainText("새로 고침");
    await expect(sheet.getByRole("button", { name: "새로 고침" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: /^취소/ })).toBeVisible();
    expect(await usagesOn(last4, holder.id)).toHaveLength(0);

    // PA-S8-STALE — 붙은 증빙의 대리 등록 주소는 404.
    const response = await page.goto(`/cards?new=1&evidence=${lonely}`);
    expect(response?.status()).toBe(404);
  });
});

// 06.1-09 Task 2 — 경영관리 S4 값 바뀜 붙이기 · 작성자 S5(같은 카드 줄만 · 막힌 행 · 값 그대로) · M10 표식 색.
test.describe("S4 카드 사용 후보 · S5 작성자 · M10(06.1-09 Task 2 · 3)", () => {
  const won = (n: number) => n.toLocaleString("en-US");
  const approval = () => String(40_000_000 + Math.floor(Math.random() * 59_999_999));

  async function managerRole(): Promise<string> {
    const roleId = await createIntakeRole();
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "expenses.payments", action: "write", allowed: true });
    for (const infoItem of ["card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
    return roleId;
  }

  async function lineOf(viewer: Viewer, last4: string, input: { total: number; approvalNo: string; date: string }): Promise<string> {
    const batchId = await registerFile(
      viewer,
      lotteFixture([{ 카드번호: `999900001111${last4}`, 승인번호: input.approvalNo, 매입금액: won(input.total), 부가세: won(Math.floor(input.total / 11)), 매입일자: input.date }]),
      `S4_${randomUUID().slice(0, 6)}.xls`,
    );
    const [row] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, batchId));
    if (!row) throw new Error("기록 없음");
    return row.id;
  }

  test("경영관리 S4 — 승인번호가 같은 카드 사용이 `합계 a → b` 후보 → Enter 붙이기 → 붙음 · 카드 사용 합계 = 파일 값", async ({ page }) => {
    const holder = await cardHolder();
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const manager = await loginAs(page, await managerRole());
    const P = approval();
    const usageId = await cardUsage(holder, last4, 200_000, P);
    await lineOf(manager, last4, { total: 204_100, approvalNo: P, date: "2026.04.10" });

    await page.goto("/expenses/evidence?state=unmatched");
    await expect(evidenceRows(page)).toHaveCount(1);
    const attach = evidenceRows(page).first().getByRole("button", { name: "붙이기", exact: true });
    await waitForHydration(attach);
    await attach.click();
    const dialog = page.getByRole("dialog", { name: "붙일 문서 고르기" });
    await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
    const [usage] = await db.select({ number: corpCardUsages.number }).from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    const option = dialog.getByRole("option", { name: new RegExp(usage?.number ?? "없음") });
    await expect(option).toContainText("합계 200,000 → 204,100");
    await expect(dialog.locator("[role=combobox]")).toHaveCount(0);
    await option.click();
    await option.press("Enter");
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await db.select({ total: corpCardUsages.totalAmountKrw }).from(corpCardUsages).where(eq(corpCardUsages.id, usageId)))[0]?.total).toBe(204_100);
  });

  test("작성자 S5 — 카드 사용 수정 패널 `증빙 고르기` → 같은 합계 줄 Enter 붙임 · 합계 그대로 · 합계 다른 줄은 막힌 행 `… · 붙이기는 경영관리`", async ({ page, browser }) => {
    const teamId = await teamIdByName("기획1팀");
    const holder = await loginAs(page, DEFAULT_ROLE_ID, teamId);
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const usageId = await cardUsage(holder, last4, 200_000, null);
    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    const manager = await loginAs(managerPage, await managerRole());
    await managerContext.close();
    const same = await lineOf(manager, last4, { total: 200_000, approvalNo: approval(), date: "2026.04.11" });
    const differ = await lineOf(manager, last4, { total: 204_100, approvalNo: approval(), date: "2026.04.12" });
    await db.update(evidenceRecords).set({ visibility: "team", visibleTeamId: teamId }).where(inArray(evidenceRecords.id, [same, differ]));

    await page.goto(`/cards?editId=${usageId}`);
    const trigger = page.getByRole("button", { name: /^증빙 고르기 \d/ });
    await waitForHydration(trigger);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "증빙 고르기" });
    await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
    const blocked = dialog.getByRole("option").filter({ hasText: "합계 200,000 → 204,100 · 붙이기는 경영관리" });
    await expect(blocked).toHaveAttribute("aria-disabled", "true");
    const pick = dialog.getByRole("option").filter({ hasNotText: "붙이기는 경영관리" });
    await expect(pick).toHaveCount(1);
    await pick.click();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await db.select({ id: evidenceRecordLinks.id }).from(evidenceRecordLinks).where(and(eq(evidenceRecordLinks.evidenceRecordId, same), isNull(evidenceRecordLinks.detachedAt)))).length).toBe(1);
    const [row] = await db.select({ total: corpCardUsages.totalAmountKrw }).from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    expect(row?.total).toBe(200_000);
  });

  test("(M10) 1단계 카드 다른 짝 → 상태 2행 `등록한 카드와 다름` · 글자 색 = 같은 2행 글자 색(새 색 0)", async ({ page }) => {
    const holder = await cardHolder();
    const cardA = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const cardB = await addLotteCard({ kind: "personal", holderUserId: holder.id });
    const manager = await loginAs(page, await managerRole());
    const P = approval();
    await cardUsage(holder, cardA, 300_000, P);
    await lineOf(manager, cardB, { total: 300_000, approvalNo: P, date: "2026.04.30" });

    await page.goto("/expenses/evidence?state=attached");
    await expect(evidenceRows(page)).toHaveCount(1);
    const marker = evidenceRows(page).first().getByText(/등록한 카드와 다름/);
    await expect(marker).toBeVisible();
    // 표식은 2행 안의 글자 조각(자기 요소 · 색 없음) — 그 글자를 담은 요소가 번호 링크의 부모(2행)와 같고, 색도 그 2행 색이다.
    const link = evidenceRows(page).first().getByRole("link", { name: /-K\d{4}$/ });
    const lineColor = await link.evaluate((element) => getComputedStyle(element.parentElement ?? element).color);
    const markerColor = await marker.evaluate((element) => getComputedStyle(element).color);
    expect(await marker.evaluate((element, linkElement) => element === linkElement?.parentElement, await link.elementHandle())).toBe(true);
    expect(markerColor).toBe(lineColor);
  });
});
