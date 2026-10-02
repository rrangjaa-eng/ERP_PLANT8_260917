import { randomBytes } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { archiveE2EFieldDefinitions, createFixtureUser } from "./fixtures";
import { SEED_ROLES, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import { findVisibility, upsertVisibility } from "@/repositories/permissions";
import { listFieldDefinitions } from "@/repositories/field-definitions";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 04.5-03: 관리 화면에서 추가한 칸이 정보 노출표의 열로 올라오고, 계급별로 끄면 저장된다.
// 이 스펙이 만든 칸은 afterAll이 보관하고, 끈 셀은 테스트 끝에 다시 켠다(공유 erp_test — 다른 스펙에 남기지 않는다).
// 접두에 「이름」을 넣지 않는다(vendors.spec.ts의 getByLabel("이름") 부분 일치).
const PREFIX = "E2E노출";
const PM_ROLE = SEED_ROLES.find((role) => role.id === "role-pm")!;

type Account = { email: string; password: string };
let admin: Account;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
});

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(PREFIX);
});

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 01의 관리 화면으로 칸을 만든다 — 같은 트랜잭션에서 전 계급 보임 행이 생긴다. 만든 칸의 노출표 항목 키를 돌려준다.
async function addField(page: Page, label: string): Promise<string> {
  await page.goto("/admin/field-definitions?new=1");
  await page.getByLabel("이름", { exact: true }).fill(label);
  await page.getByLabel("타입", { exact: true }).selectOption({ label: "텍스트" });
  await page.getByLabel("정렬 순서", { exact: true }).fill("1");
  await page.getByRole("button", { name: "화면 항목 추가" }).click();
  await expect(page.getByRole("status").filter({ hasText: `화면 항목 추가 · ${label} 추가됨` })).toBeVisible();
  const def = (await listFieldDefinitions(SYSTEM_VIEWER, "vendor")).find((row) => row.label === label);
  if (!def) throw new Error(`만든 칸을 찾지 못했다: ${label}`);
  return customFieldInfoItem("vendor", def.key);
}

async function storedVisible(roleId: string, infoItem: string): Promise<boolean | undefined> {
  return (await findVisibility(SYSTEM_VIEWER, roleId, infoItem))?.visible;
}

test("추가한 칸이 노출표 열로 올라오고, 기획 PM 셀을 끄면 새로 고침 뒤에도 꺼져 있다", async ({ page }) => {
  await login(page, admin);
  const label = `${PREFIX}${randomBytes(3).toString("hex")}`;
  const infoItem = await addField(page, label);

  try {
    const response = await page.goto("/admin/visibility");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("columnheader", { name: label })).toBeVisible();
    for (const role of SEED_ROLES) {
      await expect(page.getByRole("checkbox", { name: `${role.name} · ${label}`, exact: true })).toBeChecked();
    }

    const pmCell = page.getByRole("checkbox", { name: `${PM_ROLE.name} · ${label}`, exact: true });
    await pmCell.uncheck();
    await expect.poll(() => storedVisible(PM_ROLE.id, infoItem)).toBe(false);

    await page.reload();
    await expect(page.getByRole("checkbox", { name: `${PM_ROLE.name} · ${label}`, exact: true })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: `시스템 관리자 · ${label}`, exact: true })).toBeChecked();
  } finally {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: PM_ROLE.id, infoItem, visible: true });
  }
});
