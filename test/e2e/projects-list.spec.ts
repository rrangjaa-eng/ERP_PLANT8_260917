import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { checkPrinciples } from "./principles-check";
import { isStrict } from "./design-principles";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teams, users } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { createOrgUnit, createTeam } from "@/domain/org";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { addDays, kstToday, kstYear } from "@/lib/kst-date";
import { changeProjectStatus } from "@/domain/projects/status";
import { saveRevenue } from "@/domain/revenue";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { listCodeItems, updateCodeItemLabel } from "@/repositories/code-tables";

async function findUserIdByEmail(email: string): Promise<string> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!row) throw new Error(`fixture user ${email}를 찾지 못했습니다`);
  return row.id;
}

async function setupPm(): Promise<{ email: string; password: string; pmUserId: string; clientId: string; teamId: string }> {
  const vendor = await insertVendor(SYSTEM_VIEWER, {
    name: `E2E목록클라이언트-${randomUUID()}`,
    normalizedName: `e2e목록클라이언트-${randomUUID()}`,
  });
  const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  return { ...pm, pmUserId: await findUserIdByEmail(pm.email), clientId: vendor.id, teamId: team.id };
}

// 사용자 결정 2026-09-26(「숨기기」) — 빈 목록의 「프로젝트 등록」도 등록할 수 있는
// 사람에게만 보인다. 이 파일의 다른 테스트가 프로젝트를 만들기 전에 돌도록 맨 앞에
// 둔다(파일 단독 실행이면 빈 DB라 EMPTY 행을 거친다).
test.describe("프로젝트 목록 — 팀 발령 없는 사람의 빈 목록", () => {
  test("팀 발령이 없는 팀 업무 범위 사람은 빈 목록에서도 「프로젝트 등록」이 보이지 않는다", async ({ page }) => {
    const noTeamPm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(noTeamPm.email);
    await page.getByLabel("비밀번호").fill(noTeamPm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/projects");
    // loading.tsx 스트리밍이 끝나 본문(EMPTY 행 또는 표)이 드러난 뒤에 센다.
    // 04-48 — 다른 스펙이 올해 밖 프로젝트만 남긴 DB면 기본 보기 0건 갈래다.
    await expect(
      page
        .getByText("등록된 프로젝트가 없습니다")
        .or(page.getByText(/년에 걸친 프로젝트가 없습니다$/))
        // 로딩 뼈대 표(`TableSkeleton`)는 aria-hidden 래퍼 안에 있어 표 자신에는 aria-hidden이 없다 — 래퍼 안의 표를 뺀다(빈 DB에서 스트리밍 중 뼈대와 빈 문구가 함께 잡혀 strict 위반).
        .or(page.locator("main table:not([aria-hidden='true'] table)")),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "프로젝트 등록" })).toHaveCount(0);
  });
});

async function login(page: Page, pm: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(pm.email);
  await page.getByLabel("비밀번호").fill(pm.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 코디네이터 대리 결정 2026-09-26 /design-review FINDING-013 (a) — 기간 두 칸은 네이티브 날짜 칸이다. 네이티브 날짜 칸
// 안에서 Tab은 연 · 월 · 일 조각을 차례로 지나므로, 칸(요소)을 벗어날 때까지 누른다. 조각 사이에서는 포커스 요소가 그대로다.
async function tabOutOf(page: Page, id: string) {
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press("Tab");
    // 묶음을 벗어나 제출되면 문서가 바뀌어 evaluate가 끊긴다 — 그것도 칸을 벗어난 것이다.
    if ((await page.evaluate(() => document.activeElement?.id ?? "").catch(() => "")) !== id) return;
  }
  throw new Error(`#${id}에서 Tab 다섯 번으로 나가지 못했다`);
}

async function addQuoteLine(projectId: string, quote: number, execution = 0) {
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, projectId);
  if (!revision) throw new Error("현재 차수를 찾지 못했습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true,
        subcategory: "stage_construction",
        itemName: "항목",
        quantity: 1,
        unitPrice: { currency: "KRW", amount: quote, fxRate: 1 },
        execution: { currency: "KRW", amount: execution, fxRate: 1 },
      },
    ],
  });
}

// 04-18 — 경영관리(시드 계급에 없다): 전사 범위 새 계급에 목록 보기 + 견적 · 발행 금액 노출을 준다(시드 계급을 바꾸지 않는다).
async function makeManager(extraInfoItems: string[] = []): Promise<{ email: string; password: string }> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E경영관리-${randomUUID().slice(0, 8)}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of ["project.value", "quote.amount", "revenue.issued_amount", ...extraInfoItems]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  const email = `e2e-list-mgr-${randomUUID()}@example.test`;
  const { tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 경영관리", roleId: role.id });
  return { email, password: tempPassword };
}

// 목록 표 — loading.tsx의 뼈대 표(aria-hidden)가 아니라 스트리밍이 끝나 main에 들어온 표.
const LIST_TABLE = "main table:not([aria-hidden='true'])";

// 머리글 글자로 열 번호를 찾아 그 행(프로젝트명 링크가 있는 주 행)의 칸을 돌려준다.
async function cellOf(page: Page, projectName: string, header: string) {
  await expect(page.locator(`${LIST_TABLE} tbody`).getByRole("link", { name: projectName, exact: true })).toBeAttached();
  const headers = (await page.locator(`${LIST_TABLE} thead th`).allTextContents()).map((text) => text.trim());
  const index = headers.indexOf(header);
  expect(index, `머리글 ${header} (있는 머리글: ${headers.join(",")})`).toBeGreaterThanOrEqual(0);
  return page
    .locator(`${LIST_TABLE} tbody tr`, { has: page.getByRole("link", { name: projectName, exact: true }) })
    .locator("td")
    .nth(index);
}

