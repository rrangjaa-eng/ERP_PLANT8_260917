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
});
