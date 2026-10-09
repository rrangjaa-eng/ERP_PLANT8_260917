import { randomUUID } from "node:crypto";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID, createRole } from "@/domain/permissions/roles";
import { archive } from "@/domain/archive";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { archiveTempRoles, insertTempRole } from "./expense-fixture";
import { makePerson, type Person } from "./leave-org";

// defect 2(wave 5 DOM 감사): 계급 이름을 바꾸는 인라인 입력이 <label>도
// aria-label도 없었다. roles-client.tsx의 RoleRow가
// aria-label={`${role.name} 이름`}을 달게 고쳤다.

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("계급 이름 변경 입력의 접근 가능한 이름 (defect 2)", () => {
  test("각 계급 이름 입력이 <계급 이름> 이름으로 된 고유한 접근 가능한 이름을 가진다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles?new=1");

    const roleName = `E2E계급-${Date.now()}`;
    await page.locator("#role-form").getByLabel("이름").fill(roleName);
    await page.locator("#role-form button[type=submit]").click();

    const renameInput = page.getByLabel(`${roleName} 이름`);
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveValue(roleName);
  });

  test("서로 다른 두 계급의 이름 입력은 서로 다른 접근 가능한 이름을 가진다(행 구분 가능)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles?new=1");

    const roleA = `E2E계급A-${Date.now()}`;
    const roleB = `E2E계급B-${Date.now()}`;
    await page.locator("#role-form").getByLabel("이름").fill(roleA);
    await page.locator("#role-form button[type=submit]").click();
    await expect(page.getByLabel(`${roleA} 이름`)).toBeVisible();

    await page.locator("#role-form").getByLabel("이름").fill(roleB);
    await page.locator("#role-form button[type=submit]").click();
    await expect(page.getByLabel(`${roleB} 이름`)).toBeVisible();

    await expect(page.getByLabel(`${roleA} 이름`)).toHaveCount(1);
    await expect(page.getByLabel(`${roleB} 이름`)).toHaveCount(1);
  });
});

// 04-27(D11·D20): 계급 표의 「업무 범위」 칸. 시드 계급의 값은 읽기만 한다 —
// 다른 워커의 상태 전환·기간 수정 스펙이 그 값을 읽는다(엔지 리뷰 A 공백 7).
// 바꾸는 것은 이 스펙이 beforeAll에서 만든 임시 계급뿐이다.
function selectedLabel(select: Locator): Locator {
  return select.locator("option:checked");
}

test.describe("계급 업무 범위 칸 (04-27 · D11·D20)", () => {
  const tempRoleName = `E2E 업무범위 ${Date.now()}`;
  let tempRoleId = "";

  test.beforeAll(async () => {
    const role = await createRole(SYSTEM_VIEWER, { name: tempRoleName });
    tempRoleId = role.id;
  });

  test.afterAll(async () => {
    if (tempRoleId) await archive(SYSTEM_VIEWER, "roles", tempRoleId);
  });

  test("시드 값을 보여 주고, 임시 계급을 전사로 바꾸면 새로 고쳐도 남고 되돌릴 수 있다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles");

    await expect(selectedLabel(page.getByLabel("팀장 업무 범위"))).toHaveText("자기 팀");
    await expect(selectedLabel(page.getByLabel("대표 업무 범위"))).toHaveText("전사");

    const tempScope = page.getByLabel(`${tempRoleName} 업무 범위`);
    await expect(selectedLabel(tempScope)).toHaveText("자기 팀");

    const savedToCompany = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/admin/people/roles"),
    );
    await tempScope.selectOption({ label: "전사" });
    await savedToCompany;

    await page.reload();
    await expect(selectedLabel(page.getByLabel(`${tempRoleName} 업무 범위`))).toHaveText("전사");

    const savedToTeam = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/admin/people/roles"),
    );
    await page.getByLabel(`${tempRoleName} 업무 범위`).selectOption({ label: "자기 팀" });
    await savedToTeam;

    await page.reload();
    await expect(selectedLabel(page.getByLabel(`${tempRoleName} 업무 범위`))).toHaveText("자기 팀");
  });
});

