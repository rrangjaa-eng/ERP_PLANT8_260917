import { test, expect, type Page, type Locator } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// F-02(260922-o2b) — SYSTEM.md §3 「단일 기둥 최대 폭」의 DOM 회귀. desktop
// 프로젝트 전용(1280 뷰포트 기본값). 태스크 2가 관리자 화면·폼 케이스를 더한다.

async function loginAs(page: Page, roleId: string): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ roleId });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return user;
}

// 뷰포트 폭 1280 전제로 폭이 --form-max(720px)와 1px 안에서 같음(단순
// 상한이 아니라 실제로 그 값이 적용됐음을 확인), x가 main h1의 x와 1px
// 안에서 같음(왼쪽 정렬)을 확인한다. 태스크 2가 관리자 화면·폼 케이스에
// 재사용한다.
async function expectSingleColumn(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.width - 720)).toBeLessThanOrEqual(1);

  const h1Box = await page.locator("main h1").first().boundingBox();
  expect(h1Box).not.toBeNull();
  expect(Math.abs(box!.x - h1Box!.x)).toBeLessThanOrEqual(1);
}

test.describe("단일 기둥 최대 폭 — /account (F-02 트레이서)", () => {
  test("1280에서 비밀번호 변경 폼이 720px 이하로 main h1과 같은 x에서 시작한다", async ({ page }) => {
    expect(page.viewportSize()?.width).toBe(1280);

    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/account");

    const currentPasswordInput = page.getByLabel("현재 비밀번호");
    const form = page.locator("form", { has: currentPasswordInput });

    await expectSingleColumn(page, form);

    const inputBox = await currentPasswordInput.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(inputBox!.width).toBeLessThanOrEqual(720);
  });
});

// 04.6-14: 한 건 폼은 옆 패널 — 폭 480 · 화면 오른쪽 끝(PC 1280). 폼 id는 그대로.
async function expectSidePanel(page: Page, formSelector: string): Promise<void> {
  const dialog = page.locator('dialog[data-ui="side-panel"]');
  await expect(dialog.locator(formSelector)).toBeVisible();
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      return box ? [Math.round(box.width), Math.round(box.x + box.width)] : null;
    })
    .toEqual([480, 1280]);
}

async function expectAllSingleColumn(page: Page, selector: string): Promise<void> {
  const locators = await page.locator(selector).all();
  expect(locators.length).toBeGreaterThan(0);
  for (const locator of locators) {
    await expectSingleColumn(page, locator);
  }
}

