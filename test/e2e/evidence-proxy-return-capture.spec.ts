import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecords } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { assignTeam } from "@/domain/org";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { addLotteCard, clearEvidence, createIntakeRole, registerFile, teamIdByName } from "./helpers/evidence";

// 06.1-16 캡처 쌍(BASE 36fedd7 · 이 가지) — 같은 시드 · 같은 경로를 375 · 320 · 768 · 1280에서 찍는다. BASE에도 있는 API만 쓴다.
// 상태 셋: 출발 목록(?state=all&type=card_receipt) · 그 목록에서 연 S8 · Esc 뒤 도착 화면. 사진은 비교 기록용이고 판정은 DOM 실측(CAPTURE_JSON).
// CAPTURE_DIR · CAPTURE_TAG(적용전 | 적용후)가 없으면 건너뛴다.

const DIR = process.env.CAPTURE_DIR ?? "";
const TAG = process.env.CAPTURE_TAG ?? "";
const JSON_OUT = process.env.CAPTURE_JSON ?? "";
const WIDTHS = [375, 320, 768, 1280] as const;
const ORIGIN = "/expenses/evidence?state=all&type=card_receipt";
const won = (n: number) => n.toLocaleString("en-US");

type Measure = { count: number; rects: string[]; url: string; selects: { id: string; value: string; text: string }[]; marked: string[]; title: string; scrollWidth: number; clientWidth: number };

async function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const roots = [...document.querySelectorAll("#main-content, [role=dialog]")];
    const rects: string[] = [];
    for (const root of roots) {
      for (const el of root.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        rects.push(`${root.getAttribute("role") ?? "main"}|${el.tagName}|${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`);
      }
    }
    const selects = [...document.querySelectorAll("select")].map((s) => ({ id: s.id || s.name || s.getAttribute("aria-label") || "", value: s.value, text: s.selectedOptions[0]?.textContent?.trim() ?? "" }));
    const marked = [...document.querySelectorAll('[aria-pressed="true"],[aria-selected="true"],[aria-current]')].map((el) => (el.textContent ?? "").trim().slice(0, 30));
    return {
      count: rects.length,
      rects,
      url: location.pathname + location.search,
      selects,
      marked,
      title: document.querySelector("h1")?.textContent?.trim() ?? "",
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

async function shot(page: Page, name: string, width: number): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: `${DIR}/${name}-${width}-${TAG}.png`, fullPage: true });
}

test("06.1-16 캡처 쌍 — 출발 목록 · S8 · Esc 뒤 도착 × 375 · 320 · 768 · 1280", async ({ browser }) => {
  test.skip(!DIR || !TAG, "CAPTURE_DIR · CAPTURE_TAG 없음");
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  await clearEvidence();
  const roleId = await createIntakeRole();
  for (const menu of ["cards.proxy", "expenses.payments"]) await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action: "write", allowed: true });
  for (const infoItem of ["card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
  const email = `e2e-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "캡처 사람", roleId });
  const manager = { id: userId, roleId } as Viewer;
  const holderMail = `e2e-${randomUUID()}@example.test`;
  const holder = await createAccount(SYSTEM_VIEWER, { email: holderMail, name: "카드 보유자", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId: holder.userId, teamId: await teamIdByName("기획1팀"), effectiveFrom: "2020-01-01" });
  const last4 = await addLotteCard({ kind: "personal", holderUserId: holder.userId });
  const batchId = await registerFile(
    manager,
    lotteFixture([{ 카드번호: `999900001111${last4}`, 승인번호: "55555555", 매입금액: won(800_000), 부가세: won(72_727), 매입일자: "2026.03.17", 가맹점명: "대리가맹점" }]),
    "캡처_대리.xls",
  );
  const [row] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, batchId));
  if (!row) throw new Error("기록 없음");

  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  const mail = page.getByLabel("이메일");
  await expect.poll(() => mail.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps$")))).toBe(true);
  await mail.fill(email);
  await page.getByLabel("비밀번호").fill(tempPassword);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);

  const out: Record<string, Measure> = {};
  const s8Direct = `/cards?new=1&evidence=${row.id}${TAG === "적용후" ? `&from=${encodeURIComponent(ORIGIN)}` : ""}`;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(ORIGIN);
    await expect(page.locator("main tbody tr, #main-content tbody tr").first()).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, "list", width);
    out[`list-${width}`] = await measure(page);

    const link = page.locator(`a[href*="evidence=${row.id}"]`);
    if ((await link.count()) > 0) {
      await link.first().click();
    } else {
      await page.goto(s8Direct);
    }
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, "s8", width);
    out[`s8-${width}`] = await measure(page);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/expenses/evidence");
    await page.waitForTimeout(800);
    await shot(page, "arrive", width);
    out[`arrive-${width}`] = await measure(page);
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
});
