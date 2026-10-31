import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createCorpCard } from "@/domain/corp-cards";
import { cancelPurchaseRequest, precheckPurchaseCancel } from "@/domain/purchase-requests";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { db } from "@/db/client";
import { purchaseRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seoulToday } from "@/lib/dates";
import { measurePhoneRows } from "./helpers/phone-rows";
import { completePurchase, makeCardHolder, makePrepaidOverdue, makePurchaser, makeTeamPayer, paidExpense, requestPurchase, seedLongTarget } from "./helpers/phone-fixtures";
import { loginPage } from "./leave-org";
import { setupExpenseE2E } from "./expense-fixture";

// 07.1-18 게이트 반영(#326 review P1) — 실제 길이 데이터(7자리 금액 · 긴 이름 · 긴 상태 글자)로 공용 폰 표를 잰다.
// 판정은 DOM 실측이다(스크린샷 육안 금지). 공용 규칙이 칸 폭을 깎아 main보다 나빠지는지(P1-1) · 320에서 표가 담는 상자를 넘는지(P1-2) · 접힌 줄이 두 줄 이상인지(P1-3)를 폭마다 본다.

async function expectTableFits(page: Page, label: string): Promise<void> {
  const fit = await page.evaluate(() => {
    const table = document.querySelector("main table");
    const holder = table?.parentElement;
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      right: table ? Math.round(table.getBoundingClientRect().right) : -1,
      holder: holder ? Math.round(holder.getBoundingClientRect().right) : -1,
    };
  });
  expect(fit.doc, `${label} 문서 넘침`).toBeLessThanOrEqual(0);
  expect(fit.right, `${label} 표 오른쪽 ${fit.right} > 담는 상자 ${fit.holder}`).toBeLessThanOrEqual(fit.holder);
}

function logShape(label: string, shape: Awaited<ReturnType<typeof measurePhoneRows>>): void {
  console.log(`SHAPE ${label} ${JSON.stringify({ rows: shape.rows, maxMainCellLines: shape.maxMainCellLines, minTextBox: shape.minTextBox, medianMainRowHeight: shape.medianMainRowHeight, tableRight: shape.tableRight, containerRight: shape.containerRight, overflow: shape.overflow })}`);
}

