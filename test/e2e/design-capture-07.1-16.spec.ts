import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { createExpenseFromLines, saveExpenseDraft } from "@/domain/expenses";
import { detachOwnEvidence } from "@/domain/evidence-records/attach";
import { countLines, VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { createIntakeManager, insertLinkFixture, insertRecordFixture } from "../integration/fixtures/evidence";
import { setupExpenseE2E } from "./expense-fixture";
import { loginPage, waitForHydration } from "./leave-org";

// 07.1-16 디자인 검토 증거(최종 검토 F4): Codex 경로 캡처는 화면을 열자마자 찍어 「증빙을 붙인 뒤 다시 연 상태」 · 「모두 뗀 뒤 다시 연 상태」에 닿지 못한다.
// 이 스펙이 그 두 상태에 닿은 뒤 폭마다(375 · 320 · 768 · 1280) 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`을 DESIGN_CAPTURE_DIR에 남긴다.
// 상태: evidence-attached(작성자 붙임 기록 하나 · 저장된 수동 증빙일 있음) · evidence-detached(그 기록을 뗀 뒤 — 칸이 저장값으로 다시 선다).
// 표면은 `증빙일` 칸(#evidenceDate) — 그 폭에 칸이 없으면 absent: true. 단언은 상태에 닿았는지 보는 expect뿐이다(판정은 E2E와 독립 DOM 감사 몫).
// DESIGN_CAPTURE_DIR이 없으면(CI E2E) 건너뛴다. origin/main에도 있는 도우미 · 선택자만 쓴다(main 기준 같은 상태 캡처 — 화면이 바뀌기 전 모습).

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.1-16)");

type Surface = { absent: true } | { absent: false; box: { x: number; y: number; width: number; height: number }; labelLines: number | null; value: string };

async function measureState(page: Page, width: number) {
  const page_ = await page.evaluate(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollWidth: document.documentElement.scrollWidth }));
  const field = page.locator("#evidenceDate");
  let found: Surface = { absent: true };
  if ((await field.count()) > 0 && (await field.isVisible())) {
    const box = await field.boundingBox();
    const rects = await page.locator('label[for="evidenceDate"]').evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect): [number, number] => [rect.top, rect.bottom]);
      }),
    );
    found = box ? { absent: false, box, labelLines: countLines(rects), value: await field.inputValue() } : { absent: true };
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

test.describe("07.1-16 디자인 검토 증거 캡처", () => {
  test("증빙을 붙인 뒤 · 모두 뗀 뒤 다시 연 작성 중 지출결의 폼을 4폭에서 찍는다", async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    const fx = await setupExpenseE2E();
    const manager = await createIntakeManager("캡처경영");
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id], fields: { note: "행사 운영비" } });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
    await saveExpenseDraft(fx.pm.viewer, { expenseId, expectedVersion: 1, fields: { evidenceDate: "2026-10-20" } });
    const linkId = await insertLinkFixture({ recordId: await insertRecordFixture(manager, { issuedOn: "2026-10-05" }), ownerId: expenseId, attachMode: "author", attachedBy: fx.pm.viewer.id });
    const page = await loginPage(browser, baseURL, fx.pm);

    const shoot = async (name: string) => {
      const rows: unknown[] = [];
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.goto(`/expenses/${expenseId}`);
        const save_ = page.getByRole("button", { name: /^임시 저장/ });
        await waitForHydration(save_);
        await expect(save_).toBeVisible();
        await capture(page, name, viewport.width);
        rows.push(await measureState(page, viewport.width));
      }
      save(name, rows);
    };

    await shoot("evidence-attached");
    await detachOwnEvidence(fx.pm.viewer, { linkId, reason: "다른 건 증빙" });
    await shoot("evidence-detached");
    await page.context().close();
  });
});
