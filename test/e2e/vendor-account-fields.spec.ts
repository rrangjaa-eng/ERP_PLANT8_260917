import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createVendor } from "@/domain/vendors";
import { createE2EVendorEditor, createFixtureUser } from "./fixtures";
import { setPermissionCell } from "@/domain/permissions/matrix";

// 06.5-04(UI-SPEC V2 a11y · V3): 거래처 계좌 칸 — 번호 보기 결과 `aria-live`, 계좌번호 칸 숫자 자판(`inputmode`).
// vendor-edit.spec.ts는 같은 웨이브 06.5-02가 고치므로 이 플랜의 거래처 계좌 단언은 이 파일에 둔다.

async function login(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(creds.email);
  await page.getByLabel("비밀번호").fill(creds.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

const panel = (page: Page) => page.locator('dialog[data-ui="side-panel"]');

test.describe("거래처 계좌 칸(06.5-04)", () => {
  test("목록 번호 보기 결과가 aria-live로 들리고, 등록 · 수정 패널 계좌번호 칸은 숫자 자판", async ({ page }) => {
    await login(page, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
    const name = `E2E계좌칸-${randomUUID().slice(0, 8)}`;
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name,
      accountBank: "신한",
      accountHolder: "홍길동",
      accountNumber: "110-222-335566",
    });

    await page.goto("/admin/vendors");
    const row = page.locator("tr", { hasText: name });
    await row.getByRole("button", { name: "번호 보기" }).click();
    const number = row.locator('[aria-live="polite"]');
    // 07-20 C-35: 계좌번호는 하이픈 · 공백을 지운 숫자로 저장한다.
    await expect(number).toHaveText("110222335566");
    await row.getByRole("button", { name: "가리기" }).click();
    await expect(number).toHaveText("****-**-5566");

    await page.goto(`/admin/vendors?editId=${vendor.id}`);
    await expect(panel(page).getByLabel("새 계좌번호")).toHaveAttribute("inputmode", "numeric");
    await page.goto("/admin/vendors?new=1");
    await expect(panel(page).getByLabel("계좌번호", { exact: true })).toHaveAttribute("inputmode", "numeric");
  });

  test("수정 패널 칸 오류 — 예금주 없음(요약 · 포커스 · 입력값 유지) · 은행 코드 없음", async ({ page }) => {
    // 07-20 R8: 기존 거래처 계좌 칸 입력은 「계좌 · 서류 수정」(vendors.account) 보유자만.
    const editor = await createE2EVendorEditor();
    await setPermissionCell(SYSTEM_VIEWER, { roleId: editor.roleId, menu: "vendors.account", action: "write", allowed: true });
    await login(page, editor);
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `E2E계좌오류-${randomUUID().slice(0, 8)}` });
    await page.goto(`/admin/vendors?editId=${vendor.id}`);

    await panel(page).getByLabel("계좌 은행").fill("신한");
    await panel(page).getByLabel("새 계좌번호").fill("110-222-337788");
    await panel(page).getByRole("button", { name: "거래처 저장" }).click();
    await expect(panel(page).locator("#accountHolder-error")).toHaveText("예금주 없음 · 예금주 적기");
    await expect(panel(page).locator("#vendor-form-reason")).toContainText("수정할 수 없음 — 예금주 1칸");
    await expect(panel(page).getByLabel("예금주")).toBeFocused();
    await expect(panel(page).getByLabel("계좌 은행")).toHaveValue("신한");
    // 07-20 C-35: blur에서 하이픈 · 공백을 지운다.
    await expect(panel(page).getByLabel("새 계좌번호")).toHaveValue("110222337788");

    await panel(page).getByLabel("계좌 은행").fill("없는은행");
    await panel(page).getByLabel("예금주").fill("홍길동");
    await panel(page).getByRole("button", { name: "거래처 저장" }).click();
    await expect(panel(page).locator("#accountBank-error")).toHaveText("은행 코드 없음 · 은행 이름 고치기");
    await expect(panel(page).getByLabel("계좌 은행")).toBeFocused();
  });
});

