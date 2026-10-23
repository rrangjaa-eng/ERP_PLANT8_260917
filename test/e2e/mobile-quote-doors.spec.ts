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
