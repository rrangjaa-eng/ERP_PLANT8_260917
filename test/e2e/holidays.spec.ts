import { randomUUID } from "node:crypto";
import { and, eq, gte, lte } from "drizzle-orm";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { db } from "@/db/client";
import { holidays, holidayYearConfirmations } from "@/db/schema";
import { toKstDate } from "@/domain/holidays/business-day";
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
    await expect(table.locator("tbody tr")).toHaveCount(count);
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
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(table.locator("tbody tr td")).toHaveText(["04-12", "화", LONG_NAME, "선거일", ""]);
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
    await expect(page.getByText("확정하지 못했습니다 · 다시 시도", { exact: true })).toBeVisible();
    await expect(confirm).toHaveText(`${NEXT_YEAR}년 공휴일 확정`);
    await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    expect(
      await db.select().from(holidayYearConfirmations).where(eq(holidayYearConfirmations.year, NEXT_YEAR)),
    ).toHaveLength(0);

    await page.unroute("**/*");
    await confirm.click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByText(/^확정 · .* · 공휴일 \d+일$/)).toBeVisible();
    await expect(page.getByText("확정하지 못했습니다 · 다시 시도", { exact: true })).toHaveCount(0);
  });
});
