import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
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
    "골라내기 — 다중(SP-62-1)",
    "일괄 등록 — 첨부 변형(SP-6103)",
    "증빙 표본(06.1)",
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

  // 06.1-03 SP-6101 — 증빙 기록 낱말 여섯이 상태 배지 구역에 tag · text 한 쌍씩 선다.
  test("상태 배지 구역에 06.1 증빙 낱말 여섯이 tag · text 한 번씩 있다", async ({ page }) => {
    const badges = page.locator('[data-gallery="status-badges"]');
    for (const word of ["미공개", "팀 공개", "본부 공개", "붙음", "확인 필요", "카드 미등록"]) {
      await expect(badges.getByText(word, { exact: true }), word).toHaveCount(2);
    }
  });

  // 06.1-03 Task 2(SP-6103) — 첨부 영역 「엑셀 일괄 등록」 변형: 영역 · accept · 조각 색 · 0인 조각 부재 · 거절 행 버튼 0 · 실패 행에만 다시 올리기.
  test("일괄 등록 변형 — 영역 글자 · accept · 거절 행에는 버튼이 없고 실패 행에만 다시 올리기 · 0인 조각은 없다", async ({ page }) => {
    const bulk = page.locator('[data-gallery="bulk-import"]');
    // PC는 짧은 글(끌어 놓거나 Ctrl+U · …) 폰은 더 짧은 글 — 보이는 쪽 하나만 있다(기본 변형과 같은 pcText/phoneText).
    await expect(bulk.getByText(/엑셀·CSV 1MB$/).locator("visible=true")).toHaveCount(1);
    await expect(bulk.getByTestId("attachments-input")).toHaveAttribute("accept", ".xls,.xlsx,.csv");
    await expect(bulk.getByRole("button", { name: /^파일 고르기/ })).toBeVisible();
    for (const key of ["size", "format", "lines"]) {
      const row = bulk.locator(`li[data-row="${key}"]`);
      await expect(row).toHaveAttribute("data-state", "refused");
      await expect(row.locator("button")).toHaveCount(0);
    }
    await expect(bulk.locator('li[data-row="size"]')).toContainText("1.4MB · 1MB 초과 · 기간을 나눠 다시 내려받기");
    await expect(bulk.getByRole("button", { name: "다시 올리기" })).toHaveCount(1);
    await expect(bulk.locator('li[data-row="failed"]').getByRole("button", { name: "다시 올리기" })).toHaveCount(1);
    await expect(bulk.locator('li[data-row="uploading"] [data-ui="bulk-progress"]')).toHaveCount(1);
    await expect(bulk.getByText("상쇄 2쌍")).toBeVisible();
    await expect(bulk.getByText(/상쇄 없음|짝 없음 0|상쇄 0쌍/)).toHaveCount(0);
    await expect(bulk.locator('[aria-live="polite"]')).toHaveCount(1);
    const long = bulk.locator('li[data-row="long"]');
    expect(await long.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  // 06.1-03 Round 2 G5 — Codex 캡처용 표본 경로 셋(`page.goto`만으로 열린 채 선다).
  test("?panel=evidence — S3 증빙 패널 표본이 열린 채 선다(제목 · 1차 증빙 금액 저장)", async ({ page }) => {
    await page.goto("/dev/components?panel=evidence");
    const dialog = page.locator("dialog:modal");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-ui", "side-panel");
    await expect(dialog.getByRole("heading", { name: "세금계산서 · (주)에이원" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^증빙 금액 저장/ })).toBeVisible();
    await expect(dialog.getByLabel("공급가")).toHaveValue("1,000,000");
  });

  test("?confirm=detach — S7 떼기 모달이 열린 채 서고 사유가 빈 동안 1차는 aria-disabled + 사유 없음 · 사유 적기", async ({ page }) => {
    await page.goto("/dev/components?confirm=detach");
    const dialog = page.locator("dialog:modal");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "증빙 떼기" })).toBeVisible();
    const primary = dialog.getByRole("button", { name: /^증빙 떼기/ });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.getByText("사유 없음 · 사유 적기").first()).toBeVisible();
    await dialog.getByLabel("사유").fill("잘못 붙임");
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
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

  // 06.1-13 Task 1 — SP-6104 select 셀 붙여넣기 결과 표본(화면보다 먼저). 모르는 값 오류 셀 하나 · 합계 행 붙여넣기 요약 조각 둘.
  test("표 편집 — select 붙여넣기 표본: 모르는 값 오류 셀 하나 · 합계 행 `붙여넣기 3줄 · 공개 칸 1개 모르는 값 · 잠긴 줄 1칸 건너뜀`", async ({ page }) => {
    const sample = page.locator('[data-gallery="table-select-paste"]');
    await expect(sample.locator('[role="grid"]')).toHaveCount(1);
    await expect(sample.locator('[aria-invalid="true"]')).toHaveCount(1);
    await expect(sample).toContainText("목록에 없는 값 · 전체 공개");
    await expect(sample.locator("tfoot")).toContainText("붙여넣기 3줄 · 공개 칸 1개 모르는 값 · 잠긴 줄 1칸 건너뜀");
  });

  // DOM 감사 D2 — 표본 공개 열은 실제 증빙 표처럼 P2다. 폰(<700)에서는 주 행이 항목 + 상태 둘이고, 잠긴 줄의 공개 글자는 접힌 줄로 간다
  // (편집 칸은 접힌 줄에 끼지 않는다 — 공유 Table 규칙 · 증빙 표와 같다 · §7-3 P1 = 항목 + 상태).
  test("표 편집 — select 붙여넣기 표본: 375에서 공개 열은 P2라 주 행에 없고 잠긴 줄은 접힌 줄에 있다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const sample = page.locator('[data-gallery="table-select-paste"]');
    const mainRows = sample.locator("tbody tr:not([class*='collapsedRow'])");
    await expect(mainRows).toHaveCount(3);
    const visibleCells = await mainRows.evaluateAll((rows) => rows.map((row) => [...row.children].filter((cell) => getComputedStyle(cell).display !== "none").length));
    expect(visibleCells).toEqual([2, 2, 2]);
    const collapsed = sample.locator("tbody tr[class*='collapsedRow']");
    await expect(collapsed).toHaveCount(1);
    await expect(collapsed).toBeVisible();
    await expect(collapsed).toContainText("미공개");
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

    // 탭 정지(감사 D1) — 행 체크박스는 tabindex -1, 표 앞 머리글 체크박스 + 격자 칸만 탭으로 닿는다.
    await expect(table.locator('tbody input[type="checkbox"]:not([tabindex="-1"])')).toHaveCount(0);
    // 사용자 결정 2026-10-06(DECISIONS 「선택 표 탭 정지 2개」) — 머리글 전체 고르기 + 격자, 탭 정지는 정확히 2개이고 Tab 두 번이면 표를 벗어난다.
    expect(await table.evaluate((el) => [...el.querySelectorAll("input, [tabindex]")].filter((node) => (node as HTMLElement).tabIndex >= 0).length)).toBe(2);
    await headBox.focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("TD");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("table"))).toBeNull();

    // 활성 셀 행에서 Space → 그 행 체크 · 행 면 = --surface-selected(07 개정 11) · 활성 칸은 --surface-base · 1차 `지급 완료 1`.
    await bodyRows.first().locator("td").nth(1).click();
    await page.keyboard.press("Space");
    await expect(bodyRows.first().getByRole("checkbox")).toBeChecked();
    await expect(primary).toContainText("지급 완료 1");
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    const surface = (token: string) =>
      page.evaluate((value) => {
        const probe = document.createElement("div");
        probe.style.background = `var(${value})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      }, token);
    await page.mouse.move(0, 0);
    // SYSTEM §7-3 개정 11 — 고른 행의 다른 칸은 --surface-selected, 포커스 칸(활성 칸)은 --surface-base 바탕.
    expect(await bodyRows.first().locator("td").nth(2).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await surface("--surface-selected"));
    expect(await bodyRows.first().locator("td").nth(1).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await surface("--surface-base"));

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
    // 막힌 행 아래 이유 줄(06.5-06 W-2)도 tbody의 tr이라 체크 칸이 있는 주 행만 센다.
    await expect(table.locator('tbody tr:has(input[type="checkbox"])')).toHaveCount(3);
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

  // PR #253 CI(evidence-attach-audit S4) — 목록이 넘쳐 스크롤되는데 가리키는 행이 없으면 목록 안에 탭 정지가 없어 axe scrollable-region-focusable.
  // 로빙 행 하나(가리키는 행, 없으면 첫 행)가 늘 tabindex 0이어야 한다 — Tab으로 목록에 들어가면 그 행이 가리키는 행이 된다(검색 칸 ↓와 같다).
  test("고르기 목록 — 넘쳐 스크롤되는 목록에 가리키는 행이 없어도 키보드로 닿는다(axe scrollable-region-focusable 0)", async ({ page }) => {
    const dialog = page.locator("dialog:modal");
    const search = dialog.getByRole("textbox", { name: "견적 줄 검색" });
    await page.getByRole("button", { name: "줄 고르기 열기" }).click();
    await expect(search).toBeFocused();
    await search.fill("많음");
    await expect(dialog.locator('[data-pick-id="m120"]')).toHaveCount(1);
    await expect(dialog.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 5000 });
    const body = dialog.locator("div:has(> ul[role='listbox'])").first();
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const results = await new AxeBuilder({ page }).include("dialog").withRules(["scrollable-region-focusable"]).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    // 탭 정지는 목록 안에 정확히 하나.
    expect(await dialog.locator("[role=option]").evaluateAll((els) => els.filter((el) => (el as HTMLElement).tabIndex >= 0).length)).toBe(1);
    await search.press("Tab");
    const first = dialog.getByRole("option").first();
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute("aria-selected", "true");
  });

  // 06.2-07 Task 1 — SP-62-1 다중 고르기 변형 트레이서: 키보드로 한 명을 고르면 1차 `{동작} 1`이 켜지고 Enter로 끝난다.
  test("다중 고르기(SP-62-1) — 키보드로 한 명을 고르면 1차 {동작} 1이 켜지고 면 없이 비대화형 표시로 고름이 보이며 Enter로 끝난다", async ({ page }) => {
    const dialog = page.locator("dialog:modal");
    const opener = page.getByRole("button", { name: "다중 고르기 열기" });
    const search = dialog.getByRole("textbox", { name: "사람 검색" });
    const list = dialog.getByRole("listbox", { name: "사람 검색" });
    const primary = dialog.getByRole("button", { name: /^참여자 더하기(?!\s*\d)/ });
    const primaryOne = dialog.getByRole("button", { name: /^참여자 더하기 1(?!\d)/ });
    const result = page.locator('[data-gallery="pick-many-result"]');
    // 토큰 값은 :root에서 읽는다 — 하드코딩 색을 단언하지 않는다.
    const tokenColor = (name: string, property: "backgroundColor" | "color") =>
      page.evaluate(
        ([token, prop]) => {
          const probe = document.createElement("div");
          probe.style[prop] = `var(${token})`;
          document.body.append(probe);
          const value = getComputedStyle(probe)[prop];
          probe.remove();
          return value;
        },
        [name, property] as const,
      );

    await opener.click();
    await expect(dialog).toBeVisible();
    await expect(search).toBeFocused();
    await expect(list).toHaveAttribute("aria-multiselectable", "true");
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.getByText("고른 사람 없음")).toBeVisible();

    // ↓ → 첫 행 포커스 · Space → 고름 · 결과 줄 · 1차 `참여자 더하기 1`.
    const first = dialog.locator('[data-pick-id="u1"]');
    const second = dialog.locator('[data-pick-id="u2"]');
    await expect(first).toBeVisible();
    await search.press("ArrowDown");
    await expect(first).toBeFocused();
    await page.keyboard.press("Space");
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(second).toHaveAttribute("aria-selected", "false");
    await expect(dialog.getByText("김서연 선택")).toBeVisible();
    await expect(primaryOne).toBeVisible();
    await expect(primaryOne).not.toHaveAttribute("aria-disabled", "true");

    // 고른 행에 면이 없다 — 고르지 않은 이웃 행과 같고 `--surface-selected` · `--accent-weak`와 다르다. 현재 줄은 2px `--accent` 선.
    const paint = (locator: typeof first) =>
      locator.evaluate((el) => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, borderWidth: style.borderInlineStartWidth, borderColor: style.borderInlineStartColor };
      });
    const firstPaint = await paint(first);
    const secondPaint = await paint(second);
    expect(firstPaint.background).toBe(secondPaint.background);
    expect(firstPaint.background).not.toBe(await tokenColor("--surface-selected", "backgroundColor"));
    expect(firstPaint.background).not.toBe(await tokenColor("--accent-weak", "backgroundColor"));
    expect(firstPaint.borderWidth).toBe("2px");
    expect(firstPaint.borderColor).toBe(await tokenColor("--accent", "color"));
    expect(secondPaint.borderColor).not.toBe(await tokenColor("--accent", "color"));

    // option 안 대화형 요소 0 — 고름 표시는 `aria-hidden` 비대화형 요소이고 tabindex가 없다. 고른 행만 `--native-accent` 채움.
    await expect(dialog.locator('[role="option"] input')).toHaveCount(0);
    const mark = (locator: typeof first) =>
      locator.locator(':scope > [aria-hidden="true"]').evaluate((el) => ({ tabindex: el.getAttribute("tabindex"), background: getComputedStyle(el).backgroundColor }));
    const firstMark = await mark(first);
    const secondMark = await mark(second);
    expect(firstMark.tabindex).toBeNull();
    expect(secondMark.tabindex).toBeNull();
    expect(firstMark.background).toBe(await tokenColor("--native-accent", "backgroundColor"));
    expect(secondMark.background).not.toBe(await tokenColor("--native-accent", "backgroundColor"));

    // 다시 Space → 풀림 · 1차 숫자 없음.
    await page.keyboard.press("Space");
    await expect(first).toHaveAttribute("aria-selected", "false");
    await expect(primary).toHaveAttribute("aria-disabled", "true");

    // 한 명 고른 뒤 Enter → onPickMany가 그 한 명으로 불리고 닫히며 포커스는 연 버튼으로 돌아온다.
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(result).toHaveText("더함 · 김서연");
    await expect(opener).toBeFocused();
  });

  // 06.2-07 Task 2 — SP-62-1 다중 변형의 나머지 상태. 표본은 「골라내기 — 다중(SP-62-1)」 단추 다섯이다.
  test.describe("다중 고르기(SP-62-1) — 상태", () => {
    const dialogOf = (page: import("@playwright/test").Page) => page.locator("dialog:modal");
    const openerOf = (page: import("@playwright/test").Page, name: string) => page.getByRole("button", { name, exact: true });
    const primaryOf = (page: import("@playwright/test").Page) => dialogOf(page).getByRole("button", { name: /^참여자 더하기/ });
    const optionOf = (page: import("@playwright/test").Page, id: string) => dialogOf(page).locator(`[data-pick-id="${id}"]`);

    test("후보 0 — 목록 자리 한 줄(뒤 · 3차 없음), 1차 aria-describedby가 그 줄을 가리키고 바닥 줄 `고른 사람 없음`은 없다", async ({ page }) => {
      const dialog = dialogOf(page);
      await openerOf(page, "후보 0 고르기 열기").click();
      const empty = dialog.getByText("더할 수 있는 사람 없음", { exact: true });
      await expect(empty).toBeVisible();
      await expect(empty.getByRole("button")).toHaveCount(0);
      await expect(primaryOf(page)).toHaveAttribute("aria-disabled", "true");
      expect(await primaryOf(page).getAttribute("aria-describedby")).toBe(await empty.getAttribute("id"));
      await expect(dialog.getByText("고른 사람 없음")).toHaveCount(0);
    });

    test("검색 0건 — `조건에 맞는 사람이 없습니다 · 검색 지우기`이고 고른 사람은 검색 지우기 뒤에도 체크된 채다", async ({ page }) => {
      const dialog = dialogOf(page);
      await openerOf(page, "다중 고르기 열기").click();
      await optionOf(page, "u1").click();
      await expect(optionOf(page, "u1")).toHaveAttribute("aria-selected", "true");
      await dialog.getByRole("textbox", { name: "사람 검색" }).fill("없는낱말");
      await expect(dialog.getByText("조건에 맞는 사람이 없습니다 · ")).toBeVisible();
      await expect(primaryOf(page)).toHaveText(/참여자 더하기 1/);
      await dialog.getByRole("button", { name: "검색 지우기" }).click();
      await expect(optionOf(page, "u1")).toHaveAttribute("aria-selected", "true");
    });

    test("검색으로 가려진 고름도 결과 줄 · 1차 N에 세고 Enter가 전부 넘긴다(design I6)", async ({ page }) => {
      const dialog = dialogOf(page);
      const search = dialog.getByRole("textbox", { name: "사람 검색" });
      await openerOf(page, "다중 고르기 열기").click();
      await optionOf(page, "u1").click();
      await optionOf(page, "u2").click();
      await search.fill("서연");
      await expect(dialog.getByRole("option")).toHaveCount(1);
      await expect(dialog.getByText("김서연 외 1명 선택")).toBeVisible();
      await expect(primaryOf(page)).toHaveText(/참여자 더하기 2/);
      await search.press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('[data-gallery="pick-many-result"]')).toHaveText("더함 · 김서연, 박지훈");
    });

    // PR #189 Codex P2 — 검색이 오는 동안 남아 있는 옛 목록의 행은 고를 수 없다(단일 변형과 같은 판정). 시계를 멈춰 지연 조회를 붙잡는다.
    test("검색이 오는 동안 옛 목록 행을 누르거나 Space를 쳐도 고르지 않는다 — 새 목록이 오면 고른 사람 0", async ({ page }) => {
      await page.clock.install();
      await page.reload();
      const dialog = dialogOf(page);
      const search = dialog.getByRole("textbox", { name: "사람 검색" });
      await openerOf(page, "다중 고르기 열기").click();
      await expect(optionOf(page, "u2")).toBeVisible();
      await page.clock.pauseAt(new Date(Date.now() + 60_000));
      await search.fill("서연");
      await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(1);
      await optionOf(page, "u2").click();
      await expect(optionOf(page, "u2")).toBeFocused();
      await page.keyboard.press("Space");
      await expect(optionOf(page, "u2")).toHaveAttribute("aria-selected", "false");
      await page.clock.runFor(1_000);
      await expect(dialog.getByRole("option")).toHaveCount(1);
      await expect(dialog.getByText("고른 사람 없음")).toBeVisible();
      await expect(primaryOf(page)).toHaveAttribute("aria-disabled", "true");
    });

    test("목록 실패 — `사람 목록 불러오기 실패 · 다시 시도`, 1차 aria-disabled, 검색 칸은 살아 있다", async ({ page }) => {
      const dialog = dialogOf(page);
      await openerOf(page, "실패 고르기 열기").click();
      const alert = dialog.getByRole("alert");
      await expect(alert).toContainText("사람 목록 불러오기 실패 · ");
      await expect(alert.getByRole("button", { name: "다시 시도" })).toBeVisible();
      await expect(primaryOf(page)).toHaveAttribute("aria-disabled", "true");
      const search = dialog.getByRole("textbox", { name: "사람 검색" });
      await search.fill("김");
      await expect(search).toHaveValue("김");
      await expect(search).toBeEnabled();
    });

    test("거부 — 열린 채 바닥 줄 원문 + 3차 `새로 고침`, 1차 막힘, 체크 유지, 체크를 바꾸면 풀리고 새로 고침은 목록에 없는 고름만 뺀다", async ({ page }) => {
      const dialog = dialogOf(page);
      const search = dialog.getByRole("textbox", { name: "사람 검색" });
      await openerOf(page, "거부 고르기 열기").click();
      await optionOf(page, "u1").click();
      await optionOf(page, "u2").click();
      await page.keyboard.press("Enter");
      // 닫히지 않는다 — 원문(꼬리 뺀 글자) + 3차 새로 고침.
      await expect(dialog.getByText("김서연 더할 수 없음", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "새로 고침", exact: true })).toBeVisible();
      await expect(primaryOf(page)).toHaveAttribute("aria-disabled", "true");
      await expect(optionOf(page, "u1")).toHaveAttribute("aria-selected", "true");
      await expect(optionOf(page, "u2")).toHaveAttribute("aria-selected", "true");
      // 체크를 하나 바꾸면 거부가 걷히고 1차가 풀린다.
      await optionOf(page, "u2").click();
      await expect(dialog.getByText("김서연 더할 수 없음")).toHaveCount(0);
      await expect(primaryOf(page)).not.toHaveAttribute("aria-disabled", "true");
      // 다시 거부 상태로 — 이번엔 첫 시도만 거절이라 닫기 전에 표본을 새로 연다.
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await openerOf(page, "거부 고르기 열기").click();
      await optionOf(page, "u1").click();
      await optionOf(page, "u2").click();
      await search.fill("기획");
      await expect(dialog.getByRole("option")).toHaveCount(2);
      await primaryOf(page).click();
      await dialog.getByRole("button", { name: "새로 고침", exact: true }).click();
      await expect(search).toHaveValue("");
      // 다시 받은 목록에 없는 사람(김서연)만 고름에서 빠지고 나머지는 남는다.
      await expect(optionOf(page, "u1")).toHaveCount(0);
      await expect(optionOf(page, "u2")).toHaveAttribute("aria-selected", "true");
      await expect(primaryOf(page)).toHaveText(/참여자 더하기 1/);
      await expect(primaryOf(page)).not.toHaveAttribute("aria-disabled", "true");
      await expect(dialog.getByText("더할 수 없음")).toHaveCount(0);
      await expect(dialog).toBeVisible();
    });

    test("연결 실패 — 바닥 줄 `더하지 못함 · 다시 시도`이고 1차는 막히지 않아 다시 누를 수 있다", async ({ page }) => {
      const dialog = dialogOf(page);
      await openerOf(page, "연결 고르기 열기").click();
      await optionOf(page, "u1").click();
      await primaryOf(page).click();
      await expect(dialog.getByText("더하지 못함 · 다시 시도", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "새로 고침", exact: true })).toHaveCount(0);
      await expect(primaryOf(page)).not.toHaveAttribute("aria-disabled", "true");
      await primaryOf(page).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('[data-gallery="pick-many-result"]')).toHaveText("더함 · 김서연");
    });

    test("보통 표본 — 50행 상한 + `50건 넘음 · 검색으로 좁히기`, 목록 안만 스크롤, 두 사람 고른 다이얼로그 axe 위반 0 · option 안 input 0", async ({ page }) => {
      const dialog = dialogOf(page);
      await openerOf(page, "다중 고르기 열기").click();
      await expect(dialog.getByRole("option")).toHaveCount(50);
      await expect(dialog.getByText("50건 넘음 · 검색으로 좁히기")).toBeVisible();
      await optionOf(page, "u1").click();
      await optionOf(page, "u2").click();
      const primary = primaryOf(page);
      const before = await primary.boundingBox();
      const body = dialog.locator("div:has(> ul[role='listbox'])").first();
      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      expect((await primary.boundingBox())?.y).toBe(before?.y);
      await body.evaluate((el) => {
        el.scrollTop = 0;
      });
      await expect(dialog.locator('[role="option"] input')).toHaveCount(0);
      const results = await new AxeBuilder({ page }).include("dialog").analyze();
      expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
    });
  });

  // 06.1-03 Task 3 — SP-6106 고르기 목록 확장 다섯(낱말 셋 · preselect · maxSelected · 단일 거부 · limit). 표본은 「고르기 목록」 절의 단추 둘이고 `?pick=document|evidence`로 연 채 렌더한다.
  test.describe("고르기 목록 확장(SP-6106)", () => {
    type PwPage = import("@playwright/test").Page;
    const dialogOf = (page: PwPage) => page.locator("dialog:modal");
    const optionOf = (page: PwPage, id: string) => dialogOf(page).locator(`[data-pick-id="${id}"]`);
    const documentPrimary = (page: PwPage) => dialogOf(page).getByRole("button", { name: /^이 문서에 붙이기/ });
    const evidencePrimary = (page: PwPage, count: number) => dialogOf(page).getByRole("button", { name: new RegExp(`^증빙 붙이기 ${count}(?!\\d)`) });
    const refreshOf = (page: PwPage) => dialogOf(page).getByRole("button", { name: "새로 고침", exact: true });
    const tokenOf = (page: PwPage, name: string, property: "backgroundColor" | "color") =>
      page.evaluate(
        ([token, prop]) => {
          const probe = document.createElement("div");
          probe.style[prop] = `var(${token})`;
          document.body.append(probe);
          const value = getComputedStyle(probe)[prop];
          probe.remove();
          return value;
        },
        [name, property] as const,
      );

    test("?pick=document — 검색 칸 첫 포커스 · 1위 미리 고름(700 + 왼쪽 선) · 막힌 행 aria-disabled + 2행 이유 · 검색 칸 Enter로 붙임", async ({ page }) => {
      await page.goto("/dev/components?pick=document");
      const dialog = dialogOf(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("textbox", { name: "문서 검색" })).toBeFocused();
      const first = optionOf(page, "d1");
      await expect(first).toHaveAttribute("aria-selected", "true");
      await expect(first).toContainText("합계 12,000 → 12,500");
      const paint = await first.evaluate((el) => {
        const style = getComputedStyle(el);
        return { weight: style.fontWeight, width: style.borderInlineStartWidth, color: style.borderInlineStartColor };
      });
      expect(paint.weight).toBe("700");
      expect(paint.width).not.toBe("0px");
      expect(paint.color).toBe(await tokenOf(page, "--accent", "color"));
      await expect(optionOf(page, "d2")).toHaveAttribute("aria-selected", "false");

      const blocked = optionOf(page, "d3");
      await expect(blocked).toHaveAttribute("aria-disabled", "true");
      const reason = blocked.getByText("결재 중 문서 · 결재 끝까지 떼기 없음", { exact: true });
      await expect(reason).toBeVisible();
      expect(await blocked.getAttribute("aria-describedby")).toBe(await reason.getAttribute("id"));

      await expect(dialog.locator('input[type="radio"], input[type="checkbox"]')).toHaveCount(0);
      await expect(documentPrimary(page)).not.toHaveAttribute("aria-disabled", "true");
      await dialog.getByRole("textbox", { name: "문서 검색" }).press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('[data-gallery="pick-document-result"]')).toHaveText("행사 운영비 · 김기획");
    });

    test("?pick=document — 검색어를 바꾼 뒤 결과의 preselect는 무시한다(처음 고름이 그대로)", async ({ page }) => {
      await page.goto("/dev/components?pick=document");
      const dialog = dialogOf(page);
      const counter = page.locator('[data-gallery="pick-document-result"]');
      await expect(optionOf(page, "d1")).toHaveAttribute("aria-selected", "true");
      const before = Number(await counter.getAttribute("data-searches"));
      await dialog.getByRole("textbox", { name: "문서 검색" }).fill("거부");
      await expect(counter).toHaveAttribute("data-searches", String(before + 1));
      await expect(optionOf(page, "d1")).toHaveAttribute("aria-selected", "true");
      await expect(optionOf(page, "d2")).toHaveAttribute("aria-selected", "false");
    });

    test("?pick=document 서버 거부 ㉠ — 열린 채 · 바닥 거부 줄(꼬리 뺌) · 새로 고침 3차 · 1차 aria-disabled, 꼬리는 검색을 비우고 다시 받으며 다른 행을 고르면 풀린다", async ({ page }) => {
      await page.goto("/dev/components?pick=document");
      const dialog = dialogOf(page);
      const search = dialog.getByRole("textbox", { name: "문서 검색" });
      const counter = page.locator('[data-gallery="pick-document-result"]');
      await optionOf(page, "d5").click();
      await documentPrimary(page).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("이미 다른 문서에 붙음", { exact: true })).toBeVisible();
      await expect(refreshOf(page)).toHaveCount(1);
      await expect(documentPrimary(page)).toHaveAttribute("aria-disabled", "true");
      // 거부가 붙은 동안 검색 칸 Enter도 아무 일 없다.
      await search.press("Enter");
      await expect(dialog).toBeVisible();

      const before = Number(await counter.getAttribute("data-searches"));
      await refreshOf(page).click();
      await expect(search).toHaveValue("");
      await expect(counter).toHaveAttribute("data-searches", String(before + 1));
      await expect(dialog.getByText("이미 다른 문서에 붙음", { exact: true })).toHaveCount(0);

      // 같은 거부 뒤 다른 행을 고르면 거부 줄이 사라지고 1차가 살아난다.
      await optionOf(page, "d5").click();
      await documentPrimary(page).click();
      await expect(dialog.getByText("이미 다른 문서에 붙음", { exact: true })).toBeVisible();
      await optionOf(page, "d2").click();
      await expect(dialog.getByText("이미 다른 문서에 붙음", { exact: true })).toHaveCount(0);
      await expect(documentPrimary(page)).not.toHaveAttribute("aria-disabled", "true");
    });

    test("?pick=document 서버 거부 ㉡ 연결 실패 — 꼬리 없는 사유 · 새로 고침 0 · 1차는 막히지 않는다 / ㉢ false — 열린 채 · 거부 줄 없음", async ({ page }) => {
      await page.goto("/dev/components?pick=document");
      const dialog = dialogOf(page);
      await optionOf(page, "d6").click();
      await documentPrimary(page).click();
      await expect(dialog.getByText("붙이지 못함 · 다시 시도", { exact: true })).toBeVisible();
      await expect(refreshOf(page)).toHaveCount(0);
      await expect(documentPrimary(page)).not.toHaveAttribute("aria-disabled", "true");

      await optionOf(page, "d7").click();
      await expect(dialog.getByText("붙이지 못함 · 다시 시도", { exact: true })).toHaveCount(0);
      await documentPrimary(page).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("붙이지 못함", { exact: false })).toHaveCount(0);
      await expect(dialog.getByText("이미 다른 문서에 붙음", { exact: true })).toHaveCount(0);
      await expect(refreshOf(page)).toHaveCount(0);
      await expect(documentPrimary(page)).not.toHaveAttribute("aria-disabled", "true");
    });

    test("?pick=evidence — 미리 고른 하나가 체크 표시 · 결과 줄 `고른 1건` · 상한 3에서 넷째는 무반응 + 바닥 줄 상한 글자 · 1차는 막히지 않고 input 0", async ({ page }) => {
      await page.goto("/dev/components?pick=evidence");
      const dialog = dialogOf(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("textbox", { name: "증빙 검색" })).toBeFocused();
      await expect(optionOf(page, "e1")).toHaveAttribute("aria-selected", "true");
      const mark = (id: string) => optionOf(page, id).locator(':scope > [aria-hidden="true"]').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(await mark("e1")).toBe(await tokenOf(page, "--native-accent", "backgroundColor"));
      await expect(dialog.getByText("고른 1건", { exact: true })).toBeVisible();
      await expect(evidencePrimary(page, 1)).toBeVisible();
      await expect(dialog.locator('input[type="radio"], input[type="checkbox"]')).toHaveCount(0);
      await expect(dialog.getByText("3건 상한 · 나눠 붙이기")).toHaveCount(0);

      await optionOf(page, "e2").click();
      await optionOf(page, "e3").click();
      const cap = dialog.getByText("3건 상한 · 나눠 붙이기", { exact: true });
      await expect(cap).toBeVisible();
      await expect(dialog.getByText("고른 3건", { exact: true })).toHaveCount(0);
      await expect(evidencePrimary(page, 3)).toBeVisible();
      await expect(evidencePrimary(page, 3)).not.toHaveAttribute("aria-disabled", "true");

      await optionOf(page, "e4").click();
      await expect(optionOf(page, "e4")).toHaveAttribute("aria-selected", "false");
      await expect(evidencePrimary(page, 3)).toBeVisible();
      await expect(cap).toBeVisible();

      // 고른 행 풀기는 상한과 무관하게 늘 된다.
      await optionOf(page, "e3").click();
      await expect(optionOf(page, "e3")).toHaveAttribute("aria-selected", "false");
      await expect(cap).toHaveCount(0);
      await expect(dialog.getByText("고른 2건", { exact: true })).toBeVisible();
      await optionOf(page, "e3").click();

      await evidencePrimary(page, 3).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('[data-gallery="pick-evidence-result"]')).toHaveText("붙임 · 세금계산서 · 표본 거래처 가, 카드 사용 · 표본 가맹점 나, 세금계산서 · 표본 거래처 다");
    });

    test("?pick=evidence — 상한에 닿은 채 거부가 오면 바닥 줄은 거부 글자 하나뿐이고 상한 줄은 숨는다", async ({ page }) => {
      await page.goto("/dev/components?pick=evidence");
      const dialog = dialogOf(page);
      await optionOf(page, "e2").click();
      await optionOf(page, "e5").click();
      await expect(dialog.getByText("3건 상한 · 나눠 붙이기", { exact: true })).toBeVisible();
      await evidencePrimary(page, 3).click();
      await expect(dialog.getByText("이미 다른 문서에 붙음", { exact: true })).toBeVisible();
      await expect(dialog.getByText("3건 상한 · 나눠 붙이기")).toHaveCount(0);
      await expect(refreshOf(page)).toHaveCount(1);
      await expect(evidencePrimary(page, 3)).toHaveAttribute("aria-disabled", "true");
    });

    test("?pick=evidence — 넘침 줄은 limit 글자(20건)이고 기본 50 글자는 쓰이지 않는다", async ({ page }) => {
      await page.goto("/dev/components?pick=evidence");
      const dialog = dialogOf(page);
      await expect(dialog.getByText("건 넘음")).toHaveCount(0);
      await dialog.getByRole("textbox", { name: "증빙 검색" }).fill("넘침");
      await expect(dialog.getByText("20건 넘음 · 검색으로 좁히기", { exact: true })).toBeVisible();
      await expect(dialog.getByText("50건 넘음")).toHaveCount(0);
    });
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

test.describe("로그인한 뒤 · 폰 375 — 시트 두 3차(SP-6107)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("?sheet=two-actions — 시트 안 3차 둘(위 증빙 고르기 3 · 아래 요청 취소)이 위에서 아래로 서고 각 높이 44 이상", async ({ page }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/dev/components?sheet=two-actions");
    const dialog = page.locator("dialog:modal");
    await expect(dialog).toBeVisible();
    const cancel = dialog.getByRole("button", { name: "요청 취소" });
    const pick = dialog.getByRole("button", { name: "증빙 고르기 3" });
    const a = await cancel.boundingBox();
    const b = await pick.boundingBox();
    if (!a || !b) throw new Error("3차 상자를 잴 수 없다");
    expect(a.height).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(a.y).toBeGreaterThanOrEqual(b.y + b.height);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
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