test.describe("프로젝트 목록 — 올해 보기 · 표 위 귀속 합계 (04-17)", () => {
  test("조건 없이 열면 올해 보기이고, 합계 줄이 표 위에서 올해 귀속만 더하며 제외 건수를 말한다", async ({ page }) => {
    // C-17 — 올해·내년은 UTC가 아니라 KST로 계산한다.
    const now = new Date();
    const thisYear = kstYear(now);
    const nextYear = thisYear + 1;
    const today = kstToday(now);
    const marker = `E2E올해-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const base = { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId };

    const inYear = await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-올해`, startDate: today, endDate: today });
    await addQuoteLine(inYear.id, 1_234_000);
    const spanning = await createProject(SYSTEM_VIEWER, {
      ...base,
      name: `${marker}-걸침`,
      startDate: today,
      endDate: `${nextYear}-01-15`,
    });
    await addQuoteLine(spanning.id, 2_000_000);
    await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-미정` });

    await login(page, pm);
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);

    await expect(page.locator("#year")).toHaveValue(String(thisYear));
    await expect(page.locator("table tbody a")).toHaveCount(3);

    const totals = page.getByRole("region", { name: "합계" });
    await expect(totals.getByText(`합계 (${thisYear} 귀속 · 1건)`, { exact: true })).toBeVisible();
    await expect(totals.getByText(`${nextYear} 귀속 1건 제외 · 기간 미정 1건 제외`, { exact: true })).toBeVisible();
    // C-01 — 합계 금액은 숫자라 쉼표 서식이다.
    await expect(totals.locator("dt:text-is('견적') + dd")).toHaveText("1,234,000");

    // D-88 — 합계 줄은 표 **위**다.
    const totalsBox = await totals.boundingBox();
    const tableBox = await page.locator("table").first().boundingBox();
    expect(totalsBox && tableBox && totalsBox.y + totalsBox.height <= tableBox.y).toBe(true);

    // D-90 · D-51 — 걸친 행은 종료월 그룹 한 곳에 한 번, 기간 칸 2행에 내년 귀속.
    await expect(page.locator("table tbody a", { hasText: `${marker}-걸침` })).toHaveCount(1);
    // 04-18 — 폰 접힌 줄(PC에서는 display:none)에도 같은 귀속 글자가 있다. PC에 보이는 것은 기간 칸 2행 하나다.
    await expect(page.locator("table tbody").getByText(`${nextYear} 귀속`, { exact: true }).filter({ visible: true })).toHaveCount(1);

    await page.locator("#year").selectOption("all");
    await expect(page).toHaveURL(/year=all/);
    await expect(totals.getByText("합계 (전체 연도 · 2건)", { exact: true })).toBeVisible();
    await expect(totals.getByText("기간 미정 1건 제외", { exact: true })).toBeVisible();
    await expect(totals.locator("dt:text-is('견적') + dd")).toHaveText("3,234,000");
  });

  test("50건씩 번호 페이지로 나뉘고, 2쪽 맨 위에 같은 그룹 머리글이 다시 있으며, 필터를 바꾸면 1쪽이고 범위 밖 번호는 마지막 쪽이다", async ({ page }) => {
    const thisYear = kstYear(new Date());
    const month = `${thisYear}-12`;
    const marker = `E2E페이지-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    for (let i = 0; i < 51; i += 1) {
      await createProject(SYSTEM_VIEWER, {
        clientId: pm.clientId,
        teamId: pm.teamId,
        pmUserId: pm.pmUserId,
        name: `${marker}-${String(i).padStart(2, "0")}`,
        startDate: `${month}-01`,
        endDate: `${month}-15`,
      });
    }

    await login(page, pm);
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    const pager = page.getByRole("navigation", { name: "프로젝트 페이지" });
    await expect(pager.getByText("1–50 / 51건", { exact: true })).toBeVisible();
    await expect(page.locator("table tbody a")).toHaveCount(50);
    await expect(pager.getByRole("link", { name: "이전" })).toHaveCount(0);

    await pager.getByRole("link", { name: "2", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator("table tbody a")).toHaveCount(1);
    // 페이지를 넘는 그룹 — 2쪽의 첫 줄이 같은 종료월 그룹 머리글이다.
    await expect(page.locator("table tbody tr").first()).toHaveText(month);
    await expect(pager.getByText("51–51 / 51건", { exact: true })).toBeVisible();
    await expect(pager.getByRole("link", { name: "다음" })).toHaveCount(0);

    await page.locator("#status").selectOption("bidding");
    await expect(page).toHaveURL(/status=bidding/);
    expect(page.url()).not.toContain("page=");
    await expect(page.locator("table tbody a")).toHaveCount(50);

    await page.goto(`/projects?q=${encodeURIComponent(marker)}&page=99`);
    await expect(page.locator("table tbody a")).toHaveCount(1);
    await expect(pager.locator("[aria-current='page']").first()).toHaveText("2");
  });

  test("정렬을 바꾸면 첫 행이 바뀌고, 필터 지우기로 기본 보기에 돌아간다", async ({ page }) => {
    const marker = `E2E정렬-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    for (const suffix of ["가", "나", "다"]) {
      await createProject(SYSTEM_VIEWER, { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId, name: `${marker}-${suffix}` });
    }

    await login(page, pm);
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&sort=name&dir=asc`);
    await expect(page.locator("table tbody a").first()).toHaveText(`${marker}-가`);

    await page.goto(`/projects?q=${encodeURIComponent(marker)}&sort=name&dir=desc`);
    await expect(page.locator("table tbody a").first()).toHaveText(`${marker}-다`);

    await page.getByText("필터 지우기").click();
    await expect(page).toHaveURL("/projects");
  });

  test("번호 열이 한 줄로 줄바꿈 없이 나온다(§2-4·S10)", async ({ page }) => {
    const pm = await setupPm();
    await createProject(SYSTEM_VIEWER, {
      clientId: pm.clientId,
      teamId: pm.teamId,
      pmUserId: pm.pmUserId,
      name: `E2E번호-${randomUUID().slice(0, 8)}`,
    });

    await login(page, pm);
    await page.goto("/projects");
    // 번호 칸은 `<span>`으로 렌더된다(projects-table.tsx) — 요소 타입을
    // span으로 좁혀 부모 `<td>`와의 텍스트 매치 중의성을 피하고, 내용은
    // 5자리 숫자(기본 서식 yearDigits 2 + seqDigits 3) 패턴으로 확인한다.
    const numberSpan = page.locator("table tbody span").filter({ hasText: /^\d{5}$/ }).first();
    const whiteSpace = await numberSpan.evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(whiteSpace).toBe("nowrap");
  });

  // /review team-scope-create-review.md P3(2) — 팀 업무 범위 계급인데 팀 발령이
  // 없는 사람은 등록해도 서버가 항상 거부한다(팀 목록 0개). §7 "할 수 없는
  // 선택지는 보이지 않게" — 등록 폼과 등록 진입점(필터 줄 버튼)을 숨긴다.
  test("팀 발령이 없는 팀 업무 범위 사람은 등록 버튼도 등록 폼도 보이지 않는다", async ({ page }) => {
    const marker = `E2E무발령-${Date.now()}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `${marker}클라이언트`,
      normalizedName: `${marker}클라이언트`,
    });
    const rowPm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const rowPmUserId = await findUserIdByEmail(rowPm.email);
    await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: rowPmUserId, name: marker });

    const noTeamPm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(noTeamPm.email);
    await page.getByLabel("비밀번호").fill(noTeamPm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "프로젝트 등록" })).toHaveCount(0);

    await page.goto("/projects?new=1");
    await expect(page.getByLabel("클라이언트")).toHaveCount(0);
  });
});

// 04-18 Task 1(D-87 · DR-8 · DR-38) — 행의 매출 · 기준 · 수익금 · 수익률. 상태는 전환 경로(04-20 수동 전환 · 04-11 자동 정산)로만 만든다.
test.describe("프로젝트 목록 — 행 매출 · 기준 · 수익금 · 수익률 (04-18)", () => {
  test("정산 행은 발행 기준, 같은 발행의 진행 행은 견적 기준, 발행 없는 행은 매출 — · 견적 기준이다", async ({ page }) => {
    const today = kstToday(new Date());
    const marker = `E2E행금액-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const base = { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId };
    const issued = [
      { entryDate: addDays(today, -5), amount: { currency: "KRW" as const, amount: 10_000_000, fxRate: 1 } },
      { entryDate: addDays(today, -4), amount: { currency: "KRW" as const, amount: -1_000_000, fxRate: 1 } },
    ];

    // 정산: 진행으로 바꾼 뒤 종료일(어제)이 지나 목록을 여는 순간 자동 정산된다.
    const settling = await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-정산`, startDate: addDays(today, -10), endDate: addDays(today, -1) });
    await addQuoteLine(settling.id, 12_000_000, 7_000_000);
    await saveRevenue(SYSTEM_VIEWER, settling.id, { issuedEntries: issued });
    await changeProjectStatus(SYSTEM_VIEWER, settling.id, { from: "bidding", to: "in_progress" });

    const inProgress = await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-진행`, startDate: addDays(today, -10), endDate: addDays(today, 30) });
    await addQuoteLine(inProgress.id, 12_000_000, 7_000_000);
    await saveRevenue(SYSTEM_VIEWER, inProgress.id, { issuedEntries: issued });
    await changeProjectStatus(SYSTEM_VIEWER, inProgress.id, { from: "bidding", to: "in_progress" });

    const noIssue = await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-무발행`, startDate: today, endDate: addDays(today, 30) });
    await addQuoteLine(noIssue.id, 12_000_000, 7_000_000);

    // 발행 줄 합이 0인 행은 `—`가 아니라 0이다.
    const zeroIssue = await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-영발행`, startDate: today, endDate: addDays(today, 30) });
    await saveRevenue(SYSTEM_VIEWER, zeroIssue.id, {
      issuedEntries: [
        { entryDate: today, amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } },
        { entryDate: today, amount: { currency: "KRW", amount: -1_000_000, fxRate: 1 } },
      ],
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, await makeManager());
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all`);
    await expect(page.locator(`${LIST_TABLE} tbody a`)).toHaveCount(4);

    const expectRow = async (name: string, cells: Record<string, string>) => {
      for (const [header, text] of Object.entries(cells)) {
        await expect(await cellOf(page, name, header), `${name} ${header}`).toHaveText(text);
      }
    };
    await expectRow(`${marker}-정산`, { 매출: "9,000,000", 기준: "발행", 수익금: "2,000,000", 수익률: "22.2%" });
    await expectRow(`${marker}-진행`, { 매출: "9,000,000", 기준: "견적", 수익금: "5,000,000" });
    await expectRow(`${marker}-무발행`, { 매출: "—", 기준: "견적", 수익률: "41.7%" });
    await expectRow(`${marker}-영발행`, { 매출: "0" });

    // 「차익」 열은 없고 「기준」이 「수익금」 바로 앞이다.
    const headers = (await page.locator(`${LIST_TABLE} thead th`).allTextContents()).map((text) => text.trim());
    expect(headers).not.toContain("차익");
    expect(headers.indexOf("수익금") - headers.indexOf("기준")).toBe(1);
  });
});

// 04-18 Task 2(S1 열 · 좁은 PC 접기 · 폰 우선순위 · DR-32 · DR-34 · D-81)
async function visibleHeaders(page: Page): Promise<string[]> {
  return (await page.locator(`${LIST_TABLE} thead th`).filter({ visible: true }).allTextContents()).map((text) => text.trim());
}

test.describe("프로젝트 목록 — 열 · 폭별 접기 · 종료일 지남 (04-18)", () => {
  test("경영관리는 1280에서 13열, 1100에서 번호 · 팀 · 실행가 · 매출을 숨긴 9열, 800에서 6열이다", async ({ page }) => {
    const marker = `E2E열접기-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const project = await createProject(SYSTEM_VIEWER, { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId, name: `${marker}-행` });
    await addQuoteLine(project.id, 3_000_000, 1_000_000);

    await login(page, await makeManager());
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all`);
    await expect(page.locator(`${LIST_TABLE} tbody a`)).toHaveCount(1);
    expect(await visibleHeaders(page)).toEqual([
      "번호", "클라이언트", "프로젝트명", "담당 PM", "팀", "기간", "매출", "견적", "실행가", "기준", "수익금", "수익률", "상태",
    ]);

    await page.setViewportSize({ width: 1100, height: 900 });
    await expect.poll(() => visibleHeaders(page)).toEqual(["클라이언트", "프로젝트명", "담당 PM", "기간", "견적", "기준", "수익금", "수익률", "상태"]);

    await page.setViewportSize({ width: 800, height: 900 });
    await expect.poll(() => visibleHeaders(page)).toEqual(["클라이언트", "프로젝트명", "담당 PM", "기간", "견적", "상태"]);
  });

  test("10억 이상 금액이 있는 쪽은 1280에서도 9열이다", async ({ page }) => {
    const marker = `E2E좁은단계-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const project = await createProject(SYSTEM_VIEWER, { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId, name: `${marker}-큰금액` });
    await addQuoteLine(project.id, 1_020_000_000, 1_000_000);

    await login(page, await makeManager());
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all`);
    await expect(page.locator(`${LIST_TABLE} tbody a`)).toHaveCount(1);
    expect(await visibleHeaders(page)).toHaveLength(9);
  });

  test("(DR-34) 수주중 + 종료일 지난 행의 상태 칸 2행에 「종료일 지남」이 상태 글자보다 크지 않게 있다", async ({ page }) => {
    const today = kstToday(new Date());
    const marker = `E2E종료지남-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    await createProject(SYSTEM_VIEWER, {
      clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId, name: `${marker}-행`, startDate: addDays(today, -5), endDate: addDays(today, -1),
    });

    await login(page, pm);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all`);
    const status = await cellOf(page, `${marker}-행`, "상태");
    const passed = status.getByText("종료일 지남", { exact: true });
    await expect(passed).toBeVisible();
    const statusText = status.getByText("수주중", { exact: true });
    const sizes = await Promise.all([passed, statusText].map((el) => el.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))));
    expect(sizes[0]).toBeLessThanOrEqual(sizes[1]!);
    // 2행 — 상태 글자 아래에 있다.
    const [passedBox, statusBox] = await Promise.all([passed.boundingBox(), statusText.boundingBox()]);
    expect(passedBox!.y).toBeGreaterThanOrEqual(statusBox!.y + statusBox!.height - 1);
  });

  test("(DR-32) 긴 클라이언트명은 두 줄 높이를 넘지 않는다", async ({ page }) => {
    const marker = `E2E긴거래처-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const longClient = await insertVendor(SYSTEM_VIEWER, {
      name: `가나다라마바사아자차카타파하거너더러머버-${randomUUID().slice(0, 4)}`,
      normalizedName: `e2e긴거래처-${randomUUID()}`,
    });
    await createProject(SYSTEM_VIEWER, { clientId: longClient.id, teamId: pm.teamId, pmUserId: pm.pmUserId, name: `${marker}-행` });

    await login(page, pm);
    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all`);
      const client = (await cellOf(page, `${marker}-행`, "클라이언트")).locator("span").first();
      const { height, lineHeight } = await client.evaluate((node) => ({
        height: node.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(node).lineHeight),
      }));
      expect(height, `${width}`).toBeLessThanOrEqual(lineHeight * 2 + 1);
    }
  });

  test("(04-17 DOM 감사) 375 접힌 줄은 「클라이언트 · 담당 PM · 기간」 끝에 귀속 · 종료일 지남을 잇고 상태 칸에는 두 번 보이지 않는다", async ({ page }) => {
    const now = new Date();
    const today = kstToday(now);
    const nextYear = kstYear(now) + 1;
    const marker = `E2E폰접힘-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const base = { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId };
    await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-지남`, startDate: addDays(today, -5), endDate: addDays(today, -1) });
    await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-걸침`, startDate: today, endDate: `${nextYear}-01-15` });

    await login(page, pm);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    const collapsedLine = (name: string) =>
      page.locator(`${LIST_TABLE} tbody`, { has: page.getByRole("link", { name, exact: true }) }).locator("tr").nth(1);

    const passedLine = collapsedLine(`${marker}-지남`);
    await expect(passedLine).toBeVisible();
    await expect(passedLine).toHaveText(/^[^·]+ · [^·]+ · [^·]+ · 종료일 지남$/);
    await expect(passedLine.getByText("종료일 지남", { exact: true })).toBeVisible();
    await expect(page.locator(`${LIST_TABLE} tbody`, { has: page.getByRole("link", { name: `${marker}-지남`, exact: true }) }).getByText("종료일 지남", { exact: true }).filter({ visible: true })).toHaveCount(1);

    const spanningLine = collapsedLine(`${marker}-걸침`);
    await expect(spanningLine).toHaveText(new RegExp(`^[^·]+ · [^·]+ · [^·]+ · ${nextYear} 귀속$`));
    await expect(spanningLine.getByText(`${nextYear} 귀속`, { exact: true })).toBeVisible();
  });
});

