import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { STATUS_KIND } from "@/ui/status-tag/status-map";

// 04.6-06 — /dev/components 뼈대: 로그인 필요 · DetailScreen 틀 · 버튼 3위계 구역 · actions 순서(D4).
// 운영(prod) 404는 서버 게이트라 단위 테스트(dev-tools.test.ts)가 판정하고, E2E 서버는 APP_ENV=local이다.

test("로그인 없이 /dev/components를 열면 /login으로 간다", async ({ page }) => {
  await page.goto("/dev/components");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("로그인한 뒤", () => {
  test.beforeEach(async ({ page }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/dev/components");
  });

  test("제목은 DetailScreen h1이고 섹션 제목은 h2다", async ({ page }) => {
    await expect(page.locator('h1[data-ui="screen-title"]')).toHaveText("컴포넌트 모음");
    expect(await page.locator("main h2").count()).toBeGreaterThanOrEqual(3);
  });

  test("버튼 1차 · 2차 · 3차가 보이고 비활성은 aria-disabled다", async ({ page }) => {
    const main = page.locator("main");
    for (const name of ["1차 기본", "2차 기본", "3차 기본"]) {
      await expect(main.getByRole("button", { name })).toBeVisible();
    }
    const disabled = main.getByRole("button", { name: /^(1차|2차|3차) 비활성/ });
    await expect(disabled).toHaveCount(3);
    for (const b of await disabled.all()) {
      await expect(b).toHaveAttribute("aria-disabled", "true");
      expect(await b.getAttribute("disabled")).toBeNull();
    }
  });

  test("머리 행동 묶음 — DOM · x 좌표 · Tab 순서가 2차 → 1차이고 1차가 오른쪽 끝이다 (D4)", async ({ page }) => {
    const head = page.locator('[data-ui="screen-title"]').locator("xpath=ancestor::div[2]");
    const secondary = head.getByRole("button", { name: "표본 2차" });
    const primary = head.getByRole("button", { name: "표본 1차" });
    await expect(secondary).toBeVisible();
    await expect(primary).toBeVisible();

    const order = await head.locator("button").evaluateAll((els) => els.map((e) => e.textContent?.trim()));
    expect(order).toEqual(["표본 2차", "표본 1차"]);

    const s = await secondary.boundingBox();
    const p = await primary.boundingBox();
    if (!s || !p) throw new Error("버튼 상자를 잴 수 없다");
    expect(p.x).toBeGreaterThan(s.x);
    const headBox = await head.boundingBox();
    if (!headBox) throw new Error("머리 상자를 잴 수 없다");
    expect(Math.abs(p.x + p.width - (headBox.x + headBox.width))).toBeLessThanOrEqual(1);

    await secondary.focus();
    await page.keyboard.press("Tab");
    await expect(primary).toBeFocused();
  });

  // 04.6-13 — UI-SPEC 「컴포넌트 모음 페이지」 구역이 한 페이지에 전부 있다(SC 2). 제목은 구역과 하나씩 대응한다.
  const SECTION_TITLES = [
    "1차 버튼",
    "2차 버튼",
    "3차 버튼",
    "입력",
    "선택",
    "상태 배지",
    "숫자",
    "표 읽기",
    "표 편집",
    "표 선택",
    "표 서버 고정",
    "표 불러오는 중",
    "빈 목록",
    "행 동작",
    "합계 면",
    "토스트",
    "배너",
    "모달",
    "옆 패널",
    "화면 틀",
  ];

  test("구역 제목이 UI-SPEC 목록 그대로 모두 있다", async ({ page }) => {
    const titles = await page.locator("main section > h2").allTextContents();
    expect(titles.map((t) => t.trim())).toEqual(SECTION_TITLES);
  });

  test("상태 배지 구역은 표의 낱말마다 tag · text 둘씩 그린다", async ({ page }) => {
    const words = Object.keys(STATUS_KIND);
    const badges = page.locator('[data-gallery="status-badges"] > li');
    await expect(badges).toHaveCount(words.length * 2);
  });

  test("숫자 구역에 큰 금액 · 음수 · 외화 2행이 있다", async ({ page }) => {
    const section = page.locator('[data-gallery="numbers"]');
    await expect(section).toContainText("1,234,567,890");
    await expect(section).toContainText("-");
    await expect(section.getByText(/^USD [\d,.]+$/)).toBeVisible();
    await expect(section.getByText(/^@[\d,.]+$/)).toBeVisible();
  });

  test("표 구역 — 읽기 · 편집(그룹 줄 · 합계 · 저장 대기 · 오류 칸) · 서버 고정 · 뼈대 · 빈 목록 · 행 동작 1·2·3개", async ({ page }) => {
    await expect(page.locator('[data-gallery="table-read"] table')).toHaveCount(1);
    const edit = page.locator('[data-gallery="table-edit"]');
    await expect(edit.locator('[role="grid"]')).toHaveCount(1);
    await expect(edit.locator("tfoot")).toHaveCount(1);
    await expect(edit.locator('[aria-invalid="true"]')).toHaveCount(1);
    await expect(page.locator('[data-gallery="table-static"] table')).toHaveCount(1);
    await expect(page.locator('[data-ui="table-skeleton"]')).toHaveCount(1);
    await expect(page.locator('[data-ui="empty-state"]')).toHaveCount(1);
    const counts = await page.locator('[data-gallery="row-actions"] [data-ui="row-actions"]').evaluateAll((els) => els.map((e) => e.children.length));
    expect(counts).toEqual([1, 2, 3]);
  });

  // 06-29 Task 1 — SP-1 선택 표(SYSTEM §7-3 (카)). 선택 열 폭 · Space · 1차 N · 머리글 · 고를 수 없는 행 · Ctrl+Enter.
  test("표 선택 — Space로 고르기 · 1차 N · 머리글 일괄 · 고를 수 없는 행 · Ctrl+Enter 처리", async ({ page }) => {
    const sample = page.locator('[data-gallery="table-select"]');
    const table = sample.locator("table");
    const primary = sample.locator('[data-ui="primary-button"]');
    const bodyRows = table.locator("tbody tr");
    const rowBox = (name: string) => table.getByRole("checkbox", { name: `${name} 고르기` });
    const headBox = table.getByRole("checkbox", { name: "이 쪽 전체 고르기" });

    // 0건 — 1차 aria-disabled + 이유 글자.
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(sample).toContainText("고른 건 없음");

    // 선택 열 칸 폭 44px(1280) — calc(var(--row-number-w) + 2 * var(--cell-pad-x)).
    const selectCellWidth = await bodyRows.first().locator("td").first().evaluate((el) => Math.round(el.getBoundingClientRect().width));
    expect(selectCellWidth).toBe(44);

    // 활성 셀 행에서 Space → 그 행 체크 · 행 면 = --accent-weak · 1차 `지급 완료 1`.
    await bodyRows.first().locator("td").nth(1).click();
    await page.keyboard.press("Space");
    await expect(bodyRows.first().getByRole("checkbox")).toBeChecked();
    await expect(primary).toContainText("지급 완료 1");
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    const accentWeak = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.background = "var(--accent-weak)";
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    await page.mouse.move(0, 0);
    expect(await bodyRows.first().locator("td").nth(1).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(accentWeak);

    // 머리글 — 일부만 고른 상태면 indeterminate, 누르면 고를 수 있는 행 전부.
    expect(await headBox.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
    await headBox.click();
    await expect(table.locator('tbody input[type="checkbox"]:checked')).toHaveCount(4);
    expect(await headBox.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(false);
    await expect(primary).toContainText("지급 완료 4");

    // 고를 수 없는 행 — aria-disabled · 클릭해도 그대로 · 이유 글자가 describedby.
    const blockedBox = rowBox("표본 마");
    await expect(blockedBox).toHaveAttribute("aria-disabled", "true");
    await blockedBox.click({ force: true });
    await expect(blockedBox).not.toBeChecked();
    await expect(table.locator('tbody input[type="checkbox"]:checked')).toHaveCount(4);
    const describedBy = await blockedBox.getAttribute("aria-describedby");
    expect(await page.locator(`[id="${describedBy}"]`).textContent()).toContain("증빙 확인 전");
    // 선택 때문에 붙은 aria-selected 0.
    await expect(table.locator('[aria-selected="true"]')).toHaveCount(0);

    // Ctrl+Enter(표 안) → 표본 처리 — 한 행은 막힘 이유와 함께 선택이 풀리고 나머지는 처리돼 사라진다.
    await bodyRows.first().locator("td").nth(1).click();
    await page.keyboard.press("Control+Enter");
    await expect(sample.getByText("계좌 오류")).toBeVisible();
    await expect(bodyRows).toHaveCount(3);
    await expect(table.locator('tbody input[type="checkbox"]:checked')).toHaveCount(0);
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(sample).toContainText("고른 건 없음");
  });

  test("토스트 · 모달 표본 버튼이 각자 열고 닫힌다", async ({ page }) => {
    await page.getByRole("button", { name: "토스트 띄우기" }).click();
    await expect(page.getByRole("status").filter({ hasText: "저장됨" })).toBeVisible();
    await page.getByRole("button", { name: "모달 열기" }).click();
    await expect(page.locator("dialog:modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog:modal")).toHaveCount(0);
  });

  test("배너 둘(안내 · 경고)이 있고 역할이 다르다", async ({ page }) => {
    const banners = page.locator('[data-gallery="banners"]');
    await expect(banners.getByRole("status")).toHaveCount(1);
    await expect(banners.getByRole("alert")).toHaveCount(1);
  });

  test("옆 패널은 ?panel=1에서 PC 오른쪽 480 모달이다", async ({ page }) => {
    await page.goto("/dev/components?panel=1");
    const dialog = page.locator("dialog:modal");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-ui", "side-panel");
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box ? [Math.round(box.x + box.width), Math.round(box.width)] : null;
      })
      .toEqual([1280, 480]);
  });

  test("틀 3종 축소 예가 목록 · 상세 · 폼 이름으로 있다", async ({ page }) => {
    const frames = page.locator('[data-gallery="frames"] [data-gallery-frame]');
    expect(await frames.evaluateAll((els) => els.map((e) => e.getAttribute("data-gallery-frame")))).toEqual(["list", "detail", "form"]);
  });
});

test.describe("로그인한 뒤 · 폰 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("옆 패널은 ?panel=1에서 폰 아래 시트(전폭)다", async ({ page }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/dev/components?panel=1");
    const dialog = page.locator("dialog:modal");
    await expect(dialog).toBeVisible();
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box ? [Math.round(box.x), Math.round(box.width), Math.round(box.y + box.height)] : null;
      })
      .toEqual([0, 390, 844]);
  });
});
