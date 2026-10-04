import { randomInt, randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { isStrict } from "./design-principles";
import { checkPrinciples } from "./principles-check";
import { db } from "@/db/client";
import { holidays, holidayYearConfirmations, notificationLog, notifyTickRuns, users } from "@/db/schema";
import { formatKstMinute, toKstDate } from "@/domain/holidays/business-day";
import { LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertRole, setRoleArchived } from "@/repositories/roles";

// 04.2-11 — 공휴일 관리 화면(ADMN-11). 확정 상태를 바꾸는 E2E는 이 파일 밖에 두지
// 않는다 — 같은 파일 안에서 직렬로 돌고, 확정을 누르는 테스트는 시작할 때 다음 해
// 확정 기록만 지워 되풀이 실행에도 「확정 전」에서 시작한다(되돌리기 경로는
// 프로덕션 코드에 없다 — UI-SPEC 가정 U-2).
test.describe.configure({ mode: "serial" });

const THIS_YEAR = Number(toKstDate(new Date()).slice(0, 4));
const NEXT_YEAR = THIS_YEAR + 1;

async function resetConfirmation(year: number): Promise<void> {
  await db.delete(holidayYearConfirmations).where(eq(holidayYearConfirmations.year, year));
}

async function holidayCount(year: number): Promise<number> {
  const rows = await db
    .select({ id: holidays.id })
    .from(holidays)
    .where(and(isNull(holidays.archivedAt), gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)));
  return rows.length;
}

async function login(page: Page, credentials: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(credentials.email);
  await page.getByLabel("비밀번호").fill(credentials.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loginAsSysadmin(page: Page): Promise<void> {
  await login(page, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
}

const PANEL = 'dialog[data-ui="side-panel"]';

// 역할 토큰의 계산된 글자 색 — 리터럴 rgb 대신 토큰 값과 비교한다(04.6 W3 합본 교훈).
function tokenAsColor(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
}

test.describe("공휴일 관리 /admin/holidays", () => {
  test("관리 인덱스 → 공휴일 → 다음 해 후보 표 → 확정하면 버튼이 사라지고 상태 줄이 확정으로 바뀐다", async ({
    page,
  }) => {
    await resetConfirmation(NEXT_YEAR);
    await loginAsSysadmin(page);

    await page.goto("/admin");
    await page.getByRole("link", { name: "공휴일", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/holidays$/);
    await expect(page.getByRole("heading", { name: "공휴일", exact: true })).toBeVisible();

    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    const table = page.getByRole("table", { name: `${NEXT_YEAR}년 공휴일` });
    await expect(table).toBeVisible();
    for (const header of ["날짜", "요일", "이름", "구분", "동작"]) {
      await expect(table.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }

    const count = await holidayCount(NEXT_YEAR);
    expect(count).toBeGreaterThan(0);
    await expect(table.locator("tbody tr").filter({ visible: true })).toHaveCount(count);
    await expect(page.getByText(`후보 · 공휴일 ${count}일`, { exact: true })).toBeVisible();

    const confirm = page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` });
    await confirm.click();

    await expect(confirm).toHaveCount(0);
    await expect(
      page.getByText(new RegExp(`^확정 · \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} E2E Admin · 공휴일 ${count}일$`)),
    ).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "확정" })).toHaveCount(0);
    expect(await db.select().from(holidayYearConfirmations).where(eq(holidayYearConfirmations.year, NEXT_YEAR))).toHaveLength(1);
  });

  test("보기만 가진 계급은 표를 보지만 확정 버튼과 동작 칸이 없고, 권한 없는 계급은 404다", async ({ page }) => {
    await resetConfirmation(NEXT_YEAR);
    const tempRoleId = `role-e2e-holiday-view-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: tempRoleId, name: `E2E 임시 계급 ${tempRoleId.slice(-12)}`, sortOrder: 99 });
    await setPermissionCell(SYSTEM_VIEWER, { roleId: tempRoleId, menu: "admin.holidays", action: "view", allowed: true });

    try {
      await login(page, await createFixtureUser({ roleId: tempRoleId }));
      const response = await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("table", { name: `${NEXT_YEAR}년 공휴일` })).toBeVisible();
      await expect(page.getByText(/^후보 · 공휴일 \d+일$/)).toBeVisible();
      await expect(page.getByRole("button", { name: /공휴일 확정/ })).toHaveCount(0);
      await expect(page.getByRole("columnheader", { name: "동작" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "공휴일 추가" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "삭제" })).toHaveCount(0);
      expect((await page.goto(`/admin/holidays?year=${NEXT_YEAR}&new=1`))?.status()).toBe(200);
      await expect(page.getByLabel("날짜")).toHaveCount(0);
      // R15 · T-04.6-45 — 쓰기 권한 없는 계급이 직접 연 `?new=1`은 패널(dialog)이 0개다.
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator(PANEL)).toHaveCount(0);
    } finally {
      await setRoleArchived(SYSTEM_VIEWER, tempRoleId, true);
    }
  });

  test("admin.holidays view가 없는 계급(기획 PM)에게 /admin/holidays는 404다", async ({ page }) => {
    await login(page, await createFixtureUser({ roleId: DEFAULT_ROLE_ID }));
    const response = await page.goto("/admin/holidays");
    expect(response?.status()).toBe(404);
  });
});

// 04.2-11 Task 2 — UI-SPEC S2-holiday-table · S2-confirm 상태.
const LONG_NAME_YEAR = 2033;
const LONG_NAME = "제22대 국회의원 선거일";

async function yearsWithRows(): Promise<number[]> {
  const rows = await db.select({ date: holidays.date }).from(holidays);
  return [...new Set(rows.map((row) => Number(row.date.slice(0, 4))))].sort((a, b) => a - b);
}

