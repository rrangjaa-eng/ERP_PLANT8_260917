import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { like } from "drizzle-orm";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { submitLeave } from "@/domain/leave";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { insertVendor } from "@/repositories/vendors";
import { countLines, VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { setupExpenseE2E } from "./expense-fixture";
import { leaveWeekdayRange } from "./leave-dates";
import { loginPage, setupLeaveOrg, waitForHydration } from "./leave-org";

// 07.1-02 디자인 검토 증거(최종 검토 F4): Codex 경로 캡처는 화면을 열자마자 찍어 폰 고르기 시트(후보 3줄 · 50줄)와 휴가 문서 `더보기` 시트에 닿지 못한다.
// 이 스펙이 그 상태에 닿은 뒤 폭마다(375 · 320 · 768 · 1280) 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`을 DESIGN_CAPTURE_DIR에 남긴다.
// 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 E2E와 독립 DOM 감사 몫. DESIGN_CAPTURE_DIR이 없으면(CI E2E) 건너뛴다.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.1-02)");

const PICK_LIMIT = 50;
const RUN = randomUUID().slice(0, 8);
const FEW_KEY = `캡처시트${RUN}a`;
const MANY_KEY = `캡처시트${RUN}b`;

async function insertPickVendors(key: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const name = `E2E${key}-${String(index).padStart(2, "0")}`;
    await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), kind: "supplier" });
  }
}

test.afterAll(async () => {
  const pattern = `E2E캡처시트${RUN}%`;
  try {
    await db.delete(vendors).where(like(vendors.name, pattern));
  } catch {
    await db.update(vendors).set({ archivedAt: new Date() }).where(like(vendors.name, pattern));
  }
});

type Surface = { absent: true } | { absent: false; box: { x: number; y: number; width: number; height: number }; titleLines: number | null };

async function measureState(page: Page, width: number, surface: Locator | null, titleOf: ((surface: Locator) => Locator) | null) {
  const page_ = await page.evaluate(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollWidth: document.documentElement.scrollWidth }));
  let found: Surface = { absent: true };
  if (surface && (await surface.count()) > 0 && (await surface.first().isVisible())) {
    const box = await surface.first().boundingBox();
    const title = titleOf ? titleOf(surface.first()) : null;
    const rects = title
      ? await title.evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect): [number, number] => [rect.top, rect.bottom]);
        })
      : [];
    found = box ? { absent: false, box, titleLines: countLines(rects) } : { absent: true };
  }
  return { width, ...page_, surface: found };
}

async function capture(page: Page, name: string, width: number): Promise<void> {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `state-${name}-${width}.png`), fullPage: true });
}

function save(name: string, rows: unknown[]): void {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `measurements-state-${name}.json`), JSON.stringify(rows, null, 2));
}

test.describe("07.1-02 디자인 검토 증거 캡처", () => {
  test("폰 고르기 시트 — 후보 3줄 · 50줄을 4폭에서 찍는다", async ({ browser, baseURL }) => {
    await insertPickVendors(FEW_KEY, 3);
    await insertPickVendors(MANY_KEY, PICK_LIMIT);
    const fx = await setupExpenseE2E();
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.phone.id] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
    const page = await loginPage(browser, baseURL, fx.pm);

    const few: unknown[] = [];
    const many: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(`/expenses/${expenseId}`);
      await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
      await page.locator("#vendor-pick").click();
      const picker = page.getByRole("dialog", { name: /^지급처 (고르기|바꾸기)$/ });
      await expect(picker).toBeVisible();
      const search = picker.getByRole("textbox", { name: "지급처 이름 검색" });
      const titleOf = (surface: Locator) => surface.getByRole("heading").first();

      await search.fill(FEW_KEY);
      await expect(picker.getByRole("option")).toHaveCount(3);
      await capture(page, "pick-3", viewport.width);
      few.push(await measureState(page, viewport.width, picker, titleOf));

      await search.fill(MANY_KEY);
      await expect(picker.getByRole("option")).toHaveCount(PICK_LIMIT);
      await capture(page, "pick-50", viewport.width);
      many.push(await measureState(page, viewport.width, picker, titleOf));
    }
    save("pick-3", few);
    save("pick-50", many);
    await page.context().close();
  });

  test("휴가 문서 폰 `더보기` 시트를 4폭에서 찍는다(시트는 폰 폭에만 있다)", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 6, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    const doc = await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });
    const page = await loginPage(browser, baseURL, org.teamLead);

    const rows: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(`/leave/${doc.leaveId}`);
      await waitForHydration(page.getByRole("button", { name: /^승인/ }));
      const more = page.getByRole("navigation", { name: "하단 탭" }).getByRole("button", { name: "더보기" });
      const sheet = page.getByRole("dialog", { name: "더보기" });
      if (viewport.width < 700) {
        await more.click();
        await expect(sheet).toBeVisible();
      }
      await capture(page, "leave-more-sheet", viewport.width);
      rows.push(await measureState(page, viewport.width, viewport.width < 700 ? sheet : null, (surface) => surface.getByRole("heading", { name: "더보기" })));
    }
    save("leave-more-sheet", rows);
    await page.context().close();
  });
});
