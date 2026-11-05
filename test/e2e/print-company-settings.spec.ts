import { test, expect, type Page } from "@playwright/test";
import { getSettingValue, setSettingValue, type SettingDef } from "@/domain/settings/registry";
import { PRINT_COMPANY_ADDRESS, PRINT_COMPANY_BUSINESS_NO, PRINT_COMPANY_NAME, PRINT_COMPANY_PHONE, PRINT_COMPANY_REPRESENTATIVE } from "@/domain/settings/keys";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createFixtureUser } from "./fixtures";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { loginPage } from "./leave-org";

// 07.4-01 D-7405 · D-7406 — 설정 「회사 정보」 다섯 키(회사명 · 주소 · 사업자번호 · 대표자 · 전화)가 형식 · 길이 오류를 화면에 그 문장으로 막고,
// 종이 머리는 빈 항목만 이름째 빼며 회사명이 비면 워드마크 자리에 「PLANT8」을 찍는다. 공용 설정 행을 바꾸므로 desktop-settings 한 워커에서만 돈다
// (playwright.config.ts DESKTOP_SETTINGS_SPECS) — 값은 끝나면 원래대로 되돌린다.

test.describe.configure({ mode: "serial" });

const DEFS: readonly SettingDef<string>[] = [PRINT_COMPANY_NAME, PRINT_COMPANY_ADDRESS, PRINT_COMPANY_BUSINESS_NO, PRINT_COMPANY_REPRESENTATIVE, PRINT_COMPANY_PHONE];
const GROUP = "회사 정보";

let fx: ExpenseE2E;
let expenseId: string;
let originals: string[] = [];

test.beforeAll(async ({ browser, baseURL }) => {
  originals = await Promise.all(DEFS.map((def) => getSettingValue(def)));
  fx = await setupExpenseE2E();
  expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
});

test.afterAll(async () => {
  for (const [index, def] of DEFS.entries()) await setSettingValue(SYSTEM_VIEWER, def, originals[index] ?? "");
});

const isServerAction = (response: { request: () => { method: () => string; headers: () => Record<string, string> } }) =>
  response.request().method() === "POST" && response.request().headers()["next-action"] !== undefined;

async function openCompanySection(page: Page) {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto(`/admin/settings?group=${encodeURIComponent(GROUP)}`);
  await expect(page.getByRole("heading", { name: GROUP, exact: true })).toBeVisible();
  return page.locator("section").filter({ has: page.getByRole("heading", { name: GROUP, exact: true }) });
}

async function saveField(page: Page, field: ReturnType<Page["getByLabel"]>, value: string): Promise<void> {
  await field.fill(value);
  const saved = page.waitForResponse(isServerAction);
  await field.blur();
  await saved;
}

async function openPaper(browser: import("@playwright/test").Browser, baseURL: string | undefined) {
  const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 900 });
  await page.goto(`/print/expenses/${expenseId}`);
  await expect(page.locator("main[data-ready]")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
  return page;
}

test("회사 정보 섹션은 다섯 칸이 이 순서이고 형식 · 길이 오류는 그 문장으로 막힌다", async ({ page }) => {
  const section = await openCompanySection(page);
  const labels = (await section.locator("label").allInnerTexts()).map((text) => text.trim()).filter((text) => DEFS.some((def) => def.label === text));
  expect(labels).toEqual(DEFS.map((def) => def.label));

  const businessNo = section.getByLabel(PRINT_COMPANY_BUSINESS_NO.label, { exact: true });
  await saveField(page, businessNo, "1234567890");
  await expect(section.getByText("저장 실패 · 형식 오류 · 123-45-67890처럼")).toBeVisible();
  await expect(businessNo).toHaveAttribute("aria-invalid", "true");

  const phone = section.getByLabel(PRINT_COMPANY_PHONE.label, { exact: true });
  await saveField(page, phone, "021234567");
  await expect(section.getByText("저장 실패 · 형식 오류 · 02-123-4567처럼")).toBeVisible();

  const name = section.getByLabel(PRINT_COMPANY_NAME.label, { exact: true });
  await saveField(page, name, "가".repeat(61));
  await expect(section.getByText("저장 실패 · 길이 초과 · 60자 이내")).toBeVisible();
  // 일반 문구(「값 확인」으로 끝나는 말)로 바뀌어 나오면 안 된다.
  await expect(section.getByText(/값 확인/)).toHaveCount(0);
});

test("다섯 채움: 머리 A줄에 회사명, B줄에 네 항목이 정확히 한 번씩 나온다", async ({ page, browser, baseURL }) => {
  const section = await openCompanySection(page);
  const values: [SettingDef<string>, string][] = [
    [PRINT_COMPANY_NAME, "플랜트에이트 주식회사"],
    [PRINT_COMPANY_ADDRESS, "서울특별시 성동구 왕십리로 10"],
    [PRINT_COMPANY_BUSINESS_NO, "123-45-67890"],
    [PRINT_COMPANY_REPRESENTATIVE, "김대표"],
    [PRINT_COMPANY_PHONE, "02-123-4567"],
  ];
  for (const [def, value] of values) await saveField(page, section.getByLabel(def.label, { exact: true }), value);

  const paper = await openPaper(browser, baseURL);
  try {
    const header = paper.locator("article header");
    await expect(header.locator("span").first()).toHaveText("플랜트에이트 주식회사");
    const line = header.locator("p");
    await expect(line).toHaveCount(1);
    const text = await line.innerText();
    for (const piece of ["서울특별시 성동구 왕십리로 10", "사업자번호 123-45-67890", "대표 김대표", "전화 02-123-4567"]) {
      expect(text.split(piece).length - 1, piece).toBe(1);
    }
  } finally {
    await paper.context().close();
  }
});

test("회사명만 채우면 B줄 요소가 없다", async ({ page, browser, baseURL }) => {
  const section = await openCompanySection(page);
  for (const def of DEFS) await saveField(page, section.getByLabel(def.label, { exact: true }), def === PRINT_COMPANY_NAME ? "플랜트에이트 주식회사" : "");

  const paper = await openPaper(browser, baseURL);
  try {
    const header = paper.locator("article header");
    await expect(header.locator("span").first()).toHaveText("플랜트에이트 주식회사");
    await expect(header.locator("p")).toHaveCount(0);
  } finally {
    await paper.context().close();
  }
});

test("전부 비우면 워드마크 자리에 「PLANT8」, 출력 줄은 그대로, B줄 요소는 없다", async ({ page, browser, baseURL }) => {
  const section = await openCompanySection(page);
  for (const def of DEFS) await saveField(page, section.getByLabel(def.label, { exact: true }), "");
  await expect(section.locator('[aria-invalid="true"]')).toHaveCount(0);

  const paper = await openPaper(browser, baseURL);
  try {
    const header = paper.locator("article header");
    await expect(header.locator("span").first()).toHaveText("PLANT8");
    await expect(header.getByText(/^출력 \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)).toHaveCount(1);
    await expect(header.locator("p")).toHaveCount(0);
    // 빈 요소가 틈을 만들지 않는다 — 머리 높이가 A줄 높이와 같다.
    const heights = await header.evaluate((el) => ({ header: el.getBoundingClientRect().height, top: (el.firstElementChild as HTMLElement).getBoundingClientRect().height }));
    expect(Math.abs(heights.header - heights.top)).toBeLessThanOrEqual(1);
  } finally {
    await paper.context().close();
  }
});
