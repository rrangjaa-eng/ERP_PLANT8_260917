import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
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
  startDate?: string;
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
    startDate: input.startDate ?? addDays(input.endDate, -3),
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
    // 04-44 리뷰 S-1 — 상태 날짜는 부제 문자열 밖, 총 매출 예상가 뒤 항목이다(UI-SPEC S3).
    await expect(page.getByText(`${project.number} · 상세 견적 1차`, { exact: true })).toBeVisible();
    await expect(page.getByText(`정산 ${TODAY}`, { exact: true })).toBeVisible();
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

  test("(3b) 상태를 바꾼 기간 저장 뒤 새로 고침(router.refresh)이 오기 전의 둘째 저장도 「상태가 바뀜」으로 거부되지 않는다(리뷰 S5)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const endDate = addDays(TODAY, -1);
    const startDate = addDays(endDate, -3);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "settling", endDate });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expect(headerTag(page, "정산")).toBeVisible();

    // router.refresh()의 RSC 요청을 붙잡아 둔다 — 화면이 저장 결과만으로 둘째 저장을 보내는지 본다.
    let releaseRefresh = () => {};
    const refreshHeld = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    await page.route(`**/projects/${project.id}**`, async (route) => {
      const request = route.request();
      if (request.method() === "GET" && (request.headers()["rsc"] === "1" || request.url().includes("_rsc="))) {
        await refreshHeld;
      }
      await route.continue();
    });

    const firstEnd = addDays(TODAY, 7);
    await page.getByRole("button", { name: "기간 바꾸기" }).click();
    await page.getByLabel("종료일").fill(firstEnd);
    const firstSave = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await firstSave;
    await expect(page.getByText(`기간 ${startDate} ~ ${firstEnd}`, { exact: true })).toBeVisible();

    const secondEnd = addDays(TODAY, 9);
    await page.getByRole("button", { name: "기간 바꾸기" }).click();
    await page.getByLabel("종료일").fill(secondEnd);
    const secondSave = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await secondSave;

    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.status).toBe("in_progress");
    expect(row?.endDate).toBe(secondEnd);
    await expect(page.getByText(/상태가 .+로 바뀜/)).toHaveCount(0);

    releaseRefresh();
    await expect(headerTag(page, "진행")).toBeVisible();
  });

  test("(4) 진행의 담당 PM이 종료일을 어제로 앞당기면 칸 아래 「앞당기기는 팀장 {이름}」 + 표 합계 행 「전부 거부 · 다른 칸 오류 1칸」", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const leadName = `팀장${randomUUID().slice(0, 6)}`;
    await makeAccount("role-team-lead", team, leadName);
    const endDate = addDays(TODAY, 5);
    // 시작일은 과거 — 어제로 앞당긴 종료일이 「시작일보다 빠름」이 아니라 「오늘보다 빠름」에 걸리게.
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "in_progress", endDate, startDate: addDays(TODAY, -3) });
    // 합계 행이 있어야 U-6 거부 줄이 붙는다 — 견적 줄 하나를 둔다(빈 표에는 합계 행이 없다).
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("시드된 소분류가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      { subcategory: subcategory.value, itemName: "기간 거부 줄", quantity: 1, unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
    ]);

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
    const project = await makeProject({
      teamId: team,
      pmUserId: pm.userId,
      status: "in_progress",
      endDate: addDays(TODAY, 5),
      startDate: addDays(TODAY, -3),
    });

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

