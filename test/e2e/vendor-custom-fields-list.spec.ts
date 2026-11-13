import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { archiveE2EFieldDefinitions, createE2EFieldDefinition, createE2EVendorEditor, createFixtureUser } from "./fixtures";

// 07.5-01: 거래처 목록의 추가 칸 열 · 검색 · 거르개.
// 칸은 만들어지는 순간부터 전용 계급(createE2EVendorEditor)에만 보인다 — 같은 시각 다른 desktop 워커의 거래처 표 열을 흔들지 않는다.
// 단언 규칙(eng A-7): 머리글은 이름으로만 찾고 머리글 배열 전체 · 열 개수를 단언하지 않는다.
const PREFIX = "E2E목록";

type Account = { email: string; password: string };

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(PREFIX);
});

function vendorName(): string {
  return `V목록${randomUUID().slice(0, 8)}`;
}

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 등록 폼으로 거래처 하나를 만든다 — 칸 값은 정의 키 → 값(폼 칸 id = `cf_<key>`).
async function registerVendor(page: Page, name: string, values: Record<string, string> = {}): Promise<void> {
  await page.goto("/admin/vendors?new=1");
  await page.locator("#name").fill(name);
  for (const [key, value] of Object.entries(values)) {
    const input = page.locator(`#cf_${key}`);
    if ((await input.evaluate((element) => element.tagName)) === "SELECT") await input.selectOption(value);
    else await input.fill(value);
  }
  await page.getByRole("button", { name: "거래처 등록" }).click();
  await expect(page.locator("tr", { hasText: name })).toBeVisible();
}

