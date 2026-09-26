import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teams, users } from "@/db/schema";
import { createProject } from "@/domain/projects";

async function findUserIdByEmail(email: string): Promise<string> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!row) throw new Error(`fixture user ${email}를 찾지 못했습니다`);
  return row.id;
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
    await expect(page.getByText("등록된 프로젝트가 없습니다").or(page.locator("main table:not([aria-hidden='true'])"))).toBeVisible();
    await expect(page.getByRole("link", { name: "프로젝트 등록" })).toHaveCount(0);
  });
});

// 04-05 — 목록 화면 스모크: 필터·정렬·더 보기·합계 부제(S1). 정렬은
// 04-04가 소유한 `ui/table`에 클릭 가능한 머리글이 아직 없어(이 플랜은
// 그 디렉터리를 건드리지 않는다, <probe_fallback>) 검색 파라미터를 직접
// 내비게이션해 서버 정렬 자체를 증명한다 — 클릭 UI는 이후 플랜이 잇는다.
test.describe("프로젝트 목록 — 필터·정렬·더 보기·합계 (Phase 4)", () => {
  test("필터를 걸었다 지우고, 정렬을 바꾸고, 더 보기를 눌러도 합계가 그대로다", async ({ page }) => {
    const marker = `E2E목록-${Date.now()}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E목록클라이언트-${Date.now()}`,
      normalizedName: `e2e목록클라이언트-${Date.now()}`,
    });
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");

    const pmUserId = await findUserIdByEmail(pm.email);
    const names = [`${marker}-가`, `${marker}-나`, `${marker}-다`];
    for (const name of names) {
      await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId, name });
    }

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 검색 필터 — 표 위 필터 줄의 검색 칸으로 marker를 좁힌다.
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    await expect(page.getByText(`합계 (전체 · 3건)`)).toBeVisible();
    await expect(page.getByText("필터 지우기")).toBeVisible();

    // 정렬 — 프로젝트명 오름차순/내림차순으로 첫 행이 바뀐다(URL 파라미터
    // 직접 내비게이션, 클릭 UI는 04-04 이후).
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&sort=name&dir=asc`);
    const firstLinkAsc = page.locator("table tbody a").first();
    await expect(firstLinkAsc).toHaveText(`${marker}-가`);

    await page.goto(`/projects?q=${encodeURIComponent(marker)}&sort=name&dir=desc`);
    const firstLinkDesc = page.locator("table tbody a").first();
    await expect(firstLinkDesc).toHaveText(`${marker}-다`);

    // 더 보기(count 파라미터 증가) — 렌더 건수가 1 → 2로 늘어도 합계
    // 부제는 3건 그대로다(불러온 페이지 크기와 무관, S1). 프로젝트명 링크
    // 개수(행마다 정확히 하나)로 렌더 건수를 잰다 — 그룹 머리글·폰 접힌
    // 줄 등 데이터 행이 아닌 `<tr>`이 섞이지 않는다.
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&count=1`);
    await expect(page.locator("table tbody a")).toHaveCount(1);
    await expect(page.getByText(`합계 (전체 · 3건)`)).toBeVisible();

    await page.goto(`/projects?q=${encodeURIComponent(marker)}&count=2`);
    await expect(page.locator("table tbody a")).toHaveCount(2);
    await expect(page.getByText(`합계 (전체 · 3건)`)).toBeVisible();

    // 필터 지우기 — 전체 목록으로 돌아간다(marker 검색 파라미터가 사라진다).
    await page.getByText("필터 지우기").click();
    await expect(page).toHaveURL("/projects");
  });

  test("번호 열이 한 줄로 줄바꿈 없이 나온다(§2-4·S10)", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E번호클라이언트-${Date.now()}`,
      normalizedName: `e2e번호클라이언트-${Date.now()}`,
    });
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const pmUserId = await findUserIdByEmail(pm.email);
    await createProject(SYSTEM_VIEWER, {
      clientId: vendor.id,
      teamId: team.id,
      pmUserId,
      name: `E2E번호-${Date.now()}`,
    });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

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
