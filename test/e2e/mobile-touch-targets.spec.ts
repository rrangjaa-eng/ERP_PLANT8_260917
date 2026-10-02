import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createProject } from "@/domain/projects";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { kstToday } from "@/lib/kst-date";

// quick 260929-npq — 04-UI-REVIEW 지적 1·3. SYSTEM §3 폰 터치 목표 44×44 · UI-SPEC `--touch-min`.
// 프로젝트 상세 머리 줄 「상태 바꾸기」·「더보기」와 목록 정렬 머리글 「프로젝트명」·「견적」이 폰 375·320에서 44×44 이상,
// PC 1280·경계 700 치수는 그대로(폰 미디어 쿼리 밖으로 규칙이 새지 않음). 파일명 mobile- 접두 → mobile-375 프로젝트.
// quick 260930-4xr · 사용자 2026-09-30 폰 40px 3개 → 44: 머리 줄 1차 「일괄 저장」과 펼친 「복사해 새 차수」·「프로젝트 복사」.
const TOUCH_MIN = 44;
const WIDTHS_PHONE = [375, 320] as const;
const WIDTHS_PC = [1280, 700] as const;

// PC 정렬 머리글 링크 높이(수정 전 실측 · 가드). 폭 1280·700 각각.
const PC_SORT_LINK_HEIGHT: Record<(typeof WIDTHS_PC)[number], { name: number; quote: number }> = {
  1280: { name: 19.19, quote: 19.19 },
  700: { name: 19.19, quote: 19.19 },
};

type Credentials = { email: string; password: string };
type Seed = { lead: Credentials; pm: Credentials; admin: Credentials; projectId: string; projectName: string };
let seed: Seed;

test.beforeAll(async () => {
  const today = kstToday(new Date());
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const makeAccount = async (roleId: string) => {
    const email = `e2e-${randomUUID()}@example.test`;
    const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E Employee", roleId });
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: today });
    return { userId, email, password: tempPassword };
  };
  const lead = await makeAccount(TEAM_LEAD_ROLE_ID);
  const pm = await makeAccount(DEFAULT_ROLE_ID);
  const admin = await makeAccount(SYSADMIN_ROLE_ID);
  const vendor = await insertVendor(SYSTEM_VIEWER, {
    name: `E2E터치클라이언트-${randomUUID()}`,
    normalizedName: `e2e터치클라이언트-${randomUUID()}`,
  });
  const projectName = `E2E터치-${randomUUID().slice(0, 8)}`;
  const project = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: team.id,
    pmUserId: pm.userId,
    name: projectName,
    startDate: null,
    endDate: null,
  });
  seed = {
    lead: { email: lead.email, password: lead.password },
    pm: { email: pm.email, password: pm.password },
    admin: { email: admin.email, password: admin.password },
    projectId: project.id,
    projectName,
  };
});

// 「상태 바꾸기」는 팀장 이상, 머리 줄 「더보기」(복사·차수 묶음)는 프로젝트 쓰기 권한(담당 PM)이 있어야 그려진다.
async function login(page: Page, who: Credentials) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(who.email);
  await page.getByLabel("비밀번호").fill(who.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function box(locator: Locator, label: string) {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`${label}: bounding box 없음`);
  return b;
}

async function expectNoOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect.soft(scrollWidth, `${label} 가로 넘침`).toBeLessThanOrEqual(clientWidth);
}

// 폰 하단 탭에도 「더보기」가 있어 머리 줄 버튼은 main 안으로 좁힌다.
function detailButtons(page: Page) {
  const main = page.getByRole("main");
  return {
    status: main.getByRole("button", { name: "상태 바꾸기", exact: true }),
    more: main.getByRole("button", { name: "더보기", exact: true }),
  };
}

function sortLinks(page: Page) {
  const head = (name: string) => page.locator("thead").getByRole("columnheader", { name, exact: true });
  return {
    name: { cell: head("프로젝트명"), link: head("프로젝트명").getByRole("link") },
    quote: { cell: head("견적"), link: head("견적").getByRole("link") },
  };
}

function listUrl() {
  return `/projects?q=${encodeURIComponent(seed.projectName)}`;
}

