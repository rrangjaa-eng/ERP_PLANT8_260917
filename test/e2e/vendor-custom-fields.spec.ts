import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import {
  archiveE2EFieldDefinitions,
  archiveE2EVendor,
  createE2EFieldDefinition,
  createE2EVendorEditor,
  createFixtureUser,
} from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { findFieldDefinitionById } from "@/repositories/field-definitions";
import {
  REQUIRED_SELECT_EMPTY_MESSAGE,
  REQUIRED_VALUE_EMPTY_MESSAGE,
} from "@/domain/custom-fields/preserve";

// 04.5-06: 거래처 폼의 커스텀 칸 오류 · 이유 자리 · 보관 선택지 현재 값.
// 이 스펙의 칸은 만들어지는 순간부터 전용 계급(createE2EVendorEditor)에만 보인다 — 시스템 관리자에게 필수 칸이 한 순간이라도
// 보이면 동시에 도는 vendors.spec.ts의 등록이 05의 필수 판정에 막힌다(fixtures.ts 머리 주석).
// 칸 이름에 「이름」 · 「사업자 번호」를 넣지 않는다(다른 스펙의 getByLabel 부분 일치).
const PREFIX = "E2E거래처칸";
const NAME_REQUIRED_MESSAGE = "이름 필요 · 이름 입력";

type Account = { email: string; password: string };

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(PREFIX);
});

function label(kind: string): string {
  return `${PREFIX}${kind}${randomUUID().slice(0, 4)}`;
}

function vendorName(): string {
  return `V칸${randomUUID().slice(0, 8)}`;
}

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 등록 폼으로 거래처 하나를 만든다 — 사용자가 채우는 값은 fill로 넘긴다. 만든 거래처의 수정 링크(?editId=)를 돌려준다.
async function registerVendor(page: Page, name: string, fill?: () => Promise<void>): Promise<string> {
  await page.goto("/admin/vendors?new=1");
  await page.locator("#name").fill(name);
  if (fill) await fill();
  await page.getByRole("button", { name: "거래처 등록" }).click();
  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible();
  const href = await row.getByRole("link", { name: "수정" }).getAttribute("href");
  expect(href).toBeTruthy();
  return href!;
}