test.describe("공휴일 표·확정 버튼의 상태", () => {
  test.beforeAll(async () => {
    await db.delete(holidays).where(and(gte(holidays.date, `${LONG_NAME_YEAR}-01-01`), lte(holidays.date, `${LONG_NAME_YEAR}-12-31`)));
    await db.insert(holidays).values({ date: `${LONG_NAME_YEAR}-04-12`, name: LONG_NAME, kind: "election" });
  });

  test.afterAll(async () => {
    await db.delete(holidays).where(and(gte(holidays.date, `${LONG_NAME_YEAR}-01-01`), lte(holidays.date, `${LONG_NAME_YEAR}-12-31`)));
  });

  test("연도 링크는 행이 있는 해 전부 오름차순이고 현재 연도는 aria-current 글자다 · 1행인 해도 같은 행 템플릿", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${LONG_NAME_YEAR}`);

    const nav = page.getByRole("navigation", { name: "연도" });
    const current = nav.locator('[aria-current="page"]');
    await expect(current).toHaveText(`${LONG_NAME_YEAR}년`);
    await expect(nav.getByRole("link", { name: `${LONG_NAME_YEAR}년` })).toHaveCount(0);

    const expectedYears = (await yearsWithRows()).map((year) => `${year}년`);
    await expect(nav.locator("li")).toHaveText(expectedYears);
    await expect(nav.getByRole("link")).toHaveCount(expectedYears.length - 1);

    const table = page.getByRole("table", { name: `${LONG_NAME_YEAR}년 공휴일` });
    await expect(table.locator("tbody tr").filter({ visible: true })).toHaveCount(1);
    await expect(table.locator("tbody tr").filter({ visible: true }).locator("td")).toHaveText(["04-12", "화", LONG_NAME, "선거일", "삭제"]);
  });

  test("행이 없는 해(?year=1999)는 기본 연도로 떨어지고 후보를 만들지 않는다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/holidays?year=1999");

    await expect(page.getByRole("table", { name: "1999년 공휴일" })).toHaveCount(0);
    const confirmedYears = new Set(
      (await db.select({ year: holidayYearConfirmations.year }).from(holidayYearConfirmations)).map((row) => row.year),
    );
    const defaultYear = [THIS_YEAR, NEXT_YEAR].find((year) => !confirmedYears.has(year)) ?? THIS_YEAR;
    await expect(page.getByRole("table", { name: `${defaultYear}년 공휴일` })).toBeVisible();
    expect(await holidayCount(1999)).toBe(0);
  });

  for (const viewport of [
    { label: "PC", width: 1280, height: 800 },
    { label: "375px", width: 375, height: 812 },
  ]) {
    test(`긴 이름은 이름 칸에서 줄바꿈되고 말줄임되지 않는다(${viewport.label})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAsSysadmin(page);
      await page.goto(`/admin/holidays?year=${LONG_NAME_YEAR}`);

      const cell = page.getByRole("cell", { name: LONG_NAME, exact: true });
      await expect(cell).toBeVisible();
      const metrics = await cell.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
          overflowing: el.scrollWidth > el.clientWidth,
          text: (el as HTMLElement).innerText,
        };
      });
      expect(metrics.textOverflow).not.toBe("ellipsis");
      expect(metrics.whiteSpace).not.toBe("nowrap");
      expect(metrics.overflowing).toBe(false);
      expect(metrics.text).toBe(LONG_NAME);
    });
  }

  test("확정 대기 중 라벨은 `{연도}년 공휴일 확정…` 비활성, 요청이 끊기면 원래 라벨 + 실패 줄, 풀고 다시 누르면 확정된다", async ({
    page,
  }) => {
    await resetConfirmation(NEXT_YEAR);
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);

    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const isConfirmAction = (method: string, headers: Record<string, string>) =>
      method === "POST" && headers["next-action"] !== undefined;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (!isConfirmAction(request.method(), request.headers())) {
        await route.continue();
        return;
      }
      await held;
      await route.abort();
    });

    const confirm = page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` });
    await confirm.click();
    await expect(confirm).toHaveText(`${NEXT_YEAR}년 공휴일 확정…처리 중`);
    await expect(confirm).toHaveAttribute("aria-disabled", "true");

    release();
    await expect(page.getByText("확정 실패 · 다시 시도", { exact: true })).toBeVisible();
    await expect(confirm).toHaveText(`${NEXT_YEAR}년 공휴일 확정`);
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    expect(
      await db.select().from(holidayYearConfirmations).where(eq(holidayYearConfirmations.year, NEXT_YEAR)),
    ).toHaveLength(0);

    await page.unroute("**/*");
    await confirm.click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByText(/^확정 · .* · 공휴일 \d+일$/)).toBeVisible();
    await expect(page.getByText("확정 실패 · 다시 시도", { exact: true })).toHaveCount(0);
  });
});

// 04.2-12 Task 1 — 수동 추가 트레이서(UI-SPEC S2-d · Copywriting S2).
const ADDED_DATE = `${NEXT_YEAR}-07-07`;
const ADDED_NAME = "제22대 국회의원 선거일 테스트";

function nextIsoDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

test.describe("공휴일 추가(04.2-12)", () => {
  test.beforeAll(async () => {
    await resetConfirmation(NEXT_YEAR);
    await db.delete(holidays).where(eq(holidays.date, ADDED_DATE));
  });

  test.afterAll(async () => {
    await db.delete(holidays).where(eq(holidays.date, ADDED_DATE));
  });

  test("필터 줄 `공휴일 추가` → 전체 새로고침 없이 ?new=1 패널 → 미래 선거일 → 표에 새 행 + 토스트(R9 D 공휴일 예외), 패널이 열려도 확정 버튼은 남는다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    const confirm = page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` });
    await expect(confirm).toBeVisible();

    // 전체 새로고침이 아니다 — 문서에 얹어 둔 표식이 이동 뒤에도 남는다(SC 3 · RESEARCH Pitfall 7).
    await page.evaluate(() => {
      (window as unknown as { __keep: number }).__keep = 1;
    });
    const navigations = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    const addLink = page.getByRole("link", { name: "공휴일 추가", exact: true });
    await addLink.click();
    await expect(page).toHaveURL(new RegExp(`/admin/holidays\\?year=${NEXT_YEAR}&new=1$`));
    await expect(page.locator(PANEL)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __keep?: number }).__keep)).toBe(1);
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navigations);
    // R4 — 패널이 열려도 여는 링크와 확정 버튼은 렌더에 남는다(뒤는 모달이 막는다).
    await expect(page.locator(`a[href="/admin/holidays?year=${NEXT_YEAR}&new=1"]`)).toHaveCount(1);
    await expect(page.locator("main button", { hasText: `${NEXT_YEAR}년 공휴일 확정` })).toHaveCount(1);

    const panel = page.locator(PANEL);
    const date = panel.getByLabel("날짜");
    await expect(date).toHaveAttribute("type", "date");
    await expect(date).toHaveAttribute("min", nextIsoDate(toKstDate(new Date())));
    const kind = panel.getByLabel("종류");
    await expect(kind.locator("option")).toHaveText(["임시공휴일", "선거일"]);
    await expect(kind).toHaveValue("temporary");

    await date.fill(ADDED_DATE);
    await kind.selectOption({ label: "선거일" });
    await panel.getByLabel("이름").fill(ADDED_NAME);
    await panel.getByRole("button", { name: /^공휴일 추가/ }).click();

    // R9 D 공휴일 예외 — `?added=` 이동(패널 닫힘) + 추가 토스트가 지금처럼 보인다.
    await expect(page.getByText(`공휴일 추가 · ${ADDED_DATE} 추가됨`, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/admin/holidays\\?year=${NEXT_YEAR}(&added=${ADDED_DATE})?$`));
    await expect(page.locator(PANEL)).toHaveCount(0);
    await expect(page.getByLabel("날짜")).toHaveCount(0);
    const cell = page.getByRole("cell", { name: ADDED_NAME, exact: true });
    await expect(cell).toBeVisible();
    expect(await cell.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe("ellipsis");
    // 웨이브 6 DOM 감사 D2 · SYSTEM 1035 「성공으로 닫히면 호출부가 새 결과로 옮긴다」 — 추가 성공 뒤 포커스는 여는 링크가 아니라 화면 제목에 있고 머문다.
    const focusedUi = () => page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.getAttribute("data-ui")}`);
    await expect.poll(focusedUi, { message: "추가 성공 뒤 포커스" }).toBe("H1:screen-title");
    await page.waitForTimeout(600);
    expect(await focusedUi(), "600ms 뒤에도 화면 제목").toBe("H1:screen-title");
    await expect(page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/admin/holidays\\?year=${NEXT_YEAR}$`), { timeout: 8000 });
  });

  // DR2 A — 그해 확정 전엔 「확정」이 1차, 확정 뒤엔 「추가」가 1차. 어느 해든 1차는 정확히 하나다.
  test("1차 버튼은 하나다 — 확정 전 해는 「{해}년 공휴일 확정」이 1차 · 「공휴일 추가」는 필터 줄 2차 링크, 확정 뒤 해는 「공휴일 추가」가 1차(DR2 A)", async ({
    page,
  }) => {
    await resetConfirmation(NEXT_YEAR);
    await loginAsSysadmin(page);
    const primaries = page.locator('[data-ui="primary-button"]');

    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    await expect(primaries).toHaveCount(1);
    await expect(primaries).toHaveText(`${NEXT_YEAR}년 공휴일 확정`);
    const addSecondary = page.getByRole("link", { name: "공휴일 추가", exact: true });
    await expect(addSecondary).toHaveCount(1);
    await expect(addSecondary).not.toHaveAttribute("data-ui", "primary-button");
    // 2차 링크는 필터 줄(연도 목록과 같은 줄)에 있다.
    const [yearsBox, addBox] = await Promise.all([page.getByRole("navigation", { name: "연도" }).boundingBox(), addSecondary.boundingBox()]);
    expect(Math.abs((yearsBox?.y ?? 0) - (addBox?.y ?? 0))).toBeLessThan(80);

    // 확정을 누르면 버튼이 사라지고 「공휴일 추가」가 1차가 된다.
    await page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` }).click();
    await expect(page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` })).toHaveCount(0);
    await expect(primaries).toHaveCount(1);
    await expect(primaries).toHaveText("공휴일 추가");
    await expect(page.getByRole("link", { name: "공휴일 추가", exact: true })).toHaveCount(1);
    await resetConfirmation(NEXT_YEAR);
  });

  test("바뀐 칸이 없으면 Esc로 바로 닫히고 포커스가 「공휴일 추가」로 돌아오며, 칸을 바꾼 채 Esc는 「입력 버리기」 확인 창이다(DR1 A)", async ({
    page,
  }) => {
    await resetConfirmation(NEXT_YEAR);
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    const addLink = page.getByRole("link", { name: "공휴일 추가", exact: true });

    await addLink.click();
    await expect(page.locator(PANEL)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(PANEL)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/admin/holidays\\?year=${NEXT_YEAR}$`));
    await expect(addLink).toBeFocused();

    await addLink.click();
    await page.locator(PANEL).getByLabel("이름").fill("입력 중");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toBeVisible();
    await expect(page.locator(PANEL)).toBeVisible();
  });
});