test.describe("폰 터치 목표 44 (quick 260929-npq · 04-UI-REVIEW 지적 1·3)", () => {
  test("폰 상세 머리 줄 「상태 바꾸기」·「더보기」 — 375·320에서 44×44 이상, 가로 넘침 없음", async ({ page }) => {
    for (const [who, pick] of [[seed.lead, "status"], [seed.pm, "more"]] as const) {
      await login(page, who);
      for (const width of WIDTHS_PHONE) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/projects/${seed.projectId}`);
        const locator = detailButtons(page)[pick];
        const label = pick === "status" ? "상태 바꾸기" : "더보기";
        await expect(locator).toBeVisible();
        const b = await box(locator, `${label} @${width}`);
        expect.soft(b.height, `${label} @${width} 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
        expect.soft(b.width, `${label} @${width} 폭`).toBeGreaterThanOrEqual(TOUCH_MIN);
        await expectNoOverflow(page, `상세 ${label} @${width}`);
      }
    }
  });

  test("폰 목록 정렬 머리글 「프로젝트명」·「견적」 — 375·320에서 44×44 이상 · 머리글 셀 높이를 채움, 가로 넘침 없음", async ({ page }) => {
    await login(page, seed.lead);
    for (const width of WIDTHS_PHONE) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(listUrl());
      const links = sortLinks(page);
      for (const [label, { cell, link }] of [["프로젝트명", links.name], ["견적", links.quote]] as const) {
        await expect(link).toBeVisible();
        const lb = await box(link, `${label} 링크 @${width}`);
        const cb = await box(cell, `${label} 머리글 셀 @${width}`);
        expect.soft(lb.height, `${label} @${width} 링크 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
        expect.soft(lb.width, `${label} @${width} 링크 폭`).toBeGreaterThanOrEqual(TOUCH_MIN);
        expect.soft(cb.height - lb.height, `${label} @${width} 셀−링크 높이`).toBeLessThanOrEqual(2.5);
      }
      await expectNoOverflow(page, `목록 @${width}`);
    }
  });

  test("폰 상세 머리 줄 「일괄 저장」·「복사해 새 차수」·「프로젝트 복사」 — 375·320에서 44×44 이상, 가로 넘침 없음", async ({ page }) => {
    await login(page, seed.pm);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/projects/${seed.projectId}`);
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "더보기", exact: true }).click();
    const copyRevision = main.getByRole("button", { name: "복사해 새 차수", exact: true });
    const copyProject = main.getByRole("link", { name: "프로젝트 복사", exact: true });
    await expect(copyRevision).toBeVisible();
    await expect(copyProject).toBeVisible();
    // 기간 칸을 바꿔 1차 「일괄 저장」을 띄운다(quote-edit-scope (l) 선례).
    await page.locator("#period-open").click();
    await page.locator("#period-end").fill(kstToday(new Date()));
    const save = main.getByRole("button", { name: /일괄 저장/ });
    await expect(save).toBeVisible();

    for (const width of WIDTHS_PHONE) {
      await page.setViewportSize({ width, height: 800 });
      for (const [label, locator] of [["일괄 저장", save], ["복사해 새 차수", copyRevision], ["프로젝트 복사", copyProject]] as const) {
        const b = await box(locator, `${label} @${width}`);
        expect.soft(b.height, `${label} @${width} 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
        expect.soft(b.width, `${label} @${width} 폭`).toBeGreaterThanOrEqual(TOUCH_MIN);
      }
      await expectNoOverflow(page, `상세 일괄 저장·복사 @${width}`);
    }

    // 04.6-08 스킨 A — 1·2차 버튼(링크 모양 포함) 모서리는 --radius-control이고 1차만 원칙 점검 훅을 단다.
    const radius = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--radius-control").trim());
    for (const [label, locator] of [["일괄 저장", save], ["복사해 새 차수", copyRevision], ["프로젝트 복사", copyProject]] as const) {
      await expect.soft(locator, `${label} 모서리`).toHaveCSS("border-top-left-radius", radius);
    }
    await expect.soft(save, "1차 훅").toHaveAttribute("data-ui", "primary-button");
    await expect.soft(copyRevision, "2차는 훅 없음").not.toHaveAttribute("data-ui", "primary-button");
  });

  test("PC 1280·경계 700 — 「상태 바꾸기」·「일괄 저장」 높이 32 · 「더보기」 없음 · 정렬 머리글 높이 그대로", async ({ page }) => {
    for (const width of WIDTHS_PC) {
      await login(page, seed.lead);
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/projects/${seed.projectId}`);
      const status = detailButtons(page).status;
      await expect(status).toBeVisible();
      const sb = await box(status, `상태 바꾸기 @${width}`);
      expect.soft(sb.height, `상태 바꾸기 @${width} 높이`).toBeCloseTo(32, 0);

      await page.goto(listUrl());
      const links = sortLinks(page);
      await expect(links.name.link).toBeVisible();
      const nb = await box(links.name.link, `프로젝트명 링크 @${width}`);
      const qb = await box(links.quote.link, `견적 링크 @${width}`);
      expect.soft(nb.height, `프로젝트명 @${width} 링크 높이`).toBeCloseTo(PC_SORT_LINK_HEIGHT[width].name, 0);
      expect.soft(qb.height, `견적 @${width} 링크 높이`).toBeCloseTo(PC_SORT_LINK_HEIGHT[width].quote, 0);

      // 「더보기」는 폰에서만 — 프로젝트 쓰기 권한이 있어 복사 묶음이 있는 PM으로 본다.
      await login(page, seed.pm);
      await page.goto(`/projects/${seed.projectId}`);
      const copyProjectLink = page.getByRole("main").getByRole("link", { name: "프로젝트 복사", exact: true });
      await expect(copyProjectLink).toBeVisible();
      const cpb = await box(copyProjectLink, `프로젝트 복사 @${width}`);
      expect.soft(cpb.height, `프로젝트 복사 @${width} 높이`).toBeCloseTo(32, 0);
      const copyRevisionButton = page.getByRole("main").getByRole("button", { name: "복사해 새 차수", exact: true });
      await expect(copyRevisionButton).toBeVisible();
      const crb = await box(copyRevisionButton, `복사해 새 차수 @${width}`);
      expect.soft(crb.height, `복사해 새 차수 @${width} 높이`).toBeCloseTo(32, 0);
      await expect.soft(detailButtons(page).more, `더보기 @${width} 숨김`).toBeHidden();
    }

    // /review 3차 E4 — 폰 44 규칙이 PC로 새는지 1차 「일괄 저장」도 본다. 회차마다 편집하면 저장 안 한 편집이
    // localStorage에 남아 다음 회차에 복원 줄이 뜨므로, 폰 테스트처럼 한 번 띄우고 폭만 바꾼다.
    await login(page, seed.pm);
    await page.setViewportSize({ width: WIDTHS_PC[0], height: 800 });
    await page.goto(`/projects/${seed.projectId}`);
    await page.locator("#period-open").click();
    await page.locator("#period-end").fill(kstToday(new Date()));
    const save = page.getByRole("main").getByRole("button", { name: /일괄 저장/ });
    await expect(save).toBeVisible();
    for (const width of WIDTHS_PC) {
      await page.setViewportSize({ width, height: 800 });
      const svb = await box(save, `일괄 저장 @${width}`);
      expect.soft(svb.height, `일괄 저장 @${width} 높이`).toBeCloseTo(32, 0);
    }
  });
});

