import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";

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
    await page.getByLabel("값").fill(value);
    await page.locator("#code-item-form").getByLabel("이름").fill("E2E 코드");
    await page.getByRole("button", { name: "코드 추가" }).click();

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
  test("코드표 선택 링크 둘이 서로 붙어 있지 않다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/code-tables");

    const nav = page.getByRole("navigation", { name: "코드표 선택" });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(2);

    const first = await links.nth(0).boundingBox();
    const second = await links.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // 두 상자 사이의 가로 간격. 붙어 있으면 0이다.
    const gap = second!.x - (first!.x + first!.width);
    expect(gap).toBeGreaterThan(0);
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

    const sortTh = headerCells.nth(sortColIndex);
    await expect(sortTh).toHaveCSS("text-align", "right");
    await expect(sortTh).toHaveCSS("white-space", "nowrap");
    const sortThFontVariant = await sortTh.evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(sortThFontVariant).toContain("tabular-nums");

    const firstRow = table.locator("tbody tr").first();
    const sortTd = firstRow.locator("td").nth(sortColIndex);
    await expect(sortTd).toHaveCSS("text-align", "right");
    await expect(sortTd).toHaveCSS("white-space", "nowrap");
    const sortTdFontVariant = await sortTd.evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(sortTdFontVariant).toContain("tabular-nums");

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
    await page.getByLabel("값").fill(value);
    await page.getByLabel("이름", { exact: true }).fill(label);
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByRole("cell", { name: value })).toBeVisible();

    const descriptionInput = page.getByLabel(`${label} 설명`);
    await descriptionInput.fill("무대·부스 설치와 철거 공사");
    await blurAndWaitForSave(page, descriptionInput);
    await expect(page.getByText("설명이 40자를 넘습니다", { exact: false })).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel(`${label} 설명`)).toHaveValue("무대·부스 설치와 철거 공사");
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
    await page.getByLabel("값").fill(value);
    await page.getByLabel("이름", { exact: true }).fill(label);
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByRole("cell", { name: value })).toBeVisible();

    const descriptionInput = page.getByLabel(`${label} 설명`);
    await descriptionInput.fill(forty);
    await descriptionInput.blur();
    await expect(page.getByText("설명이 40자를 넘습니다", { exact: false })).toHaveCount(0);

    await descriptionInput.fill(fortyOne);
    await descriptionInput.blur();
    await expect(page.getByText("설명이 40자를 넘습니다 · 한 문장으로 줄여 주세요")).toBeVisible();
    await expect(page.getByText("41/40")).toBeVisible();
    await expect(descriptionInput).toHaveValue(fortyOne);

    // 한 글자 지우고 blur — 오류·글자 수가 사라지고 새로 고쳐도 40자 값.
    await descriptionInput.fill(forty);
    await descriptionInput.blur();
    await expect(page.getByText("설명이 40자를 넘습니다", { exact: false })).toHaveCount(0);
    await expect(page.getByText("41/40")).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel(`${label} 설명`)).toHaveValue(forty);

    // 다시 41자로 고친 뒤 Escape — 서버 값(40자)으로 돌아가고 오류가 없다.
    const descriptionInputAfterReload = page.getByLabel(`${label} 설명`);
    await descriptionInputAfterReload.fill(fortyOne);
    await descriptionInputAfterReload.press("Escape");
    await expect(descriptionInputAfterReload).toHaveValue(forty);
    await expect(page.getByText("설명이 40자를 넘습니다", { exact: false })).toHaveCount(0);
  });

  // (c) 설명을 지우고 blur → 새로 고쳐도 설명 칸이 비고 읽기 표시가 —다(C-13).
  test("설명을 지우면 null로 저장되고 새로 고쳐도 —다", async ({ page }) => {
    await loginAsSysadmin(page);

    const stamp = Date.now();
    const value = `e2e-desc-clear-${stamp}`;
    const label = `지우기대상-${stamp}`;

    await page.goto("/admin/code-tables?new=1");
    await page.getByLabel("값").fill(value);
    await page.getByLabel("이름", { exact: true }).fill(label);
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByRole("cell", { name: value })).toBeVisible();

    const descriptionInput = page.getByLabel(`${label} 설명`);
    await descriptionInput.fill("지울 설명");
    await blurAndWaitForSave(page, descriptionInput);
    await page.reload();
    await expect(page.getByLabel(`${label} 설명`)).toHaveValue("지울 설명");

    const descriptionInputAgain = page.getByLabel(`${label} 설명`);
    await descriptionInputAgain.fill("");
    await blurAndWaitForSave(page, descriptionInputAgain);

    await page.reload();
    // 값이 지워졌다는 증거는 DB에서 다시 읽은 입력값이 빈 문자열이라는
    // 것이다(DB가 null이 아니면 옛 값이 그대로 보인다) — 관리자(canWrite)는
    // 화면에서 계속 편집 가능한 입력칸을 보므로 정적 「—」 글자가 아니라
    // 빈 칸 + placeholder 「—」(S14 「값이 없으면 — 하나」와 같은 시각).
    const descriptionInputAfterClear = page.getByLabel(`${label} 설명`);
    await expect(descriptionInputAfterClear).toHaveValue("");
    await expect(descriptionInputAfterClear).toHaveAttribute("placeholder", "—");
  });

  // (d) 증빙 종류 표의 세금 규칙 행 colSpan이 새 열 수와 맞는다 — 머리글
  // 개수와 합친 행의 colSpan이 같아야 표가 안 넓어진다.
  test("증빙 종류 표의 세금 규칙 행 colSpan이 여섯 열(동작 있음)과 맞는다", async ({ page }) => {
    await loginAsSysadmin(page);

    await page.goto("/admin/code-tables?tableKey=evidence_type");
    const table = page.locator("main table").first();
    const headerCount = await table.locator("thead th").count();
    const taxRuleRow = table.locator("tbody tr").filter({ has: page.locator("td[colspan]") }).first();
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
    await page.getByLabel("값").fill(value);
    await page.getByLabel("이름", { exact: true }).fill(label);
    await page.getByLabel("설명", { exact: true }).fill("추가 폼에서 적은 설명");
    await page.getByRole("button", { name: "코드 추가" }).click();

    await expect(page.getByRole("cell", { name: value })).toBeVisible();
    await expect(page.getByLabel(`${label} 설명`)).toHaveValue("추가 폼에서 적은 설명");
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
    await page.getByLabel("값").fill(value);
    await page.getByLabel("이름", { exact: true }).fill(label);
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByRole("cell", { name: value })).toBeVisible();

    const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: value }) });
    const taxRuleRow = row.locator("xpath=following-sibling::tr[1]");
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
