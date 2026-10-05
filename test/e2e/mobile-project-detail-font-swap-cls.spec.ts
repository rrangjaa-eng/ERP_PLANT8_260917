import { test, expect } from "@playwright/test";
import { loginPage } from "./leave-org";
import { setupSettlementE2E } from "./settlement-fixture";

// 05-13 게이트 감사 D3: `/projects/[id]` 폰 320 첫 로드 CLS 0.225 간헐(팀장 · 대표, 정산 없음, 약 1/4~1/3 로드).
// 원인 = 머리 줄이 아니라 글꼴 교체다. Pretendard 동적 서브셋 요청은 글자가 처음 그려질 때(서버 렌더 본문이 드러난 뒤) 시작해
// 본문보다 늦게 도착하면 대체 글꼴 → Pretendard 교체로 기간 줄(글자 + 3차)과 견적 표 행의 줄바꿈이 바뀌어 아래가 움직인다.
// 고침: 앱 레이아웃이 자주 쓰는 서브셋을 문서와 함께 미리 받는다. 판정: 팀장 · 대표 각 10번 첫 로드(새 컨텍스트 · 글꼴 캐시 없음)
// 누적 레이아웃 이동 < 0.1. 간헐이라 한 번 통과로는 아무것도 증명하지 않는다 — 고치기 전 이 스펙은 20번 중 한 번도 안 깨질 확률이 0.1% 아래다.

const CLS_INIT = `
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
`;
const RUNS = 10;

test("프로젝트 상세 · 폰 320 · 첫 로드(글꼴 캐시 없음) CLS < 0.1 (팀장 · 대표 각 10번)", async ({ browser, baseURL }) => {
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