// 04.2-12 Task 2 — 확인 없는 삭제 + 결과 줄 `되돌리기`(UI-SPEC S2-f · D-4209 개정 · #1).
const ROW_A = { date: `${NEXT_YEAR}-07-08`, name: "임시공휴일 테스트 가" };
const ROW_B = { date: `${NEXT_YEAR}-07-09`, name: "임시공휴일 테스트 나" };
const OTHER_NAME = "다른 공휴일 테스트";

async function resetDeleteRows(): Promise<void> {
  await db.delete(holidays).where(inArray(holidays.date, [ROW_A.date, ROW_B.date]));
  await db.insert(holidays).values([
    { ...ROW_A, kind: "temporary" },
    { ...ROW_B, kind: "temporary" },
  ]);
}

// 다음 서버 액션 요청을 붙잡았다가 release()에 흘려보내거나(continue) 끊는다(abort).
async function holdNextAction(page: Page, mode: "continue" | "abort"): Promise<() => void> {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || request.headers()["next-action"] === undefined) {
      await route.continue();
      return;
    }
    await held;
    if (mode === "abort") await route.abort();
    else await route.continue();
  });
  return release;
}

function rowOf(page: Page, name: string) {
  return page.getByRole("table", { name: `${NEXT_YEAR}년 공휴일` }).locator("tbody tr", { hasText: name });
}