// /review(PR #76) 지적: 계급이 보관되면 listRoles가 그 계급을 빼서 사람 상세의
// 「계급 변경」 칸에 맞는 항목이 없고, 브라우저가 첫 계급을 골라 그 사람의
// 현재 계급처럼 보였다. 칸은 빈 값(「계급 선택」)이어야 한다.
test.describe("보관된 계급을 가진 사람의 상세 화면", () => {
  test("계급 변경 칸이 첫 계급이 아니라 빈 값으로 보인다", async ({ page }) => {
    await loginAs(page);

    const stamp = Date.now();
    const roleName = `E2E보관계급-${stamp}`;
    await page.goto("/admin/people/roles?new=1");
    await page.locator("#role-form").getByLabel("이름").fill(roleName);
    await page.locator("#role-form button[type=submit]").click();
    await expect(page.getByLabel(`${roleName} 이름`)).toBeVisible();

    const personName = `보관계급사람-${stamp}`;
    await page.goto("/admin/people");
    await page.getByRole("link", { name: "사람 등록" }).click();
    await page.getByLabel("이름").fill(personName);
    await page.getByLabel("이메일").fill(`e2e-archived-role-${stamp}@example.test`);
    await page.getByLabel("계급").selectOption({ label: roleName });
    await page.getByLabel("입사일").fill("2026-01-01");
    await page.getByRole("button", { name: "사람 등록" }).click();
    await expect(page.getByText(/초기 비밀번호 — /)).toBeVisible();

    // 계급을 보관한다 — 두 단계 삭제.
    await page.goto("/admin/people/roles");
    const roleRow = page.getByRole("row").filter({ has: page.getByLabel(`${roleName} 이름`) });
    await roleRow.getByRole("button", { name: "삭제" }).click();
    await roleRow.getByRole("button", { name: "삭제" }).click();
    // 보관된 계급은 기본 목록에서 빠진다.
    await expect(page.getByLabel(`${roleName} 이름`)).toHaveCount(0);

    await page.goto("/admin/people");
    await page.getByRole("row", { name: new RegExp(personName) }).getByRole("link", { name: "상세" }).click();

    const state = await page.getByLabel("계급 변경").evaluate((el) => (el as HTMLSelectElement).value);
    expect(state).toBe("");
  });
});

// 06.2-09(S1 · D-6201 · D-6203): 계급 표의 「보는 범위」 칸 — 업무 범위 칸과 같은 즉시 저장 select(폰은 읽기 글자).
// 시드 계급의 값은 읽기만 한다(다른 워커의 스펙이 시드 계급의 보이는 행에 기댄다). 바꾸는 것은 이 묶음이 만든 임시 계급뿐이다.
// 보는 범위는 P2 열이라 StaticTable이 같은 칸을 폰 접힌 줄에도 그린다(PC에서는 그 줄이 display:none) — 보이는 select 하나만 고른다.
function viewScopeSelect(page: Page, roleName: string): Locator {
  return page.getByLabel(`${roleName} 보는 범위`).filter({ visible: true });
}

const ROLES_POST = (response: { request(): { method(): string }; url(): string }) =>
  response.request().method() === "POST" && response.url().includes("/admin/people/roles");

