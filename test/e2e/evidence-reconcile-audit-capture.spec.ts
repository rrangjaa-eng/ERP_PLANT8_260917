import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, corpCards, evidenceRecordLinks, evidenceRecords } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { assignTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { addLotteCard, clearEvidence, createIntakeRole, registerFile, teamIdByName, uploadFixture } from "./helpers/evidence";

// 06.1-09 Task 4 캡처 쌍(BASE b4cd09a · 이 가지) — 같은 시드 · 같은 경로를 375 · 320 · 768 · 1280에서 찍는다. BASE에도 있는 API만 쓴다.
// 사진은 비교 기록용이고 판정은 evidence-reconcile-audit.spec.ts의 DOM 실측으로만 한다. CAPTURE_DIR이 없으면 건너뛴다.

const DIR = process.env.CAPTURE_DIR ?? "";
test.use({ actionTimeout: 15_000 });
const WIDTHS = [375, 320, 768, 1280] as const;
const won = (n: number) => n.toLocaleString("en-US");
const approval = () => String(10_000_000 + Math.floor(Math.random() * 89_999_999));

async function person(roleId: string, teamName?: string) {
  const email = `e2e-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "캡처 사람", roleId });
  if (teamName) await assignTeam(SYSTEM_VIEWER, { userId, teamId: await teamIdByName(teamName), effectiveFrom: "2020-01-01" });
  return { viewer: { id: userId, roleId } as Viewer, email, password: tempPassword };
}

async function pageAs(browser: Browser, who: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  const email = page.getByLabel("이메일");
  await expect.poll(() => email.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps$")))).toBe(true);
  await email.fill(who.email);
  await page.getByLabel("비밀번호").fill(who.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

async function usage(holder: Viewer, last4: string, total: number, approvalNo: string | null, usedOn = "2026-04-30"): Promise<string> {
  const [card] = await db.select({ id: corpCards.id }).from(corpCards).where(eq(corpCards.numberLast4, last4)).limit(1);
  if (!card) throw new Error("카드 없음");
  const input: CardUsageInput = { corpCardId: card.id, usedOn, merchantVendorId: null, total: { currency: "KRW", amount: total, fxRate: 1 }, evidenceTypeCode: "card_receipt", linkKind: "team_cost" };
  const created = await createCardUsage(holder, input, await precheckCardUsage(holder, input));
  if (approvalNo) await db.update(corpCardUsages).set({ approvalNo }).where(eq(corpCardUsages.id, created.id));
  return created.id;
}

async function line(viewer: Viewer, last4: string, input: { total: number; approvalNo?: string; date: string }): Promise<string> {
  const batchId = await registerFile(viewer, lotteFixture([{ 카드번호: `999900001111${last4}`, 승인번호: input.approvalNo ?? approval(), 매입금액: won(input.total), 부가세: won(Math.floor(input.total / 11)), 매입일자: input.date, 가맹점명: "캡처가맹점" }]), `캡처_${randomUUID().slice(0, 6)}.xls`);
  const [row] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, batchId));
  if (!row) throw new Error("기록 없음");
  return row.id;
}

async function shot(page: Page, name: string, width: number): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${DIR}/${name}-${width}.png`, fullPage: true });
}