test.describe("거래처 목록 추가 칸 열 (07.5-01)", () => {
  test("보이는 텍스트 칸이 「계좌」와 「상태」 사이 열로 서고 폭 상한을 넘지 않으며, 안 보이는 계정에는 없다", async ({ page, browser }) => {
    const editor = await createE2EVendorEditor();
    const columnLabel = `${PREFIX}비고${randomUUID().slice(0, 4)}`;
    const field = await createE2EFieldDefinition({ label: columnLabel, type: "text", required: false, onlyRoleId: editor.roleId });
    await login(page, editor);
    const withValue = vendorName();
    const withLong = vendorName();
    const withoutValue = vendorName();
    const longValue = "가".repeat(60);
    await registerVendor(page, withValue, { [field.key]: "열값1" });
    await registerVendor(page, withLong, { [field.key]: longValue });
    await registerVendor(page, withoutValue);

    await page.goto("/admin/vendors");
    const headers = await page.locator("thead th").allInnerTexts();
    const names = headers.map((text) => text.trim());
    const at = names.indexOf(columnLabel);
    expect(at).toBeGreaterThan(-1);
    expect(names.indexOf("계좌")).toBe(at - 1);
    expect(names.indexOf("상태")).toBe(at + 1);

    await expect(page.locator("tr", { hasText: withValue }).locator("td").nth(at)).toHaveText("열값1");
    await expect(page.locator("tr", { hasText: withoutValue }).locator("td").nth(at)).toHaveText("—");

    // 폭 상한 — 계산 max-width가 아니라 실측: 칸 안 감싸개 span 실측 폭 ≤ --field-w-select(eng r2 N4).
    // <td> 자체 폭은 표 자동 배치가 남는 폭을 나눠 주므로(CSS 2.1 §17.5.2) 상한을 걸지 않는다 — 상한은 감싸개의 몫이다.
    const measured = await page.locator("tr", { hasText: withLong }).locator("td").nth(at).evaluate((cell) => {
      const wrapper = cell.querySelector("span");
      const limit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--field-w-select"));
      return {
        hasWrapper: wrapper !== null,
        width: wrapper?.getBoundingClientRect().width ?? 0,
        wrapped: (wrapper?.getBoundingClientRect().height ?? 0) > parseFloat(getComputedStyle(cell).lineHeight) * 1.5,
        overflows: (wrapper?.scrollWidth ?? 0) > (wrapper?.clientWidth ?? 0),
        limit,
      };
    });
    expect(measured.limit).toBe(200);
    expect(measured.hasWrapper).toBe(true);
    expect(measured.width).toBeLessThanOrEqual(measured.limit + 0.5);
    expect(measured.wrapped).toBe(true);
    expect(measured.overflows).toBe(false);

    // 칸 노출 행이 없는 계정(시스템 관리자 — 이 칸은 전용 계급에만 보인다)의 목록에는 머리글 DOM이 없다.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await login(adminPage, admin);
    await adminPage.goto("/admin/vendors");
    await expect(adminPage.locator("thead th").first()).toBeVisible();
    await expect(adminPage.locator("thead th", { hasText: columnLabel })).toHaveCount(0);
    await adminContext.close();
  });

  test("700~1023에서는 추가 칸 열이 접힌 줄로 접히고 1280에서는 열로 남는다 (DOM 감사 F1)", async ({ page }) => {
    const editor = await createE2EVendorEditor();
    const columnLabel = `${PREFIX}접기${randomUUID().slice(0, 4)}`;
    const field = await createE2EFieldDefinition({ label: columnLabel, type: "text", required: false, onlyRoleId: editor.roleId });
    await login(page, editor);
    const name = vendorName();
    const value = `접힘값${randomUUID().slice(0, 4)}`;
    await registerVendor(page, name, { [field.key]: value });

    // 768 — 추가 칸 머리글 · 칸이 표시되지 않고(display none) 값은 접힌 줄에 있으며 가로 넘침 0
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/admin/vendors");
    const header = page.locator("thead th", { hasText: columnLabel });
    await expect(header).toHaveCount(1);
    await expect(header).toBeHidden();
    const row = page.locator("tbody tr", { hasText: name }).first();
    const folded = row.locator("xpath=following-sibling::tr[1]");
    await expect(folded).toBeVisible();
    await expect(folded).toContainText(value);
    const tablet = await page.evaluate((target) => {
      const cell = [...document.querySelectorAll("tbody td")].find((td) => td.textContent?.trim() === target);
      return {
        columnShown: cell ? getComputedStyle(cell).display !== "none" : false,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, value);
    expect(tablet.columnShown).toBe(false);
    expect(tablet.overflow).toBeLessThanOrEqual(0);
    const nameWidth768 = await page.locator("tbody tr", { hasText: name }).first().locator("td").first().evaluate((cell) => cell.getBoundingClientRect().width);

    // 1280 — 열로 선다
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/vendors");
    await expect(page.locator("thead th", { hasText: columnLabel })).toBeVisible();
    await expect(page.locator("tbody tr", { hasText: name }).first().locator("td", { hasText: value })).toBeVisible();
    await expect(page.locator("tbody tr", { hasText: name }).first().locator("xpath=following-sibling::tr[1]")).toBeHidden();
    const nameWidth1280 = await page.locator("tbody tr", { hasText: name }).first().locator("td").first().evaluate((cell) => cell.getBoundingClientRect().width);
    console.log(`[F1] 이름 칸 폭 768=${Math.round(nameWidth768)} 1280=${Math.round(nameWidth1280)}`);
  });

  test("검색은 칸 값도 찾고, 선택 칸 거르개는 즉시 이동하며 검색 · 갈래 · 수정 → 닫기 · 숨김 토글에서도 유지되고 「필터 지우기」만 푼다", async ({ page, browser }) => {
    const editor = await createE2EVendorEditor();
    const textLabel = `${PREFIX}검색${randomUUID().slice(0, 4)}`;
    const selectLabel = `${PREFIX}지역${randomUUID().slice(0, 4)}`;
    const text = await createE2EFieldDefinition({ label: textLabel, type: "text", required: false, onlyRoleId: editor.roleId, sortOrder: 1 });
    const pick = await createE2EFieldDefinition({ label: selectLabel, type: "select", required: false, options: ["서울", "부산"], onlyRoleId: editor.roleId, sortOrder: 2 });
    await login(page, editor);
    const seoul = vendorName();
    const busan = vendorName();
    const plain = vendorName();
    const needle = `찾을값${randomUUID().slice(0, 6)}`;
    await registerVendor(page, seoul, { [text.key]: needle, [pick.key]: "서울" });
    await registerVendor(page, busan, { [pick.key]: "부산" });
    await registerVendor(page, plain);
    const param = `cf_${pick.key}`;
    const rowOf = (name: string) => page.locator("tbody tr", { hasText: name });
    const cfParam = () => new URL(page.url()).searchParams.get(param);

    // 검색어 = 추가 칸 값 → 그 거래처 한 행
    await page.goto(`/admin/vendors?q=${encodeURIComponent(needle)}`);
    await expect(rowOf(seoul)).toBeVisible();
    await expect(rowOf(busan)).toHaveCount(0);

    // 거르개 — 갈래 링크 묶음 뒤 · 숨김 포함 앞, 라벨 = 칸 이름, 첫 옵션 「전체 {칸 이름}」, 바꾸면 즉시 이동
    await page.goto("/admin/vendors");
    const filter = page.getByLabel(selectLabel, { exact: true });
    await expect(filter.locator("option").first()).toHaveText(`전체 ${selectLabel}`);
    const order = await page.evaluate((id) => {
      const nav = document.querySelector('nav[aria-label="갈래"]');
      const select = document.getElementById(id);
      const toggle = [...document.querySelectorAll("a")].find((a) => a.textContent === "숨김 포함");
      if (!nav || !select || !toggle) return null;
      return {
        afterNav: Boolean(nav.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING),
        beforeToggle: Boolean(select.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    }, `filter-cf_${pick.key}`);
    expect(order).toEqual({ afterNav: true, beforeToggle: true });
    await filter.selectOption("서울");
    await expect(page).toHaveURL(/cf_cf_/);
    expect(cfParam()).toBe("서울");
    await expect(rowOf(seoul)).toBeVisible();
    await expect(rowOf(busan)).toHaveCount(0);
    await expect(rowOf(plain)).toHaveCount(0);

    // 거르개를 고른 채 검색 → URL에 남고 두 조건 모두
    await page.locator("#vendor-search").fill(seoul);
    await page.locator("#vendor-search").press("Enter");
    await expect(page).toHaveURL(/q=/);
    expect(cfParam()).toBe("서울");
    await expect(rowOf(seoul)).toBeVisible();

    // 갈래 링크 · 숨김 포함 토글 → 유지
    await page.locator('nav[aria-label="갈래"] a').nth(2).click();
    await expect(page).toHaveURL(/kind=/);
    expect(cfParam()).toBe("서울");
    await page.getByRole("link", { name: "숨김 포함" }).click();
    await expect(page).toHaveURL(/includeHidden=1/);
    expect(cfParam()).toBe("서울");

    // 행 「수정」 → 패널 닫기 → 유지
    await rowOf(seoul).getByRole("link", { name: "수정" }).click();
    await expect(page).toHaveURL(/editId=/);
    expect(cfParam()).toBe("서울");
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/editId=/);
    expect(cfParam()).toBe("서울");

    // 결과 0건 → 「필터 지우기」만 전부 푼다
    await page.locator("#vendor-search").fill(`없는${randomUUID().slice(0, 6)}`);
    await page.locator("#vendor-search").press("Enter");
    await expect(page.getByText("조건에 맞는 거래처가 없습니다")).toBeVisible();
    expect(cfParam()).toBe("서울");
    await page.getByRole("link", { name: "필터 지우기" }).click();
    await expect(page).not.toHaveURL(/cf_cf_|q=|kind=/);
    await expect(rowOf(busan)).toBeVisible();

    // 거르개 라벨 계산 스타일 = 프로젝트 목록 필터 라벨(font-size · weight · color)
    const mine = await page.locator(`label[for="filter-${param}"]`).evaluate((label) => {
      const style = getComputedStyle(label);
      return { size: style.fontSize, weight: style.fontWeight, color: style.color };
    });
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
    await adminPage.goto("/projects");
    const projects = await adminPage.locator('label[for="status"]').evaluate((label) => {
      const style = getComputedStyle(label);
      return { size: style.fontSize, weight: style.fontWeight, color: style.color };
    });
    await adminContext.close();
    expect(mine).toEqual(projects);

    // 375 — 거르개가 필터 줄에 서고 가로 넘침 0
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/admin/vendors");
    await expect(page.getByLabel(selectLabel, { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
