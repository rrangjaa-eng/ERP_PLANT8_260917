import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecords } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { setRecordVisibilityFixture } from "@/test/integration/fixtures/evidence";
import { createFixtureUser } from "./fixtures";
import { addLotteCard, attachRecordFixture, clearEvidence, EVIDENCE_COL, evidenceCell, evidenceRows, focusGridCell, loginIntake, lotteLines, registerFile } from "./helpers/evidence";

// 06.1-13 Task 4 ④ 캡처 쌍(비교 기록 — 판정에 쓰지 않는다). BASE worktree와 이 가지에서 같은 스펙을 돌려 4폭 PNG를 CAPTURE_DIR에 남긴다.
// BASE에도 있는 API만 쓴다(helpers/evidence는 BASE와 같다). 판정은 evidence-paste-audit.spec.ts의 DOM 실측이다.

const WIDTHS = [1280, 768, 375, 320] as const;
const DIR = process.env.CAPTURE_DIR ?? "test-results/evidence-paste-capture";

// 그림과 나란히 둘 DOM 사실(판정용) — 필터 줄 버튼 · 힌트 줄 · 합계 행 · dirty · 오류 칸 · 쇼케이스 표본 목록.
async function facts(page: Page, name: string, width: number): Promise<void> {
  const data = await page.evaluate(() => {
    const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    const main = document.querySelector("main");
    return {
      buttons: [...(main?.querySelectorAll("button") ?? [])].map((b) => text(b)).filter((t) => t !== "").slice(0, 40),
      hint: text(document.querySelector("[class*='hint']")),
      tfoot: [...document.querySelectorAll("tfoot")].map((t) => text(t)),
      dirty: document.querySelectorAll("td[class*='dirtyCell']").length,
      invalid: document.querySelectorAll('td[aria-invalid="true"]').length,
      galleries: [...document.querySelectorAll("[data-gallery]")].map((g) => g.getAttribute("data-gallery")),
      scroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    };
  });
  appendFileSync(join(DIR, "dom.jsonl"), `${JSON.stringify({ name, width, ...data })}\n`);
}

test.beforeEach(async () => {
  await clearEvidence();
});

test("캡처 — /expenses/evidence(시드 · 붙여넣기 뒤 ≥1024) · /dev/components 표 편집 구역 × 4폭", async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  const batchId = await registerFile(viewer, lotteFixture(lotteLines(card, 6)), "롯데_캡처.xls");
  const ids = (
    await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, batchId)).orderBy(asc(evidenceRecords.format), desc(evidenceRecords.issuedOn), asc(evidenceRecords.id))
  ).map((row) => row.id);
  for (const id of ids) await setRecordVisibilityFixture(id, { visibility: "private" });
  const [, , , needsCheck, attached] = ids;
  if (!needsCheck || !attached) throw new Error("증빙 줄 없음");
  await db.update(evidenceRecords).set({ needsCheck: "해외 이용 · 원화 확인" }).where(eq(evidenceRecords.id, needsCheck));
  await attachRecordFixture(attached, viewer.id);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/expenses/evidence?state=all");
    await expect(evidenceRows(page)).toHaveCount(6);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(DIR, `evidence-list-${width}.png`), fullPage: true });
    await facts(page, "evidence-list", width);
    if (width >= 1024) {
      await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
      await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.setData("text/plain", "미공개\n없는값\n기획1팀 공개\n기획1팀 공개\n미공개\n경영관리팀 공개");
        document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(DIR, `evidence-pasted-${width}.png`), fullPage: true });
      await facts(page, "evidence-pasted", width);
    }
  }

  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  const context = await page.context().browser()?.newContext();
  if (!context) throw new Error("브라우저 없음");
  const showcase = await context.newPage();
  await showcase.goto("/login");
  await showcase.getByLabel("이메일").fill(user.email);
  await showcase.getByLabel("비밀번호").fill(user.password);
  await showcase.getByRole("button", { name: "로그인" }).click();
  await expect(showcase).toHaveURL(/\/account$/);
  for (const width of WIDTHS) {
    await showcase.setViewportSize({ width, height: 900 });
    await showcase.goto("/dev/components");
    const section = showcase.locator("section").filter({ has: showcase.locator('[data-gallery="table-edit"]') }).last();
    await expect(section).toHaveCount(1);
    await showcase.waitForTimeout(500);
    await section.screenshot({ path: join(DIR, `showcase-table-edit-${width}.png`) });
    await facts(showcase, "showcase", width);
  }
  await context.close();
});
