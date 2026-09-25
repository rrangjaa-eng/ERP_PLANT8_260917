import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";

// 04-11(D-76 · D-81 · PR #38 /qa 「잘못된 id 404」) — 날짜로 움직이는 상세. 날짜는 전부
// 오늘(KST)에서 더해 만든다 — 「종료일 = 오늘」 경계는 단위·통합이 now 주입으로 본다(A-18).
const TODAY = kstToday(new Date());

type Account = { userId: string; email: string; password: string };

async function makeAccount(roleId: string, teamId?: string, name = "E2E Employee"): Promise<Account> {
  const email = `e2e-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  if (teamId) await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function makeProject(input: {
  teamId: string;
  pmUserId: string;
  status: string;
  endDate: string;
}): Promise<{ id: string; number: string; name: string }> {
  const vendor = await insertVendor(SYSTEM_VIEWER, {
    name: `E2E기간클라이언트-${randomUUID()}`,
    normalizedName: `e2e기간클라이언트-${randomUUID()}`,
  });
  const name = `E2E기간-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: input.teamId,
    pmUserId: input.pmUserId,
    name,
    startDate: addDays(input.endDate, -3),
    endDate: input.endDate,
  });
  await db.update(projects).set({ status: input.status }).where(eq(projects.id, created.id));
  return { id: created.id, number: created.number, name };
}

// 서버 액션(일괄 저장) 응답 — 저장 성공 신호가 화면 글자 변화뿐일 때 먼저 기다린다.
function waitForSaveAction(page: Page) {
  return page.waitForResponse(
    (response) => response.request().method() === "POST" && response.request().headers()["next-action"] !== undefined,
  );
}

function headerTag(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).filter({ visible: true });
}

// 태그 글자색이 의미 토큰(--warning 등)과 같은지 — CSS 모듈 클래스 이름에 기대지 않는다.
async function hasTokenColor(locator: Locator, token: string): Promise<boolean> {
  return locator.evaluate((element, name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(element).color === expected;
  }, token);
}

