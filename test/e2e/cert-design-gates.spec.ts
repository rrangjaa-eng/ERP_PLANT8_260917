import { test, expect, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createFixtureUser } from "./fixtures";
import { seedSubmittedCert, type SeedSubmittedCertResult } from "./helpers/cert";
import { PANEL_ROUTES, cleanupPanelRouteFixtures, createPanelRouteFixtures, openPanelRoute, routeAvailability } from "./panel-routes";
import { measureTypeHierarchy } from "./type-hierarchy";

// 04.6-29 Task 2 (Q5) — 확인증 화면의 설계 게이트. 이름에 `cert`가 들어 `CERT_SPEC_PATTERN`이라 `certs` 프로젝트(기능 스위치 켜짐)에서만 돈다 — 데스크톱 스펙
// (design-principles · a11y · type-hierarchy)은 이 화면들을 「certs 프로젝트에서 잰다」 주석으로 건너뛰고 여기서 잰다.
// 다섯 자리: 행사 목록 `/certs/events` · `events-new` 패널 · 행사 상세 · 확인증 정정 · 로그아웃 `/c/<token>` — 각각 axe(규칙 끄기 없음) · 글자 위계 ·
// 폭 320/768 문서 가로 넘침 0. 원칙 막는 모드는 04.6-24 `principles-certs.spec.ts`가 이미 잰다(같은 측정을 두 번 하지 않는다).
// 픽스처 이름은 `seedSubmittedCert`(행사 · 제출 · 토큰)와 `패널라우트표` 접두(PANEL_ROUTES 표)를 쓴다 — 다른 cert 스펙과 겹치지 않는다.

let seeded: SeedSubmittedCertResult;
let adminCredentials: { email: string; password: string };

test.beforeAll(async () => {
  seeded = await seedSubmittedCert();
  adminCredentials = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
});

test.afterAll(async () => {
  await cleanupPanelRouteFixtures();
});

async function loginAdmin(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(adminCredentials.email);
  await page.getByLabel("비밀번호").fill(adminCredentials.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

function formatViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]): string {
  return violations.map((v) => `[${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.nodes.length}곳) — ${v.helpUrl}`).join("\n");
}

// 한 자리를 axe · 위계로 잰다(현재 폭). `/c/<token>`만 산문 크기를 본문 자리에, 제목 크기를 자기 틀의 `h1`에 허용한다(`app/c/**` — 공통 §4 Q7).
async function expectAxeAndHierarchy(page: Page, label: string, opts: { external: boolean }): Promise<void> {
  // 규칙 비활성(disableRules)·범위 축소 없이 기본 규칙 전체로 돈다.
  const results = await new AxeBuilder({ page }).analyze();
  expect.soft(results.violations, `${label} axe\n${formatViolations(results.violations)}`).toEqual([]);
  const { violations, textRuns } = await measureTypeHierarchy(page, opts);
  expect.soft(violations.map((v) => `${v.rule} ${v.detail}`), `${label} 글자 위계`).toEqual([]);
  expect.soft(textRuns, `${label} 훑은 글자 요소`).toBeGreaterThan(0);
}

async function overflowOf(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
}

// 폭 320과 768의 문서 가로 넘침 0. `reopen`은 폭을 바꾼 뒤 같은 화면(패널 열린 상태 포함 — D19)을 다시 연다.
async function expectNoOverflowAt(page: Page, label: string, reopen: () => Promise<void>): Promise<void> {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await reopen();
    const { scrollWidth, clientWidth } = await overflowOf(page);
    expect.soft(scrollWidth, `${label} 폭 ${width} 가로 넘침`).toBeLessThanOrEqual(clientWidth);
  }
}

async function gotoOk(page: Page, url: string): Promise<void> {
  const response = await page.goto(url);
  // 기능이 켜진 이 프로젝트에서 응답 ≥400은 실패다(건너뜀으로 읽지 않는다).
  expect(response?.status() ?? 0, `${url} 응답`).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
}

test("확인증 행사 목록 /certs/events — axe · 글자 위계 · 320/768", async ({ page }) => {
  await loginAdmin(page);
  await gotoOk(page, "/certs/events");
  await expectAxeAndHierarchy(page, "/certs/events", { external: false });
  await expectNoOverflowAt(page, "/certs/events", () => gotoOk(page, "/certs/events"));
});

test("events-new 패널(QR 생성 신청) — axe · 글자 위계 · 320/768(768은 패널 열린 상태, D19)", async ({ page }) => {
  const route = PANEL_ROUTES.find((r) => r.id === "events-new");
  if (!route) throw new Error("PANEL_ROUTES에 events-new 행이 없다");
  // `certs` 프로젝트에서는 「잼」이어야 한다 — 건너뜀이면 04.3 라우트 파일이 없는 것이라 실패다(조용히 빠지지 않는다).
  expect(routeAvailability(route, test.info().project.name), "events-new 판정").toEqual({ measure: true });
  const fixtures = await createPanelRouteFixtures();
  await loginAdmin(page);
  await openPanelRoute(page, route, fixtures);
  await expectAxeAndHierarchy(page, "events-new", { external: false });
  await expectNoOverflowAt(page, "events-new", () => openPanelRoute(page, route, fixtures));
});

test("행사 상세 /certs/events/<id> — axe · 글자 위계 · 320/768", async ({ page }) => {
  const url = `/certs/events/${seeded.eventId}`;
  await loginAdmin(page);
  await gotoOk(page, url);
  await expectAxeAndHierarchy(page, url, { external: false });
  await expectNoOverflowAt(page, url, () => gotoOk(page, url));
});

test("확인증 정정 /certs/submissions/<id> — axe · 글자 위계 · 320/768", async ({ page }) => {
  const url = `/certs/submissions/${seeded.submissionId}`;
  await loginAdmin(page);
  await gotoOk(page, url);
  await expectAxeAndHierarchy(page, url, { external: false });
  await expectNoOverflowAt(page, url, () => gotoOk(page, url));
});

test("외부 수령자 /c/<token> (로그아웃) — axe · 글자 위계(산문·자체 제목 허용) · 320/768", async ({ page }) => {
  const url = `/c/${seeded.token}`;
  await page.context().clearCookies();
  await gotoOk(page, url);
  await expectAxeAndHierarchy(page, url, { external: true });
  await expectNoOverflowAt(page, url, () => gotoOk(page, url));
});
