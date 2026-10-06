import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { expectGapsAtLeastToken, expectNoRowOverflow, loginAsSysadmin } from "./row-actions-helpers";
import { randomUUID } from "node:crypto";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertCodeItem, setCodeItemActive } from "@/repositories/code-tables";

// 04.6-15 — 「코드 추가」는 옆 패널이고 등록에 성공하면 패널이 열린 채 칸이 비고 결과 한 줄이 뜬다(UQ-8 B). 목록을 이어 보려면 Esc로 닫는다
// (칸이 비어 확인 없이 닫힘 — DR1 A).
const PANEL = 'dialog[data-ui="side-panel"]';

async function addCodeItemInPanel(
  page: Page,
  fields: { value: string; label: string; description?: string },
): Promise<void> {
  const dialog = page.locator(PANEL);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("값", { exact: true }).fill(fields.value);
  await dialog.getByLabel("이름", { exact: true }).fill(fields.label);
  if (fields.description !== undefined) await dialog.getByLabel("설명", { exact: true }).fill(fields.description);
  await dialog.getByRole("button", { name: "코드 추가" }).click();
  await expect(dialog.getByRole("status")).toHaveText("코드 추가됨");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}

// 설명 입력은 폰 접힌 줄과 PC 열에 한 번씩 그려지고(StaticTable P2) 보이는 쪽은 폭마다 하나다 — 보이는 입력만 집는다.
function visibleDescription(page: Page, label: string): Locator {
  return page.getByLabel(`${label} 설명`).locator("visible=true");
}