test.describe("단일 기둥 최대 폭 — 관리자 화면·폼 전면 적용 (F-02)", () => {
  test("/admin의 main ul 전부가 720px 이하로 main h1과 같은 x에서 시작한다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin");
    await expectAllSingleColumn(page, "main ul");
  });

  test("/admin/settings의 main section 전부가 720px 이하로 main h1과 같은 x에서 시작한다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/settings");
    await expectAllSingleColumn(page, "main section");
  });

  test("/admin/system-status의 main dl이 720px 이하로 main h1과 같은 x에서 시작한다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/system-status");
    await expectSingleColumn(page, page.locator("main dl"));
  });

  test("사람 상세의 main dl과 계급 변경 칸 묶음이 720px 이하로 main h1과 같은 x에서 시작한다", async ({
    page,
  }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/people");
    await page.getByRole("link", { name: "상세" }).first().click();
    await expect(page).toHaveURL(/\/admin\/people\/.+/);
    await expectSingleColumn(page, page.locator("main dl"));
    // select 자체는 PC 라벨 열 뒤 200px이다(§6-3 칸 폭, form-label-section-gap.spec.ts) — 기둥은 그 묶음이 잡는다.
    await expectSingleColumn(page, page.locator("div:has(> #person-role-change)"));
  });

  // 260922-o2b 후속(/review + 독립 DOM 감사) — SYSTEM.md §3 「단일 기둥 최대
  // 폭」은 데이터 표를 제외한다. 발령 이력 표(HistoryList, PersonDetailClient
  // 경유)가 .single-column 안에 있었다 — 표가 데이터 표라는 예외를 어긴다.
  test("사람 상세의 발령 이력 표는 main 안에 있지만 .single-column 밖이다 (§3 데이터 표 예외)", async ({
    page,
  }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/people");
    await page.getByRole("link", { name: "사람 등록" }).click();

    const email = `single-column-history-${Date.now()}@example.test`;
    await page.getByLabel("이름").fill("단일기둥이력");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await page.getByLabel("팀").selectOption({ label: "기획본부 · 기획1팀" });
    await page.getByLabel("발령일").fill("2026-01-01");
    await page.getByLabel("입사일").fill("2026-01-01");
    await page.getByRole("button", { name: "사람 등록" }).click();
    await expect(page.getByText(`초기 비밀번호 — ${email}`)).toBeVisible();

    await page.goto("/admin/people");
    await page.locator("tr", { hasText: email }).getByRole("link", { name: "상세" }).click();
    await expect(page).toHaveURL(/\/admin\/people\/.+/);

    // 발령 이력이 하나 있어 HistoryList가 <table>을 그린다(비어 있으면
    // ListEmpty로 대체된다 — 등록 시 팀·발령일을 채워 그 경우를 피한다).
    await expect(page.locator("main table")).toHaveCount(1);
    await expect(page.locator(".single-column table")).toHaveCount(0);

    // /design-review 발견 2 — SYSTEM.md §7-14 이력 목록은 §6-3 폼 화면의 한
    // 섹션(2px 선으로 시작)에 열린다. 기존 표만 있고 여는 제목이 없었다 —
    // /admin/settings의 §7-14 이력 섹션과 같은 패턴(이 앱의 소속 발령 이력
    // caption과 같은 문구 「소속 발령 이력」).
    await expect(page.getByRole("heading", { name: "소속 발령 이력", level: 2 })).toBeVisible();
  });

  // 04.6-14: 조직 목록은 `ListScreen`(전폭)이고 본부 · 팀 폼은 옆 패널(480 · 오른쪽 끝)이다 — 폼 id는 그대로.
  test("/admin/people/org의 본부 목록 ul이 main 안에 있고 #org-unit-form이 옆 패널 폭 480 · 오른쪽 끝에 있다", async ({
    page,
  }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/people/org");
    // 본부 목록 <ul>의 각 <li> 안에 팀 목록 <ul>이 중첩된다(계층 목록) — 최상위 목록은 main의 화면 틀 안에 있다.
    await expect(page.locator("main ul").first()).toBeVisible();
    await page.getByRole("link", { name: "본부 추가" }).first().click();
    await expectSidePanel(page, "#org-unit-form");
  });

  const registrationForms: Array<{ listPath: string; linkName: string; formSelector: string; waveMerge?: boolean }> = [
    // 거래처 폼은 04.6-04에서 옆 패널(480)로 옮겨 단일 기둥(720)이 아니다 — test/e2e/side-panel.spec.ts가 폭을 잰다.
    // 법인카드 · 코드표 폼의 화면은 04.6-15 소유라 이 트리에서는 옛 화면이다 — 합본(@wave-merge)에서 돈다.
    { listPath: "/admin/corp-cards", linkName: "법인카드 등록", formSelector: "#corp-card-form", waveMerge: true },
    { listPath: "/admin/code-tables", linkName: "코드 추가", formSelector: "#code-item-form", waveMerge: true },
    { listPath: "/admin/people", linkName: "사람 등록", formSelector: "#person-form" },
  ];

  for (const { listPath, linkName, formSelector, waveMerge } of registrationForms) {
    test(
      `${formSelector}가 옆 패널 폭 480 · 오른쪽 끝에 있다`,
      waveMerge ? { tag: "@wave-merge" } : {},
      async ({ page }) => {
        await loginAs(page, SYSADMIN_ROLE_ID);
        await page.goto(listPath);
        await page.getByRole("link", { name: linkName }).first().click();
        await expectSidePanel(page, formSelector);
      },
    );
  }

  // 04.6-04: 거래처 폼은 단일 기둥(720)이 아니라 옆 패널이다 — 폭 480 · 화면 오른쪽 끝(PC 1280). 폼 id는 그대로.
  test("#vendor-form이 옆 패널 폭 480 · 오른쪽 끝에 있다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/vendors");
    await page.getByRole("link", { name: "거래처 등록" }).first().click();
    const dialog = page.locator('dialog[data-ui="side-panel"]');
    await expect(dialog.locator("#vendor-form")).toBeVisible();
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box ? [Math.round(box.width), Math.round(box.x + box.width)] : null;
      })
      .toEqual([480, 1280]);
  });

  test("#role-form이 옆 패널 폭 480 · 오른쪽 끝에 있다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/people/roles?new=1");
    await expectSidePanel(page, "#role-form");
  });

  test("반례 — /admin/code-tables 목록의 main table은 720px보다 넓다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/code-tables");
    const table = page.locator("main table");
    const box = await table.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(720);
  });
});
