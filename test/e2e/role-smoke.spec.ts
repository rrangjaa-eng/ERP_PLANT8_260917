import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { lockoutConfig } from "@/domain/auth/lockout";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { recordAttempt } from "@/repositories/login-attempts";
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
// 07-05(D-722 확인 카드 2026-10-22 답 A · ⑧ 끔 · 사용자 결정 2026-10-22): ⑧이 꺼진 동안 ① 대표 행동 로그 보기 시드를 보류해
// 대표 행동 로그는 404다 — ⑧과 함께 켤 때 이 행을 뒤집는다. 증빙 목록(`/expenses/evidence`)은 evidence.intake 쓰기만 연다(06.1-05) — 기획 PM · 팀장의 증빙 보기는
// 지출결의 안 증빙 칸에서 쓰이고 이 목록은 404다. 증빙 행은 C-88 a · c 그대로다.
// 07-25(R12): 07 새 화면 — 알림 규칙(07-19) · 예산 현황(07-24) · 지급 목록(07-16) — 은 07-05 확정 표대로 새 메뉴(`admin.notification-rules` · `projects.budget`)와
// `expenses.payments`가 시스템 관리자만 켜져 있어 알림 규칙 · 예산 현황은 시스템 관리자만 열리고, 지급 목록은 지출결의 목록 안 보기(`지급 대상` 선택지)라 목록은 열리고 선택지는 시스템 관리자만 보인다. 링크 · 단추 보임은 아래 `ROLE_SMOKE_ELEMENTS`가 지킨다.
// 표의 기대값은 지금 시드의 실제 동작이다 — 어긋나면 시험을 고치지 말고 SUMMARY 「발견」으로 07-05에 넘긴다.

type Expectation = "open" | "404";

// screen404: 라우트에 loading.tsx가 있어 거부 응답이 스트리밍 200으로 나가고 notFound 화면만 그려지는 자리(07-24 `/projects/budget` — 07-24 projects-budget 스펙과 같은 판정:
// 「페이지 찾을 수 없음」 제목 + 표 없음). 거부 본문은 그려지지 않는다 — HTTP 상태만 200이다(SUMMARY 발견).
export const ROLE_SMOKE: readonly { roleId: string; path: string; expect: Expectation; screen404?: true }[] = [
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
  { roleId: CEO_ROLE_ID, path: "/admin/action-log", expect: "404" }, // D-722 ① 보류(⑧과 함께 켠다)
  { roleId: CEO_ROLE_ID, path: "/expenses/evidence", expect: "404" }, // D-722 ④ C-88 c

  { roleId: SYSADMIN_ROLE_ID, path: "/admin/notification-rules", expect: "open" }, // 07-19 · 07-05 ⑤ 시스템 관리자만
  { roleId: SYSADMIN_ROLE_ID, path: "/projects/budget", expect: "open" }, // 07-24 · 07-05 ⑤ 시스템 관리자만
  { roleId: SYSADMIN_ROLE_ID, path: "/expenses?status=지급 대상", expect: "open" }, // 07-16 지급 목록은 지출결의 목록 안 보기다 — 목록은 모두 열리고 보기 선택지(지급 대상)는 expenses.payments 보유 계급만(아래 요소 행)
  { roleId: DEFAULT_ROLE_ID, path: "/admin/notification-rules", expect: "404" }, // 07-19 · 07-05 ⑤ 시스템 관리자만
  { roleId: DEFAULT_ROLE_ID, path: "/projects/budget", expect: "404", screen404: true }, // 07-24 · 07-05 ⑤ 시스템 관리자만
  { roleId: DEFAULT_ROLE_ID, path: "/expenses?status=지급 대상", expect: "open" }, // 07-16 지급 목록은 지출결의 목록 안 보기다 — 목록은 모두 열리고 보기 선택지(지급 대상)는 expenses.payments 보유 계급만(아래 요소 행)
  { roleId: TEAM_LEAD_ROLE_ID, path: "/admin/notification-rules", expect: "404" }, // 07-19 · 07-05 ⑤ 시스템 관리자만
  { roleId: TEAM_LEAD_ROLE_ID, path: "/projects/budget", expect: "404", screen404: true }, // 07-24 · 07-05 ⑤ 시스템 관리자만
  { roleId: TEAM_LEAD_ROLE_ID, path: "/expenses?status=지급 대상", expect: "open" }, // 07-16 지급 목록은 지출결의 목록 안 보기다 — 목록은 모두 열리고 보기 선택지(지급 대상)는 expenses.payments 보유 계급만(아래 요소 행)
  { roleId: DIVISION_HEAD_ROLE_ID, path: "/admin/notification-rules", expect: "404" }, // 07-19 · 07-05 ⑤ 시스템 관리자만
  { roleId: DIVISION_HEAD_ROLE_ID, path: "/projects/budget", expect: "404", screen404: true }, // 07-24 · 07-05 ⑤ 시스템 관리자만
  { roleId: DIVISION_HEAD_ROLE_ID, path: "/expenses?status=지급 대상", expect: "open" }, // 07-16 지급 목록은 지출결의 목록 안 보기다 — 목록은 모두 열리고 보기 선택지(지급 대상)는 expenses.payments 보유 계급만(아래 요소 행)
  { roleId: CEO_ROLE_ID, path: "/admin/notification-rules", expect: "404" }, // 07-19 · 07-05 ⑤ 시스템 관리자만
  { roleId: CEO_ROLE_ID, path: "/projects/budget", expect: "404", screen404: true }, // 07-24 · 07-05 ⑤ 시스템 관리자만
  { roleId: CEO_ROLE_ID, path: "/expenses?status=지급 대상", expect: "open" }, // 07-16 지급 목록은 지출결의 목록 안 보기다 — 목록은 모두 열리고 보기 선택지(지급 대상)는 expenses.payments 보유 계급만(아래 요소 행)
];