test.describe("날짜로 움직이는 상세 (04-11, PROJ-04)", () => {
  // app/(app)/projects/loading.tsx가 이 세그먼트를 Suspense로 감싸 응답이 200으로 먼저 흐른다 —
  // notFound()는 상태 코드를 바꾸지 못하고 404 화면 + noindex(soft 404)가 된다
  // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md 「status code」).
  test("(0) 잘못된 모양의 id와 없는 uuid는 둘 다 404 화면(noindex)이고 오류 화면이 아니다 (PR #38 /qa)", async ({ page }) => {
    const pm = await makeAccount(DEFAULT_ROLE_ID, await makeTeam());
    await login(page, pm);

    for (const path of ["/projects/abc", `/projects/${randomUUID()}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없습니다" })).toBeVisible();
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
      await expect(page.getByRole("heading", { name: "문제가 생겼습니다" })).toHaveCount(0);
    }
  });

  test("(1) 종료일이 어제인 진행 프로젝트를 기획 PM이 열면 정산 태그(warning)이고 부제가 「정산 {오늘}」이다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const project = await makeProject({
      teamId: team,
      pmUserId: pm.userId,
      status: "in_progress",
      endDate: addDays(TODAY, -1),
    });

    await login(page, pm);
    await page.goto(`/projects/${project.id}`);

    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    const tag = headerTag(page, "정산");
    await expect(tag).toBeVisible();
    expect(await hasTokenColor(tag, "--warning")).toBe(true);
    await expect(page.getByText(`${project.number} · 상세 견적 1차 · 정산 ${TODAY}`, { exact: true })).toBeVisible();
  });
  // D-81 — 종료일이 지난 수주중은 자동으로 바뀌지 않고, 상태 태그 오른쪽 `--fs-sm --warning` 글자로 보인다.
  test("(2) 종료일이 지난 수주중 — 상태를 바꿀 수 있는 팀장에게는 「종료일 지남」 글자만, 담당 PM에게는 「종료일 지남 · 팀장 {이름}」", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const leadName = `팀장${randomUUID().slice(0, 6)}`;
    const lead = await makeAccount("role-team-lead", team, leadName);
    const project = await makeProject({
      teamId: team,
      pmUserId: pm.userId,
      status: "bidding",
      endDate: addDays(TODAY, -3),
    });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(headerTag(page, "수주중")).toBeVisible();
    await expect(page.getByRole("button", { name: "상태 바꾸기" })).toBeVisible();
    const leadNote = headerTag(page, "종료일 지남");
    await expect(leadNote).toBeVisible();
    expect(await hasTokenColor(leadNote, "--warning")).toBe(true);
    // 태그가 아니라 글자다 — 테두리가 없다.
    expect(await leadNote.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
    await expect(page.getByText(/종료일 지남 · 팀장/)).toHaveCount(0);

    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(page.getByRole("button", { name: "상태 바꾸기" })).toHaveCount(0);
    const pmNote = headerTag(page, `종료일 지남 · 팀장 ${leadName}`);
    await expect(pmNote).toBeVisible();
    expect(await hasTokenColor(pmNote, "--warning")).toBe(true);
  });
});

// 04-22(D-80 · S13 · 엔지 리뷰 A P1 · ENG-D2 · 사용자 결정 2026-09-25 「기간만 수정」) — 상세 기간 칸.
// 계급 권한·정보 노출을 손으로 켜지 않는다 — 시드(04-20 · 04-22 projects.period)만으로 팀장이 고친다.
test.describe("상세 기간 칸 (04-22, PROJ-04)", () => {
  test("(3) 같은 팀 팀장이 정산 프로젝트의 종료일을 늦추면 진행으로 돌아가고, 새로 고치지 않은 둘째 기간 저장도 통과한다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const endDate = addDays(TODAY, -1);
    const startDate = addDays(endDate, -3);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "settling", endDate });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(headerTag(page, "정산")).toBeVisible();
    await expect(page.getByText(`기간 ${startDate} ~ ${endDate}`, { exact: true })).toBeVisible();

    const firstEnd = addDays(TODAY, 7);
    await page.getByRole("button", { name: "기간 바꾸기" }).click();
    await page.getByLabel("종료일").fill(firstEnd);
    await expect(page.getByText("저장하면 진행으로 돌아감", { exact: true })).toBeVisible();
    const firstSave = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await firstSave;

    await expect(headerTag(page, "진행")).toBeVisible();
    await expect(page.getByText(`기간 ${startDate} ~ ${firstEnd}`, { exact: true })).toBeVisible();

    const secondEnd = addDays(TODAY, 9);
    await page.getByRole("button", { name: "기간 바꾸기" }).click();
    await page.getByLabel("종료일").fill(secondEnd);
    const secondSave = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await secondSave;

    await expect(page.getByText(`기간 ${startDate} ~ ${secondEnd}`, { exact: true })).toBeVisible();
    await expect(page.getByText("다른 사람이 먼저 기간을 바꿈 · 새로 고침")).toHaveCount(0);
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.status).toBe("in_progress");
    expect(row?.endDate).toBe(secondEnd);
  });

  test("(4) 진행의 담당 PM이 종료일을 어제로 앞당기면 칸 아래 「앞당기기는 팀장 {이름}」 + 표 합계 행 「전부 거부 · 다른 칸 오류 1칸」", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const leadName = `팀장${randomUUID().slice(0, 6)}`;
    await makeAccount("role-team-lead", team, leadName);
    const endDate = addDays(TODAY, 5);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "in_progress", endDate });

    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "기간 바꾸기" }).click();
    await page.getByLabel("종료일").fill(addDays(TODAY, -1));
    const saving = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await saving;

    const endInput = page.getByLabel("종료일");
    await expect(endInput).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(`종료일이 오늘보다 빠름 · 앞당기기는 팀장 ${leadName}`, { exact: true })).toBeVisible();
    await expect(page.locator("tfoot").getByText("전부 거부 · 다른 칸 오류 1칸")).toBeVisible();
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.endDate).toBe(endDate);
    expect(row?.status).toBe("in_progress");
  });

  test("(5) 팀장이 진행의 종료일을 어제로 적으면 「저장하면 정산이 됨」 힌트 → 저장 → 정산 태그", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "in_progress", endDate: addDays(TODAY, 5) });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expect(headerTag(page, "진행")).toBeVisible();
    await page.getByRole("button", { name: "기간 바꾸기" }).click();
    await page.getByLabel("종료일").fill(addDays(TODAY, -1));
    await expect(page.getByText("저장하면 정산이 됨", { exact: true })).toBeVisible();
    const saving = waitForSaveAction(page);
    await page.getByLabel("종료일").press("Control+s");
    await saving;

    await expect(headerTag(page, "정산")).toBeVisible();
  });

  test("(6) 기간 칸의 Esc는 편집 값을 되돌리고, 원래 값이면 묶음을 닫아 포커스가 「기간 바꾸기」로 돌아온다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const endDate = addDays(TODAY, 5);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "bidding", endDate });

    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "기간 바꾸기" }).click();
    const endInput = page.getByLabel("종료일");
    await endInput.fill(addDays(TODAY, 8));
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    await endInput.press("Escape");
    await expect(endInput).toHaveValue(endDate);
    await expect(page.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();

    await endInput.press("Escape");
    await expect(page.getByLabel("종료일")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "기간 바꾸기" })).toBeFocused();
  });
});
