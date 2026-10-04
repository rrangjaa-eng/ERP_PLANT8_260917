import { test, expect, type Page } from "@playwright/test";
import { collectPrinciplesSnapshot, evaluatePrinciples, PRINCIPLE_SELECTORS, type Warning } from "./design-principles";

// 화면 사용성 원칙 점검 도우미(04.6-06 · R11 · 공통 §10). 화면 플랜은 자기 스펙에서 `strict: isStrict(process.env.DESIGN_PRINCIPLES_STRICT)`로 부른다.
// 러너(`expect`·`test.info()`)는 이 파일에서만 import한다 — 순수 판정 파일(design-principles.ts)은 단위 테스트가 읽는다.
// 404를 건너뛰지 않는다(strict면 실패 · 아니면 주석). 「머지 전」·「certs 프로젝트에서 잰다」 건너뛰기는 호출부가 라우트 목록을 넘기기 전에 정한다.
export async function checkPrinciples(
  page: Page,
  routes: string[],
  opts: { strict: boolean },
): Promise<Array<{ route: string; warnings: Warning[] }>> {
  const report: Array<{ route: string; warnings: Warning[] }> = [];
  for (const route of routes) {
    const res = await page.goto(route);
    const status = res?.status() ?? 0;
    if (status === 0 || status >= 400) {
      // 열리지 않은 화면은 조용히 건너뛰지 않는다 — 경고로 남기고 막는 모드에서는 실패시킨다
      test.info().annotations.push({ type: "원칙 점검 건너뜀", description: `${route} — 응답 ${status}` });
      console.log(`  ${route} · 건너뜀 · 응답 ${status}`);
      if (opts.strict) expect.soft(status, `${route} 응답`).toBeLessThan(400);
      continue;
    }
    await page.waitForLoadState("networkidle");
    const warnings = evaluatePrinciples(await page.evaluate(collectPrinciplesSnapshot, PRINCIPLE_SELECTORS));
    report.push({ route, warnings });
    for (const w of warnings) test.info().annotations.push({ type: `원칙 경고 ${w.rule}`, description: `${route} — ${w.detail}` });
    if (opts.strict) expect.soft(warnings, route).toEqual([]);
  }
  const total = report.reduce((n, r) => n + r.warnings.length, 0);
  console.log(`[화면 사용성 원칙] 화면 ${report.length}개 · 경고 ${total}건${opts.strict ? " (막는 모드)" : " (경고만)"}`);
  for (const r of report) for (const w of r.warnings) console.log(`  ${r.route} · ${w.rule} · ${w.detail}`);
  expect(report.length, "점검한 화면이 하나도 없다").toBeGreaterThan(0);
  return report;
}
