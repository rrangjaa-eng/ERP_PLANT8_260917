import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { collectPrinciplesSnapshot, evaluatePrinciples, isStrict, PRINCIPLE_SELECTORS } from "./design-principles";
import { checkPrinciples } from "./principles-check";
import {
  PANEL_ROUTES,
  cleanupPanelRouteFixtures,
  createPanelRouteFixtures,
  openPanelRoute,
  routeAvailability,
  type PanelRoute,
} from "./panel-routes";
import {
  SCREEN_ROUTES,
  createScreenFixtures,
  loginScreenAccount,
  resolveScreenRoute,
  screenAvailability,
  type ScreenAccount,
} from "./screen-routes";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor, setVendorHidden } from "@/repositories/vendors";
import { toKstDate } from "@/domain/holidays/business-day";

// 화면 사용성 원칙 자동 점검(사용자 결정 2026-09-28 → 04.6-29: 막는 모드가 기본). 위반은 실패다 — 경고 모드는 `DESIGN_PRINCIPLES_STRICT=0`일 때만
// (ROADMAP SC 5의 `=1`과 같은 효과). 라우트 = UI-SPEC 「화면 목록」 전 화면(`screen-routes.ts`) + 패널 라우트 표(`panel-routes.ts`의 `PANEL_ROUTES` — D20, 한 표) + 카나리.
// 제외: `/dev/components`(1차 버튼을 일부러 여럿 보임 — SC 5 · R11 · RESEARCH Open Question 3) · 인쇄 `/print/*`(스킨 대상 아님) ·
// cert 화면(기능 스위치라 `certs` 프로젝트에서만 열린다 — 원칙은 04.6-24 `principles-certs.spec.ts`가, axe·위계·320/768은 `cert-design-gates.spec.ts`가 잰다).
// 수집·판정(`isStrict` · `collectPrinciplesSnapshot` · `checkPrinciples` — 보임 판정 `[inert]` · `dialog:modal`)은 04.6-06 것을 그대로 쓴다.

const STRICT = isStrict(process.env.DESIGN_PRINCIPLES_STRICT);

test.afterAll(async () => {
  await cleanupPanelRouteFixtures();
});

// ⑩ 설정 힌트(사용자 답: 「그대로, 04.6-29에서 결정」 — `reviews`·04.6-20 SUMMARY 질문 후보). 결정 = 문구는 그대로, 규칙·임계값은 그대로, 설정 화면(`/admin/settings`)의 알려진
// 힌트 문장 열 개(경고 12줄)만 이름으로 허용하고 새 경고는 그대로 막는다(04.6-24 `principles-certs.spec.ts`의 문의 문장 허용과 같은 방식 — 힌트가 바뀌거나 늘면 이 단언이 깨져 다시 결정한다).
// 근거: 각 힌트는 칸의 `aria-describedby`로 이어진 칸 설명이고(ISSUE-001 보존 동작, 04.6-20 M16) 줄이면 문구 변경(UI-SPEC 「문구는 바꾸지 않는다」), 규칙을 줄이면 임계값 완화(eng 2.3)다.
const SETTINGS_ROUTE = "/admin/settings";
const SETTINGS_HINT_PREFIXES = [
  "가져오기는 명령줄로 합니다",
  "링크는 당첨일 00:00에 열리고",
  "새 외화 줄의 환율 칸 기본값입니다",
  "순번을 이 자릿수만큼 0으로 채웁니다",
  "여기서 고른 종류만 행동 로그에 남습니다",
  "켜면 지출결의에 매칭되지 않은 견적 줄이 있어도",
  "한 번의 알림 발송에서 새로 만드는 알림 수의 상한입니",
  "확인증 개인정보 화면에서 이 시간(분) 동안",
  "확인증 화면에 보일 문의 전화번호입니다",
  "환경 게이트가 켜져 있을 때만 이 설정으로",
];

const ACCOUNT_LABEL: Record<ScreenAccount, string> = { sysadmin: "시스템 관리자", drafter: "연차 기안자", anon: "로그아웃" };