test.describe("공휴일 삭제 · 되돌리기(04.2-12)", () => {
  test.beforeEach(async () => {
    await resetConfirmation(NEXT_YEAR);
    await resetDeleteRows();
  });

  test.afterAll(async () => {
    await db.delete(holidays).where(inArray(holidays.date, [ROW_A.date, ROW_B.date]));
  });

  test("규칙 행엔 삭제가 없고, 삭제는 확인 없이 지워 결과 줄 + 되돌리기를 남기며, 되돌리기가 보관된 같은 행을 돌려놓는다", async ({
    page,
  }) => {
    const [rowBBefore] = await db.select({ id: holidays.id }).from(holidays).where(eq(holidays.date, ROW_B.date));
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);

    const ruleRow = page.getByRole("table", { name: `${NEXT_YEAR}년 공휴일` }).locator("tbody tr", { hasText: "10-03" });
    await expect(ruleRow.first()).toBeVisible();
    await expect(ruleRow.getByRole("button")).toHaveCount(0);
    const deleteA = rowOf(page, ROW_A.name).getByRole("button", { name: "삭제" });
    const deleteB = rowOf(page, ROW_B.name).getByRole("button", { name: "삭제" });
    await expect(deleteA).toBeVisible();
    await expect(deleteB).toBeVisible();

    const before = await holidayCount(NEXT_YEAR);
    const release = await holdNextAction(page, "continue");
    await deleteA.click();
    await expect(deleteA).toHaveText("삭제…처리 중");
    await expect(deleteA).toHaveAttribute("aria-disabled", "true");
    await expect(deleteB).toHaveText("삭제");
    await expect(deleteB).not.toHaveAttribute("aria-disabled", "true");
    release();

    await expect(rowOf(page, ROW_A.name)).toHaveCount(0);
    await expect(page.getByText(`후보 · 공휴일 ${before - 1}일`, { exact: true })).toBeVisible();
    expect(await holidayCount(NEXT_YEAR)).toBe(before - 1);
    const resultLine = page.getByRole("status").filter({ hasText: "삭제됨" });
    await expect(resultLine).toHaveCount(1);
    await expect(resultLine).toContainText(`${ROW_A.date} ${ROW_A.name} 삭제됨`);
    const undo = resultLine.getByRole("button", { name: "되돌리기" });
    await expect(undo).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 화면의 1차 버튼은 확정 하나 — 삭제·되돌리기는 행 행동이다(DR2 A).
    await expect(page.locator('[data-ui="primary-button"]')).toHaveCount(1);
    await expect(page.locator('[data-ui="primary-button"]')).toHaveText(`${NEXT_YEAR}년 공휴일 확정`);
    // D21 — 위험 색은 「삭제」 하나다. 「되돌리기」는 위험 색이 아니다.
    const danger = await tokenAsColor(page, "--status-danger");
    await expect(deleteB).toHaveCSS("color", danger);
    expect(await undo.evaluate((el) => getComputedStyle(el).color)).not.toBe(danger);

    await deleteB.click();
    await expect(rowOf(page, ROW_B.name)).toHaveCount(0);
    await expect(resultLine).toHaveCount(1);
    await expect(resultLine).toContainText(`${ROW_B.date} ${ROW_B.name} 삭제됨`);
    await expect(resultLine.getByRole("button", { name: "되돌리기" })).toBeFocused();

    await page.unroute("**/*");
    const releaseUndo = await holdNextAction(page, "continue");
    await resultLine.getByRole("button", { name: "되돌리기" }).click();
    const undoPending = resultLine.getByRole("button", { name: "되돌리기" });
    await expect(undoPending).toHaveText("되돌리기…처리 중");
    await expect(undoPending).toHaveAttribute("aria-disabled", "true");
    releaseUndo();

    // 04.2 /review 이월 1: 결과 줄은 지운 행을 쌓는다 — B를 되돌리면 앞서 지운 A가 다시 보인다.
    await expect(resultLine).toContainText(`${ROW_A.date} ${ROW_A.name} 삭제됨`);
    const restored = rowOf(page, ROW_B.name);
    await expect(restored).toContainText("임시공휴일");
    await expect(restored.getByRole("button", { name: "삭제" })).toBeFocused();
    await expect(page.getByText(`후보 · 공휴일 ${before - 1}일`, { exact: true })).toBeVisible();
    await resultLine.getByRole("button", { name: "되돌리기" }).click();
    await expect(resultLine).toHaveCount(0);
    await expect(rowOf(page, ROW_A.name).getByRole("button", { name: "삭제" })).toBeFocused();
    await expect(page.getByText(`후보 · 공휴일 ${before}일`, { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "추가됨" })).toHaveCount(0);
    // ADMN-12(quick 261001-hfi): 새 행이 아니라 보관된 같은 행이 돌아온다.
    const rowsB = await db.select({ id: holidays.id, archivedAt: holidays.archivedAt }).from(holidays).where(eq(holidays.date, ROW_B.date));
    expect(rowsB).toEqual([{ id: rowBBefore?.id, archivedAt: null }]);
  });

  test("결과 줄은 연도를 바꾸면 사라지고, 공휴일 추가 패널을 열고 닫아도 남는다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    const resultLine = page.getByRole("status").filter({ hasText: "삭제됨" });

    await rowOf(page, ROW_A.name).getByRole("button", { name: "삭제" }).click();
    await expect(resultLine).toHaveCount(1);
    await page.getByRole("navigation", { name: "연도" }).getByRole("link", { name: `${THIS_YEAR}년` }).click();
    await expect(page.getByRole("table", { name: `${THIS_YEAR}년 공휴일` })).toBeVisible();
    await page.getByRole("navigation", { name: "연도" }).getByRole("link", { name: `${NEXT_YEAR}년` }).click();
    await expect(page.getByRole("table", { name: `${NEXT_YEAR}년 공휴일` })).toBeVisible();
    await expect(resultLine).toHaveCount(0);

    // R4 — 패널은 목록을 바꾸지 않는다: 연 뒤에도 결과 줄이 그대로 있고 닫아도 남는다.
    await rowOf(page, ROW_B.name).getByRole("button", { name: "삭제" }).click();
    await expect(resultLine).toHaveCount(1);
    await page.locator('a[href$="&new=1"]').click();
    await expect(page.locator(PANEL).getByLabel("날짜")).toBeVisible();
    await expect(resultLine).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(PANEL)).toHaveCount(0);
    await expect(resultLine).toHaveCount(1);
  });

  test("삭제 요청이 끊기면 그 행에 실패 줄, 되돌리기가 끊기면 다시 시도, 그사이 다른 공휴일이 들어서면 거절 문구", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    const rowA = rowOf(page, ROW_A.name);

    const releaseDelete = await holdNextAction(page, "abort");
    await rowA.getByRole("button", { name: "삭제" }).click();
    releaseDelete();
    await expect(rowA.getByText("삭제 실패 · 다시 시도", { exact: true })).toBeVisible();
    await expect(rowA).toHaveCount(1);
    await page.unroute("**/*");
    await rowA.getByRole("button", { name: "삭제" }).click();
    await expect(rowA).toHaveCount(0);

    const resultLine = page.getByRole("status").filter({ hasText: /삭제됨|되돌리기 실패/ });
    const releaseUndo = await holdNextAction(page, "abort");
    await resultLine.getByRole("button", { name: "되돌리기" }).click();
    releaseUndo();
    await expect(resultLine).toContainText("되돌리기 실패 · 다시 시도");
    await expect(resultLine.getByRole("button", { name: "되돌리기" })).toBeVisible();
    await page.unroute("**/*");

    await db.insert(holidays).values({ date: ROW_A.date, name: OTHER_NAME, kind: "temporary" });
    await resultLine.getByRole("button", { name: "되돌리기" }).click();
    await expect(resultLine).toContainText(`되돌리기 실패 · 이미 공휴일(${OTHER_NAME})`);
    await expect(resultLine.getByRole("button", { name: "되돌리기" })).toHaveCount(0);
  });

  // 04.2 /review 이월 2: 화면을 연 뒤 지울 수 없게 된 행(여기서는 규칙 행으로 바뀜)은 서버가 거절한다 —
  // 다시 해도 성공할 수 없으니 원인을 싣고 `삭제`를 치운다.
  test("화면을 연 뒤 지울 수 없게 된 행을 지우면 원인 문구, 삭제는 이유를 단 비활성으로 남는다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    const rowA = rowOf(page, ROW_A.name);
    await expect(rowA.getByRole("button", { name: "삭제" })).toBeVisible();

    await db.update(holidays).set({ kind: "statutory" }).where(eq(holidays.date, ROW_A.date));
    await rowA.getByRole("button", { name: "삭제" }).click();
    await expect(rowA.getByText("삭제 실패 · 지울 수 없는 공휴일", { exact: true })).toBeVisible();
    // 다시 해도 안 되는 삭제는 이유를 단 비활성(aria-disabled)으로 남는다 — 포커스를 잃지 않는다(DR-11).
    const deleteA = rowA.getByRole("button", { name: "삭제" });
    await expect(deleteA).toHaveAttribute("aria-disabled", "true");
    await expect(deleteA).toBeFocused();
    const [row] = await db.select({ archivedAt: holidays.archivedAt }).from(holidays).where(eq(holidays.date, ROW_A.date));
    expect(row?.archivedAt).toBeNull();
  });

  // /review(PR #146): 실패는 그 행에만 붙는다 — 다시 시도가 성공하면 앞서 지운 행이 실패 문구 없이 보이고,
  // 다시 해도 안 되는 거절은 그 행을 결과 줄에서 빼 앞서 지운 행을 계속 되돌릴 수 있다.
  test("되돌리기 실패는 그 행에만 붙고, 거절된 행은 빠져 앞서 지운 행을 계속 되돌린다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    const resultLine = page.getByRole("status").filter({ hasText: /삭제됨|되돌리기 실패/ });

    await rowOf(page, ROW_A.name).getByRole("button", { name: "삭제" }).click();
    await expect(rowOf(page, ROW_A.name)).toHaveCount(0);
    await rowOf(page, ROW_B.name).getByRole("button", { name: "삭제" }).click();
    await expect(resultLine).toContainText(`${ROW_B.date} ${ROW_B.name} 삭제됨`);

    const releaseUndo = await holdNextAction(page, "abort");
    await resultLine.getByRole("button", { name: "되돌리기" }).click();
    releaseUndo();
    await expect(resultLine).toContainText("되돌리기 실패 · 다시 시도");
    await page.unroute("**/*");
    await resultLine.getByRole("button", { name: "되돌리기" }).click();
    await expect(rowOf(page, ROW_B.name)).toHaveCount(1);
    await expect(resultLine).toContainText(`${ROW_A.date} ${ROW_A.name} 삭제됨`);
    await expect(resultLine).not.toContainText("되돌리기 실패");

    await rowOf(page, ROW_B.name).getByRole("button", { name: "삭제" }).click();
    await expect(resultLine).toContainText(`${ROW_B.date} ${ROW_B.name} 삭제됨`);
    await db.insert(holidays).values({ date: ROW_B.date, name: OTHER_NAME, kind: "temporary" });
    await resultLine.getByRole("button", { name: "되돌리기" }).click();
    await expect(resultLine).toContainText(`되돌리기 실패 · 이미 공휴일(${OTHER_NAME})`);
    await expect(resultLine).toContainText(`${ROW_A.date} ${ROW_A.name} 삭제됨`);
    await resultLine.getByRole("button", { name: "되돌리기" }).click();
    await expect(rowOf(page, ROW_A.name)).toHaveCount(1);
    await expect(resultLine).toHaveCount(0);
    await db.delete(holidays).where(eq(holidays.name, OTHER_NAME));
  });
});