test.describe("계급 보는 범위 칸 (06.2 S1 · D-6201 · D-6203)", () => {
  test.afterAll(async () => {
    await archiveTempRoles();
  });

  test("열이 업무 범위 바로 오른쪽 · 시드 여부 앞이고 시드 값이 대표 전사 · 본부 책임자 본부 · 팀장 팀 · 기획 PM 팀, 선택지는 전사 · 본부 · 팀 · 본인", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles");

    const headers = (await page.locator("main table:not([aria-hidden='true']) thead th").allTextContents()).map((text) => text.trim());
    expect(headers).toEqual(["이름", "업무 범위", "보는 범위", "시드 여부", "정렬", "동작"]);
    await expect(selectedLabel(viewScopeSelect(page, "대표"))).toHaveText("전사");
    await expect(selectedLabel(viewScopeSelect(page, "본부 책임자"))).toHaveText("본부");
    await expect(selectedLabel(viewScopeSelect(page, "팀장"))).toHaveText("팀");
    await expect(selectedLabel(viewScopeSelect(page, "기획 PM"))).toHaveText("팀");
    await expect(viewScopeSelect(page, "팀장").locator("option")).toHaveText(["전사", "본부", "팀", "본인"]);
  });

  test("임시 계급(보는 범위 팀) 사람은 다른 팀 프로젝트를 못 보다가 관리자가 전사로 고르면(확인 · 저장 버튼 없음) 다음 요청부터 본다", async ({ page, browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 6);
    const year = seoulToday().slice(0, 4);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E보는범위본부-${suffix}` });
    const ownTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E보는범위팀-${suffix}` });
    const otherTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E남의팀-${suffix}` });
    const roleName = `E2E보는범위-${suffix}`;
    const role = await insertTempRole({ id: `role-${randomUUID()}`, name: roleName, workScope: "team", viewScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
    const viewer: Person = await makePerson("보는범위", role.id, ownTeam.id, `${year}-01-01`);
    const otherPm = await makePerson("남의팀PM", "role-pm", otherTeam.id, `${year}-01-01`);
    const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E보는범위고객-${suffix}`, normalizedName: `e2e보는범위고객-${suffix}` });
    const projectName = `E2E남의팀행사-${suffix}`;
    await createProject(otherPm.viewer, { clientId: client.id, teamId: otherTeam.id, pmUserId: otherPm.viewer.id, name: projectName, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
    // 대조군 — 자기 팀 행사가 보여야 목록이 그 사람 범위로 그려졌다고 말할 수 있다(빈 목록은 표 없이 빈 화면 문구다).
    const ownPm = await makePerson("자기팀PM", "role-pm", ownTeam.id, `${year}-01-01`);
    const ownProjectName = `E2E자기팀행사-${suffix}`;
    await createProject(ownPm.viewer, { clientId: client.id, teamId: ownTeam.id, pmUserId: ownPm.viewer.id, name: ownProjectName, startDate: `${year}-01-01`, endDate: `${year}-12-31` });

    const viewerPage = await browser.newPage({ baseURL });
    await viewerPage.goto("/login");
    await viewerPage.getByLabel("이메일").fill(viewer.email);
    await viewerPage.getByLabel("비밀번호").fill(viewer.password);
    await viewerPage.getByRole("button", { name: "로그인" }).click();
    await expect(viewerPage).toHaveURL(/\/account$/);
    // 목록은 50건씩 끝난 달 순이라 공유 DB에서는 12월 행사가 1쪽 밖으로 밀린다 — 이 테스트 행사만 남게 검색으로 좁힌다(검색도 보는 범위 조건 안에서 돈다).
    await viewerPage.goto(`/projects?q=${encodeURIComponent(suffix)}`);
    await expect(viewerPage.getByRole("link", { name: ownProjectName, exact: true }).first()).toBeAttached();
    await expect(viewerPage.getByRole("link", { name: projectName, exact: true })).toHaveCount(0);

    await loginAs(page);
    await page.goto("/admin/people/roles");
    const scope = viewScopeSelect(page, roleName);
    await expect(selectedLabel(scope)).toHaveText("팀");
    const saved = page.waitForResponse(ROLES_POST);
    await scope.selectOption({ label: "전사" });
    await saved;
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await viewerPage.reload();
    await expect(viewerPage.getByRole("link", { name: projectName, exact: true }).first()).toBeAttached();

    await page.reload();
    await expect(selectedLabel(viewScopeSelect(page, roleName))).toHaveText("전사");
    await viewerPage.close();
  });

  test("새로 만든 계급의 보는 범위는 팀이다(D-6203 — 계급 추가 패널에 보는 범위 칸 없음)", async ({ page }) => {
    const roleName = `E2E새계급보는범위-${randomUUID().slice(0, 6)}`;
    await loginAs(page);
    await page.goto("/admin/people/roles?new=1");
    await expect(page.locator("#role-form").getByLabel(/보는 범위/)).toHaveCount(0);
    const created = await createRole(SYSTEM_VIEWER, { name: roleName });
    try {
      await page.goto("/admin/people/roles");
      await expect(selectedLabel(viewScopeSelect(page, roleName))).toHaveText("팀");
      await expect(viewScopeSelect(page, roleName)).toBeEnabled();
    } finally {
      await archive(SYSTEM_VIEWER, "roles", created.id);
    }
  });

  test("저장 요청이 끊기면 값이 저장된 값으로 돌아가고 select 아래 한 줄 「저장 실패 · 다시 시도」", async ({ page }) => {
    const roleName = `E2E보는범위실패-${randomUUID().slice(0, 6)}`;
    await insertTempRole({ id: `role-${randomUUID()}`, name: roleName, workScope: "team", viewScope: "team" });
    await loginAs(page);
    await page.goto("/admin/people/roles");
    const scope = viewScopeSelect(page, roleName);
    await expect(selectedLabel(scope)).toHaveText("팀");

    await page.route("**/admin/people/roles", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await scope.selectOption({ label: "본부" });
    const cell = page.getByRole("row").filter({ has: scope });
    await expect(cell.getByText("저장 실패 · 다시 시도")).toBeVisible();
    await expect(selectedLabel(scope)).toHaveText("팀");
  });
});

