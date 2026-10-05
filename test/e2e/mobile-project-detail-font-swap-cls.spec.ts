import { test, expect } from "@playwright/test";
import { loginPage } from "./leave-org";
import { setupSettlementE2E } from "./settlement-fixture";

// 05-13 게이트 감사 D3: `/projects/[id]` 폰 320 첫 로드 CLS 0.225 간헐(팀장 · 대표, 정산 없음).
// 원인 = Pretendard 동적 서브셋이 늦게 도착하는 첫 로드에서 기간 줄(글자 + 3차 「기간 바꾸기」)이 대체 글꼴로는 두 줄,
// Pretendard 도착 뒤에는 한 줄로 줄어 그 아래 전체가 29px 올라온다. 글꼴 도착 시각이 간헐의 변수라 글꼴 요청을 늦춰 항상 재현한다.
// 판정: 글꼴이 늦게 와도(1.5초) 첫 로드 누적 레이아웃 이동 < 0.1, 팀장 · 대표 각 10번.

const CLS_INIT = `
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
`;
const FONT_DELAY_MS = 1500;
const RUNS = 10;

test("프로젝트 상세 · 폰 320 · 글꼴이 늦게 와도 첫 로드 CLS < 0.1 (팀장 · 대표 각 10번)", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const fx = await setupSettlementE2E();
  const viewport = { width: 320, height: 568 };
  const results: Record<string, number[]> = {};
  for (const [key, person] of [["팀장", fx.lead], ["대표", fx.ceo]] as const) {
    const first = await loginPage(browser, baseURL, person, viewport);
    const state = await first.context().storageState();
    await first.context().close();
    results[key] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const context = await browser.newContext({ baseURL, viewport, storageState: state });
      const page = await context.newPage();
      await page.addInitScript(CLS_INIT);
      await page.route("**/fonts/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, FONT_DELAY_MS));
        await route.continue();
      });
      await page.goto(`/projects/${fx.projectId}`);
      await expect(page.getByRole("heading", { level: 1, name: fx.projectName })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(() => document.fonts.status === "loaded");
      const cls = await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return (window as unknown as { __cls: number }).__cls;
      });
      results[key].push(cls);
      await context.close();
    }
  }
  for (const [key, values] of Object.entries(results)) {
    expect(Math.max(...values), `${key} CLS ${values.map((value) => value.toFixed(4)).join(" ")}`).toBeLessThan(0.1);
  }
});
