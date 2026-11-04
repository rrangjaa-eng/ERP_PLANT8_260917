import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission } from "@/repositories/permissions";
import { loginAs, teamIdByName } from "./helpers/evidence";
import { insertTempRole } from "./temp-roles";

// 07.3-01 트레이서(D-7301 · D-7312): 같은 team 계급 · 같은 증빙 등록 권한이어도 소속 본부가 메뉴 · 화면 진입을 가른다.
// 시험 DB는 global-setup의 seedMasterData가 경영관리본부 · 경영관리팀 · 자금 본부 설정을 세운다.
async function createTeamIntakeRole(): Promise<string> {
  const roleId = `role-e2e-fund-${randomUUID()}`;
  await insertTempRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 자금 ${roleId.slice(-8)}`, sortOrder: 99, viewScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
  return roleId;
}

function railEvidence(page: Page) {
  return page.getByRole("banner").getByRole("link", { name: "증빙", exact: true });
}

test.describe("자금 게이트 — 증빙 등록 (07.3-01)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("경영관리팀 사람은 레일에 「증빙」이 보이고 /expenses/evidence가 열린다", async ({ page }) => {
    await loginAs(page, await createTeamIntakeRole(), await teamIdByName("경영관리팀"));

    await expect(railEvidence(page)).toHaveCount(1);
    const response = await page.goto("/expenses/evidence");
    expect(response?.status()).toBe(200);
  });

  test("같은 계급의 기획1팀 사람은 레일 「증빙」이 없고 /expenses/evidence가 404다", async ({ page }) => {
    await loginAs(page, await createTeamIntakeRole(), await teamIdByName("기획1팀"));

    await expect(railEvidence(page)).toHaveCount(0);
    const response = await page.goto("/expenses/evidence");
    expect(response?.status()).toBe(404);
  });
});

// 07.3-02(D-7315): 시드 계급 그대로(시험 계급 · 권한 조작 없이) — 기본 계급에 자금 키가 시드돼 소속 본부만 가른다.
test.describe("자금 게이트 — 시드 계급 (07.3-02)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("경영관리팀 기본 계급 사람은 레일에 「증빙」이 보이고 /expenses/evidence가 열린다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID, await teamIdByName("경영관리팀"));

    await expect(railEvidence(page)).toHaveCount(1);
    const response = await page.goto("/expenses/evidence");
    expect(response?.status()).toBe(200);
  });

  test("기획1팀 기본 계급 사람은 레일 「증빙」이 없고 /expenses/evidence가 404다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID, await teamIdByName("기획1팀"));

    await expect(railEvidence(page)).toHaveCount(0);
    const response = await page.goto("/expenses/evidence");
    expect(response?.status()).toBe(404);
  });
});