for (const width of [375, 320] as const) {
  test.describe(`폰 ${width} 실제 길이 데이터`, () => {
    test(`/cards — 7자리 결제 합계 + 수정 · 삭제 행에서도 표가 담는 상자 안이다 (${width})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      const holder = await makeCardHolder();
      const target = await seedLongTarget({ person: holder.person, teamId: holder.teamId });
      const usd: CardUsageInput = { corpCardId: holder.cardId, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "USD", amount: 900, fxRate: 1474.89 }, evidenceTypeCode: "invoice", linkKind: "team_cost", memo: null };
      await createCardUsage(holder.person.viewer, usd, await precheckCardUsage(holder.person.viewer, usd));
      const krw: CardUsageInput = { corpCardId: holder.cardId, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "KRW", amount: 1_234_567, fxRate: 1 }, evidenceTypeCode: "invoice", linkKind: "quote_line", lineId: target.lineId, memo: null };
      await createCardUsage(holder.person.viewer, krw, await precheckCardUsage(holder.person.viewer, krw));
      const page = await loginPage(browser, baseURL, holder.person, { width, height: 800 });
      await page.goto("/cards");
      const table = page.locator("main table").first();
      await expect(table.getByText("1,234,567", { exact: true }).first()).toBeVisible();
      const shape = await measurePhoneRows(table);
      logShape(`/cards @${width}`, shape);
      expect(shape.rows).toBeGreaterThanOrEqual(2);
      expect(shape.maxFoldedLines, "접힌 줄 줄 수").toBeLessThanOrEqual(1);
      await expectTableFits(page, `/cards @${width}`);
      await page.context().close();
    });

    test(`/cards/purchases — 외화 · 구매 완료 · 취소 줄: 접힌 줄은 한 줄이고 행은 두 줄 (${width})`, async ({ browser, baseURL }) => {
      test.setTimeout(240_000);
      const requester = await makeCardHolder();
      const target = await seedLongTarget({ person: requester.person, teamId: requester.teamId });
      const buyer = await makePurchaser();
      const suffix = randomUUID().slice(0, 6);
      const shared = await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${suffix}`, numberLast4: "4499", label: `공용카드-${suffix}`, kind: "shared" });
      if (!shared.id) throw new Error("카드 없음");
      await requestPurchase(requester.person, target.onlineLineId, `원화 신청 중인 아주 긴 품목 이름 현수막 배너 거치대 일체-${suffix}`, { currency: "KRW", amount: 1_234_567, fxRate: 1 });
      await requestPurchase(requester.person, target.onlineLineId, `외화-${suffix}`, { currency: "USD", amount: 100, fxRate: 1350 });
      const done = await requestPurchase(requester.person, target.onlineLineId, `완료 품목-${suffix}`, { currency: "KRW", amount: 1_100_000, fxRate: 1 });
      await completePurchase(buyer, done.id, shared.id, 1_234_567);
      const cancelled = await requestPurchase(requester.person, target.onlineLineId, `취소 품목-${suffix}`, { currency: "KRW", amount: 55_000, fxRate: 1 });
      const [row] = await db.select({ version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.id, cancelled.id));
      await cancelPurchaseRequest(buyer.viewer, { id: cancelled.id, version: row?.version ?? 1, reason: "중복 신청이라 구매하지 않음 — 다른 요청으로 갈음" }, await precheckPurchaseCancel(buyer.viewer, { id: cancelled.id }));
      const page = await loginPage(browser, baseURL, buyer, { width, height: 800 });
      await page.goto(`/cards/purchases?status=${encodeURIComponent("전체")}`);
      const table = page.locator("main table[data-row-sheet]").first();
      await expect(table).toBeVisible({ timeout: 30_000 });
      const shape = await measurePhoneRows(table);
      logShape(`/cards/purchases @${width}`, shape);
      expect(shape.rows).toBeGreaterThanOrEqual(4);
      expect(shape.maxMainCellLines, `주 행 셀 줄 수 ${shape.worstCell}`).toBeLessThanOrEqual(1);
      expect(shape.maxFoldedLines, `접힌 줄 줄 수 ${JSON.stringify(shape.foldedTexts)}`).toBeLessThanOrEqual(1);
      expect(shape.visibleSecondary, "폰 주 행에 보이는 셀 아래 줄").toBe(0);
      await expectTableFits(page, `/cards/purchases @${width}`);
      await page.context().close();
    });

    test(`/expenses — 지급 완료 + 증빙 경과 줄: 상태 칸이 main보다 좁아지지 않고 행은 두 줄 (${width})`, async ({ browser, baseURL }) => {
      test.setTimeout(300_000);
      const fx = await setupExpenseE2E();
      const payer = await makeTeamPayer(fx);
      await paidExpense(fx, "tracer", payer);
      const overdue = await paidExpense(fx, "hold", payer);
      await makePrepaidOverdue(overdue);
      await paidExpense(fx, "worst", payer);
      const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
      await page.goto(`/expenses?${new URLSearchParams({ status: "승인" })}`);
      const table = page.locator("main table").filter({ has: page.locator("a[data-row-link]") }).first();
      await expect(table).toBeVisible({ timeout: 30_000 });
      await expect(table).toContainText(`지급 완료 ${seoulToday().slice(5)}`);
      const shape = await measurePhoneRows(table);
      logShape(`/expenses @${width}`, shape);
      expect(shape.rows).toBeGreaterThanOrEqual(3);
      // 375는 주 행 한 줄. 320은 담는 상자(288)에 들도록 상태 칸만 `지급 완료`/날짜 두 줄까지(main도 같은 자리에서 꺾였다) — 잘리지는 않는다.
      expect(shape.maxMainCellLines, `주 행 셀 줄 수 ${shape.worstCell}`).toBeLessThanOrEqual(width === 375 ? 1 : 2);
      expect(shape.maxFoldedLines, `접힌 줄 ${JSON.stringify(shape.foldedTexts)}`).toBeLessThanOrEqual(1);
      expect(shape.minRowHeight, "데이터 행 높이").toBeGreaterThanOrEqual(44);
      // 증빙 경과 메모는 주 행에서 빠져 접힌 줄 글자로 간다(사라지지 않는다).
      expect(shape.foldedTexts.some((text) => text.includes("증빙 2일 경과")), `접힌 줄 글자 ${JSON.stringify(shape.foldedTexts)}`).toBe(true);
      // 상태 칸은 잘리지 않는다 — `지급 완료 MM-DD` 전체가 보이고, 칸 폭이 글자 폭 밑으로 깎이지 않는다.
      const status = await table.evaluate((node) => {
        const index = Array.from(node.querySelectorAll("thead th")).findIndex((th) => (th.textContent ?? "").trim() === "상태");
        return Array.from(node.querySelectorAll("tbody > tr")).flatMap((tr) => {
          const cell = tr.children[index] as HTMLElement | undefined;
          const text = (cell?.textContent ?? "").trim();
          if (!cell || !text.startsWith("지급 완료")) return [];
          const box = cell.querySelector<HTMLElement>("[data-cell-text]") ?? cell;
          return [{ text, width: Math.round(cell.getBoundingClientRect().width), clipped: box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1 }];
        });
      });
      const cols = await table.evaluate((node) => Array.from(node.querySelectorAll("thead th")).filter((th) => (th as HTMLElement).offsetParent !== null).map((th) => `${(th.textContent ?? "").trim()}:${Math.round(th.getBoundingClientRect().width)}`));
      console.log(`COLS expenses@${width} ${cols.join(" ")} table=${await table.evaluate((n) => Math.round(n.getBoundingClientRect().width))}`);
      console.log(`MEASURE expenses@${width} ${JSON.stringify({ status, shape: { ...shape, foldedTexts: undefined, worstCell: undefined } })}`);
      expect(status.length).toBeGreaterThanOrEqual(3);
      expect(status.filter((cell) => cell.clipped), "잘린 상태 칸").toEqual([]);
      await expectTableFits(page, `/expenses @${width}`);
      await page.context().close();
    });
  });
}
