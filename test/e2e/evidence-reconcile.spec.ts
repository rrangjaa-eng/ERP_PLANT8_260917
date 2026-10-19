import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, corpCards } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { assignTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { addLotteCard, clearEvidence, evidenceRows, loginIntake, teamIdByName, uploadFixture } from "./helpers/evidence";

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

  await loginIntake(page);
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