test.describe("코드표 관리 화면 (MAST-04, ADMN-01, D-36 계약: 화면 코드에 계급 이름 분기 없음)", () => {
  test("시스템 관리자 계급은 코드표 항목을 추가하고 목록에서 확인한다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/code-tables");
    expect(response?.status()).toBe(200);

    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「코드 추가」가 그 폼을 연다.
    await expect(page.getByLabel("값")).toHaveCount(0);
    await page.getByRole("link", { name: "코드 추가" }).click();

    const value = `e2e-${Date.now()}`;
    await addCodeItemInPanel(page, { value, label: "E2E 코드" });

    await expect(page.getByText(value)).toBeVisible();
  });

  test("기획 PM 계급은 코드표 관리 화면에서 404를 받는다 — 권한표가 이 계급에 메뉴를 주지 않았기 때문이다", async ({
    page,
  }) => {
    const pm = await createFixtureUser({ roleId: "role-pm" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/code-tables");
    expect(response?.status()).toBe(404);
  });

  // 사용자 QA 보고: 코드표 선택 링크가 「프로젝트 상태증빙 종류」로 붙어 보인다.
  // .filterRow가 display:flex인데 gap이 없다(code-tables.module.css) — 링크가
  // 하나뿐인 「숨김 포함」 줄에서는 드러나지 않았지만, 코드표 선택 nav는 링크가
  // 둘이라 두 이름이 한 덩어리로 읽힌다.
  // quick 261001-hfi(MAST-04) — 견적 분류가 세 번째 표로 늘었다. 이웃한 링크 쌍마다 간격을 본다(05-03 — 지급 방식이 네 번째).
  test("코드표 선택 링크 넷이 서로 붙어 있지 않다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/code-tables");

    const nav = page.getByRole("navigation", { name: "코드표 선택" });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(4);
    await expect(links.nth(2)).toHaveText("견적 분류");
    await expect(links.nth(3)).toHaveText("지급 방식");

    for (const index of [0, 1, 2]) {
      const left = await links.nth(index).boundingBox();
      const right = await links.nth(index + 1).boundingBox();
      expect(left).not.toBeNull();
      expect(right).not.toBeNull();
      // 두 상자 사이의 가로 간격. 붙어 있으면 0이다.
      const gap = right!.x - (left!.x + left!.width);
      expect(gap).toBeGreaterThan(0);
    }
  });

  test("「견적 분류」를 고르면 견적 분류 코드표(시드 「무대·시공」)가 보인다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/code-tables");
    await page.getByRole("navigation", { name: "코드표 선택" }).getByRole("link", { name: "견적 분류" }).click();
    await expect(page).toHaveURL(/tableKey=quote_subcategory/);
    await expect(page.locator("main table").first().getByText("stage_construction")).toBeVisible();
  });

  // DR-P4-01(design-review) — 현재 표 링크가 형제 링크와 계산 스타일이 같아
  // 어느 표가 켜져 있는지 시각으로 구분되지 않았다. §7-16 「현재 번호는
  // --text-strong 700, 밑줄 없음」과 같은 결로 aria-current="page" 링크만 구분한다.
  test("현재 표 링크는 형제 링크와 색·굵기·밑줄로 구분된다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/code-tables");

    const nav = page.getByRole("navigation", { name: "코드표 선택" });
    const current = nav.locator("a[aria-current='page']");
    const sibling = nav.locator("a:not([aria-current='page'])");
    await expect(current).toHaveCount(1);
    await expect(sibling).toHaveCount(3);

    // 현재 표 링크 색 = 역할 토큰 --text-strong(04.6-15: 스킨 A 역할 토큰). 토큰 값은 hex라 브라우저가 계산하는 rgb() 문자열과 직접
    // 비교하려고 임시 요소에 먹여 같은 방식으로 정규화한다.
    const fgAsRgb = await page.evaluate(() => {
      const fgHex = getComputedStyle(document.documentElement).getPropertyValue("--text-strong").trim();
      const probe = document.createElement("div");
      probe.style.color = fgHex;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    });

    const currentStyle = await current.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        color: computed.color,
        fontWeight: computed.fontWeight,
        textDecorationLine: computed.textDecorationLine,
      };
    });
    expect(currentStyle.color).toBe(fgAsRgb);
    expect(currentStyle.fontWeight).toBe("700");
    expect(currentStyle.textDecorationLine).toBe("none");

    const siblingTextDecoration = await sibling.first().evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(siblingTextDecoration).toBe("underline");
  });

  // F-07·F-08(260922-o2b) — SYSTEM.md §2-4 「모든 숫자 칸은 우측 정렬,
  // tabular-nums, nowrap」·「값이 없으면 — 하나」. 시드 코드(project_status)는
  // 전부 정상 상태라 상태 칸이 빈칸이었다.
  test("「정렬」 칸이 우측 정렬·tabular-nums·nowrap이고 「상태」 칸에 —가 있다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/code-tables");

    const table = page.locator("main table").first();
    const headerCells = table.locator("thead th");
    const headerTexts = await headerCells.allTextContents();
    const sortColIndex = headerTexts.findIndex((text) => text.trim() === "정렬");
    const statusColIndex = headerTexts.findIndex((text) => text.trim() === "상태");
    expect(sortColIndex).toBeGreaterThanOrEqual(0);
    expect(statusColIndex).toBeGreaterThanOrEqual(0);

    // 04.6-15: 숫자 서식(tabular-nums)은 `ui/num`의 `Num`만 가진다(stylelint) — 머리글·칸은 우측 정렬 + nowrap, 숫자 글자는 칸 안 Num이 tabular-nums.
    const sortTh = headerCells.nth(sortColIndex);
    await expect(sortTh).toHaveCSS("text-align", "right");
    await expect(sortTh).toHaveCSS("white-space", "nowrap");

    const firstRow = table.locator("tbody tr").first();
    const sortTd = firstRow.locator(":scope > :is(td, th)").nth(sortColIndex);
    await expect(sortTd).toHaveCSS("text-align", "right");
    await expect(sortTd).toHaveCSS("white-space", "nowrap");
    const sortNumFontVariant = await sortTd.locator("span").first().evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(sortNumFontVariant).toContain("tabular-nums");

    const emDashStatusCells = table.locator(`tbody tr td:nth-child(${statusColIndex + 1})`).filter({ hasText: "—" });
    expect(await emDashStatusCells.count()).toBeGreaterThan(0);
  });
});