// 04-44(DR-28 · DR-37 · 계약 8 · S17) — 머리 줄 부제의 총 매출 예상가. 권리는 기간 칸과 같다. 계급 권한·정보
// 노출은 시드 그대로 둔다(ENG-D2).
test.describe("상세 총 매출 예상가 칸 (04-44, PROJ-07)", () => {
  test("(7) 같은 팀 팀장이 수주중 프로젝트의 총 매출 예상가를 부제 3차로 열어 저장하면 부제가 새 값이고, 새로 고쳐도 같다 · 값이 0이면 「총 매출 예상가 —」", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "bidding", endDate: addDays(TODAY, 20) });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(page.getByText("총 매출 예상가 —", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "총 매출 예상가 바꾸기" }).click();
    const amount = page.getByLabel("총 매출 예상가", { exact: true });
    await amount.fill("50000000");
    await expect(amount).toHaveValue("50,000,000");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    const saving = waitForSaveAction(page);
    await amount.press("Control+s");
    await saving;

    await expect(page.getByText("총 매출 예상가 50,000,000", { exact: true })).toBeVisible();
    await expect(page.getByLabel("총 매출 예상가", { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("총 매출 예상가 50,000,000", { exact: true })).toBeVisible();
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.preEstimateAmountKrw).toBe(50_000_000);
  });

  test("(8) 정산 프로젝트의 담당 PM에게는 값만 있고 「총 매출 예상가 바꾸기」가 없다(권리 none)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "settling", endDate: addDays(TODAY, -1) });

    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText("총 매출 예상가 —", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "총 매출 예상가 바꾸기" })).toHaveCount(0);
  });

  test("(9) 음수 금액을 Ctrl+S로 저장하면 칸 아래 「0 이상」 + 견적 표 합계 행 「전부 거부 · 다른 칸 오류 1칸」 · Esc 두 번이면 묶음이 닫히고 포커스가 3차로", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "bidding", endDate: addDays(TODAY, 20) });
    // 합계 행이 있어야 U-6 거부 줄이 붙는다(빈 표에는 합계 행이 없다).
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("시드된 소분류가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      { subcategory: subcategory.value, itemName: "예상가 거부 줄", quantity: 1, unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
    ]);

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "총 매출 예상가 바꾸기" }).click();
    const amount = page.getByLabel("총 매출 예상가", { exact: true });
    await amount.fill("-1");
    const saving = waitForSaveAction(page);
    await amount.press("Control+s");
    await saving;

    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("총 매출 예상가는 0 이상 · 금액을 고쳐 주세요", { exact: true })).toBeVisible();
    await expect(page.locator("tfoot").getByText("전부 거부 · 다른 칸 오류 1칸")).toBeVisible();
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.preEstimateAmountKrw).toBe(0);

    await amount.press("Escape");
    await expect(amount).toHaveValue("");
    await amount.press("Escape");
    await expect(page.getByLabel("총 매출 예상가", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "총 매출 예상가 바꾸기" })).toBeFocused();
  });

  test("(10) 상태가 바뀌어 전부 거부된 뒤 「복원」은 총 매출 예상가 묶음을 열고 편집 값을 dirty로 되살린다(D-68)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "bidding", endDate: addDays(TODAY, 20) });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "총 매출 예상가 바꾸기" }).click();
    const amount = page.getByLabel("총 매출 예상가", { exact: true });
    await amount.fill("7000000");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    // 그새 다른 사람이 미수주로 닫았다(화면이 본 상태와 다르다 — DR-6).
    await db.update(projects).set({ status: "lost" }).where(eq(projects.id, project.id));
    const saving = waitForSaveAction(page);
    await amount.press("Control+s");
    await saving;

    await expect(headerTag(page, "미수주")).toBeVisible();
    await expect(page.getByText("저장 안 한 편집 1칸")).toBeVisible();
    await page.getByRole("button", { name: "복원" }).click();
    await expect(page.getByLabel("총 매출 예상가", { exact: true })).toHaveValue("7,000,000");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
  });
});