for (const account of ["sysadmin", "drafter", "anon"] as const) {
  test(`화면 사용성 원칙(막는 모드) — 전 화면: ${ACCOUNT_LABEL[account]}`, async ({ page }) => {
    test.setTimeout(240_000);
    const fixtures = await createScreenFixtures();
    const routes: string[] = [];
    for (const route of SCREEN_ROUTES.filter((r) => r.as === account && r.principles !== false)) {
      const availability = screenAvailability(route, test.info().project.name);
      if (!availability.measure) {
        test.info().annotations.push({ type: "화면 건너뜀", description: `${route.id} — ${availability.note}` });
        continue;
      }
      routes.push(resolveScreenRoute(route, fixtures));
    }
    expect(routes.length, "잴 화면이 하나도 없다").toBeGreaterThan(0);
    await loginScreenAccount(page, fixtures, account);
    const settingsIndex = routes.indexOf(SETTINGS_ROUTE);
    if (settingsIndex >= 0) routes.splice(settingsIndex, 1);
    await checkPrinciples(page, routes, { strict: STRICT });
    if (settingsIndex >= 0) {
      // 수집만 한다(경고 모드로 부름) — 허용 밖 경고의 단언은 바로 아래에서 막는 모드로 한다.
      const collectOnly = false;
      const report = await checkPrinciples(page, [SETTINGS_ROUTE], { strict: collectOnly });
      const unexpected = report
        .flatMap((r) => r.warnings)
        .filter((w) => !(w.rule === "안내 문구 최소" && SETTINGS_HINT_PREFIXES.some((prefix) => w.detail.startsWith(`긴 설명 「${prefix}`))));
      if (STRICT) expect.soft(unexpected, `${SETTINGS_ROUTE} 허용 밖 경고`).toEqual([]);
    }
  });
}

// 패널이 열린 상태 — 행마다 하나의 테스트(`openPanelRoute`가 건너뛸 행을 `test.skip`으로 그 행만 빼므로 한 테스트에 묶지 않는다).
async function openPanelAsAdmin(page: Page, route: PanelRoute): Promise<void> {
  // 머지 판정은 라우트 파일 존재다(Q5) — 「머지 전」 · 「certs 프로젝트에서 잰다」는 주석을 남기고 그 행만 건너뛴다. 응답 404를 건너뜀으로 읽지 않는다.
  const availability = routeAvailability(route, test.info().project.name);
  if (!availability.measure) {
    test.info().annotations.push({ type: "패널 라우트 건너뜀", description: `${route.id} — ${availability.note}` });
    test.skip(true, `${route.id} — ${availability.note}`);
    return;
  }
  // 결재 시트는 폰 폭(< 700px)에만 있다 — 700px 이상은 문서 칸 링크 + 행 행동이라 열릴 패널이 없다(inbox-table.tsx `rowTap`). 그 행만 폰 폭으로 잰다.
  if (route.open === "approval-sheet") await page.setViewportSize({ width: 390, height: 844 });
  const [panel, screens] = await Promise.all([createPanelRouteFixtures(), createScreenFixtures()]);
  // approval-sheet 행은 결재자 계정으로 `openPanelRoute`가 직접 로그인한다 — 그 밖의 행은 시스템 관리자다.
  if (route.open !== "approval-sheet") await loginScreenAccount(page, screens, "sysadmin");
  await openPanelRoute(page, route, panel);
}

test.describe("패널 라우트 표(D20) — 열린 상태의 원칙", () => {
  for (const route of PANEL_ROUTES) {
    test(`화면 사용성 원칙(막는 모드) — 패널 ${route.id}`, async ({ page }) => {
      await openPanelAsAdmin(page, route);
      const snapshot = await page.evaluate(collectPrinciplesSnapshot, PRINCIPLE_SELECTORS);
      const warnings = evaluatePrinciples(snapshot);
      for (const w of warnings) test.info().annotations.push({ type: `원칙 경고 ${w.rule}`, description: `${route.id} — ${w.detail}` });
      if (STRICT) expect.soft(warnings, route.id).toEqual([]);
      // 패널이 열려 있으면 보이는 1차 버튼은 패널의 것 하나다(뒤는 inert — 보임 판정이 뺀다).
      expect.soft(snapshot.primaryButtons, `${route.id} 패널 1차 버튼`).toBe(1);
    });
  }

  test("PANEL_ROUTES 건너뜀은 파일 존재 판정이다 — 이유가 「머지 전」 · 「certs 프로젝트에서 잰다」뿐이다", () => {
    const project = test.info().project.name;
    for (const route of PANEL_ROUTES) {
      const availability = routeAvailability(route, project);
      if (availability.measure) continue;
      expect(availability.note, route.id).toMatch(/머지 전|certs 프로젝트에서 잰다/);
      test.info().annotations.push({ type: "패널 라우트 건너뜀", description: `${route.id} — ${availability.note}` });
    }
  });
});

