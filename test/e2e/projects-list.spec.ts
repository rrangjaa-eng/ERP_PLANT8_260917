import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teams, users } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { kstToday, kstYear } from "@/lib/kst-date";

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
        .or(page.locator("main table:not([aria-hidden='true'])")),
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

async function addQuoteLine(projectId: string, quote: number) {
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, projectId);
  if (!revision) throw new Error("현재 차수를 찾지 못했습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true,
        subcategory: "sub-a",
        itemName: "항목",
        quantity: 1,
        unitPrice: { currency: "KRW", amount: quote, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ],
  });
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
    await expect(page.locator("table tbody").getByText(`${nextYear} 귀속`, { exact: true })).toBeVisible();

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

    await page.locator("#from").fill(`${year}-09-01`);
    await page.locator("#from").press("Tab");
    await expect(page.locator("#to")).toBeFocused();
    expect(page.url()).toBe(before);
    expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);

    await page.locator("#to").fill(`${year}-10-31`);
    await page.locator("#to").press("Tab");
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
    await page.locator("#from").fill(`${year}-9-1`);
    await page.locator("#from").press("Tab");
    await page.locator("#to").press("Tab");
    await expect(page).toHaveURL(/from=/);
    await expect(page.getByText("날짜 형식이 아닙니다 · 2026-09-18처럼 적어 주세요", { exact: true })).toBeVisible();
    await expect(page.locator("#from")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#from")).toHaveValue(`${year}-9-1`);
    await expect(page.locator("table tbody a")).toHaveCount(2);

    await page.locator("#from").fill(`${year}-10-31`);
    await page.locator("#to").fill(`${year}-09-01`);
    await page.locator("#to").press("Enter");
    await expect(page).toHaveURL(new RegExp(`from=${year}-10-31`));
    await expect(page.getByText("기간이 거꾸로입니다 · 앞 날짜를 먼저 적어 주세요", { exact: true })).toBeVisible();
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

  test("틀린 teamId · year를 직접 열면 오류 화면이 아니라 올해 기본 보기다", async ({ page }) => {
    const pm = await setupPm();
    await login(page, pm);
    await page.goto("/projects?teamId=abc&year=0000");
    await expect(page.locator("#year")).toHaveValue(String(kstYear(new Date())));
    await expect(page.locator("#teamId")).toHaveValue("");
    await expect(page.getByText("프로젝트 목록을 불러오지 못했습니다")).toHaveCount(0);
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
    await page.locator("#to").press("Tab");
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
    if (i > 0) await page.keyboard.press("Tab");
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
    expect(collapsed.map((stop) => stop.name)).toEqual(["검색", "필터", "프로젝트 등록", "필터 지우기"]);
    expect(visualOrderViolations(collapsed)).toEqual([]);

    await page.getByRole("button", { name: "필터", exact: true }).click();
    await search.focus();
    const expanded = await tabWalk(page, 9);
    expect(expanded.map((stop) => stop.name)).toEqual(["검색", "필터", "프로젝트 등록", "상태", "팀", "연도", "기간", "기간 끝", "필터 지우기"]);
    expect(visualOrderViolations(expanded)).toEqual([]);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(search).toHaveCount(1);
    await page.locator("#status").focus();
    const wide = await tabWalk(page, 8);
    expect(wide.map((stop) => stop.name)).toEqual(["상태", "팀", "연도", "기간", "기간 끝", "검색", "필터 지우기", "프로젝트 등록"]);
    expect(visualOrderViolations(wide)).toEqual([]);
  });
});
