import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, purchaseRequests, quoteLines } from "@/db/schema";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { approvalBasis } from "@/repositories/quote-revisions";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration } from "./leave-org";
import { E2E_ONLINE_VENDOR_NAME, enableOnlineVendorSetting } from "./online-vendor";

// 07-18 Task 3 (S3 · S4 · D-738) — 폰 견적 표 문 칸. 폰 행에는 문 열 버튼이 없고(행 두 줄 · 주 버튼 하나) 행 탭 시트가 문 행동을 맡는다.
// 시트 1차 `구매 요청`(구매 문 줄)은 현행 그대로이고, 문이 닫힌 줄의 시트는 PC 행과 같은 이유 낱말을 보인다. 이미 요청한 줄은 행에 `구매 요청 중`.

async function seed() {
  const suffix = randomUUID().slice(0, 8);
  const year = seoulToday().slice(0, 4);
  await enableOnlineVendorSetting();
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰문본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰문팀-${suffix}` });
  const pm = await makePerson("폰문", DEFAULT_ROLE_ID, team.id, `${year}-01-01`);
  const online = await insertVendor(SYSTEM_VIEWER, { name: E2E_ONLINE_VENDOR_NAME, normalizedName: E2E_ONLINE_VENDOR_NAME.toLowerCase() });
  const other = await insertVendor(SYSTEM_VIEWER, { name: `E2E폰문거래처-${suffix}`, normalizedName: `e2e폰문거래처-${suffix}` });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E폰문클라이언트-${suffix}`, normalizedName: `e2e폰문클라이언트-${suffix}` });
  const project = await createProject(pm.viewer, {
    clientId: client.id,
    teamId: team.id,
    pmUserId: pm.viewer.id,
    name: `E2E폰문-${suffix}`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(and(eq(codeItems.tableKey, "quote_subcategory"), eq(codeItems.active, true), isNull(codeItems.archivedAt))).orderBy(asc(codeItems.sortOrder), asc(codeItems.value)).limit(1);
  if (!subcategory) throw new Error("소분류 코드가 없습니다");
  const item = (label: string) => `${label}-${suffix}`;
  const row = (itemName: string, vendorId: string) => ({
    id: randomUUID(),
    isNew: true as const,
    subcategory: subcategory.value,
    itemName,
    vendorId,
    quantity: 1,
    unitPrice: { currency: "KRW" as const, amount: 1_500_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
  });
  const items = { buy: item("현장 소모품"), requested: item("이미 요청한 소모품"), cancelled: item("취소할 무대"), open: item("열린 제작") };
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [row(items.buy, online.id), row(items.requested, online.id), row(items.cancelled, other.id), row(items.open, other.id)],
  });
  await db.update(quoteLines).set({ lineStatus: "cancelled" }).where(and(eq(quoteLines.revisionId, revision.id), eq(quoteLines.itemName, items.cancelled)));
  const [requestedLine] = await db.select({ id: quoteLines.id }).from(quoteLines).where(and(eq(quoteLines.revisionId, revision.id), eq(quoteLines.itemName, items.requested)));
  if (!requestedLine) throw new Error("요청할 줄이 없습니다");
  await db.insert(purchaseRequests).values({
    number: `TCPD${suffix.slice(0, 6)}`,
    linkKind: "quote_line",
    projectId: project.id,
    quoteLineId: requestedLine.id,
    requestedBy: pm.viewer.id,
    itemName: items.requested,
    estimateAmountKrw: 1_000_000,
  });
  await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));
  const seen = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(pm.viewer, revision.id, { approvalBasis: "verbal", approvedOn: seoulToday(), seenTotalKrw: seen.totalKrw, contentToken: seen.contentToken });
  return { pm, projectId: project.id, items };
}