// 카나리 — 선택자가 죽으면 즉시 실패한다(RESEARCH Pitfall 5). 거래처가 0건이면 DR5 A대로 머리 1차가 없으니 러너 안에서 거래처 1건을 먼저 만든다(P4).
test.describe("카나리 — 수집 훅이 살아 있다", () => {
  test("거래처 목록 1차 버튼 1 · ?new=1에서도 1(패널 것) · 상세에 screen-meta", async ({ page }) => {
    const fixtures = await createScreenFixtures();
    const stamp = randomUUID().slice(0, 8);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `원칙카나리-${stamp}`, normalizedName: `원칙카나리-${stamp}` });
    try {
      await loginScreenAccount(page, fixtures, "sysadmin");

      await page.goto("/admin/vendors");
      expect((await page.evaluate(collectPrinciplesSnapshot, PRINCIPLE_SELECTORS)).primaryButtons, "/admin/vendors 1차 버튼").toBe(1);
      await expect(page.locator('[data-ui="primary-button"]')).toHaveCount(1);

      await page.goto("/admin/vendors?new=1");
      await expect(page.locator("dialog:modal")).toHaveCount(1);
      expect((await page.evaluate(collectPrinciplesSnapshot, PRINCIPLE_SELECTORS)).primaryButtons, "?new=1 1차 버튼(패널 것만)").toBe(1);
      await expect(page.locator('dialog:modal [data-ui="primary-button"]')).toHaveCount(1);

      await page.goto(`/projects/${fixtures.projectId}`);
      await expect(page.locator('[data-ui="screen-meta"]')).toHaveCount(1);
      await expect(page.locator('[data-ui="screen-title"]')).toHaveCount(1);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});

// DR2 A — `.planning/phases/04.6-a/04.6-ANSWERS.md` (2026-10-01 답, 커밋 257e5ea2, 사용자 원문 「전부 추천대로」):
// 「그해 확정 전엔 「확정」이 1차, 확정 뒤엔 「추가」가 1차」. 확정 상태는 전역 DB 상태이고 `holidays.spec.ts`가 다음 해 확정을 되돌리며 병렬로 돈다 —
// 그래서 이 단언은 상태를 바꾸지 않고, 화면이 보인 상태(확정 버튼 유무)에 맞는 1차인지를 같은 순간의 DOM으로 가른다(두 해 상태를 만드는 단언은 holidays.spec.ts 몫).
test.describe("공휴일 1차 판정 (DR2 A)", () => {
  const THIS_YEAR = Number(toKstDate(new Date()).slice(0, 4));

  for (const year of [THIS_YEAR, THIS_YEAR + 1]) {
    test(`${year}년 — 확정 전이면 「${year}년 공휴일 확정」이 1차 · 확정 뒤면 「공휴일 추가」가 1차 (1차는 늘 하나)`, async ({ page }) => {
      const fixtures = await createScreenFixtures();
      await loginScreenAccount(page, fixtures, "sysadmin");
      await page.goto(`/admin/holidays?year=${year}`);
      const primaries = page.locator('[data-ui="primary-button"]');
      const confirmLabel = `${year}년 공휴일 확정`;
      const addLink = page.getByRole("link", { name: "공휴일 추가", exact: true });
      const hasConfirm = (await primaries.filter({ hasText: confirmLabel }).count()) > 0;
      test.info().annotations.push({ type: "공휴일 해 상태", description: `${year} — ${hasConfirm ? "확정 전" : "확정 뒤(또는 후보 없음)"}` });
      if (hasConfirm) {
        await expect(primaries).toHaveCount(1);
        await expect(primaries).toHaveText(confirmLabel);
        // 「공휴일 추가」는 2차 링크다.
        await expect(addLink).toHaveCount(1);
        await expect(addLink).not.toHaveAttribute("data-ui", "primary-button");
      } else {
        await expect(page.getByRole("button", { name: confirmLabel })).toHaveCount(0);
        await expect(primaries).toHaveCount(1);
        await expect(primaries).toHaveText("공휴일 추가");
      }
    });
  }

  test("holidays-new 행(패널 열림) — 1차는 패널 것 하나", async ({ page }) => {
    const route = PANEL_ROUTES.find((r) => r.id === "holidays-new");
    if (!route) throw new Error("PANEL_ROUTES에 holidays-new 행이 없다");
    await openPanelAsAdmin(page, route);
    const snapshot = await page.evaluate(collectPrinciplesSnapshot, PRINCIPLE_SELECTORS);
    expect(snapshot.primaryButtons).toBe(1);
    await expect(page.locator('dialog:modal [data-ui="primary-button"]')).toHaveCount(1);
  });
});
