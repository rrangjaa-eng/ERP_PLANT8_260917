import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { registerPerson, setResignationDate } from "@/domain/people";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { kstToday } from "@/lib/kst-date";
import { createFixtureUser } from "./fixtures";
import { makeDelegatedRole } from "../integration/admin-cap-fixtures";
import { trackTempRole } from "./temp-roles";

// F24 독립 DOM 감사(/mnt/project-files/07-review/f24-dom-audit.md) P1 · P3: 소속 발령 이력의 쓰기(「새 이력 추가」 · 예정 줄
// 「취소」)는 쓸 수 있는 목록에서만 그린다 — 퇴직자 · 보기만 계정에게는 둘 다 없다. 낡은 화면에서 취소가 서버에 거부되면
// 오류 한 줄로 말한다(잡히지 않은 거부 없음).

function dayOffset(days: number): string {
  return kstToday(new Date(Date.now() + days * 86_400_000));
}

async function login(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(creds.email);
  await page.getByLabel("비밀번호").fill(creds.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 대상 — 미래(+30일) 발령 하나가 예정으로 걸린 PM.
async function targetWithFutureAssignment(): Promise<{ userId: string; effectiveFrom: string }> {
  const suffix = randomUUID().slice(0, 6);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E이력본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E이력팀-${suffix}` });
  const { userId } = await registerPerson(SYSTEM_VIEWER, {
    name: `이력대상${suffix.slice(0, 5)}`,
    email: `e2e-history-lock-${randomUUID()}@example.test`,
    roleId: DEFAULT_ROLE_ID,
  });
  const effectiveFrom = dayOffset(30);
  await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom });
  return { userId, effectiveFrom };
}

const history = (page: Page) => page.locator("table", { has: page.locator("caption", { hasText: "소속 발령 이력" }) });

test.describe("소속 발령 이력 쓰기 잠금(F24 감사 P1 · P3)", () => {
  test("퇴직자 — 예정 줄은 보이고 「취소」 · 「새 이력 추가」는 없다", async ({ page }) => {
    await login(page, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
    const { userId, effectiveFrom } = await targetWithFutureAssignment();
    await setResignationDate(SYSTEM_VIEWER, userId, dayOffset(-1));
    await page.goto(`/admin/people/${userId}`);

    await expect(history(page).getByRole("row", { name: new RegExp(effectiveFrom) })).toBeVisible();
    await expect(history(page).getByRole("button", { name: "취소" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "새 이력 추가" })).toHaveCount(0);
  });

  test("보기만 계정 — 재직자 상세에도 「취소」 · 「새 이력 추가」가 없다", async ({ page }) => {
    // PM 칸 · 보임 복사 + admin.people 보기만(쓰기 없음).
    const roleId = await makeDelegatedRole({ name: "E2E사람보기만", menus: [{ menu: "admin.people", action: "view" }] });
    trackTempRole(roleId);
    await login(page, await createFixtureUser({ roleId }));
    const { userId, effectiveFrom } = await targetWithFutureAssignment();
    await page.goto(`/admin/people/${userId}`);

    await expect(history(page).getByRole("row", { name: new RegExp(effectiveFrom) })).toBeVisible();
    await expect(history(page).getByRole("button", { name: "취소" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "새 이력 추가" })).toHaveCount(0);
  });

  test("낡은 화면 — 연 뒤 퇴직이 되면 「취소」 거부를 오류 한 줄로 말하고 줄은 남는다", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await login(page, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
    const { userId, effectiveFrom } = await targetWithFutureAssignment();
    await page.goto(`/admin/people/${userId}`);
    const cancel = history(page).getByRole("button", { name: "취소" });
    await expect(cancel).toHaveCount(1);
    await setResignationDate(SYSTEM_VIEWER, userId, dayOffset(-1));

    await cancel.click();
    await expect(page.getByRole("alert").filter({ hasText: "퇴직한 사람 · 정보 변경 없음" })).toBeVisible();
    await expect(history(page).getByRole("row", { name: new RegExp(effectiveFrom) })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