test.describe("폰 견적 표 문 칸 (07-18)", () => {
  for (const width of [375, 320]) {
    test(`${width} — 행에는 문 버튼이 없고 탭 시트 1차가 \`구매 요청\`, 닫힌 줄 시트는 \`취소된 줄\`, 이미 요청한 줄은 행에 \`구매 요청 중\``, async ({ browser, baseURL }) => {
      const fx = await seed();
      const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
      await page.goto(`/projects/${fx.projectId}`);
      const tapBuy = page.getByRole("button", { name: `${fx.items.buy} 상세 보기` });
      await waitForHydration(tapBuy);

      // 행에서 바로 누르는 문 버튼은 없다(확정 3번 — 행 두 줄 · 주 버튼 하나).
      await expect(page.getByRole("button", { name: "구매 요청", exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "구매 요청", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "지출결의 올리기", exact: true })).toHaveCount(0);
      // 이미 요청한 줄은 행에 `구매 요청 중`.
      await expect(page.getByRole("row").filter({ hasText: fx.items.requested }).getByText("구매 요청 중", { exact: true })).toBeVisible();

      await tapBuy.click();
      const buySheet = page.getByRole("dialog", { name: fx.items.buy });
      await expect(buySheet.getByRole("link", { name: "구매 요청", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(buySheet).toHaveCount(0);

      const tapCancelled = page.getByRole("button", { name: `${fx.items.cancelled} 상세 보기` });
      await tapCancelled.click();
      const cancelledSheet = page.getByRole("dialog", { name: fx.items.cancelled });
      await expect(cancelledSheet.getByText("취소된 줄", { exact: true })).toBeVisible();
      await expect(cancelledSheet.getByRole("button", { name: "지출결의 올리기" })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await page.context().close();
    });
  }
});

// 07.1-19 PA5(C-22 · C-41 · E-P2-52 · Codex PR #301 P2): 폰 견적 표 합계 행 — `합계` · 실행가 열 아래 실행가 합 · 부제 `(공급가액 · N줄)` 안 보임.
// 합계 행은 `<tr>` 하나이고 칸만 나눈다(수화 뒤 폰에서만 · 칸 span은 폰에 보이는 열로 센다). 바닥 알림은 첫 칸 한 곳에서만 그린다.
test.describe("폰 견적 표 합계 행 (07.1-19 PA5)", () => {
  for (const width of [375, 320]) {
    test(`${width} — 합계 · 실행가 합 = 전체 줄 합 · 부제 안 보임 · 한 행 · 칸 span 합 = 보이는 th 수 · 실행가 열 오른쪽 끝에 맞음 · 표 넘침 0 · 알림 칸 줄바꿈`, async ({ browser, baseURL }) => {
      const fx = await seed();
      const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
      await page.goto(`/projects/${fx.projectId}`);
      await waitForHydration(page.getByRole("button", { name: `${fx.items.buy} 상세 보기` }));
      const table = page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) });
      const foot = table.locator("tfoot");
      // 서버 · 수화 중 첫 그림은 PC 한 칸 — 수화 뒤 세 칸이 되기를 기다린 뒤 잰다.
      await expect(foot.locator("tr")).toHaveCount(1);
      await expect(foot.locator("td")).toHaveCount(3);

      expect(await foot.innerText()).not.toContain("공급가액");
      const facts = await table.evaluate((root) => {
        const shown = [...root.querySelectorAll("thead th")].filter((th) => getComputedStyle(th).display !== "none");
        const executionHead = shown.find((th) => (th.textContent ?? "").trim() === "실행가") as HTMLElement | undefined;
        const cells = [...root.querySelectorAll("tfoot td")] as HTMLTableCellElement[];
        const bodyExecution = [...root.querySelectorAll("tbody tr")].flatMap((row) => {
          const tds = [...row.querySelectorAll("td")].filter((td) => getComputedStyle(td).display !== "none");
          const headIndex = shown.indexOf(executionHead as Element);
          const cell = tds.length === shown.length ? tds[headIndex] : undefined;
          return cell && /^[\d,]+$/.test((cell.textContent ?? "").trim()) ? [Number((cell.textContent ?? "").replace(/,/g, ""))] : [];
        });
        return {
          shownCount: shown.length,
          spanSum: cells.reduce((sum, cell) => sum + cell.colSpan, 0),
          cellTexts: cells.map((cell) => cell.innerText.trim()),
          executionRight: Math.round(((executionHead as HTMLElement).getBoundingClientRect().right) * 10) / 10,
          sumRight: Math.round((cells[1]?.getBoundingClientRect().right ?? 0) * 10) / 10,
          sumBold: cells[1] ? getComputedStyle(cells[1]).fontWeight : "",
          sumAlign: cells[1] ? getComputedStyle(cells[1]).textAlign : "",
          bodySum: bodyExecution.reduce((sum, value) => sum + value, 0),
          bodyCount: bodyExecution.length,
          tableRight: root.getBoundingClientRect().right,
          innerWidth: window.innerWidth,
          rowHeight: (root.querySelector("tfoot tr") as HTMLElement).getBoundingClientRect().height,
        };
      });
      expect(facts.spanSum, "칸 span 합 = 폰에 보이는 th 수").toBe(facts.shownCount);
      expect(facts.cellTexts[0], "첫 칸 글자").toBe("합계");
      expect(facts.cellTexts[1], "실행가 합 = 전체 줄 합").toBe("4,000,000");
      expect(facts.bodyCount).toBe(4);
      expect(facts.bodySum).toBe(4_000_000);
      expect(Math.abs(facts.sumRight - facts.executionRight), "합 오른쪽 끝 = 실행가 열 오른쪽 끝").toBeLessThanOrEqual(1);
      expect(facts.sumAlign).toBe("right");
      expect(Number(facts.sumBold)).toBeGreaterThanOrEqual(600);
      expect(facts.tableRight, "표 끝 빈 열 0").toBeLessThanOrEqual(facts.innerWidth + 0.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      expect(facts.rowHeight, "알림 없는 합계 행은 한 줄").toBeLessThan(80);

      // 바닥 알림(저장 결과 · 붙여넣기 · 오류 칸 수)은 첫 칸 안에서 줄바꿈하고 가로로 넘치지 않는다 — 폰에서는 붙여넣기가 없어 같은 마크업의 알림 조각을 직접 넣어 규칙을 잰다.
      const overflow = await foot.locator("td").first().evaluate((cell) => {
        const piece = document.createElement("span");
        piece.setAttribute("data-tone", "danger");
        piece.textContent = "오류 1칸 · 전부 거부 · 지출결의 만들기 실패 · 다시 시도";
        cell.append(piece);
        const result = {
          whiteSpace: getComputedStyle(piece).whiteSpace,
          cellOverflow: cell.scrollWidth - cell.clientWidth,
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
        piece.remove();
        return result;
      });
      expect(overflow.whiteSpace).toBe("normal");
      expect(overflow.cellOverflow).toBeLessThanOrEqual(0);
      expect(overflow.docOverflow).toBeLessThanOrEqual(0);
      console.log(`PA5 ${width} ${JSON.stringify({ rowHeight: facts.rowHeight, spans: facts.spanSum, sumRight: facts.sumRight, executionRight: facts.executionRight })}`);
      await page.context().close();
    });
  }
});

