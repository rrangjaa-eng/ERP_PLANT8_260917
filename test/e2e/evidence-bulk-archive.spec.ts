import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import type { Viewer } from "@/domain/viewer";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import {
  addLotteCard,
  attachRecordFixture,
  bumpRecordVersion,
  EVIDENCE_COL,
  evidenceCell,
  evidenceTable,
  focusGridCell,
  loginIntake,
  lotteLines,
  precedes,
  recordIdsOf,
  registerFile,
} from "./helpers/evidence";
import { waitForHydration } from "./leave-org";

// 07.2-09(X1 · D-7281~7284 · DC-8 · UI-SPEC S23) — 증빙 목록 다중 선택 보관 · 한 번 되돌리기. 판정은 CI=true 프로덕션 빌드의 DOM 실측으로 한다.
// 증빙 표를 비우지 않는다 — 모든 케이스가 `?batch=` 묶음 보기로 자기 줄만 본다(다른 스펙의 기록과 섞이지 않는다).

test.setTimeout(120_000);

type Seed = { viewer: Viewer; batchId: string; ids: string[]; url: string };

async function seed(page: Page, count: number): Promise<Seed> {
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  const batchId = await registerFile(viewer, lotteFixture(lotteLines(card, count)), "롯데_일괄보관.xls");
  return { viewer, batchId, ids: await recordIdsOf(batchId), url: `/expenses/evidence?state=all&batch=${batchId}` };
}

function rowBoxes(page: Page): Locator {
  return evidenceTable(page).locator('tbody input[type="checkbox"]');
}

function status(page: Page): Locator {
  return page.locator('p[aria-live="polite"]').filter({ hasText: /보관|되돌림/ });
}

function bar(page: Page): Locator {
  return page.getByRole("group", { name: "고른 증빙" });
}

async function open(page: Page, url: string, rows: number): Promise<void> {
  await page.goto(url);
  await expect(rowBoxes(page)).toHaveCount(rows);
  await waitForHydration(rowBoxes(page).first());
}

// 로그인한 세션을 새 문맥(JS 끔 · 터치 등)으로 옮긴다.
async function contextLike(browser: Browser, page: Page, baseURL: string | undefined, options: Parameters<Browser["newContext"]>[0]) {
  const context = await browser.newContext({ ...options, baseURL, storageState: await page.context().storageState() });
  return { context, page: await context.newPage() };
}