// 06.2 PR-6 R-1(사용자 결정 2026-10-09 「글자로」): admin.people 보기만 있고 쓰기가 없는 사람에게는
// 이름 · 업무 범위 · 보는 범위 칸이 입력 칸이 아니라 글자다(바꾸면 서버가 거부해 값이 되돌아가던 칸). 쓰기 권한자는 그대로.
test.describe("계급 표 읽기 전용(admin.people 보기만 · 06.2 PR-6 R-1)", () => {
  test.afterAll(async () => {
    await archiveTempRoles();
  });

  test("보기만이면 이름 · 업무 범위 · 보는 범위가 글자이고 입력 칸이 없다 — 쓰기 권한자는 그대로 입력 칸", async ({ page, browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 6);
    const targetName = `E2E읽기계급-${suffix}`;
    await insertTempRole({ id: `role-${randomUUID()}`, name: targetName, workScope: "company", viewScope: "org_unit" });
    const readerRole = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E계급보기만-${suffix}`, workScope: "team", viewScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: readerRole.id, menu: "admin.people", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: readerRole.id, infoItem: "role.value", visible: true });
    const reader = await createFixtureUser({ roleId: readerRole.id });

    const readerPage = await browser.newPage({ baseURL });
    await readerPage.goto("/login");
    await readerPage.getByLabel("이메일").fill(reader.email);
    await readerPage.getByLabel("비밀번호").fill(reader.password);
    await readerPage.getByRole("button", { name: "로그인" }).click();
    await expect(readerPage).toHaveURL(/\/account$/);
    await readerPage.goto("/admin/people/roles");

    await expect(readerPage.getByRole("heading", { name: "계급" }).first()).toBeVisible();
    await expect(readerPage.getByLabel(`${targetName} 이름`)).toHaveCount(0);
    await expect(readerPage.getByLabel(`${targetName} 업무 범위`)).toHaveCount(0);
    await expect(readerPage.getByLabel(`${targetName} 보는 범위`)).toHaveCount(0);
    const row = readerPage.getByRole("row").filter({ hasText: targetName }).filter({ visible: true });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("전사");
    await expect(row).toContainText("본부");
    await expect(row.locator("select:visible, input:visible")).toHaveCount(0);
    const readerHeaderBg = await readerPage
      .getByRole("columnheader", { name: "이름" })
      .filter({ visible: true })
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    await readerPage.close();

    await loginAs(page);
    await page.goto("/admin/people/roles");
    await expect(page.getByLabel(`${targetName} 이름`)).toBeEnabled();
    await expect(page.getByLabel(`${targetName} 업무 범위`).filter({ visible: true })).toBeEnabled();
    await expect(viewScopeSelect(page, targetName)).toBeEnabled();
    // 읽기 전용 표는 읽기 표 표면, 쓰기 권한자는 편집 표 표면(--surface-selected) — 헤더 배경이 달라야 한다
    const writerHeaderBg = await page
      .getByRole("columnheader", { name: "이름" })
      .filter({ visible: true })
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(readerHeaderBg, "계급 표 읽기 전용 · 읽기 표 표면(헤더 배경이 편집 표와 다르다)").not.toBe(writerHeaderBg);
  });
});

// 06.2 CSO-1 R-1(사용자 결정 2026-10-08 「막기」): 자기 계급의 업무 범위 · 보는 범위는 바꿀 수 없다 —
// 서버가 거부하기 전에 화면이 그 두 칸을 글자로 그린다. 다른 계급 행은 쓰기 권한자에게 그대로 입력 칸.
test.describe("자기 계급 행의 범위 칸(CSO-1 R-1)", () => {
  test("시스템 관리자가 자기 계급 행에서는 업무 범위 · 보는 범위가 글자이고, 팀장 행은 활성 select", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/roles");

    const own = "시스템 관리자";
    await expect(page.getByLabel(`${own} 업무 범위`)).toHaveCount(0);
    await expect(page.getByLabel(`${own} 보는 범위`)).toHaveCount(0);
    const ownRow = page.getByRole("row").filter({ hasText: own }).filter({ visible: true });
    await expect(ownRow).toHaveCount(1);
    await expect(ownRow).toContainText("전사");
    await expect(ownRow.locator("select:visible")).toHaveCount(0);

    await expect(page.getByLabel("팀장 업무 범위").filter({ visible: true })).toBeEnabled();
    await expect(viewScopeSelect(page, "팀장")).toBeEnabled();
  });
});
