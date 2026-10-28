import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { countLines, VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { createIntakeManager, insertRecordFixture, setRecordVisibilityFixture } from "../integration/fixtures/evidence";
import { setupExpenseE2E, submitLineExpense } from "./expense-fixture";
import { loginPage, waitForHydration } from "./leave-org";

// 07.1-09 디자인 검토 증거(최종 검토 F4): Codex 경로 캡처는 화면을 열자마자 찍어 증빙 고르기 대화상자와 로그인 사용자별 필터 줄에 닿지 못한다.
// 이 스펙이 그 상태에 닿은 뒤 폭마다(375 · 320 · 768 · 1280) 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`을 DESIGN_CAPTURE_DIR에 남긴다.
// 상태: pick-recommended(문서 종류와 같은 종류만 · 검색어 없음) · pick-empty(추천 0줄) · list-filter(전사 범위의 필터 줄 — 팀 · 월 · 내 것만).
// 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 E2E와 독립 DOM 감사 몫. DESIGN_CAPTURE_DIR이 없으면(CI E2E) 건너뛴다.
// 이 스펙은 origin/main에도 있는 도우미 · 선택자만 쓴다(main 기준 같은 상태 캡처 — 화면이 바뀌기 전 모습).

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.1-09)");

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

test.describe("07.1-09 디자인 검토 증거 캡처", () => {
  test("증빙 고르기 대화상자 — 검색어 없음(같은 종류만) · 추천 0줄을 4폭에서 찍는다", async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    const fx = await setupExpenseE2E();
    const manager = await createIntakeManager("캡처경영");
    for (const [index, evidenceType] of ["tax_invoice", "tax_invoice", "card_receipt", "card_receipt", "card_receipt"].entries()) {
      const id = await insertRecordFixture(manager, { evidenceType, nameOnDocument: `캡처증빙${index}` });
      await setRecordVisibilityFixture(id, { visibility: "team", teamId: fx.teamId });
    }
    // 같은 풀에서 문서 증빙 종류만 다르게 — 세금계산서 문서는 추천 2줄, 현금영수증 문서는 같은 종류가 없어 추천 0줄.
    const makeDraft = async (line: "tracer" | "phone", evidenceType: string): Promise<string> => {
      const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[line].id], fields: { note: "행사 운영비" } });
      const expenseId = created.created[0]?.expenseId;
      if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
      await db.update(expenses).set({ evidenceType }).where(eq(expenses.id, expenseId));
      return expenseId;
    };
    const recommendedDoc = await makeDraft("tracer", "tax_invoice");
    const emptyDoc = await makeDraft("phone", "cash_receipt");
    const page = await loginPage(browser, baseURL, fx.pm);
    const dialogOf = (p: Page) => p.getByRole("dialog", { name: "증빙 고르기" });
    const titleOf = (surface: Locator) => surface.getByRole("heading").first();

    for (const [name, expenseId] of [["pick-recommended", recommendedDoc], ["pick-empty", emptyDoc]] as const) {
      const rows: unknown[] = [];
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.goto(`/expenses/${expenseId}`);
        const trigger = page.getByRole("button", { name: /^증빙 고르기( \d+)?$/ });
        await waitForHydration(trigger);
        await trigger.click();
        const dialog = dialogOf(page);
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("option").or(dialog.getByText(/증빙이 없습니다|후보 없음|없습니다/)).first()).toBeVisible();
        await capture(page, name, viewport.width);
        rows.push(await measureState(page, viewport.width, dialog, titleOf));
      }
      save(name, rows);
    }
    await page.context().close();
  });

  test("지출결의 목록 필터 줄 — 전사 범위(대표)의 팀 · 월 · 내 것만을 4폭에서 찍는다", async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    const fx = await setupExpenseE2E();
    await submitLineExpense(browser, baseURL, fx, "worst");
    const page = await loginPage(browser, baseURL, fx.ceo);
    const rows: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/expenses");
      const form = page.getByRole("form", { name: "지출결의 보기" });
      await waitForHydration(form.getByRole("combobox", { name: "상태" }));
      await capture(page, "list-filter", viewport.width);
      rows.push(await measureState(page, viewport.width, form, (surface) => surface.locator("label").first()));
    }
    save("list-filter", rows);
    await page.context().close();
  });
});