test.describe("증빙 일괄 보관 (07.2-09)", () => {
  test("두 건 선택 → 보관 2 → 필터 줄 결과 글자 → 되돌리기로 둘 다 복귀 · 확인 창 0 · 화면 1차는 공개 범위 저장 하나", async ({ page }) => {
    const { url } = await seed(page, 3);
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, url, 3);

    await rowBoxes(page).nth(0).check();
    await rowBoxes(page).nth(1).check();
    await expect(bar(page).getByText("선택 2건")).toBeVisible();
    const archive = bar(page).getByRole("button", { name: "보관 2" });
    // 막대 버튼은 2차 — 단축키 없음. 1차는 기존 `공개 범위 저장 Ctrl+S` 하나뿐.
    await expect(archive.locator("kbd")).toHaveCount(0);
    await expect(archive).not.toHaveAttribute("aria-keyshortcuts", /.+/);
    await expect(page.getByRole("button", { name: /^공개 범위 저장/ })).toHaveCount(1);

    await archive.click();
    await expect(status(page)).toContainText(/^\d{2}:\d{2} 보관 2건/, { timeout: 30_000 });
    await expect(rowBoxes(page)).toHaveCount(1);
    // 결과 글자는 필터 줄 안(필터 칸과 같은 줄)이고 막대 안이 아니다.
    await expect(bar(page)).toHaveCount(0);
    expect(await precedes(page.getByLabel("상태"), status(page))).toBe(true);
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    await status(page).getByRole("button", { name: /^되돌리기/ }).click();
    await expect(status(page)).toContainText("되돌림 2건", { timeout: 30_000 });
    await expect(rowBoxes(page)).toHaveCount(3);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });

  test("공개 범위 칸을 고친 채 → 보관 N은 aria-disabled + `저장 안 한 칸 · 먼저 저장`", async ({ page }) => {
    const { url } = await seed(page, 2);
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, url, 2);
    await rowBoxes(page).nth(0).check();
    const archive = bar(page).getByRole("button", { name: "보관 1" });
    await expect(archive).not.toHaveAttribute("aria-disabled", "true");

    await focusGridCell(evidenceCell(page, 1, EVIDENCE_COL.visibility));
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "공개", exact: true }).selectOption({ label: "미공개" });

    await expect(archive).toHaveAttribute("aria-disabled", "true");
    await expect(bar(page).getByText("저장 안 한 칸 · 먼저 저장")).toBeVisible();
    // aria-disabled 버튼은 눌려도 아무 일이 없다(탭 순서에는 남는다).
    await archive.click({ force: true });
    await expect(status(page)).toHaveCount(0);
    await expect(rowBoxes(page)).toHaveCount(2);
  });

  test("5건 중 1건 붙음 → 붙은 줄 aria-disabled + 이유 · 4건 보관 · 그새 바뀐 1건은 막힘으로 자리 유지 + 첫 막힌 체크박스 포커스", async ({ page }) => {
    const { viewer, ids, url } = await seed(page, 5);
    const [attached, stale] = [ids[0] as string, ids[4] as string];
    await attachRecordFixture(attached, viewer.id);
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, url, 5);

    const table = evidenceTable(page);
    const attachedRow = table.locator("tbody tr", { has: page.locator('input[aria-disabled="true"]') });
    await expect(attachedRow.locator('input[type="checkbox"]')).toHaveAttribute("aria-disabled", "true");
    await expect(attachedRow.getByText("붙은 문서 있음 · 먼저 떼기")).toBeVisible();

    await table.getByRole("checkbox", { name: "이 쪽 전체 고르기" }).check();
    await expect(bar(page).getByText("선택 4건")).toBeVisible();
    await bumpRecordVersion(stale);
    await bar(page).getByRole("button", { name: "보관 4" }).click();

    await expect(status(page)).toContainText(/^\d{2}:\d{2} 보관 3건 · 막힘 1건/, { timeout: 30_000 });
    await expect(rowBoxes(page)).toHaveCount(2);
    await expect(table.getByText(/^다른 사람이 .+ 바꿈 · 새로 고침$/)).toBeVisible();
    // 막힌 줄은 자리를 유지하고 포커스는 그 줄 체크박스(첫 막힌 줄).
    // 이유는 그 줄 바로 아래 이유 줄(`tr`)에 서므로 이유 줄의 앞 형제가 막힌 줄이다.
    const staleBox = table
      .locator("tbody tr", { has: page.getByText(/^다른 사람이 .+ 바꿈 · 새로 고침$/) })
      .locator("xpath=preceding-sibling::tr[1]")
      .locator('input[type="checkbox"]');
    await expect(staleBox).toBeFocused();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });

  test("전체 실패(서버 액션 POST 끊김) → 같은 자리 `보관 실패 · 다시 시도`", async ({ page }) => {
    const { url } = await seed(page, 2);
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, url, 2);
    await rowBoxes(page).nth(0).check();
    await page.route("**/expenses/evidence**", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await bar(page).getByRole("button", { name: "보관 1" }).click();
    await expect(status(page)).toContainText("보관 실패 · 다시 시도");
    await expect(rowBoxes(page)).toHaveCount(2);
  });

  test("?batch= 120건 → 머리글 전체 고르기 50 → 묶음 전체 고르기 120 → 보관 120 → 되돌리기", async ({ page }) => {
    test.setTimeout(240_000);
    const { url } = await seed(page, 120);
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, url, 50);

    await evidenceTable(page).getByRole("checkbox", { name: "이 쪽 전체 고르기" }).check();
    await expect(bar(page).getByText("선택 50건")).toBeVisible();
    await bar(page).getByRole("button", { name: "묶음 전체 고르기 120" }).click();
    await expect(bar(page).getByText("선택 120건")).toBeVisible();
    await expect(bar(page).getByRole("button", { name: /^묶음 전체 고르기/ })).toHaveCount(0);

    await bar(page).getByRole("button", { name: "보관 120" }).click();
    await expect(status(page)).toContainText(/^\d{2}:\d{2} 보관 120건/, { timeout: 90_000 });
    await expect(rowBoxes(page)).toHaveCount(0);
    await status(page).getByRole("button", { name: /^되돌리기/ }).click();
    await expect(status(page)).toContainText("되돌림 120건", { timeout: 90_000 });
    await expect(rowBoxes(page)).toHaveCount(50);
  });

  test("?batch= 301건 → 묶음 전체 고르기는 비활성 + `300건까지`", async ({ page }) => {
    const { url } = await seed(page, 301);
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, url, 50);
    await evidenceTable(page).getByRole("checkbox", { name: "이 쪽 전체 고르기" }).check();
    const pickAll = bar(page).getByRole("button", { name: "묶음 전체 고르기" });
    await expect(pickAll).toHaveAttribute("aria-disabled", "true");
    await expect(bar(page).getByText("300건까지")).toBeVisible();
    await pickAll.click({ force: true });
    await expect(bar(page).getByText("선택 50건")).toBeVisible();
  });

  for (const width of [1023, 768, 375, 320]) {
    test(`${width}px — 선택 열 · 막대 · 화면 1차 없음 · 가로 넘침 0`, async ({ page }) => {
      const { url } = await seed(page, 3);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await expect(evidenceTable(page)).toBeVisible();
      await expect(page.locator('input[type="checkbox"]:visible')).toHaveCount(0);
      await expect(bar(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^공개 범위 저장/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^보관 \d/ })).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("375px 첫 화면(JS 없이 서버가 준 HTML)부터 선택 열이 가려져 있다", async ({ page, browser, baseURL }) => {
    const { url } = await seed(page, 3);
    const noScript = await contextLike(browser, page, baseURL, { viewport: { width: 375, height: 800 }, javaScriptEnabled: false });
    await noScript.page.goto(url);
    await expect(noScript.page.locator('input[type="checkbox"]')).not.toHaveCount(0);
    await expect(noScript.page.locator('input[type="checkbox"]:visible')).toHaveCount(0);
    await noScript.context.close();
  });

  test("1024 · 1280 — 막대 한 줄(버튼 오른쪽) · 선택 열 가시", async ({ page }) => {
    const { url } = await seed(page, 2);
    for (const width of [1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page, url, 2);
      await expect(rowBoxes(page).first()).toBeVisible();
      await rowBoxes(page).first().check();
      const box = await bar(page).boundingBox();
      const archive = await bar(page).getByRole("button", { name: "보관 1" }).boundingBox();
      const count = await bar(page).getByText("선택 1건").boundingBox();
      if (!box || !archive || !count) throw new Error("막대 측정 실패");
      expect(box.height).toBeLessThan(80);
      expect(archive.x).toBeGreaterThan(count.x);
      expect(archive.x + archive.width).toBeLessThanOrEqual(box.x + box.width + 1);
    }
  });

  test("키보드만(1280) — 막대 버튼이 표 앞 · Space로 고른 뒤 Shift+Tab 두 번 → 보관 N → Enter · 표 안 Ctrl+Enter는 보관 0", async ({ page }) => {
    const { url } = await seed(page, 3);
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, url, 3);

    await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.counterparty));
    await page.keyboard.press("Space");
    await expect(bar(page).getByText("선택 1건")).toBeVisible();
    expect(await precedes(bar(page).getByRole("button", { name: "보관 1" }), evidenceTable(page))).toBe(true);

    // 표 안 Ctrl+Enter는 보관하지 않는다(단축키 없음 — 화면 1차는 Ctrl+S 저장).
    await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.counterparty));
    await page.keyboard.press("Control+Enter");
    await expect(status(page)).toHaveCount(0);
    await expect(rowBoxes(page)).toHaveCount(3);

    await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.counterparty));
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("checkbox", { name: "이 쪽 전체 고르기" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "보관 1" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status(page)).toContainText(/^\d{2}:\d{2} 보관 1건/, { timeout: 30_000 });
    await expect(rowBoxes(page)).toHaveCount(2);
  });

  test("터치 포인터(1024 가로 태블릿) — 체크박스 라벨 44×44 · 겹침 0", async ({ page, browser, baseURL }) => {
    const { url } = await seed(page, 3);
    const touch = await contextLike(browser, page, baseURL, { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
    await touch.page.goto(url);
    await expect(rowBoxes(touch.page)).toHaveCount(3);
    await waitForHydration(rowBoxes(touch.page).first());
    expect(await touch.page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const rects = await touch.page.evaluate(() =>
      [...document.querySelectorAll('tbody td [class*="selectLabel"]')].map((label) => {
        const rect = label.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      }),
    );
    expect(rects).toHaveLength(3);
    for (const rect of rects) {
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    const sorted = [...rects].sort((a, b) => a.top - b.top);
    for (let i = 1; i < sorted.length; i += 1) expect((sorted[i] as (typeof rects)[number]).top).toBeGreaterThanOrEqual((sorted[i - 1] as (typeof rects)[number]).bottom - 0.5);
    const headerAfter = await touch.page.evaluate(() => {
      const label = document.querySelector('thead [class*="selectLabel"]');
      if (!label) return null;
      const after = getComputedStyle(label, "::after");
      return { width: parseFloat(after.width), height: parseFloat(after.height) };
    });
    expect(headerAfter?.width).toBeGreaterThanOrEqual(44);
    expect(headerAfter?.height).toBeGreaterThanOrEqual(44);
    await touch.context.close();
  });
});