test("06.1-09 캡처 쌍 — S1 · S2 · S4 · S5 · S8 · M10 × 375 · 320 · 768 · 1280", async ({ browser }) => {
  test.skip(!DIR, "CAPTURE_DIR 없음");
  test.setTimeout(900_000);
  mkdirSync(DIR, { recursive: true });
  await clearEvidence();
  const roleId = await createIntakeRole();
  for (const menu of ["cards.proxy", "expenses.payments"]) await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action: "write", allowed: true });
  for (const infoItem of ["card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
  const manager = await person(roleId);
  const holder = await person(DEFAULT_ROLE_ID, "기획1팀");
  const page = await pageAs(browser, manager);

  // S1 — 폭을 바꾸면 결과 행이 사라진다(다시 마운트) — 폭마다 새 파일을 올린다.
  for (const width of WIDTHS) {
    const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.viewer.id });
    const base = Number(last4) * 10_000 + Math.floor(Math.random() * 9_000);
    await usage(holder.viewer, last4, 200_000, String(base + 1));
    await usage(holder.viewer, last4, 50_000, null);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/expenses/evidence");
    // 끌어 놓기 영역은 편집 폭(≥1024)에서만 선다(서버 스냅숏은 PC라 1024 미만은 수화 뒤 사라진다) — 그 폭은 목록만 찍는다.
    if (width < 1024) {
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.screenshot({ path: `${DIR}/s1-result-${width}.png`, fullPage: false });
      continue;
    }
    const card = `999900001111${last4}`;
    await uploadFixture(page, "캡처_대사.xls", lotteFixture([
      { 카드번호: card, 승인번호: String(base + 1), 매입금액: "204,100", 부가세: "18,554" },
      { 카드번호: card, 승인번호: String(base + 2), 매입금액: "50,000", 부가세: "4,545" },
      { 카드번호: card, 승인번호: String(base + 3), 매입금액: "77,000", 부가세: "7,000" },
    ]));
    await expect(page.locator('[data-variant="bulk-import"] li[data-state="result"]')).toContainText("등록 3", { timeout: 30_000 });
    await page.screenshot({ path: `${DIR}/s1-result-${width}.png`, fullPage: false });
  }

  // S2 · S4 · S8 · M10 시드.
  await clearEvidence();
  const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.viewer.id });
  const other4 = await addLotteCard({ kind: "personal", holderUserId: holder.viewer.id });
  const lonely = await line(manager.viewer, last4, { total: 812_345, date: "2026.03.17" });
  const candP = approval();
  await usage(holder.viewer, last4, 10_000, candP);
  await line(manager.viewer, last4, { total: 823_456, approvalNo: candP, date: "2026.03.18" });
  const heldP = approval();
  const held = await usage(holder.viewer, last4, 11_000, heldP);
  const statement = await line(manager.viewer, last4, { total: 834_567, date: "2026.03.02" });
  await db.insert(evidenceRecordLinks).values({ evidenceRecordId: statement, ownerKind: "corp_card_usage", ownerId: held, attachMode: "registrar", attachedBy: manager.viewer.id });
  await line(manager.viewer, last4, { total: 845_678, approvalNo: heldP, date: "2026.03.03" });
  const mP = approval();
  await usage(holder.viewer, last4, 300_000, mP);
  await line(manager.viewer, other4, { total: 300_000, approvalNo: mP, date: "2026.04.30" });
  const own = await usage(holder.viewer, last4, 200_000, null, "2026-04-29");

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/expenses/evidence?state=unmatched");
    await shot(page, "s2-unmatched", width);
    const attach = page.getByRole("button", { name: "붙이기", exact: true }).first();
    if (await attach.isVisible().catch(() => false)) {
      await attach.click();
      const dialog = page.getByRole("dialog", { name: "붙일 문서 고르기" });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
      await page.screenshot({ path: `${DIR}/s4-pick-${width}.png`, fullPage: false });
      await page.keyboard.press("Escape");
    }
    await page.goto(`/cards?new=1&evidence=${lonely}`);
    await shot(page, "s8-panel", width);
    await page.goto("/expenses/evidence?state=attached");
    await shot(page, "m10-attached", width);
  }
  await page.context().close();

  const teamId = await teamIdByName("기획1팀");
  for (const total of [200_000, 204_100]) {
    const id = await line(manager.viewer, last4, { total, date: "2026.04.12" });
    await db.update(evidenceRecords).set({ visibility: "team", visibleTeamId: teamId }).where(eq(evidenceRecords.id, id));
  }
  const holderPage = await pageAs(browser, holder);
  for (const width of WIDTHS) {
    await holderPage.setViewportSize({ width, height: 900 });
    await holderPage.goto(`/cards?editId=${own}`);
    await shot(holderPage, "s5-edit", width);
    const trigger = holderPage.getByRole("button", { name: /^증빙 고르기 \d+$/ });
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await expect(holderPage.getByRole("dialog", { name: "증빙 고르기" }).locator("[aria-busy]")).toHaveCount(0);
      await holderPage.screenshot({ path: `${DIR}/s5-pick-${width}.png`, fullPage: false });
      await holderPage.keyboard.press("Escape");
    }
  }
  await holderPage.context().close();
});