test.describe("거래처 폼 커스텀 칸 (04.5-06)", () => {
  test("저장값이 빈 필수 칸이 있어도 다른 칸만 고친 수정 저장이 네 타입 모두 성공한다", async ({ page }) => {
    const editor = await createE2EVendorEditor();
    await login(page, editor);
    const name = vendorName();
    const editHref = await registerVendor(page, name);

    // 거래처를 만든 뒤 필수 칸 넷을 추가한다 — 저장값은 전부 빈 상태다.
    const fields = {
      text: await createE2EFieldDefinition({ label: label("텍"), type: "text", required: true, onlyRoleId: editor.roleId }),
      number: await createE2EFieldDefinition({ label: label("숫"), type: "number", required: true, onlyRoleId: editor.roleId }),
      date: await createE2EFieldDefinition({ label: label("날"), type: "date", required: true, onlyRoleId: editor.roleId }),
      select: await createE2EFieldDefinition({
        label: label("선"),
        type: "select",
        required: true,
        options: ["가", "나"],
        onlyRoleId: editor.roleId,
      }),
    };

    await page.goto(editHref);
    for (const field of Object.values(fields)) await expect(page.locator(`#cf_${field.key}`)).toBeVisible();
    await page.locator("#businessNo").fill("123-45-67890");
    await page.getByRole("button", { name: "거래처 수정" }).click();

    // 성공 — 목록으로 돌아가 새 사업자 번호가 보이고 폼이 닫힌다.
    await expect(page.locator("#vendor-form")).toHaveCount(0);
    await expect(page.locator("tr", { hasText: name })).toContainText("123-45-67890");
  });

  test("등록 때 필수 칸을 비우면 칸 아래 문구와 이유 자리 요약이 보이고 첫 칸 고치기가 포커스를 보낸다", async ({ page }) => {
    const editor = await createE2EVendorEditor();
    const text = await createE2EFieldDefinition({ label: label("텍"), type: "text", required: true, sortOrder: 1, onlyRoleId: editor.roleId });
    const select = await createE2EFieldDefinition({
      label: label("선"),
      type: "select",
      required: true,
      sortOrder: 2,
      options: ["가", "나"],
      onlyRoleId: editor.roleId,
    });
    const textLabel = await labelOf(text.id);
    const selectLabel = await labelOf(select.id);
    await login(page, editor);

    const name = vendorName();
    await page.goto("/admin/vendors?new=1");
    await page.locator("#name").fill(name);
    await page.locator("#businessNo").fill("111-22-33333");
    await page.getByRole("button", { name: "거래처 등록" }).click();

    await expect(page.locator(`#cf_${text.key}-error`)).toHaveText(REQUIRED_VALUE_EMPTY_MESSAGE);
    await expect(page.locator(`#cf_${select.key}-error`)).toHaveText(REQUIRED_SELECT_EMPTY_MESSAGE);
    const reason = page.locator("#vendor-form-reason");
    await expect(reason).toContainText(`등록할 수 없음 — ${textLabel}, ${selectLabel} 2칸 · `);
    await expect(page.getByRole("button", { name: "거래처 등록" })).toHaveAttribute("aria-describedby", /vendor-form-reason/);

    await reason.getByRole("button", { name: `${textLabel} 고치기` }).click();
    await expect(page.locator(`#cf_${text.key}`)).toBeFocused();

    // 다른 칸에 적은 값이 남아 있고 거래처는 생기지 않았다.
    await expect(page.locator("#businessNo")).toHaveValue("111-22-33333");
    await page.goto("/admin/vendors?includeHidden=1");
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("채워진 필수 칸을 지우면 수정 저장이 막힌다", async ({ page }) => {
    const editor = await createE2EVendorEditor();
    const field = await createE2EFieldDefinition({ label: label("텍"), type: "text", required: true, onlyRoleId: editor.roleId });
    const fieldLabel = await labelOf(field.id);
    await login(page, editor);

    const name = vendorName();
    const editHref = await registerVendor(page, name, async () => {
      await page.locator(`#cf_${field.key}`).fill("연락처 값");
    });

    await page.goto(editHref);
    await expect(page.locator(`#cf_${field.key}`)).toHaveValue("연락처 값");
    await page.locator(`#cf_${field.key}`).fill("");
    await page.getByRole("button", { name: "거래처 수정" }).click();

    await expect(page.locator(`#cf_${field.key}-error`)).toHaveText(REQUIRED_VALUE_EMPTY_MESSAGE);
    await expect(page.locator("#vendor-form-reason")).toContainText(`수정할 수 없음 — ${fieldLabel} 1칸 · `);
    await expect(page.locator("#vendor-form")).toBeVisible();
  });

  test("이름만 비우면 이름 칸 아래 오류와 「이름 고치기」가 보이고 거래처는 생기지 않는다", async ({ page }) => {
    // 이 계급에는 칸이 하나도 보이지 않는다 — 입력 칸이 비어 이름 오류만 있다(목록에서 사업자 번호가 보이려면 거래처 정보 보임이 필요하다).
    const editor = await createE2EVendorEditor();
    await login(page, editor);

    await page.goto("/admin/vendors?new=1");
    await page.locator("#businessNo").fill("999-88-77777");
    await page.getByRole("button", { name: "거래처 등록" }).click();

    await expect(page.locator("#name-error")).toHaveText(NAME_REQUIRED_MESSAGE);
    const reason = page.locator("#vendor-form-reason");
    await expect(reason).toContainText("등록할 수 없음 — 이름 1칸 · ");
    await reason.getByRole("button", { name: "이름 고치기" }).click();
    await expect(page.locator("#name")).toBeFocused();
    await expect(page.locator("#businessNo")).toHaveValue("999-88-77777");
    await page.goto("/admin/vendors?includeHidden=1");
    await expect(page.getByText("999-88-77777")).toHaveCount(0);
  });

  test("이름과 필수 커스텀 칸이 함께 비면 두 단계로 나눠 보인다(D3)", async ({ page }) => {
    const editor = await createE2EVendorEditor();
    const field = await createE2EFieldDefinition({ label: label("텍"), type: "text", required: true, onlyRoleId: editor.roleId });
    const fieldLabel = await labelOf(field.id);
    await login(page, editor);

    await page.goto("/admin/vendors?new=1");
    const form = page.locator("#vendor-form");
    const reason = page.locator("#vendor-form-reason");

    // ① 이름 오류만 — 커스텀 오류는 아직 없다.
    await page.getByRole("button", { name: "거래처 등록" }).click();
    await expect(reason).toContainText("등록할 수 없음 — 이름 1칸 · ");
    await expect(reason.getByRole("button", { name: "이름 고치기" })).toBeVisible();
    await expect(page.locator("#name-error")).toHaveText(NAME_REQUIRED_MESSAGE);
    await expect(form.getByText("필수 칸 비어 있음")).toHaveCount(0);

    // ② 이름을 채우면 커스텀 칸 오류 한 칸.
    const name = vendorName();
    await page.locator("#name").fill(name);
    await page.getByRole("button", { name: "거래처 등록" }).click();
    await expect(reason).toContainText(`등록할 수 없음 — ${fieldLabel} 1칸 · `);
    await expect(page.locator(`#cf_${field.key}-error`)).toHaveText(REQUIRED_VALUE_EMPTY_MESSAGE);
    await expect(form.getByText(NAME_REQUIRED_MESSAGE)).toHaveCount(0);
    await reason.getByRole("button", { name: `${fieldLabel} 고치기` }).click();
    await expect(page.locator(`#cf_${field.key}`)).toBeFocused();

    await page.goto("/admin/vendors?includeHidden=1");
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("폼이 열린 사이 거래처가 보관되면 이유 자리에 원인과 새로 불러오기가 보이고 1차가 막힌다", async ({ page }) => {
    const editor = await createE2EVendorEditor();
    await login(page, editor);
    const name = vendorName();
    const editHref = await registerVendor(page, name);
    await page.goto(editHref);
    await expect(page.locator("#vendor-form")).toBeVisible();

    await archiveE2EVendor(new URL(editHref, "http://x").searchParams.get("editId")!);
    await page.getByRole("button", { name: "거래처 수정" }).click();

    const reason = page.locator("#vendor-form-reason");
    const line = reason.locator("..");
    await expect(line).toContainText("수정할 수 없음 — 보관된 거래처 · 새로 불러오기");
    await expect(line.getByText("수정할 수 없음")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "거래처 수정" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "거래처 수정" })).toHaveAttribute("aria-describedby", /vendor-form-reason/);
    await expect(reason.getByRole("button", { name: "새로 불러오기" })).toBeVisible();
    const form = page.locator("#vendor-form");
    await expect(form.getByText("다시 시도")).toHaveCount(0);
    await expect(form.locator('[role="alert"]')).toHaveCount(0);
    await expect(form.getByRole("button", { name: /고치기$/ })).toHaveCount(0);

    await reason.getByRole("button", { name: "새로 불러오기" }).click();
    await expect(page.locator("#vendor-form")).toHaveCount(0);
  });

  test("폼이 열린 사이 쓰기 권한이 회수되면 권한 없음과 새로 불러오기가 보인다", async ({ page }) => {
    const editor = await createE2EVendorEditor();
    await login(page, editor);
    const editHref = await registerVendor(page, vendorName());
    await page.goto(editHref);
    await expect(page.locator("#vendor-form")).toBeVisible();

    await setPermissionCell(SYSTEM_VIEWER, { roleId: editor.roleId, menu: "admin.vendors", action: "write", allowed: false });
    await page.getByRole("button", { name: "거래처 수정" }).click();

    const reason = page.locator("#vendor-form-reason");
    await expect(reason.locator("..")).toContainText("수정할 수 없음 — 권한 없음 · 새로 불러오기");
    await expect(page.getByRole("button", { name: "거래처 수정" })).toBeDisabled();
    await expect(page.locator("#vendor-form").getByText("다시 시도")).toHaveCount(0);

    await reason.getByRole("button", { name: "새로 불러오기" }).click();
    await expect(page.locator("#vendor-form")).toHaveCount(0);
  });

  test("커스텀 칸은 보이는 계급에만 있고 0칸이면 구분선 묶음이 없다", async ({ page }) => {
    const editor = await createE2EVendorEditor();
    const field = await createE2EFieldDefinition({ label: label("텍"), type: "text", required: false, onlyRoleId: editor.roleId });
    const hidden = await createE2EVendorEditor({ vendorValue: false });

    // 시스템 관리자 — 이 칸의 노출 행이 없어 숨김이다.
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await login(page, admin);
    await page.goto("/admin/vendors?new=1");
    await expect(page.locator("#vendor-form")).toBeVisible();
    await expect(page.locator(`#cf_${field.key}`)).toHaveCount(0);

    // 거래처 정보를 못 보는 계급 — 입력 칸 0개.
    await page.context().clearCookies();
    await login(page, hidden);
    await page.goto("/admin/vendors?new=1");
    await expect(page.locator("#vendor-form")).toBeVisible();
    await expect(page.getByTestId("vendor-custom-fields")).toHaveCount(0);
    await expect(page.locator('[id^="cf_"]')).toHaveCount(0);

    // 보이는 계급 — 구분선 묶음 안에 칸이 있고 칸 라벨이 정의 이름이다.
    await page.context().clearCookies();
    await login(page, editor);
    await page.goto("/admin/vendors?new=1");
    const group = page.getByTestId("vendor-custom-fields");
    await expect(group).toHaveCount(1);
    await expect(group.locator(`#cf_${field.key}`)).toBeVisible();
    await expect(group.getByText(await labelOf(field.id), { exact: true })).toBeVisible();
    await expect(page.locator(`#cf_${field.key}`)).not.toHaveAttribute("required", "");
  });
});

// 칸 정의의 표시 이름 — 폼 라벨은 def.label이다(01).
async function labelOf(id: string): Promise<string> {
  const row = await findFieldDefinitionById(SYSTEM_VIEWER, id);
  if (!row) throw new Error(`칸이 없습니다: ${id}`);
  return row.label;
}
