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
// 07-05(D-722 확인 카드 2026-10-22 답 A · ⑧ 끔): 대표 행동 로그 열림 행은 두지 않는다 — 메뉴 보기는 켰지만 상세 노출이 꺼져 있어
// 07-25가 404를 단언한다(R10). 증빙 목록(`/expenses/evidence`)은 evidence.intake 쓰기만 연다(06.1-05) — 기획 PM · 팀장의 증빙 보기는
// 지출결의 안 증빙 칸에서 쓰이고 이 목록은 404다. 증빙 행은 C-88 a · c 그대로다.
// 표의 기대값은 지금 시드의 실제 동작이다 — 어긋나면 시험을 고치지 말고 SUMMARY 「발견」으로 07-05에 넘긴다.

type Expectation = "open" | "404";

export const ROLE_SMOKE: readonly { roleId: string; path: string; expect: Expectation }[] = [
  { roleId: SYSADMIN_ROLE_ID, path: "/admin", expect: "open" },
  { roleId: SYSADMIN_ROLE_ID, path: "/admin/action-log", expect: "open" },
  { roleId: SYSADMIN_ROLE_ID, path: "/admin/permissions", expect: "open" },
  { roleId: SYSADMIN_ROLE_ID, path: "/projects", expect: "open" },
  { roleId: SYSADMIN_ROLE_ID, path: "/expenses/evidence", expect: "open" }, // D-722 ② C-88 a

  { roleId: DEFAULT_ROLE_ID, path: "/projects", expect: "open" },
  { roleId: DEFAULT_ROLE_ID, path: "/admin/action-log", expect: "404" },
  { roleId: DEFAULT_ROLE_ID, path: "/admin/permissions", expect: "404" },
  { roleId: DEFAULT_ROLE_ID, path: "/expenses/evidence", expect: "404" }, // 06.1-05 증빙 목록은 evidence.intake 쓰기만

  { roleId: TEAM_LEAD_ROLE_ID, path: "/projects", expect: "open" },
  { roleId: TEAM_LEAD_ROLE_ID, path: "/admin/permissions", expect: "404" },
  { roleId: TEAM_LEAD_ROLE_ID, path: "/expenses/evidence", expect: "404" }, // 06.1-05 증빙 목록은 evidence.intake 쓰기만

  { roleId: DIVISION_HEAD_ROLE_ID, path: "/projects", expect: "open" },
  { roleId: DIVISION_HEAD_ROLE_ID, path: "/admin/permissions", expect: "404" },
  { roleId: DIVISION_HEAD_ROLE_ID, path: "/admin/action-log", expect: "404" }, // D-722 ①은 대표만
  { roleId: DIVISION_HEAD_ROLE_ID, path: "/expenses/evidence", expect: "404" }, // D-722 ④ C-88 c

  { roleId: CEO_ROLE_ID, path: "/projects", expect: "open" },
  { roleId: CEO_ROLE_ID, path: "/admin/permissions", expect: "404" },
  { roleId: CEO_ROLE_ID, path: "/expenses/evidence", expect: "404" }, // D-722 ④ C-88 c
];

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
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
      for (const row of rows) {
        const response = await page.goto(row.path);
        expect(response?.status(), `${seedRole.name} ${row.path}`).toBe(row.expect === "open" ? 200 : 404);
      }
    });
  }
});