// 04-18 Task 3(§6-1 · WINDOWS #27) — 머리글 정렬.
test.describe("프로젝트 목록 — 머리글 정렬 (04-18)", () => {
  test("수익금 머리글을 누르면 오름차순 · 다시 누르면 내림차순이고, 2쪽 주소에서 눌러도 1쪽으로 간다", async ({ page }) => {
    const thisYear = kstYear(new Date());
    const marker = `E2E머리정렬-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const base = { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId };
    // 같은 종료월 — 기본 정렬은 큰수익 → 작은수익, 수익금 오름차순은 작은수익 → 큰수익.
    const big = await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-큰수익`, startDate: `${thisYear}-12-01`, endDate: `${thisYear}-12-10` });
    await addQuoteLine(big.id, 3_000_000, 1_000_000);
    const small = await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-작은수익`, startDate: `${thisYear}-12-01`, endDate: `${thisYear}-12-20` });
    await addQuoteLine(small.id, 3_000_000, 2_500_000);

    await login(page, pm);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all&page=2`);
    const header = page.locator(`${LIST_TABLE} thead th`, { hasText: "수익금" });
    const firstRowLink = page.locator(`${LIST_TABLE} tbody a`).first();
    await expect(firstRowLink).toHaveText(`${marker}-큰수익`);
    // 기본 정렬(종료일 오름차순)도 현재 정렬이라 기간 머리글 하나만 aria-sort를 지닌다.
    await expect(page.locator(`${LIST_TABLE} thead th[aria-sort]`)).toHaveCount(1);
    await expect(page.locator(`${LIST_TABLE} thead th`, { hasText: "기간" })).toHaveAttribute("aria-sort", "ascending");

    await header.getByRole("link", { name: "수익금" }).click();
    await expect(page).toHaveURL(/sort=profitKrw/);
    expect(page.url()).not.toContain("page=");
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await expect(page.locator(`${LIST_TABLE} thead th[aria-sort]`)).toHaveCount(1);
    await expect(firstRowLink).toHaveText(`${marker}-작은수익`);

    await header.getByRole("link", { name: "수익금" }).click();
    await expect(page).toHaveURL(/dir=desc/);
    await expect(header).toHaveAttribute("aria-sort", "descending");
    await expect(firstRowLink).toHaveText(`${marker}-큰수익`);
  });
});

