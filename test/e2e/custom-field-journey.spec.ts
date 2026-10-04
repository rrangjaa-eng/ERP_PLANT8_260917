import { randomBytes } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { archiveE2EFieldDefinitions, createE2EVendorEditor, createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listFieldDefinitions } from "@/repositories/field-definitions";
import { findVisibility } from "@/repositories/permissions";
import { setVendorHidden } from "@/repositories/vendors";

// 04.5-07 (ROADMAP 04.5 기준 4): 관리 화면에서 만든 칸이 거래처 입력 화면에서
// 추가 → 보임 → 값 저장 → 계급별 끔(화면 HTML에 없음 · 저장해도 값 유지) → 보관 → 숨음 → 복원 → 다시 보임으로 끝까지 동작한다.
// 여정 칸은 관리 화면으로 만들어 전 계급에 보이므로 필수 아님으로 만든다 — 필수면 같은 시각 시스템 관리자로
// 커스텀 값 없이 등록하는 vendors.spec.ts 등이 필수 판정에 막힌다.
// 칸 이름에 「이름」 · 「사업자 번호」를 넣지 않는다(다른 스펙의 getByLabel 부분 일치).
const PREFIX = "E2E여정";

type Account = { email: string; password: string };

let vendorId: string | null = null;

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(PREFIX);
  if (vendorId) await setVendorHidden(SYSTEM_VIEWER, vendorId, true);
});

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loginInNewContext(browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  return page;
}

function listRow(page: Page, label: string) {
  return page.locator("tbody tr", { has: page.locator('th[scope="row"]', { hasText: label }) });
}

// 끈 계급의 거래처 목록 · 수정 폼 HTML에 칸 이름과 값 문자열이 없다.
async function expectHiddenFrom(page: Page, editHref: string, vendorName: string, label: string, value: string) {
  await page.goto("/admin/vendors");
  await expect(page.locator("tr", { hasText: vendorName })).toBeVisible();
  const listHtml = await page.content();
  expect(listHtml).not.toContain(label);
  expect(listHtml).not.toContain(value);
  await page.goto(editHref);
  await expect(page.getByRole("button", { name: "거래처 수정" })).toBeVisible();
  const editHtml = await page.content();
  expect(editHtml).not.toContain(label);
  expect(editHtml).not.toContain(value);
}

test("관리 화면에서 만든 칸: 추가 → 보임 → 값 저장 → 계급별 끔 → 보관 → 숨음 → 복원 → 다시 보임", async ({ page, browser }) => {
  // ⓪ 전용 계급을 칸 추가보다 먼저 만든다 — 생성 경로가 이 계급에도 보임 행을 준다.
  const editor = await createE2EVendorEditor();
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  const tail = randomBytes(3).toString("hex");
  const label = `${PREFIX}${tail}`;
  const value = `여정값${tail}`;
  const vendorName = `V여정${tail}`;
  const editorCell = `${editor.roleName} · ${label}`;

  await login(page, admin);

  // ① 추가 → 거래처 폼 · 노출표에 보인다.
  await page.goto("/admin/field-definitions?new=1");
  await page.getByLabel("이름", { exact: true }).fill(label);
  await page.getByLabel("타입", { exact: true }).selectOption({ label: "텍스트" });
  await page.getByLabel("필수", { exact: true }).setChecked(false);
  await page.getByLabel("정렬 순서", { exact: true }).fill("1");
  await page.getByRole("button", { name: "화면 항목 추가" }).click();
  await expect(page.getByRole("status").filter({ hasText: `화면 항목 추가 · ${label} 추가됨` })).toBeVisible();
  const def = (await listFieldDefinitions(SYSTEM_VIEWER, "vendor")).find((row) => row.label === label);
  if (!def) throw new Error(`만든 칸을 찾지 못했다: ${label}`);
  expect(def.required).toBe(false);
  const infoItem = customFieldInfoItem("vendor", def.key);

  await page.goto("/admin/vendors?new=1");
  await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  await page.goto("/admin/visibility");
  await expect(page.getByRole("columnheader", { name: label })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: editorCell, exact: true })).toBeChecked();

  // ② 값 저장.
  await page.goto("/admin/vendors?new=1");
  await page.locator("#name").fill(vendorName);
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "거래처 등록" }).click();
  const vendorRow = page.locator("tr", { hasText: vendorName });
  await expect(vendorRow).toBeVisible();
  const editHref = await vendorRow.getByRole("link", { name: "수정" }).getAttribute("href");
  expect(editHref).toBeTruthy();
  vendorId = new URL(editHref!, "http://local").searchParams.get("editId");
  await page.goto(editHref!);
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);

  // ③ 전용 계급 셀을 끈다 → 그 계급 HTML에 칸 이름 · 값이 없고, 그 계급이 저장해도 값은 남는다.
  await page.goto("/admin/visibility");
  await page.getByRole("checkbox", { name: editorCell, exact: true }).uncheck();
  await expect.poll(async () => (await findVisibility(SYSTEM_VIEWER, editor.roleId, infoItem))?.visible).toBe(false);

  const editorPage = await loginInNewContext(browser, editor);
  try {
    await expectHiddenFrom(editorPage, editHref!, vendorName, label, value);
    await editorPage.locator("#businessNo").fill("123-45-67890");
    await editorPage.getByRole("button", { name: "거래처 수정" }).click();
    await expect(editorPage.locator("#vendor-form")).toHaveCount(0);
    await expect(editorPage.locator("tr", { hasText: vendorName })).toContainText("123-45-67890");

    await page.goto(editHref!);
    await expect(page.locator("#businessNo")).toHaveValue("123-45-67890");
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);

    // ④ 목록 「삭제」로 보관 → 모두에게 숨는다.
    await page.goto("/admin/field-definitions");
    const row = listRow(page, label);
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(row.getByText(`${label} 삭제 · 보관함으로 이동합니다 · 관리자가 복원할 수 있습니다`)).toBeVisible();
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(listRow(page, label)).toHaveCount(0);

    await page.goto(editHref!);
    await expect(page.getByRole("button", { name: "거래처 수정" })).toBeVisible();
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
    expect(await page.content()).not.toContain(value);
    await page.goto("/admin/visibility");
    await expect(page.getByRole("columnheader", { name: label })).toHaveCount(0);
    await expect(page.locator("#main-content")).not.toContainText(label);

    // ⑤ 보관함에서 복원 → 시스템 관리자에게 칸 · 값 · 노출표 열이 돌아오고, 계급별 끔은 그대로다.
    await page.goto("/admin/archive");
    const archiveRow = page.locator("tr", { hasText: label });
    await expect(archiveRow).toContainText("화면 항목");
    await archiveRow.getByRole("button", { name: "복원" }).click();
    await expect(page.getByText(`복원 · ${label} 복원됨`)).toBeVisible({ timeout: 15000 });

    await page.goto(editHref!);
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
    await page.goto("/admin/visibility");
    await expect(page.getByRole("columnheader", { name: label })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: editorCell, exact: true })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: `시스템 관리자 · ${label}`, exact: true })).toBeChecked();

    await expectHiddenFrom(editorPage, editHref!, vendorName, label, value);
  } finally {
    await editorPage.context().close();
  }
});