// PR #104 후속 F(2) — DR-104-01(/design-review): 폰 복원 줄 「복원」·「버림」 폭이 글자 폭(32)에 그쳐 44 미만.
// DR-104-05: 폰 머리 줄 DOM · Tab 순서가 보이는 순서와 달랐다(SYSTEM §10 포커스 순서 = 시각 순서).
test.describe("PR #104 후속 — 폰 복원 줄 44 (DR-104-01) · 머리 줄 Tab 순서 (DR-104-05)", () => {
  test("DR-104-01 — 폰 상세 복원 줄 「복원」·「버림」 375·320에서 44×44 이상", async ({ page }) => {
    await login(page, seed.pm);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/projects/${seed.projectId}`);
    await page.locator("#period-open").click();
    await page.locator("#period-end").fill(kstToday(new Date()));
    // 보관이 끝나야 다시 열 때 복원 줄이 뜬다(reserves.spec 선례).
    await expect
      .poll(() => page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith("quote-ledger:dirty:")).length))
      .toBeGreaterThan(0);
    await page.reload();
    const main = page.getByRole("main");
    const restore = main.getByRole("button", { name: "복원", exact: true });
    const discard = main.getByRole("button", { name: "버림", exact: true });
    await expect(restore).toBeVisible();
    await expect(discard).toBeVisible();

    for (const width of WIDTHS_PHONE) {
      await page.setViewportSize({ width, height: 800 });
      for (const [label, locator] of [["복원", restore], ["버림", discard]] as const) {
        const b = await box(locator, `${label} @${width}`);
        expect.soft(b.height, `${label} @${width} 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
        expect.soft(b.width, `${label} @${width} 폭`).toBeGreaterThanOrEqual(TOUCH_MIN);
      }
    }
  });

  test("DR-104-05 — 폰 머리 줄 보이는 순서 = Tab 순서(상태 바꾸기 → 일괄 저장 → 더보기 → 복사해 새 차수 → 프로젝트 복사), PC 1280 순서는 그대로", async ({ page }) => {
    await login(page, seed.admin);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/projects/${seed.projectId}`);
    const main = page.getByRole("main");
    await page.locator("#period-open").click();
    await page.locator("#period-end").fill(kstToday(new Date()));
    const save = main.getByRole("button", { name: /일괄 저장/ });
    await expect(save).toBeVisible();
    const status = main.getByRole("button", { name: "상태 바꾸기", exact: true });
    const more = main.getByRole("button", { name: "더보기", exact: true });
    await more.click();
    const copyRevision = main.getByRole("button", { name: "복사해 새 차수", exact: true });
    const copyProject = main.getByRole("link", { name: "프로젝트 복사", exact: true });
    await expect(copyRevision).toBeVisible();
    await expect(copyProject).toBeVisible();

    for (const width of WIDTHS_PHONE) {
      await page.setViewportSize({ width, height: 800 });
      const named = [
        ["상태 바꾸기", status],
        ["일괄 저장", save],
        ["더보기", more],
        ["복사해 새 차수", copyRevision],
        ["프로젝트 복사", copyProject],
      ] as const;
      const placed = await Promise.all(named.map(async ([name, locator]) => ({ name, b: await box(locator, `${name} @${width}`) })));
      // 보이는 순서 — 위에서 아래, 같은 줄이면 왼쪽에서 오른쪽(반올림한 y, x). RED에서도 통과해야 하는 가드.
      const visual = placed.sort((a, b) => Math.round(a.b.y) - Math.round(b.b.y) || a.b.x - b.b.x).map((item) => item.name);
      expect(visual, `보이는 순서 @${width}`).toEqual(["상태 바꾸기", "일괄 저장", "더보기", "복사해 새 차수", "프로젝트 복사"]);
    }

    await page.setViewportSize({ width: 375, height: 800 });
    await status.focus();
    for (const [name, locator] of [["일괄 저장", save], ["더보기", more], ["복사해 새 차수", copyRevision], ["프로젝트 복사", copyProject]] as const) {
      await page.keyboard.press("Tab");
      await expect(locator, `폰 Tab → ${name}`).toBeFocused();
    }

    // PC 1280 — DOM · Tab 순서는 그대로(복사해 새 차수 → 프로젝트 복사 → 상태 바꾸기 → 일괄 저장). 폭을 바꾸면 훅이 순서를 다시 맞춘다.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(more).toBeHidden();
    await expect
      .poll(async () =>
        copyRevision.evaluate(
          (node, other) => Boolean(other && node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING),
          await status.elementHandle(),
        ),
      )
      .toBe(true);
    await copyRevision.focus();
    for (const [name, locator] of [["프로젝트 복사", copyProject], ["상태 바꾸기", status], ["일괄 저장", save]] as const) {
      await page.keyboard.press("Tab");
      await expect(locator, `PC Tab → ${name}`).toBeFocused();
    }
  });
});