// 04-48 Task 1(D-89 · UX-04 · 엔지 리뷰 C §2 P2) — 기간 두 칸은 묶음 단위로 한 번 제출되고 서버가 판정한다.
test.describe("프로젝트 목록 — 기간 필터 (04-48)", () => {
  test("시작일에서 Tab으로 종료일에 가는 사이에는 다시 로드되지 않고, 묶음 밖으로 나가면 한 번 제출돼 기간 보기가 된다", async ({ page }) => {
    const year = kstYear(new Date());
    const marker = `E2E기간-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const base = { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId };
    await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-가을`, startDate: `${year}-09-05`, endDate: `${year}-09-20` });
    await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-봄`, startDate: `${year}-03-01`, endDate: `${year}-03-20` });

    await login(page, pm);
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    await expect(page.locator("table tbody a")).toHaveCount(2);
    const before = page.url();
    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });

    await expect(page.locator("#from")).toHaveAttribute("type", "date");
    await expect(page.locator("#to")).toHaveAttribute("type", "date");
    await page.locator("#from").fill(`${year}-09-01`);
    await tabOutOf(page, "from");
    await expect(page.locator("#to")).toBeFocused();
    expect(page.url()).toBe(before);
    expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);

    await page.locator("#to").fill(`${year}-10-31`);
    await tabOutOf(page, "to");
    await expect(page).toHaveURL(new RegExp(`from=${year}-09-01.*to=${year}-10-31`));
    await expect(page.locator("table tbody a")).toHaveCount(1);
    const totals = page.getByRole("region", { name: "합계" });
    await expect(totals.getByText(`합계 (${year}-09-01 ~ ${year}-10-31 귀속 · 1건)`, { exact: true })).toBeVisible();
    await expect(page.locator("#from")).toHaveValue(`${year}-09-01`);
  });

  test("형식이 틀리거나 거꾸로면 칸 아래 오류 한 줄이 보이고 목록은 기간 필터 없는 결과 그대로다", async ({ page }) => {
    const year = kstYear(new Date());
    const marker = `E2E기간오류-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const base = { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId };
    await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-가을`, startDate: `${year}-09-05`, endDate: `${year}-09-20` });
    await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-봄`, startDate: `${year}-03-01`, endDate: `${year}-03-20` });

    await login(page, pm);
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    // 네이티브 날짜 칸은 `2026-9-1` 같은 틀린 모양을 받지 않는다 — 달력이 고를 수 있지만 서버 범위(2000–2100) 밖인 날로 서버 판정을 본다.
    await page.locator("#from").fill("1999-12-31");
    await tabOutOf(page, "from");
    await tabOutOf(page, "to");
    await expect(page).toHaveURL(/from=1999-12-31/);
    await expect(page.getByText("날짜 형식 오류 · 2026-09-18처럼", { exact: true })).toBeVisible();
    await expect(page.locator("#from")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#from")).toHaveValue("1999-12-31");
    await expect(page.locator("table tbody a")).toHaveCount(2);

    await page.locator("#from").fill(`${year}-10-31`);
    await page.locator("#to").fill(`${year}-09-01`);
    await page.locator("#to").press("Enter");
    await expect(page).toHaveURL(new RegExp(`from=${year}-10-31`));
    await expect(page.getByText("기간 끝이 시작보다 빠름 · 기간 끝 수정", { exact: true })).toBeVisible();
    await expect(page.locator("#to")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("table tbody a")).toHaveCount(2);
  });
});

// 04-48 Task 2(CEO C-08 · C-24 · 엔지 리뷰 C 공백 10 · DR-30) — 정규화 · 정렬 유지 · 창 밖 연도 · 빈 갈래 · 연도 자동 전환.
test.describe("프로젝트 목록 — 조회 조건 (04-48)", () => {
  test("창 밖 연도를 직접 열면 선택된 채 보이고, 다른 필터를 바꿔도 연도가 그대로다", async ({ page }) => {
    const farYear = kstYear(new Date()) + 5;
    const pm = await setupPm();
    await login(page, pm);
    await page.goto(`/projects?year=${farYear}`);
    await expect(page.locator("#year")).toHaveValue(String(farYear));
    await page.locator("#status").selectOption("bidding");
    await expect(page).toHaveURL(/status=bidding/);
    expect(new URL(page.url()).searchParams.get("year")).toBe(String(farYear));
    await expect(page.locator("#year")).toHaveValue(String(farYear));
  });

  test("정렬한 뒤 필터를 바꾸면 정렬이 남고 1쪽이며, 「필터 지우기」는 올해 기본 보기다", async ({ page }) => {
    const marker = `E2E정렬유지-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    for (const suffix of ["가", "나"]) {
      await createProject(SYSTEM_VIEWER, { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId, name: `${marker}-${suffix}` });
    }
    await login(page, pm);
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&sort=name&dir=desc&page=1`);
    await expect(page.locator("table tbody a").first()).toHaveText(`${marker}-나`);

    await page.locator("#status").selectOption("bidding");
    await expect(page).toHaveURL(/status=bidding/);
    const params = new URL(page.url()).searchParams;
    expect(params.get("sort")).toBe("name");
    expect(params.get("dir")).toBe("desc");
    expect(params.has("page")).toBe(false);
    await expect(page.locator("table tbody a").first()).toHaveText(`${marker}-나`);

    await page.getByRole("link", { name: "필터 지우기" }).first().click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator("#year")).toHaveValue(String(kstYear(new Date())));
  });

  test("(04-18 리뷰 NIT 2) 볼 수 없는 열의 정렬 키로 연 뒤 필터를 바꾸면 URL에 그 키가 남지 않는다", async ({ page }) => {
    const marker = `E2E숨긴정렬-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    await createProject(SYSTEM_VIEWER, { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId, name: `${marker}-행` });
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E견적끔-${randomUUID().slice(0, 8)}`, workScope: "company" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "quote.amount", visible: false });
    const email = `e2e-list-noquote-${randomUUID()}@example.test`;
    const { tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 견적 끔", roleId: role.id });

    await login(page, { email, password: tempPassword });
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all&sort=quoteAmountKrw&dir=desc`);
    await expect(page.locator(LIST_TABLE).getByRole("link", { name: `${marker}-행`, exact: true })).toBeVisible();

    await page.locator("#status").selectOption("bidding");
    await expect(page).toHaveURL(/status=bidding/);
    const params = new URL(page.url()).searchParams;
    expect(params.has("sort")).toBe(false);
    expect(params.has("dir")).toBe(false);
  });

  test("틀린 teamId · year를 직접 열면 오류 화면이 아니라 올해 기본 보기다", async ({ page }) => {
    const pm = await setupPm();
    await login(page, pm);
    await page.goto("/projects?teamId=abc&year=0000");
    await expect(page.locator("#year")).toHaveValue(String(kstYear(new Date())));
    await expect(page.locator("#teamId")).toHaveValue("");
    await expect(page.getByText("프로젝트 목록 불러오기 실패")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "필터 지우기" })).toHaveCount(0);
  });

  test("사용자 필터 0건은 「조건에 맞는 프로젝트가 없습니다 · 필터 지우기」이고 합계 줄 · 페이지 줄이 없으며 1차 등록은 남는다", async ({ page }) => {
    // 팀 발령이 있어야 「프로젝트 등록」이 보인다.
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, withTeam: true });
    await login(page, pm);
    await page.goto(`/projects?q=${encodeURIComponent(`E2E없음-${randomUUID()}`)}`);
    await expect(page.getByText("조건에 맞는 프로젝트가 없습니다", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "합계" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "프로젝트 페이지" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "프로젝트 등록" })).toHaveCount(1);
  });

  test("(DR-30) 기간이 선택 연도 밖이면 연도가 기간의 해로, 해를 걸치면 전체 연도로 바뀌고, 연도를 바꿔 어긋나면 기간이 빈다", async ({ page }) => {
    const year = kstYear(new Date());
    const lastYear = year - 1;
    const marker = `E2E자동전환-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    await createProject(SYSTEM_VIEWER, {
      clientId: pm.clientId,
      teamId: pm.teamId,
      pmUserId: pm.pmUserId,
      name: `${marker}-작년`,
      startDate: `${lastYear}-01-10`,
      endDate: `${lastYear}-02-20`,
    });
    await login(page, pm);

    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    await page.locator("#from").fill(`${lastYear}-01-01`);
    await page.locator("#to").fill(`${lastYear}-03-01`);
    await tabOutOf(page, "to");
    await expect(page).toHaveURL(new RegExp(`year=${lastYear}`));
    await expect(page.locator("#year")).toHaveValue(String(lastYear));
    await expect(page.locator("table tbody a")).toHaveCount(1);
    await expect(page.getByText("조건에 맞는 프로젝트가 없습니다")).toHaveCount(0);

    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    await page.locator("#from").fill(`${year - 2}-11-01`);
    await page.locator("#to").fill(`${lastYear}-02-01`);
    await page.locator("#to").press("Enter");
    await expect(page).toHaveURL(/year=all/);
    await expect(page.locator("#year")).toHaveValue("all");
    await expect(page.locator("table tbody a")).toHaveCount(1);

    await page.goto(`/projects?q=${encodeURIComponent(marker)}&from=${year}-09-01&to=${year}-10-31`);
    await expect(page.locator("#from")).toHaveValue(`${year}-09-01`);
    await page.locator("#year").selectOption(String(lastYear));
    await expect(page).toHaveURL(new RegExp(`year=${lastYear}`));
    expect(new URL(page.url()).searchParams.has("from")).toBe(false);
    expect(new URL(page.url()).searchParams.has("to")).toBe(false);
    await expect(page.locator("#from")).toHaveValue("");
    await expect(page.locator("#to")).toHaveValue("");
    await expect(page.locator("#year")).toHaveValue(String(lastYear));
  });
});

