import { test, expect, type Page } from "@playwright/test";
import { measureTypeHierarchy } from "./type-hierarchy";
import {
  PANEL_ROUTES,
  cleanupPanelRouteFixtures,
  createPanelRouteFixtures,
  openPanelRoute,
  routeAvailability,
} from "./panel-routes";
import { SCREEN_ROUTES, createScreenFixtures, loginScreenAccount, resolveScreenRoute, screenAvailability, type ScreenAccount } from "./screen-routes";

// 글자 위계(SC 7 · 04.6-29) — 화면마다 보이는 글자의 계산된 크기가 역할 토큰 값(제목·부제·본문·보조·태그·KPI) 밖에 없고, 제목 크기는 `[data-ui="screen-title"]`에만,
// 굵기는 `--fw-*` 값만이다. 라우트 = `screen-routes.ts` 전 화면(`/dev/components` 포함) + `PANEL_ROUTES`(D20 — `routeAvailability` 뒤 `openPanelRoute`).
// cert 화면 · `events-new` 행은 「certs 프로젝트에서 잰다」 주석으로 빠지고 `cert-design-gates.spec.ts`가 잰다(Q5). 수집·판정은 type-hierarchy.ts 도우미.

test.afterAll(async () => {
  await cleanupPanelRouteFixtures();
});

const ACCOUNT_LABEL: Record<ScreenAccount, string> = { sysadmin: "시스템 관리자", drafter: "연차 기안자", anon: "로그아웃" };

async function expectHierarchy(page: Page, label: string): Promise<number> {
  const { violations, textRuns } = await measureTypeHierarchy(page, { external: false });
  for (const v of violations) test.info().annotations.push({ type: `글자 위계 ${v.rule}`, description: `${label} — ${v.detail}` });
  expect.soft(violations.map((v) => `${v.rule} ${v.detail}`), `${label} 글자 위계`).toEqual([]);
  expect.soft(textRuns, `${label} 훑은 글자 요소`).toBeGreaterThan(0);
  return textRuns;
}

for (const account of ["sysadmin", "drafter", "anon"] as const) {
  test(`글자 위계 — 전 화면: ${ACCOUNT_LABEL[account]}`, async ({ page }) => {
    test.setTimeout(240_000);
    const fixtures = await createScreenFixtures();
    await loginScreenAccount(page, fixtures, account);
    let measured = 0;
    for (const route of SCREEN_ROUTES.filter((r) => r.as === account)) {
      const availability = screenAvailability(route, test.info().project.name);
      if (!availability.measure) {
        test.info().annotations.push({ type: "화면 건너뜀", description: `${route.id} — ${availability.note}` });
        continue;
      }
      const url = resolveScreenRoute(route, fixtures);
      const response = await page.goto(url);
      expect.soft(response?.status() ?? 0, `${url} 응답`).toBeLessThan(400);
      await page.waitForLoadState("networkidle");
      await expectHierarchy(page, url);
      measured += 1;
    }
    test.info().annotations.push({ type: "훑은 화면 수", description: `${account} ${measured}` });
    expect(measured, "잴 화면이 하나도 없다").toBeGreaterThan(0);
  });
}

// 카나리 — 수집기가 살아 있다(선택자 · 토큰 읽기가 죽어 항상 초록이 되는 일을 막는다). 화면에 일부러 어긋난 글자를 끼워 세 위반을 모두 잡는지 본다.
test("카나리 — 토큰 밖 크기 · 굵기와 틀 밖 제목 크기를 잡는다", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.evaluate(() => {
    const odd = document.createElement("p");
    odd.textContent = "카나리 글자";
    odd.style.fontSize = "17px";
    odd.style.fontWeight = "500";
    const title = document.createElement("p");
    title.textContent = "카나리 제목";
    title.style.fontSize = "var(--text-title)";
    document.body.append(odd, title);
  });
  const { violations } = await measureTypeHierarchy(page, { external: false });
  expect(violations.map((v) => v.rule).sort()).toEqual(["굵기 토큰 밖", "글자 크기 토큰 밖", "제목 크기는 틀만"]);
});

test.describe("패널 라우트 표(D20) — 열린 상태의 글자 위계", () => {
  for (const route of PANEL_ROUTES) {
    test(`글자 위계 — 패널 ${route.id}`, async ({ page }) => {
      const availability = routeAvailability(route, test.info().project.name);
      if (!availability.measure) {
        test.info().annotations.push({ type: "패널 라우트 건너뜀", description: `${route.id} — ${availability.note}` });
        test.skip(true, `${route.id} — ${availability.note}`);
        return;
      }
      // 결재 시트 행은 자기 폭으로 잰다 — 폰 390(아래 시트) · PC 1280(오른쪽 480 시트, DR4 A). 둘 다 문서 칸 button이 연다(inbox-table.tsx `rowTap`).
      if (route.open === "approval-sheet") await page.setViewportSize({ width: route.width ?? 390, height: 844 });
      const [panel, screens] = await Promise.all([createPanelRouteFixtures(), createScreenFixtures()]);
      if (route.open !== "approval-sheet") await loginScreenAccount(page, screens, "sysadmin");
      await openPanelRoute(page, route, panel);
      await expectHierarchy(page, route.id);
    });
  }
});