// 07-25(R12): 같은 계급 × 요소. 경로가 404인 계급은 요소가 렌더되지 않는다(hidden). `{locked}`는 잠긴 계정 이메일로 바뀐다(사람 목록 `?q=`).
type ElementExpectation = "shown" | "hidden";
type SmokeElement = { roleId: string; path: string; locator: (page: Page) => ReturnType<Page["locator"]>; label: string; expect: ElementExpectation };

const ADMIN_NOTIFICATION_LINK = (page: Page) => page.getByRole("link", { name: "알림 규칙" });
const BUDGET_LINK = (page: Page) => page.getByRole("link", { name: "예산 현황" });
const UNLOCK_BUTTON = (page: Page) => page.getByRole("button", { name: "잠금 풀기" });
const PAYMENT_VIEW_OPTION = (page: Page) => page.locator("#expense-status option", { hasText: "지급 대상" });

export const ROLE_SMOKE_ELEMENTS: readonly SmokeElement[] = SEED_ROLES.flatMap((role): SmokeElement[] => {
  const admin = role.id === SYSADMIN_ROLE_ID ? "shown" : "hidden";
  return [
    { roleId: role.id, path: "/admin", locator: ADMIN_NOTIFICATION_LINK, label: "관리 인덱스 알림 규칙 링크", expect: admin },
    { roleId: role.id, path: "/projects", locator: BUDGET_LINK, label: "프로젝트 목록 예산 현황 링크", expect: admin },
    { roleId: role.id, path: "/admin/people?q={locked}", locator: UNLOCK_BUTTON, label: "사람 목록 잠금 풀기", expect: admin },
    { roleId: role.id, path: "/expenses?status=지급 대상", locator: PAYMENT_VIEW_OPTION, label: "지출결의 보기 지급 대상", expect: admin },
  ];
});

// 로그인 거부와 같은 판정(창 안 열린 실패 수 ≥ 임계)을 만든다 — 07-17 people-unlock-reset 스펙과 같은 방법.
async function makeLockedAccount(): Promise<string> {
  const email = `e2e-smoke-locked-${randomUUID()}@example.test`;
  await createAccount(SYSTEM_VIEWER, { email, name: `스모크잠김${randomUUID().slice(0, 6)}`, roleId: DEFAULT_ROLE_ID });
  const { threshold } = await lockoutConfig();
  for (let i = 0; i < threshold; i += 1) await recordAttempt(SYSTEM_VIEWER, { email, success: false, ip: null });
  return email;
}

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function expectRow(page: Page, row: { path: string; expect: Expectation; screen404?: true }, label: string): Promise<void> {
  const response = await page.goto(row.path);
  if (row.screen404) {
    await expect(page.getByRole("heading", { name: "페이지 찾을 수 없음" }), `${label} ${row.path}`).toBeVisible();
    await expect(page.locator("main table"), `${label} ${row.path}`).toHaveCount(0);
    return;
  }
  expect(response?.status(), `${label} ${row.path}`).toBe(row.expect === "open" ? 200 : 404);
  // quick 261022-cwp: page.goto는 리다이렉트를 따라간 최종 응답을 준다 — 열림은 그 경로에 머문 것이어야 한다.
  if (row.expect === "open") expect(new URL(page.url()).pathname, `${label} ${row.path}`).toBe(new URL(row.path, "http://smoke.local").pathname);
}

async function expectElement(page: Page, row: SmokeElement, lockedEmail: string, label: string): Promise<void> {
  const response = await page.goto(row.path.replace("{locked}", encodeURIComponent(lockedEmail)));
  const count = response?.status() === 200 ? await row.locator(page).count() : 0;
  expect(count > 0 ? "shown" : "hidden", `${label} ${row.label}`).toBe(row.expect);
}

test.describe("계급 × 경로 노출 스모크 (07 기준 5)", () => {
  test("표가 시드 계급 다섯을 모두 덮는다", () => {
    const covered = new Set(ROLE_SMOKE.map((row) => row.roleId));
    expect([...covered].sort()).toEqual(SEED_ROLES.map((role) => role.id).sort());
  });

  let lockedEmail = "";
  test.beforeAll(async () => {
    lockedEmail = await makeLockedAccount();
  });

  for (const seedRole of SEED_ROLES) {
    const rows = ROLE_SMOKE.filter((row) => row.roleId === seedRole.id);
    test(`${seedRole.name} — 열림 ${rows.filter((row) => row.expect === "open").length} · 404 ${rows.filter((row) => row.expect === "404").length}`, async ({ page }) => {
      const user = await createFixtureUser({ roleId: seedRole.id, withTeam: true });
      await loginAs(page, user.email, user.password);
      for (const row of rows) await expectRow(page, row, seedRole.name);
      for (const row of ROLE_SMOKE_ELEMENTS.filter((element) => element.roleId === seedRole.id)) await expectElement(page, row, lockedEmail, seedRole.name);
    });
  }
});