// 04-48 Task 3(DR-26) — 폰 첫 화면: 검색 · 「필터」 · 요약 · 1차가 먼저, 상태 · 팀 · 연도 · 기간은 펼친다.
test.describe("프로젝트 목록 — 폰 첫 화면 (04-48)", () => {
  test("375 폭에서 「필터」는 접힘으로 시작하고 누르면 네 칸이 펼쳐지며, 요약은 필터 값과 같다", async ({ page }) => {
    const year = kstYear(new Date());
    const marker = `E2E폰필터-${randomUUID().slice(0, 8)}`;
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, withTeam: true });
    const pmUserId = await findUserIdByEmail(pm.email);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `${marker}-클라이언트`, normalizedName: `${marker}-클라이언트` });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    await createProject(SYSTEM_VIEWER, {
      clientId: vendor.id,
      teamId: team.id,
      pmUserId,
      name: `${marker}-작년`,
      startDate: `${year - 1}-01-10`,
      endDate: `${year - 1}-02-20`,
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, pm);
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);

    const toggle = page.getByRole("button", { name: "필터", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panelId = await toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    await expect(page.locator("#status")).toBeHidden();
    await expect(page.locator("#from")).toBeHidden();
    await expect(page.locator("#q")).toBeVisible();
    const summary = page.getByTestId("filter-summary");
    await expect(summary).toHaveText(`${year} · 전체 상태 · 전체 팀`);
    await expect(page.getByRole("link", { name: "프로젝트 등록" })).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const id of ["status", "teamId", "year", "from", "to"]) await expect(page.locator(`#${id}`)).toBeVisible();
    await expect(page.locator(`#${panelId}`)).toContainText("상태");

    // 연도 자동 전환(DR-30) 뒤에도 요약이 새 연도다.
    await page.locator("#from").fill(`${year - 1}-01-01`);
    await page.locator("#to").fill(`${year - 1}-03-01`);
    await page.locator("#to").press("Enter");
    await expect(page).toHaveURL(new RegExp(`year=${year - 1}`));
    await expect(page.getByTestId("filter-summary")).toHaveText(`${year - 1} · 전체 상태 · 전체 팀 · ${year - 1}-01-01 ~ ${year - 1}-03-01`);
  });

  test("PC 1280에는 「필터」 버튼과 요약이 없고 필터 칸이 한 줄에 보인다", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const pm = await setupPm();
    await login(page, pm);
    await page.goto("/projects");
    await expect(page.locator("#status")).toBeVisible();
    await expect(page.getByRole("button", { name: "필터", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("filter-summary")).toBeHidden();
  });
});

// 04-48 검토·감사 반영 — 독립 DOM 감사 F1–F4 · 검색 blur(04-05) · Opus 검토 SF-1 · SF-2.
async function markSameDocument(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
  });
}

async function isSameDocument(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true);
}


type FocusStop = { name: string; top: number; bottom: number; left: number };

// 지금 포커스된 요소에서 시작해 Tab을 (count - 1)번 누르며 멈춘 곳의 이름(라벨·aria-label·글자)과 위치를 모은다.
async function tabWalk(page: Page, count: number): Promise<FocusStop[]> {
  const stops: FocusStop[] = [];
  for (let i = 0; i < count; i += 1) {
    // 네이티브 날짜 칸(FINDING-013)은 Tab이 칸 안 조각을 지난다 — 포커스 요소가 바뀔 때까지 눌러 요소 단위 멈춤만 센다.
    if (i > 0) {
      const id = await page.evaluate(() => document.activeElement?.id ?? "");
      if (id === "from" || id === "to") await tabOutOf(page, id);
      else await page.keyboard.press("Tab");
    }
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const isField = el instanceof HTMLInputElement || el instanceof HTMLSelectElement;
        const name = isField ? (el.getAttribute("aria-label") ?? el.labels?.[0]?.textContent ?? "") : (el.textContent ?? "");
        const rect = el.getBoundingClientRect();
        return { name: name.trim(), top: rect.top, bottom: rect.bottom, left: rect.left };
      }),
    );
  }
  return stops;
}

// 포커스 순서 = 시각 순서(SYSTEM.md §10): 같은 줄(세로로 겹침)이면 왼쪽 → 오른쪽, 아니면 위 → 아래.
function visualOrderViolations(stops: FocusStop[]): string[] {
  const bad: string[] = [];
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    const sameRow = a.top < b.bottom && b.top < a.bottom;
    if (sameRow ? a.left >= b.left : a.top >= b.top) bad.push(`${a.name} → ${b.name}`);
  }
  return bad;
}


// 감사 F1 · F2 재현용 긴 팀 이름(24자). 다른 스펙의 폭 측정에 끼지 않게 테스트가 끝나면 보관한다.
const LONG_TEAM_NAME = "경영관리본부기획운영지원팀서울북부권역제이파트";

async function withLongTeam(run: (teamId: string) => Promise<void>) {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E긴팀본부-${randomUUID().slice(0, 8)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: LONG_TEAM_NAME });
  try {
    await run(team.id);
  } finally {
    await db.update(teams).set({ archivedAt: new Date(), archivedBy: "e2e" }).where(eq(teams.id, team.id));
  }
}

type Box = { left: number; right: number; top: number; bottom: number };

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

