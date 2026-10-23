import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createOrgUnit, createTeam } from "@/domain/org";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./leave-org";

// defect 2(wave 5 DOM 감사): 본부·팀 이름을 바꾸는 인라인 입력이 <label>도
// aria-label도 없어 스크린리더 사용자가 이게 어느 행의 이름 칸인지 알 수
// 없었다. org-client.tsx의 RenameInput이 aria-label={`${이름} 이름`}을
// 달게 고쳤다 — 이 스펙은 그게 실제로 렌더되고, 어느 행인지 식별 가능한지
// 화면에서 검증한다.

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("본부·팀 이름 변경 입력의 접근 가능한 이름 (defect 2)", () => {
  test("각 본부 이름 입력이 <본부 이름> 이름으로 된 고유한 접근 가능한 이름을 가진다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/org?new=org");

    const orgUnitName = `E2E본부-${Date.now()}`;
    await page.locator("#org-unit-form").getByLabel("이름").fill(orgUnitName);
    await page.locator("#org-unit-form button[type=submit]").click();

    const renameInput = page.getByLabel(`${orgUnitName} 이름`);
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveValue(orgUnitName);
  });

  test("각 팀 이름 입력이 <팀 이름> 이름으로 된 고유한 접근 가능한 이름을 가진다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/org?new=team");

    // 시드 데이터의 본부 하나를 골라 그 아래 팀을 만든다.
    const teamName = `E2E팀-${Date.now()}`;
    await page.locator("#team-form select[name=orgUnitId]").selectOption({ label: "기획본부" });
    await page.locator("#team-form").getByLabel("이름").fill(teamName);
    await page.locator("#team-form button[type=submit]").click();

    const renameInput = page.getByLabel(`${teamName} 이름`);
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveValue(teamName);
  });

  test("서로 다른 두 행의 이름 입력은 서로 다른 접근 가능한 이름을 가진다(행 구분 가능)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/org?new=org");

    const orgA = `E2E본부A-${Date.now()}`;
    const orgB = `E2E본부B-${Date.now()}`;
    await page.locator("#org-unit-form").getByLabel("이름").fill(orgA);
    await page.locator("#org-unit-form button[type=submit]").click();
    await expect(page.getByLabel(`${orgA} 이름`)).toBeVisible();

    await page.locator("#org-unit-form").getByLabel("이름").fill(orgB);
    await page.locator("#org-unit-form button[type=submit]").click();
    await expect(page.getByLabel(`${orgB} 이름`)).toBeVisible();

    // 같은 라벨을 공유하지 않는다 — getByLabel이 서로 다른 요소를 정확히 하나씩 찾는다.
    await expect(page.getByLabel(`${orgA} 이름`)).toHaveCount(1);
    await expect(page.getByLabel(`${orgB} 이름`)).toHaveCount(1);
  });
});

// 07-21(R10 · SC-13 · K14 · N4 · N10): 사람이 남은 팀의 `삭제`는 비활성 + 같은 줄 이유(`{N}명`은 사람 목록 필터 링크) — 창 없음.
// 빈 팀은 기존 두 단계 `삭제`(토스트 없음). `팀 추가` 패널의 본부 고르기는 공용 Select.
function teamRow(page: Page, teamName: string) {
  // 팀 줄은 본부 줄 안의 li — 이름 칸을 가진 가장 안쪽 li.
  return page.getByRole("listitem").filter({ has: page.getByLabel(`${teamName} 이름`) }).last();
}

test.describe("사람 남은 팀 보관 막기(07-21 SC-13)", () => {
  test("사람 있는 팀 — 비활성 삭제 · 같은 줄 이유 · 창 없음 · `1명` 링크 → 1행, 빈 팀은 두 단계 삭제 · 토스트 없음", async ({ page }) => {
    const suffix = randomUUID().slice(0, 6);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E소속본부-${suffix}` });
    const busy = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E소속팀-${suffix}` });
    const empty = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E빈팀-${suffix}` });
    await makePerson("소속", DEFAULT_ROLE_ID, busy.id, `${seoulToday().slice(0, 4)}-01-01`);

    await loginAs(page);
    await page.goto("/admin/people/org");
    const row = teamRow(page, busy.name);
    const remove = row.getByRole("button", { name: "삭제" });
    await expect(remove).toHaveAttribute("aria-disabled", "true");
    await expect(row).toContainText("소속 1명 · 먼저 옮기기");
    const describedBy = (await remove.getAttribute("aria-describedby")) ?? "";
    const reasonText = await page.evaluate((ids) => ids.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" "), describedBy);
    expect(reasonText).toContain("소속 1명 · 먼저 옮기기");
    await remove.click({ force: true });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(`${busy.name} 삭제 · 보관함으로 이동합니다`)).toHaveCount(0);
    // 본부 줄도 사람이 남아 같은 꼴이다.
    const orgRow = page.getByRole("listitem").filter({ has: page.getByLabel(`${orgUnit.name} 이름`) }).first();
    await expect(orgRow.getByRole("link", { name: "1명" }).first()).toHaveAttribute("href", `/admin/people?org=${orgUnit.id}`);

    const emptyRow = teamRow(page, empty.name);
    await emptyRow.getByRole("button", { name: "삭제" }).click();
    await emptyRow.getByRole("button", { name: "삭제" }).click();
    await expect(emptyRow.getByText("보관됨")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: empty.name })).toHaveCount(0);

    await row.getByRole("link", { name: "1명" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/people\\?team=${busy.id}$`));
    await expect(page.locator("main table:not([aria-hidden='true']) tbody tr").filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText(`팀 · ${busy.name}`, { exact: true })).toBeVisible();
  });

  test("팀 추가 패널 — 본부 없이 저장하면 본부 칸 오류 줄 · 고르고 저장하면 새 팀", async ({ page }) => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E팀추가본부-${randomUUID().slice(0, 6)}` });
    const teamName = `E2E새팀-${randomUUID().slice(0, 6)}`;
    await loginAs(page);
    await page.goto("/admin/people/org?new=team");
    const form = page.locator("#team-form");
    await form.getByLabel("이름").fill(teamName);
    await form.locator("button[type=submit]").click();
    await expect(form.locator("#team-org-unit-id-error")).toHaveText("본부 필요 · 본부 선택");
    await expect(form.getByLabel("본부")).toHaveAttribute("aria-describedby", /team-org-unit-id-error/);

    await form.getByLabel("본부").selectOption({ label: orgUnit.name });
    await form.locator("button[type=submit]").click();
    await expect(page.getByLabel(`${teamName} 이름`)).toBeVisible();
  });
});