// 04-44(S7 · S13 · DR-26) — 상태 모달의 막힘·종료일 지남이 머리 줄 기간 칸으로 이어진다. 시드 권한만 쓴다(ENG-D2).
test.describe("상태 모달 → 기간 칸 · 폰 부제 순서 (04-44, PROJ-04)", () => {
  test("(11) 시작일 없는 수주중에서 진행을 고르면 막힘 옆 3차 「기간 적기」 — 누르면 모달이 닫히고 시작일 칸에 포커스", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "bidding", endDate: addDays(TODAY, 20) });
    await db.update(projects).set({ startDate: null }).where(eq(projects.id, project.id));

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "상태 바꾸기" }).click();
    await page.getByRole("dialog", { name: "상태 바꾸기" }).getByRole("button", { name: /^진행/ }).click();
    const confirm = page.getByRole("dialog", { name: "진행으로 바꾸기" });
    await expect(confirm.getByText("시작일 없음 · 기간 적기", { exact: true }).filter({ visible: true })).toBeVisible();

    await confirm.getByRole("button", { name: "기간 적기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("시작일")).toBeFocused();
  });

  test("(12) 종료일이 지난 수주중을 진행으로 바꾸는 모달의 결과 줄 옆 3차 「기간 바꾸기」 — 누르면 모달이 닫히고 종료일 칸에 포커스", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "bidding", endDate: addDays(TODAY, -3) });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "상태 바꾸기" }).click();
    await page.getByRole("dialog", { name: "상태 바꾸기" }).getByRole("button", { name: /^진행/ }).click();
    const confirm = page.getByRole("dialog", { name: "진행으로 바꾸기" });
    await expect(confirm.getByText("종료일 지남 · 바로 정산", { exact: true })).toBeVisible();

    await confirm.getByRole("button", { name: "기간 바꾸기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("종료일")).toBeFocused();
  });

  test("(13) 종료일이 지난 미수주의 「진행으로 되돌리기」 모달도 결과 줄 3차 「기간 바꾸기」로 종료일 칸에 포커스", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "lost", endDate: addDays(TODAY, -3) });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "진행으로 되돌리기" }).click();
    const revert = page.getByRole("dialog", { name: "진행으로 되돌리기" });
    await expect(revert.getByText("종료일 지남 · 바로 정산", { exact: true })).toBeVisible();

    await revert.getByRole("button", { name: "기간 바꾸기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("종료일")).toBeFocused();
  });

  // UI-SPEC S3(:1122) · DR-26(:498, :1153) — `번호 · 차수 · … · 총 매출 예상가 … · 상태 날짜` 순서, 폰은 `기간 …`이 첫 항목.
  async function headerItemTops(page: Page, project: { number: string }, endDate: string) {
    const items = {
      period: page.getByText(`기간 ${addDays(endDate, -3)} ~ ${endDate}`, { exact: true }),
      subtitle: page.getByText(`${project.number} · 상세 견적 1차`, { exact: true }),
      preEstimate: page.getByText("총 매출 예상가 —", { exact: true }),
      statusDate: page.getByText(`수주중 ${TODAY}`, { exact: true }),
    };
    const tops: Record<string, number> = {};
    for (const [key, locator] of Object.entries(items)) {
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      if (!box) throw new Error(`${key} 항목이 보이지 않습니다`);
      tops[key] = box.y;
    }
    return tops as Record<keyof typeof items, number>;
  }

  test("(14) 375×812에서 부제 첫 항목은 `기간 …`이고 나머지 부제(번호 · 차수 → 총 매출 예상가 → 상태 날짜)가 그 아래다 (DR-26)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const endDate = addDays(TODAY, 20);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "bidding", endDate });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    const tops = await headerItemTops(page, project, endDate);
    expect(tops.period).toBeLessThan(tops.subtitle);
    expect(tops.subtitle).toBeLessThan(tops.preEstimate);
    expect(tops.preEstimate).toBeLessThan(tops.statusDate);
  });

  test("(14b) 1280에서 부제 순서는 번호 · 차수 → 기간 → 총 매출 예상가 → 상태 날짜다 (UI-SPEC S3, 리뷰 S-1)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const endDate = addDays(TODAY, 20);
    const project = await makeProject({ teamId: team, pmUserId: pm.userId, status: "bidding", endDate });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    const tops = await headerItemTops(page, project, endDate);
    expect(tops.subtitle).toBeLessThan(tops.period);
    expect(tops.period).toBeLessThan(tops.preEstimate);
    expect(tops.preEstimate).toBeLessThan(tops.statusDate);
  });
});