test.describe("프로젝트 목록 — 필터 줄 검토·감사 반영 (04-48)", () => {
  test("검색 칸에서 값을 바꾸지 않고 Tab으로 나가면 다시 로드되지 않고 다음 컨트롤로 간다(바꾸면 제출)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const pm = await setupPm();
    const marker = `E2E검색blur-${randomUUID().slice(0, 8)}`;
    await createProject(SYSTEM_VIEWER, { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId, name: `${marker}-행` });
    await login(page, pm);
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    const search = page.getByRole("textbox", { name: "검색" });
    await expect(search).toHaveValue(marker);
    await markSameDocument(page);
    const before = page.url();

    await search.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "필터 지우기" })).toBeFocused();
    expect(page.url()).toBe(before);
    expect(await isSameDocument(page)).toBe(true);

    await search.fill(`${marker}-바꿈`);
    await page.keyboard.press("Tab");
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(`${marker}-바꿈`)}`));
  });

  test("(F4) 폰 375 접힘 · 펼침과 PC 1280에서 Tab 순서가 시각 순서와 같고, 숨은 자리는 포커스되지 않는다", async ({ page }) => {
    const marker = `E2E탭순서-${randomUUID().slice(0, 8)}`;
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, withTeam: true });
    const pmUserId = await findUserIdByEmail(pm.email);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `${marker}-클라이언트`, normalizedName: `${marker}-클라이언트` });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId, name: `${marker}-행` });
    await login(page, pm);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    await expect(page.locator("table tbody a")).toHaveCount(1);
    const search = page.getByRole("textbox", { name: "검색" });
    await expect(search).toHaveCount(1);
    const duplicateIds = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    });
    expect(duplicateIds).toEqual([]);

    await search.focus();
    const collapsed = await tabWalk(page, 4);
    expect(collapsed.map((stop) => stop.name)).toEqual(["검색", "필터", "필터 지우기", "프로젝트 등록"]);
    expect(visualOrderViolations(collapsed)).toEqual([]);

    await page.getByRole("button", { name: "필터", exact: true }).click();
    await search.focus();
    const expanded = await tabWalk(page, 9);
    expect(expanded.map((stop) => stop.name)).toEqual(["검색", "필터", "상태", "팀", "연도", "기간", "기간 끝", "필터 지우기", "프로젝트 등록"]);
    expect(visualOrderViolations(expanded)).toEqual([]);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(search).toHaveCount(1);
    await page.locator("#status").focus();
    const wide = await tabWalk(page, 8);
    expect(wide.map((stop) => stop.name)).toEqual(["상태", "팀", "연도", "기간", "기간 끝", "검색", "필터 지우기", "프로젝트 등록"]);
    expect(visualOrderViolations(wide)).toEqual([]);
  });

  test("(F1) 폰 375 · 320에서 기간 · 긴 팀 이름 요약이 ` · `에서만 줄바꿈하고 「필터」 · 「프로젝트 등록」 · 「필터 지우기」와 겹치지 않는다", async ({ page }) => {
    const year = kstYear(new Date());
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, withTeam: true });
    const pmUserId = await findUserIdByEmail(pm.email);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E긴요약-${randomUUID()}`, normalizedName: `e2e긴요약-${randomUUID()}` });
    await login(page, pm);
    await withLongTeam(async (teamId) => {
      // 목록이 비지 않아야 1차 「프로젝트 등록」이 필터 줄에 있다(none 갈래는 1차를 빼고 빈 행이 행동을 준다).
      await createProject(SYSTEM_VIEWER, {
        clientId: vendor.id,
        teamId,
        pmUserId,
        name: `E2E긴요약-${randomUUID().slice(0, 8)}`,
        startDate: `${year}-09-05`,
        endDate: `${year}-09-20`,
      });
      for (const width of [375, 320]) {
        await page.setViewportSize({ width, height: 812 });
        await page.goto(`/projects?teamId=${teamId}&from=${year}-09-01&to=${year}-10-31`);
        const summary = page.getByTestId("filter-summary");
        // loading.tsx 스트리밍이 끝나 필터 줄이 드러난 뒤에 잰다.
        await expect(summary).toBeVisible();
        await expect(page.getByRole("link", { name: "프로젝트 등록" })).toBeVisible();
        await expect(summary).toContainText(LONG_TEAM_NAME);
        await expect(summary).toContainText(`${year}-09-01 ~ ${year}-10-31`);
        const m = await page.evaluate(() => {
          const box = (el: Element | null | undefined) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          };
          const summaryEl = document.querySelector("[data-testid=filter-summary]")!;
          const visible = (selector: string) =>
            [...document.querySelectorAll(selector)].find((el) => el.getClientRects().length > 0 && (el as HTMLElement).offsetParent !== null);
          // 1차는 `ListScreen`이 필터 폼 밖(같은 줄 오른쪽 끝)에 둔다(04.6-10) — 폼 안 링크(필터 지우기)와 함께 찾는다.
          const link = (text: string) => [...document.querySelectorAll("form a, [data-ui='primary-button']")].find((a) => a.textContent === text && a.getClientRects().length > 0);
          return {
            summary: box(summaryEl)!,
            parts: [...summaryEl.querySelectorAll("span")].map((span) => ({ text: span.textContent, lines: span.getClientRects().length, ...box(span)! })),
            ellipsis: getComputedStyle(summaryEl).textOverflow,
            toggle: box(visible("button[aria-controls]")),
            primary: box(link("프로젝트 등록")),
            clear: box(link("필터 지우기")),
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          };
        });
        expect(m.scrollWidth, `${width} 가로 스크롤`).toBeLessThanOrEqual(m.clientWidth);
        expect(m.ellipsis).not.toBe("ellipsis");
        expect(m.primary, `${width} 1차`).not.toBeNull();
        expect(m.clear, `${width} 필터 지우기`).not.toBeNull();
        for (const part of m.parts) {
          expect(part.lines, `${width} ${part.text} 값 안 줄바꿈`).toBe(1);
          expect(part.left, `${width} ${part.text} 왼쪽`).toBeGreaterThanOrEqual(m.summary.left - 0.5);
          expect(part.right, `${width} ${part.text} 요약 밖`).toBeLessThanOrEqual(m.summary.right + 0.5);
          for (const [name, other] of [["필터", m.toggle], ["프로젝트 등록", m.primary], ["필터 지우기", m.clear]] as const) {
            expect(other && overlaps(part, other), `${width} ${part.text} ↔ ${name}`).toBe(false);
          }
        }
        for (const [name, other] of [["필터", m.toggle], ["프로젝트 등록", m.primary], ["필터 지우기", m.clear]] as const) {
          expect(other && overlaps(m.summary, other), `${width} 요약 ↔ ${name}`).toBe(false);
        }
      }
    });
  });

  test("(F2) 폰 320에서 긴 팀 이름 · 10자리 견적 금액 · 긴 이름 행이 표에 있어도 「필터」를 펼쳐 문서 가로 스크롤이 없고 팀 칸이 화면 안이다", async ({ page }) => {
    // 필터 줄의 팀 select 이름은 team.value 공개가 있어야 보인다.
    const manager = await makeManager(["team.value"]);
    const pm = await setupPm();
    const marker = `E2E폰넘침-${randomUUID().slice(0, 8)}`;
    await login(page, manager);
    await withLongTeam(async (teamId) => {
      // 웨이브 6 DOM 감사 D1 — 표가 있는 상태를 잰다. 04.6-26 N-1(보이는 첫 칸 · 끝 칸 16)이 칸 +16을 더해 8자리 금액부터 320을 넘겼다.
      // 견적은 8 · 9 · 10자리, 이름은 한국어 긴 이름과 끊기지 않는 영문 토큰, 거래처 이름은 긴 한국어다.
      const longClient = await insertVendor(SYSTEM_VIEWER, {
        name: `감사클라이언트가나다라마바사-${randomUUID().slice(0, 4)}`,
        normalizedName: `e2e폰넘침거래처-${randomUUID()}`,
      });
      const amounts = [12_000_000, 123_456_789, 1_234_567_890];
      const names = [`${marker}-가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허`, `${marker}-abcdefghijklmnopqrstuvwxyz0123456789`, `${marker}-행`];
      for (const [index, amount] of amounts.entries()) {
        const project = await createProject(SYSTEM_VIEWER, {
          clientId: longClient.id,
          teamId,
          pmUserId: pm.pmUserId,
          name: names[index]!,
          startDate: `${kstYear(new Date())}-09-05`,
          endDate: `${kstYear(new Date())}-09-20`,
        });
        await addQuoteLine(project.id, amount);
      }
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all`);
      await expect(page.locator(`${LIST_TABLE} tbody a[data-row-link]`)).toHaveCount(3);
      await expect(page.locator(LIST_TABLE).getByText("1,234,567,890", { exact: true }).first()).toBeVisible();
      const toggle = page.getByRole("button", { name: "필터", exact: true });
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.locator("#teamId")).toBeVisible();
      await expect(page.locator("#teamId option", { hasText: LONG_TEAM_NAME })).toHaveCount(1);
      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        teamRight: document.querySelector("#teamId")!.getBoundingClientRect().right,
        fieldsRight: document.querySelector("#project-filter-fields")!.getBoundingClientRect().right,
        tableRight: document.querySelector("main table:not([aria-hidden='true'])")!.getBoundingClientRect().right,
      }));
      expect(m.scrollWidth, "문서 가로 스크롤").toBeLessThanOrEqual(m.clientWidth);
      expect(m.tableRight, "표 오른쪽").toBeLessThanOrEqual(m.clientWidth);
      expect(m.fieldsRight).toBeLessThanOrEqual(m.clientWidth);
      expect(m.teamRight).toBeLessThanOrEqual(m.clientWidth);
    });
  });

  test("(F3) PC 1280 · 1024에서 기간 오류 한 줄이 있어도 기간 칸 바닥이 다른 칸과 같고 칸들이 오류 없을 때 자리에 있다", async ({ page }) => {
    const year = kstYear(new Date());
    const pm = await setupPm();
    await login(page, pm);
    const measure = () =>
      page.evaluate(() => {
        const rect = (id: string) => {
          const el = document.getElementById(id)!;
          const r = el.getBoundingClientRect();
          // 라벨 글자까지 포함한 칸 묶음의 위 — 오류 줄은 다음 줄 칸의 라벨과도 겹치면 안 된다.
          const groupTop = (el.closest("label") ?? el).getBoundingClientRect().top;
          return { top: r.top, bottom: r.bottom, left: r.left, groupTop };
        };
        // 폼(칸 줄)의 줄 간격 — 오류가 있으면 오류 줄 자리만큼 커진다(F3). 기간 줄이 첫 줄이 아닐 때 내려가도 되는 상한이다.
        const rowGap = parseFloat(getComputedStyle(document.querySelector('form[aria-label="프로젝트 필터"]')!).rowGap);
        return { status: rect("status"), teamId: rect("teamId"), year: rect("year"), from: rect("from"), to: rect("to"), q: rect("q-wide"), rowGap };
      });
    // 800 — 검색이 오류 없을 때도 다음 줄로 줄바꿈되는 폭(CI는 글꼴·스크롤바 차이로 1024에서 이미 이렇다).
    for (const width of [1280, 1024, 800]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/projects?q=E2E정렬기준");
      await expect(page.locator("#status")).toBeVisible();
      const clean = await measure();
      await page.goto(`/projects?q=E2E정렬기준&from=${year}-10-31&to=${year}-09-01`);
      const error = page.getByText("기간 끝이 시작보다 빠름 · 기간 끝 수정", { exact: true });
      await expect(error).toBeVisible();
      // 글꼴 폭에 기대지 않는다 — 오류 줄을 일부러 넓혀도(글꼴이 넓은 환경을 흉내) 칸을 옆으로 밀지 않아야 한다.
      await page.addStyleTag({ content: "#from-error, #to-error { letter-spacing: 0.4em; }" });
      const withError = await measure();
      for (const id of ["status", "teamId", "year", "to", "q"] as const) {
        if (Math.abs(clean[id].top - clean.from.top) > 0.5) continue; // 1024에서 줄바꿈된 검색은(오류 없을 때도) 다음 줄
        expect(withError[id].bottom, `${width} ${id} 바닥 = 기간 바닥`).toBeCloseTo(withError.from.bottom, 0);
      }
      const errorBox = await error.boundingBox();
      const ids = ["status", "teamId", "year", "from", "to", "q"] as const;
      // 기간 줄보다 위 줄(오류 없을 때 기준)에 칸이 있으면 기간 줄은 첫 줄이 아니다 — 폭 · 팀 이름 길이(CI는 앞 스펙이 만든 긴 팀 이름으로
      // 팀 칸이 넓다)에 따라 800에서 기간 묶음이 둘째 줄로 줄바꿈된다. 그때 커진 줄 간격이 기간 줄을 그만큼 내리는 것은 F3 설계다.
      const periodIsFirstRow = ids.every((id) => clean[id].top >= clean.from.top - 0.5);
      const rowGapGrowth = withError.rowGap - clean.rowGap;
      for (const id of ids) {
        // 오류 줄 폭이 기간 묶음을 넓혀 뒤 칸을 옆으로 밀면 안 된다.
        expect(withError[id].left, `${width} ${id} 오류 없을 때 가로 자리`).toBeCloseTo(clean[id].left, 0);
        if (clean[id].top < clean.from.top - 0.5) {
          // 기간 줄보다 위 줄의 칸은 그대로이고(가로 · 세로) 오류 줄과 겹치지 않는다.
          expect(withError[id].top, `${width} ${id} 위 줄은 오류 없을 때 자리`).toBeCloseTo(clean[id].top, 0);
          expect(errorBox && withError[id].bottom <= errorBox.y + 0.5, `${width} ${id} 위 줄은 오류 줄과 겹치지 않음`).toBe(true);
          continue;
        }
        if (clean[id].top > clean.from.top + 0.5) {
          // 줄바꿈된 칸(오류 없을 때도 다음 줄)은 오류 줄 자리만큼 내려가되 올라가거나 오류 줄과 겹치지 않는다(F3 줄 간격).
          expect(withError[id].top, `${width} ${id} 다음 줄은 위로 오지 않음`).toBeGreaterThanOrEqual(clean[id].top - 0.5);
          expect(errorBox && errorBox.y + errorBox.height <= withError[id].groupTop + 0.5, `${width} ${id} 오류 줄과 겹치지 않음`).toBe(true);
          continue;
        }
        if (periodIsFirstRow) {
          expect(withError[id].top, `${width} ${id} 오류 없을 때 자리`).toBeCloseTo(clean[id].top, 0);
          continue;
        }
        // 기간 줄이 첫 줄이 아니면 커진 줄 간격만큼만 내려간다 — 올라가거나 그보다 더 내려가지 않는다.
        const shift = withError[id].top - clean[id].top;
        expect(shift, `${width} ${id} 기간 줄은 위로 오지 않음`).toBeGreaterThanOrEqual(-0.5);
        expect(shift, `${width} ${id} 기간 줄은 커진 줄 간격(${rowGapGrowth}px)만큼만 내려감`).toBeLessThanOrEqual(rowGapGrowth + 0.5);
      }
      expect(errorBox && errorBox.y >= withError.from.bottom).toBe(true);
      // 정렬 상자 밖으로 뺀 오류 줄도 폼 상자 안이다 — 아래 합계 줄 · 표와 겹치지 않는다.
      const formBox = await page.getByRole("form", { name: "프로젝트 필터" }).boundingBox();
      expect(errorBox && formBox && errorBox.y + errorBox.height <= formBox.y + formBox.height + 0.5, `${width} 오류 줄이 폼 안`).toBe(true);
    }
  });

  test("(SF-1) 기간을 고친 채 창이 포커스를 잃으면(relatedTarget 없음 · 문서 포커스 없음) 제출하지 않고, 창 안에서 묶음을 벗어나면 제출한다", async ({ page }) => {
    const year = kstYear(new Date());
    const pm = await setupPm();
    await login(page, pm);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/projects?q=E2E창포커스");
    await expect(page.locator("#from")).toBeVisible();
    await page.locator("#from").fill(`${year - 1}-01-10`);

    // 창 전환(alt-tab · 폰 앱 전환)은 포커스된 칸에 relatedTarget 없는 focusout을 보내고 document.hasFocus()가 false다.
    const leave = (windowHasFocus: boolean) =>
      page.evaluate((hasFocus) => {
        const form = document.querySelector("form[aria-label='프로젝트 필터']")!;
        let submitted = false;
        const onSubmit = (event: Event) => {
          submitted = true;
          event.preventDefault();
        };
        form.addEventListener("submit", onSubmit);
        const original = document.hasFocus.bind(document);
        document.hasFocus = () => hasFocus;
        document.getElementById("from")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
        document.hasFocus = original;
        form.removeEventListener("submit", onSubmit);
        return submitted;
      }, windowHasFocus);

    expect(await leave(false), "창이 포커스를 잃음").toBe(false);
    expect(await leave(true), "창 안에서 묶음 밖(빈 곳 클릭)").toBe(true);
  });
});

// 코디네이터 대리 결정 2026-09-26 /design-review FINDING-013 (a) — 네이티브 날짜 칸은 글자를 셰도 DOM에 그려
// scrollWidth로 잘림을 못 잰다. 같은 글꼴 · 패딩의 폭 자동 네이티브 날짜 칸(고유 폭)을 옆에 만들어 그보다 좁지 않은지 잰다.
test.describe("프로젝트 목록 — 기간 네이티브 날짜 칸 폭 (FINDING-013)", () => {
  test("1280 · 375 · 320에서 기간 두 칸이 네이티브 날짜 칸 고유 폭 이상이라 날짜가 잘리지 않고, 문서 가로 스크롤이 없다", async ({ page }) => {
    const year = kstYear(new Date());
    const pm = await setupPm();
    await login(page, pm);
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/projects?q=E2E날짜폭&from=${year}-09-01&to=${year}-12-31`);
      await expect(page.getByTestId("filter-summary")).toBeAttached();
      if (width < 700) await page.getByRole("button", { name: "필터", exact: true }).click();
      await expect(page.locator("#to")).toBeVisible();
      const m = await page.evaluate(() =>
        ["from", "to"].map((id) => {
          const el = document.getElementById(id) as HTMLInputElement;
          const probe = el.cloneNode() as HTMLInputElement;
          probe.removeAttribute("id");
          probe.style.width = "auto";
          probe.style.position = "absolute";
          probe.style.visibility = "hidden";
          el.parentElement!.appendChild(probe);
          const intrinsic = probe.getBoundingClientRect().width;
          probe.remove();
          return { id, type: el.type, width: el.getBoundingClientRect().width, intrinsic };
        }).concat([{ id: "doc", type: "", width: document.documentElement.scrollWidth, intrinsic: document.documentElement.clientWidth }]),
      );
      for (const field of m.slice(0, 2)) {
        expect(field.type, `${width} ${field.id}`).toBe("date");
        expect(field.width, `${width} ${field.id} 폭 ≥ 고유 폭`).toBeGreaterThanOrEqual(field.intrinsic - 0.5);
      }
      expect(m[2]!.width, `${width} 가로 스크롤`).toBeLessThanOrEqual(m[2]!.intrinsic);
    }
  });
});

