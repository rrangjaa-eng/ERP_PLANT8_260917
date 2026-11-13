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

    // 폭 상한 — 계산 max-width가 아니라 실측: <td> 실측 폭 − 좌우 padding ≤ --field-w-select(eng r2 N4).
    const measured = await page.locator("tr", { hasText: withLong }).locator("td").nth(at).evaluate((cell) => {
      const style = getComputedStyle(cell);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const limit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--field-w-select"));
      return { content: cell.getBoundingClientRect().width - padding, limit };
    });
    expect(measured.limit).toBe(200);
    expect(measured.content).toBeLessThanOrEqual(measured.limit + 0.5);

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
});
