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
    "고르기 목록",
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

  // 06-29 Task 2 — SP-8 고르기 목록(05 PickDialog 위) 단독 표본: 첫 포커스 · 현재 줄 · 고를 수 없는 행 · 막힘(E-24) · 오류 · 0건 · 빈 목록 · 프로젝트.
  test("고르기 목록 — 단독 표본의 현재 줄 · 막힘 한 자리 · 다음 한 수 · 오류 · 0건 · 빈 목록 · 프로젝트", async ({ page }) => {
    const dialog = page.locator("dialog:modal");
    const search = dialog.getByRole("textbox", { name: "견적 줄 검색" });
    const primary = dialog.getByRole("button", { name: /^이 줄로/ });
    const result = page.locator('[data-gallery="pick-result"]');
    const dangerColor = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.color = "var(--status-danger)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });

    await page.getByRole("button", { name: "줄 고르기 열기" }).click();
    await expect(dialog).toBeVisible();
    await expect(search).toBeFocused();
    // 현재 줄 — 굵게 + 왼쪽 2px 선.
    const current = dialog.locator('[data-pick-id="p1"]');
    await expect(current).toBeVisible();
    const currentStyle = await current.evaluate((el) => {
      const style = getComputedStyle(el);
      return { weight: style.fontWeight, border: style.borderInlineStartWidth };
    });
    expect(currentStyle).toEqual({ weight: "700", border: "2px" });
    // 고를 수 없는 행 — aria-disabled + 2행 이유(describedby).
    const blocked = dialog.locator('[data-pick-id="p3"]');
    await expect(blocked).toHaveAttribute("aria-disabled", "true");
    expect(await page.locator(`[id="${await blocked.getAttribute("aria-describedby")}"]`).textContent()).toBe("카드 사용 연결됨");

    // 막힘 — 행은 그대로, 1차 비활성 + 바닥 줄 한 자리(E-24), 본문 고정 줄 0, 다음 한 수 3차.
    await search.fill("막힘");
    await expect(dialog.locator('[data-pick-id="p1"]')).toHaveCount(0);
    await expect(dialog.locator('[data-pick-id="p3"]')).toBeVisible();
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    const footId = await primary.getAttribute("aria-describedby");
    expect(await page.locator(`[id="${footId}"]`).textContent()).toBe("이을 수 있는 줄 없음");
    await expect(dialog.getByText("고를 수 있는 줄이 없습니다")).toHaveCount(0);
    await dialog.getByRole("button", { name: "견적 외 비용으로" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(result).toHaveText("견적 외 비용으로");

    // 오류 — 위험 색 한 줄 + 2차 `다시 시도`, 1차 aria-describedby → 그 줄, 취소는 산다.
    await page.getByRole("button", { name: "줄 고르기 열기" }).click();
    await search.fill("오류");
    const errorLine = dialog.getByRole("alert");
    await expect(errorLine).toContainText("견적 줄 불러오지 못함 · ");
    expect(await errorLine.evaluate((el) => getComputedStyle(el).color)).toBe(dangerColor);
    await expect(dialog.getByRole("button", { name: "다시 시도" })).toBeVisible();
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    expect(await primary.getAttribute("aria-describedby")).toBe(await errorLine.getAttribute("id"));
    await expect(dialog.getByRole("button", { name: /^취소/ })).not.toHaveAttribute("aria-disabled", "true");

    // 검색 0건 — 05 그대로.
    await search.fill("zzz");
    await expect(dialog.getByText("조건에 맞는 줄이 없습니다 · ")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "검색 지우기" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // 빈 목록 — 빈 목록 줄 뒤 3차가 다음 한 수.
    await page.getByRole("button", { name: "빈 목록 고르기 열기" }).click();
    await expect(dialog.getByText("이 프로젝트에 견적 줄이 없습니다 · ")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "견적 외 비용으로" })).toBeVisible();
    await page.keyboard.press("Escape");

    // 프로젝트 명사 — 0건 줄의 조사 `가`.
    await page.getByRole("button", { name: "프로젝트 고르기 열기" }).click();
    await dialog.getByRole("textbox", { name: "프로젝트 검색" }).fill("zzz");
    await expect(dialog.getByText("조건에 맞는 프로젝트가 없습니다 · ")).toBeVisible();
  });

  test("고르기 목록 — 로드 중 1차 aria-disabled · 본문 aria-busy, 120줄은 목록 안에서만 스크롤하고 행동 줄이 고정된다", async ({ page }) => {
    const dialog = page.locator("dialog:modal");
    const search = dialog.getByRole("textbox", { name: "견적 줄 검색" });
    const primary = dialog.getByRole("button", { name: /^이 줄로/ });
    await page.getByRole("button", { name: "줄 고르기 열기" }).click();
    await expect(dialog.locator('[data-pick-id="p1"]')).toBeVisible();
    await dialog.locator('[data-pick-id="p2"]').click();
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await search.fill("느림");
    await expect(dialog.locator("[aria-busy='true']")).toHaveCount(1);
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 5000 });
    await search.fill("많음");
    await expect(dialog.locator('[data-pick-id="m120"]')).toHaveCount(1);
    const before = await primary.boundingBox();
    const body = dialog.locator("[aria-busy] , div:has(> ul[role='listbox'])").first();
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const after = await primary.boundingBox();
    expect(after?.y).toBe(before?.y);
    // 모달 자체는 화면 높이 안에 선다(목록만 스크롤).
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox && dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= page.viewportSize()!.height).toBe(true);
  });

  // 06-29 Task 2 — SP-8 패널 위 겹침: 목록의 Esc는 목록만 닫고 Ctrl+Enter는 패널 1차에 닿지 않는다(T-06-292).
  test("?panel=pick — 목록 Esc는 목록만 닫고 패널 입력이 남으며 Ctrl+Enter는 패널 제출로 번지지 않는다", async ({ page }) => {
    await page.goto("/dev/components?panel=pick");
    const panel = page.locator('dialog[data-ui="side-panel"]');
    const pick = page.locator('dialog:not([data-ui="side-panel"]):has(input[aria-label="견적 줄 검색"])');
    const opener = panel.getByRole("button", { name: "견적 줄 바꾸기" });
    await expect(panel).toBeVisible();
    await panel.getByLabel("표본 이름").fill("입력 유지");

    await opener.click();
    await expect(pick).toBeVisible();
    await expect(pick.getByRole("textbox", { name: "견적 줄 검색" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(pick).toHaveCount(0);
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel("표본 이름")).toHaveValue("입력 유지");
    await expect(opener).toBeFocused();

    // Ctrl+Enter — 목록 안에서는 패널 1차(제출)가 불리지 않는다. 목록 밖(패널 칸)에서는 불린다(대조).
    await opener.click();
    await expect(pick).toBeVisible();
    await page.keyboard.press("Control+Enter");
    await expect(pick).toBeVisible();
    await expect(panel.getByText("표본 제출")).toHaveCount(0);

    // 행을 고르고 Enter → 패널 칸에 값, 목록은 닫힌다.
    await pick.locator('[data-pick-id="p2"]').click();
    await page.keyboard.press("Enter");
    await expect(pick).toHaveCount(0);
    await expect(panel.getByLabel("견적 줄", { exact: true })).toHaveValue("음향 장비");
    await expect(panel).toBeVisible();

    await panel.getByLabel("표본 이름").focus();
    await page.keyboard.press("Control+Enter");
    await expect(panel.getByText("표본 제출")).toBeVisible();
  });

  // 06-29 Task 2 — SP-7 첨부 보기 칸 · loading · 열린 채 새로 고침.
  test("모달 첨부 표본 — 열 때 … · 파일 넷이면 칸 높이가 행 셋에서 멈추고 칸 안만 스크롤 · 새로 고침은 열린 채 다시 선다", async ({ page }) => {
    await page.getByRole("button", { name: "첨부 확인 열기" }).click();
    const dialog = page.locator("dialog:modal");
    const primary = dialog.locator('[data-ui="primary-button"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("…", { exact: true })).toBeVisible();
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    expect(await primary.getAttribute("aria-describedby")).toBeTruthy();

    const cell = dialog.locator('[data-ui="confirm-attachments"]');
    await expect(cell.getByText("세금계산서.pdf")).toBeVisible();
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await expect(cell.locator('a[target="_blank"]')).toHaveCount(4);
    const heights = await cell.locator("li").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    const firstThree = heights.slice(0, 3).reduce((sum, h) => sum + h, 0);
    const cellHeight = await cell.evaluate((el) => el.clientHeight);
    expect(Math.abs(cellHeight - firstThree)).toBeLessThanOrEqual(2);
    expect(await cell.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    // 칸만 스크롤 — 제목 · 행동 줄 위치 불변.
    const title = dialog.getByRole("heading", { name: "증빙 확인" });
    const titleBefore = await title.boundingBox();
    const primaryBefore = await primary.boundingBox();
    await cell.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await title.boundingBox()).toEqual(titleBefore);
    expect(await primary.boundingBox()).toEqual(primaryBefore);

    // 첫 확인 = 동시성 거부 → 새로 고침이 모달을 닫지 않고 다른 파일 목록으로 다시 세운다. 포커스는 1차.
    await primary.click();
    await expect(dialog.getByText("박서연이 14:01에 증빙을 바꿈").first()).toBeVisible();
    await dialog.getByRole("button", { name: "새로 고침" }).click();
    await expect(cell.getByText("세금계산서 수정본.pdf")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("박서연이 14:01에 증빙을 바꿈")).toHaveCount(0);
    await expect(primary).toBeFocused();
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
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