// 코디네이터 대리 결정 2026-09-26 /design-review FINDING-015 (a) — 폰에서는 목록 행 전체(주 행 + 접힌 P2 줄)가
// 그 프로젝트 링크 하나의 누름 자리다. 행 안의 포커스 가능한 요소는 링크 하나뿐이다(키보드 · 보조 기술 한 행 한 링크).
test.describe("프로젝트 목록 — 폰 행 전체 링크 (FINDING-015)", () => {
  test("375에서 행의 어느 칸을 눌러도 그 행의 프로젝트 링크이고, 누름 자리 높이 ≥44px, 행 안 포커스 가능 요소는 링크 하나다", async ({ page }) => {
    const year = kstYear(new Date());
    const marker = `E2E행링크-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const base = { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId };
    const first = await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-가`, startDate: `${year}-03-01`, endDate: `${year}-03-20` });
    const second = await createProject(SYSTEM_VIEWER, { ...base, name: `${marker}-나`, startDate: `${year}-04-01`, endDate: `${year}-04-20` });
    await login(page, pm);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    // loading.tsx 스트리밍 — 내용은 숨은 채 먼저 도착한다(개수만 세면 교체 전에 잰다). 보일 때까지 기다린다.
    await expect(page.getByRole("link", { name: `${marker}-나` })).toBeVisible();
    await expect(page.locator("table tbody a")).toHaveCount(2);

    for (const project of [first, second]) {
      const m = await page.evaluate((id) => {
        const link = document.querySelector<HTMLAnchorElement>(`table a[href="/projects/${id}"]`)!;
        const main = link.closest("tr")!;
        const next = main.nextElementSibling;
        // 접힌 P2 줄(폰에서만 보인다)도 이 행의 일부다 — 다음 프로젝트의 주 행(링크가 있는 줄)이 아니면 포함한다.
        const rows = [main, ...(next instanceof HTMLTableRowElement && !next.querySelector("a") ? [next] : [])];
        const cells = rows.flatMap((row) => [...row.cells].filter((cell) => cell.getClientRects().length > 0 && cell.offsetWidth > 0));
        const top = Math.min(...rows.map((row) => row.getBoundingClientRect().top));
        const bottom = Math.max(...rows.map((row) => row.getBoundingClientRect().bottom));
        // 칸마다 가운데 · 왼쪽 위 안쪽 · 오른쪽 아래 안쪽 점을 찍어 그 점의 맨 위 요소가 이 행의 링크(또는 그 안)인지 본다.
        const misses: string[] = [];
        for (const cell of cells) {
          const r = cell.getBoundingClientRect();
          for (const [x, y] of [
            [r.left + r.width / 2, r.top + r.height / 2],
            [r.left + 2, r.top + 2],
            [r.right - 2, r.bottom - 2],
          ] as const) {
            const hit = document.elementFromPoint(x, y);
            if (hit?.closest("a") !== link) misses.push(`${cell.textContent?.trim().slice(0, 12)} @${Math.round(x)},${Math.round(y)} → ${hit?.tagName}`);
          }
        }
        const focusables = rows.flatMap((row) => [
          ...row.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex], [role=button]"),
        ]);
        return { misses, height: bottom - top, rowCount: rows.length, focusables: focusables.map((el) => el.tagName) };
      }, project.id);
      expect(m.rowCount, "접힌 P2 줄이 폰에 있다").toBe(2);
      expect(m.misses, "행의 모든 칸이 그 행 링크").toEqual([]);
      expect(m.height, "행 누름 자리 높이").toBeGreaterThanOrEqual(44);
      expect(m.focusables, "행 안 포커스 가능 요소 = 링크 하나").toEqual(["A"]);
    }

    // 접힌 P2 줄(담당 PM · 기간)을 눌러도 그 프로젝트 상세로 간다.
    const collapsed = await page.evaluate((id) => {
      const main = document.querySelector(`table a[href="/projects/${id}"]`)!.closest("tr")!;
      const r = (main.nextElementSibling as HTMLElement).getBoundingClientRect();
      return { x: r.left + r.width - 8, y: r.top + r.height / 2 };
    }, second.id);
    await page.mouse.click(collapsed.x, collapsed.y);
    await expect(page).toHaveURL(new RegExp(`/projects/${second.id}$`));
  });
});