// quick 261001-hfi(ADMN-12 · D-01) — 공휴일 삭제는 보관이다. 보관함에 「공휴일」 행으로 나오고 거기서도 복원한다.
const PAST_ARCHIVED = { date: `${THIS_YEAR - 1}-07-08`, name: "지난 보관 공휴일 테스트" };

test.describe("공휴일 보관함(quick 261001-hfi)", () => {
  test.beforeEach(async () => {
    await resetDeleteRows();
    await db.delete(holidays).where(eq(holidays.name, PAST_ARCHIVED.name));
  });

  test.afterAll(async () => {
    await db.delete(holidays).where(inArray(holidays.date, [ROW_A.date, ROW_B.date]));
    await db.delete(holidays).where(eq(holidays.name, PAST_ARCHIVED.name));
  });

  test("삭제한 공휴일이 보관함에 「공휴일」 · `{날짜} {이름}`으로 보이고, 복원하면 토스트 뒤 공휴일 목록에 돌아온다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    await rowOf(page, ROW_A.name).getByRole("button", { name: "삭제" }).click();
    await expect(page.getByRole("status").filter({ hasText: `${ROW_A.date} ${ROW_A.name} 삭제됨` })).toHaveCount(1);

    await page.goto("/admin/archive");
    const archiveRow = page.locator("tr", { hasText: `${ROW_A.date} ${ROW_A.name}` });
    await expect(archiveRow).toHaveCount(1);
    await expect(archiveRow.locator("td").first()).toHaveText("공휴일");

    await archiveRow.getByRole("button", { name: "복원" }).click();
    await expect(page.getByText(`복원 · ${ROW_A.date} ${ROW_A.name} 복원됨`)).toBeVisible({ timeout: 15000 });
    await expect(archiveRow).toHaveCount(0);

    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    await expect(rowOf(page, ROW_A.name)).toHaveCount(1);
  });

  // 독립 검토(#138) — 복원할 수 없는 행은 「복원」을 내놓지 않는다(§7 할 수 없는 선택지는 숨김). 동작 칸은 빈 칸 표기 「—」.
  test("지난 날짜로 보관된 공휴일은 보관함에 남되 「복원」 버튼이 없다", async ({ page }) => {
    await db.insert(holidays).values({ ...PAST_ARCHIVED, kind: "temporary", archivedAt: new Date(), archivedBy: null });
    await loginAsSysadmin(page);
    await page.goto("/admin/archive");
    const archiveRow = page.locator("tr", { hasText: `${PAST_ARCHIVED.date} ${PAST_ARCHIVED.name}` });
    await expect(archiveRow).toHaveCount(1);
    await expect(archiveRow.getByRole("button", { name: "복원" })).toHaveCount(0);
    await expect(archiveRow.locator("td").last()).toHaveText("—");
  });

  // /review(#138) — 그 날짜에 다른 공휴일이 생긴 행은 복원이 거부되고, 원인이 토스트에 실린다(행은 보관함에 남는다).
  // quick 261002-4jn — 목록은 처음부터 「—」를 보이므로, 거부 토스트는 화면을 연 뒤 공휴일이 생긴 낡은 화면에서만 난다.
  test("같은 날짜에 다른 공휴일이 있으면 보관함 복원은 원인을 실은 오류 토스트이고 행이 남는다", async ({ page }) => {
    // 원인 문구는 마지막 「 · 」 앞까지 — 이름에 「 · 」가 든 공휴일과 부딪혀 잘리지 않음을 본다(/review 2차 testing).
    const date = `2039-${String(1 + randomInt(12)).padStart(2, "0")}-${String(1 + randomInt(28)).padStart(2, "0")}`;
    const active = { date, name: `충돌 · 활성 ${randomUUID().slice(0, 6)}` };
    const conflicted = { date, name: `충돌 보관 공휴일 ${randomUUID().slice(0, 6)}` };
    await db.insert(holidays).values({ ...conflicted, kind: "temporary", archivedAt: new Date(), archivedBy: null });
    try {
      await loginAsSysadmin(page);
      await page.goto("/admin/archive");
      const archiveRow = page.locator("tr", { hasText: `${conflicted.date} ${conflicted.name}` });
      await expect(archiveRow).toHaveCount(1);
      await db.insert(holidays).values({ ...active, kind: "temporary" });

      await archiveRow.getByRole("button", { name: "복원" }).click();
      await expect(page.getByText(`복원 · 실패 · 이미 공휴일(${active.name})`, { exact: true })).toBeVisible({ timeout: 15000 });
      // /design-review(#138) — 거부된 행은 다시 눌러도 같은 실패라 「복원」을 치운다(공휴일 되돌리기 거부와 같은 처리).
      await expect(archiveRow.getByRole("button", { name: "복원" })).toHaveCount(0);
      await expect(archiveRow.locator("td").last()).toHaveText("—");
      await page.reload();
      await expect(archiveRow).toHaveCount(1);
      // 새로 연 목록은 날짜 점유를 보고 처음부터 「복원」을 숨긴다.
      await expect(archiveRow.getByRole("button", { name: "복원" })).toHaveCount(0);
      await expect(archiveRow.locator("td").last()).toHaveText("—");
    } finally {
      // 이 describe의 다른 정리처럼 날짜로 지운다 — 2039년 행이 쌓이거나 연도 목록에 끼지 않게.
      await db.delete(holidays).where(eq(holidays.date, date));
    }
  });
});