// 04-10(D-93 · DR-29) — 코드표 값 설명. 표가 값·이름·설명·정렬·상태·동작
// 여섯 열이 됐다(objective 메모 (a) 회귀 대상).
test.describe("코드표 항목 설명 (D-93, UI-SPEC rev 5 S14, DR-29)", () => {
  async function loginAsSysadmin(page: Page): Promise<void> {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
  }

  // blur 저장은 화면에 성공 표시가 없다 — 서버 액션 응답을 기다리지 않고
  // 새로 고치면 진행 중 요청이 끊겨 값이 남지 않는다(CI 경합).
  async function blurAndWaitForSave(page: Page, input: Locator) {
    const saved = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/admin/code-tables"),
    );
    await input.blur();
    await saved;
  }

  // (a) 설명을 고치고 다른 칸을 눌러 저장한 뒤 새로 고쳐도 값이 남는다.
  test("설명을 고치고 포커스를 옮기면 저장되고 새로 고쳐도 남는다", async ({ page }) => {
    await loginAsSysadmin(page);

    const stamp = Date.now();
    const value = `e2e-desc-${stamp}`;
    const label = `설명대상-${stamp}`;

    await page.goto("/admin/code-tables?new=1");
    await addCodeItemInPanel(page, { value, label });
    await expect(page.getByRole("cell", { name: value })).toBeVisible();

    const descriptionInput = visibleDescription(page, label);
    await descriptionInput.fill("무대·부스 설치와 철거 공사");
    await blurAndWaitForSave(page, descriptionInput);
    await expect(page.getByText("설명 40자 초과 · 한 문장으로 축약")).toHaveCount(0);

    await page.reload();
    await expect(visibleDescription(page, label)).toHaveValue("무대·부스 설치와 철거 공사");
  });

  // (b) 41자 입력 → blur → 오류 한 줄 + 41/40 + 값이 41자 그대로(DR-29) →
  // 한 글자 지우고 blur → 오류·글자 수 사라지고 새로 고쳐도 40자 값 →
  // 다시 41자로 고친 뒤 Escape → 서버 값(40자)으로 돌아가고 오류 없음.
  test("41자 설명은 거부되고 입력이 남는다 — Esc만 서버 값으로 되돌린다", async ({ page }) => {
    await loginAsSysadmin(page);

    const stamp = Date.now();
    const value = `e2e-desc40-${stamp}`;
    const label = `40자대상-${stamp}`;
    const forty = "가".repeat(40);
    const fortyOne = "가".repeat(41);

    await page.goto("/admin/code-tables?new=1");
    await addCodeItemInPanel(page, { value, label });
    await expect(page.getByRole("cell", { name: value })).toBeVisible();

    const descriptionInput = visibleDescription(page, label);
    await descriptionInput.fill(forty);
    await descriptionInput.blur();
    await expect(page.getByText("설명 40자 초과 · 한 문장으로 축약")).toHaveCount(0);

    await descriptionInput.fill(fortyOne);
    await descriptionInput.blur();
    await expect(page.getByText("설명 40자 초과 · 한 문장으로 축약")).toBeVisible();
    await expect(page.getByText("41/40")).toBeVisible();
    await expect(descriptionInput).toHaveValue(fortyOne);

    // 한 글자 지우고 blur — 오류·글자 수가 사라지고 새로 고쳐도 40자 값.
    await descriptionInput.fill(forty);
    await descriptionInput.blur();
    await expect(page.getByText("설명 40자 초과 · 한 문장으로 축약")).toHaveCount(0);
    await expect(page.getByText("41/40")).toHaveCount(0);
    await page.reload();
    await expect(visibleDescription(page, label)).toHaveValue(forty);

    // 다시 41자로 고친 뒤 Escape — 서버 값(40자)으로 돌아가고 오류가 없다.
    const descriptionInputAfterReload = visibleDescription(page, label);
    await descriptionInputAfterReload.fill(fortyOne);
    await descriptionInputAfterReload.press("Escape");
    await expect(descriptionInputAfterReload).toHaveValue(forty);
    await expect(page.getByText("설명 40자 초과 · 한 문장으로 축약")).toHaveCount(0);
  });

  // (c) 설명을 지우고 blur → 새로 고쳐도 설명 칸이 비고 읽기 표시가 —다(C-13).
  test("설명을 지우면 null로 저장되고 새로 고쳐도 —다", async ({ page }) => {
    await loginAsSysadmin(page);

    const stamp = Date.now();
    const value = `e2e-desc-clear-${stamp}`;
    const label = `지우기대상-${stamp}`;

    await page.goto("/admin/code-tables?new=1");
    await addCodeItemInPanel(page, { value, label });
    await expect(page.getByRole("cell", { name: value })).toBeVisible();

    const descriptionInput = visibleDescription(page, label);
    await descriptionInput.fill("지울 설명");
    await blurAndWaitForSave(page, descriptionInput);
    await page.reload();
    await expect(visibleDescription(page, label)).toHaveValue("지울 설명");

    const descriptionInputAgain = visibleDescription(page, label);
    await descriptionInputAgain.fill("");
    await blurAndWaitForSave(page, descriptionInputAgain);

    await page.reload();
    // 값이 지워졌다는 증거는 DB에서 다시 읽은 입력값이 빈 문자열이라는
    // 것이다(DB가 null이 아니면 옛 값이 그대로 보인다) — 관리자(canWrite)는
    // 화면에서 계속 편집 가능한 입력칸을 보며, 자리표시자는 형식 예만 쓴다는
    // 원칙(SYSTEM.md)에 따라 빈 칸은 그냥 빈 칸이다(placeholder 없음).
    const descriptionInputAfterClear = visibleDescription(page, label);
    await expect(descriptionInputAfterClear).toHaveValue("");
    await expect(descriptionInputAfterClear).not.toHaveAttribute("placeholder", "—");
  });

  // (d) 증빙 종류 표의 세금 규칙 행 colSpan이 새 열 수와 맞는다 — 머리글
  // 개수와 합친 행의 colSpan이 같아야 표가 안 넓어진다.
  test("증빙 종류 표의 세금 규칙 행 colSpan이 여섯 열(동작 있음)과 맞는다", async ({ page }) => {
    await loginAsSysadmin(page);

    await page.goto("/admin/code-tables?tableKey=evidence_type");
    const table = page.locator("main table").first();
    const headerCount = await table.locator("thead th").count();
    // 04.6-15: 세금 규칙 줄은 StaticTable의 행 아래 전폭 줄(`rows[i].detail`) — 접힌 줄(폰용)도 colSpan 칸이라 줄 이름으로 집는다.
    const taxRuleRow = table.locator('tbody tr[data-ui="static-table-detail"]').first();
    const colSpanAttr = await taxRuleRow.locator("td[colspan]").getAttribute("colspan");
    expect(Number(colSpanAttr)).toBe(headerCount);
  });

  // Task 2 ③ — 「코드 추가」 폼에서 설명과 함께 추가하면 목록에 그 설명이 있다.
  test("「코드 추가」 폼에서 설명과 함께 추가하면 목록에 반영된다", async ({ page }) => {
    await loginAsSysadmin(page);

    const stamp = Date.now();
    const value = `e2e-desc-create-${stamp}`;
    const label = `추가시설명-${stamp}`;

    await page.goto("/admin/code-tables?new=1");
    await addCodeItemInPanel(page, { value, label, description: "추가 폼에서 적은 설명" });

    await expect(page.getByRole("cell", { name: value })).toBeVisible();
    await expect(visibleDescription(page, label)).toHaveValue("추가 폼에서 적은 설명");
  });

  // 리뷰 후속 — 증빙 종류 세금 규칙의 「최소 징수액」 칸도 parseNumberInput(...) ??
  // 0이 NaN을 통과시킨다. 칸을 지우고 '-'만 남기고 블러하면 서버로 의미
  // 없는 NaN 요청이 나간다 — 고친 뒤엔 그 블러가 서버 액션을 부르지 않는다.
  test("「최소 징수액」 칸을 지우고 '-'만 남기면 서버 액션을 부르지 않는다", async ({ page }) => {
    await loginAsSysadmin(page);

    const stamp = Date.now();
    const value = `e2e-tax-${stamp}`;
    const label = `세금규칙대상-${stamp}`;

    await page.goto("/admin/code-tables?tableKey=evidence_type&new=1");
    await addCodeItemInPanel(page, { value, label });
    await expect(page.getByRole("cell", { name: value })).toBeVisible();

    const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: value }) });
    // 접힌 줄(폰용)이 사이에 있을 수 있어 첫 형제가 아니라 세금 규칙 줄(detail)을 집는다.
    const taxRuleRow = row.locator('xpath=following-sibling::tr[@data-ui="static-table-detail"][1]');
    await taxRuleRow.getByLabel("규칙 종류").selectOption("withholding");

    const minWithholdingInput = taxRuleRow.getByLabel("최소 징수액");
    await minWithholdingInput.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await page.keyboard.type("-");

    let actionRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"] !== undefined) actionRequests++;
    });
    await minWithholdingInput.blur();

    // 대조 요청: 유효한 값을 넣고 블러해 저장 응답을 기다린다. 서버 액션은
    // 순서대로 나가므로 '-' 블러가 요청을 보냈다면 이 응답 전에 이미 잡힌다.
    await minWithholdingInput.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("4321");
    const controlResponse = page.waitForResponse(
      (response) =>
        response.request().headers()["next-action"] !== undefined &&
        (response.request().postData() ?? "").includes("4321"),
    );
    await minWithholdingInput.blur();
    await controlResponse;
    expect(actionRequests).toBe(1);
  });
});

