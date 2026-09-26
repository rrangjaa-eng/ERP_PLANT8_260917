import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
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
    .where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)));
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
    await expect(confirm).toHaveText(`${NEXT_YEAR}년 공휴일 확정…`);
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

  test("필터 줄 `공휴일 추가` → ?new=1 폼 → 미래 선거일 → 표에 새 행 + 토스트, 폼이 열린 동안 확정 버튼이 없다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    await expect(page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` })).toBeVisible();

    await page.getByRole("link", { name: "공휴일 추가", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/holidays\\?year=${NEXT_YEAR}&new=1$`));
    await expect(page.getByRole("link", { name: "공휴일 추가", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /공휴일 확정/ })).toHaveCount(0);

    const date = page.getByLabel("날짜");
    await expect(date).toHaveAttribute("type", "date");
    await expect(date).toHaveAttribute("min", nextIsoDate(toKstDate(new Date())));
    const kind = page.getByLabel("종류");
    await expect(kind.locator("option")).toHaveText(["임시공휴일", "선거일"]);
    await expect(kind).toHaveValue("temporary");

    await date.fill(ADDED_DATE);
    await kind.selectOption({ label: "선거일" });
    await page.getByLabel("이름").fill(ADDED_NAME);
    await page.getByRole("button", { name: "공휴일 추가", exact: true }).click();

    await expect(page.getByText(`공휴일 추가 · ${ADDED_DATE} 추가됨`, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/admin/holidays\\?year=${NEXT_YEAR}(&added=${ADDED_DATE})?$`));
    await expect(page.getByLabel("날짜")).toHaveCount(0);
    const cell = page.getByRole("cell", { name: ADDED_NAME, exact: true });
    await expect(cell).toBeVisible();
    expect(await cell.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe("ellipsis");
    await expect(page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/admin/holidays\\?year=${NEXT_YEAR}$`), { timeout: 8000 });
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

  test("규칙 행엔 삭제가 없고, 삭제는 확인 없이 지워 결과 줄 + 되돌리기를 남기며, 되돌리기가 같은 값으로 행을 돌려놓는다", async ({
    page,
  }) => {
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
    await expect(deleteA).toHaveText("삭제…");
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

    // 화면의 1차 버튼은 확정 하나 — 삭제·되돌리기는 3차다.
    const confirmBg = await page
      .getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const primaryCount = await page
      .locator("main button")
      .evaluateAll((buttons, bg) => buttons.filter((b) => getComputedStyle(b).backgroundColor === bg).length, confirmBg);
    expect(primaryCount).toBe(1);

    await deleteB.click();
    await expect(rowOf(page, ROW_B.name)).toHaveCount(0);
    await expect(resultLine).toHaveCount(1);
    await expect(resultLine).toContainText(`${ROW_B.date} ${ROW_B.name} 삭제됨`);

    await page.unroute("**/*");
    const releaseUndo = await holdNextAction(page, "continue");
    await resultLine.getByRole("button", { name: "되돌리기" }).click();
    const undoPending = resultLine.getByRole("button", { name: "되돌리기" });
    await expect(undoPending).toHaveText("되돌리기…");
    await expect(undoPending).toHaveAttribute("aria-disabled", "true");
    releaseUndo();

    await expect(resultLine).toHaveCount(0);
    const restored = rowOf(page, ROW_B.name);
    await expect(restored).toContainText("임시공휴일");
    await expect(restored.getByRole("button", { name: "삭제" })).toBeFocused();
    await expect(page.getByText(`후보 · 공휴일 ${before - 1}일`, { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "추가됨" })).toHaveCount(0);
  });

  test("결과 줄은 연도를 바꾸거나 공휴일 추가 폼을 열면 사라진다", async ({ page }) => {
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

    await rowOf(page, ROW_B.name).getByRole("button", { name: "삭제" }).click();
    await expect(resultLine).toHaveCount(1);
    await page.getByRole("link", { name: "공휴일 추가", exact: true }).click();
    await expect(page.getByLabel("날짜")).toBeVisible();
    await expect(resultLine).toHaveCount(0);
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
});

// 04.2-12 Task 3 — 추가 폼 상태(UI-SPEC S2-d · Copywriting 막힘·칸 오류·폼 전체 오류).
test.describe("공휴일 추가 폼의 상태(04.2-12)", () => {
  test.beforeEach(async () => {
    await resetConfirmation(NEXT_YEAR);
  });

  test("열면 날짜 칸 포커스 · 빈 칸이면 1차 비활성 + 이유 + 다음 한 수가 그 칸으로 포커스를 옮긴다 · 종류에 빈 옵션이 없다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}&new=1`);

    const date = page.getByLabel("날짜");
    const name = page.getByLabel("이름");
    await expect(date).toBeFocused();
    await expect(page.getByLabel("종류")).toHaveValue("temporary");
    await expect(page.getByLabel("종류").locator("option")).toHaveText(["임시공휴일", "선거일"]);

    const submit = page.getByRole("button", { name: "공휴일 추가", exact: true });
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    const reasonId = await submit.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    await expect(page.locator(`[id="${reasonId}"]`)).toHaveText("날짜 · 이름 2칸 비어 있음");
    await name.focus();
    await page.getByRole("button", { name: "날짜 고르기" }).click();
    await expect(date).toBeFocused();

    await date.fill(`${NEXT_YEAR}-07-14`);
    await expect(page.locator(`[id="${reasonId}"]`)).toHaveText("이름 1칸 비어 있음");
    await page.getByRole("button", { name: "이름 적기" }).click();
    await expect(name).toBeFocused();

    await name.fill("채운 이름");
    await expect(submit).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: /(적기|고르기)$/ })).toHaveCount(0);
  });

  test("min은 KST 내일 · max는 음력 표 마지막 해 12-31 · 오늘·규칙 행 날짜·음력 표 밖 해는 날짜 칸 아래 오류이고 값이 남는다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}&new=1`);
    const today = toKstDate(new Date());
    const date = page.getByLabel("날짜");
    await expect(date).toHaveAttribute("min", nextIsoDate(today));
    await expect(date).toHaveAttribute("max", `${LUNAR_TABLE_LAST_YEAR}-12-31`);
    await page.getByLabel("이름").fill("오류 확인");
    const submit = page.getByRole("button", { name: "공휴일 추가", exact: true });

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
      await expect(page.getByText(error, { exact: true })).toBeVisible();
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
    expect((await page.locator("form#holiday-form").boundingBox())!.width).toBeLessThanOrEqual(720);

    await page.getByLabel("날짜").fill(`${NEXT_YEAR}-07-14`);
    await page.getByLabel("이름").fill("끊김 확인");
    const release = await holdNextAction(page, "abort");
    const submit = page.getByRole("button", { name: "공휴일 추가", exact: true });
    await submit.click();
    await expect(submit).toHaveText("공휴일 추가…");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("link", { name: "취소" })).toHaveAttribute("aria-disabled", "true");
    release();

    await expect(page.getByText("추가 실패 · 다시 시도", { exact: true })).toBeVisible();
    await expect(submit).toHaveText("공휴일 추가");
    const reasonId = await submit.getAttribute("aria-describedby");
    await expect(page.locator(`[id="${reasonId}"]`)).toHaveText("추가 실패 · 다시 시도");
    expect(await db.select().from(holidays).where(eq(holidays.date, `${NEXT_YEAR}-07-14`))).toHaveLength(0);
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

    // ③ 시스템 상태 — 같은 B2를 링크 없이, 이메일 줄은 미설정 + 결과 꼬리, 「실패 3건」만 --danger.
    await page.goto("/admin/system-status");
    const statusBanner = main.getByRole("alert");
    await expect(statusBanner).toHaveText(`이메일 발송 실패 3건 (${failedAt})`);
    await expect(statusBanner.getByRole("link")).toHaveCount(0);
    const emailValue = page.locator("dt", { hasText: /^이메일$/ }).locator("xpath=following-sibling::dd[1]");
    await expect(emailValue).toHaveText(`미설정 · 실패 3건 (${failedAt})`);
    const danger = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--danger)";
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