// 04.6-10 R11 — 목록 · 등록 패널 · 복사 패널을 막는 모드로 점검한다(`DESIGN_PRINCIPLES_STRICT`가 켜진 실행에서만 위반이 실패다).
test.describe("프로젝트 목록 — 화면 사용성 원칙 (04.6-10 · R11)", () => {
  test("화면 사용성 원칙(막는 모드) — 프로젝트 목록", async ({ page }) => {
    test.setTimeout(120_000);
    const pm = await setupPm();
    const source = await createProject(SYSTEM_VIEWER, { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId, name: `E2E원칙점검-${randomUUID().slice(0, 8)}` });
    await login(page, pm);
    await checkPrinciples(page, ["/projects", "/projects?new=1", `/projects?new=1&copyFrom=${source.id}`], {
      strict: isStrict(process.env.DESIGN_PRINCIPLES_STRICT),
    });
  });
});

// 04.6-10 — 상태 이름은 배지 고정(사용자 결정 ⑤)이다. 코드표 라벨이 DB에서 바뀌어 있어도(예전 관리자 편집) 필터 옵션·상세 부제 글자가 배지와 같다.
test.describe("프로젝트 상태 이름 — 배지·필터·부제가 한 이름", () => {
  const WORDS = ["수주중", "진행", "정산", "완료", "미수주"];

  test("코드표 라벨을 바꿔 둬도 필터 옵션 글자는 배지 낱말이고 상세 부제도 같다", async ({ page }) => {
    const marker = `E2E상태이름-${randomUUID().slice(0, 8)}`;
    const pm = await setupPm();
    const project = await createProject(SYSTEM_VIEWER, { clientId: pm.clientId, teamId: pm.teamId, pmUserId: pm.pmUserId, name: marker });

    const scope = { rows: "all", includeArchived: false } as const;
    const rows = await listCodeItems(SYSTEM_VIEWER, { tableKey: "project_status", scope, includeInactive: true });
    const originals = rows.map((row) => ({ id: row.id, label: row.label }));
    try {
      for (const row of rows) await updateCodeItemLabel(SYSTEM_VIEWER, row.id, `바뀜-${row.value}`);

      await login(page, pm);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all`);
      const optionTexts = await page.locator("#status option").allTextContents();
      expect(optionTexts.filter((text) => text !== "전체 상태")).toEqual(WORDS);
      const row = page.locator("table tbody tr", { hasText: marker });
      await expect(row.getByText("수주중", { exact: true })).toBeVisible();

      await page.goto(`/projects/${project.id}`);
      await expect(page.getByText(/^수주중 \d{4}-\d{2}-\d{2}$/)).toBeVisible();
    } finally {
      for (const original of originals) await updateCodeItemLabel(SYSTEM_VIEWER, original.id, original.label);
    }
  });
});