// 260930-f3l /design-review FINDING-001: 코드표 표 행 동작 「비활성화 · 삭제」 사이 가로 간격이 0px라 한 낱말처럼 읽혔다.
// 사람 목록(PR #108)의 .rowActions 규칙(--s-4)을 같은 이름으로 적용한다(SYSTEM §6-1). 700은 .rowActions가 nowrap을 지키는 가장 좁은 폭(D3).
test.describe("코드표 행 동작 간격 --s-4 (260930-f3l FINDING-001)", () => {
  async function seed(): Promise<{ target: string; cleanup: () => Promise<void> }> {
    const stamp = randomUUID().slice(0, 8);
    // 다른 열이 긴 행이 있어야 동작 칸이 눌린다 — 앞 테스트가 남긴 데이터에 기대지 않는다.
    const long = await insertCodeItem(SYSTEM_VIEWER, {
      tableKey: "project_status",
      value: `gap-long-${stamp}-${"x".repeat(50)}`,
      label: `${"가".repeat(60)}${stamp}`,
      sortOrder: 900,
    });
    const target = await insertCodeItem(SYSTEM_VIEWER, {
      tableKey: "project_status",
      value: `gap-target-${stamp}`,
      label: `간격대상-${stamp}`,
      sortOrder: 901,
    });
    return {
      target: target.value,
      cleanup: async () => {
        await setCodeItemActive(SYSTEM_VIEWER, long.id, false);
        await setCodeItemActive(SYSTEM_VIEWER, target.id, false);
      },
    };
  }

  for (const width of [1280, 768, 700]) {
    test(`${width}: 비활성화 · 삭제 사이가 한 줄에서 --s-4 이상이고 표가 넘치지 않는다`, async ({ page }) => {
      const { target, cleanup } = await seed();
      try {
        await page.setViewportSize({ width, height: 800 });
        await loginAsSysadmin(page);
        await page.goto("/admin/code-tables");
        const row = page.locator("tr", { hasText: target });
        const deactivate = row.getByRole("button", { name: "비활성화" });
        const remove = row.getByRole("button", { name: "삭제" });
        await expectNoRowOverflow(page, row, `${width}px 일반 상태`);
        const gaps = await expectGapsAtLeastToken(page, [deactivate, remove], `${width}px`);
        expect(gaps.every((item) => item.horizontal), `${width}px 한 줄`).toBe(true);
      } finally {
        await cleanup();
      }
    });
  }

  for (const width of [700, 768, 1024, 1280]) {
    test(`${width}: 「삭제」를 누른 뒤에도 페이지와 표가 가로로 넘치지 않는다`, async ({ page }) => {
      const { target, cleanup } = await seed();
      try {
        await page.setViewportSize({ width, height: 800 });
        await loginAsSysadmin(page);
        await page.goto("/admin/code-tables");
        const row = page.locator("tr", { hasText: target });
        await row.getByRole("button", { name: "삭제" }).click();
        await expect(row.getByRole("button", { name: "취소" })).toBeVisible();
        await expectNoRowOverflow(page, row, `${width}px 확인 상태`);
      } finally {
        await cleanup();
      }
    });
  }
});

