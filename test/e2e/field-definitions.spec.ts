import { randomBytes } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { upsertPermission } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 04.5-01 트레이서: 관리 화면에서 추가한 거래처 칸이 거래처 폼에 한글 이름으로 보인다.
// 09가 MENUS에 admin.field-definitions를 등록하기 전까지 시드가 권한 행을 주지 않는다 —
// 시스템 관리자 view·write 행을 여기서 명시로 넣는다(공유 결정 4의 마지막 단계).
const MENU = "admin.field-definitions";

type Account = { email: string; password: string };
let admin: Account;
let pm: Account;

test.beforeAll(async () => {
  await upsertPermission(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, menu: MENU, action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, menu: MENU, action: "write", allowed: true });
  admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
});

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("화면 항목을 추가하면 거래처 폼에 그 한글 이름으로 보이고 키는 보이지 않는다", async ({ page }) => {
  await login(page, admin);
  // 「이름」이라는 글자를 넣지 않는다 — vendors.spec.ts의 getByLabel("이름")이 부분 일치로 센다.
  const label = `E2E칸${randomBytes(3).toString("hex")}`;

  await page.goto("/admin/field-definitions?new=1");
  await page.getByLabel("이름", { exact: true }).fill(label);
  await page.getByLabel("타입", { exact: true }).selectOption({ label: "텍스트" });
  await page.getByLabel("정렬 순서", { exact: true }).fill("1");
  await page.getByRole("button", { name: "화면 항목 추가" }).click();
  await expect(page).toHaveURL(/\/admin\/field-definitions$/);
  // 폼이 닫힌 목록 화면이 실제로 렌더된다(서버 컴포넌트 오류 화면이 아니다).
  await expect(page.getByRole("link", { name: "화면 항목 추가" })).toBeVisible();

  await page.goto("/admin/vendors?new=1");
  await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  await expect(page.locator("#main-content")).not.toContainText(/cf_[0-9a-f]{8}/);
});

test("기획 PM은 화면 항목 관리와 등록 폼에서 404를 받는다", async ({ page }) => {
  await login(page, pm);

  const list = await page.goto("/admin/field-definitions");
  expect(list?.status()).toBe(404);
  const form = await page.goto("/admin/field-definitions?new=1");
  expect(form?.status()).toBe(404);
});
