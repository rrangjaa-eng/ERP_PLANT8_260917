import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import {
  CEO_ROLE_ID,
  DEFAULT_ROLE_ID,
  DIVISION_HEAD_ROLE_ID,
  SEED_ROLES,
  SYSADMIN_ROLE_ID,
  TEAM_LEAD_ROLE_ID,
} from "@/domain/permissions/roles";

// 07 기준 5(Issue 14) — 시드 계급마다 같은 경로 표에서 보는 것/못 보는 것. 행은 07-05(D-722 확정값) · 07-25(07 새 화면)가 더한다.
// 대표의 `/admin/action-log`는 07-05가 D-722로 바꾸므로 이 플랜은 행을 두지 않는다.
// 표의 기대값은 지금 시드의 실제 동작이다 — 어긋나면 시험을 고치지 말고 SUMMARY 「발견」으로 07-05에 넘긴다.

type Expectation = "open" | "404";

export const ROLE_SMOKE: readonly { roleId: string; path: string; expect: Expectation }[] = [
  { roleId: SYSADMIN_ROLE_ID, path: "/admin", expect: "open" },
  { roleId: SYSADMIN_ROLE_ID, path: "/admin/action-log", expect: "open" },
  { roleId: SYSADMIN_ROLE_ID, path: "/admin/permissions", expect: "open" },
  { roleId: SYSADMIN_ROLE_ID, path: "/projects", expect: "open" },

  { roleId: DEFAULT_ROLE_ID, path: "/projects", expect: "open" },
  { roleId: DEFAULT_ROLE_ID, path: "/admin/action-log", expect: "404" },
  { roleId: DEFAULT_ROLE_ID, path: "/admin/permissions", expect: "404" },

  { roleId: TEAM_LEAD_ROLE_ID, path: "/projects", expect: "open" },
  { roleId: TEAM_LEAD_ROLE_ID, path: "/admin/permissions", expect: "404" },

  { roleId: DIVISION_HEAD_ROLE_ID, path: "/projects", expect: "open" },
  { roleId: DIVISION_HEAD_ROLE_ID, path: "/admin/permissions", expect: "404" },

  { roleId: CEO_ROLE_ID, path: "/projects", expect: "open" },
  { roleId: CEO_ROLE_ID, path: "/admin/permissions", expect: "404" },
];

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function expectRow(page: Page, row: { path: string; expect: Expectation }, label: string): Promise<void> {
  const response = await page.goto(row.path);
  expect(response?.status(), `${label} ${row.path}`).toBe(row.expect === "open" ? 200 : 404);
  // quick 261022-cwp: page.goto는 리다이렉트를 따라간 최종 응답을 준다 — 열림은 그 경로에 머문 것이어야 한다.
  if (row.expect === "open") expect(new URL(page.url()).pathname, `${label} ${row.path}`).toBe(row.path);
}

test.describe("계급 × 경로 노출 스모크 (07 기준 5)", () => {
  test("표가 시드 계급 다섯을 모두 덮는다", () => {
    const covered = new Set(ROLE_SMOKE.map((row) => row.roleId));
    expect([...covered].sort()).toEqual(SEED_ROLES.map((role) => role.id).sort());
  });

  for (const seedRole of SEED_ROLES) {
    const rows = ROLE_SMOKE.filter((row) => row.roleId === seedRole.id);
    test(`${seedRole.name} — 열림 ${rows.filter((row) => row.expect === "open").length} · 404 ${rows.filter((row) => row.expect === "404").length}`, async ({ page }) => {
      const user = await createFixtureUser({ roleId: seedRole.id, withTeam: true });
      await loginAs(page, user.email, user.password);
      for (const row of rows) await expectRow(page, row, seedRole.name);
    });
  }
});
