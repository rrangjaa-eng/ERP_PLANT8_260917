import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { runSeed } from "../../scripts/codex-design-review/seeds";
import { measurePhoneRows } from "./helpers/phone-rows";
import { loginAsAdmin } from "./people-list-helpers";

// 07.1-18 디자인 검토 증거 — 폰 표 행 두 줄(증빙 목록) · 사람 목록 320 표 폭(C-93)을 폭마다(375 · 320 · 768 · 1280) 전체 화면 PNG `state-<이름>-<폭>.png`와
// DOM 실측 `measurements-state-<이름>.json`으로 DESIGN_CAPTURE_DIR에 남긴다. 판정은 E2E와 독립 DOM 감사 몫 — 여기 단언은 상태에 닿았는지 보는 expect뿐이다.
// DESIGN_CAPTURE_DIR이 없으면(CI E2E) 건너뛴다. origin/main에도 있는 도우미 · 선택자만 쓴다(main 기준 같은 상태 캡처).

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.1-18)");

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

test.describe("07.1-18 디자인 검토 증거 캡처", () => {
  test("증빙 목록 — 폰 행 두 줄(375 · 320)과 PC 머리글(768 · 1280)", async ({ browser, baseURL, page }) => {
    test.setTimeout(300_000);
    const seeded = await runSeed("evidence-intake-filled", browser, baseURL);
    await page.goto("/login");
    await page.getByLabel("이메일").fill(seeded.viewer.email);
    await page.getByLabel("비밀번호").fill(seeded.viewer.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    const rows: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/expenses/evidence");
      const table = page.locator("table").first();
      await expect(table).toBeVisible();
      await shoot(page, "evidence-list", viewport.width);
      const phone = viewport.width < 700;
      rows.push({
        width: viewport.width,
        rowShape: phone ? await measurePhoneRows(page.locator("table[data-row-sheet]")) : null,
        headerHeight: await table.locator("thead tr").first().evaluate((tr) => tr.getBoundingClientRect().height),
        overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      });
    }
    save("evidence-list", rows);
  });

  test("사람 목록 — 폭마다 표 오른쪽 끝과 문서 넘침(C-93)", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAsAdmin(page);
    const rows: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/admin/people");
      const table = page.locator("table").first();
      await expect(table).toBeVisible();
      await shoot(page, "people-list", viewport.width);
      rows.push(
        await page.evaluate(() => {
          const table = document.querySelector("table")!;
          const search = document.querySelector<HTMLElement>("input[type=search], input[name=q]");
          return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            tableWidth: table.getBoundingClientRect().width,
            tableRight: table.getBoundingClientRect().right,
            searchRight: search ? search.getBoundingClientRect().right : null,
          };
        }).then((measured) => ({ width: viewport.width, ...measured })),
      );
    }
    save("people-list", rows);
  });
});
