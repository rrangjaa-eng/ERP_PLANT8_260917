import { test, expect, type Page } from "@playwright/test";
import { measurePhoneRows } from "./helpers/phone-rows";
import { randomUUID } from "node:crypto";
import { createProject } from "@/domain/projects";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { findUserByEmail } from "@/repositories/users";
import { insertVendor } from "@/repositories/vendors";
import { runSeed } from "../../scripts/codex-design-review/seeds";
import { loginAsAdmin } from "./people-list-helpers";

// 07.1-18 Task 1 · 2 (PA1 · C-02 · C-74 · W1 · U-1 option-a · D-E7) — 폰 표 행은 두 줄(주 행 한 줄 + 접힌 줄 한 줄)이다.
// 대상은 행 시트 표(`onRowTap` — 표 루트 `data-row-sheet`)와 행 링크 표(`a[data-row-link]`). 판정은 DOM 실측이다(스크린샷 육안 금지).

async function login(page: Page, person: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(person.email);
  await page.getByLabel("비밀번호").fill(person.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

for (const width of [375, 320] as const) {
  test.describe(`폰 ${width} 행 시트 표 — 공용 규칙`, () => {
    test.use({ viewport: { width, height: 800 } });

    test(`증빙 목록(트레이서) — 행은 두 줄이고 거래처 · 상태 아래 줄은 접힌 줄 앞 글자로 간다 (${width})`, async ({ browser, baseURL, page }) => {
      test.setTimeout(240_000);
      const seeded = await runSeed("evidence-intake-filled", browser, baseURL);
      await login(page, seeded.viewer);
      await page.goto("/expenses/evidence");
      const table = page.locator("table[data-row-sheet]");
      await expect(table).toBeVisible();
      const shape = await measurePhoneRows(table);
      expect(shape.rows).toBeGreaterThan(0);
      expect(shape.maxMainCellLines, `주 행 셀 줄 수 ${shape.worstCell}`).toBeLessThanOrEqual(1);
      expect(shape.maxFoldedLines, "접힌 줄 줄 수").toBeLessThanOrEqual(1);
      expect(shape.minRowHeight, "데이터 행 높이").toBeGreaterThanOrEqual(44);
      expect(shape.visibleSecondary, "폰 주 행에 보이는 셀 아래 줄").toBe(0);
      expect(shape.hiddenSecondary, "숨은 셀 아래 줄(공허 방지)").toBeGreaterThan(0);
      // E-P2-47 · D-7106 — 거래처 아래 줄(kindLine)이 접힌 줄 앞에 글자로 실린다.
      expect(shape.foldedTexts.some((text) => /카드/.test(text)), `접힌 줄 글자 ${JSON.stringify(shape.foldedTexts)}`).toBe(true);
      expect(shape.overflow, "문서 가로 넘침").toBeLessThanOrEqual(0);
    });
  });
}

// 행 링크 표(D-E7 · `a[data-row-link]`) — /projects. 긴 이름은 한 줄 말줄임(「…」)이고 링크 접근 이름은 전체 글자다.
for (const width of [375, 320] as const) {
  test.describe(`폰 ${width} 행 링크 표 — /projects`, () => {
    test.use({ viewport: { width, height: 800 } });

    test(`긴 프로젝트 이름은 주 행 한 줄 말줄임 · 접근 이름은 전체 글자 (${width})`, async ({ page }) => {
      test.setTimeout(180_000);
      const suffix = randomUUID().slice(0, 8);
      const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E행링크본부-${suffix}` });
      const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E행링크팀-${suffix}` });
      const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E행링크-${suffix}`, normalizedName: `e2e행링크-${suffix}` });
      const admin = await loginAsAdmin(page);
      const adminUser = await findUserByEmail(SYSTEM_VIEWER, admin.email);
      const longName = `가나다라마바사아자차카타파하 매우 긴 프로젝트 이름 ${suffix} 끝까지 한 줄로 보이지 않아야 하는 이름`;
      await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: adminUser?.id ?? "", name: longName, startDate: null, endDate: null });
      await page.goto(`/projects?q=${encodeURIComponent(suffix)}`);
      const table = page.locator("table").filter({ has: page.locator("a[data-row-link]") }).first();
      await expect(table).toBeVisible();
      const shape = await measurePhoneRows(table);
      expect(shape.rows).toBeGreaterThan(0);
      expect(shape.maxMainCellLines, `주 행 셀 줄 수 ${shape.worstCell}`).toBeLessThanOrEqual(1);
      expect(shape.maxFoldedLines).toBeLessThanOrEqual(1);
      expect(shape.ellipsisBoxes.length, "말줄임이 걸린 칸").toBeGreaterThanOrEqual(1);
      expect(shape.overflow).toBeLessThanOrEqual(0);
      await expect(page.getByRole("link", { name: longName, exact: true })).toHaveCount(1);
    });
  });
}

// 제외 표 — /admin/people는 행 시트 표도 행 링크 표도 아니라 말줄임 규칙이 걸리지 않는다.
test("폰 375 — /admin/people는 행 시트 표 표식 없음 · 말줄임 칸 없음", async ({ page }) => {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/admin/people");
  const table = page.locator("table").first();
  await expect(table).toBeVisible();
  await expect(page.locator("table[data-row-sheet]")).toHaveCount(0);
  const shape = await measurePhoneRows(table);
  expect(shape.ellipsisBoxes, "말줄임 칸 0").toHaveLength(0);
});