// 04.6-15 — 「코드 추가」가 목록을 밀지 않는 옆 패널로 열린다(SC 3 · 공통 §6). UQ-8 B · DR1 A. `tableKey`는 패널을 열어도 유지된다.
test.describe("코드표 옆 패널 (04.6-15)", () => {
  test("「코드 추가」가 tableKey를 유지한 패널로 열리고 바뀐 칸 없이 닫으면 여는 링크로 포커스가 돌아온다", async ({ page }) => {
    await loginAsSysadmin(page);
    const response = await page.goto("/admin/code-tables?tableKey=evidence_type");
    expect(response?.status(), "목록 응답(R1)").toBe(200);
    const open = page.getByRole("link", { name: "코드 추가" });
    await open.click();
    await expect(page.locator(PANEL)).toBeVisible();
    await expect(page).toHaveURL(/tableKey=evidence_type&new=1$/);
    // 여는 요소는 패널이 열려도 목록에 남는다(R4).
    await expect(open).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(PANEL)).toHaveCount(0);
    await expect(open).toBeFocused();
    await expect(page).toHaveURL(/tableKey=evidence_type/);
  });

  test("등록 성공 뒤 패널이 열린 채 칸이 비고 첫 칸에 포커스가 가며 결과 한 줄이 있다(UQ-8 B)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/code-tables?new=1");
    const dialog = page.locator(PANEL);
    await expect(dialog).toBeVisible();
    const stamp = Date.now();
    await dialog.getByLabel("값", { exact: true }).fill(`e2e-panel-${stamp}`);
    await dialog.getByLabel("이름", { exact: true }).fill(`패널코드-${stamp}`);
    await dialog.getByRole("button", { name: "코드 추가" }).click();
    await expect(dialog.getByRole("status")).toHaveText("코드 추가됨");
    await expect(dialog.getByLabel("값", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("값", { exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("cell", { name: `e2e-panel-${stamp}` })).toBeVisible();
  });

  test("칸을 바꾼 채 Esc는 「입력 버리기」 확인 창이다(DR1 A)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/code-tables?new=1");
    const dialog = page.locator(PANEL);
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("값", { exact: true }).fill("버릴-입력");
    await page.keyboard.press("Escape");
    const confirm = page.getByRole("dialog", { name: "입력 버리기" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "입력 버리기" }).click();
    await expect(dialog).toHaveCount(0);
  });
});

// 04.6-10 — 프로젝트 상태 이름은 화면 전체에서 고정 낱말이라 코드표에서도 읽기 전용이다(서버도 거부 — 통합 테스트). 설명·정렬·활성 등 다른 열은 그대로다.
test.describe("코드표 프로젝트 상태 — 이름 읽기 전용 (04.6-10)", () => {
  test("다섯 값의 이름 칸에 입력이 없고 글자만 있으며, 설명 칸과 증빙 종류 표의 이름 칸은 그대로 편집된다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/code-tables?tableKey=project_status");
    for (const word of ["수주중", "진행", "정산", "완료", "미수주"]) {
      await expect(page.getByLabel(`${word} 이름`)).toHaveCount(0);
      // 이름 열은 행 머리글(rowheader)이다 — 폰 320 이름 칸 바닥 폭(2026-10-04).
      await expect(page.getByRole("rowheader", { name: word, exact: true })).toBeVisible();
    }
    await expect(page.getByLabel("수주중 설명").locator("visible=true")).toBeVisible();

    await page.goto("/admin/code-tables?tableKey=evidence_type");
    await expect(page.locator('input[aria-label$=" 이름"]').first()).toBeVisible();
  });
});
