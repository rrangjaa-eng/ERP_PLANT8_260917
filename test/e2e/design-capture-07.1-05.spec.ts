import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, evidenceImportBatches, evidenceRecords } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { countLines, VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { loginIntake } from "./helpers/evidence";
import { loginAsSysadmin } from "./row-actions-helpers";

// 07.1-05 디자인 검토 증거(Codex final F-2): Codex 경로 캡처는 globalSetup이 erp_test를 비운 뒤 경로를 열자마자 찍어 5,001건 비활성 · 이유 줄에 닿지 못한다.
// 이 스펙이 고유 묶음 증빙 5,001건 · 정리된 행동 로그 5,001행을 넣고 그 화면을 연 뒤 폭마다(375 · 320 · 768 · 1280) 전체 화면 PNG `state-<이름>-<폭>.png`와
// DOM 표 `measurements-state-<이름>.json`을 DESIGN_CAPTURE_DIR에 남긴다. 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 DOM 실측 몫.
// DESIGN_CAPTURE_DIR이 없으면(CI E2E) 건너뛴다.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.1-05)");

async function insertLimitBatch(viewer: Viewer, count: number): Promise<string> {
  const batchId = randomUUID();
  await db.insert(evidenceImportBatches).values({
    id: batchId,
    format: "hometax-tax-invoice",
    originalName: "상한_캡처.xls",
    fileSha256: createHash("sha256").update(batchId).digest("hex"),
    rowCount: count,
    registeredCount: count,
    skippedDuplicateCount: 0,
    uploadedBy: viewer.id,
  });
  const values = Array.from({ length: count }, (_, index) => ({
    batchId,
    format: "hometax-tax-invoice",
    evidenceType: "tax_invoice",
    dedupeKey: `capture:${batchId}:${index}`,
    issuedOn: seoulToday(),
    supplyKrw: 1000,
    vatKrw: 0,
    totalKrw: 1000,
    nameOnDocument: "상한 캡처",
    createdBy: viewer.id,
  }));
  for (let at = 0; at < values.length; at += 1000) await db.insert(evidenceRecords).values(values.slice(at, at + 1000));
  return batchId;
}

type Box = { x: number; y: number; width: number; height: number };
async function measureState(page: Page, width: number, button: Locator, reason: Locator) {
  const doc = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  const visible = (await button.count()) > 0 && (await button.first().isVisible());
  const buttonBox: Box | null = visible ? await button.first().boundingBox() : null;
  const disabled = visible ? await button.first().getAttribute("aria-disabled") : null;
  const reasonVisible = (await reason.count()) > 0 && (await reason.first().isVisible());
  const reasonBox: Box | null = reasonVisible ? await reason.first().boundingBox() : null;
  const reasonLines = reasonVisible
    ? countLines(
        await reason.first().evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect): [number, number] => [rect.top, rect.bottom]);
        }),
      )
    : null;
  return { width, ...doc, button: { visible, ariaDisabled: disabled, box: buttonBox }, reason: { visible: reasonVisible, box: reasonBox, lines: reasonLines } };
}

async function shoot(page: Page, name: string, width: number): Promise<void> {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `state-${name}-${width}.png`), fullPage: true });
}

function save(name: string, rows: unknown[]): void {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `measurements-state-${name}.json`), JSON.stringify(rows, null, 2));
}

test.describe("07.1-05 디자인 검토 증거 캡처", () => {
  test.setTimeout(300_000);

  test("증빙 5,001건 — 파일 받기 비활성 · 이유 줄을 4폭에서 찍는다", async ({ page }) => {
    const manager = await loginIntake(page);
    const batchId = await insertLimitBatch(manager, 5_001);
    try {
      const rows: unknown[] = [];
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.goto(`/expenses/evidence?state=all&batch=${batchId}`);
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const button = page.getByRole("button", { name: "파일 받기" });
        // 상태(5,001건 묶음)에 닿았는지만 본다 — 파일 받기는 편집 폭(≥1024)에서만 그리고, 비활성 여부는 DOM 표가 잰다(main 기준 촬영에서는 활성이다).
        await expect(page.getByText("상한 캡처").first()).toBeVisible();
        rows.push(await measureState(page, viewport.width, button, page.getByText("5,000건 넘음 · 필터나 검색으로 줄이기")));
        await shoot(page, "evidence-5001", viewport.width);
      }
      save("evidence-5001", rows);
    } finally {
      await db.delete(evidenceRecords).where(eq(evidenceRecords.batchId, batchId));
      await db.delete(evidenceImportBatches).where(eq(evidenceImportBatches.id, batchId));
    }
  });

  test("행동 로그 5,001행(정리된 행) — Excel 내보내기 비활성 · 이유 줄을 4폭에서 찍는다", async ({ page }) => {
    const token = `capture-limit-${randomUUID()}`;
    const base = { entity: "limit_fixture", entityId: token, documentId: token, detail: {}, prunedAt: new Date("2026-10-01T00:00:00Z"), prunedBy: "capture-limit" };
    const values = [...Array.from({ length: 5_000 }, () => ({ ...base, actionType: "settings_change" })), { ...base, actionType: "cert_view" }];
    for (let at = 0; at < values.length; at += 1000) await db.insert(actionLog).values(values.slice(at, at + 1000));
    await loginAsSysadmin(page);
    const rows: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(`/admin/action-log?includePruned=1&documentId=${token}`);
      await page.waitForLoadState("networkidle");
      const button = page.getByRole("button", { name: "Excel 내보내기" });
      await expect(page.getByRole("table", { name: "행동 로그" })).toBeVisible();
      rows.push(await measureState(page, viewport.width, button, page.getByText("5,000건 넘음 · 기간이나 필터로 줄이기")));
      await shoot(page, "action-log-5001", viewport.width);
    }
    save("action-log-5001", rows);
  });
});