// 04.2-12 Task 3 — 추가 폼 상태(UI-SPEC S2-d · Copywriting 막힘·칸 오류·폼 전체 오류). 04.6-16: 폼은 옆 패널 안 `PanelForm`이다.
test.describe("공휴일 추가 폼의 상태(04.2-12)", () => {
  test.beforeEach(async () => {
    await resetConfirmation(NEXT_YEAR);
  });

  test("열면 날짜 칸 포커스 · 빈 칸이면 1차 비활성 + 이유 + 다음 한 수가 그 칸으로 포커스를 옮긴다 · 종류에 빈 옵션이 없다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}&new=1`);

    const panel = page.locator(PANEL);
    const date = panel.getByLabel("날짜");
    const name = panel.getByLabel("이름");
    await expect(date).toBeFocused();
    await expect(panel.getByLabel("종류")).toHaveValue("temporary");
    await expect(panel.getByLabel("종류").locator("option")).toHaveText(["임시공휴일", "선거일"]);

    const submit = panel.getByRole("button", { name: /^공휴일 추가/ });
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    const reasonId = await submit.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    // 이유 줄 = 막힘 이유 + 다음 한 수(3차 버튼 — 같은 줄 안).
    await expect(panel.locator(`[id="${reasonId}"]`)).toContainText("날짜, 이름 2칸 비어 있음");
    await name.focus();
    await panel.getByRole("button", { name: "날짜 고르기" }).click();
    await expect(date).toBeFocused();

    await date.fill(`${NEXT_YEAR}-07-14`);
    await expect(panel.locator(`[id="${reasonId}"]`)).toContainText("이름 1칸 비어 있음");
    await panel.getByRole("button", { name: "이름 적기" }).click();
    await expect(name).toBeFocused();

    await name.fill("채운 이름");
    await expect(submit).not.toHaveAttribute("aria-disabled", "true");
    await expect(panel.getByRole("button", { name: /(적기|고르기)$/ })).toHaveCount(0);
  });

  test("min은 KST 내일 · max는 음력 표 마지막 해 12-31 · 오늘·규칙 행 날짜·음력 표 밖 해는 날짜 칸 아래 오류이고 값이 남는다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}&new=1`);
    const panel = page.locator(PANEL);
    const today = toKstDate(new Date());
    const date = panel.getByLabel("날짜");
    await expect(date).toHaveAttribute("min", nextIsoDate(today));
    await expect(date).toHaveAttribute("max", `${LUNAR_TABLE_LAST_YEAR}-12-31`);
    await panel.getByLabel("이름").fill("오류 확인");
    const submit = panel.getByRole("button", { name: /^공휴일 추가/ });

    const cases = [
      { value: today, error: "오늘·지난 날짜 · 내일 이후 날짜 고르기" },
      { value: `${NEXT_YEAR}-10-03`, error: "이미 공휴일(개천절) · 다른 날짜 고르기" },
      {
        value: `${LUNAR_TABLE_LAST_YEAR + 1}-01-05`,
        error: `${LUNAR_TABLE_LAST_YEAR + 1}년 음력 표 없음 · ${LUNAR_TABLE_LAST_YEAR}년까지 날짜 고르기`,
      },
    ];
    for (const { value, error } of cases) {
      await date.fill(value);
      await submit.click();
      await expect(panel.getByText(error, { exact: true })).toBeVisible();
      await expect(date).toHaveValue(value);
      await expect(date).toHaveAttribute("aria-invalid", "true");
    }
    expect(await holidayCount(LUNAR_TABLE_LAST_YEAR + 1)).toBe(0);
  });

  test("제출 중 라벨 `공휴일 추가…` + 취소 비활성 · 요청이 끊기면 이유 자리에 `추가 실패 · 다시 시도` · 폼 폭 720 이하", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}&new=1`);
    const panel = page.locator(PANEL);
    expect((await page.locator("form#holiday-form").boundingBox())!.width).toBeLessThanOrEqual(720);

    await panel.getByLabel("날짜").fill(`${NEXT_YEAR}-07-14`);
    await panel.getByLabel("이름").fill("끊김 확인");
    const release = await holdNextAction(page, "abort");
    const submit = panel.getByRole("button", { name: /^공휴일 추가/ });
    await submit.click();
    await expect(submit).toContainText("공휴일 추가…처리 중");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(panel.getByRole("button", { name: "취소" })).toHaveAttribute("aria-disabled", "true");
    release();

    await expect(panel.getByText("추가 실패 · 다시 시도", { exact: true })).toBeVisible();
    await expect(submit).toContainText("공휴일 추가");
    await expect(submit).not.toContainText("처리 중");
    const reasonId = await submit.getAttribute("aria-describedby");
    await expect(panel.locator(`[id="${reasonId}"]`)).toHaveText("추가 실패 · 다시 시도");
    expect(await db.select().from(holidays).where(eq(holidays.date, `${NEXT_YEAR}-07-14`))).toHaveLength(0);
  });
});

// 04.6-16 · R11 · 공통 §10 — 옮긴 화면의 원칙 막는 모드: 확정 전·뒤 해, 각 목록과 추가 패널 모두 경고 0.
test.describe("공휴일 화면 사용성 원칙 (04.6-16 R11)", () => {
  test("화면 사용성 원칙(막는 모드) — 공휴일", async ({ page }) => {
    // 확정 전 해 = 올해(E2E가 확정하지 않는다 — B1 배너 테스트가 「공휴일 확정 전」을 기대한다), 확정 뒤 해 = 다음 해(이 테스트가 확정하고 끝에 지운다).
    await resetConfirmation(NEXT_YEAR);
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    await page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` }).click();
    await expect(page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` })).toHaveCount(0);
    try {
      const unconfirmed = `/admin/holidays?year=${THIS_YEAR}`;
      const confirmed = `/admin/holidays?year=${NEXT_YEAR}`;
      await checkPrinciples(page, [unconfirmed, `${unconfirmed}&new=1`, confirmed, `${confirmed}&new=1`], {
        strict: isStrict(process.env.DESIGN_PRINCIPLES_STRICT),
      });
    } finally {
      await resetConfirmation(NEXT_YEAR);
    }
  });
});

// 04.2-13 — 「관리」 인덱스·시스템 상태 배너(B1·B2, UI-SPEC S3). 공휴일 확정 기록과 이메일 실행
// 기록은 E2E 워커가 공유하는 DB 상태라 이 직렬 파일에만 모은다(올해 Y 확정은 어떤 E2E도 건드리지 않는다).
test.describe("관리자 배너 B1·B2(04.2-13)", () => {
  const inserted: { runIds: number[]; logIds: number[] } = { runIds: [], logIds: [] };

  async function cleanup(): Promise<void> {
    if (inserted.logIds.length > 0) await db.delete(notificationLog).where(inArray(notificationLog.id, inserted.logIds));
    if (inserted.runIds.length > 0) await db.delete(notifyTickRuns).where(inArray(notifyTickRuns.id, inserted.runIds));
    inserted.runIds = [];
    inserted.logIds = [];
  }

  test.afterAll(cleanup);

  test("B1 → 공휴일 검토 링크 · 이메일 실패면 B2만(시스템 상태는 링크 없이, 미설정에도 결과 꼬리) · 결과 불명 변형 · 지우면 B1", async ({
    page,
  }) => {
    const credentials = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await login(page, credentials);
    const main = page.locator("main");

    // ① 이메일 조건이 없으면 B1(안내) — 올해 Y는 E2E가 확정하지 않는다.
    await page.goto("/admin");
    const b1 = main.getByRole("status").filter({ hasText: "공휴일 확정 전" });
    await expect(b1).toHaveText(`${THIS_YEAR}년 공휴일 확정 전 ${THIS_YEAR}년 공휴일 검토`);
    await expect(main.getByRole("alert")).toHaveCount(0);
    await expect(b1.getByRole("button")).toHaveCount(0);
    await b1.getByRole("link", { name: `${THIS_YEAR}년 공휴일 검토` }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/holidays\\?year=${THIS_YEAR}$`));
    await expect(main.getByRole("status").filter({ hasText: "공휴일 확정 전" })).toHaveCount(0);
    await expect(main.getByRole("alert")).toHaveCount(0);

    // ② 이메일을 시도한 실행에 실패 3건 → /admin은 B2(경고)만.
    const startedAt = new Date();
    const failedAt = formatKstMinute(startedAt);
    const [run] = await db
      .insert(notifyTickRuns)
      .values({
        startedAt,
        finishedAt: startedAt,
        kstDate: toKstDate(startedAt),
        businessDay: true,
        emailClaimed: 3,
        emailFailed: 3,
        emailFinishedAt: startedAt,
      })
      .returning({ id: notifyTickRuns.id });
    if (!run) throw new Error("tick run insert failed");
    inserted.runIds.push(run.id);

    await page.goto("/admin");
    const b2 = main.getByRole("alert");
    await expect(b2).toHaveCount(1);
    await expect(b2).toHaveText(`이메일 발송 실패 3건 (${failedAt}) 시스템 상태 보기`);
    await expect(b2.getByRole("link")).toHaveCount(1);
    await expect(b2.getByRole("link", { name: "시스템 상태 보기" })).toHaveAttribute("href", "/admin/system-status");
    await expect(b2.getByRole("button")).toHaveCount(0);
    await expect(main.getByRole("status").filter({ hasText: "공휴일 확정 전" })).toHaveCount(0);

    // ③ 시스템 상태 — 같은 B2를 링크 없이, 이메일 줄은 미설정 + 결과 꼬리, 「실패 3건」만 --status-danger.
    await page.goto("/admin/system-status");
    const statusBanner = main.getByRole("alert");
    await expect(statusBanner).toHaveText(`이메일 발송 실패 3건 (${failedAt})`);
    await expect(statusBanner.getByRole("link")).toHaveCount(0);
    const emailValue = page.locator("dt", { hasText: /^이메일$/ }).locator("xpath=following-sibling::dd[1]");
    await expect(emailValue).toHaveText(`미설정 · 실패 3건 (${failedAt})`);
    const danger = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--status-danger)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(emailValue.getByText("실패 3건", { exact: true })).toHaveCSS("color", danger);
    const valueColor = await emailValue.evaluate((el) => getComputedStyle(el).color);
    expect(valueColor).not.toBe(danger);

    // ④ 결과 불명(선점 11분 지난 sending 행) → 두 조각, 시각은 조각마다 괄호.
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, credentials.email));
    if (!me) throw new Error("fixture user missing");
    const attemptedAt = new Date(Date.now() - 11 * 60_000);
    const since = formatKstMinute(attemptedAt);
    const [row] = await db
      .insert(notificationLog)
      .values({
        conditionKind: "e2e_admin_banner",
        entity: "e2e_admin_banner",
        entityId: randomUUID(),
        recipientId: me.id,
        referenceDate: toKstDate(attemptedAt),
        message: "E2E 배너 결과 불명",
        emailStatus: "sending",
        emailAttemptedAt: attemptedAt,
      })
      .returning({ id: notificationLog.id });
    if (!row) throw new Error("notification insert failed");
    inserted.logIds.push(row.id);

    await page.goto("/admin");
    await expect(main.getByRole("alert")).toHaveText(
      `이메일 발송 실패 3건 (${failedAt}) · 결과 불명 1건 (${since}) 시스템 상태 보기`,
    );
    await page.goto("/admin/system-status");
    await expect(emailValue).toHaveText(`미설정 · 실패 3건 (${failedAt}) · 결과 불명 1건 (${since})`);

    // ⑤ 넣은 두 행을 지우면 다시 B1.
    await cleanup();
    await page.goto("/admin");
    await expect(main.getByRole("alert")).toHaveCount(0);
    await expect(main.getByRole("status").filter({ hasText: "공휴일 확정 전" })).toHaveText(
      `${THIS_YEAR}년 공휴일 확정 전 ${THIS_YEAR}년 공휴일 검토`,
    );
  });
});
